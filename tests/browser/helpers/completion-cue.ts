import type {Page} from '@playwright/test';

export async function observeCompletionCue(page:Page){
 await page.addInitScript(()=>{
  const w=window as any,start=AudioBufferSourceNode.prototype.start,decode=OfflineAudioContext.prototype.decodeAudioData;
  w.__cues={started:0,ended:0};
  OfflineAudioContext.prototype.decodeAudioData=function(data){return decode.call(this,data).then(buffer=>{w.__cueBuffer=buffer;return buffer;});};
  AudioBufferSourceNode.prototype.start=function(...args){
   if(this.buffer&&this.buffer===w.__cueBuffer){
    w.__cues.started++;w.__cues.scheduled=performance.now();
    w.__cues.duration=this.buffer.duration;w.__cues.output=this.context.state;
    const startTime=this.context.currentTime;
    this.addEventListener('ended',()=>{w.__cues.ended++;w.__cues.elapsed=this.context.currentTime-startTime;},{once:true});
   }
   start.apply(this,args);
  };
  document.addEventListener('animationstart',event=>{
   if(/^letter-gold-(slide|sweep)$/.test(event.animationName)&&event.target instanceof Element&&!event.target.closest('.guided-word.gold-sweep'))w.__cues.animation??=performance.now();
  },true);
 });
}
