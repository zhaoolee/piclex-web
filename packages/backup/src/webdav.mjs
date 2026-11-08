import {decodePositions,encodePositions,positionName,isPositionName,positionLimit} from './positions.mjs';
import {sha256} from '@noble/hashes/sha2.js';
import {decodeProgress,encodeProgress} from './progress.mjs';
import {hashBlob,byteSize,MAX_BACKUP_BYTES,MAX_PROGRESS_BYTES,MAX_MANIFEST_BYTES,sizeError,checkSize} from './streaming.mjs';
export function configuration(value){
 let directory;try{directory=new URL(value.address.trim());}catch{throw Error('请填写有效的 HTTPS WebDAV 文件夹地址。');}
 if(directory.protocol!=='https:'||directory.username||directory.password||directory.search||directory.hash||/[\r\n:]/.test(value.username)||/[\r\n]/.test(value.password)||/%(?:2f|5c|2e)/i.test(directory.pathname))throw Error('请使用 HTTPS 文件夹地址，账号和密码分别填写，不要放在地址中。');
 if(!directory.pathname.endsWith('/'))directory.pathname+='/';const root=directory.pathname.split('/').at(-2)==='PicLex'?directory:new URL('PicLex/',directory);
 return {directory:directory.href,root:root.href,username:value.username,password:value.password};
}
function child(base,name){if(!/^[A-Za-z0-9_.-]+\/?$/.test(name)||name.startsWith('.')&& !name.startsWith('.complete-uploading-')||name.includes('..'))throw Error('备份路径无效。');return new URL(name,base).href;}
export function parseDirectory(xml,base){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('WebDAV 返回的目录格式无效。');const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='multistatus')throw Error('服务器没有返回 WebDAV 文件夹列表。');const root=new URL(base),entries=[];
 for(const response of doc.getElementsByTagNameNS('DAV:','response')){
  const href=response.getElementsByTagNameNS('DAV:','href')[0]?.textContent;if(!href)continue;let url;try{url=new URL(href,root);}catch{continue;}
  if(url.pathname===root.pathname.replace(/\/$/,''))url.pathname=root.pathname;
  if(url.origin!==root.origin||url.username||url.password||url.search||url.hash||/%(?:2f|5c|2e)/i.test(url.pathname)||!url.pathname.startsWith(root.pathname))continue;
  const relative=url.pathname.slice(root.pathname.length).replace(/\/$/,'');if(relative.includes('/'))continue;
  const propstats=[...response.getElementsByTagNameNS('DAV:','propstat')].filter(p=>/\s200(?:\s|$)/.test(p.getElementsByTagNameNS('DAV:','status')[0]?.textContent||''));if(!propstats.length)continue;
  const collection=propstats.some(p=>p.getElementsByTagNameNS('DAV:','collection').length>0);entries.push({url:url.href,name:decodeURIComponent(relative),collection});if(entries.length>5000)throw Error('备份文件夹内容过多。');
 }return entries;
}
const body='<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>';
export class WebDAV {
 /** @param {any} settings @param {{signal?:AbortSignal,onProgress?:(progress:any)=>void,job?:any}} options */
 constructor(settings,{signal,onProgress=(_progress)=>{},job}={}){this.job=job;this.settings=configuration(settings);this.signal=signal;this.onProgress=onProgress;this.authorization='Basic '+btoa(String.fromCharCode(...new TextEncoder().encode(this.settings.username+':'+this.settings.password)));}
 /** @returns {Promise<any>} */
 async request(method,url,{data,headers={},allow=[200],limit=MAX_BACKUP_BYTES,toDisk=false,digestOnly=false,progressJSON=false}={}){
  if(!toDisk&&!digestOnly)limit=Math.min(limit,progressJSON?MAX_PROGRESS_BYTES:MAX_MANIFEST_BYTES);
  const endpoint=new URL(url),base=new URL(this.settings.directory);if(endpoint.origin!==base.origin||!endpoint.pathname.startsWith(base.pathname)||endpoint.username||endpoint.password)throw Error('拒绝访问备份文件夹以外的地址。');
  const controller=new AbortController(),abort=()=>controller.abort();if(this.signal?.aborted)abort();this.signal?.addEventListener('abort',abort,{once:true});let timedOut=false;let timer;const reset=(duration=120000)=>{clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;abort();},duration);};reset(method==='PUT'?6*60*60*1000:120000);
  try{
   const response=await fetch(url,{method,body:data,headers:{Authorization:this.authorization,...headers},credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
   if(!allow.includes(response.status)){if(response.status===401)throw Error('账号或密码不正确。');if(response.status===403)throw Error('当前账号没有备份文件夹的访问权限。');if(response.status===404)throw Error('WebDAV 文件夹不存在，请检查地址。');if(response.status===507)throw Error('WebDAV 存储空间不足。');throw Error(`WebDAV 操作失败（HTTP ${response.status}）。`);}
   if(method==='HEAD')return {status:response.status,size:Number(response.headers.get('Content-Length'))};
   const size=Number(response.headers.get('Content-Length')||0);if(size>limit){await response.body?.cancel();throw sizeError();}
   reset();let length=0;const hash=digestOnly?sha256.create():null;
   const bounded=response.body?.pipeThrough(new TransformStream({transform:(chunk,controller)=>{reset();length+=chunk.byteLength;if(length>limit)throw sizeError();if(hash)hash.update(chunk);else controller.enqueue(chunk);if(method==='GET')this.onProgress({done:length,total:size});}}));
   if(digestOnly){if(bounded)await bounded.pipeTo(new WritableStream(),{signal:controller.signal});return {status:response.status,digest:Array.from(hash.digest(),b=>b.toString(16).padStart(2,'0')).join('')};}
   if(toDisk){if(!this.job)throw Error('大文件暂存尚未准备好。');return {status:response.status,bytes:await this.job.receive(bounded||new Blob().stream(),limit,size)};}
   // Only bounded control/JSON responses use a memory buffer.
   const chunks=[];if(bounded){const reader=bounded.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);}}
   const bytes=new Uint8Array(length);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return {status:response.status,bytes};
  }catch(e){if(controller.signal.aborted)throw Error(timedOut?'连接超时，请检查网络后重试。':'操作已取消。');if(e instanceof TypeError)throw Error('无法连接 WebDAV：请检查网络、证书，并确认服务器允许此网站跨域访问（CORS）。');throw e;}finally{clearTimeout(timer);this.signal?.removeEventListener('abort',abort);}
 }
 async properties(url,depth='1',missing=false){const r=await this.request('PROPFIND',url,{data:body,headers:{Depth:depth,'Content-Type':'application/xml; charset=utf-8'},allow:missing?[207,404]:[207],limit:8*1024*1024});return r.status===404?null:parseDirectory(new TextDecoder().decode(r.bytes),url);}
 async connect(){const rows=await this.properties(this.settings.directory,'0');if(!rows.some(r=>r.url.replace(/\/$/,'')===this.settings.directory.replace(/\/$/,'')&&r.collection))throw Error('WebDAV 地址不是文件夹。');return true;}
 async listPositions(){const rows=await this.properties(child(this.settings.root,'positions/'),'1',true);return (rows||[]).filter(r=>!r.collection&&isPositionName(r.name));}
 async readPositions(name){if(!isPositionName(name))throw Error('卡组位置文件名无效。');const r=await this.request('GET',child(child(this.settings.root,'positions/'),name),{limit:positionLimit,progressJSON:true});const rows=decodePositions(r.bytes);if(await positionName(encodePositions(rows))!==name)throw Error('卡组位置校验失败。');return rows;}
 async uploadPositions(rows){const bytes=encodePositions(rows),name=await positionName(bytes),folder=child(this.settings.root,'positions/');await this.mkdir(this.settings.root,true);await this.mkdir(folder,true);
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),stage=child(folder,'.complete-uploading-'+nonce),target=child(folder,name);
 try{await this.request('PUT',stage,{data:bytes,headers:{'Content-Type':'application/json','If-None-Match':'*'},allow:[200,201,204],limit:1024*1024});await this.request('MOVE',stage,{headers:{Destination:target,Overwrite:'F'},allow:[201,204,412],limit:1024*1024});await this.readPositions(name);return name;}
 finally{try{const cleanup=new WebDAV({address:this.settings.directory,username:this.settings.username,password:this.settings.password});await cleanup.request('DELETE',stage,{allow:[200,204,404],limit:1024*1024});}catch{}}
 }
 async listProgress(){
  const rows=await this.properties(child(this.settings.root,'progress/'),'1',true);
  return (rows||[]).filter(r=>!r.collection&&/^PicLex-progress-v1-[a-f0-9]{20}\.json$/.test(r.name)).sort((a,b)=>a.name.localeCompare(b.name));
 }
 async readProgressBytes(name){
  if(!/^PicLex-progress-v1-[a-f0-9]{20}\.json$/.test(name))throw Error('学习进度文件名无效。');
  const response=await this.request('GET',child(child(this.settings.root,'progress/'),name),{limit:MAX_PROGRESS_BYTES,progressJSON:true});
  return response.bytes;
 }
 async readProgress(name){
  const content=await decodeProgress(await this.readProgressBytes(name)),envelope=await encodeProgress(content);
  if(name!==`PicLex-progress-v1-${envelope.contentSHA256.slice(0,20)}.json`)throw Error('学习进度文件名与内容校验不一致。');
  return content;
 }
 async uploadProgress(content){
  const envelope=await encodeProgress(content),name=`PicLex-progress-v1-${envelope.contentSHA256.slice(0,20)}.json`;
  const bytes=new TextEncoder().encode(JSON.stringify(envelope));
  return this.uploadProgressBytes(name,bytes,async saved=>{const checked=await encodeProgress(await decodeProgress(saved));if(checked.contentSHA256!==envelope.contentSHA256)throw Error('学习进度校验失败，请重试。');});
 }
 async uploadProgressBytes(name,bytes,verify){
  if(!/^PicLex-progress-v1-[a-f0-9]{20}\.json$/.test(name)||!(bytes instanceof Uint8Array)||typeof verify!=='function')throw Error('学习进度上传参数无效。');
  checkSize(bytes.length,MAX_PROGRESS_BYTES);await verify(bytes);
  const folder=child(this.settings.root,'progress/');await this.mkdir(this.settings.root,true);await this.mkdir(folder,true);
  // Same immutable names as iOS: concurrent writers never replace each other.
  // getRandomValues remains available on LAN HTTP, unlike randomUUID.
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const stage=child(folder,'.complete-uploading-'+nonce),target=child(folder,name);
  let created=false;
  try{
   created=true;await this.request('PUT',stage,{data:bytes,headers:{'Content-Type':'application/json','If-None-Match':'*'},allow:[200,201,204],limit:1024*1024});
   await this.request('MOVE',stage,{headers:{Destination:target,Overwrite:'F'},allow:[201,204,412],limit:1024*1024});
   await verify(await this.readProgressBytes(name));
   return name;
  }finally{if(created){try{const cleanup=new WebDAV({address:this.settings.directory,username:this.settings.username,password:this.settings.password});await cleanup.request('DELETE',stage,{allow:[200,204,404],limit:1024*1024});}catch{/* Only this run's unique temporary file can remain. */}}}
 }
 async list(){await this.connect();const rows=await this.properties(this.settings.root,'1',true);return (rows||[]).filter(r=>r.collection&&/^PicLex-Backup-[A-Za-z0-9_.-]+$/.test(r.name)).sort((a,b)=>b.name.localeCompare(a.name));}
 async mkdir(url,existing=false){const r=await this.request('MKCOL',url,{allow:existing?[201,405]:[201],limit:1024*1024});if(r.status===405){const rows=await this.properties(url,'0');if(!rows.some(r=>r.collection&&r.url.replace(/\/$/,'')===url.replace(/\/$/,'')))throw Error('备份目录不可用。');}}
 async upload(files,name){
  for(const [file,limit]of [['photos.piclexdeck',MAX_BACKUP_BYTES],['learning-progress.json',MAX_PROGRESS_BYTES],['backup.json',MAX_MANIFEST_BYTES]]){if(!files[file])throw Error('完整备份文件缺失。');checkSize(byteSize(files[file]),limit);}
  if(!/^PicLex-Backup-[A-Za-z0-9_.-]+$/.test(name))throw Error('备份名称无效。');await this.connect();await this.mkdir(this.settings.root,true);const stage=child(this.settings.root,'.complete-uploading-'+crypto.randomUUID()+'/'),target=child(this.settings.root,name+'/');let created=false,published=false;
  try{await this.mkdir(stage);created=true;for(const filename of ['photos.piclexdeck','learning-progress.json','backup.json']){this.onProgress({message:'正在上传 '+filename});const bytes=files[filename];await this.request('PUT',child(stage,filename),{data:bytes,headers:{'Content-Type':'application/octet-stream','If-None-Match':'*'},allow:[200,201,204],limit:1024*1024});const proof=await this.request('HEAD',child(stage,filename));if(proof.size!==byteSize(bytes))throw Error('服务器未完整保存备份文件。');}
   await this.request('MOVE',stage,{headers:{Destination:target,Overwrite:'F'},allow:[201,204],limit:1024*1024});published=true;
   for(const filename of ['photos.piclexdeck','learning-progress.json','backup.json']){this.onProgress({message:'正在校验 '+filename});const saved=await this.request('GET',child(target,filename),{digestOnly:true,limit:filename==='photos.piclexdeck'?MAX_BACKUP_BYTES:filename==='learning-progress.json'?MAX_PROGRESS_BYTES:MAX_MANIFEST_BYTES});if(saved.digest!==await hashBlob(files[filename],{signal:this.signal}))throw Error('服务器上的备份校验失败，请重新创建备份；现有备份已保留。');}
   return target;
  }finally{if(created&&!published){try{const cleanup=new WebDAV({address:this.settings.directory,username:this.settings.username,password:this.settings.password});await cleanup.request('DELETE',stage,{allow:[200,204,404],limit:1024*1024});}catch{/* Only our unique staging directory may remain; existing backups are untouched. */}}}
 }
 /** @returns {Promise<Record<string,Blob|Uint8Array>>} */
 async download(entry){if(!this.job)throw Error('大文件暂存尚未准备好。');const list=await this.list(),found=list.find(r=>r.url===entry.url);if(!found)throw Error('备份已变化，请刷新列表。');/** @type {Record<string,Blob|Uint8Array>} */ const files={};for(const name of ['backup.json','photos.piclexdeck','learning-progress.json']){this.onProgress({message:'正在下载 '+name});files[name]=(await this.request('GET',child(found.url.endsWith('/')?found.url:found.url+'/',name),{limit:name==='backup.json'?MAX_MANIFEST_BYTES:name==='learning-progress.json'?MAX_PROGRESS_BYTES:MAX_BACKUP_BYTES,toDisk:true})).bytes;}return files;}
}
