import numpy as np
from PIL import Image, ImageDraw, ImageFont
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',24); Fb=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',30); Fs=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
W,H=1920,1080
img=Image.new('RGBA',(W,H),(246,242,236,255))
lay=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(lay)
for x in (640,1280): d.line([(x,0),(x,H)],fill=(200,195,190,255),width=1)
for y in (360,720): d.line([(0,y),(W,y)],fill=(200,195,190,255),width=1)
for wing in [[(1300,520),(1600,230),(1690,430),(1420,570)],[(1320,580),(1640,600),(1590,760),(1400,660)],[(1170,520),(940,300),(900,470),(1150,580)],[(1170,580),(930,640),(990,760),(1170,640)]]:
    d.polygon(wing,outline=(120,150,200,220),fill=(185,199,230,70),width=3)
sh_n=(1170,525); sh_f=(1340,515)
d.polygon([sh_n,sh_f,(1360,800),(1210,815)],outline=(90,70,120,255),fill=(222,208,228,255),width=4)
d.polygon([(1205,800),(1370,790),(1450,990),(1150,1010)],outline=(110,90,150,220),fill=(232,222,236,255),width=3)
d.line([(1270,1000),(1310,1080)],fill=(90,70,120,255),width=16); d.line([(1360,990),(1440,1075)],fill=(90,70,120,255),width=14)
d.line([sh_f,(1430,650),(1455,780)],fill=(90,70,120,255),width=12)
d.line([(1240,470),(1250,525)],fill=(90,70,120,255),width=12)
d.polygon([(1160,520),(1190,560),(1060,690),(1010,650)],fill=(120,95,150,255))
d.polygon([(1040,640),(1085,700),(930,790),(880,720)],fill=(140,110,165,255))
img=Image.alpha_composite(img,lay)
m=Image.open('/mnt/user-data/uploads/Petalpal/Resources/fairy/production/master/fairy_first_approved.png').convert('RGBA')
head=m.crop((510,30,790,300)); k=1.2; head=head.resize((int(head.width*k),int(head.height*k)),Image.LANCZOS)
a=np.asarray(head).copy(); hh=a.shape[0]; fade=np.clip((hh-np.arange(hh))/40,0,1)[:,None]; a[...,3]=(a[...,3]*fade).astype(np.uint8); head=Image.fromarray(a)
hx,hy=1035,175; img.alpha_composite(head,(hx,hy))
lay=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(lay)
fb=(hx+int(95*k),hy+int(90*k),hx+int(215*k),hy+int(200*k)); d.rectangle(fb,outline=(40,140,90,255),width=3)
d.text((fb[2]+12,fb[1]),'FACE at the master angle\n(3/4 to screen right, eyes to lens)\n-> exact master-face transplant',font=Fs,fill=(40,120,80,255))
SK=(240,205,190,255); RD=(200,60,60,255)
hc=(820,780)
d.ellipse((hc[0]-175,hc[1]-125,hc[0]+175,hc[1]+125),outline=RD,fill=SK,width=5)
for (x,y,r) in [(700,650,46),(850,615,46),(920,640,40)]:
    d.ellipse((x-r,y-r*0.8,x+r,y+r*0.8),outline=RD,fill=SK,width=4)
d.ellipse((630,700,700,770),outline=RD,fill=SK,width=4)
d.ellipse((745,560,835,650),outline=(230,150,40,255),fill=(245,215,200,255),width=6)
d.text((520,505),'index fingertip pointing straight\nat the lens = contact point',font=Fs,fill=(190,110,20,255))
d.text((560,925),'HAND: the largest shape in frame, about 1.8x the height of her face;\noverlaps her forearm and waist (that overlap sells the depth)',font=Fs,fill=RD)
d.line([(1835,fb[1]),(1835,fb[3])],fill=(40,140,90,255),width=4); d.text((1800,fb[3]+6),'face',font=Fs,fill=(40,140,90,255))
d.line([(590,655),(590,905)],fill=RD,width=4)
img=Image.alpha_composite(img,lay); d=ImageDraw.Draw(img)
d.text((20,20),'REACH: blocking for the rebuild (free sketch, not artwork)',font=Fb,fill=(40,30,50))
for i,l in enumerate(['Camera: her chest height, ~35mm-equivalent, slightly below her eyes; framed head to knees.',
                      'Depth: hand ~25 cm from the lens, face ~55 cm -> the hand reads about twice the size of her face.',
                      'Upper arm and forearm mostly hidden behind the hand (foreshortening); the far arm relaxed; legs trail back.',
                      'Focus on her eyes, the hand slightly soft. Gentle closed-mouth smile. Shoes, costume, proportions = master.']):
    d.text((20,62+i*30),l,font=F,fill=(60,50,70))
img.convert('RGB').save('reach/REACH_blocking_frame.png')
