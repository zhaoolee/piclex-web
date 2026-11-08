import {useEffect,useRef,useState} from 'react';
export function useDesktopKeyboard(minWidth?:number){
 const media=`(hover: hover) and (pointer: fine)${minWidth?` and (min-width: ${minWidth}px)`:''}`;
 const [enabled,setEnabled]=useState(()=>matchMedia(media).matches);
 useEffect(()=>{const query=matchMedia(media);const update=()=>setEnabled(query.matches);update();query.addEventListener('change',update);return()=>{query.removeEventListener('change',update);};},[media]);return enabled;
}
export default function VirtualKeyboard({active,press,lettersOnly=false}:{active:boolean;press:(key:string)=>void;lettersOnly?:boolean}){
 const [pressed,setPressed]=useState<Set<string>>(new Set()),[symbols,setSymbols]=useState(false),[shift,setShift]=useState(false),timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const touchPress=useRef<{key:string;time:number}|null>(null);
 const normal=(key:string)=>key.length===1?key.toLowerCase():key;
 const down=(key:string)=>{key=normal(key);clearTimeout(timers.current.get(key));setPressed(previous=>new Set(previous).add(key));};
 const up=(key:string)=>{key=normal(key);clearTimeout(timers.current.get(key));timers.current.set(key,setTimeout(()=>{setPressed(previous=>{const next=new Set(previous);next.delete(key);return next;});timers.current.delete(key);},100));};
 useEffect(()=>{const clear=()=>{for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();setPressed(new Set());};
  const keyDown=(event:KeyboardEvent)=>{if(!active||event.isComposing||event.metaKey||event.ctrlKey||event.altKey||!(event.target as HTMLElement)?.closest('.native-practice input,.native-practice textarea'))return;down(event.key);};
  const keyUp=(event:KeyboardEvent)=>up(event.key);
  document.addEventListener('keydown',keyDown);document.addEventListener('keyup',keyUp);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);if(!active)clear();
  return()=>{document.removeEventListener('keydown',keyDown);document.removeEventListener('keyup',keyUp);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();};
 },[active]);
 const labels:Record<string,string>={'Backspace':'退格','Enter':'回车','Escape':'Escape 键',' ':'空格','Shift':'大写','123':'数字和符号','ABC':'字母键盘'};
 const label=(key:string)=>labels[key]||`按键 ${key.toUpperCase()}`;
 const activate=(value:string)=>{down(value);up(value);if(value==='Shift')setShift(v=>!v);else if(value==='123'||value==='ABC')setSymbols(v=>!v);else{press(!lettersOnly&&shift&&value.length===1?value.toUpperCase():value);if(shift)setShift(false);}};
 const key=(value:string,text=value,wide='')=><button key={value} type="button" className={`virtual-key ${wide}`} aria-label={label(value)} data-key={value} data-pressed={pressed.has(normal(value))||value==='Shift'&&shift} disabled={!active} onPointerDown={event=>{event.preventDefault();down(value);}} onPointerUp={event=>{up(value);if(event.pointerType==='touch'||event.pointerType==='pen'){event.preventDefault();if(event.currentTarget.contains(document.elementFromPoint(event.clientX,event.clientY))){touchPress.current={key:value,time:performance.now()};activate(value);}}}} onPointerCancel={()=>up(value)} onClick={event=>{const previous=touchPress.current;touchPress.current=null;if(event.detail!==0&&previous?.key===value&&performance.now()-previous.time<800)return;activate(value);}}>{text}</button>;
 if(lettersOnly)return <section className="virtual-keyboard" aria-label="虚拟键盘" data-layout="letters">{["qwertyuiop","asdfghjkl","zxcvbnm"].map((row,index)=><div key={row} className={`virtual-key-row ${index===1?"keyboard-middle":index===2?"keyboard-bottom":""}`}>{row.split('').map(c=>key(c))}{index===2&&key('Backspace','⌫','key-wide')}</div>)}</section>;
 return <section className="virtual-keyboard" aria-label="虚拟键盘"><div className="virtual-key-row">{(symbols?'1234567890':'qwertyuiop').split('').map(c=>key(c,shift?c.toUpperCase():c))}</div><div className="virtual-key-row keyboard-middle">{(symbols?'@#$&*()-':'asdfghjkl').split('').map(c=>key(c,shift?c.toUpperCase():c))}</div><div className="virtual-key-row">{key('Shift','⇧','key-wide')}{(symbols?".,?!':;":'zxcvbnm').split('').map(c=>key(c,shift?c.toUpperCase():c))}{key('Backspace','⌫','key-wide')}</div><div className="virtual-key-row">{key(symbols?'ABC':'123',symbols?'ABC':'123','key-wide')}{key('Escape','Esc','key-wide')}{key(' ','空格','key-space')}{key('Enter','↵','key-wide')}</div></section>;
}
