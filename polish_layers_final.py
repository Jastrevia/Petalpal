import cv2
import numpy as np

# Load Image 2 & Master
img = cv2.imread('C:/Users/cjysu/.gemini/antigravity/brain/29c68174-3514-4da4-a283-62d907ccd0b5/.user_uploaded/media_1792126302440_6e5f673a.jpg')
x0, y0, x1, y1 = 56, 104, 664, 896
master = img[y0:y1, x0:x1]
H, W, _ = master.shape

# 1. Clean Paper Canvas
np.random.seed(1337)
octave1 = cv2.GaussianBlur(np.random.normal(0, 3.8, (H, W)), (3, 3), 0)
octave2 = cv2.GaussianBlur(np.random.normal(0, 2.8, (H, W)), (7, 7), 0)
octave3 = cv2.GaussianBlur(np.random.normal(0, 1.6, (H, W)), (15, 15), 0)
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

# 2. Form & Pill Clearance
clean_card = master.copy()

# Under seal
y_g, x_g = np.ogrid[:H, :W]
seal_dist = np.sqrt((x_g - 328)**2 + (y_g - 102)**2)

form_mask = np.zeros((H, W), dtype=float)
# Upper center: y: 145..260, x: 140..465
form_mask[145:260, 140:465] = 1.0
# Mid center: y: 260..660, x: 88..550 (covers the entire pill area including sides!)
form_mask[260:660, 88:550] = 1.0
# Lower center: y: 660..715, x: 140..465
form_mask[660:715, 140:465] = 1.0
# Under seal circle
form_mask[seal_dist <= 48] = 1.0

# Feather mask
form_feather = cv2.GaussianBlur(form_mask, (9, 9), 0)
clean_card = (clean_card * (1.0 - form_feather[:, :, None]) + paper_clean_canvas * form_feather[:, :, None]).astype(np.uint8)

# 3. Precision Deckle Polygon (Trace exact top edge slope)
poly_pts = []
for x in range(54, 573):
    base_y = 50.0 + (x - 54.0) * (88.0 - 50.0) / (572.0 - 54.0)
    ripple = 1.5 * np.sin(x * 0.15) + 0.8 * np.sin(x * 0.45)
    poly_pts.append([x, int(round(base_y + ripple))])

for y in range(88, 762):
    base_x = 572.0
    ripple = 1.6 * np.sin(y * 0.18) + 0.9 * np.sin(y * 0.5)
    poly_pts.append([int(round(base_x + ripple)), y])

for x in range(572, 53, -1):
    base_y = 746.0 + (x - 54.0) * (758.0 - 746.0) / (572.0 - 54.0)
    ripple = 2.0 * np.sin(x * 0.12) + 1.0 * np.sin(x * 0.35)
    poly_pts.append([x, int(round(base_y + ripple))])

for y in range(746, 49, -1):
    base_x = 54.0
    ripple = 1.8 * np.sin(y * 0.16) + 0.9 * np.sin(y * 0.42)
    poly_pts.append([int(round(base_x + ripple)), y])

paper_poly = np.array(poly_pts, dtype=np.int32)
paper_mask = np.zeros((H, W), dtype=np.uint8)
cv2.fillPoly(paper_mask, [paper_poly], 255)
paper_mask_blur = cv2.GaussianBlur(paper_mask.astype(float), (3, 3), 0) / 255.0

# 4. LAYER 3: DECKLE PAPER (invitation_deckle_paper.png)
deckle_rgba = np.zeros((H, W, 4), dtype=np.uint8)
deckle_rgba[:, :, :3] = clean_card
deckle_rgba[:, :, 3] = (paper_mask_blur * 255).astype(np.uint8)

paper_shadow = cv2.GaussianBlur(paper_mask.astype(float), (15, 15), 0) / 255.0
M_p_shadow = np.float32([[1, 0, 3], [0, 1, 4]])
paper_shadow_shifted = cv2.warpAffine(paper_shadow, M_p_shadow, (W, H))
p_shadow_alpha = 0.45 * np.clip(paper_shadow_shifted - paper_mask_blur, 0, 1)

final_deckle_rgba = np.zeros((H, W, 4), dtype=np.uint8)
for c in range(3):
    final_deckle_rgba[:, :, c] = np.clip(deckle_rgba[:, :, c] * (deckle_rgba[:, :, 3] / 255.0) + 18 * p_shadow_alpha * (1.0 - deckle_rgba[:, :, 3] / 255.0), 0, 255).astype(np.uint8)
final_deckle_rgba[:, :, 3] = np.clip(deckle_rgba[:, :, 3].astype(float) + p_shadow_alpha * 255, 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_deckle_paper.png', final_deckle_rgba)

# 5. LAYER 4: BOTANICAL FRAME (invitation_botanical_frame.png)
botanical_rgba = np.zeros((H, W, 4), dtype=np.uint8)
botanical_rgba[:, :, :3] = clean_card

botanical_alpha = np.zeros((H, W), dtype=float)
tl_dist = np.sqrt(((x_g - 140) / 75.0)**2 + ((y_g - 150) / 80.0)**2)
botanical_alpha[tl_dist < 1.0] = 1.0
tr_dist = np.sqrt(((x_g - 495) / 75.0)**2 + ((y_g - 170) / 85.0)**2)
botanical_alpha[tr_dist < 1.0] = 1.0
bl_dist = np.sqrt(((x_g - 135) / 65.0)**2 + ((y_g - 700) / 60.0)**2)
botanical_alpha[bl_dist < 1.0] = 1.0
br_dist = np.sqrt(((x_g - 500) / 70.0)**2 + ((y_g - 700) / 65.0)**2)
botanical_alpha[br_dist < 1.0] = 1.0

botanical_alpha[50:750, 76:94] = 1.0
botanical_alpha[80:762, 550:568] = 1.0
botanical_alpha[60:76, 76:568] = 1.0
botanical_alpha[725:740, 76:568] = 1.0

cart_dist = np.sqrt(((x_g - 328) / 35.0)**2 + ((y_g - 730) / 20.0)**2)
botanical_alpha[cart_dist < 1.0] = 1.0
fleur_dist = np.sqrt(((x_g - 328) / 25.0)**2 + ((y_g - 145) / 16.0)**2)
botanical_alpha[fleur_dist < 1.0] = 1.0

botanical_alpha = cv2.GaussianBlur(botanical_alpha, (7, 7), 0)
botanical_alpha = np.clip(botanical_alpha * paper_mask_blur, 0, 1)

botanical_rgba[:, :, 3] = (botanical_alpha * 255).astype(np.uint8)
cv2.imwrite('mobile/assets/auth/invitation_botanical_frame.png', botanical_rgba)

# 6. LAYER 5: WAX SEAL (invitation_wax_seal.png)
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

# 7. LAYER 2: FOLDED RIBBON (invitation_folded_ribbon.png)
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
ribbon_color_mask = (master[:, :, 1] > 80) & (master[:, :, 1] < 170) & (master[:, :, 0] > 60) & (master[:, :, 0] < 140) & (seal_dist > 36)
ribbon_mask = cv2.bitwise_and(ribbon_mask, ribbon_mask, mask=ribbon_color_mask.astype(np.uint8)*255)
kernel3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
ribbon_mask = cv2.morphologyEx(ribbon_mask, cv2.MORPH_CLOSE, kernel3)
ribbon_mask_blur = cv2.GaussianBlur(ribbon_mask.astype(float), (3, 3), 0) / 255.0

ribbon_rgba = np.zeros((H, W, 4), dtype=np.uint8)
ribbon_rgba[:, :, :3] = master
ribbon_rgba[:, :, 3] = (ribbon_mask_blur * 255).astype(np.uint8)
cv2.imwrite('mobile/assets/auth/invitation_folded_ribbon.png', ribbon_rgba)

# 8. LAYER 1: SAGE FABRIC BACKING (invitation_fabric_backing.png)
sage_canvas = np.zeros((H, W, 3), dtype=float)
sage_canvas[:, :] = [52, 75, 68]
np.random.seed(42)
w_h = cv2.GaussianBlur(np.random.normal(0, 3.0, (H, W)), (1, 3), 0)
w_v = cv2.GaussianBlur(np.random.normal(0, 3.0, (H, W)), (3, 1), 0)
sage_canvas += (w_h + w_v)[:, :, None]

# 1) Left drape: only fabric x in [10, 54]
drape_poly = np.array([
    [54, 60],
    [50, 120],
    [35, 180],
    [18, 250],
    [10, 320],
    [8, 380],
    [10, 440],
    [18, 490],
    [32, 540],
    [50, 570],
    [54, 580]
], dtype=np.int32)
drape_mask = np.zeros((H, W), dtype=np.uint8)
cv2.fillPoly(drape_mask, [drape_poly], 255)

# 2) Top flap: only fabric x in [80, 595], y in [18, 60]
top_flap_poly = np.array([
    [76, 52],
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
top_flap_mask = np.zeros((H, W), dtype=np.uint8)
cv2.fillPoly(top_flap_mask, [top_flap_poly], 255)

# 3) Bottom right fold: only fabric x in [560, 595], y in [755, 788]
br_poly = np.array([
    [560, 755],
    [585, 784],
    [595, 770],
    [580, 730],
    [565, 750]
], dtype=np.int32)
br_mask = np.zeros((H, W), dtype=np.uint8)
cv2.fillPoly(br_mask, [br_poly], 255)

# Copy photographic fabric into canvas
sage_canvas[drape_mask == 255] = master[drape_mask == 255]
sage_canvas[top_flap_mask == 255] = master[top_flap_mask == 255]
sage_canvas[br_mask == 255] = master[br_mask == 255]
sage_canvas = np.clip(sage_canvas, 0, 255).astype(np.uint8)

# Entire sleeve mask: backing under paper + exposed flaps
sleeve_mask = np.zeros((H, W), dtype=np.uint8)
sleeve_mask[50:750, 54:572] = 255
sleeve_mask = cv2.bitwise_or(sleeve_mask, drape_mask)
sleeve_mask = cv2.bitwise_or(sleeve_mask, top_flap_mask)
sleeve_mask = cv2.bitwise_or(sleeve_mask, br_mask)

sleeve_mask = cv2.morphologyEx(sleeve_mask, cv2.MORPH_CLOSE, kernel3)
sleeve_mask_blur = cv2.GaussianBlur(sleeve_mask.astype(float), (5, 5), 0) / 255.0

f_shadow = cv2.GaussianBlur(sleeve_mask.astype(float), (25, 25), 0) / 255.0
M_f_shadow = np.float32([[1, 0, 4], [0, 1, 8]])
f_shadow_shifted = cv2.warpAffine(f_shadow, M_f_shadow, (W, H))
f_shadow_alpha = 0.50 * np.clip(f_shadow_shifted - sleeve_mask_blur, 0, 1)

fabric_rgba = np.zeros((H, W, 4), dtype=np.uint8)
for c in range(3):
    fabric_rgba[:, :, c] = np.clip(sage_canvas[:, :, c] * sleeve_mask_blur + 12 * f_shadow_alpha * (1.0 - sleeve_mask_blur), 0, 255).astype(np.uint8)
fabric_rgba[:, :, 3] = np.clip((sleeve_mask_blur + f_shadow_alpha) * 255, 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_fabric_backing.png', fabric_rgba)

# 9. Composite
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
cv2.imwrite('mobile/assets/auth/invitation_card_bg.png', comp.astype(np.uint8))
print('Polish complete!')
