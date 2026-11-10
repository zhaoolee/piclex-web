import '../../../packages/laboratory/src/game.css';
import {labLoadFraction} from './lab-progress';
import {experienceReport} from '../../../packages/practice/src/experience-store.mjs';
const scope=window as any;scope.PICLEX_PUBLIC_WEB=true;
let failed=false,done=false;
const report=(state:string,message:string,loaded?:number,total?:number)=>{
 if(done||failed)return;
 if(state==='error')failed=true;if(state==='ready')done=true;if(done||failed)clearTimeout(timeout);
 const cover=document.getElementById('lab-boot'),label=document.getElementById('lab-boot-message'),bar=document.getElementById('lab-boot-progress') as HTMLProgressElement|null;
 const phaseChanged=label?.textContent!==message;
 if(label)label.textContent=message;
 if(bar){if(total){bar.max=total;bar.value=loaded||0;}else bar.removeAttribute('value');bar.hidden=state==='error';}
 if(cover){cover.hidden=state==='ready';const retry=cover.querySelector<HTMLButtonElement>('button');if(retry)retry.hidden=state!=='error';}
 if(parent===window&&state==='loading'){
  const oldMaze=cover?.querySelector<HTMLElement>('.boot-game');
  if(oldMaze){
   const progress=labLoadFraction(loaded,total);
   const measured=progress!==undefined;
   const restart=oldMaze.hasAttribute('data-measured')!==measured||(measured&&phaseChanged);
   const maze=restart?oldMaze.cloneNode(true) as HTMLElement:oldMaze;
   maze.toggleAttribute('data-measured',measured);
   if(measured)maze.style.setProperty('--boot-progress',String(progress));
   else maze.style.removeProperty('--boot-progress');
   if(maze!==oldMaze)oldMaze.replaceWith(maze);
  }
 }
 if(parent!==window)parent.postMessage({type:'piclex-lab-status',state,message,loaded,total},location.origin);
};
scope.PICLEX_LAB_LOAD=report;
const downloads=new AbortController();
const timeout=setTimeout(()=>{downloads.abort();report('error','游戏加载超时，请检查网络后重试。');},180000);
window.addEventListener('pagehide',()=>{clearTimeout(timeout);downloads.abort();},{once:true});
window.addEventListener('error',()=>{if(!done)report('error','游戏启动失败，请重新加载。');});
async function start(){
 report('loading','正在读取游戏进度…');
 let storageTimer:ReturnType<typeof setTimeout>|undefined;
 try{scope.PICLEX_USER_LEVEL=await Promise.race([experienceReport().catch(()=>null),new Promise(resolve=>{storageTimer=setTimeout(()=>resolve(null),5000);})]);}finally{clearTimeout(storageTimer);}
 if(parent!==window){
  report('loading','正在准备学习卡组…');
  scope.PICLEX_LAB_WORDS=await new Promise((resolve,reject)=>{
   const ping=()=>parent.postMessage({type:'piclex-lab-ready'},location.origin);
   const cleanup=()=>{clearTimeout(timer);clearInterval(retry);window.removeEventListener('message',receive);};
   const timer=setTimeout(()=>{cleanup();reject(Error('卡组准备超时，请重新加载。'));},15000),retry=setInterval(ping,500);
   function receive(e:MessageEvent){if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='piclex-lab-words'||!Array.isArray(e.data.words))return;cleanup();resolve(e.data.words);}
   window.addEventListener('message',receive);ping();
  });
 }
 const assets=scope.PICLEX_LAB_BOOT_ASSETS as {url:string;bytes:number}[]|undefined;
 if(assets?.length){
  const total=assets.reduce((sum,asset)=>sum+asset.bytes,0);let loaded=0;
  report('loading','正在下载游戏程序…',0,total);
  await Promise.all(assets.map(async asset=>{
   const response=await fetch(asset.url,{cache:'force-cache',signal:downloads.signal});if(!response.ok)throw Error('Game download failed');
   const reader=response.body?.getReader();let count=0;
   if(reader){for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;loaded+=value.byteLength;report('loading','正在下载游戏程序…',loaded,total);}}
   else{count=(await response.arrayBuffer()).byteLength;loaded+=count;report('loading','正在下载游戏程序…',loaded,total);}
   if(count!==asset.bytes)throw Error('Incomplete game download');
  }));
 }
 report('loading','正在启动游戏…');
 await import('../../../packages/laboratory/src/main.mjs');
}
void start().catch(()=>report('error','游戏加载失败，请检查网络后重试。'));
