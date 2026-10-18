# Packar raka vapenbilder (utan händer) till bildremsor för 320x166-vyn, Doom/Quake-stil.
import json, sys
from PIL import Image
src=sys.argv[1] if len(sys.argv)>1 else 'qframes'
OUT=sys.argv[2] if len(sys.argv)>2 else '../../'
VW,VH=320,166
TARGET={'pistol':(84,178,24),'shotgun':(112,196,40),'rifle':(112,184,42),'smg':(98,178,32)}  # höjd i px, mittpunkt x, hur mycket som skärs av nedtill
d=json.load(open(src+'/meta.json'))
out={}
for w,st in d.items():
    files=[]; states={}
    for s in ['idle','fire']:
        states[s]=[]
        for fr in st[s]: states[s].append(len(files)); files.append(fr)
    ims=[Image.open(f['f']).convert('RGBA') for f in files]
    bb=None
    for im in ims:
        b=im.getbbox()
        if b: bb=b if bb is None else (min(bb[0],b[0]),min(bb[1],b[1]),max(bb[2],b[2]),max(bb[3],b[3]))
    th,cx,extra=TARGET[w]; sc=th/(bb[3]-bb[1])
    fw=round((bb[2]-bb[0])*sc); fh=th
    x=round(cx-fw/2); y=VH-fh+extra
    atlas=Image.new('RGBA',(fw*len(ims),fh))
    for i,im in enumerate(ims): atlas.paste(im.crop(bb).resize((fw,fh),Image.LANCZOS),(i*fw,0))
    atlas.save(OUT+f'assets/gfx/fp_{w}.png',optimize=True)
    mz=[[round(x+(f['muzzle'][0]-bb[0])*sc,1),round(y+(f['muzzle'][1]-bb[1])*sc,1)] for f in files]
    out[w]={'x':x,'y':y,'w':fw,'h':fh,'states':states,'muzzle':mz,'dur':{'fire':round(st['fire_dur'],3)}}
    print(w,atlas.size,x,y,mz[0])
open(OUT+'js/weapons.js','w').write('// Genererad av tools/weapon-frames: vapnen utan händer, rakt framåt (Doom/Quake-stil), koordinater i 320x166-vyn.\nwindow.WEAPON_FRAMES = '+json.dumps(out)+';\n')
