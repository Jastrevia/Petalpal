import sys, threading; sys.path.insert(0, 'tools'); import fal
R = 'refs/'
GIRL = ("Character reference sheet for a live-action feature film, photorealistic, shot like a high-end cinema production still. "
 "One young woman in her mid-twenties, shown four times on a plain soft warm-grey studio backdrop: a head-and-shoulders close-up facing camera, "
 "a three-quarter view from the waist up, a side profile, and a full-body view sitting on a simple chair. "
 "She has shoulder-length dark brown hair loosely tied back with a few soft strands falling around her face, natural minimal makeup, a gentle, thoughtful, slightly tired expression with kind eyes. "
 "She wears an oversized soft lavender-grey knit cardigan with slightly long sleeves over a cream cotton t-shirt, relaxed dark grey trousers and simple house socks; a thin silver ring on her right hand. "
 "Realistic skin texture, natural proportions, soft even key light, subtle film grain. The same person in all four views. No text, no labels, no logos.")
FAIRY = ("Create a character reference sheet that translates EXACTLY this fairy from the attached reference images into premium cinematic fantasy realism, "
 "as she would appear as a living, believable character in a high-budget fantasy feature film. Keep her identity unmistakable: the same delicate face and refined, gentle, slightly aloof expression; "
 "the same violet-black hair in a soft braided updo with loose front strands; the same large lavender crocus hair ornament with a saffron-gold centre and small gold leaf sprigs, worn on the same side; "
 "the same slender proportions of about five and a half to six heads tall; the same layered petal dress in lavender and pale blue-teal with sheer petal drapes from the shoulders, a gold star clasp at the waist, "
 "knee-length front and long trailing petal panels; the same thin gold necklace; the same gold-strapped heeled sandals; and two pairs of translucent iridescent lavender-blue wings with fine gold veins. "
 "Render her with realistic skin, real silk-like translucent petal fabric, finely veined glassy wings catching the light, and soft cinematic lighting. "
 "Show four views on a plain soft cream backdrop: front full body, three-quarter front full body, back full body showing the wings, and a face close-up. "
 "Not anime, not a cartoon, not a doll; elegant and real, but clearly the same character. No text, no labels.")
jobs = [
 ('fal-ai/nano-banana-pro', dict(prompt=GIRL, aspect_ratio='16:9', resolution='2K', num_images=2, output_format='png'), 0.30, 'girl_sheet'),
 ('fal-ai/nano-banana-pro/edit', dict(prompt=FAIRY, image_urls=[fal.data_uri(R+'fairy_master_on_light.png', 1536, 95), fal.data_uri(R+'fairy_turnaround_crop.png', None, 95)],
   aspect_ratio='16:9', resolution='2K', num_images=2, output_format='png'), 0.30, 'fairy_sheet'),
]
ts = [threading.Thread(target=fal.run, args=(e, p, c, l, 'chars')) for e, p, c, l in jobs]
[t.start() for t in ts]; [t.join() for t in ts]
print('batch spend so far (est): $%.2f' % fal.spent())
