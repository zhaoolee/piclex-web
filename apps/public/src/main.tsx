import {installSubscription,onSubscriptionChange} from './deck-subscriptions';
import {savedDeckPosition,type DeckPickerChoice} from './DeckPicker';
import type {SourceDeck} from './deck-source';
import {defaultCaptureID,defaultCaptureTitle,isDefaultCapture,groupCapturedDecks} from '../../../packages/practice/src/capture-group.mjs';
import {readPhotos} from '../../../packages/backup/src/photos.mjs';
import {startProgressSync} from './progress-sync';
startProgressSync();
import {backupPhotoDeck,thumbnail} from './backup-photo-deck';
import {writePhotos} from '../../../packages/backup/src/photos.mjs';
import {BackupJob,asBlob} from '../../../packages/backup/src/streaming.mjs';
import {backupState,type BackupPhoto} from './backup-store';
import {parseLearningURL} from '../../../packages/practice/src/learning-url.mjs';
import {useAppearancePalette} from './appearance';
import Settings from './Settings';
import GlassTabs from './GlassTabs';
import {NativeIcon as Icon,scheduleUIAssetWarmup} from '../../../packages/learning-ui/src/NativeIcon';
import Capture from './Capture';
import Laboratory from './Laboratory';
import {ExperienceMeter,LevelPage,useExperience} from './Experience';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parsePublicCatalog, parsePublicDeck } from '../../../packages/deck-format/src/public.mjs';
import { parseArchive, MAX_PACKAGE_BYTES } from '../../../packages/deck-format/src/archive.mjs';
import { speak, stopSpeaking } from '../../../packages/learning-ui/src/speech';
import { readPreference, writePreference, saveDeck, iterateStoredDecks, loadStoredDeck } from './storage';
import './style.css';
import NativePractice from './NativePractice';
import LoadProgress,{type DownloadProgress} from '../../../packages/learning-ui/src/LoadProgress';
import {downloadBytes} from '../../../packages/learning-ui/src/download.mjs';
import './app-shell.css';
import './responsive.css';
import './capture.css';
import './glass-tabs.css';
import './settings.css';

type Parsed = Awaited<ReturnType<typeof parseArchive>>;
type Deck = { id: string; title: string; fingerprint: string; legacyFingerprints?: string[]; covers?: Partial<Record<"landscape" | "portrait", string>>; words: Parsed["words"]; images: string[]; backupPhoto?:BackupPhoto; captureIDs?:string[]; studySources?:any[]; revision?:number; bytes?: Uint8Array; downloadURL?: string };
type Card = { id: string; title: string; description: string; count: number; cover: string; covers?: Partial<Record<"landscape" | "portrait", string>>; progressAliases?: string[]; package?: string; local?: boolean; subscribed?: boolean; sourceURL?:string; credit?: string; source?: string; payload?: string; payloadSHA256?: string; fingerprint?: string; learningFingerprint?: string; version?: number; photoCount?: number; preview?: { english: string; chinese: string } };
const asset = (path: string) => new URL(import.meta.env.BASE_URL + path, location.href).href;
const appStore = 'https://apps.apple.com/cn/app/id6808490052';
const cache = new Map<string, Deck>();
const publicUpdates = new Set<string>();
type PaidDeck = {id:string;title:string;cover:string};
async function publicCatalog(signal?:AbortSignal, refresh=false):Promise<Card[]> {
  const response=await fetch(asset('library/catalog.json'),{signal,cache:refresh?'no-cache':'default'});
  if(!response.ok)throw Error('公开卡组暂时无法加载，请稍后重试。');
  return parsePublicCatalog(await response.json());
}
async function paidCatalog(signal:AbortSignal):Promise<DeckPickerChoice[]> {
  const response=await fetch(asset('library/purchase-catalog.json'),{signal});
  if(!response.ok)return [];
  const entries:unknown=await response.json();
  if(!Array.isArray(entries))return [];
  return entries.filter((entry):entry is PaidDeck=>entry&&
    typeof entry.id==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(entry.id)&&
    typeof entry.title==='string'&&entry.title.length>0&&entry.title.length<=80&&
    typeof entry.cover==='string'&&new RegExp('^https://piclex\\.v2fy\\.com/decks/'+entry.id+'/v[1-9][0-9]*-[a-f0-9]{16}/cover(?:-portrait)?\\.jpg$').test(entry.cover))
    .map(item=>({...item,hasCoverTitle:true,wordCount:0,progressKeys:[],
      purchase:{app:`piclex://decks/${item.id}`,store:appStore}}));
}
async function loadPublicDeck(card:Card,signal?:AbortSignal,onProgress?:(progress:DownloadProgress)=>void):Promise<Deck> {
  const {bytes}=await downloadBytes(asset(card.payload!),{signal,maxBytes:8*1024*1024,onProgress});
  const parsed=await parsePublicDeck(bytes,card);
  return {id:card.id,title:parsed.title,fingerprint:parsed.learningFingerprint||parsed.fingerprint,
    legacyFingerprints:card.progressAliases,words:parsed.words,
    images:parsed.photos.map((photo:{path:string})=>asset(photo.path)),downloadURL:asset(card.package!)};
}
const backupPhotos=new Map<string,BackupPhoto>();
const captureCards=new Map<string,Card & {addedAt:number;firstWord:string}>();
let captureRevision=0;
let deletedPhotoIDs=new Set<string>();
function route() { return parseLearningURL(location.hash)?.id||''; }
function go(id = '') { location.hash = id ? `/deck/${encodeURIComponent(id)}` : '/learn'; }
function browseDecks(){location.hash='/decks';}
function screen(){const path=location.hash.slice(1);return path==='/settings/lab'?'lab':path.startsWith('/settings/level')?'level':path.startsWith('/settings')?'settings':path.startsWith('/deck/')||path.startsWith('/decks')||path.startsWith('/learn')?'learn':'capture';}
function materialize(id: string, parsed: Parsed, bytes: Uint8Array, aliases: string[] = []): Deck {
  const visible=parsed.photos.map((p,i)=>({p,i})).filter(({p})=>!deletedPhotoIDs.has(p.id.toLowerCase())),indices=new Map(visible.map(({i},index)=>[i,index]));
  parsed={...parsed,photos:visible.map(({p})=>p),words:parsed.words.filter(w=>indices.has(w.imageIndex)).map(w=>({...w,imageIndex:indices.get(w.imageIndex)!}))};
  const covers = Object.fromEntries(Object.entries(parsed.covers).map(([role, image]) => [role, URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime }))]));
  const deck = { ...parsed, id, bytes, covers, fingerprint: parsed.learningFingerprint, legacyFingerprints: [...new Set([...aliases, parsed.fingerprint])], images: parsed.photos.map(p => URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: p.mime }))) };
  const previous = cache.get(id);
  if (previous?.bytes) for (const url of [...previous.images, ...Object.values(previous.covers || {})]) URL.revokeObjectURL(url);
  cache.set(id, deck); return deck;
}
function download(bytes: Uint8Array|Blob, title: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = title.replace(/[\\/:*?"<>|]/g, '-') + '.piclexdeck'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function downloadDeck(deck: Deck) {
  if(deck.captureIDs){
    const photos=[];for(const id of deck.captureIDs){const stored=await loadStoredDeck(id);if(stored)photos.push(...(await readPhotos(new Uint8Array(stored.bytes))).filter(p=>!deletedPhotoIDs.has(p.id)));}
    download(await writePhotos(photos,deck.title,Date.now(),{zip64:false}),deck.title);return;
  }
  if(deck.backupPhoto){const job=await BackupJob.create(undefined);try{const output=await writePhotos([deck.backupPhoto],deck.title,Date.now(),{job});download(output,deck.title);job.retainDownload(output);}finally{await job.close();}return;}
  if (deck.bytes) { download(deck.bytes, deck.title); return; }
  if (deck.downloadURL) { const anchor = document.createElement('a'); anchor.href = deck.downloadURL; anchor.download = deck.title + '.piclexdeck'; anchor.click(); }
}

async function localDeck(id:string){if(cache.has(id))return cache.get(id)!;if(id===defaultCaptureID)return captureDeck();const photo=backupPhotos.get(id);if(photo)return await backupPhotoDeck(photo) as Deck;const stored=await loadStoredDeck(id);if(!stored)throw Error('照片卡组不存在。');const bytes=new Uint8Array(stored.bytes);return materialize(id,await parseArchive(bytes),bytes,stored.progressAliases);}

function defaultCaptureCard():Card|null{
  const members=[...captureCards.values()].sort((a,b)=>a.addedAt-b.addedAt||a.id.localeCompare(b.id));if(!members.length)return null;
  return {id:defaultCaptureID,title:defaultCaptureTitle,description:'我的照片与词汇',cover:members[0].cover,local:true,count:members.reduce((sum,c)=>sum+c.count,0),photoCount:members.reduce((sum,c)=>sum+(c.photoCount||0),0)};
}
function captureTarget(id:string){const member=captureCards.get(id);return member?{id:defaultCaptureID,word:member.firstWord}:{id,word:''};}
async function captureDeck():Promise<Deck>{
  const revision=captureRevision,sources=[];
  for(const member of [...captureCards.values()]){
    const stored=await loadStoredDeck(member.id);if(!stored)continue;
    const parsed=await parseArchive(new Uint8Array(stored.bytes));
    const visible=parsed.photos.map((p,i)=>({p,i})).filter(({p})=>!deletedPhotoIDs.has(p.id.toLowerCase())),indices=new Map(visible.map(({i},index)=>[i,index]));
    sources.push({id:stored.id,addedAt:stored.addedAt,fingerprint:parsed.learningFingerprint,legacyFingerprints:[...(stored.progressAliases||[]),parsed.fingerprint],
      words:parsed.words.filter(w=>indices.has(w.imageIndex)).map(w=>({...w,imageIndex:indices.get(w.imageIndex)!})),
      images:visible.map(({p})=>URL.createObjectURL(new Blob([p.bytes as BlobPart],{type:p.mime})))});
  }
  // A queued save may finish while this view is loading. Never cache its old snapshot.
  if(revision!==captureRevision||cache.has(defaultCaptureID)){
    for(const source of sources)for(const url of source.images)URL.revokeObjectURL(url);
    return cache.get(defaultCaptureID)||captureDeck();
  }
  const value={...groupCapturedDecks(sources),captureIDs:sources.map(s=>s.id),revision};cache.set(defaultCaptureID,value);return value;
}
function invalidateCaptureDeck(){captureRevision++;const previous=cache.get(defaultCaptureID);if(previous)for(const url of previous.images)URL.revokeObjectURL(url);cache.delete(defaultCaptureID);}

function App() {
  useEffect(()=>{
    const loader=document.getElementById('boot-loader'),style=document.querySelector<HTMLLinkElement>('link[data-app-style]');
    if(!loader)return;
    const finish=()=>loader.remove();
    if(!style||style.media==='all'){finish();return;}
    style.addEventListener('load',finish,{once:true});
    style.addEventListener('error',finish,{once:true});
    return()=>{style.removeEventListener('load',finish);style.removeEventListener('error',finish);};
  },[]);
  useEffect(()=>{scheduleUIAssetWarmup();},[]);
  const [showLibrary,setShowLibrary]=useState(()=>location.hash==='#/decks');
  const [spellingEntry,setSpellingEntry]=useState({id:'',sequence:0}),entrySequence=useRef(0);
  const [subscriptionRevision,setSubscriptionRevision]=useState(0);
  useEffect(()=>onSubscriptionChange(change=>{if(!['installed','updated'].includes(change.type))return;const cached=cache.get(change.id);if(cached?.bytes)cached.images.forEach(URL.revokeObjectURL);cache.delete(change.id);setSubscriptionRevision(n=>n+1);}),[]);
  const [page,setPage]=useState(screen),[labDeck,setLabDeck]=useState<Deck|null>(null),[gameBusy,setGameBusy]=useState(false);
  const gameOrigin=useRef('/settings/laboratory'),gameOpening=useRef(false);
  const [gameDeckID,setGameDeckID]=useState(()=>readPreference('piclex-web.last-deck')||'');
  const xp=useExperience();
  useEffect(()=>{document.body.dataset.page=page;window.scrollTo(0,0);return()=>{delete document.body.dataset.page;};},[page]);
  function navigate(hash:string){if(page==='lab')window.dispatchEvent(new CustomEvent('piclex-game-leave',{detail:hash}));else location.hash=hash;}
  const [cards, setCards] = useState<Card[]>([]), [selected, setSelected] = useState(route), [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [importing, setImporting] = useState(false);
  const [deckProgress,setDeckProgress]=useState<DownloadProgress|null>(null);
  const [theme,setTheme]=useState(()=>readPreference('piclex-web.theme')||'system');
  const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches);
  const dark=theme==='dark'||theme==='system'&&systemDark;
  useAppearancePalette(dark);
  useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const update=()=>setSystemDark(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; writePreference('piclex-web.theme',theme); }, [dark,theme]);
  useEffect(() => {
    const update = () => { stopSpeaking(); setSelected(route()); setPage(screen()); setShowLibrary(location.hash==='#/decks'); setError(''); };
    window.addEventListener('hashchange', update);
    // A link can arrive after the initial render but before this subscription.
    // Reconcile the live URL after subscribing so that navigation is never lost.
    if(route()!==selected||screen()!==page||(location.hash==='#/decks')!==showLibrary)update();
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => { const hide = () => { if (document.hidden) stopSpeaking(); }; document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', stopSpeaking); return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', stopSpeaking); }; }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restoredPhotos=(await backupState()).photos;deletedPhotoIDs=new Set(restoredPhotos.filter(p=>p.meta.deletedAt!=null).map(p=>p.id));
        const builtin = await publicCatalog();
        const imported: Card[] = [];const represented=new Set<string>();
        try {
          for await (const stored of iterateStoredDecks()) {
            try {
              const bytes = new Uint8Array(stored.bytes); const parsed = await parseArchive(bytes);
              for(const p of parsed.photos)represented.add(p.id.toLowerCase());
              const visible=parsed.photos.filter(p=>!deletedPhotoIDs.has(p.id.toLowerCase()));if(!visible.length)continue;
              const cover=URL.createObjectURL(await thumbnail(new Blob([visible[0].bytes as BlobPart],{type:visible[0].mime})));
              const card={id:stored.id,title:parsed.title,count:parsed.words.filter(w=>!deletedPhotoIDs.has(parsed.photos[w.imageIndex].id.toLowerCase())).length,photoCount:visible.length,description:'你自己的照片与词汇',cover,fingerprint:parsed.fingerprint,learningFingerprint:parsed.learningFingerprint,progressAliases:[...(stored.progressAliases||[]),parsed.fingerprint],local:true,subscribed:stored.subscribed};
              if(isDefaultCapture(stored))captureCards.set(stored.id,{...card,addedAt:stored.addedAt,firstWord:parsed.words.find(w=>!deletedPhotoIDs.has(parsed.photos[w.imageIndex].id.toLowerCase()))?.id||''});else imported.push(card);
            } catch { if (!cancelled) setNotice('有一份本地卡组暂时无法读取，原文件仍保存在浏览器中。'); }
          }
        } catch { if (!cancelled) setNotice('浏览器未开放卡组存储，仍可体验公开卡组。'); }
        for(const photo of restoredPhotos)if(!represented.has(photo.id)&&photo.meta.deletedAt==null&&photo.meta.labels.length){const id='local-backup-'+photo.id;backupPhotos.set(id,photo);imported.push({id,title:photo.title,count:photo.meta.labels.length,photoCount:1,description:'你自己的照片与词汇',cover:URL.createObjectURL(asBlob(photo.image)),local:true});}
        const grouped=defaultCaptureCard();if(grouped)imported.push(grouped);
        if (!cancelled) { setCards(current=>[...builtin,...imported,...current.filter(card=>card.local&&!imported.some(item=>item.id===card.id))]); setReady(true); setLoading(false); }
      } catch (e) { if (!cancelled) { setError((e as Error).message); setLoading(false); } }
    })(); return () => { cancelled = true; };
  }, [subscriptionRevision]);
  useEffect(() => {
    if (!ready || !selected) { setDeck(null); return; }
    const target=captureTarget(selected);if(target.id!==selected){const params=new URLSearchParams(location.hash.split('?')[1]||'');if(!params.has('word'))params.set('word',target.word);params.delete('photo');location.replace(`#/deck/${target.id}?${params}`);return;}
    writePreference('piclex-web.last-deck',selected);setGameDeckID(selected);
    const card = cards.find(c => c.id === selected);
    if (!card) { setDeck(null); setError('没有找到这份卡组。本地导入的卡组只在当前浏览器可用。'); return; }
    setError('');
    if (cache.has(selected)) { setDeck(cache.get(selected)!); setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setDeck(null);setDeckProgress(null);
    (async () => {
      try {
        if(card.local){const value=await localDeck(selected);if(!controller.signal.aborted){cache.set(selected,value);setDeck(value);setLoading(false);}return;}
        const value=await loadPublicDeck(card,controller.signal,progress=>{if(!controller.signal.aborted)setDeckProgress(progress);});
        if (!controller.signal.aborted) {
          cache.set(selected, value); setDeck(value); setLoading(false);
        }
      } catch (e) { if (!controller.signal.aborted) { setError((e as Error).message); setLoading(false); } }
    })(); return () => controller.abort();
  }, [selected, cards, ready]);
  async function updatePublicDeck(card:Card) {
    if(publicUpdates.has(card.id))throw Error('这个卡组正在更新。');
    publicUpdates.add(card.id);
    try{
      const latest=(await publicCatalog(undefined,true)).find(item=>item.id===card.id);
      if(!latest)throw Error('暂时找不到这个卡组的更新。');
      if(latest.fingerprint===card.fingerprint&&latest.payloadSHA256===card.payloadSHA256&&
        (!card.version||latest.version===card.version))return '已是最新版本';
      if(card.version&&(!latest.version||latest.version<=card.version))throw Error('卡组版本不一致，请稍后重试。');
      const value=await loadPublicDeck(latest);
      cache.set(card.id,value);
      setCards(current=>current.map(item=>item.id===card.id?latest:item));
      return latest.version?`已更新至 v${latest.version}`:'卡组已更新';
    }finally{publicUpdates.delete(card.id);}
  }
  function startLearning(id?:string,replace=false){
    const target=captureTarget(id||readPreference('piclex-web.last-deck')||'');const last=target.id;
    const chosen=cards.find(card=>card.id===last)||cards.find(card=>!card.local&&card.count>0)||cards.find(card=>card.count>0);
    if(!chosen){navigate('/learn');return;}
    setSpellingEntry({id:chosen.id,sequence:++entrySequence.current});
    const hash=`/deck/${encodeURIComponent(chosen.id)}${target.word&&chosen.id===target.id?'?word='+encodeURIComponent(target.word):''}`;
    if(replace)location.replace(`#${hash}`);else navigate(hash);
  }
  useEffect(()=>{
    if(page==='learn'&&!showLibrary&&!selected&&ready&&!error&&cards.length&&location.hash==='#/learn')startLearning(undefined,true);
  },[page,showLibrary,selected,ready,error,cards]);
  useEffect(() => { document.title = deck && selected ? `${deck.title} · 摄影学英语` : '摄影学英语 · 把眼前的生活，变成英语'; }, [deck, selected]);
  async function importFile(selectedFile?: File) {
    if (!selectedFile || importing) return;
    setImporting(true); setNotice('');
    try {
      if (selectedFile.size > MAX_PACKAGE_BYTES || !selectedFile.name.toLowerCase().endsWith('.piclexdeck')) throw new Error('请选择不超过 128 MiB 的 .piclexdeck 卡组。');
      const buffer = await selectedFile.arrayBuffer(), bytes = new Uint8Array(buffer), parsed = await parseArchive(bytes);
      const existing = [...cache.values()].find(d => d.bytes && d.fingerprint === parsed.learningFingerprint);
      const id = existing?.id || `local-${parsed.learningFingerprint}`;
      const progressAliases = existing?.legacyFingerprints || [];
      const subscribed=cards.find(card=>card.id===id)?.subscribed;
      await saveDeck({ id, title: parsed.title, bytes: buffer, progressAliases, addedAt: Date.now(), subscribed });
      const value = materialize(id, parsed, bytes, progressAliases);
      const card: Card = { id, title: value.title, count: value.words.length, description: '你自己的照片与词汇', cover: value.images[0], covers: value.covers, fingerprint:parsed.fingerprint, learningFingerprint:value.fingerprint, progressAliases:value.legacyFingerprints, local: true, subscribed };
      setCards(current => current.some(c => c.id === id) ? current.map(c => c.id === id ? card : c) : [...current, card]);
      setNotice('卡组已保存到当前浏览器。'); go(id);
    } catch (e) { setNotice((e as Error).message); }
    finally { setImporting(false); if (file.current) file.current.value = ''; }
  }
  async function saveCaptured(bytes:Uint8Array,id:string){
    const parsed=await parseArchive(bytes),previous=await loadStoredDeck(id),addedAt=previous?.addedAt??Date.now();
    await saveDeck({id,title:parsed.title,bytes:bytes.slice().buffer,addedAt});
    const card:Card={id,title:parsed.title,count:parsed.words.length,photoCount:parsed.photos.length,learningFingerprint:parsed.learningFingerprint,progressAliases:[parsed.fingerprint],description:'我的照片与词汇',cover:URL.createObjectURL(new Blob([parsed.photos[0].bytes as BlobPart],{type:parsed.photos[0].mime})),local:true};
    const old=captureCards.get(id);if(old)URL.revokeObjectURL(old.cover);
    if(isDefaultCapture(card))captureCards.set(id,{...card,addedAt,firstWord:parsed.words[0].id});else captureCards.delete(id);
    invalidateCaptureDeck();
    if(!isDefaultCapture(card))materialize(id,parsed,bytes);
    else {const old=cache.get(id);if(old)for(const url of old.images)URL.revokeObjectURL(url);cache.delete(id);}
    const grouped=defaultCaptureCard();
    setCards(current=>[...current.filter(item=>item.id!==id&&item.id!==defaultCaptureID),...(!isDefaultCapture(card)?[card]:[]),...(grouped?[grouped]:[])]);
    return id;
  }
  async function openGame(practiceDeck?:Deck){
    if(gameOpening.current||!ready)return;
    const origin=location.hash;
    gameOpening.current=true;setGameBusy(true);
    try{
      let value=practiceDeck;
      if(!value){
        const card=cards.find(c=>c.id===gameDeckID)||cards[0];
        if(!card)throw Error('请先选择或导入一份卡组。');
        value=cache.get(card.id);
        if(!value&&card.local)value=await localDeck(card.id);
        if(!value){
          value=await loadPublicDeck(card);
          cache.set(card.id,value);
        }
      }
      // A delayed load must not pull the learner back after they leave the entry.
      if(location.hash!==origin)return;
      gameOrigin.current=origin==='#/settings/lab'?'/settings/laboratory':origin.slice(1)||'/settings/laboratory';
      setLabDeck(value);location.hash='/settings/lab';
    }catch(e){if(location.hash===origin){setNotice((e as Error).message);if(origin==='#/settings/lab')location.hash='/settings/laboratory';}}
    finally{gameOpening.current=false;setGameBusy(false);}
  }
  useEffect(()=>{if(page==='lab'&&ready&&!labDeck)void openGame();},[page,ready]);
  async function saveDownloaded(bytes:Uint8Array,signal:AbortSignal,source?:{url:string;feed:SourceDeck}){
    if(source){const result=await installSubscription({bytes,source:source.url,feed:source.feed,signal});const value=await localDeck(result.id);setCards(current=>[...current.filter(c=>c.id!==result.id),{id:result.id,title:value.title,count:value.words.length,photoCount:value.images.length,description:'我的照片与词汇',cover:value.images[0],covers:value.covers,local:true,subscribed:true}]);if(!signal.aborted)setNotice(result.status==='unchanged'?'已是最新版本':`卡组已保存，v${result.version}`);return;}
    const parsed=await parseArchive(bytes);signal.throwIfAborted();
    if([...cache.values()].some(d=>d.fingerprint===parsed.learningFingerprint)||cards.some(c=>c.fingerprint===parsed.fingerprint)){setNotice('卡组已下载。');return;}
    const id=`local-${parsed.learningFingerprint}`;
    await saveDeck({id,title:parsed.title,bytes:bytes.slice().buffer,addedAt:Date.now(),subscribed:true});
    const value=materialize(id,parsed,bytes);
    setCards(current=>[...current.filter(c=>c.id!==id),{id,title:value.title,count:value.words.length,description:'我的照片与词汇',cover:value.images[0],covers:value.covers,fingerprint:parsed.fingerprint,local:true,subscribed:true}]);
    if(!signal.aborted)setNotice('卡组已下载，可在当前卡组菜单中选择。');
  }
  const settings=<Settings cards={cards} ready={ready} error={error} theme={theme} setTheme={setTheme} importFile={()=>file.current?.click()} exportDeck={id=>{void (async()=>downloadDeck(cache.get(id)||await localDeck(id)))().catch(e=>setNotice(e.message));}} openDeck={go} openGame={()=>void openGame()} gameBusy={gameBusy} gameDeckID={gameDeckID} setGameDeckID={id=>{setGameDeckID(id);setLabDeck(null);}} notify={setNotice}/>;
  const featured = cards.find(card => !card.local);
  const cover = (card: Card, role: "landscape" | "portrait") => { const path = card.covers?.[role] || card.covers?.landscape || card.covers?.portrait || card.cover; return card.local ? path : asset(path); };
  const deckChoices:DeckPickerChoice[]=cards.map(card=>{
    const loaded=cache.get(card.id),fingerprint=loaded?.fingerprint||card.learningFingerprint||
      (card.id===defaultCaptureID?defaultCaptureID:card.fingerprint);
    const aliases=loaded?.legacyFingerprints||card.progressAliases||[];
    const wordCount=loaded?.words.length??card.count;
    return {id:card.id,title:card.title,cover:cover(card,'portrait'),hasCoverTitle:!!card.covers?.portrait,
      wordCount,progressKeys:fingerprint?[fingerprint,...aliases]:[],subscribed:card.subscribed,
      readProgress:!fingerprint&&backupPhotos.has(card.id)?async()=>{
        const restored=await localDeck(card.id);
        try{return savedDeckPosition([restored.fingerprint],restored.words.length);}
        finally{if(cache.get(card.id)!==restored)restored.images.forEach(URL.revokeObjectURL);}
      }:undefined,
      update:card.local?undefined:()=>updatePublicDeck(card)};
  });
  return <><a className="skip-link" href="#main-content">跳到内容</a>
    <div id="main-content" tabIndex={-1}>
    <div hidden={page!=='capture'}><Capture active={page==='capture'} save={saveCaptured} learn={startLearning} notify={setNotice}/></div>
    {page==='capture'?null:page==='settings'?settings:page==='level'?<main className="settings-page"><button className="text-button" onClick={()=>{location.hash='/settings';}}>‹ 设置</button><LevelPage openGame={()=>void openGame()} gameBusy={gameBusy} gameReady={ready} learn={()=>{location.hash='/learn';}}/></main>:page==='lab'?labDeck?<Laboratory deck={labDeck} returnLabel={gameOrigin.current.startsWith('/settings/level')?'返回我的等级':gameOrigin.current.startsWith('/settings')?'返回实验室':'返回学习'} exit={(hash?:string)=>{location.hash=hash||gameOrigin.current;}}/>:<main className="empty-state">正在准备游戏…</main>:error ? <main className="empty-state"><h1>暂时无法打开</h1><p>{error}</p><button className="primary" onClick={() => selected ? browseDecks() : location.reload()}>{selected ? '返回全部卡组' : '重新加载'}</button></main> : selected ? loading || !deck || deck.id !== selected ? <main className="empty-state load-screen"><LoadProgress label="正在加载卡组" progress={deckProgress}/></main> : <NativePractice key={`${deck.fingerprint}:${deck.revision||0}`} deck={deck} openGame={()=>void openGame(deck)} gameBusy={gameBusy} deckChoices={deckChoices} loadPurchaseChoices={paidCatalog} selectDeck={id=>{if(cards.some(card=>card.id===id))go(id);}} spellingRequest={spellingEntry.id===deck.id?spellingEntry.sequence:0} consumeSpellingRequest={sequence=>setSpellingEntry(current=>current.sequence===sequence?{id:'',sequence:0}:current)} notify={setNotice} installedDecks={cards} saveDownloaded={saveDownloaded} exit={browseDecks} download={() => void downloadDeck(deck).catch(e=>setNotice(e.message))} share={async () => {
          if (selected.startsWith('local-')) { await downloadDeck(deck); setNotice('卡组已导出，可将文件发给朋友。'); return; }
          try { await navigator.clipboard.writeText(location.href); setNotice('练习链接已复制。'); } catch { setNotice('请复制浏览器地址栏中的练习链接。'); }
        }}/> : !showLibrary ? <main className={!ready?"empty-state load-screen":"empty-state"}>{!ready?<LoadProgress label="正在准备学习" progress={null}/>:<><h1>还没有可用卡组</h1><button className="primary" onClick={()=>file.current?.click()}>导入卡组文件</button></>}</main> : <main className="home">
      <section className="hero"><div className="hero-copy"><p className="eyebrow">EVERYDAY SCENES. EVERYDAY ENGLISH.</p><h1>把眼前的生活，<br/><span>变成英语。</span></h1><p className="hero-description">从一张照片开始。看见场景，听见发音，<br className="desktop-break"/>亲手拼出那个词，让记忆有画面。</p><button className="primary" disabled={!featured} onClick={() => featured && go(featured.id)}>开始练习 <Icon name="arrow"/></button><p className="hero-note">免费体验 · 无需登录 · 进度保存在浏览器</p></div><button className="hero-photo" disabled={!featured} onClick={() => featured && go(featured.id)} aria-label={featured ? `开始${featured.title}卡组` : "正在加载公开卡组"}>{featured && <><img src={cover(featured, "landscape")} alt={featured.title}/><span className="hero-photo-label"><span>{featured.photoCount} 个场景 · {featured.count} 个词</span><strong>{featured.title} <Icon name="arrow"/></strong></span></>}</button></section>
      <section className="decks-section" aria-labelledby="decks-title"><div className="section-title"><div><p className="eyebrow">YOUR NEXT SMALL DISCOVERY</p><h2 id="decks-title">今天，想学哪套卡组？</h2></div><button className="text-button" onClick={() => file.current?.click()} disabled={importing || !ready}><Icon name="upload"/>{importing ? '正在导入…' : '导入自己的卡组'}</button></div><div className="deck-grid">{cards.map((card) => <button className="deck-card" key={card.id} onClick={() => go(card.id)}><div className="deck-cover"><img src={cover(card, "portrait")} alt={card.title} loading="lazy"/></div><div className="deck-caption"><h3>{card.title}</h3><Icon name="arrow"/><p>{card.description}</p><span>{card.local ? '我的卡组 · ' : ''}{card.photoCount ? `${card.photoCount} 张卡片 · ` : ''}{card.count} 个词</span></div></button>)}</div>{loading && <p role="status">正在加载卡组…</p>}<p className="import-note">支持 App 导出的 .piclexdeck 文件，最多 128 MiB。照片只保存在当前浏览器。</p></section>
      <section className="home-app"><div className="app-icon"><img src={asset("brand/app-icon.png")} alt=""/></div><div><h2>你的照片，就是你的词书。</h2><p>用摄影学英语 iPhone App 拍照制卡，在自己的生活里持续练习。</p></div><a className="secondary" href={appStore} target="_blank" rel="noreferrer">探索 iPhone App <Icon name="arrow"/></a></section>
    </main>}
    </div>
    {page==='lab'?null:<GlassTabs selected={page==='capture'?'capture':page==='learn'?'learn':'settings'} onSelect={id=>{if(id==='learn'){startLearning();}else navigate(`/${id}`);}}/>}
    <input ref={file} className="file-input" type="file" accept=".piclexdeck" aria-label="选择照片卡组文件" onChange={e => void importFile(e.target.files?.[0])}/>
    {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><Icon name="close"/></button></div>}
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
