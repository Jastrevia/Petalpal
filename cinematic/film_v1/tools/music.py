import sys, os; sys.path.insert(0, os.path.dirname(__file__)); import fal
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
plan = {
 "positive_global_styles": ["original cinematic film score", "intimate fantasy orchestral", "emotional, tender, hopeful", "felt piano, harp, celesta, warm strings, soft woodwinds", "high-end feature film sound", "instrumental", "slow tempo around 70 bpm", "D major and B minor"],
 "negative_global_styles": ["vocals", "lyrics", "drums kit", "EDM", "trap", "rock", "epic trailer braams", "aggressive percussion", "dissonance", "comedy"],
 "sections": [
  {"section_name": "Rainy night", "duration_ms": 9000, "positive_local_styles": ["solo felt piano", "sparse and lonely", "melancholic B minor motif", "soft room ambience"], "negative_local_styles": ["strings", "percussion"], "lines": []},
  {"section_name": "The invitation", "duration_ms": 8000, "positive_local_styles": ["celesta and harp sparkles enter", "gentle wonder", "soft high strings swell", "magical but quiet"], "negative_local_styles": ["loud"], "lines": []},
  {"section_name": "Take my hand", "duration_ms": 7500, "positive_local_styles": ["warm strings rise", "heartbeat-like soft pulse", "growing anticipation", "crescendo"], "negative_local_styles": ["drums"], "lines": []},
  {"section_name": "The garden", "duration_ms": 11500, "positive_local_styles": ["full orchestral bloom", "soaring but gentle main theme in D major", "harp arpeggios", "flute melody", "soft wordless choir pads", "awe and wonder"], "negative_local_styles": ["bombastic", "brass fanfare"], "lines": []},
  {"section_name": "Every feeling belongs", "duration_ms": 10500, "positive_local_styles": ["pull back to intimate piano and solo cello", "tender", "hopeful", "rain-touched"], "negative_local_styles": ["loud", "percussion"], "lines": []},
  {"section_name": "A letter for you", "duration_ms": 7500, "positive_local_styles": ["music-box and harp motif", "warm strings gently rise", "heartfelt reassurance"], "negative_local_styles": ["percussion"], "lines": []},
  {"section_name": "Return and title", "duration_ms": 6000, "positive_local_styles": ["solo piano reprise of the opening motif now in D major", "peaceful resolution", "final sustained chord with soft strings"], "negative_local_styles": ["abrupt ending"], "lines": []}
 ]
}
fal.run('fal-ai/elevenlabs/music', dict(composition_plan=plan, respect_sections_durations=True, output_format='mp3_44100_128'), 0.60, sys.argv[1] if len(sys.argv) > 1 else 'score_v1', 'audio')
print('batch spend (est): $%.2f' % fal.spent())
