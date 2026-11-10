import {positions,mergeStoredPositions} from './position-store';
import {mergePositions,encodePositions,positionName} from '../../../packages/backup/src/positions.mjs';
import {sha256} from '../../../packages/deck-format/src/archive.mjs';
import {WebDAV,configuration} from '../../../packages/backup/src/webdav.mjs';
import {ProgressWork} from './progress-work';
import {readPreference} from './storage';
import {progressSyncReceipts} from './backup-store';

export const webDAVConfigKey='piclex-web.webdav.connection';
export const autoProgressKey='piclex-web.webdav.auto-progress';
export function savedWebDAV(){
 try{const value=JSON.parse(readPreference(webDAVConfigKey)||'{}');return {...value,password:value.remember?value.password||'':sessionStorage.getItem(webDAVConfigKey+'.password')||''};}catch{return {};}
}
type SyncStatus={message:string;lastSuccess?:number;error?:boolean};
let status:SyncStatus={message:'配置 WebDAV 后自动同步等级与学习进度'};
export const progressSyncStatus=()=>status;
function report(next:SyncStatus){status=next;window.dispatchEvent(new Event('piclex-progress-sync-status'));}
let running=false,applying=false,timer:ReturnType<typeof setTimeout>|undefined,retryAt=0,failures=0;
let hasConnection=false;
let controller:AbortController|undefined;
let generation=0;
// Keep automatic sync work outside an active typing/answer-animation burst.
let lastPracticeInput=-Infinity;
const inputQuietMs=1200;
function waitForPracticeIdle(signal:AbortSignal){
 return new Promise<void>((resolve,reject)=>{
  let pending:ReturnType<typeof setTimeout>|undefined;
  const finish=()=>{clearTimeout(pending);signal.removeEventListener('abort',abort);};
  const abort=()=>{finish();reject(new DOMException('同步已取消。','AbortError'));};
  const check=()=>{
   if(signal.aborted){abort();return;}
   const remaining=inputQuietMs-(performance.now()-lastPracticeInput);
   if(document.hidden||!document.querySelector('.native-practice')||remaining<=0){finish();resolve();}
   else pending=setTimeout(check,remaining);
  };
  signal.addEventListener('abort',abort,{once:true});check();
 });
}
const enabled=()=>readPreference(autoProgressKey)!=='false';

export async function syncProgress(){
 if(running||!enabled()||!navigator.onLine||Date.now()<retryAt)return;
 const settings=savedWebDAV();hasConnection=!!settings.address;
 if(!hasConnection)return;
 running=true;controller=new AbortController();const runGeneration=generation;
 let work:ProgressWork|undefined;
 const captured=JSON.stringify(settings),valid=()=>{
  controller?.signal.throwIfAborted();
  if(!enabled()||JSON.stringify(savedWebDAV())!==captured)throw Error('同步配置已变化，下次将使用新配置。');
 };
 try{
  const idle=async()=>{await waitForPracticeIdle(controller!.signal);valid();};
  await idle();
  report({...status,message:'正在同步等级与学习进度…',error:false});
  const normalized=configuration(settings);
  const destination=await sha256(new TextEncoder().encode(normalized.root+'\n'+normalized.username));
  const execute=async()=>{
   valid();const client=new WebDAV(settings,{signal:controller!.signal});
   const seen=new Set(await progressSyncReceipts(destination));
   const files=await client.listProgress();
   work=new ProgressWork(controller!.signal);
   // Large upload bodies and download buffers must stay off the UI thread too.
   // Directory XML parsing remains here; aborting the run terminates its worker.
   const request=client.request.bind(client);
   client.request=(method:string,url:string,options:any={})=>method==='GET'||method==='PUT'?work!.call('request',{settings,method,url,options}):request(method,url,options);
   await idle();await work.collect();valid();
   for(const file of files)if(!seen.has(file.name)){
    const bytes=await client.readProgressBytes(file.name);valid();
    await idle();await work.call('merge',{bytes,name:file.name});valid();
   }
   await idle();applying=true;
   try{await work.call('apply');valid();window.dispatchEvent(new Event('piclex-experience'));window.dispatchEvent(new Event('piclex-progress-imported'));}finally{applying=false;}
   // Reread after the transaction: answers written during the download survive.
   await idle();const prepared=await work.collect('prepare');valid();const {name,bytes,hash}=prepared;
   if(prepared.hasRows){
    // A listed file only proves presence. Verify content before skipping a PUT.
    if(files.some(f=>f.name===name))await work.verify(await client.readProgressBytes(name),name,hash);
    else await client.uploadProgressBytes(name,bytes,(saved:Uint8Array)=>work!.verify(saved,name,hash));
   }
   await idle();const positionFiles=await client.listPositions();let combined=positions();
   for(const file of positionFiles){combined=mergePositions(combined,await client.readPositions(file.name));valid();}
   valid();combined=mergeStoredPositions(combined); // Reread local changes after network awaits.
   if(combined.length){const positionFile=await positionName(encodePositions(combined));valid();if(!positionFiles.some(f=>f.name===positionFile))await client.uploadPositions(combined);}
   valid();for(const f of files)seen.add(f.name);seen.add(name);
   await progressSyncReceipts(destination,[...seen]);
  };
  if(navigator.locks)await navigator.locks.request('piclex-progress-'+destination,execute);else await execute();
  failures=0;retryAt=0;report({message:'等级与学习进度已自动同步',lastSuccess:Date.now()});
 }catch(e){if(runGeneration!==generation)return;failures++;retryAt=Date.now()+Math.min(15*60_000,30_000*2**Math.min(failures-1,5));report({...status,message:(e as Error).message,error:true});}
 finally{work?.close();running=false;controller=undefined;}
}
function queue(){if(!hasConnection||timer||applying||!enabled())return;timer=setTimeout(()=>{timer=undefined;void syncProgress();},10_000);}
export function startProgressSync(){
 hasConnection=!!savedWebDAV().address;
 const input=(event:Event)=>{
  const target=event.target as HTMLElement;
  if(target?.closest?.('.native-practice')||(event.type==='keydown'&&document.querySelector('.native-practice')&&!target?.closest?.('[role=dialog]')))lastPracticeInput=performance.now();
 };
 document.addEventListener('keydown',input,true);
 document.addEventListener('pointerdown',input,true);
 window.addEventListener('piclex-experience',queue);
 window.addEventListener('piclex-progress-changed',queue);
 window.addEventListener('focus',()=>void syncProgress());
 window.addEventListener('online',()=>{retryAt=0;void syncProgress();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncProgress();});
 const configChanged=()=>{hasConnection=!!savedWebDAV().address;generation++;controller?.abort();retryAt=0;failures=0;if(enabled()){queue();if(hasConnection)void syncProgress();}else report({...status,message:'学习进度自动同步已关闭'});};
 window.addEventListener('piclex-webdav-configured',configChanged);
 window.addEventListener('storage',e=>{if(e.key===null||e.key===webDAVConfigKey||e.key===autoProgressKey)configChanged();});
 setInterval(()=>{if(!document.hidden)void syncProgress();},60_000);
 queue();
}
