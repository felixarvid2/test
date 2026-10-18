import {chromium} from 'playwright-core';import http from 'http';import fs from 'fs';import path from 'path';
const srv=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]);for(const r of ['.','..']){const f=path.join(r,p);if(fs.existsSync(f)&&fs.statSync(f).isFile()){res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.png')?'image/png':'application/octet-stream');return res.end(fs.readFileSync(f));}}res.statusCode=404;res.end();}).listen(8769);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage({viewport:{width:960,height:498}});pg.on('pageerror',e=>console.log('err',e.message));pg.on('console',m=>{if(/error/i.test(m.type()))console.log(m.text())});
await pg.goto('http://localhost:8769/batch.html');await pg.waitForFunction('window.ready',null,{timeout:60000});
const R='/guns/Assets/RetroWeaponsPack/';
const W={pistol:{k:'Pistol_01',dir:'Pistol_01/FbxFiles/',fbx:'Pistol_01.fbx',grot:[0,0,0],cam:[0,-12,-2,6,4]},
 shotgun:{k:'Shotgun_01',dir:'Shotgun_01/FbxFiles/',fbx:'Shotgun_01.fbx',grot:JSON.parse(process.env.SGROT||'[0,0,0]'),shotgun:true},
 rifle:{k:'Rifle_01',dir:'Rifle_01/Fbx_Files/',fbx:'Rifle_01.fbx',grot:[0,0,0]},
 smg:{k:'SMG_01',dir:'SMG_01/Fbx_Files/',fbx:'SMG_01.fbx',grot:[0,0,0]}};
const CAM=JSON.parse(process.env.CAM||'[0,-8,-4,6,-6]');
const only=process.argv[2];const outDir=process.argv[3]||'frames';fs.mkdirSync(outDir,{recursive:true});
const meta={};
for(const [n,w] of Object.entries(W)){ if(only&&only!=='all'&&only!==n)continue;
 const sub=a=>/Pose$/.test(a)?'Poses':/Reload|Fire|Interact/.test(a)?'OneTimeAnimations':'TransitionAnimations';
 const armsA=a=>R+`FP_Arms/FBX_Files/Animations/${w.k}_Animations/${sub(a)}/FP_Arms_${w.k}_${a}.fbx`;
 const gunA=a=>{const m={Fire:'Fire',Fire_Aiming:'Fire',Reload:'Reload',ReloadStep:'ReloadStep',ReloadEnd:'ReloadEnd'}[a];return m?R+'Guns/'+w.dir+'Animations/'+w.k+'_'+m+'.fbx':null};
 const base={gunFbx:R+'Guns/'+w.dir+w.fbx,gunTex:R+`Guns/${w.k}/Textures/${w.k}_Albedo.png`,gunBase:R+'Guns/'+w.dir+'Animations/'+w.k+'_BasePose.fbx',grot:w.grot,cam:w.cam||CAM,fov:58,...(process.env.CAMPOS?{camPos:JSON.parse(process.env.CAMPOS),camLook:JSON.parse(process.env.CAMLOOK)}:{})};
 const seq=process.env.QUICK?{idle:[['BasePose',[0]]]}:{
  idle:[['BasePose',[0]]], aim:[['AimPose',[0]]],
  fire:[['Fire',null,5]], aimfire:[['Fire_Aiming',null,4]],
  reload:w.shotgun?[['ReloadStart',null,3],['ReloadStep',null,5],['ReloadEnd',null,4]]:[['Reload',null,10]],
  draw:[['Draw',null,5]] };
 meta[n]={};
 for(const [state,parts] of Object.entries(seq)){meta[n][state]=[];
  for(const [anim,times,count] of parts){
   let ts=times;if(!ts){const probe=await pg.evaluate(p=>window.renderFrame(p),{...base,armsAnim:armsA(anim),gunAnim:gunA(anim),t:0});const d=probe.dur;ts=[...Array(count)].map((_,i)=>d*(i+0.5)/count);meta[n][state+'_dur']=(meta[n][state+'_dur']||0)+d;}
   for(const t of ts){const res=await pg.evaluate(p=>window.renderFrame(p),{...base,armsAnim:armsA(anim),gunAnim:gunA(anim),t});
    const f=`${outDir}/${n}_${state}_${meta[n][state].length}.png`;fs.writeFileSync(f,Buffer.from(res.png.split(',')[1],'base64'));meta[n][state].push({f,muzzle:res.muzzle,anim,t});}
  }
  console.log(n,state,meta[n][state].length);
 }
}
fs.writeFileSync(outDir+'/meta.json',JSON.stringify(meta,null,1));
await b.close();srv.close();
