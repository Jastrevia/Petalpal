"""Sound design with MMAudio v2 (video-to-audio), in two halves of the cut (<=30 s each). Extracts audio to audio/sfx_*.wav."""
import sys, os, subprocess, base64, threading; sys.path.insert(0, os.path.dirname(__file__)); import fal
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEG = [
 ('sfx_a', 0.0, 29.5, "gentle rain on a window at night, soft room tone, a phone buzz, a quiet sigh, delicate magical chimes and shimmering sparkles, paper rustle, soft whoosh of wind, fluttering tiny wings, a warm magical swell"),
 ('sfx_b', 29.5, 30.0, "birdsong in a peaceful garden, a distant waterfall, soft lapping water, a gentle breeze in wisteria, a pen writing on paper, soft magical shimmer, gentle rain on leaves, fluttering tiny wings, envelope paper, quiet morning room tone with distant city"),
]
def one(name, ss, dur):
    tmp = f'edit/{name}_src.mp4'
    subprocess.check_call(['ffmpeg','-v','error','-y','-ss',str(ss),'-t',str(dur),'-i','edit/firstcut_video.mp4','-vf','scale=854:480','-c:v','libx264','-crf','30','-an',tmp])
    uri = 'data:video/mp4;base64,' + base64.b64encode(open(tmp,'rb').read()).decode()
    res, paths = fal.run('fal-ai/mmaudio-v2', dict(video_url=uri, prompt=[s for s in SEG if s[0]==name][0][3], negative_prompt='music, singing, speech, voices, loud bangs, distortion', duration=min(30, dur), num_steps=25, cfg_strength=4.5), 0.001*dur, name, 'audio')
    if paths:
        subprocess.check_call(['ffmpeg','-v','error','-y','-i',paths[0],'-vn','-ac','2','-ar','48000',f'audio/{name}.wav'])
ts = [threading.Thread(target=one, args=(n, s, d)) for n, s, d, _ in SEG]
[t.start() for t in ts]; [t.join() for t in ts]
print('batch spend (est): $%.2f' % fal.spent())
