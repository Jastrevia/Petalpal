import sys, os; sys.path.insert(0, os.path.dirname(__file__)); import fal
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = ("Original instrumental film score for a 60-second emotional fantasy short, intimate orchestral, around 70 bpm, no vocals, no drum kit. "
 "0-9s: lonely solo felt piano in B minor, sparse notes, very quiet, rainy-night melancholy. "
 "9-17s: soft celesta and harp sparkles enter with high strings, gentle wonder. "
 "17-25s: warm strings rise with a soft heartbeat pulse, building anticipation, a tender crescendo. "
 "25-36s: the main theme blooms in D major with full but gentle orchestra, harp arpeggios, flute melody and soft wordless choir pads, awe and joy, the emotional peak. "
 "36-46s: pull back to intimate piano and solo cello, tender and hopeful, quiet. "
 "46-54s: a music-box and harp motif with warm strings gently rising, heartfelt reassurance. "
 "54-60s: solo piano reprise of the opening motif now resolved in D major, ending on a long soft sustained chord that rings until the very end; no silence at the end.")
fal.run('fal-ai/elevenlabs/music', dict(prompt=P, music_length_ms=60000, force_instrumental=True, output_format='mp3_44100_128'), 0.60, 'score_v2', 'audio')
print('batch spend (est): $%.2f' % fal.spent())
