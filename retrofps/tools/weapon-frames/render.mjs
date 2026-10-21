import {chromium} from 'playwright-core';import http from 'http';import fs from 'fs';import path from 'path';
const srv=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]);for(const r of ['.','..']){const f=path.join(r,p);if(fs.existsSync(f)&&fs.statSync(f).isFile()){res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.png')?'image/png':'application/octet-stream');return res.end(fs.readFileSync(f));}}res.statusCode=404;res.end();}).listen(8776);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage({viewport:{width:960,height:498}});pg.on('pageerror',e=>console.log('err',e.message));
await pg.goto('http://localhost:8776/batch.html');await pg.waitForFunction('window.ready',null,{timeout:60000});
const R='/guns/Assets/RetroWeaponsPack/';
// cam: [bak, upp, sida, siktpunkt framåt, sänkning] i andelar av vapnets längd
const TUNE=JSON.parse(process.env.TUNE||'{}');
const W={pistol:{k:'Pistol_01',dir:'Pistol_01/FbxFiles/',fbx:'Pistol_01.fbx',cam:[0.85,0.45,-0.18,1.0,0.55]},
 shotgun:{k:'Shotgun_01',dir:'Shotgun_01/FbxFiles/',fbx:'Shotgun_01.fbx',cam:[0.2,0.2,-0.12,0.8,0.3]},
 rifle:{k:'Rifle_01',dir:'Rifle_01/Fbx_Files/',fbx:'Rifle_01.fbx',cam:[0.3,0.2,-0.1,0.8,0.32]},
 smg:{k:'SMG_01',dir:'SMG_01/Fbx_Files/',fbx:'SMG_01.fbx',cam:[0.45,0.28,-0.12,0.8,0.42]}};
for(const k in TUNE) W[k].cam=TUNE[k];
const only=process.argv[2]||'all',outDir=process.argv[3]||'qframes',quick=!!process.env.QUICK;fs.mkdirSync(outDir,{recursive:true});
const meta={};
for(const [n,w] of Object.entries(W)){if(only!=='all'&&only!==n)continue;
 const armsA=a=>R+`FP_Arms/FBX_Files/Animations/${w.k}_Animations/${a==='BasePose'?'Poses':'OneTimeAnimations'}/FP_Arms_${w.k}_${a}.fbx`;
 const base={gunFbx:R+'Guns/'+w.dir+w.fbx,gunTex:R+`Guns/${w.k}/Textures/${w.k}_Albedo.png`,gunBase:R+'Guns/'+w.dir+'Animations/'+w.k+'_BasePose.fbx',grot:[0,0,0],cam:[0,0,0,0,0],fov:+(process.env.FOV||40),hideArms:true,straight:true};
 const probe=await pg.evaluate(p=>window.renderFrame(p),{...base,armsAnim:armsA('BasePose'),t:0});
 const [mnx,mny,mnz]=probe.gmin,[mxx,mxy,mxz]=probe.gmax,len=mxx-mnx,cz=(mnz+mxz)/2;
 const [bk,up,sd,fw,dr]=w.cam;
 const camPos=[mnx-bk*len,mxy+up*len,cz+sd*len],camLook=[mxx+fw*len,mxy+up*len-dr*len*fw,cz+sd*len];
 meta[n]={idle:[],fire:[]};
 const seq=[['idle','BasePose',null,[0]],['fire','Fire',R+'Guns/'+w.dir+'Animations/'+w.k+'_Fire.fbx',null]];
 for(const [st,anim,gunAnim,ts0] of seq){ if(quick&&st!=='idle')continue;
  let ts=ts0; if(!ts){const pr=await pg.evaluate(p=>window.renderFrame(p),{...base,armsAnim:armsA(anim),gunAnim,t:0,camPos,camLook});const d=pr.dur;meta[n].fire_dur=d;ts=[0.02,0.06,0.11,0.18,0.27,0.4,0.55].map(x=>x*d/0.55*0.55).filter(t=>t<d);}
  for(const t of ts){const r=await pg.evaluate(p=>window.renderFrame(p),{...base,armsAnim:armsA(anim),gunAnim,t,camPos,camLook});
   const f=`${outDir}/${n}_${st}_${meta[n][st].length}.png`;fs.writeFileSync(f,Buffer.from(r.png.split(',')[1],'base64'));meta[n][st].push({f,muzzle:r.muzzle,t});}
 }
 console.log(n,'klar');
}
fs.writeFileSync(outDir+'/meta.json',JSON.stringify(meta,null,1));await b.close();srv.close();
