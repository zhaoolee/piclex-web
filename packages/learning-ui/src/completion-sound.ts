import cueDataURL from '../../../apps/public/public/audio/correct-word.wav?inline';

// Same independent two-voice success cue as App PracticeView.
const soundURL=`${import.meta.env.BASE_URL}audio/correct-word.wav`;
let voices:HTMLAudioElement[]=[];let index=0;
export function prepareCompletionSound(){
 if(voices.length)return;
 voices=Array.from({length:2},()=>{const voice=new Audio(soundURL);voice.preload='auto';voice.load();return voice;});
}
export function playCompletionSound(){
 if(document.hidden)return;
 try{prepareCompletionSound();const voice=voices[index++%voices.length];voice.currentTime=0;void voice.play().catch(()=>{});}catch{/* Feedback cannot block answer submission. */}
}
export function stopCompletionSound(){for(const voice of voices){voice.pause();voice.currentTime=0;}}

const MAX_FEEDBACK_WAIT_MS=75;

export function createSynchronizedCompletionSound(){
 let buffer:AudioBuffer|undefined,loading:Promise<void>|undefined;
 let context:AudioContext|undefined,resuming:Promise<void>|undefined;
 function prepare(){
  // Bundle the original cue so a cold connection cannot delay the first
  // dictation success beyond its animation.
  loading??=Promise.resolve().then(async()=>{
   const wav=Uint8Array.from(atob(cueDataURL.slice(cueDataURL.indexOf(',')+1)),char=>char.charCodeAt(0));
   buffer=await new OfflineAudioContext(1,1,48000).decodeAudioData(wav.buffer);
  }).catch(()=>{loading=undefined;});
  return loading;
 }
 function unlock(){
  if(context?.state==='running'||resuming)return;
  try{
   const audio=context??=new AudioContext({latencyHint:'interactive'});
   resuming=audio.resume().catch(()=>{}).then(()=>{if(context===audio)resuming=undefined;});
  }catch{/* Completion can still show while audio is unavailable. */}
 }
 function start(onFeedback:(playCue:()=>void)=>void){
  const audio=context;
  let pending=true,cancelled=false,played=false,timer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>{pending=false;cancelled=true;clearTimeout(timer);};
  const show=()=>{
   if(!pending)return;
   pending=false;clearTimeout(timer);
   if(document.hidden)return;
   onFeedback(()=>{
    if(cancelled||played||document.hidden||!audio||audio!==context||audio.state!=='running'||!buffer)return;
    played=true;
    try{
     const cue=audio.createBufferSource();cue.buffer=buffer;cue.connect(audio.destination);
     cue.onended=()=>cue.disconnect();cue.start();
    }catch{/* Completion can still show while audio is unavailable. */}
   });
  };
  if(!audio||audio.state==='running'&&buffer)show();
  else{
   // Bound the wait for visual feedback. Audio still gets one opportunity
   // when the animation actually starts, even if rendering was deferred.
   timer=setTimeout(show,MAX_FEEDBACK_WAIT_MS);
   void Promise.all([prepare(),resuming]).then(show);
  }
  return cancel;
 }
 function stop(){
  const audio=context;context=undefined;resuming=undefined;
  if(audio)void audio.close().catch(()=>{});
 }
 return {prepare,unlock,start,stop};
}
