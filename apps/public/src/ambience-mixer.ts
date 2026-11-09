/** Background audio must be attenuated in the signal path: iOS can ignore media.volume. */
export function createAmbienceMixer(){
 const context=new AudioContext(),gain=context.createGain();
 gain.gain.value=0;gain.connect(context.destination);
 let volume=0,speaking=false;
 const apply=()=>{
  const param=gain.gain,now=context.currentTime;
  const target=volume*.22*(speaking?.22:1);
  param.cancelScheduledValues(now);param.setTargetAtTime(target,now,.04);
 };
 return {
  resume:()=>context.resume(),
  attach(sound:HTMLAudioElement){const source=context.createMediaElementSource(sound);source.connect(gain);return()=>source.disconnect();},
  setLevel(value:number,isSpeaking:boolean){volume=Math.max(0,Math.min(1,value));speaking=isSpeaking;apply();},
  stop(){gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setValueAtTime(0,context.currentTime);},
  dispose(){gain.disconnect();void context.close().catch(()=>{});}
 };
}
