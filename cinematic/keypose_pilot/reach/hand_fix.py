import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v1/tools'); import fal
from PIL import Image
K = '/mnt/user-data/outputs/keypose_pilot/'
SRC = K + 'reach/reach_rebuild_1_facefix_native.png'
POLY = np.int32([(1030, 420), (1180, 430), (1350, 640), (1520, 700), (1560, 660), (1650, 700), (1680, 820), (1760, 900), (1770, 960),
                 (1600, 985), (1300, 1000), (1260, 1185), (1100, 1185), (925, 1120), (895, 1000), (1000, 850), (1015, 600)])
if 'gen' in sys.argv:
    P = ("Edit the first image. Change ONLY her right hand and right forearm (the large hand reaching toward the camera on the left side of the image); "
     "keep every other part of the image exactly as it is: her face, eyes, hair, crocus ornament, wings, dress, necklace, other arm, legs, shoes, background, framing and style. "
     "Replace the oversized pointing hand with a natural, graceful gesture of invitation that says 'come with me, take my hand': "
     "her right arm comes from her bare right shoulder (the shoulder with the gold vine band on the left side of her body), the upper arm angled down and forward, the elbow softly bent, "
     "and the forearm extending forward toward the viewer so her hand is held out in front of her at about chest height, slightly to the left of her body. "
     "The hand is softly open with the palm turned gently up and toward the viewer, the five fingers relaxed and naturally curved, slightly separated, like offering her hand to be held. "
     "Believable but modest foreshortening: the hand is only a little larger than her face, it does not dominate the image and does not cover her face. "
     "Correct anatomy: one hand with exactly five delicate fingers, thumb on the correct side for a right hand with the palm up, slender wrist joining the forearm, forearm joining the elbow and upper arm. "
     "Same delicate watercolour-anime rendering, fine violet-brown linework and fair skin as her face and other hand (the second and third images show her approved character and hand style). "
     "Where the old hand was, continue her translucent wings, petal dress and the plain warm-ivory background naturally. "
     "No new jewellery, no rings, no bracelets beyond her existing gold arm vine, no costume changes, no pointing finger, no text.")
    refs = [fal.data_uri(SRC), fal.data_uri(K + 'refs/master_on_paper.png'), fal.data_uri(K + 'approved/fairy_poseA_approved.png') if False else fal.data_uri(K + 'facefix/poseA_CLEAN_free.png')]
    fal.run('fal-ai/nano-banana-pro/edit', dict(prompt=P, image_urls=refs, aspect_ratio='16:9', resolution='2K', num_images=1, output_format='png'),
            0.15, 'reach_hand_fix_1', K + 'reach')
    print('batch total (est): $%.2f' % fal.spent())
if 'comp' in sys.argv:
    A = cv2.cvtColor(cv2.imread(SRC), cv2.COLOR_BGR2RGB); B = cv2.cvtColor(cv2.imread(K + 'reach/reach_hand_fix_1.png'), cv2.COLOR_BGR2RGB)
    if B.shape != A.shape: B = cv2.resize(B, (A.shape[1], A.shape[0]), interpolation=cv2.INTER_LANCZOS4)
    # align B to A using features outside the edit region
    ga, gb = cv2.cvtColor(A, cv2.COLOR_RGB2GRAY), cv2.cvtColor(B, cv2.COLOR_RGB2GRAY)
    outside = np.full(ga.shape, 255, np.uint8); cv2.fillPoly(outside, [POLY], 0); outside = cv2.erode(outside, np.ones((41, 41), np.uint8))
    s = cv2.SIFT_create(6000); ka, da = s.detectAndCompute(ga, outside); kb, db = s.detectAndCompute(gb, outside)
    m = [x for x, y in cv2.BFMatcher().knnMatch(da, db, k=2) if x.distance < 0.7 * y.distance]
    pa = np.float32([ka[x.queryIdx].pt for x in m]); pb = np.float32([kb[x.trainIdx].pt for x in m])
    Hm, inl = cv2.estimateAffinePartial2D(pb, pa, method=cv2.RANSAC, ransacReprojThreshold=2.5)
    print('matches', len(m), 'inliers', int(inl.sum()), 'align', np.round(Hm, 4).tolist())
    Bw = cv2.warpAffine(B, Hm, (A.shape[1], A.shape[0]), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    mask = np.zeros(ga.shape, np.float32); cv2.fillPoly(mask, [POLY], 1.0); mask = cv2.GaussianBlur(mask, (0, 0), 6)[..., None]
    out = A * (1 - mask) + Bw * mask
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(K + 'reach/reach_handfix_composite.png')
    d = np.abs(out.astype(float) - A.astype(float)).max(axis=2); print('pixels changed outside mask (>2):', int(((d > 2) & (mask[..., 0] < 0.001)).sum()))
