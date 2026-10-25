"""Contact scene takes A-E (paid, one take each, no retries). Pinned start/end frames; the fairy as a character element
(approved master front + Pose A + Reach). Kling 3.0 Pro i2v for A (no character), Kling O3 Pro reference-to-video for B-E."""
import sys, time, threading; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
C = '/mnt/user-data/outputs/contact/'; K = '/mnt/user-data/outputs/keypose_pilot/'
O3 = 'fal-ai/kling-video/o3/pro/reference-to-video'; V3 = 'fal-ai/kling-video/v3/pro/image-to-video'
def img(p): return fal.data_uri(p, 1920, 95)
EL = lambda: [dict(frontal_image_url=fal.data_uri(K + 'refs/master_on_paper.png', None, 95),
                   reference_image_urls=[fal.data_uri(K + 'approved/fairy_poseA_approved.png', None, 95), img(K + 'approved/fairy_reach_approved.png')])]
STYLE = (" Dreamy midnight-blue rainy night room, warm golden lantern light, soft watercolour-anime illustration style, premium animated fantasy film. "
         "Strict first-person point of view: the camera is the viewer's own eyes; only the viewer's hands and lavender knit sleeves are ever visible, never a face or body of the viewer. ")
FAIRY = ("The fairy keeps exactly the same identity in every frame: the same delicate face, grey-violet eyes, plum-violet hair in a low braided updo with the violet crocus ornament, "
         "the same translucent wings, violet petal dress and gold jewellery. Anatomically correct hands with five fingers. ")
NEG = (" Smooth, continuous, natural motion. No morphing, no flicker, no crossfade, no flash, no face change, no extra fingers, no rubbery hands, no text changes, no camera shake.")
SHOTS = {
 'contact_A': (V3, 'frames/A_notif_ref.png', 'frames/A_end.png', False, '5',
   "The viewer holds the phone in both hands by the rainy window. A PetalPal notification on the lock screen glows softly; the viewer's right thumb moves naturally onto it and taps it gently; "
   "the screen opens into a glowing ornate floral invitation card and its warm golden light begins to spill onto the viewer's hands and the window sill. Rain runs down the glass, the lanterns flicker softly, the city bokeh twinkles. "
   "The hands hold the phone steadily with only subtle natural movement; the camera stays almost still." + STYLE + NEG),
 'contact_B': (O3, 'frames/A_end.png', 'frames/B_end_A01_f000.png', True, '5',
   "@Element1 emerges from the glowing phone screen. The invitation on the screen brightens and a soft magical opening of golden light forms within the screen; golden motes and a few lavender petals rise out of it; "
   "@Element1 rises gracefully out of the light, small at first, gaining depth and presence as she floats up out of the phone into the room and settles in the air beside the phone in front of the rainy window, "
   "the ornate invitation card floating up out of the screen beside her. The viewer's hands keep holding the phone, which keeps glowing as an open portal. " + FAIRY + STYLE + NEG),
 'contact_C': (O3, 'frames/C_start_A01_f167.png', 'stills/contact_SC.png', True, '5',
   "@Element1 floats in the air beside the glowing phone in front of the rainy window, already reaching her open right hand toward the viewer. With her left hand she gracefully takes the ornate invitation card floating beside her "
   "and holds it at her side, while her right hand stays gently extended toward the viewer in an inviting gesture; she smiles warmly at the viewer; her wings move softly and her petal dress sways. "
   "The viewer's hands keep holding the glowing phone in the foreground. " + FAIRY + STYLE + NEG),
 'contact_D': (O3, 'stills/contact_SC.png', 'stills/contact_SD_fixed.png', True, '4',
   "The viewer's right hand lets go of the phone and reaches up toward @Element1 from the lower right of the frame, with natural perspective and anatomy; @Element1 leans slightly toward the viewer "
   "and her open right hand meets the viewer's hand: her slender fingers gently close around the viewer's fingers in a clear, tender hand-hold. At the moment of contact warm golden light flows through their joined hands, "
   "followed by delicate lavender petals and flowing golden particles. She keeps the invitation in her left hand and smiles. The viewer's left hand keeps holding the phone. " + FAIRY + STYLE + NEG),
 'contact_E': (O3, 'stills/contact_SD_fixed.png', 'frames/E_end_K03orb_f000.png', True, '5',
   "Holding the viewer's hand, @Element1 gently turns and guides the viewer toward the glowing phone portal; the first-person camera follows the pull naturally, moving forward and down into the golden light of the screen "
   "as lavender petals and golden particles swirl past the camera; the camera passes through the portal and arrives in a wisteria-covered stone passage glowing with soft sunlight, ending exactly on the final frame. " + FAIRY + STYLE + NEG),
}
def body(lab):
    ep, s, e, el, dur, prompt = SHOTS[lab]
    b = dict(prompt=prompt, duration=dur, generate_audio=False, start_image_url=img(C + s), end_image_url=img(C + e))
    if ep == V3: b.update(negative_prompt='blur, distort, low quality, morphing, extra fingers, text changes', cfg_scale=0.6)
    else: b['aspect_ratio'] = '16:9'
    if el: b['elements'] = EL()
    return ep, b, 0.112 * int(dur)
if __name__ == '__main__':
    labs = sys.argv[1:] or list(SHOTS); ts = []
    for lab in labs:
        ep, b, usd = body(lab)
        t = threading.Thread(target=fal.run, args=(ep, b, usd, lab, C + 'takes')); t.start(); ts.append(t); time.sleep(4)
    for t in ts: t.join()
    print('batch total (est): $%.2f' % fal.spent())
