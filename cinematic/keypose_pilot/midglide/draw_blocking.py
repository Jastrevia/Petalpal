import numpy as np
from PIL import Image, ImageDraw, ImageFont
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',26); Fb=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',34)
W,H=2752,1536
img=Image.new('RGBA',(W,H),(250,244,238,255)); lay=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(lay)
for wing in [[(1720,520),(1380,180),(1300,420),(1640,600)],[(1700,600),(1350,700),(1430,860),(1660,700)],[(1830,520),(1950,250),(2020,420),(1860,590)]]:
    d.polygon(wing,outline=(120,150,200,230),fill=(185,199,230,80),width=4)
# torso leaning ~20 deg, hips lower-left, legs together trailing behind toward lower-left
d.polygon([(1700,520),(1880,520),(1800,860),(1640,850)],outline=(90,70,120,255),fill=(222,208,228,255),width=4)
d.polygon([(1640,840),(1810,850),(1700,1080),(1450,1040)],outline=(110,90,150,220),fill=(232,222,236,255),width=3)
for k in range(3): d.line([(1560-k*60,1000+k*20),(1180-k*80,1240+k*40)],fill=(200,185,215,200),width=18)   # streaming petal panels
d.line([(1640,980),(1330,1330)],fill=(90,70,120,255),width=22); d.line([(1700,990),(1400,1360)],fill=(90,70,120,255),width=22)   # legs together
d.line([(1880,540),(1920,700),(1905,830)],fill=(90,70,120,255),width=14)            # left arm relaxed by her side
d.line([(1710,540),(1680,700)],fill=(120,95,150,255),width=18)                        # right upper arm down
d.line([(1680,700),(1530,660)],fill=(140,110,165,255),width=26)                       # forearm forward at chest height
d.ellipse((1450,610,1545,700),outline=(200,60,60,255),fill=(240,205,190,255),width=4)  # hand, palm beginning to turn up
img=Image.alpha_composite(img,lay)
m=Image.open('/mnt/user-data/uploads/Petalpal/Resources/fairy/production/master/fairy_first_approved.png').convert('RGBA')
head=m.crop((510,30,790,300)); k=1.45; head=head.resize((int(head.width*k),int(head.height*k)),Image.LANCZOS)
a=np.asarray(head).copy(); hh=a.shape[0]; a[...,3]=(a[...,3]*np.clip((hh-np.arange(hh))/40,0,1)[:,None]).astype(np.uint8)
img.alpha_composite(Image.fromarray(a),(1600,90))
d=ImageDraw.Draw(img)
d.text((40,30),'MID-GLIDE: blocking (composition/perspective only)',font=Fb,fill=(40,30,50))
for i,l in enumerate(['Body leaning forward ~20 deg, floating; legs together trailing behind; toes pointed.',
                      'Left arm relaxed by her side. Right forearm forward at chest height, palm beginning to turn up.',
                      'Wings mid-beat behind her back; long petal panels streaming back with the motion.',
                      'Head at the master angle, eyes to viewer, gentle smile. Size between Pose A and Reach.']):
    d.text((40,90+i*36),l,font=F,fill=(60,50,70))
img.convert('RGB').save('midglide/MIDGLIDE_blocking.png')
