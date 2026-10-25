import sys; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
K = '/mnt/user-data/outputs/keypose_pilot/'
refs = [fal.data_uri(K + 'refs/master_on_paper.png'), fal.data_uri(K + 'facefix/poseA_CLEAN_free.png'),
        fal.data_uri(K + 'refs/master_face_crop.png'), fal.data_uri(K + 'reach/REACH_blocking_frame.png')]
P = ("Image 1 is the approved master illustration of this exact fairy and the absolute identity authority. Image 2 is an approved second pose of the same fairy. "
 "Image 3 is a close-up of her exact face. Image 4 is a rough blocking sketch that shows ONLY the camera, composition and perspective; ignore its style, labels, colours and text. "
 "Draw THIS SAME FAIRY in the pose of image 4: floating in mid-air seen from her chest height, and reaching her right hand straight toward the camera to offer it to the first-person viewer. "
 "Her hand is clearly the closest and largest form in the frame, about twice the height of her face, palm up, in front of her waist and partly covering her forearm, "
 "with her index fingertip pointing directly at the viewer as the point of contact; the forearm and upper arm are strongly foreshortened behind the hand. "
 "Correct anatomy: one hand with five delicate, well-formed fingers. Her other arm is relaxed for balance, her legs trail slightly back, and her wings are open behind her. "
 "Her head is turned three-quarters toward the right side of the frame exactly as in image 1, with her eyes looking at the viewer and a gentle, closed-mouth smile. "
 "Keep her identity exactly as in images 1 and 3: the same narrow delicate face, the same calm half-lidded grey-violet eyes of the same size and shape, small nose and small mouth, "
 "no added blush, not younger; the same plum-violet hair in a loose low braided updo with wispy strands; the same violet crocus ornament with a blue-teal base and gold sprigs on her right side; "
 "the same fair skin; the same two pairs of translucent lavender-to-pale-blue wings with fine gold veins; the same dress (violet bodice with gold vine trim, gold star clasp at the waist, "
 "sheer petal drapes from the shoulders, lavender petals over pale blue-teal petals, short front, long translucent trailing petal panels); the same fine gold necklace and gold arm vines; "
 "the same gold high heels with lavender petal toes and gold laces crossing the ankles; the same slender proportions. "
 "Exactly the same soft watercolour-anime illustration style as image 1: fine violet-brown linework, translucent pastel washes, paper-light shading. "
 "Plain soft warm-ivory paper background, landscape 16:9 framing from her head to her knees. "
 "No earrings, no pointed ears, no flat shoes or sandals, no generic anime face, no oversized eyes, no photorealism, no 3D, no extra fingers, no text, no labels.")
fal.run('fal-ai/nano-banana-pro/edit', dict(prompt=P, image_urls=refs, aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'),
        0.15, 'reach_rebuild_1', K + 'reach')
print('batch total (est): $%.2f' % fal.spent())
