# Packar raka vapenbilder (utan händer) till bildremsor för 320x166-vyn, Doom/Quake-stil.
#   python3 pack.py qframes,xframes            packar alla vapen i meta.json-filerna och skriver om js/weapons.js
#   python3 pack.py xframes ../../ axe,flamer  packar bara de namngivna vapnen och behåller övriga poster i js/weapons.js
#   python3 pack.py pick ../../ axe,flamer     upplockningsbilder pick_<vapen>.png ur sidovyerna side_<vapen>.png
import json, re, sys
import numpy as np
from PIL import Image
srcs=(sys.argv[1] if len(sys.argv)>1 else 'qframes,xframes').split(',')  # qframes: RetroWeaponPack, xframes: statiska modeller
OUT=sys.argv[2] if len(sys.argv)>2 else '../../'
ONLY=sys.argv[3].split(',') if len(sys.argv)>3 else None
VW,VH=320,166
TARGET={'pistol':(84,178,24),'shotgun':(112,196,40),'rifle':(112,184,42),'smg':(98,178,32),
        'dbshotgun':(110,194,40),'crossbow':(66,166,14),'flaregun':(80,180,22),'sniper':(118,186,46),
        'flamer':(104,226,34),'launcher':(100,188,30),'nailgun':(96,210,22)}  # höjd i px, mittpunkt x, hur mycket som skärs av nedtill
HARD={'axe','flamer','launcher','nailgun','staff','bow'}   # version 5 och 6: hel eller ingen täckning per pixel
MUZZLE_IDLE={'bow'}
PICK={'nailgun':(48,'w'),'staff':(48,'w',-90),'bow':(46,'w',90,'string'),'axe':(44,'w',90),'flamer':(54,'w'),'launcher':(46,'w')}  # upplockningsbildens storlek (höjd eller bredd i px)


def hard(im):
    a=np.array(im.convert('RGBA'))
    a[:,:,3]=np.where(a[:,:,3]>=128,255,0); a[a[:,:,3]==0]=0
    return Image.fromarray(a)


if srcs==['pick']:
    for w in ONLY:
        im=Image.open(f'side_{w}.png').convert('RGBA'); im=im.crop(im.getbbox())
        n,ax,*rt=PICK[w]
        if rt and rt[0]!='string': im=im.rotate(rt[0],expand=True)
        sc=n/(im.height if ax=='h' else im.width)
        im=hard(im.resize((max(1,round(im.width*sc)),max(1,round(im.height*sc))),Image.LANCZOS))
        if 'string' in rt:  # bågen: sträng mellan spetsarna (sidovyn saknar sträng)
            from PIL import ImageDraw
            a=np.array(im)[:,:,3]>0; xs=np.nonzero(a.any(0))[0]; x0,x1=xs[0],xs[-1]
            yl=np.nonzero(a[:,x0])[0].mean(); yr=np.nonzero(a[:,x1])[0].mean()
            ImageDraw.Draw(im).line([(x0,round(yl)),(x1,round(yr))],fill=(232,224,200,255))
        im=im.crop(im.getbbox()); im.save(OUT+f'assets/gfx/pick_{w}.png',optimize=True); print('pick',w,im.size)
    sys.exit()

d={}
for src in srcs: d.update(json.load(open(src+'/meta.json')))
out={}
if ONLY:
    js=open(OUT+'js/weapons.js').read()
    out=json.loads(re.search(r'window\.WEAPON_FRAMES = (\{.*\});',js,re.S).group(1))
for w,st in d.items():
    if ONLY and w not in ONLY: continue
    files=[]; states={}
    for s in ['idle','fire']+[k for k in ('draw',) if k in st]:   # version 6: bågen har ett extra läge
        states[s]=[]
        for fr in st[s]: states[s].append(len(files)); files.append(fr)
    ims=[Image.open(f['f']).convert('RGBA') for f in files]
    bb=None
    for im in ims:
        b=im.getbbox()
        if b: bb=b if bb is None else (min(bb[0],b[0]),min(bb[1],b[1]),max(bb[2],b[2]),max(bb[3],b[3]))
    if st.get('native'):  # närstrid: kameran komponerar redan bilden, skala 960x498 -> 320x166 och behåll läget
        sc=VW/ims[0].width; bb=(bb[0],bb[1],bb[2],min(bb[3],ims[0].height))
        fw=round((bb[2]-bb[0])*sc); fh=round((bb[3]-bb[1])*sc); x=round(bb[0]*sc); y=round(bb[1]*sc)
    else:
        th,cx,extra=TARGET[w]; sc=th/(bb[3]-bb[1])
        fw=round((bb[2]-bb[0])*sc); fh=th
        x=round(cx-fw/2); y=VH-fh+extra
    atlas=Image.new('RGBA',(fw*len(ims),fh))
    for i,im in enumerate(ims):
        fr=im.crop(bb).resize((fw,fh),Image.LANCZOS)
        atlas.paste(hard(fr) if w in HARD else fr,(i*fw,0))
    atlas.save(OUT+f'assets/gfx/fp_{w}.png',optimize=True)
    mz=[[round(x+(f['muzzle'][0]-bb[0])*sc,1),round(y+(f['muzzle'][1]-bb[1])*sc,1)] for f in files]
    if w in MUZZLE_IDLE: mz=[mz[0] if i in states['fire'] else m for i,m in enumerate(mz)]   # bågen: utan pil räknas mynningen från vilobilden
    out[w]={'x':x,'y':y,'w':fw,'h':fh,'states':states,'muzzle':mz,'dur':{'fire':round(st['fire_dur'],3),**{k:round(v,3) for k,v in st.get('durs',{}).items()}}}
    print(w,atlas.size,x,y,mz[0])
open(OUT+'js/weapons.js','w').write('// Genererad av tools/weapon-frames: vapnen utan händer, rakt framåt (Doom/Quake-stil), koordinater i 320x166-vyn.\nwindow.WEAPON_FRAMES = '+json.dumps(out)+';\n')
