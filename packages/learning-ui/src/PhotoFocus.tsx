import { useEffect, useMemo, useRef, useState } from 'react';
import {flushSync} from 'react-dom';
import { focusLayout, visibleFocusBox, visibleFocusStyle } from './focus.mjs';
import {PhotoCache,type CachedPhoto} from './photo-cache';
import LoadProgress,{type DownloadProgress} from './LoadProgress';
export type Focus = { visible: boolean; box: number[] } | null;
/** Keep the card's dimensions while downloading and decoding its current photo. */
export function PhotoFocus({ src, focus, alt, active = true,fit='focus',retry=0,cache,onLoadState,onImageReady }: { src: string; cache?:PhotoCache; focus: Focus; alt: string; active?: boolean;fit?:'focus'|'contain';retry?:number;onImageReady?:(image:HTMLImageElement)=>void;onLoadState?:(state:'loading'|'ready'|'error')=>void }) {
 const host=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:0,height:0});
 const localCache=useMemo(()=>new PhotoCache(),[]),photos=cache||localCache;
 const [photo,setPhoto]=useState<CachedPhoto>();
 const [transfer,setTransfer]=useState<{source:string;progress:DownloadProgress;decoding:boolean}>();
 const [broken,setBroken]=useState('');
 useEffect(()=>{
  let cancelled=false;setBroken('');setPhoto(photos.peek(src));
  if(!photos.peek(src))onLoadState?.('loading');
  const request=photos.acquire(src,value=>{if(!cancelled)setTransfer({source:src,...value});});
  void request.promise.then(value=>{if(!cancelled){setPhoto(value);onImageReady?.(value.image);onLoadState?.('ready');}},()=>{if(!cancelled){setBroken(src);onLoadState?.('error');}});
  return()=>{cancelled=true;request.release();};
 },[src,retry,photos,onLoadState,onImageReady]);
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;flushSync(()=>setSize(current=>current.width===width&&current.height===height?current:{width,height}));});if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
 const current=photos.peek(src)||(photo?.source===src?photo:undefined),layout=current&&focusLayout(current,size,focus,fit),target=visibleFocusBox(layout?.box,size);
 return <div className={`photo-focus ${active?'':'effects-paused'}`} ref={host} data-fit={fit} aria-busy={!current&&broken!==src}>
  {current&&<img key={current.src} src={current.src} alt={alt} className="focus-image" style={layout?{left:layout.image.x,top:layout.image.y,width:layout.image.width,height:layout.image.height}:undefined}/>}
  {broken===src?<p className="image-error">图片加载失败，点击重试</p>:!current&&<div className="photo-loading"><LoadProgress label="正在加载图片" progress={transfer?.source===src?transfer.progress:null} finishing={transfer?.source===src&&transfer.decoding}/></div>}
  {current&&target&&<span className="focus-box" aria-hidden="true" style={{...visibleFocusStyle(target,size),boxSizing:'border-box'}}><span className="focus-ring"/></span>}
 </div>;
}
