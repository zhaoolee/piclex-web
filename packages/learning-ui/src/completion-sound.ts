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
  loading??=fetch(soundURL).then(async response=>{
   if(!response.ok)throw Error('Completion audio unavailable');
   buffer=await new OfflineAudioContext(1,1,48000).decodeAudioData(await response.arrayBuffer());
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
 function start(onStart:()=>void){
  const audio=context,deadline=performance.now()+MAX_FEEDBACK_WAIT_MS;
  let pending=true,frame=0,timer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>{pending=false;clearTimeout(timer);cancelAnimationFrame(frame);};
  const show=(withSound:boolean)=>{
   if(!pending)return;
   pending=false;clearTimeout(timer);
   if(document.hidden)return;
   onStart();
   if(withSound&&audio)frame=requestAnimationFrame(()=>{
    // Use the first rendering opportunity for the gold and particle effects,
    // so a delayed frame does not play the audio before the feedback appears.
    if(document.hidden||audio!==context||audio.state!=='running'||!buffer)return;
    try{
     const cue=audio.createBufferSource();cue.buffer=buffer;cue.connect(audio.destination);
     cue.onended=()=>cue.disconnect();cue.start();
    }catch{/* Completion can still show while audio is unavailable. */}
   });
  };
  if(!audio||audio.state==='running'&&buffer)show(true);
  else{
   // If playback is blocked or the file arrives late, show the feedback
   // promptly and discard the stale cue rather than ringing on the next item.
   timer=setTimeout(()=>show(false),MAX_FEEDBACK_WAIT_MS);
   void Promise.all([prepare(),resuming]).then(()=>show(performance.now()<=deadline));
  }
  return cancel;
 }
 function stop(){
  const audio=context;context=undefined;resuming=undefined;
  if(audio)void audio.close().catch(()=>{});
 }
 return {prepare,unlock,start,stop};
}
