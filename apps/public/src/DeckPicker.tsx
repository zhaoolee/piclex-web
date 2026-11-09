import {useEffect,useMemo,useRef,useState} from 'react';
import {onSubscriptionChange,listSubscriptions,updateSubscription} from './deck-subscriptions';
import {readPreference} from './storage';

export type DeckPickerChoice = {
 id:string;
 title:string;
 cover:string;
 hasCoverTitle?:boolean;
 wordCount:number;
 progressKeys:string[];
 readProgress?:()=>Promise<number>;
 subscribed?:boolean;
 update?:()=>Promise<string>;
 purchase?:{app:string;store:string};
};

export function savedDeckPosition(fingerprints:string[],count:number) {
 for(const fingerprint of fingerprints){
  for(const version of [2,1]){
   const key=version===2?'study.v2':'progress.v1';
   let state;
   try{state=JSON.parse(readPreference(`piclex-web.${key}.${fingerprint}`)||'null');}catch{continue;}
   if(state?.version!==version||state.fingerprint!==fingerprint)continue;
   return Number.isInteger(state.index)&&state.index>=0&&state.index<=count?state.index:0;
  }
 }
 return 0;
}

export default function DeckPicker({choices,loadPurchaseChoices,selectedID,position,select,notify}:{
 choices:DeckPickerChoice[];loadPurchaseChoices:(signal:AbortSignal)=>Promise<DeckPickerChoice[]>;selectedID:string;position:number;select:(id:string)=>void;notify:(message:string)=>void;
}){
 const [open,setOpen]=useState('');
 const [purchases,setPurchases]=useState<DeckPickerChoice[]>([]);
 const savedPositions=useMemo(()=>Object.fromEntries(choices.filter(item=>item.id!==selectedID)
  .map(item=>[item.id,savedDeckPosition(item.progressKeys,item.wordCount)])),[choices,selectedID]);
 useEffect(()=>{
  const controller=new AbortController();
  void loadPurchaseChoices(controller.signal).then(items=>{if(!controller.signal.aborted)setPurchases(items);}).catch(()=>{});
  return()=>controller.abort();
 },[loadPurchaseChoices]);
 const [activeSubscriptions,setActiveSubscriptions]=useState<Set<string>>(new Set());
 const [statuses,setStatuses]=useState<Record<string,string>>({});
 const [positions,setPositions]=useState<Record<string,number>>({});
 const [missingCovers,setMissingCovers]=useState<Set<string>>(new Set());
 const busy=useRef(new Set<string>());
 const activeItem=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  let cancelled=false;
  const refresh=()=>void listSubscriptions().then(records=>{
   if(!cancelled)setActiveSubscriptions(new Set(records.filter(r=>r.active).map(r=>r.id)));
  }).catch(()=>{});
  refresh();
  const unsubscribe=onSubscriptionChange(refresh);
  return()=>{cancelled=true;unsubscribe();};
 },[]);
 useEffect(()=>{
  let cancelled=false;
  void Promise.all(choices.filter(item=>item.id!==selectedID&&item.readProgress).map(async item=>{
   try{return [item.id,await item.readProgress!()] as const;}catch{return [item.id,0] as const;}
  })).then(entries=>{if(!cancelled)setPositions(Object.fromEntries(entries));});
  return()=>{cancelled=true;};
 },[choices,selectedID]);
 useEffect(()=>{
  if(!open)return;
  activeItem.current?.querySelector<HTMLElement>('.practice-deck-actions :is(button:not(:disabled),a)')?.focus({preventScroll:true});
  function dismiss(event:PointerEvent){if(!activeItem.current?.contains(event.target as Node))setOpen('');}
  document.addEventListener('pointerdown',dismiss);
  return()=>document.removeEventListener('pointerdown',dismiss);
 },[open]);
 function closeMenu(){
  trigger.current?.focus({preventScroll:true});
  setOpen('');
 }
 async function update(item:DeckPickerChoice){
  if(busy.current.has(item.id))return;
  busy.current.add(item.id);
  closeMenu();
  setStatuses(previous=>({...previous,[item.id]:'正在更新…'}));
  try{
   let message:string;
   if(item.update)message=await item.update();
   else{
    const result=await updateSubscription(item.id);
    message=result.status==='unchanged'?'已是最新版本':`已更新至 v${result.version}`;
   }
   setStatuses(previous=>({...previous,[item.id]:message}));
   if(item.id===selectedID&&message!=='已是最新版本')notify(message);
  }catch(error){
   const message=(error as Error).message;
   setStatuses(previous=>({...previous,[item.id]:message}));
  }finally{busy.current.delete(item.id);}
 }
 return <div className="practice-deck-list" role="group" aria-label="切换卡组">
  {[...choices,...purchases.filter(paid=>!choices.some(item=>item.id===paid.id))].map(item=>{
   const expanded=open===item.id;
   const index=item.id===selectedID?position:positions[item.id]??savedPositions[item.id]??0;
   const percent=item.wordCount>0?Math.round(100*Math.max(0,Math.min(1,index/item.wordCount))):0;
   const canUpdate=!!item.update||(item.subscribed&&activeSubscriptions.has(item.id));
   const coverFailed=missingCovers.has(item.cover);
   return <article className="practice-deck-item" key={item.id} ref={expanded?activeItem:null}
    onKeyDown={event=>{if(expanded&&event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();}}}>
    <button className="practice-deck-option" type="button" data-deck-id={item.id} aria-label={item.title} aria-pressed={item.id===selectedID}
     disabled={!!item.purchase} onClick={()=>select(item.id)}>
     <span className="practice-deck-cover" aria-hidden="true">
      <span className="practice-deck-placeholder">▧</span>
      {item.cover&&!coverFailed&&<img src={item.cover} alt="" loading="lazy"
       onError={()=>setMissingCovers(previous=>new Set(previous).add(item.cover))}/>}
      {(!item.hasCoverTitle||!item.cover||coverFailed)&&<span className="practice-deck-cover-title">{item.title}</span>}
      {item.id===selectedID&&<span className="deck-selection-mark">✓</span>}
     </span>
    </button>
    <div className="practice-deck-footer">
     <span className="practice-deck-percent" aria-label={`${item.title}学习进度 ${percent}%`}>{percent}%</span>
     <div className="practice-deck-more">
      <button type="button" ref={expanded?trigger:null} aria-label={`${item.title}的更多操作`} aria-expanded={expanded}
       onClick={()=>setOpen(expanded?'':item.id)}>⋯</button>
      {expanded&&<div className="practice-deck-actions" role="group" aria-label={`${item.title}的操作`}>
       {canUpdate&&<button type="button" disabled={busy.current.has(item.id)} onClick={()=>void update(item)}>更新卡组</button>}
       {item.purchase&&<><a href={item.purchase.app}>在 iOS App 中购买</a><a href={item.purchase.store} target="_blank" rel="noreferrer">获取 iOS App</a></>}
       {!canUpdate&&!item.purchase&&<span>暂无可用操作</span>}
      </div>}
     </div>
    </div>
    {statuses[item.id]&&<p className="practice-deck-status" role="status">{statuses[item.id]}</p>}
   </article>;
  })}
 </div>;
}
