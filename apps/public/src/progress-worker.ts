import {currentProgress,mergeSyncedProgress} from './backup-service';
import {decodeProgress,encodeProgress,mergeProgress} from '../../../packages/backup/src/progress.mjs';
let content:any;
let studiesRequest:{resolve:(studies:string[])=>void;reject:(error:Error)=>void}|undefined;
const readStudies=()=>new Promise<string[]>((resolve,reject)=>{studiesRequest={resolve,reject};(globalThis as any).postMessage({type:'read-studies'});});
async function checked(bytes:Uint8Array,name:string,hash?:string){
 const value=await decodeProgress(bytes),envelope=await encodeProgress(value);
 if(name!==`PicLex-progress-v1-${envelope.contentSHA256.slice(0,20)}.json`||hash&&envelope.contentSHA256!==hash)throw Error('学习进度文件名与内容校验不一致。');
 return value;
}
async function execute(operation:string,args:any){
 if(operation==='collect'){content=await currentProgress(readStudies);return;}
 if(operation==='merge'){content=mergeProgress(content,await checked(args.bytes,args.name));return;}
 if(operation==='apply'){await mergeSyncedProgress(content);content=undefined;return;}
 if(operation==='prepare'){
  // Reread both databases after applying: answers committed during download survive.
  const latest=await currentProgress(readStudies),envelope=await encodeProgress(latest);
  return {name:`PicLex-progress-v1-${envelope.contentSHA256.slice(0,20)}.json`,hash:envelope.contentSHA256,hasRows:Object.values(latest).some((rows:any)=>rows.length),bytes:new TextEncoder().encode(JSON.stringify(envelope))};
 }
 if(operation==='verify'){await checked(args.bytes,args.name,args.hash);return;}
 throw Error('未知的同步操作。');
}
let queue=Promise.resolve();
globalThis.onmessage=({data}:MessageEvent)=>{
 // Reply outside the operation queue: the active operation is awaiting it.
 if(data.type==='studies'){const request=studiesRequest;studiesRequest=undefined;if(data.error)request?.reject(Error(data.error));else request?.resolve(data.studies);return;}
 queue=queue.then(async()=>{try{const value=await execute(data.operation,data.args);(globalThis as any).postMessage({id:data.id,value},value?.bytes?[value.bytes.buffer]:[]);}catch(e){(globalThis as any).postMessage({id:data.id,error:(e as Error).message});}});
};
