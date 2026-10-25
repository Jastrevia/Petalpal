"""fal.ai client for the PetalPal film: queue submit, poll, download, and a hard budget guard.
Every paid call is checked against ledger.json (list-price estimates) and refused if it would exceed CAP_USD.
The API key comes from FAL_KEY or the staged .fal_key.txt; it is never printed or written anywhere.
"""
import base64, io, json, mimetypes, os, sys, time, threading, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, 'ledger.json'); CAP_USD = 30.00
KEYFILE = '/mnt/user-data/uploads/Petalpal/cinematic/poc03_shot2C_motion/.fal_key.txt'
_lock = threading.Lock()

def _key():
    k = os.environ.get('FAL_KEY')
    if not k: k = open(KEYFILE, 'rb').read().decode('utf-8-sig').strip()
    return k

def ledger():
    return json.load(open(LEDGER)) if os.path.exists(LEDGER) else {'cap_usd': CAP_USD, 'entries': []}

def spent():
    return round(sum(e['usd_est'] for e in ledger()['entries'] if e.get('status') != 'refused'), 3)

def _record(entry):
    with _lock:
        L = ledger(); L['entries'].append(entry); json.dump(L, open(LEDGER, 'w'), indent=1)

def data_uri(path, max_side=None, jpeg_q=None):
    from PIL import Image
    im = Image.open(path)
    if max_side and max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    b = io.BytesIO()
    if jpeg_q:
        im.convert('RGB').save(b, 'JPEG', quality=jpeg_q, subsampling=0); mt = 'image/jpeg'
    else:
        im.save(b, 'PNG'); mt = 'image/png'
    return 'data:%s;base64,%s' % (mt, base64.b64encode(b.getvalue()).decode())

def _call(url, body=None):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST',
                                 headers={'Authorization': 'Key ' + _key(), 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r: return json.loads(r.read())

def run(endpoint, payload, usd_est, label, out_dir, poll=6, timeout_s=1800):
    """Submit one paid job. Returns (result_json, [downloaded paths]). Refuses if over budget."""
    if os.path.exists(os.path.join(ROOT, 'PAID_GENERATION_LOCKED')):
        allow = os.path.join(ROOT, 'PILOT_ALLOWANCE.json')
        ok = False
        if os.path.exists(allow):
            A = json.load(open(allow))
            used = sum(e['usd_est'] for e in ledger()['entries'] if e.get('pilot') == A['name'] and e.get('status') != 'rejected_at_submit')
            ok = label in A['labels'] and label not in A.get('consumed', []) and used + usd_est <= A['max_usd'] + 1e-9
        if not ok:
            print('REFUSED %s: paid generation is locked by the owner (only an owner-authorised pilot allowance can pass)' % label); return None, []
        A.setdefault('consumed', []).append(label); json.dump(A, open(allow, 'w'), indent=1)   # each label runs once: no retries
        payload_pilot = A['name']
    else:
        payload_pilot = None
    with _lock:
        cur = spent()
        if cur + usd_est > CAP_USD + 1e-9:
            print('REFUSED %s: would bring spend to $%.2f > cap $%.2f' % (label, cur + usd_est, CAP_USD)); return None, []
        L = ledger(); entry = dict(label=label, endpoint=endpoint, usd_est=round(usd_est, 4), status='submitted', t=time.strftime('%Y-%m-%dT%H:%M:%S'), pilot=payload_pilot)
        L['entries'].append(entry); json.dump(L, open(LEDGER, 'w'), indent=1); idx = len(L['entries']) - 1
    def upd(**kw):
        with _lock:
            L = ledger(); L['entries'][idx].update(kw); json.dump(L, open(LEDGER, 'w'), indent=1)
    try:
        r = _call('https://queue.fal.run/' + endpoint, payload)
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:500]; upd(status='rejected_at_submit', usd_est=0.0, error=msg)  # rejected before running: not billed
        print('SUBMIT-ERROR %s: HTTP %s %s' % (label, e.code, msg)); return None, []
    upd(request_id=r.get('request_id'), status_url=r.get('status_url'), response_url=r.get('response_url')); t0 = time.time()
    while True:
        time.sleep(poll)
        try: s = _call(r['status_url'])
        except Exception as e: print('poll warn', label, e); continue
        st = s.get('status')
        if st == 'COMPLETED': break
        if st not in ('IN_QUEUE', 'IN_PROGRESS') or time.time() - t0 > timeout_s:
            upd(status='failed', detail=str(s)[:300]); print('FAILED', label, s); return None, []
    try:
        res = _call(r['response_url'])
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:500]; upd(status='failed_result', error=msg); print('RESULT-ERROR', label, msg); return None, []
    os.makedirs(out_dir, exist_ok=True); paths = []
    files = []
    for k in ('images', 'videos'):
        for i, f in enumerate(res.get(k) or []): files.append(f)
    for k in ('image', 'video', 'audio', 'audio_file'):
        if isinstance(res.get(k), dict): files.append(res[k])
    for i, f in enumerate(files):
        url = f['url']; ext = os.path.splitext(url.split('?')[0])[1] or mimetypes.guess_extension(f.get('content_type', '')) or '.bin'
        dst = os.path.join(out_dir, '%s%s%s' % (label, '' if len(files) == 1 else '_%d' % (i + 1), ext))
        urllib.request.urlretrieve(url, dst); paths.append(dst)
    upd(status='completed', outputs=[os.path.relpath(p, ROOT) for p in paths], seconds=round(time.time() - t0))
    print('DONE %s -> %s  (est $%.3f; batch total est $%.2f)' % (label, ', '.join(os.path.basename(p) for p in paths), usd_est, spent()))
    return res, paths
