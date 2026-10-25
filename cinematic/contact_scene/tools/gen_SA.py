"""Still SA (paid, $0.15): the first-person rainy-night room with the viewer's hands holding the phone low in frame, open space
above it for the fairy. No fairy. Style targets: the owner's contact reference and the R2 phone reference."""
import sys; sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
C = '/mnt/user-data/outputs/contact/'
refs = [fal.data_uri(C + 'stills/REF_contact.png', 1672, 95), fal.data_uri('/mnt/user-data/outputs/film_v3/refs/R2_phone.png', 1672, 95)]
P = ("First-person point of view, cinematic still from a premium hand-painted watercolour-anime fantasy film. "
 "A dreamy midnight-blue rainy night in a cosy room by a large window: raindrops and streaks run down the glass, the city lights beyond are soft golden bokeh, "
 "warm brass lanterns glow on the window sill, lavender wisteria and small purple flowers in a vase, a few books, warm fairy-light strings. "
 "The viewer's own two hands (soft, natural, anatomically correct, slender fingers, lavender knit sweater sleeves at the wrists) hold a modern smartphone upright in the LOWER CENTRE of the frame, "
 "seen from the viewer's eyes, the phone occupying only the bottom third of the image; the screen shows a calm dark lock screen with a soft purple floral wallpaper. "
 "The upper two thirds of the frame are open air in the room, with soft depth of field toward the window, so that something magical could appear above the phone. "
 "Image 1 is the target for the colour, light, room and painterly anime rendering (midnight blue, warm gold light, lavender accents); image 2 shows a similar phone-in-hands view. "
 "Do NOT include any fairy, person, face or character; only the viewer's hands. No text, no logo, no watermark. Landscape 16:9.")
fal.run('fal-ai/nano-banana-pro/edit', dict(prompt=P, image_urls=refs, aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'), 0.15, 'contact_SA', C + 'stills')
print('batch total (est): $%.2f' % fal.spent())
