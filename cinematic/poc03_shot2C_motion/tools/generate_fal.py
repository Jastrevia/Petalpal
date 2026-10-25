"""Shot 2C first/last-frame generation through fal.ai (one account reaches Veo 3.1 and Kling 3.0).
Never spends unless --approve-budget is given and the estimate is within it.

  python generate_fal.py --dry-run                          # show what would be sent and the cost
  python generate_fal.py --approve-budget 10 --models veo kling --takes 4

API key: environment variable FAL_KEY, or the first line of ../.fal_key (git-ignored). It is never printed.
Network: queue.fal.run (submit, status, result) and the output host (fal.media / storage.googleapis.com).
Outputs: ../takes/2C_<model>_<nn>.mp4 plus ../takes/manifest.json (inputs, seeds, prompt hash, cost estimate).
The keyframes are read only.
"""
import argparse, base64, hashlib, io, json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
MODELS = {
    # Prices: fal list prices checked 2026-10-20, audio off.
    'veo': dict(endpoint='fal-ai/veo3.1/first-last-frame-to-video', usd_per_s=0.20,
                body=lambda p, n, k1, k2, seed: dict(prompt=p, negative_prompt=n, first_frame_url=k1, last_frame_url=k2,
                                                     duration='6s', resolution='1080p', aspect_ratio='16:9',
                                                     generate_audio=False, seed=seed)),
    'kling': dict(endpoint='fal-ai/kling-video/v3/pro/image-to-video', usd_per_s=0.112,
                  body=lambda p, n, k1, k2, seed: dict(prompt=p, negative_prompt=n, start_image_url=k1, end_image_url=k2,
                                                       duration='6', cfg_scale=0.6, generate_audio=False)),
}
DUR_S = 6

def prompt_text(name):
    t = open(os.path.join(ROOT, 'prompts', name), encoding='utf-8').read()
    return t.split('# ---', 1)[1].strip() if '# ---' in t else t.strip()

def data_uri(path, jpeg=False):
    raw = open(path, 'rb').read()
    if jpeg:  # upload copy only, used if a service rejects the PNG size; the keyframe file is untouched
        from PIL import Image
        b = io.BytesIO(); Image.open(io.BytesIO(raw)).convert('RGB').save(b, 'JPEG', quality=97, subsampling=0); raw = b.getvalue()
        return 'data:image/jpeg;base64,' + base64.b64encode(raw).decode()
    return 'data:image/png;base64,' + base64.b64encode(raw).decode()

def key():
    k = os.environ.get('FAL_KEY')
    if not k and os.path.exists(os.path.join(ROOT, '.fal_key')):
        k = open(os.path.join(ROOT, '.fal_key')).readline().strip()
    if not k: sys.exit('No API key: set FAL_KEY or put it in cinematic/poc03_shot2C_motion/.fal_key')
    return k

def call(url, k, body=None):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Authorization': 'Key ' + k, 'Content-Type': 'application/json'},
                                 method='GET' if body is None else 'POST')
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())

ap = argparse.ArgumentParser()
ap.add_argument('--models', nargs='+', default=['veo', 'kling'], choices=list(MODELS))
ap.add_argument('--takes', type=int, default=4)
ap.add_argument('--approve-budget', type=float, default=0.0, help='USD the owner approved for this run')
ap.add_argument('--dry-run', action='store_true')
ap.add_argument('--prompt', default='motion_prompt.txt')
ap.add_argument('--negative', default='negative_prompt.txt')
ap.add_argument('--png-upload', action='store_true', help='send the PNGs as-is (~8 MB per request) instead of quality-97 JPEG upload copies')
a = ap.parse_args()

P, N = prompt_text(a.prompt), open(os.path.join(ROOT, 'prompts', a.negative), encoding='utf-8').read().strip()
k1p, k2p = os.path.join(ROOT, 'inputs', 'K1_first_frame.png'), os.path.join(ROOT, 'inputs', 'K2_last_frame.png')
est = sum(MODELS[m]['usd_per_s'] * DUR_S * a.takes for m in a.models)
print('Plan: %s x %d takes, %d s each, 1080p, no audio. Estimated cost $%.2f' % ('+'.join(a.models), a.takes, DUR_S, est))
print('Prompt %d chars (sha1 %s), negative %d chars' % (len(P), hashlib.sha1(P.encode()).hexdigest()[:10], len(N)))
k1, k2 = data_uri(k1p, not a.png_upload), data_uri(k2p, not a.png_upload)
print('Upload payload per request ~%.1f MB' % ((len(k1) + len(k2)) / 1e6))
if a.dry_run: sys.exit(0)
if est > a.approve_budget + 1e-9: sys.exit('Refusing: estimate $%.2f exceeds approved budget $%.2f' % (est, a.approve_budget))

K = key(); os.makedirs(os.path.join(ROOT, 'takes'), exist_ok=True)
man_p = os.path.join(ROOT, 'takes', 'manifest.json'); man = json.load(open(man_p)) if os.path.exists(man_p) else []
jobs = []
for m in a.models:
    for i in range(a.takes):
        n_existing = len([j for j in man if j['model'] == m])
        name = '2C_%s_%02d' % (m, n_existing + i + 1); seed = 1000 + n_existing + i  # seed is sent to Veo only; Kling takes no seed
        r = call('https://queue.fal.run/' + MODELS[m]['endpoint'], K, MODELS[m]['body'](P, N, k1, k2, seed))
        jobs.append(dict(name=name, model=m, endpoint=MODELS[m]['endpoint'], seed=seed, status_url=r['status_url'],
                         response_url=r['response_url'], submitted=time.time()))
        print('submitted', name)
pending = list(jobs)
while pending:
    time.sleep(15)
    for j in list(pending):
        s = call(j['status_url'], K)
        if s.get('status') == 'COMPLETED':
            res = call(j['response_url'], K); url = res['video']['url']
            dst = os.path.join(ROOT, 'takes', j['name'] + '.mp4'); urllib.request.urlretrieve(url, dst)
            man.append(dict(name=j['name'], model=j['model'], endpoint=j['endpoint'], seed=j['seed'], file=os.path.basename(dst),
                            prompt_sha1=hashlib.sha1(P.encode()).hexdigest()[:10], prompt_file=a.prompt, negative_file=a.negative, usd_est=MODELS[j['model']]['usd_per_s'] * DUR_S,
                            seconds=round(time.time() - j['submitted'])))
            json.dump(man, open(man_p, 'w'), indent=1); pending.remove(j); print('done', j['name'])
        elif s.get('status') not in ('IN_QUEUE', 'IN_PROGRESS'):
            print('failed', j['name'], s); pending.remove(j)
print('All jobs finished. Spent (estimate): $%.2f' % sum(MODELS[j['model']]['usd_per_s'] * DUR_S for j in jobs))
