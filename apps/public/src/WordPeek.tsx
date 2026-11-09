import {createPortal} from 'react-dom';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {lookupWordDefinition,normalizeDefinitionWord} from './word-definitions';

export type WordPeekAnchor={left:number;top:number;right:number;bottom:number};
type InternalPeek={id:number;word:string;anchor:WordPeekAnchor;status:'loading'|'found'|'missing'|'error';meaning:string};
export type WordPeekState=Omit<InternalPeek,'id'>;
type PeekTarget={word:string;anchor:WordPeekAnchor;meaning?:string};
type PointerOrigin={pointerId:number;clientX:number;clientY:number};

/** Own one tooltip request at a time; dismissal invalidates late fetch results. */
export function useWordPeek(resetKey?:unknown,active=true){
 const [peek,setPeek]=useState<InternalPeek|null>(null);
 const request=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const pointer=useRef<PointerOrigin|null>(null),mounted=useRef(false),enabled=useRef(active),held=useRef(false);enabled.current=active;
 const cancel=useCallback(()=>{clearTimeout(timer.current);timer.current=undefined;pointer.current=null;request.current++;setPeek(null);},[]);
 const show=useCallback((word:string,anchor:WordPeekAnchor,preferredMeaning?:string)=>{
  const key=normalizeDefinitionWord(word);
  if(!key||!enabled.current||!mounted.current||document.hidden)return;
  const id=++request.current,display=word.replace(/[’‘ʼ＇]/g,"'").trim()||key;
  if(preferredMeaning?.trim()){setPeek({id,word:display,anchor,status:'found',meaning:preferredMeaning.trim()});return;}
  setPeek({id,word:display,anchor,status:'loading',meaning:''});
  lookupWordDefinition(key).then(result=>{
   if(!mounted.current||request.current!==id)return;
   setPeek(current=>{
    if(!current||current.id!==id)return current;
    return {...current,status:result.state,meaning:result.state==='found'?result.meaning:''};
   });
  });
 },[]);
 const begin=useCallback((target:()=>PeekTarget|null,origin?:PointerOrigin)=>{
  cancel();held.current=false;if(!enabled.current)return;
  pointer.current=origin?{pointerId:origin.pointerId,clientX:origin.clientX,clientY:origin.clientY}:null;
  const version=request.current;
  const editor=document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLTextAreaElement?document.activeElement:null;
  const selection=editor?{start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection}:null;
  timer.current=setTimeout(()=>{
   timer.current=undefined;
   if(!mounted.current||version!==request.current||!enabled.current||document.hidden)return;
   const result=target();if(!result)return;
   // A short tap keeps normal caret behavior. Only a completed hold restores
   // the previous editor, so looking at another word cannot redirect typing.
   if(editor?.isConnected&&selection){editor.focus({preventScroll:true});editor.setSelectionRange(selection.start,selection.end,selection.direction||undefined);}
   held.current=true;show(result.word,result.anchor,result.meaning);
  },400);
 },[cancel,show]);
 const hover=useCallback((target:()=>PeekTarget|null,event:{pointerType:string;buttons:number})=>{
  if(event.pointerType!=='mouse'||event.buttons||!enabled.current||!matchMedia('(any-hover: hover)').matches)return;
  clearTimeout(timer.current);
  timer.current=setTimeout(()=>{
   timer.current=undefined;
   const result=target();
   if(result)show(result.word,result.anchor,result.meaning);
   else cancel();
  },150);
 },[cancel,show]);
 useLayoutEffect(()=>{mounted.current=true;cancel();return()=>{mounted.current=false;cancel();};},[resetKey,active,cancel]);
 useEffect(()=>{
  const close=()=>cancel(),visibility=()=>{if(document.hidden)close();};
  // WebKit scrolls an input internally while moving its caret/focus. The guided
  // word's anchor does not move, so that event must not cancel a deliberate hold.
  const scroll=(event:Event)=>{if(event.target instanceof HTMLInputElement&&event.target.closest('.guided-word'))return;close();};
  const move=(event:PointerEvent)=>{const start=pointer.current;if(start&&event.pointerId===start.pointerId&&Math.hypot(event.clientX-start.clientX,event.clientY-start.clientY)>8)close();};
  window.addEventListener('pointerup',close);
  window.addEventListener('pointercancel',close);
  window.addEventListener('pointermove',move);
  window.addEventListener('scroll',scroll,true);
  window.addEventListener('resize',close);
  window.addEventListener('blur',close);
  document.addEventListener('visibilitychange',visibility);
  window.visualViewport?.addEventListener('resize',close);window.visualViewport?.addEventListener('scroll',close);
  return ()=>{
   window.removeEventListener('pointerup',close);
   window.removeEventListener('pointercancel',close);
   window.removeEventListener('pointermove',move);
   window.removeEventListener('scroll',scroll,true);
   window.removeEventListener('resize',close);
   window.removeEventListener('blur',close);
   document.removeEventListener('visibilitychange',visibility);
   window.visualViewport?.removeEventListener('resize',close);window.visualViewport?.removeEventListener('scroll',close);
  };
 },[cancel]);
 const consumeClick=(event:{preventDefault:()=>void;stopPropagation:()=>void})=>{if(held.current){held.current=false;event.preventDefault();event.stopPropagation();}};
 return {peek:peek as WordPeekState|null,begin,hover,cancel,consumeClick};
}

/** A body portal keeps the tooltip outside the scrolling sentence panel. */
export function WordPeekTooltip({peek}:{peek:WordPeekState|null}){
 const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState<{left:number;top:number;placement:'above'|'below'}|null>(null);
 const anchorKey=peek?`${peek.anchor.left}:${peek.anchor.top}:${peek.anchor.right}:${peek.anchor.bottom}`:'';
 useLayoutEffect(()=>{setPosition(null);},[anchorKey,peek?.word]);
 useLayoutEffect(()=>{
  if(!peek||!ref.current)return;
  const box=ref.current.getBoundingClientRect(),margin=8,center=(peek.anchor.left+peek.anchor.right)/2;
  const left=Math.min(Math.max(margin,center-box.width/2),Math.max(margin,innerWidth-box.width-margin));
  let top=peek.anchor.top-box.height-8,placement:'above'|'below'='above';
  if(top<margin){top=peek.anchor.bottom+8;placement='below';}
  if(top+box.height>innerHeight-margin)top=Math.max(margin,innerHeight-box.height-margin);
  setPosition({left,top,placement});
 },[peek?.status,peek?.meaning,peek?.word,anchorKey]);
 if(!peek)return null;
 const meaning=peek.status==='loading'?'查询中…':peek.status==='found'?peek.meaning:peek.status==='error'?'释义暂不可用':'暂无释义';
 return createPortal(<div ref={ref} className="word-peek" role="tooltip" data-placement={position?.placement||'above'} style={position?{left:position.left,top:position.top}:{left:0,top:0,visibility:'hidden'}}><strong className="word-peek-english">{peek.word}</strong><span className="word-peek-meaning">{meaning}</span></div>,document.body);
}

/** Textarea contents are not DOM text nodes in WebKit. Measure a temporary
 * typography-identical mirror instead of guessing from the old caret position. */
export function wordTargetAtPoint(field:HTMLInputElement|HTMLTextAreaElement,x:number,y:number){
 const bounds=field.getBoundingClientRect();
 if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return null;
 const style=getComputedStyle(field),mirror=document.createElement('div');
 for(const property of ['font-family','font-size','font-weight','font-style','font-variant','font-stretch','line-height','letter-spacing','word-spacing','text-align','text-indent','text-transform','tab-size','padding-top','padding-right','padding-bottom','padding-left','word-break'])mirror.style.setProperty(property,style.getPropertyValue(property));
 Object.assign(mirror.style,{position:'fixed',left:`${bounds.left+field.clientLeft-field.scrollLeft}px`,top:`${bounds.top+field.clientTop-field.scrollTop}px`,width:`${field.clientWidth}px`,boxSizing:'border-box',margin:'0',border:'0',whiteSpace:field instanceof HTMLTextAreaElement?'pre-wrap':'pre',overflowWrap:'break-word',visibility:'hidden',pointerEvents:'none'});
 const node=document.createTextNode(field.value);mirror.append(node);document.body.append(mirror);
 try{
  const words=[...field.value.matchAll(/[\p{L}\p{N}]+(?:['’‘][\p{L}\p{N}]+)*/gu)];
  for(const [index,word] of words.entries()){
   const range=document.createRange();range.setStart(node,word.index!);range.setEnd(node,word.index!+word[0].length);
   for(const rect of range.getClientRects())if(x>=rect.left-2&&x<=rect.right+2&&y>=rect.top-2&&y<=rect.bottom+2)return {index,anchor:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}};
  }
  return null;
 }finally{mirror.remove();}
}
