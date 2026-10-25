"""Video shots. Usage: python shots.py <ids...>   (all priced at Kling's $0.112/s, audio off)"""
import sys, os, threading; sys.path.insert(0, os.path.dirname(__file__)); import fal
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
K = 'keyframes/'; C = 'chars/'; R = 'refs/'
O3 = 'fal-ai/kling-video/o3/pro/reference-to-video'; V3 = 'fal-ai/kling-video/v3/pro/image-to-video'
NEG = "morphing, warping, melting, distorted hands, extra fingers, extra limbs, deformed face, identity change, flicker, sudden jumps, cuts, text, subtitles, watermark, logo, cartoon, anime, oversaturated, lens flare streaks, glitter"
TAIL = " Cinematic, natural realistic motion, 24fps film look, gentle motion blur, consistent lighting, premium fantasy feature-film realism."
FAIRY_EL = lambda: dict(frontal_image_url=fal.data_uri(C+'el_fairy_front.png', 1024, 92), reference_image_urls=[fal.data_uri(C+'el_fairy_face.png', 1024, 92), fal.data_uri(C+'el_fairy_3q.png', 1024, 92)])
GIRL_EL = lambda: dict(frontal_image_url=fal.data_uri(C+'el_girl_face.png', 1024, 92), reference_image_urls=[fal.data_uri(C+'el_girl_3q.png', 1024, 92)])
img = lambda p: fal.data_uri(p, 1920, 93)
SH = {
 'V01': (V3, 'S01.png', None, [], "Locked-off close-up of rain on a window at night: raindrops slide and merge down the glass, rivulets run, the blurred city lights shimmer softly beyond; an almost imperceptible slow push-in. Quiet and lonely. No people."),
 'V02': (O3, '../chars/girl_ctx.png', None, ['girl'], "@Element1 sits at her desk by the rain-streaked window at night. Her phone lights up with another notification; she glances at it without picking it up, exhales slowly, closes her eyes for a moment and rests her head more heavily on her hand. Rain streams down the glass. Static camera with a very slow push-in. Subtle, natural, tired body language."),
 'V03': (O3, 'S03.png', None, ['girl'], "Close-up of @Element1 by the rainy window at night. Tiny warm golden lights drift and gather beyond the wet glass like fireflies; her tired eyes slowly lift, follow them and soften with quiet wonder, the warm reflections glinting in her eyes. Very slow push-in."),
 'V04': (O3, 'S04.png', None, ['girl'], "In the dim rainy-night room, the glowing vintage invitation drifts gently through the air toward @Element1, turning slowly, golden motes swirling around it; she watches it approach, lips parting in disbelief. Slow, smooth camera drift."),
 'V04r': (O3, 'S04.png', None, ['girl'], "The glowing vintage invitation lifts away from the rainy window and drifts slowly through the air toward @Element1 and the camera, turning gently and growing larger in frame as it approaches, trailing soft golden motes; she turns toward it, eyes widening with quiet wonder, and slowly raises her hand. Smooth, slow camera drift. The invitation stays blank."),
 'V05': (O3, 'S05a.png', 'S05b.png', ['fairy'], "Her fingertip touches the gold wax seal of the floating invitation; a soft bloom of golden light and luminous petals swirls up from the card and gathers into @Element1, the tiny fairy, who takes form in the light, unfolds her translucent wings and looks up at the viewer with a soft, curious expression. Gentle, magical, believable."),
 'V06a': (O3, 'S06_1.png', None, ['fairy'], "First-person point of view. @Element1, the tiny fairy, hovers in front of the viewer's outstretched index finger. Slowly and tenderly she reaches out and wraps both of her small hands around the very tip of the finger, then looks up into the viewer's eyes with a warm, reassuring smile; her wings flutter softly, golden motes drift. The camera is almost still, with natural breathing movement. Realistic hand with five fingers; her hands stay in contact with the fingertip."),
 'V06b': (O3, 'S06_2.png', None, ['fairy'], "First-person point of view. @Element1, the tiny fairy, hovers in front of the viewer's outstretched index finger. Slowly and tenderly she reaches out and wraps both of her small hands around the very tip of the finger, then looks up into the viewer's eyes with a warm, reassuring smile; her wings flutter softly, golden motes drift. The camera is almost still, with natural breathing movement. Realistic hand with five fingers; her hands stay in contact with the fingertip."),
 'V07a': (O3, 'V06a_last.png', '../refs/K1.png', ['fairy'], "First-person point of view. @Element1, holding the viewer's fingertip, looks back with a playful smile, gives a gentle tug and darts forward, pulling the viewer after her; the camera surges forward with her through a swirl of warm golden light and drifting lavender wisteria petals, the dim rainy room dissolving around them into a sunlit wisteria-covered limestone passage with wet flagstones; she flies ahead out of frame and the shot ends exactly on the final frame."),
 'V07b': (O3, 'V06a_last.png', '../refs/K1.png', ['fairy'], "First-person point of view. Golden light blooms around the fingertip held by @Element1; with a tender smile she pulls the viewer forward. The camera glides after her as soft luminous petals spiral around the lens like a gentle vortex and the walls of the rainy room give way to hanging wisteria and pale limestone, until the viewer stands inside the sunlit wisteria passage; she has flown ahead out of frame and the shot ends exactly on the final frame."),
 'V09a': (O3, 'S09_1.png', None, ['fairy'], "First-person point of view walking forward out of the wisteria passage into the sunlit garden. @Element1 flies just ahead, holding the viewer's fingertip and gently leading the way, glancing back with a smile. The turquoise lake, the island pavilion and the tall waterfall open up ahead; wisteria sways, petals drift, the waterfall flows. Smooth forward Steadicam movement, the outstretched arm and her hold on the fingertip stay connected."),
 'V09b': (O3, 'S09_2.png', None, ['fairy'], "First-person point of view walking forward out of the wisteria passage into the sunlit garden. @Element1 flies just ahead, holding the viewer's fingertip and gently leading the way, glancing back with a smile. The turquoise lake, the island pavilion and the tall waterfall open up ahead; wisteria sways, petals drift, the waterfall flows. Smooth forward Steadicam movement, the outstretched arm and her hold on the fingertip stay connected."),
 'V10': (O3, 'S10v2.png', None, ['fairy'], "Wide shot: @Element1 glides low over the luminous turquoise lake toward the island pavilion, leaving a faint trail of golden shimmer on the water; the tall waterfall pours and mists, sun rays sweep through the haze, crocus and ferns sway in the foreground. Slow, majestic forward camera glide."),
 'V11': (V3, 'S11a.png', 'S11b.png', [], "Top-down locked-off shot: the hand writes slowly with the gold pen across the journal page, forming one short line of handwriting, ending exactly on the final frame. Natural handwriting motion; dappled sunlight flickers softly; petals rest still. Camera completely still."),
 'V11r': (V3, 'S11a.png', None, [], "Top-down locked-off close-up: the woman's right hand writes in the journal with the gold pen, the pen tip travelling steadily from left to right along a single slightly rising line across the page over about three seconds, with small natural up-and-down handwriting movements of the fingers and wrist, then she lifts the pen slightly and pauses. The camera and the journal stay completely still; dappled sunlight flickers softly."),
 'V13': (V3, 'S13a.png', 'S13b.png', [], "Macro: in gentle rain the glowing seed settles into the damp soil, a tender green shoot rises and a lavender crocus unfurls and opens into full bloom, raindrops beading on its petals, ending exactly on the final frame. Slow, graceful, hopeful growth. Camera still."),
 'V14': (O3, 'S14.png', None, ['fairy'], "Gentle rain falls in the garden. @Element1 sits quietly beside the bloomed crocus, sheltered under a broad leaf; she reaches out and lightly touches a petal, then rests her chin on her knees, keeping it company; raindrops drip from the leaf edge. Static camera, tender and calm."),
 'V15': (O3, 'S15.png', None, ['fairy'], "At the foot of the great wisteria tree, @Element1 opens the petal lid of the little crocus-bud mailbox, draws out a small cream envelope sealed with gold wax and turns toward the camera with it; lanterns glow, wisteria sways, the waterfall shimmers behind. Gentle camera push-in."),
 'V16': (O3, 'S16.png', None, ['fairy'], "@Element1 flies a little closer and holds the small cream envelope out toward the viewer with both hands, offering it with a gentle, encouraging smile, wings fluttering softly in the golden backlight. Slow push-in toward her."),
 'V17': (V3, 'S17.png', None, [], "First-person: the hands hold the small letter steadily; the paper sways almost imperceptibly in a light breeze, wisteria petals drift past, the golden bokeh shimmers. The handwriting on the letter stays perfectly still and legible. Very slow push-in."),
 'V18': (O3, 'S18.png', None, ['girl'], "The next morning after the rain: @Element1 sits at her desk by the window, slowly turning a lavender crocus between her fingers; she looks out at the calm city, lets out a long soft breath and a small genuine smile appears. Droplets on the glass glisten as the dawn light grows warmer. Static camera with a slow push-in."),
 'V19': (V3, 'S19plate.png', None, [], "Lavender crocus petals and wisteria florets drift slowly through the dark air, tiny golden motes float and twinkle softly; very slow, calm, elegant; the centre stays dark and empty."),
}
def body(sid):
    ep, start, end, els, prompt = SH[sid]
    b = dict(prompt=prompt + TAIL, duration='5', generate_audio=False)
    if ep == V3:
        b.update(start_image_url=img(K+start), negative_prompt=NEG, cfg_scale=0.6)
        if end: b['end_image_url'] = img(K+end)
    else:
        b.update(start_image_url=img(K+start), aspect_ratio='16:9')
        if end: b['end_image_url'] = img(K+end)
        b['elements'] = [FAIRY_EL() if e == 'fairy' else GIRL_EL() for e in els]
    return ep, b
if __name__ == '__main__':
    ids = sys.argv[1:]; ts = []
    for sid in ids:
        ep, b = body(sid); ts.append(threading.Thread(target=fal.run, args=(ep, b, 0.112 * 5, sid, 'shots')))
    for i in range(0, len(ts), 6):
        [t.start() for t in ts[i:i+6]]; [t.join() for t in ts[i:i+6]]
    print('batch spend (est): $%.2f' % fal.spent())
