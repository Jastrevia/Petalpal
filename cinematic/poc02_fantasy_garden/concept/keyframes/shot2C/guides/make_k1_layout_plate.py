"""Layout guide for keyframe K1 of shot 2C. Reads the approved frame; never writes it."""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import sys, os
# Usage: python make_k1_layout_plate.py <approved frame png> <output dir>
# Builds the K1 layout guide by simulating a straight dolly back (opening at 0.5 scale, distant valley unchanged).
SRC=sys.argv[1]; os.chdir(sys.argv[2])
im=Image.open(SRC).convert('RGB'); W,H=im.size; cx,cy=W/2,H/2; k=0.5
P=[(540,600),(538,420),(542,300),(552,240),(578,185),(618,138),(672,100),(742,74),(822,62),(900,64),(1000,78),(1100,92),(1180,122),(1232,172),(1252,250),(1272,300),(1276,500),(1276,660),(1240,690),(900,712),(545,712)]
S=lambda p:(cx+(p[0]-cx)*k, cy+(p[1]-cy)*k)
P2=[S(p) for p in P]
# scaled copy (arch plane and everything near it), centred on the principal point
sw,sh=round(W*k),round(H*k); small=im.resize((sw,sh),Image.LANCZOS)
ox,oy=round(cx-sw/2),round(cy-sh/2)
plate=Image.new('RGBA',(W,H),(0,0,0,0)); plate.paste(small.convert('RGBA'),(ox,oy))
# distant valley: unscaled, seen through the smaller opening (feathered)
m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(P2,fill=255); m=m.filter(ImageFilter.GaussianBlur(3))
# shrink mask slightly so the arch rim stays from the scaled copy
m=Image.fromarray((np.clip((np.asarray(m).astype(float)-128)*2,0,255)).astype('uint8'))
plate.paste(im.convert('RGBA'),(0,0),m)
plate.save('frame2C_K1_layout_plate.png')
# grey-filled version + mask (white = area to generate)
grey=Image.new('RGB',(W,H),(128,128,128)); grey.paste(plate,(0,0),plate); grey.save('frame2C_K1_layout_plate_grey.png')
mask=Image.new('L',(W,H),255); ImageDraw.Draw(mask).rectangle((ox,oy,ox+sw-1,oy+sh-1),fill=0); mask.save('frame2C_K1_fill_mask.png')
# annotated diagram
ann=grey.copy().convert('RGB'); d=ImageDraw.Draw(ann)
d.line(P2+[P2[0]],fill=(255,60,60),width=3)
d.rectangle((ox,oy,ox+sw-1,oy+sh-1),outline=(255,255,255),width=2)
d.line([(0,cy),(W,cy)],fill=(255,255,0),width=1)
sx,sy=752,196; d.ellipse((sx-10,sy-10,sx+10,sy+10),outline=(0,255,255),width=3)
d.rectangle((735,438,895,588),outline=(80,255,80),width=2)
d.rectangle((1095,240,1240,620),outline=(255,160,0),width=2)
for t,xy in [('opening: half the approved size, same centre line',(P2[0][0]-10,P2[-1][1]+8)),('sun (same screen position; now hidden above the arch)',(sx+14,sy-6)),('pavilion: same size and position',(735,420)),('waterfall: now hidden behind the right side of the mouth',(1095,625)),('eye level',(10,cy+4)),('approved frame scaled 0.5 (everything near the mouth)',(ox+4,oy+4)),('grey = new passage interior to paint',(20,20))]:
    d.text(xy,t,fill=(255,255,255),stroke_width=2,stroke_fill=(0,0,0))
ann.save('frame2C_K1_layout_annotated.png')
print(P2[0],P2[7],P2[17],(ox,oy,sw,sh))

# restore near-plane elements hanging inside the opening (lanterns, crystal drops, wisteria) from the scaled copy
hsv=np.asarray(im.convert('HSV')).astype(float); Hh=hsv[...,0]*360/255; Ss=hsv[...,1]/255; Vv=hsv[...,2]/255
fg=((Hh>250)&(Hh<330)&(Ss>0.18))|(Vv<0.5)|((Hh>20)&(Hh<55)&(Ss>0.45)&(Vv<0.85))|((Hh>160)&(Hh<200)&(Ss>0.35))
R=np.zeros(fg.shape,bool)
for x0,y0,x1,y1 in [(560,250,615,370),(680,140,725,240),(770,135,805,185),(805,140,850,245),(590,140,690,310),(880,55,1100,205),(1130,110,1215,250),(1222,230,1290,470),(540,280,560,620)]:
    R[y0:y1,x0:x1]=True
fm=Image.fromarray(((fg&R)*255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
fm_s=fm.resize((sw,sh),Image.LANCZOS)
plate.paste(small.convert('RGBA'),(ox,oy),fm_s)
plate.save('frame2C_K1_layout_plate.png')
grey=Image.new('RGB',(W,H),(128,128,128)); grey.paste(plate,(0,0),plate); grey.save('frame2C_K1_layout_plate_grey.png')
ann2=grey.copy(); d=ImageDraw.Draw(ann2)
d.line(P2+[P2[0]],fill=(255,60,60),width=2); d.rectangle((ox,oy,ox+sw-1,oy+sh-1),outline=(255,255,255),width=2)
d.line([(0,cy),(W,cy)],fill=(255,255,0),width=1); d.ellipse((sx-10,sy-10,sx+10,sy+10),outline=(0,255,255),width=3)
d.rectangle((735,438,895,588),outline=(80,255,80),width=2); d.rectangle((1095,240,1240,620),outline=(255,160,0),width=2)
for t,xy in [('opening: half the approved size, same centre line',(P2[0][0]-10,P2[-1][1]+8)),('sun: same screen position, now hidden above the mouth',(sx+14,sy-6)),('pavilion: same size and position',(735,420)),('waterfall: hidden behind the right side of the mouth',(1095,625)),('eye level (camera level, 1.6 m)',(10,cy+4)),('approved frame at 0.5 scale: everything near the mouth',(ox+4,oy+4)),('grey = new passage interior to paint',(20,20))]:
    d.text(xy,t,fill=(255,255,255),stroke_width=2,stroke_fill=(0,0,0))
ann2.save('frame2C_K1_layout_annotated.png')
