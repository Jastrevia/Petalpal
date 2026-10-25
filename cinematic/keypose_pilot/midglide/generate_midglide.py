import sys; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
K = '/mnt/user-data/outputs/keypose_pilot/'
refs = [fal.data_uri(K + 'refs/master_on_paper.png'), fal.data_uri(K + 'facefix/poseA_CLEAN_free.png'),
        fal.data_uri(K + 'reach/reach_handfix_composite.png', 1920, 95), fal.data_uri(K + 'refs/master_face_crop.png'), fal.data_uri(K + 'midglide/MIDGLIDE_blocking.png', 1920, 95)]
P = ("Image 1 is the approved master illustration of this exact fairy and the absolute identity authority. Images 2 and 3 are approved poses of the same fairy (a standing pose and a floating pose reaching out her open hand); "
 "image 4 is a close-up of her exact face. Image 5 is a rough blocking sketch that shows ONLY the composition and pose; ignore its style, colours, labels and text. "
 "Draw THIS SAME FAIRY in the in-between moment of a gentle glide toward the viewer, as in image 5: she floats in the air with her body leaning forward about twenty degrees, graceful and elegant, "
 "her legs close together and trailing softly behind her, toes pointed, knees very slightly bent; her left arm relaxed and close to her body; "
 "her right upper arm hanging naturally from her bare right shoulder (the one with the gold vine band) and her right forearm already moving forward at chest height, the hand relaxed with the palm just beginning to turn up and open. "
 "Her two pairs of translucent wings are spread behind her back mid-beat in a beautiful, believable flight position; her long translucent petal panels flow back behind her with the movement; loose hair strands drift back. "
 "Her head is turned three-quarters toward the right side of the frame exactly as in image 1, her eyes look gently at the viewer, and she has a subtle, warm, closed-mouth smile. "
 "Keep her identity exactly: the same narrow delicate face, the same calm half-lidded grey-violet eyes of the same size and shape, small nose and mouth, no added blush, not younger; "
 "the same plum-violet hair in a loose low braided updo with wispy strands; the same violet crocus ornament with a blue-teal base and gold sprigs on her right side; the same fair skin; "
 "the same dress (violet bodice with gold vine trim, gold star clasp at the waist, sheer petal drapes from the shoulders, lavender petals over pale blue-teal petals, short front, long trailing petal panels); "
 "the same fine gold necklace and gold arm vines; the same gold high heels with lavender petal toes and gold laces crossing the ankles; the same slender proportions. "
 "Exactly the same soft watercolour-anime illustration style as image 1, with fine violet-brown linework, translucent pastel washes and paper-light shading. "
 "Her size in the frame is between images 2 and 3. Plain soft warm-ivory paper background, landscape 16:9. "
 "Not a superhero take-off: no arms spread sideways, no legs apart, no stiff body. No earrings, no pointed ears, no flat shoes, no generic anime face, no oversized eyes, no photorealism, no 3D, no extra fingers, no text.")
fal.run('fal-ai/nano-banana-pro/edit', dict(prompt=P, image_urls=refs, aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'), 0.15, 'midglide_1', K + 'midglide')
print('batch total (est): $%.2f' % fal.spent())
