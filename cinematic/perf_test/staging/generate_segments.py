"""NOT RUN. Two pinned Kling O3 Pro segments (paid generation is LOCKED; needs a per-segment allowance from the owner).
Seg 1: start_frame_poseA -> mid_frame_midglide.  Seg 2: mid_frame_midglide -> end_frame_reach.
Kling O3 accepts whole seconds only (3-15), so each segment is generated at 4 s and conformed locally to 3.5 s."""
import sys; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
K = '/mnt/user-data/outputs/keypose_pilot/'; P_ = '/mnt/user-data/outputs/perf_test/'
COMMON_END = ("Her face, eyes, hair, crocus ornament, wings, dress, shoes and proportions stay exactly the same character in every frame. "
  "Anatomically correct hands with five fingers. Smooth, continuous, graceful motion with soft follow-through. "
  "No arm swinging down past the thigh, no circular or sweeping arm movement, no arms spread wide, no legs apart, no frantic or fast flapping, "
  "no pause, no morphing, no crossfade, no flicker, no face change, no extra fingers, no hand deformation, no camera movement, no background, no text.")
SEG1 = ("@Element1, a delicate fairy in a soft watercolour-anime illustration style, floats on plain warm-ivory paper. Static camera. One continuous, graceful, "
  "emotionally natural motion that begins immediately, with no hold at the start. She keeps her eyes on the viewer with a soft, warm smile. "
  "A gentle breath lifts her shoulders; her wings open and beat slowly and softly; she rises lightly from her toes and her body tilts smoothly from upright into a "
  "gentle forward glide of about twenty degrees, her legs staying close together and drifting gently back, toes pointed. "
  "Her right hand begins close to her chest; her elbow relaxes and moves gently forward as her forearm comes forward in front of her waist, the palm turning softly upward. "
  "Her left hand drifts down to rest relaxed by her side. The long translucent petal panels and loose hair strands follow with elegant, soft secondary motion. "
  "In the final moments she is already gliding and the forearm is just beginning to unfold toward the viewer; she arrives exactly in the final frame without slowing to a stop. " + COMMON_END)
SEG2 = ("@Element1, a delicate fairy in a soft watercolour-anime illustration style, floats on plain warm-ivory paper. Static camera. She is already gliding toward the camera "
  "when the shot begins and continues without any pause, growing closer in a smooth, unhurried approach. Her body eases further forward into the glide, legs close together "
  "trailing gently behind, wings beating slowly and softly to carry her. Her right forearm, already in front of her waist, unfolds naturally toward the viewer: "
  "the elbow lifts gently and leads, then the forearm and wrist extend, the hand staying in front of her body and rising softly to chest height, "
  "and her palm opens gradually into a soft, open, inviting hand toward the viewer. Her left arm stays relaxed by her side. Eye contact and the warm smile hold throughout. "
  "The petal panels and hair stream back with elegant follow-through and settle softly as she arrives exactly in the final frame. " + COMMON_END)
ELEM = [dict(frontal_image_url=fal.data_uri(K + 'refs/master_on_paper.png', None, 95),
             reference_image_urls=[fal.data_uri(K + 'approved/fairy_poseA_approved.png', None, 95),
                                   fal.data_uri(K + 'approved/fairy_midglide_approved.png', 1920, 95),
                                   fal.data_uri(K + 'approved/fairy_reach_approved.png', 1920, 95)])]
def seg(label, prompt, a, b):
    body = dict(prompt=prompt, start_image_url=fal.data_uri(P_ + a, None, 95), end_image_url=fal.data_uri(P_ + b, None, 95),
                elements=ELEM, duration='4', aspect_ratio='16:9', generate_audio=False)
    fal.run('fal-ai/kling-video/o3/pro/reference-to-video', body, 0.448, label, P_)
if __name__ == '__main__':
    which = sys.argv[1]
    if which == 'seg1': seg('glide_seg1', SEG1, 'start_frame_poseA.png', 'mid_frame_midglide.png')
    if which == 'seg2': seg('glide_seg2', SEG2, 'mid_frame_midglide.png', 'end_frame_reach.png')
    print('batch total (est): $%.2f' % fal.spent())
