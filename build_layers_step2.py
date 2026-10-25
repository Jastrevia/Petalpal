import cv2
import numpy as np
from PIL import Image, ImageFilter

# 1. Load Image 2
img = cv2.imread('C:/Users/cjysu/.gemini/antigravity/brain/29c68174-3514-4da4-a283-62d907ccd0b5/.user_uploaded/media_1792126302440_6e5f673a.jpg')
x0, y0, x1, y1 = 56, 104, 664, 896
master = img[y0:y1, x0:x1]
H, W, _ = master.shape
print(f'Master shape: {W}x{H}')

# Clean composite from test_fractal_paper_card
clean_card = cv2.imread('mobile/assets/auth/test_fractal_paper_card.png')

# 2. Extract WAX SEAL (Layer 5)
# Seal center (328, 102), radius ~42
seal_rgba = np.zeros((H, W, 4), dtype=np.uint8)
y_grid, x_grid = np.ogrid[:H, :W]
dist_seal = np.sqrt((x_grid - 328)**2 + (y_grid - 102)**2)

# Wax seal rim has organic radius 38..43
# Golden color mask: R > 115, G > 85, B < 110, R > B + 30
seal_color = (clean_card[:, :, 2] > 110) & (clean_card[:, :, 1] > 80) & (clean_card[:, :, 0] < 120) & (dist_seal < 48)

# Core is solid
seal_mask = np.zeros((H, W), dtype=np.uint8)
seal_mask[dist_seal <= 38] = 255
seal_mask[seal_color & (dist_seal <= 44)] = 255
# Morphological close & smooth
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
seal_mask = cv2.morphologyEx(seal_mask, cv2.MORPH_CLOSE, kernel)
seal_mask_blur = cv2.GaussianBlur(seal_mask.astype(float), (3, 3), 0) / 255.0

# Add soft contact shadow under seal
shadow_mask = np.zeros((H, W), dtype=float)
dist_shadow = np.sqrt((x_grid - 328)**2 + (y_grid - 106)**2)
shadow_mask[(dist_shadow <= 50) & (dist_seal > 38)] = 0.5 * (1.0 - (dist_shadow[(dist_shadow <= 50) & (dist_seal > 38)] - 38) / 12.0)
shadow_mask = np.clip(shadow_mask, 0, 1)

# Wax seal RGBA
seal_rgba[:, :, :3] = clean_card
seal_rgba[:, :, 3] = (seal_mask_blur * 255).astype(np.uint8)

# Also create shadow under seal
seal_shadow_rgba = np.zeros((H, W, 4), dtype=np.uint8)
seal_shadow_rgba[:, :, :3] = 20 # dark brown-black shadow
seal_shadow_rgba[:, :, 3] = (shadow_mask * 255).astype(np.uint8)

# Combine shadow into seal RGBA
final_seal_rgba = np.zeros((H, W, 4), dtype=np.uint8)
for c in range(3):
    final_seal_rgba[:, :, c] = np.clip(seal_rgba[:, :, c] * (seal_rgba[:, :, 3] / 255.0) + 25 * shadow_mask * (1.0 - seal_rgba[:, :, 3] / 255.0), 0, 255).astype(np.uint8)
final_seal_rgba[:, :, 3] = np.clip(seal_rgba[:, :, 3].astype(float) + shadow_mask * 255 * (1.0 - seal_rgba[:, :, 3] / 255.0), 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_wax_seal.png', final_seal_rgba)

# Solo wax seal (120x120 crop)
solo_seal = final_seal_rgba[42:162, 268:388]
cv2.imwrite('mobile/assets/auth/invitation_wax_seal_solo.png', solo_seal)
print('Wax seal layer saved: invitation_wax_seal.png and invitation_wax_seal_solo.png')

# 3. Extract FOLDED RIBBON (Layer 2)
# Ribbon loops are at x: 220..445, y: 12..120
ribbon_rgba = np.zeros((H, W, 4), dtype=np.uint8)
# Color of green ribbon: B ~ 90..130, G ~ 120..165, R ~ 110..155 (muted sage green)
ribbon_zone = (x_grid >= 220) & (x_grid <= 445) & (y_grid >= 10) & (y_grid <= 135)
ribbon_color = ribbon_zone & (master[:, :, 1] > 95) & (master[:, :, 1] < 175) & (master[:, :, 0] > 70) & (master[:, :, 0] < 145) & (dist_seal > 35)

ribbon_mask = np.zeros((H, W), dtype=np.uint8)
ribbon_mask[ribbon_color] = 255
# Dilate slightly and close
ribbon_mask = cv2.morphologyEx(ribbon_mask, cv2.MORPH_CLOSE, kernel)
ribbon_mask = cv2.GaussianBlur(ribbon_mask.astype(float), (5, 5), 0) / 255.0

ribbon_rgba[:, :, :3] = master
ribbon_rgba[:, :, 3] = (ribbon_mask * 255).astype(np.uint8)
cv2.imwrite('mobile/assets/auth/invitation_folded_ribbon.png', ribbon_rgba)
print('Folded ribbon layer saved: invitation_folded_ribbon.png')

# 4. Extract DECKLE PAPER (Layer 3)
# Paper contour: left x~53, right x~572, top y~50..88, bottom y~745..774
# Master coords:
paper_mask = np.zeros((H, W), dtype=np.uint8)
# Core
paper_mask[60:745, 58:568] = 255

# Fill exact deckle boundaries
for y in range(50, 746):
    for x in range(58, 48, -1):
        b, g, r = clean_card[y, x]
        if (int(b) + int(g) + int(r)) / 3.0 > 175:
            paper_mask[y, x] = 255
        else:
            break

for y in range(85, 765):
    for x in range(568, 576):
        b, g, r = clean_card[y, x]
        if (int(b) + int(g) + int(r)) / 3.0 > 170:
            paper_mask[y, x] = 255
        else:
            break

for x in range(53, 572):
    for y in range(60, 38, -1):
        b, g, r = clean_card[y, x]
        if (int(b) + int(g) + int(r)) / 3.0 > 175:
            paper_mask[y, x] = 255
        else:
            break

for x in range(53, 572):
    for y in range(745, 778):
        b, g, r = clean_card[y, x]
        if (int(b) + int(g) + int(r)) / 3.0 > 165:
            paper_mask[y, x] = 255
        else:
            break

paper_mask = cv2.morphologyEx(paper_mask, cv2.MORPH_CLOSE, kernel)
paper_mask_blur = cv2.GaussianBlur(paper_mask.astype(float), (3, 3), 0) / 255.0

# Contact drop shadow of paper onto fabric backing
paper_shadow = cv2.GaussianBlur(paper_mask.astype(float), (11, 11), 0) / 255.0
# Shift shadow down-right slightly (x+2, y+3)
M_trans = np.float32([[1, 0, 2], [0, 1, 3]])
paper_shadow_shifted = cv2.warpAffine(paper_shadow, M_trans, (W, H))

# Paper RGBA
deckle_paper_rgba = np.zeros((H, W, 4), dtype=np.uint8)
deckle_paper_rgba[:, :, :3] = clean_card
deckle_paper_rgba[:, :, 3] = (paper_mask_blur * 255).astype(np.uint8)

# Composite paper contact shadow into RGBA
final_paper_rgba = np.zeros((H, W, 4), dtype=np.uint8)
shadow_intensity = 0.40 * np.clip(paper_shadow_shifted - paper_mask_blur, 0, 1)

for c in range(3):
    final_paper_rgba[:, :, c] = np.clip(deckle_paper_rgba[:, :, c] * (deckle_paper_rgba[:, :, 3] / 255.0) + 15 * shadow_intensity * (1.0 - deckle_paper_rgba[:, :, 3] / 255.0), 0, 255).astype(np.uint8)
final_paper_rgba[:, :, 3] = np.clip(deckle_paper_rgba[:, :, 3].astype(float) + shadow_intensity * 255, 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_deckle_paper.png', final_paper_rgba)
print('Deckle paper layer saved: invitation_deckle_paper.png')

# 5. Extract BOTANICAL FRAME (Layer 4)
# Contains the gold double border, 4 corner florals, bottom cartouche, top fleuron, lilac petals
# Form area inside border is 100% transparent!
botanical_rgba = np.zeros((H, W, 4), dtype=np.uint8)
botanical_rgba[:, :, :3] = master

# Transparency mask for center:
# Inside x: 92..545, y: 165..715 is transparent, EXCEPT corner florals
botanical_alpha = np.zeros((H, W), dtype=float)

# Floral corners:
# TL: x: 70..240, y: 50..270
botanical_alpha[50:270, 70:240] = 1.0
# TR: x: 410..575, y: 70..270
botanical_alpha[70:270, 410:575] = 1.0
# BL: x: 70..240, y: 620..770
botanical_alpha[620:770, 70:240] = 1.0
# BR: x: 410..575, y: 620..770
botanical_alpha[620:770, 410:575] = 1.0

# Gold border lines:
# Left double border: x: 78..94, y: 50..745
botanical_alpha[50:745, 78:94] = 1.0
# Right double border: x: 550..566, y: 80..760
botanical_alpha[80:760, 550:566] = 1.0
# Top border: y: 62..74, x: 78..566
botanical_alpha[62:74, 78:566] = 1.0
# Bottom border: y: 725..738, x: 78..566
botanical_alpha[725:738, 78:566] = 1.0
# Bottom cartouche: x: 300..360, y: 715..745
botanical_alpha[715:745, 300:360] = 1.0
# Top fleuron: x: 315..345, y: 130..155
botanical_alpha[130:155, 315:345] = 1.0

# Soften transition to center
botanical_alpha = cv2.GaussianBlur(botanical_alpha, (9, 9), 0)
botanical_alpha = np.clip(botanical_alpha * paper_mask_blur, 0, 1)

# Outside paper: 0
botanical_rgba[:, :, 3] = (botanical_alpha * 255).astype(np.uint8)
cv2.imwrite('mobile/assets/auth/invitation_botanical_frame.png', botanical_rgba)
print('Botanical frame layer saved: invitation_botanical_frame.png')

# 6. Extract SAGE FABRIC BACKING (Layer 1)
# Fabric backing includes:
# - Left drape: x: 10..80, y: 60..580
# - Top flap: y: 15..90, x: 80..595
# - Top right corner: x: 560..600, y: 35..140
# - Bottom right corner: x: 540..595, y: 735..788
# - Continuous fabric base under the paper (so paper sits on solid sage fabric)
# - Outer drop shadow casting onto the garden
fabric_rgba = np.zeros((H, W, 4), dtype=np.uint8)

# Fabric contour
fabric_mask = np.zeros((H, W), dtype=np.uint8)
# Fill central base (matches paper area plus exposed borders)
fabric_mask[30:780, 50:580] = 255
# Left drape polygon:
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

# Top flap polygon:
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

# Bottom right fold polygon:
br_poly = np.array([
    [540, 755],
    [585, 784],
    [595, 770],
    [580, 730],
    [565, 750]
], dtype=np.int32)
cv2.fillPoly(fabric_mask, [br_poly], 255)

fabric_mask = cv2.morphologyEx(fabric_mask, cv2.MORPH_CLOSE, kernel)
fabric_mask_blur = cv2.GaussianBlur(fabric_mask.astype(float), (5, 5), 0) / 255.0

# Base fabric texture: sample sage green color with subtle woven texture
# Sage green mean BGR: [55, 78, 72]
# Sample real fabric texture from master[200:400, 18:48]
fabric_sample = master[200:400, 20:45].astype(float)
fs_mean = np.mean(fabric_sample, axis=(0,1))
fs_noise = fabric_sample - fs_mean

fabric_canvas = np.zeros((H, W, 3), dtype=float)
fabric_canvas[:, :] = fs_mean

# Tile fabric weave
fsh, fsw, _ = fs_noise.shape
for y in range(0, H, fsh):
    for x in range(0, W, fsw):
        h_s = min(fsh, H - y)
        w_s = min(fsw, W - x)
        fabric_canvas[y:y+h_s, x:x+w_s] += fs_noise[:h_s, :w_s]

# Copy original master exposed fabric areas directly for 100% photographic realism:
# Left drape, top flap, TR and BR corners from master
fabric_canvas[fabric_mask == 255] = master[fabric_mask == 255]

# Outer drop shadow of fabric sleeve onto background
fabric_shadow = cv2.GaussianBlur(fabric_mask.astype(float), (21, 21), 0) / 255.0
M_shadow = np.float32([[1, 0, 4], [0, 1, 8]])
fabric_shadow_shifted = cv2.warpAffine(fabric_shadow, M_shadow, (W, H))

shadow_alpha = 0.50 * np.clip(fabric_shadow_shifted - fabric_mask_blur, 0, 1)

fabric_rgba[:, :, :3] = np.clip(fabric_canvas * fabric_mask_blur[:, :, None] + 12 * shadow_alpha[:, :, None] * (1.0 - fabric_mask_blur[:, :, None]), 0, 255).astype(np.uint8)
fabric_rgba[:, :, 3] = np.clip((fabric_mask_blur + shadow_alpha) * 255, 0, 255).astype(np.uint8)

cv2.imwrite('mobile/assets/auth/invitation_fabric_backing.png', fabric_rgba)
print('Fabric backing layer saved: invitation_fabric_backing.png')

# 7. Verification: Re-composite all 5 layers to test physical assembly!
composite_test = np.zeros((H, W, 4), dtype=float)

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

# 1: Fabric Backing
comp = fabric_rgba.astype(float)
# 2: Ribbon
comp = alpha_over(comp, ribbon_rgba.astype(float))
# 3: Deckle Paper
comp = alpha_over(comp, final_paper_rgba.astype(float))
# 4: Botanical Frame
comp = alpha_over(comp, botanical_rgba.astype(float))
# 5: Wax Seal
comp = alpha_over(comp, final_seal_rgba.astype(float))

cv2.imwrite('mobile/assets/auth/invitation_card_composite.png', comp.astype(np.uint8))
print('Full multi-layer composite saved: invitation_card_composite.png')
