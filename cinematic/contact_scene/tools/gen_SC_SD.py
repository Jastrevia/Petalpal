"""Stills SC and SD (paid, $0.15 each), both edits of the scene's own frames so the room, phone and hands stay identical.
SC: she takes the hovering invitation in her left hand, free hand still reaching. SD: the viewer's right hand reaches up and
her fingers close around it, golden light at the joined hands. python gen_SC_SD.py SC|SD"""
import sys; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
C = '/mnt/user-data/outputs/contact/'; K = '/mnt/user-data/outputs/keypose_pilot/'
ID = [fal.data_uri(K + 'refs/master_on_paper.png'), fal.data_uri(K + 'refs/master_face_crop.png'), fal.data_uri(K + 'approved/fairy_reach_approved.png', 1920, 95)]
KEEP = ("Keep everything else in image 1 exactly as it is: the same camera, composition and framing, the same room, rainy window, lanterns, flowers and books, "
        "the same phone with its glowing screen, the viewer's hands and lavender knit sleeves, the same lighting. First-person point of view; no other person, no face other than the fairy's. "
        "The fairy's identity must stay exactly as in images 2, 3 and 4 (the approved master): same narrow delicate face, calm grey-violet eyes, small nose and mouth, gentle smile, "
        "plum-violet hair in a loose low braided updo, violet crocus ornament with gold sprigs on her right side, same wings, dress, gold necklace and arm vines, same watercolour-anime rendering. "
        "No extra fingers, anatomically correct hands, no text, no watermark.")
if sys.argv[1] == 'SC':
    P = ("Image 1 is a frame from our film. Edit it so that the fairy now holds the ornate floral invitation card (the one floating beside her) in her LEFT hand, "
         "fingers gently pinching its edge, the card held at her side and slightly toward the viewer; her right hand stays open and reaching toward the viewer exactly as now. " + KEEP)
    fal.run('fal-ai/nano-banana-pro/edit', dict(prompt=P, image_urls=[fal.data_uri(C + 'frames/C_start_A01_f167.png', 1920, 95)] + ID, aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'), 0.15, 'contact_SC', C + 'stills')
else:
    P = ("Image 1 is a frame from our film; image 5 is the target for the emotional moment and its warm golden light. Edit image 1 so that the viewer's RIGHT hand (lavender knit sleeve, first-person, "
         "entering from the lower right of the frame, natural anatomy and perspective) has let go of the phone and reaches up toward the fairy, and the fairy's open right hand gently takes it: "
         "her slender fingers close softly around the viewer's fingers in a clear, tender hand-hold. Warm golden light glows where their hands join, with a few delicate lavender petals and golden particles. "
         "The viewer's left hand still holds the phone. She keeps holding the invitation in her left hand and smiles gently at the viewer. " + KEEP)
    fal.run('fal-ai/nano-banana-pro/edit', dict(prompt=P, image_urls=[fal.data_uri(C + 'stills/contact_SC.png', 1920, 95)] + ID + [fal.data_uri(C + 'stills/REF_contact.png', 1672, 95)],
                                                aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'), 0.15, 'contact_SD', C + 'stills')
print('batch total (est): $%.2f' % fal.spent())
