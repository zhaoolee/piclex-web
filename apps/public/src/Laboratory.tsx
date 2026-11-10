import {useEffect,useRef,useState,type CSSProperties} from 'react';
import bootMaze from './boot-maze.svg?raw';
import './boot-maze.css';
import {labLoadFraction} from './lab-progress';
import type {PracticeDeck} from './NativePractice';
type Loading={state:'loading'|'ready'|'error';message:string;loaded?:number;total?:number};
const initial:Loading={state:'loading',message:'正在加载游戏页面…'};
export function LabPacMan({progress}:{progress?:number}){
 const measured=progress!==undefined;
 return <div className="boot-game" data-measured={measured?'':undefined}
  style={measured?{'--boot-progress':progress} as CSSProperties:undefined}
  aria-hidden="true" dangerouslySetInnerHTML={{__html:bootMaze}}/>;
}
export default function Laboratory({deck,exit,returnLabel='返回实验室'}:{deck:PracticeDeck;returnLabel?:string;exit:(hash?:string)=>void}){
 const frame=useRef<HTMLIFrameElement>(null),ready=useRef(false),exitRef=useRef(exit);
 const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState<Loading>(initial);exitRef.current=exit;
 useEffect(()=>{
  let destination:string|undefined;ready.current=false;setLoading(initial);
  const timeout=setTimeout(()=>setLoading(current=>current.state==='loading'?{state:'error',message:'游戏加载超时，请检查网络后重试。'}:current),190000);
  function leave(e:Event){destination=(e as CustomEvent).detail;if(!ready.current){exitRef.current(destination);return;}frame.current?.contentWindow?.postMessage({type:'piclex-lab-leave'},location.origin);}
  function receive(e:MessageEvent){
   if(e.origin!==location.origin||e.source!==frame.current?.contentWindow)return;
   if(e.data?.type==='piclex-lab-ready')frame.current?.contentWindow?.postMessage({type:'piclex-lab-words',words:deck.words.map(w=>({english:w.english,chinese:w.chinese,example:w.example,exampleChinese:w.exampleChinese,pronunciation:w.phonetic,photo:deck.images[w.imageIndex],focus:w.focus}))},location.origin);
   if(e.data?.type==='piclex-lab-status'&&['loading','ready','error'].includes(e.data.state)){
    const status=e.data;ready.current=status.state==='ready';
    setLoading({state:status.state,message:String(status.message||''),loaded:status.loaded,total:status.total});
    if(status.state!=='loading')clearTimeout(timeout);
   }
   if(e.data?.type==='piclex-lab-exit')exitRef.current(destination);
  }
  window.addEventListener('message',receive);window.addEventListener('piclex-game-leave',leave);
  return()=>{clearTimeout(timeout);window.removeEventListener('message',receive);window.removeEventListener('piclex-game-leave',leave);};
 },[deck,attempt]);
 const progress=labLoadFraction(loading.loaded,loading.total);
 // Each measured phase starts a fresh paused route.
 const mazePhase=progress===undefined?undefined:loading.message;
 return <section className="laboratory-page">
  <iframe key={attempt} ref={frame} title="薯薯求生" src={`${import.meta.env.BASE_URL}lab/index.html?attempt=${attempt}`} allow="autoplay; fullscreen" style={{visibility:loading.state==='ready'?'visible':'hidden'}}/>
  {loading.state!=='ready'&&<div className="lab-loading" role={loading.state==='error'?'alert':'status'}><h1>薯薯求生</h1>{loading.state==='loading'&&<LabPacMan key={mazePhase} progress={progress}/>}<p>{loading.message}</p>{loading.state==='loading'&&<><progress aria-label="游戏加载进度" max={loading.total||1} value={loading.total?loading.loaded:undefined}/>{progress!==undefined&&<p>{Math.floor(progress*100)}%</p>}</>}{loading.state==='error'&&<button className="primary" onClick={()=>{ready.current=false;setLoading(initial);setAttempt(n=>n+1);}}>重新加载游戏</button>}<button className="text-button" onClick={()=>exitRef.current()}>{returnLabel}</button></div>}
 </section>;
}
