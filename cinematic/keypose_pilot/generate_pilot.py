"""Key-pose pilot: exactly one Nano Banana Pro candidate per pose, master always the primary reference. No retries."""
import sys, threading; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
R = '/mnt/user-data/outputs/keypose_pilot/refs/'
MASTER = fal.data_uri(R + 'master_on_paper.png', None, None)          # full-resolution PNG of the approved master
BACK = fal.data_uri(R + 'structure_sheet_back_views.png', None, None)
ID = ("The first attached image is the approved master illustration of this exact character and is the absolute authority. "
      "Redraw THIS SAME CHARACTER in a new pose, keeping her identity exactly: the same delicate face, the same large grey-violet eyes and eye shape, "
      "the same small nose and mouth, the same plum-violet hair in a loose low braided updo with wispy strands framing her face and neck, "
      "the same crocus hair ornament (violet petals with a blue-teal base and small gold sprigs) on the same side of her head, the same fair skin tone, "
      "the same two pairs of translucent lavender-to-pale-blue wings with fine gold veins and sparkles, the same dress (violet bodice with gold vine trim, "
      "gold star clasp at the waist, sheer petal drapes from the shoulders, lavender petals over pale blue-teal petals, short front with long translucent trailing petal panels), "
      "the same fine gold necklace and gold arm vines, the same gold heels with lavender petal toes and gold laces crossing the ankles, "
      "the same slender proportions (about 5.5 to 6 heads tall), and exactly the same soft watercolour-anime illustration style with fine violet-brown linework, "
      "translucent pastel washes and paper-light shading. Anatomically correct, graceful, natural pose; complete figure; plain soft warm-ivory paper background, no scenery. "
      "Do not redesign her. No photorealism, no 3D render, no realistic skin, no chibi, no different face, no extra limbs, no text, no labels, no watermark.")
POSES = {
 'poseA_smile': ([MASTER], "POSE A, GENTLE SMILE: the same pose and framing as the master (full figure, three-quarter view), but she now gives a very gentle, natural, closed-lip smile "
                 "with softly lifted cheeks and slightly softened lower eyelids, as if quietly happy to see the viewer. Everything else stays as in the master. " + ID),
 'poseB_reach': ([MASTER], "POSE B, REACH: she floats in mid-air facing the viewer (the camera), feet relaxed and pointing down, and gracefully extends her right arm straight toward the camera "
                 "to offer her hand to the first-person viewer: the arm and hand are strongly foreshortened toward the lens with correct perspective, palm slightly up, "
                 "index finger gently extended as if about to touch the viewer's fingertip, the other arm relaxed for balance, wings open, a gentle warm smile and direct eye contact. "
                 "Correct anatomy: one hand with five well-formed fingers. Full figure visible. " + ID),
 'poseC_turn_lead': ([MASTER, BACK], "POSE C, TURN AND LEAD: she floats in mid-air and is beginning to turn away from the camera toward a garden ahead (not shown), so her body is turned "
                 "three-quarters away and her back and wing roots are partly visible, while she looks back over her shoulder at the viewer with a gentle, inviting expression; "
                 "one arm reaches back toward the camera as if softly holding the viewer's fingertip to lead them along. Full figure visible. "
                 "The second attached image is an older sheet of the same character, to be used ONLY as supplementary guidance for how her back, wing attachments, "
                 "the back of her braided updo and the back of the dress are constructed; wherever it differs from the first image (face, proportions, colours, costume details, style), follow the first image. " + ID),
}
def go(label):
    refs, prompt = POSES[label]
    fal.run('fal-ai/nano-banana-pro/edit', dict(prompt=prompt, image_urls=refs, aspect_ratio='3:4', resolution='2K', num_images=1, output_format='png'),
            0.15, label, '/mnt/user-data/outputs/keypose_pilot/candidates')
ts = [threading.Thread(target=go, args=(k,)) for k in POSES]
[t.start() for t in ts]; [t.join() for t in ts]
print('pilot spend (est):', round(sum(e['usd_est'] for e in fal.ledger()['entries'] if e.get('pilot') == 'keypose_pilot_1'), 3), '| batch total (est): $%.2f' % fal.spent())
