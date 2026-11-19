import {downloadBytes} from './download.mjs';
import type {DownloadProgress} from './LoadProgress';
export type CachedPhoto={source:string;src:string;width:number;height:number;image:HTMLImageElement};
type Transfer={progress:DownloadProgress;decoding:boolean};
type Entry={controller:AbortController;listeners:Set<(value:Transfer)=>void>;users:number;transfer:Transfer;promise:Promise<CachedPhoto>;photo?:CachedPhoto;failed?:boolean;objectURL?:string};
const photoIdleTimeout=15_000;
/** One learning session owns only its current photograph and five upcoming photographs. */
export class PhotoCache {
 private entries=new Map<string,Entry>();
 private window:string[]=[];
 peek(source:string){return this.entries.get(source)?.photo;}
 setWindow(current:string|undefined,upcoming:string[]=[]){
  this.window=current?[...new Set([current,...upcoming])].slice(0,6):[];
  this.trim();
  if(current)this.ensure(current);
  this.pump();
 }
 acquire(source:string,onProgress:(value:Transfer)=>void){
  const old=this.entries.get(source);
  if(old?.failed){this.remove(source,old);}
  const entry=this.ensure(source);entry.users++;entry.listeners.add(onProgress);onProgress(entry.transfer);
  let released=false;
  return {promise:entry.promise,release:()=>{if(released)return;released=true;entry.users--;entry.listeners.delete(onProgress);this.trim();}};
 }
 private trim(){for(const [source,entry] of this.entries)if(!entry.users&&!this.window.includes(source))this.remove(source,entry);}
 private remove(source:string,entry:Entry){
  this.entries.delete(source);
  entry.controller.abort();
  if(entry.objectURL){
   URL.revokeObjectURL(entry.objectURL);
   entry.objectURL=undefined;
  }
 }
 private ensure(source:string):Entry {
  const existing=this.entries.get(source);if(existing)return existing;
  const entry:Entry={controller:new AbortController(),listeners:new Set(),users:0,transfer:{progress:{received:0,total:null},decoding:false},promise:null!};
  this.entries.set(source,entry);
  const publish=(value:Transfer)=>{entry.transfer=value;for(const listener of entry.listeners)listener(value);};
  entry.promise=(async()=>{
   const signal=entry.controller.signal;
   let timeout:ReturnType<typeof setTimeout>|undefined;
   const resetTimeout=()=>{
    clearTimeout(timeout);
    timeout=setTimeout(()=>entry.controller.abort(new DOMException('图片加载超时','TimeoutError')),photoIdleTimeout);
   };
   resetTimeout();
   try{
    const result=await downloadBytes(source,{maxBytes:64*1024*1024,signal,onProgress:progress=>{
     resetTimeout();
     publish({progress,decoding:false});
    }});
    signal.throwIfAborted();
    publish({progress:{received:result.bytes.length,total:result.bytes.length},decoding:true});
    entry.objectURL=URL.createObjectURL(new Blob([result.bytes as BlobPart],{type:result.type||'image/jpeg'}));
    const image=new Image();image.decoding='async';image.src=entry.objectURL;
    const cancelDecode=()=>image.removeAttribute('src');
    signal.addEventListener('abort',cancelDecode,{once:true});
    try{await image.decode();}finally{signal.removeEventListener('abort',cancelDecode);}
    signal.throwIfAborted();
    return entry.photo={source,src:entry.objectURL,width:image.naturalWidth,height:image.naturalHeight,image};
   }finally{clearTimeout(timeout);}
  })();
  // Failed speculative loads stay retryable when that photograph becomes current.
  void entry.promise.then(()=>this.pump(),()=>{entry.failed=true;if(entry.objectURL){URL.revokeObjectURL(entry.objectURL);entry.objectURL=undefined;}this.pump();});
  return entry;
 }
 private pump(){
  const current=this.window[0];if(!current||!this.entries.get(current)?.photo)return;
  let pending=[...this.entries.values()].filter(e=>!e.photo&&!e.failed).length;
  for(const source of this.window.slice(1)){if(pending>=2)break;if(!this.entries.has(source)){this.ensure(source);pending++;}}
 }
}
