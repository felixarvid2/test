// Renderar statiska vapenmodeller (utan armrigg) till förstapersonsrutor.
//   node render-static.mjs side [namn,...]          sidovyer för att kontrollera rot/tilt i static-defs.json
//   node render-static.mjs fp [namn,...] [xframes]  vilobild + skjutrutor och meta.json för pack.py
// Skjutrutorna är som standard sju rekylrutor. En definition kan i stället ange
//   "fire": [{"kick":..,"dy":..,"dz":..,"roll":..}, ...]   egna rekyl-/skakrutor (eldkastaren, granattillsatsen)
//   "melee": {"idle":{"hand":[x,y,z],"ang":[x,y,z]}, "fire":[...]}  närstridsvapen som svingas (yxan)
import {chromium} from 'playwright-core';import http from 'http';import fs from 'fs';import path from 'path';
const A=new URL('../../../assets/3d-models/',import.meta.url).pathname; // modellerna ligger i repots assets/3d-models
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=p.startsWith('/A/')?A+p.slice(3):path.join('.',p);if(fs.existsSync(f)&&fs.statSync(f).isFile()){res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.png')?'image/png':f.endsWith('.jpg')?'image/jpeg':'application/octet-stream');return res.end(fs.readFileSync(f));}res.statusCode=404;res.end();}).listen(8790);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage({viewport:{width:960,height:498}});pg.on('pageerror',e=>console.log('err',e.message));pg.on('console',m=>{if(m.type()==='error')console.log('console',m.text())});
await pg.goto('http://localhost:8790/static.html');await pg.waitForFunction('window.ready',null,{timeout:60000});
const DEFS=JSON.parse(fs.readFileSync(process.env.DEFS||'static-defs.json','utf8'));
const mode=process.argv[2],names=(process.argv[3]||Object.keys(DEFS).join(',')).split(','),out=process.argv[4]||'xframes';fs.mkdirSync(out,{recursive:true});
const metaF=out+'/meta.json',meta=fs.existsSync(metaF)?JSON.parse(fs.readFileSync(metaF)):{};
const save=(f,r)=>fs.writeFileSync(f,Buffer.from(r.png.split(',')[1],'base64'));
for(const n of names){const d={...DEFS[n],model:'/A/'+DEFS[n].model,tex:DEFS[n].tex?'/A/'+DEFS[n].tex:null};
  if(mode==='side'){const r=await pg.evaluate(p=>window.renderFrame(p),{...d,melee:null,view:'side'});save(`side_${n}.png`,r);console.log(n,JSON.stringify(r.size));continue;}
  if(d.melee){
    const fr=(st,pose,i)=>pg.evaluate(p=>window.renderFrame(p),{...d,melee:{...d.melee,...pose}}).then(r=>{const f=`${out}/${n}_${st}_${i}.png`;save(f,r);return {f,muzzle:r.muzzle}});
    meta[n]={idle:[await fr('idle',d.melee.idle,0)],fire:[],fire_dur:d.dur||0.5,native:true};
    for(let i=0;i<d.melee.fire.length;i++)meta[n].fire.push(await fr('fire',d.melee.fire[i],i));
    console.log(n,'klar (närstrid)');continue;
  }
  const r0=await pg.evaluate(p=>window.renderFrame(p),{...d,kick:0});
  const fr=(st,kf,i)=>pg.evaluate(p=>window.renderFrame(p),{...d,...kf,len0:r0.len,base:r0.base}).then(r=>{const f=`${out}/${n}_${st}_${i}.png`;save(f,r);return {f,muzzle:r.muzzle}});
  meta[n]={idle:[await fr('idle',{kick:0},0)],fire:[],fire_dur:d.dur||0.5};
  const ks=d.fire||[0.6,1,0.85,0.6,0.38,0.2,0.08].map(kick=>({kick}));for(let i=0;i<ks.length;i++)meta[n].fire.push(await fr('fire',ks[i],i));
  console.log(n,'klar',JSON.stringify(meta[n].idle[0].muzzle));
}
fs.writeFileSync(metaF,JSON.stringify(meta,null,1));await b.close();srv.close();
