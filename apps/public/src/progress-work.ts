// One private worker per sync. No main-thread fallback for large history work.
export class ProgressWork {
 private worker=new Worker(new URL('./progress-worker.ts',import.meta.url),{type:'module'});
 private sequence=0;
 private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
 private closed=false;
 private abort=()=>this.close(new DOMException('同步已取消。','AbortError'));
 constructor(private signal:AbortSignal){
  this.worker.onmessage=({data})=>{const request=this.pending.get(data.id);if(!request)return;this.pending.delete(data.id);if(data.error)request.reject(Error(data.error));else request.resolve(data.value);};
  this.worker.onerror=()=>this.close(Error('同步处理未能完成，稍后会自动重试。'));
  signal.addEventListener('abort',this.abort,{once:true});if(signal.aborted)this.abort();
 }
 call(operation:string,args:Record<string,any>={}){
  if(this.closed)return Promise.reject(Error('同步已取消。'));
  return new Promise<any>((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});try{this.worker.postMessage({id,operation,args});}catch(e){this.pending.delete(id);reject(e);}});
 }
 collect(operation='collect'){
  const studies:string[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;if(key.startsWith('piclex-web.study.v2.')){const value=localStorage.getItem(key);if(value)studies.push(value);}}
  return this.call(operation,{studies});
 }
 verify(bytes:Uint8Array,name:string,hash?:string){return this.call('verify',{bytes,name,hash});}
 close(reason=Error('同步已结束。')){if(this.closed)return;this.closed=true;this.signal.removeEventListener('abort',this.abort);this.worker.terminate();for(const request of this.pending.values())request.reject(reason);this.pending.clear();}
}
