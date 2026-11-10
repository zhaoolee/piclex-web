import {selectedSpeechVoice} from './speech-voice';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {AudioClip} from './NativePractice';
import {createPlaybackProgress} from './playback-progress';
import {createSpeechProgress} from './speech-progress.mjs';
type PlayRequest={texts:string[];rate:number;onEnd?:()=>void;offset:number;clip?:AudioClip;startFraction:number;automatic?:boolean};
type PreparedClip={clip:AudioClip;player:HTMLAudioElement;blobURL:string};
type PreloadedClip={clip:AudioClip;controller:AbortController;blob?:Blob};
const clipSource=(path:string)=>new URL(import.meta.env.BASE_URL+path,location.href).href;
const policyError=(error:unknown)=>error instanceof DOMException?error.name==='NotAllowedError':(error as {name?:string})?.name==='NotAllowedError';
export function useSpeech(notify:(s:string)=>void){
 const generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),media=useRef<HTMLAudioElement|null>(null);
 const prepared=useRef<PreparedClip|null>(null),preloaded=useRef<PreloadedClip|null>(null),speechPending=useRef(false);
 const blockedRequest=useRef<PlayRequest|null>(null),retrying=useRef(false),gestureRetry=useRef(false),confirmed=useRef(false);
 const startupTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [playing,setPlaying]=useState(false),[preparing,setPreparing]=useState(false),[position,setPosition]=useState(-1),[blocked,setBlocked]=useState(false);
 const mediaClock=useRef<ReturnType<typeof setInterval>|undefined>(undefined);
 const speechClock=useRef<ReturnType<typeof setInterval>|undefined>(undefined);
 const [error,setError]=useState('');
 const [progress]=useState(createPlaybackProgress);
 // Capture the media clock synchronously; timeupdate may lag a quick pause, sheet or rate change.
 const readProgress=useCallback(()=>{const player=media.current;return player&&Number.isFinite(player.duration)&&player.duration>0?Math.min(1,Math.max(0,player.currentTime/player.duration)):progress.getSnapshot().value;},[progress]);
 const clearMedia=useCallback(()=>{
  clearInterval(mediaClock.current);mediaClock.current=undefined;
  const current=media.current;media.current=null;
  if(current){current.onended=null;current.onerror=null;current.ontimeupdate=null;current.onplaying=null;current.onwaiting=null;current.onstalled=null;current.onloadedmetadata=null;current.pause();}
 },[]);
 const discardClip=useCallback(()=>{
  const saved=prepared.current;if(!saved)return;
  clearMedia();prepared.current=null;
  saved.player.removeAttribute('src');saved.player.load();
  if(saved.blobURL)URL.revokeObjectURL(saved.blobURL);
 },[clearMedia]);
 const clearPreload=useCallback(()=>{
  preloaded.current?.controller.abort();
  preloaded.current=null;
 },[]);
 const preloadClip=useCallback((clip?:AudioClip)=>{
  if(preloaded.current?.clip===clip)return;
  clearPreload();
  if(!clip?.path||document.hidden)return;
  const entry:PreloadedClip={clip,controller:new AbortController()};
  preloaded.current=entry;
  // Fetch the small recording explicitly. Media preload is a hint, and
  // a later media range request need not reuse the fetched HTTP response.
  void fetch(clipSource(clip.path),{signal:entry.controller.signal,priority:'low'}).then(async response=>{
   if(!response.ok)return;
   const blob=await response.blob();
   if(preloaded.current===entry&&blob.size===clip.byteCount)entry.blob=blob;
  }).catch(()=>{/* A missed preload still uses the normal media source. */});
 },[clearPreload]);
 const cancelPlayback=useCallback(()=>{
  // Invalidate callbacks before cancel(): a late onstart/onend must not revive
  // a request that was blocked or replaced.
  generation.current++;clearTimeout(startupTimer.current);clearTimeout(timer.current);clearInterval(speechClock.current);speechClock.current=undefined;clearMedia();
  if(speechPending.current){speechPending.current=false;window.speechSynthesis?.cancel();}
 },[clearMedia]);
 const finish=useCallback(()=>{
  cancelPlayback();blockedRequest.current=null;retrying.current=false;
  setPlaying(false);setPreparing(false);setPosition(-1);progress.update(0);
  // Blocked is a permission status, so an explicit stop keeps the icon while
  // discarding the now-stale request. The next gesture retries current content.
 },[cancelPlayback,progress]);
 const stopPlayback=useCallback(()=>{finish();discardClip();},[finish,discardClip]);
 const stop=useCallback(()=>{stopPlayback();clearPreload();},[stopPlayback,clearPreload]);
 const start=useCallback((next:PlayRequest)=>{
  cancelPlayback();
  setError('');const id=generation.current,queue=next.texts.filter(text=>text.trim());
  blockedRequest.current=next;retrying.current=true;gestureRetry.current=!!next.automatic;
  if(!confirmed.current)setBlocked(true);
  setPlaying(false);setPreparing(queue.length>0);setPosition(-1);progress.update(0);
  const valid=()=>id===generation.current&&!document.hidden;
  // Queue progress is weighted by text length. Original audio uses its media
  // clock; Web Speech interpolates its estimated position between real events.
  const total=queue.reduce((sum,text)=>sum+text.length,0);
  const update=(i:number,fraction:number,indeterminate=false,estimated=false,paused=false)=>{
   if(!valid())return;
   const before=queue.slice(0,i).reduce((sum,text)=>sum+text.length,0);
   const value=total?(before+(queue[i]?.length||0)*Math.min(1,Math.max(0,fraction)))/total:0;
   progress.update(Math.max(progress.getSnapshot().value,estimated?Math.min(.99,value):value),indeterminate,paused);
  };
  const fail=(message?:string)=>{if(!valid())return;stop();blockedRequest.current=null;retrying.current=false;setBlocked(!confirmed.current);if(message&&!next.automatic){setError(message);notify(message);}};
  // Autoplay policy retains only the segment that was actually denied. A clip
  // that already finished must not replay when the following TTS word blocks.
  const block=(i:number)=>{
   if(!valid())return;
   const pending={...next,texts:queue.slice(i),clip:i===0?next.clip:undefined,offset:i===0?next.offset:0,startFraction:i===0?next.startFraction:0};
   cancelPlayback();blockedRequest.current=pending;retrying.current=false;confirmed.current=false;
   setBlocked(true);setPlaying(false);setPreparing(false);setPosition(-1);progress.update(0);
  };
  const nextSegment=(i:number)=>{
   if(!valid())return;
   if(i===queue.length){finish();next.onEnd?.();return;}
   let finished=false;
   const current=()=>valid()&&!finished;
   const started=()=>{if(current()){clearTimeout(startupTimer.current);confirmed.current=true;gestureRetry.current=false;retrying.current=false;blockedRequest.current=null;setBlocked(false);setPreparing(false);setPlaying(true);}};
   const ended=(settle=0)=>{if(!current())return;finished=true;clearTimeout(startupTimer.current);clearInterval(speechClock.current);speechClock.current=undefined;update(i,1);setPosition(-1);timer.current=setTimeout(()=>nextSegment(i+1),i<queue.length-1?180:settle);};
   // Some engines accept speak()/play() without start or error. Preserve a
   // retryable current segment and leave preparation instead of hanging forever.
   startupTimer.current=setTimeout(()=>{
    if(!current())return;
    block(i);
    if(!next.automatic){const message='音频未能开始，请点击喇叭重试。';setError(message);notify(message);}
   },i===0&&next.clip?12000:4000);
   // Original audio belongs to this sentence occurrence only; the following word uses TTS.
   if(i===0&&next.clip){
    try{
     // Keep just the latest recording attached so replay can seek in its
     // loaded media instead of rebuilding the source and fetching it again.
     if(prepared.current?.clip!==next.clip||prepared.current.player.error){
      discardClip();
      const cached=preloaded.current?.clip===next.clip?preloaded.current:null;
      if(cached)clearPreload();
      let blobURL='';
      if(cached?.blob)blobURL=URL.createObjectURL(cached.blob);
      else if(next.clip.dataBase64){const bytes=Uint8Array.from(atob(next.clip.dataBase64),c=>c.charCodeAt(0));blobURL=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));}
      const source=blobURL||(next.clip.path?clipSource(next.clip.path):'');
      if(!source){fail('这张卡片的原音频暂时无法播放。');return;}
      try{prepared.current={clip:next.clip,player:new Audio(source),blobURL};}
      catch(error){if(blobURL)URL.revokeObjectURL(blobURL);throw error;}
     }
     const player=prepared.current.player;media.current=player;player.playbackRate=next.rate;player.preservesPitch=true;
     const failed=()=>{if(current()&&media.current===player){discardClip();fail('原音频播放失败，请检查网络并再次点击播放。');}};
     let observedTime=0;
     const time=()=>{if(media.current!==player||!current())return;
      // Some media backends omit/reorder playing after a seek. A moving decoded
      // media clock is also evidence of playback; metadata/seek alone is not.
      if(player.currentTime>observedTime&&!player.paused&&!player.seeking&&player.readyState>=2)started();
      observedTime=player.currentTime;update(i,Number.isFinite(player.duration)&&player.duration>0?player.currentTime/player.duration:0,!Number.isFinite(player.duration)||player.duration<=0);
     };
     player.onplaying=()=>{if(media.current===player){started();time();}};
     player.onwaiting=player.onstalled=()=>{if(valid()&&media.current===player&&player.readyState<3)setPreparing(true);};
     const seek=()=>{if(!current()||media.current!==player)return;if(Number.isFinite(player.duration)&&player.duration>0)player.currentTime=player.duration*Math.min(.999,Math.max(0,next.startFraction));time();};
     if(player.readyState>=1)seek();else player.onloadedmetadata=seek;
     player.ontimeupdate=time;player.onerror=failed;
     // Like App, sample the actual audio clock; a stall cannot advance the fill.
     mediaClock.current=setInterval(time,33);
     player.onended=()=>{if(!valid()||media.current!==player)return;clearMedia();ended();};
     void player.play().then(()=>{if(media.current===player&&current()&&!player.paused)started();}).catch(error=>{if(!current()||media.current!==player)return;if(policyError(error))block(0);else failed();});
    }catch(error){if(policyError(error))block(0);else{discardClip();fail('这张卡片的原音频暂时无法播放。');}}
    return;
   }
   if(!window.speechSynthesis){fail('此浏览器没有提供英文朗读功能。');return;}
   try{
    const utterance=new SpeechSynthesisUtterance(queue[i]);utterance.lang='en-US';utterance.rate=next.rate;
    const voice=selectedSpeechVoice();if(voice)utterance.voice=voice;
    let clock:ReturnType<typeof createSpeechProgress>|undefined,paused=false;
    const sample=()=>{
     if(!current()||!clock)return;
     const now=performance.now(),frozen=paused||!!speechSynthesis.paused;
     clock.setPaused(frozen,now);
     update(i,clock.sample(now),false,true,frozen);
    };
    const begin=()=>{
     if(!current()||clock)return;
     started();clock=createSpeechProgress(queue[i],next.rate);update(i,0);
     speechClock.current=setInterval(sample,33);
    };
    utterance.onstart=begin;
    utterance.onboundary=e=>{if(current()){begin();clock?.boundary(e.charIndex,performance.now());if(i===0)setPosition(e.charIndex+next.offset);}};
    utterance.onpause=()=>{paused=true;sample();};
    utterance.onresume=()=>{paused=false;sample();};
    // Let the short completion animation finish before hiding the button's
    // fill. The next segment still starts after the established 180 ms gap.
    utterance.onend=()=>{if(!current())return;speechPending.current=false;ended(180);};
    utterance.onerror=e=>{if(!current())return;speechPending.current=false;if(e.error==='not-allowed')block(i);else fail(['interrupted','canceled'].includes(e.error)?undefined:'朗读暂时不可用，请检查浏览器的语音与播放权限。');};
    speechPending.current=true;
    speechSynthesis.speak(utterance);
   }catch{fail('朗读暂时不可用，请检查浏览器的语音与播放权限。');}
  };
  nextSegment(0);
 },[cancelPlayback,stop,finish,clearMedia,discardClip,clearPreload,notify,progress]);
 const play=useCallback((texts:string[],rate=1,onEnd?:()=>void,offset=0,clip?:AudioClip,startFraction=0,automatic=false)=>{
  start({texts:[...texts],rate,onEnd,offset,clip,startFraction,automatic});
 },[start]);
 const retryBlocked=useCallback(()=>{
  const pending=blockedRequest.current;if(!pending)return false;
  if(retrying.current&&!gestureRetry.current)return true;
  gestureRetry.current=false;
  start({...pending,automatic:false});return true;
 },[start]);
 const clearError=useCallback(()=>setError(''),[]);
 const acknowledgeGesture=useCallback(()=>{/* A gesture alone is not evidence of playback permission. */},[]);
 useEffect(()=>{const hide=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',stop);return ()=>{stop();document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',stop);};},[stop]);
 return {blocked,error,clearError,playing,preparing,position,progress,readProgress,play,retryBlocked,acknowledgeGesture,stopPlayback,stop,preloadClip};
}
