// A leaf subscription keeps audio clock updates out of the answer/keyboard tree.
export type PlaybackProgress = {value:number; indeterminate:boolean; paused:boolean};
export function createPlaybackProgress(){
 let snapshot:PlaybackProgress={value:0,indeterminate:false,paused:false};
 const listeners=new Set<()=>void>();
 return {
  getSnapshot:()=>snapshot,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
  update:(value:number,indeterminate=false,paused=false)=>{
   const bounded=Number.isFinite(value)?Math.min(1,Math.max(0,value)):0;
   if(snapshot.value===bounded&&snapshot.indeterminate===indeterminate&&snapshot.paused===paused)return;
   snapshot={value:bounded,indeterminate,paused};listeners.forEach(listener=>listener());
  }
 };
}
