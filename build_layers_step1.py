import cv2
import numpy as np
from PIL import Image, ImageFilter

# Load master
img = cv2.imread('C:/Users/cjysu/.gemini/antigravity/brain/29c68174-3514-4da4-a283-62d907ccd0b5/.user_uploaded/media_1792126302440_6e5f673a.jpg')
x0, y0, x1, y1 = 56, 104, 664, 896
master = img[y0:y1, x0:x1]
H, W, _ = master.shape

print(f'Building layers on {W}x{H} canvas...')
