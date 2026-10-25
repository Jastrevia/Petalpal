import sys; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
K = '/mnt/user-data/outputs/keypose_pilot/'; P_ = '/mnt/user-data/outputs/perf_test/'
PROMPT = ("@Element1, a delicate fairy in a soft watercolour-anime illustration style, floats on plain warm-ivory paper. One continuous, elegant, magical performance with a static camera: "
 "first a gentle settle and a soft breath, her shoulders rising and falling and her wings beating slowly; her eyes brighten as she notices the viewer and a subtle, warm smile appears. "
 "Then a small anticipatory dip, a graceful wing beat, and she glides smoothly forward toward the camera, chest leading, her legs drifting back into a floating pose, hair strands and petal skirt flowing behind. "
 "As she arrives, she raises her right arm naturally from the shoulder and extends an open, softly relaxed palm toward the viewer in an inviting gesture, settling exactly into the final frame. "
 "Her face, eyes, hair, crocus ornament, wings, dress and shoes stay exactly the same character throughout. Anatomically correct hands with five fingers. "
 "Smooth natural motion, soft follow-through, gentle continuous wing movement. "
 "No crossfade, no morphing, no flicker, no face change, no extra fingers, no hand deformation, no camera movement, no background, no text.")
body = dict(prompt=PROMPT, start_image_url=fal.data_uri(P_ + 'start_frame_poseA.png', None, 95), end_image_url=fal.data_uri(P_ + 'end_frame_reach.png', None, 95),
            elements=[dict(frontal_image_url=fal.data_uri(K + 'refs/master_on_paper.png', None, 95),
                           reference_image_urls=[fal.data_uri(K + 'facefix/poseA_CLEAN_free.png', None, 95), fal.data_uri(K + 'reach/reach_handfix_composite.png', 1920, 95)])],
            duration='5', aspect_ratio='16:9', generate_audio=False)
fal.run('fal-ai/kling-video/o3/pro/reference-to-video', body, 0.56, 'perf_test_1', P_)
print('batch total (est): $%.2f' % fal.spent())
