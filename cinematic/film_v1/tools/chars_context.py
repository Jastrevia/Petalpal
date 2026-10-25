import sys, threading; sys.path.insert(0, 'tools'); import fal
GIRL_CTX = ("A single cinematic film frame, photorealistic, 16:9, shot on a large-format digital cinema camera with a 40mm lens. The woman from the reference sheet — identical face, hair loosely tied back with soft strands, "
 "the same oversized lavender-grey knit cardigan over a cream t-shirt — sits at a small wooden desk beside a tall rain-streaked window in a modest city apartment at night. "
 "Rain runs down the glass; blurred city lights glow beyond it in cool blue and amber bokeh. Her phone lies face-up beside her, its screen lit with a stack of unread notification banners, "
 "an open laptop casts cool light, a few sticky notes and an unfinished to-do list on the desk, a cold cup of tea. She rests her cheek on one hand, gazing at the rain, emotionally exhausted, quiet and lonely. "
 "Soft cool window light and a warm small desk lamp, deep but detailed shadows, subtle film grain, gentle melancholy. No readable text anywhere, no logos.")
FAIRY_CTX = ("A single cinematic film frame, 16:9, premium fantasy feature-film realism: the fairy from the first reference image — identical face, violet-black braided updo with loose strands, "
 "lavender crocus hair ornament with saffron centre and gold leaf sprigs on the same side, layered lavender and pale teal petal dress with gold star clasp and sheer petal drapes, two pairs of translucent iridescent wings with gold veins — "
 "hovers at eye level in the foreground, small and delicate (about the size of a hand), turning gently toward the camera with a soft, kind, slightly reserved expression and one hand lifted as if inviting the viewer to follow. "
 "Behind her, softly out of focus, is exactly the environment of the second reference image: the wisteria-covered limestone passage mouth with the gilded leaf-filigree arch and its hanging lanterns, "
 "the sunlit turquoise lake, the pavilion and the tall waterfall. Warm golden morning backlight rims her hair and makes her wings glow; shallow depth of field, fine film grain. No text.")
jobs = [
 ('fal-ai/nano-banana-pro/edit', dict(prompt=GIRL_CTX, image_urls=[fal.data_uri('chars/girl_sheet_1.png', 2048, 95)], aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'), 0.15, 'girl_ctx'),
 ('fal-ai/nano-banana-pro/edit', dict(prompt=FAIRY_CTX, image_urls=[fal.data_uri('chars/fairy_sheet_1.png', 2048, 95), fal.data_uri('refs/K2.png', None, 95)], aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'), 0.15, 'fairy_ctx'),
]
ts = [threading.Thread(target=fal.run, args=(e, p, c, l, 'chars')) for e, p, c, l in jobs]
[t.start() for t in ts]; [t.join() for t in ts]
print('batch spend so far (est): $%.2f' % fal.spent())
