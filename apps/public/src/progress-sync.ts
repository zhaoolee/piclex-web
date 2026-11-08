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
let controller:AbortController|undefined;
let generation=0;
const enabled=()=>readPreference(autoProgressKey)!=='false';

export async function syncProgress(){
 if(running||!enabled()||!navigator.onLine||Date.now()<retryAt)return;
 const settings=savedWebDAV();if(!settings.address)return;
 running=true;controller=new AbortController();const runGeneration=generation;
 let work:ProgressWork|undefined;
 const captured=JSON.stringify(settings),valid=()=>{
  controller?.signal.throwIfAborted();
  if(!enabled()||JSON.stringify(savedWebDAV())!==captured)throw Error('同步配置已变化，下次将使用新配置。');
 };
 try{
  report({...status,message:'正在同步等级与学习进度…',error:false});
  const normalized=configuration(settings);
  const destination=await sha256(new TextEncoder().encode(normalized.root+'\n'+normalized.username));
  const execute=async()=>{
   valid();const client=new WebDAV(settings,{signal:controller!.signal});
   const seen=new Set(await progressSyncReceipts(destination));
   const files=await client.listProgress();
   work=new ProgressWork(controller!.signal);await work.collect();valid();
   for(const file of files)if(!seen.has(file.name)){
    const bytes=await client.readProgressBytes(file.name);valid();
    await work.call('merge',{bytes,name:file.name});valid();
   }
   valid();applying=true;
   try{await work.call('apply');valid();window.dispatchEvent(new Event('piclex-experience'));window.dispatchEvent(new Event('piclex-progress-imported'));}finally{applying=false;}
   // Reread after the transaction: answers written during the download survive.
   const prepared=await work.collect('prepare');valid();const {name,bytes,hash}=prepared;
   if(prepared.hasRows){
    // A listed file only proves presence. Verify content before skipping a PUT.
    if(files.some(f=>f.name===name))await work.verify(await client.readProgressBytes(name),name,hash);
    else await client.uploadProgressBytes(name,bytes,(saved:Uint8Array)=>work!.verify(saved,name,hash));
   }
   valid();const positionFiles=await client.listPositions();let combined=positions();
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
function queue(){if(!enabled()||timer||applying)return;timer=setTimeout(()=>{timer=undefined;void syncProgress();},10_000);}
export function startProgressSync(){
 window.addEventListener('piclex-experience',queue);
 window.addEventListener('piclex-progress-changed',queue);
 window.addEventListener('focus',()=>void syncProgress());
 window.addEventListener('online',()=>{retryAt=0;void syncProgress();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncProgress();});
 const configChanged=()=>{generation++;controller?.abort();retryAt=0;failures=0;if(enabled()){queue();void syncProgress();}else report({...status,message:'学习进度自动同步已关闭'});};
 window.addEventListener('piclex-webdav-configured',configChanged);
 window.addEventListener('storage',e=>{if(e.key===webDAVConfigKey||e.key===autoProgressKey)configChanged();});
 setInterval(()=>{if(!document.hidden)void syncProgress();},60_000);
 queue();
}
