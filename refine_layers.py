import cv2
import numpy as np
from PIL import Image

# 1. Load Image 2 & Master
img = cv2.imread('C:/Users/cjysu/.gemini/antigravity/brain/29c68174-3514-4da4-a283-62d907ccd0b5/.user_uploaded/media_1792126302440_6e5f673a.jpg')
x0, y0, x1, y1 = 56, 104, 664, 896
master = img[y0:y1, x0:x1]
H, W, _ = master.shape

# 2. Build Flawless Clean Paper Base
# Authentic cotton-rag paper with multi-octave fractal grain & warm ivory color
np.random.seed(42)
octave1 = cv2.GaussianBlur(np.random.normal(0, 4.0, (H, W)), (3, 3), 0)
octave2 = cv2.GaussianBlur(np.random.normal(0, 3.0, (H, W)), (7, 7), 0)
octave3 = cv2.GaussianBlur(np.random.normal(0, 1.8, (H, W)), (15, 15), 0)
paper_grain = octave1 + octave2 + octave3

paper_clean_canvas = np.zeros((H, W, 3), dtype=float)
for y in range(H):
    t = y / float(H)
    b = 208 + 4 * np.sin(t * np.pi)
    g = 224 + 3 * np.sin(t * np.pi)
    r = 236 + 2 * np.sin(t * np.pi)
    paper_clean_canvas[y, :] = [b, g, r]

paper_clean_canvas += paper_grain[:, :, None]
paper_clean_canvas = np.clip(paper_clean_canvas, 0, 255).astype(np.uint8)

# Mask for form replacement:
# Completely covers ALL text and inputs from y=165 to y=715, while preserving florals in corners
clean_card = master.copy()
form_replace_mask = np.zeros((H, W), dtype=float)

# Center form area
form_replace_mask[165:715, 95:545] = 1.0

# Preserve Top-Left Floral:
y_g, x_g = np.ogrid[:H, :W]
tl_dist = np.sqrt(((x_g - 145) / 95.0)**2 + ((y_g - 170) / 95.0)**2)
form_replace_mask[tl_dist < 1.0] = 0.0

# Preserve Top-Right Floral:
tr_dist = np.sqrt(((x_g - 495) / 95.0)**2 + ((y_g - 190) / 105.0)**2)
form_replace_mask[tr_dist < 1.0] = 0.0

# Preserve Bottom-Left Floral:
bl_dist = np.sqrt(((x_g - 145) / 85.0)**2 + ((y_g - 690) / 85.0)**2)
form_replace_mask[bl_dist < 1.0] = 0.0

# Preserve Bottom-Right Floral:
br_dist = np.sqrt(((x_g - 495) / 95.0)**2 + ((y_g - 680) / 95.0)**2)
form_replace_mask[br_dist < 1.0] = 0.0

# Preserve Bottom Cartouche:
cart_dist = np.sqrt(((x_g - 328) / 40.0)**2 + ((y_g - 730) / 25.0)**2)
form_replace_mask[cart_dist < 1.0] = 0.0

# Preserve Top Fleuron:
fleur_dist = np.sqrt(((x_g - 328) / 30.0)**2 + ((y_g - 145) / 20.0)**2)
form_replace_mask[fleur_dist < 1.0] = 0.0

form_replace_feather = cv2.GaussianBlur(form_replace_mask, (15, 15), 0)
clean_card = (master * (1.0 - form_replace_feather[:, :, None]) + paper_clean_canvas * form_replace_feather[:, :, None]).astype(np.uint8)

# 3. Precision Paper Deckle Mask
# Build smooth organic deckle boundary polygon
poly_pts = []
# Top edge: y ~ 50 (left) to 88 (right)
np.random.seed(101)
for x in range(54, 573):
    base_y = 50.0 + (x - 54.0) * (88.0 - 50.0) / (572.0 - 54.0)
    # gentle deckle ripple
    ripple = 1.5 * np.sin(x * 0.15) + 0.8 * np.sin(x * 0.45)
    # dip under seal at x: 290..365
    if 290 <= x <= 365:
        dip = 4.0 * np.sin((x - 290) / 75.0 * np.pi)
        base_y += dip
    poly_pts.append([x, int(round(base_y + ripple))])

# Right edge: x ~ 572
for y in range(88, 762):
    base_x = 572.0
    ripple = 1.6 * np.sin(y * 0.18) + 0.9 * np.sin(y * 0.5)
    poly_pts.append([int(round(base_x + ripple)), y])

# Bottom edge: y ~ 758 (right) to 746 (left)
for x in range(572, 53, -1):
    base_y = 746.0 + (x - 54.0) * (758.0 - 746.0) / (572.0 - 54.0)
    ripple = 2.0 * np.sin(x * 0.12) + 1.0 * np.sin(x * 0.35)
    poly_pts.append([x, int(round(base_y + ripple))])

# Left edge: x ~ 54
for y in range(746, 49, -1):
    base_x = 54.0
    ripple = 1.8 * np.sin(y * 0.16) + 0.9 * np.sin(y * 0.42)
    poly_pts.append([int(round(base_x + ripple)), y])

paper_poly = np.array(poly_pts, dtype=np.int32)
paper_mask = np.zeros((H, W), dtype=np.uint8)
cv2.fillPoly(paper_mask, [paper_poly], 255)

paper_mask_blur = cv2.GaussianBlur(paper_mask.astype(float), (3, 3), 0) / 255.0

# 4. Generate LAYER 3: DECKLE PAPER (invitation_deckle_paper.png)
deckle_rgba = np.zeros((H, W, 4), dtype=np.uint8)
deckle_rgba[:, :, :3] = clean_card
deckle_rgba[:, :, 3] = (paper_mask_blur * 255).astype(np.uint8)

# Paper contact drop shadow (onto fabric backing)
paper_shadow = cv2.GaussianBlur(paper_mask.astype(float), (15, 15), 0) / 255.0
M_p_shadow = np.float32([[1, 0, 3], [0, 1, 4]])
paper_shadow_shifted = cv2.warpAffine(paper_shadow, M_p_shadow, (W, H))
p_shadow_alpha = 0.42 * np.clip(paper_shadow_shifted - paper_mask_blur, 0, 1)

final_deckle_rgba = np.zeros((H, W, 4), dtype=np.uint8)
for c in range(3):
    final_deckle_rgba[:, :, c] = np.clip(deckle_rgba[:, :, c] * (deckle_rgba[:, :, 3] / 255.0) + 18 * p_shadow_alpha * (1.0 - deckle_rgba[:, :, 3] / 255.0), 0, 255).astype(np.uint8)
final_deckle_rgba[:, :, 3] = np.clip(deckle_rgba[:, :, 3].astype(float) + p_shadow_alpha * 255, 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_deckle_paper.png', final_deckle_rgba)
print('Saved: invitation_deckle_paper.png')

# 5. Generate LAYER 4: BOTANICAL FRAME (invitation_botanical_frame.png)
botanical_rgba = np.zeros((H, W, 4), dtype=np.uint8)
botanical_rgba[:, :, :3] = clean_card

# Alpha for botanical ornaments:
botanical_alpha = np.zeros((H, W), dtype=float)
# 4 corner florals:
botanical_alpha[tl_dist < 1.1] = 1.0
botanical_alpha[tr_dist < 1.1] = 1.0
botanical_alpha[bl_dist < 1.1] = 1.0
botanical_alpha[br_dist < 1.1] = 1.0

# Gold border lines:
botanical_alpha[50:750, 76:94] = 1.0
botanical_alpha[80:762, 550:568] = 1.0
botanical_alpha[60:76, 76:568] = 1.0
botanical_alpha[725:740, 76:568] = 1.0

# Bottom cartouche & top fleuron
botanical_alpha[cart_dist < 1.1] = 1.0
botanical_alpha[fleur_dist < 1.1] = 1.0

botanical_alpha = cv2.GaussianBlur(botanical_alpha, (9, 9), 0)
botanical_alpha = np.clip(botanical_alpha * paper_mask_blur, 0, 1)

botanical_rgba[:, :, 3] = (botanical_alpha * 255).astype(np.uint8)
cv2.imwrite('mobile/assets/auth/invitation_botanical_frame.png', botanical_rgba)
print('Saved: invitation_botanical_frame.png')

# 6. Generate LAYER 5: WAX SEAL (invitation_wax_seal.png)
seal_dist = np.sqrt((x_g - 328)**2 + (y_g - 102)**2)
seal_rgba = np.zeros((H, W, 4), dtype=np.uint8)
seal_core = seal_dist <= 39
seal_edge = (seal_dist > 39) & (seal_dist <= 43)

seal_rgba[seal_core, :3] = master[seal_core]
seal_rgba[seal_core, 3] = 255

for y in range(H):
    for x in range(W):
        if seal_edge[y, x]:
            a = int(255 * (1.0 - (seal_dist[y, x] - 39.0) / 4.0))
            seal_rgba[y, x, :3] = master[y, x]
            seal_rgba[y, x, 3] = a

# Contact shadow under seal
s_dist = np.sqrt((x_g - 328)**2 + (y_g - 106)**2)
s_shadow = np.zeros((H, W), dtype=float)
s_shadow[(s_dist <= 50) & (seal_dist > 38)] = 0.5 * (1.0 - (s_dist[(s_dist <= 50) & (seal_dist > 38)] - 38) / 12.0)

final_seal_rgba = np.zeros((H, W, 4), dtype=np.uint8)
for c in range(3):
    final_seal_rgba[:, :, c] = np.clip(seal_rgba[:, :, c] * (seal_rgba[:, :, 3] / 255.0) + 20 * s_shadow * (1.0 - seal_rgba[:, :, 3] / 255.0), 0, 255).astype(np.uint8)
final_seal_rgba[:, :, 3] = np.clip(seal_rgba[:, :, 3].astype(float) + s_shadow * 255, 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_wax_seal.png', final_seal_rgba)
solo = final_seal_rgba[42:162, 268:388]
cv2.imwrite('mobile/assets/auth/invitation_wax_seal_solo.png', solo)
print('Saved: invitation_wax_seal.png and invitation_wax_seal_solo.png')

# 7. Generate LAYER 2: FOLDED RIBBON (invitation_folded_ribbon.png)
ribbon_rgba = np.zeros((H, W, 4), dtype=np.uint8)
ribbon_poly_left = np.array([
    [225, 20],
    [328, 70],
    [328, 102],
    [270, 75],
    [220, 25]
], dtype=np.int32)
ribbon_poly_right = np.array([
    [328, 65],
    [375, 12],
    [435, 30],
    [442, 60],
    [360, 95],
    [328, 102]
], dtype=np.int32)
ribbon_mask = np.zeros((H, W), dtype=np.uint8)
cv2.fillPoly(ribbon_mask, [ribbon_poly_left, ribbon_poly_right], 255)
# Refine using color similarity to ribbon sage
ribbon_color_mask = (master[:, :, 1] > 80) & (master[:, :, 1] < 170) & (master[:, :, 0] > 60) & (master[:, :, 0] < 140) & (seal_dist > 36)
ribbon_mask = cv2.bitwise_and(ribbon_mask, ribbon_mask, mask=ribbon_color_mask.astype(np.uint8)*255)
kernel3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
ribbon_mask = cv2.morphologyEx(ribbon_mask, cv2.MORPH_CLOSE, kernel3)
ribbon_mask_blur = cv2.GaussianBlur(ribbon_mask.astype(float), (3, 3), 0) / 255.0

ribbon_rgba[:, :, :3] = master
ribbon_rgba[:, :, 3] = (ribbon_mask_blur * 255).astype(np.uint8)
cv2.imwrite('mobile/assets/auth/invitation_folded_ribbon.png', ribbon_rgba)
print('Saved: invitation_folded_ribbon.png')

# 8. Generate LAYER 1: SAGE FABRIC BACKING (invitation_fabric_backing.png)
# Fabric backing includes:
# - Full sage fabric base under paper
# - Left drape with diagonal fold & creases: x: 10..76, y: 60..580
# - Top flap: x: 80..595, y: 15..70
# - Top-right fold: x: 565..600, y: 35..140
# - Bottom-right fold: x: 540..595, y: 735..788
# - Smooth soft shadow casting onto garden
fabric_mask = np.zeros((H, W), dtype=np.uint8)
# Base behind paper
fabric_mask[40:770, 50:580] = 255

# Left drape
drape_poly = np.array([
    [76, 60],
    [55, 120],
    [35, 180],
    [18, 250],
    [10, 320],
    [8, 380],
    [10, 440],
    [18, 490],
    [32, 540],
    [55, 570],
    [76, 580]
], dtype=np.int32)
cv2.fillPoly(fabric_mask, [drape_poly], 255)

# Top flap
top_flap_poly = np.array([
    [76, 60],
    [95, 35],
    [130, 20],
    [240, 20],
    [330, 35],
    [450, 28],
    [550, 22],
    [595, 25],
    [600, 140],
    [572, 140],
    [572, 88],
    [76, 50]
], dtype=np.int32)
cv2.fillPoly(fabric_mask, [top_flap_poly], 255)

# Bottom right fold
br_poly = np.array([
    [540, 755],
    [585, 784],
    [595, 770],
    [580, 730],
    [565, 750]
], dtype=np.int32)
cv2.fillPoly(fabric_mask, [br_poly], 255)

fabric_mask = cv2.morphologyEx(fabric_mask, cv2.MORPH_CLOSE, kernel3)
fabric_mask_blur = cv2.GaussianBlur(fabric_mask.astype(float), (5, 5), 0) / 255.0

# Synthesize continuous sage linen weave across the entire base
sage_base = np.zeros((H, W, 3), dtype=float)
# Sage color BGR: [52, 75, 68]
sage_base[:, :] = [52, 75, 68]
# Add weave grain
np.random.seed(77)
weave_h = cv2.GaussianBlur(np.random.normal(0, 3.5, (H, W)), (1, 3), 0)
weave_v = cv2.GaussianBlur(np.random.normal(0, 3.5, (H, W)), (3, 1), 0)
sage_base += (weave_h + weave_v)[:, :, None]

# Now overlay the REAL photographic fabric areas where exposed:
# Left drape: x < 76
drape_zone = (x_g <= 76) & (fabric_mask == 255)
sage_base[drape_zone] = master[drape_zone]
# Top flap: y <= 65
top_zone = (y_g <= 65) & (fabric_mask == 255)
sage_base[top_zone] = master[top_zone]
# Top right corner: x >= 565, y <= 140
tr_zone = (x_g >= 565) & (y_g <= 140) & (fabric_mask == 255)
sage_base[tr_zone] = master[tr_zone]
# Bottom right corner: x >= 540, y >= 745
br_zone = (x_g >= 540) & (y_g >= 745) & (fabric_mask == 255)
sage_base[br_zone] = master[br_zone]

sage_base = np.clip(sage_base, 0, 255).astype(np.uint8)

# Fabric outer drop shadow onto garden background
fabric_shadow = cv2.GaussianBlur(fabric_mask.astype(float), (25, 25), 0) / 255.0
M_f_shadow = np.float32([[1, 0, 4], [0, 1, 8]])
fabric_shadow_shifted = cv2.warpAffine(fabric_shadow, M_f_shadow, (W, H))
f_shadow_alpha = 0.48 * np.clip(fabric_shadow_shifted - fabric_mask_blur, 0, 1)

fabric_rgba = np.zeros((H, W, 4), dtype=np.uint8)
for c in range(3):
    fabric_rgba[:, :, c] = np.clip(sage_base[:, :, c] * fabric_mask_blur + 12 * f_shadow_alpha * (1.0 - fabric_mask_blur), 0, 255).astype(np.uint8)
fabric_rgba[:, :, 3] = np.clip((fabric_mask_blur + f_shadow_alpha) * 255, 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_fabric_backing.png', fabric_rgba)
print('Saved: invitation_fabric_backing.png')

# 9. Composite verification
def alpha_over(dst, src):
    src_a = src[:, :, 3] / 255.0
    dst_a = dst[:, :, 3] / 255.0
    out_a = src_a + dst_a * (1.0 - src_a)
    out_rgb = np.zeros((H, W, 3), dtype=float)
    for c in range(3):
        out_rgb[:, :, c] = (src[:, :, c] * src_a + dst[:, :, c] * dst_a * (1.0 - src_a)) / np.maximum(out_a, 1e-6)
    out = np.zeros((H, W, 4), dtype=float)
    out[:, :, :3] = out_rgb
    out[:, :, 3] = out_a * 255.0
    return out

comp = fabric_rgba.astype(float)
comp = alpha_over(comp, ribbon_rgba.astype(float))
comp = alpha_over(comp, final_deckle_rgba.astype(float))
comp = alpha_over(comp, botanical_rgba.astype(float))
comp = alpha_over(comp, final_seal_rgba.astype(float))

cv2.imwrite('mobile/assets/auth/invitation_card_composite.png', comp.astype(np.uint8))
# Also save as invitation_card_bg.png for backward compatibility
cv2.imwrite('mobile/assets/auth/invitation_card_bg.png', comp.astype(np.uint8))
print('Saved: invitation_card_composite.png and updated invitation_card_bg.png')
