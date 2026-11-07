import './deck-subscriptions.css';
import {listSubscriptions,subscriptionDeckID,cancelSubscription,resumeSubscription,type DeckSubscriptionRecord} from './deck-subscriptions';
import {useEffect,useRef,useState} from 'react';
import {downloadBytes} from '../../../packages/learning-ui/src/download.mjs';
import LoadProgress,{type DownloadProgress} from '../../../packages/learning-ui/src/LoadProgress';
import {MAX_PACKAGE_BYTES,sha256} from '../../../packages/deck-format/src/archive.mjs';
import {parseDeckSource,type SourceDeck,deckURL} from './deck-source';
import Dialog from './Dialog';

type Props={close:()=>void;installed:{id:string;fingerprint?:string}[];save:(bytes:Uint8Array,signal:AbortSignal,source?:{url:string;feed:SourceDeck})=>Promise<void>};
export default function DeckDownload({close,installed,save}:Props){
 const [url,setURL]=useState(''),[entries,setEntries]=useState<SourceDeck[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState<DownloadProgress|null>(null);
 const [subscriptions,setSubscriptions]=useState<DeckSubscriptionRecord[]>([]),[confirming,setConfirming]=useState<DeckSubscriptionRecord|null>(null),[subscriptionError,setSubscriptionError]=useState(''),[changingSubscription,setChangingSubscription]=useState(false);
 useEffect(()=>{void listSubscriptions().then(setSubscriptions).catch(()=>setSubscriptionError('订阅记录暂时无法读取，已下载卡组仍然保留。'));},[]);
 async function unsubscribe(){if(!confirming||busy||changingSubscription)return;setChangingSubscription(true);try{await cancelSubscription(confirming.id);setSubscriptions(await listSubscriptions());setConfirming(null);setSubscriptionError('');}catch(e){setSubscriptionError((e as Error).message);}finally{setChangingSubscription(false);}}
 async function restore(record:DeckSubscriptionRecord){if(busy||changingSubscription)return;setChangingSubscription(true);try{await resumeSubscription(record.id);setSubscriptions(await listSubscriptions());setError('');}catch(e){setError((e as Error).message);}finally{setChangingSubscription(false);}}
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 function cancel(){request.current?.abort();close();}
 async function run(entry?:SourceDeck){
  if(busy||changingSubscription)return;const c=new AbortController();request.current=c;setBusy(true);setError('');setProgress(null);
  try{
   const address=entry?.packageURL||deckURL(url);
   const {bytes}=await downloadBytes(address,{signal:c.signal,maxBytes:MAX_PACKAGE_BYTES,onProgress:setProgress,fetcher:(input,init)=>fetch(input,{...init,credentials:'omit',referrerPolicy:'no-referrer'})});
   c.signal.throwIfAborted();
   if(!entry&&bytes[0]!==0x50){
    if(bytes.length>2*1024*1024)throw Error('卡组来源文件过大。');
    const values=parseDeckSource(bytes,address);setEntries(values);return;
   }
   if(entry&&(bytes.length!==entry.packageBytes||await sha256(bytes)!==entry.packageSHA256))throw Error('卡组校验失败，原有卡组未改动。');
   c.signal.throwIfAborted();await save(bytes,c.signal,entry?{url:deckURL(url),feed:entry}:undefined);if(!c.signal.aborted)close();
  }catch(e){if(!c.signal.aborted)setError(e instanceof TypeError?'无法下载这个链接，请检查地址或改为导入卡组文件。':(e as Error).message);}
  finally{if(!c.signal.aborted){setBusy(false);setProgress(null);}}
 }
 let valid=false;try{deckURL(url);valid=true;}catch{}
 return <Dialog title="下载第三方卡组" close={cancel}><form className="deck-download-form" onSubmit={e=>{e.preventDefault();void run();}}><input autoFocus aria-label="粘贴卡组 URL" placeholder="粘贴卡组 URL" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url} disabled={busy||changingSubscription} onChange={e=>{setURL(e.target.value);setEntries(null);setError('');}}/><button className="settings-row" type="submit" disabled={!valid||busy||changingSubscription}>下载卡组 <span aria-hidden="true">↓</span></button></form>{busy&&<><LoadProgress label="正在下载卡组" progress={progress}/><button className="text-button" onClick={()=>{request.current?.abort();setBusy(false);setProgress(null);}}>取消下载</button></>}{error&&<p role="alert">{error}</p>}{entries&&<section><h3>选择卡组</h3>{entries.map(entry=>{const record=subscriptions.find(r=>r.id===subscriptionDeckID(url,entry.deckID)),exists=installed.some(c=>c.fingerprint===entry.packageSHA256)||!!record&&record.version>=entry.version&&record.packageSHA256===entry.packageSHA256;return <button className="settings-row" key={entry.deckID} disabled={busy||changingSubscription||(exists&&record?.active!==false)||entry.access!=='public'} onClick={()=>{if(record&&!record.active)void restore(record);else void run(entry);}}><span>{entry.title}</span><small>{record&&!record.active?'恢复订阅':exists?'已下载':entry.access==='public'?'下载':'需在 App 中购买'}</small></button>;})}{!entries.length&&<p>这个来源暂时没有卡组。</p>}</section>}
 <details className="deck-subscriptions"><summary>已订阅卡组 <span>{subscriptions.filter(s=>s.active).length}</span></summary>
 {subscriptions.filter(s=>s.active).map(record=><SubscriptionRow key={record.id} record={record} disabled={busy||changingSubscription} unsubscribe={()=>{setSubscriptionError('');setConfirming(record);}}/>)}
 {!subscriptions.some(s=>s.active)&&<p className="subscription-empty">暂无订阅</p>}
 </details>
 {subscriptionError&&!confirming&&<p role="alert">{subscriptionError}</p>}
 {confirming&&<Dialog title="取消订阅？" close={()=>setConfirming(null)}><p className="subscription-confirm-name">{confirming.title}</p><p className="subscription-confirm-message">取消后将从已订阅列表移除，已下载卡片和学习记录会保留。</p>{subscriptionError&&<p role="alert">{subscriptionError}</p>}<div className="subscription-confirm-actions"><button onClick={()=>setConfirming(null)}>保留订阅</button><button className="subscription-destructive" disabled={busy||changingSubscription} onClick={()=>void unsubscribe()}>取消订阅</button></div></Dialog>}
 </Dialog>;
}

function SubscriptionRow({record,disabled,unsubscribe}:{record:DeckSubscriptionRecord;disabled:boolean;unsubscribe:()=>void}){
 const [expanded,setExpanded]=useState(false),[copied,setCopied]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(timer);},[copied]);
 async function copy(){try{await navigator.clipboard.writeText(record.sourceURL);setCopied(true);setError('');}catch{setExpanded(true);setError('无法自动复制，请长按或选中链接复制。');}}
 return <article className="subscription-row" aria-label={record.title}>
 <strong>{record.title}</strong>
 <div className="subscription-actions"><button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>订阅链接 <svg viewBox="0 0 16 16" aria-hidden="true" className={expanded?'expanded':''}><path d="m4 6 4 4 4-4"/></svg></button>
 <button className="subscription-copy" aria-label={`复制${record.title}的订阅链接`} onClick={()=>void copy()}><span><svg viewBox="0 0 20 20" aria-hidden="true">{copied?<path d="m4 10 4 4 8-8"/>:<><rect x="7" y="7" width="10" height="11" rx="2"/><path d="M12 4V3a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v8a1 1 0 0 0 1 1h1"/></>}</svg>{copied?'已复制':'复制'}</span></button>
 <button className="subscription-destructive" disabled={disabled} onClick={()=>void unsubscribe()}>取消订阅</button></div>
 {expanded&&<p className="subscription-url">{record.sourceURL}</p>}{copied&&<span className="subscription-announcement" role="status">已复制订阅链接</span>}{error&&<p role="alert">{error}</p>}
 </article>;
}
