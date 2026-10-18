import json
from PIL import Image
d=json.load(open('frames/meta.json'))
out={}
OUT='../../assets/gfx/'
order=['idle','aim','fire','aimfire','reload','draw']
for w,st in d.items():
    files=[]; states={}
    for s in order:
        states[s]=[]
        for fr in st[s]:
            states[s].append(len(files)); files.append(fr)
    ims=[Image.open(f['f']).convert('RGBA') for f in files]
    bb=None
    for im in ims:
        b=im.getbbox()
        if b: bb=b if bb is None else (min(bb[0],b[0]),min(bb[1],b[1]),max(bb[2],b[2]),max(bb[3],b[3]))
    x0=bb[0]//3*3; y0=bb[1]//3*3; x1=-(-bb[2]//3)*3; y1=min(498,-(-bb[3]//3)*3)
    fw,fh=(x1-x0)//3,(y1-y0)//3
    atlas=Image.new('RGBA',(fw*len(ims),fh))
    for i,im in enumerate(ims):
        atlas.paste(im.crop((x0,y0,x1,y1)).resize((fw,fh),Image.LANCZOS),(i*fw,0))
    atlas.save(OUT+f'fp_{w}.png',optimize=True)
    out[w]={'x':x0//3,'y':y0//3,'w':fw,'h':fh,'states':states,'muzzle':[[round(f['muzzle'][0]/3,1),round(f['muzzle'][1]/3,1)] for f in files],
            'dur':{k[:-4]:round(v,3) for k,v in st.items() if k.endswith('_dur')}}
    print(w,atlas.size,out[w]['x'],out[w]['y'])
open('../../js/weapons.js','w').write('// Genererad: bildrutor för förstapersonsvapen (armar + vapen ur RetroWeaponPack), koordinater i 320x166-vyn.\nwindow.WEAPON_FRAMES = '+json.dumps(out)+';\n')
