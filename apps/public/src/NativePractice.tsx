import Reading,{type ReadingDraft} from './Reading';
import type {SourceDeck} from './deck-source';
import {studyEventScope,studySentenceKey} from '../../../packages/practice/src/capture-group.mjs';
import usePositionSync from './usePositionSync';
import {PhotoCache} from '../../../packages/learning-ui/src/photo-cache';
import {upcomingPhotos} from '../../../packages/practice/src/upcoming-photos.mjs';
import DeckPicker,{type DeckPickerChoice} from './DeckPicker';
import {recordPortableStudy,portableHistory} from './practice-progress';
import {applyLearningURL,learningHash,parseLearningURL} from '../../../packages/practice/src/learning-url.mjs';
import usePageViewport from './usePageViewport';
import useSentenceAmbience from './SentenceAmbience';
import {listeningPlaylist,listeningNeighbor,repeatModes} from '../../../packages/practice/src/listening.mjs';
import Dialog from './Dialog';
import DeckDownload from './DeckDownload';
import {createCompletionSound} from '../../../packages/learning-ui/src/completion-sound';
import {usePhotoPalette} from './usePhotoPalette';
import {NativeIcon as Icon} from '../../../packages/learning-ui/src/NativeIcon';
import {playTypingSound,stopTypingSound,prepareTypingSound} from '../../../packages/learning-ui/src/typing-sound';
import {PracticeProgress,useExperience,LevelPage} from './Experience';
import VirtualKeyboard,{useDesktopKeyboard} from '../../../packages/learning-ui/src/VirtualKeyboard';
import {editSpellingText} from '../../../packages/learning-ui/src/spelling-edit.mjs';
import {editDictationText} from '../../../packages/learning-ui/src/dictation-edit.mjs';
import useStudyPersistence from './useStudyPersistence';
import {editKeyboardText} from '../../../packages/learning-ui/src/keyboard-edit.mjs';
import {transactExperience} from '../../../packages/practice/src/experience-store.mjs';
import {clearExperienceEffects,emitExperience,prepareExperienceEffects} from '../../../packages/learning-ui/src/experience-effects';
import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type CSSProperties,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {PhotoFocus,type Focus} from '../../../packages/learning-ui/src/PhotoFocus';
import {AnswerSlots} from '../../../packages/learning-ui/src/AnswerSlots';
import SpellingGlow from '../../../packages/learning-ui/src/SpellingGlow';
import {maskExample,mismatch,completionProgress,exampleTokens,exampleWords,tokenForWord} from '../../../packages/learning-ui/src/spelling.mjs';
import {newStudy,restoreStudy,restoreStudyFromStorage,reduceStudy,studyKey,wordDraft,expectedInput} from '../../../packages/practice/src/study.mjs';
import {promptsFor,newSentence,rates,writtenWords,checkSentence,tokens} from '../../../packages/practice/src/sentence.mjs';
import {accumulateReading} from '../../../packages/practice/src/reading.mjs';
import {readPreference,writePreference} from './storage';
import {useSpeech} from './useSpeech';
import './practice.css';
import {startDictationGoldSweep} from './dictation-gold';
import EnglishInput from './EnglishInput';
import {useWordPeek,WordPeekTooltip,wordTargetAtPoint} from './WordPeek';
import {normalizeDefinitionWord} from './word-definitions';
import {flushSync} from 'react-dom';
export type AudioClip={mediaType:string;sha256:string;byteCount:number;durationSeconds:number;dataBase64?:string;path?:string};
export type Word={audio?:AudioClip;id:string;english:string;chinese:string;imageIndex:number;focus:Focus;example:string;exampleChinese:string;phonetic:string;partOfSpeech:string;occurrenceID?:string};
export type PracticeDeck={id:string;title:string;fingerprint:string;legacyFingerprints?:string[];studySources?:any[];words:Word[];images:string[]};
type Action={type:string;[key:string]:unknown};
function recordingFor(words:Word[],prompt?:{wordIndex:number;sentence:string}){
 if(!prompt)return;
 const word=words[prompt.wordIndex];
 return word?.example.trim()===prompt.sentence.trim()?word.audio:undefined;
}
const StablePhotoFocus=memo(PhotoFocus);
const modes=[['listening','随身听'],['chunks','词块拼句'],['free','自由听写']];
const modules=[['spelling','拼单词'],['listening','练听力'],['speaking','练口语']];
let acceptedSpellingSequence=0;
function applyRoute(deck:PracticeDeck,state:any,route:ReturnType<typeof parseLearningURL>){const finished=state.sentenceFinished;let next=applyLearningURL(deck,state,route);if(finished&&next.module==='listening'&&route&&(route.photo||route.word||route.sentence))next=reduceStudy(deck,next,{type:'freshSentence',question:studyKey(next)});return next;}
function readJSON(key:string){try{return JSON.parse(readPreference(key)||'null');}catch{return null;}}
function revealFocusedAnswer(){
 const field=document.activeElement as HTMLElement|null,body=field?.closest<HTMLElement>('.native-body');
 if(!body||!field?.matches('.guided-input input,.dictation-input'))return;
 const area=body.getBoundingClientRect(),box=field.getBoundingClientRect();
 if(box.bottom>area.bottom)body.scrollTop+=box.bottom-area.bottom+4;
 else if(box.top<area.top)body.scrollTop+=box.top-area.top-4;
}
function SpeakerIcon(){return <Icon name="sound"/>;}
function MutedSpeakerIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="m15.5 9.5 5 5m0-5-5 5"/></svg>;}
function PlaybackFill({progress}:{progress:ReturnType<typeof useSpeech>['progress']}){
 const {value,indeterminate}=useSyncExternalStore(progress.subscribe,progress.getSnapshot);
 const fill=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let shown=progress.getSnapshot().value,lastTarget=shown,lastTime=performance.now(),frame=0,finishTime:number|undefined,finishFrom=shown;
  // One monotonic painter avoids WebKit's small backwards steps when a running
  // CSS transition is repeatedly retargeted. No layout reads or parent renders.
  const paint=(time:number)=>{
   const {value:target,paused}=progress.getSnapshot();
   const delta=Math.min(64,Math.max(0,time-lastTime));lastTime=time;
   if(reduced.matches||target<lastTarget){shown=target;finishTime=undefined;}
   else if(paused){finishTime=undefined;}
   else if(target===1){if(finishTime===undefined){finishTime=time;finishFrom=shown;}shown=finishFrom+(1-finishFrom)*Math.min(1,(time-finishTime)/120);}
   else {finishTime=undefined;shown+=Math.max(0,target-shown)*(1-Math.exp(-delta/50));if(target-shown<.0001)shown=target;}
   lastTarget=target;if(fill.current)fill.current.style.transform=`scaleX(${shown})`;
   frame=requestAnimationFrame(paint);
  };
  paint(lastTime);return ()=>cancelAnimationFrame(frame);
 },[progress]);
 return <span className={`playback-progress${indeterminate?' indeterminate':''}`} role="progressbar" aria-label="播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate?undefined:Math.round(value*100)} aria-valuetext={indeterminate?'正在播放':undefined}><span ref={fill} className="playback-fill"/></span>;
}
function Playback({play,audio,rate,setRate,label='播放句子',shortcut=false}:{play:()=>void;audio:ReturnType<typeof useSpeech>;rate:number;setRate:(n:number)=>void;label?:string;shortcut?:boolean}){
 return <div className="native-playback"><button className="native-button playback-button" aria-keyshortcuts={shortcut?'Space':undefined} onClick={play}>{audio.playing&&<PlaybackFill progress={audio.progress}/>}<span className="playback-label"><SpeakerIcon/>{audio.preparing?'准备音频…':audio.playing?'重新播放':label}</span><kbd className="space-keycap" aria-hidden="true"/></button><span className="playback-rate"><select aria-label="播放速度" value={rate} onChange={e=>setRate(Number(e.target.value))}>{rates.map(r=><option key={r} value={r}>{r===1?'1.0':r}×</option>)}</select><span aria-hidden="true">⌄</span></span></div>;
}
function ListeningSeek({audio,prompt,original,seek,onSeek,onBegin}:{audio:ReturnType<typeof useSpeech>;prompt:string;original:boolean;seek:number;onSeek:(value:number)=>void;onBegin:()=>void}){
 const progress=useSyncExternalStore(audio.progress.subscribe,audio.progress.getSnapshot),words=exampleWords(prompt);
 const dragging=useRef(false),pending=useRef(0),[draft,setDraft]=useState<number|null>(null);
 const position=original?(audio.playing?progress.value:seek):Math.max(0,words.findIndex(w=>(audio.position>=0?audio.position:seek)>=w.start&&(audio.position>=0?audio.position:seek)<w.end));
 const value=draft??(original?Math.round(position*1000):position);
 const commit=(n:number)=>onSeek(original?n/1000:words[n]?.start||0);
 const finish=()=>{if(!dragging.current)return;dragging.current=false;commit(pending.current);setDraft(null);};
 return <label className="listening-seek"><span className="sr-only">{original?'句子播放位置':'句子位置（按词）'}</span><input aria-label="句子播放位置" type="range" min="0" max={original?1000:Math.max(0,words.length-1)} value={value}
  onPointerDown={e=>{dragging.current=true;pending.current=value;setDraft(value);e.currentTarget.setPointerCapture(e.pointerId);onBegin();}}
  onChange={e=>{const next=Number(e.target.value);if(dragging.current){pending.current=next;setDraft(next);}else commit(next);}}
  onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish}/></label>;
}

function SentenceLine({sentence,target,translation,hidden,position,open}:{sentence:string;target:string;translation:string;hidden:boolean;position:number;open:()=>void}){
 const display=useMemo(()=>exampleTokens(sentence,target),[sentence,target]),words=useMemo(()=>exampleWords(sentence),[sentence]),index=words.findIndex(w=>position>=w.start&&position<w.end),highlight=tokenForWord(display,index);
 return <button className="native-example" onClick={open} aria-label="查看例句并练口语"><span>{display.map((t,i)=><span key={i} className={i===highlight?'spoken-word':''}>{t.text} </span>)}</span>{!hidden&&<small>{maskExample(translation,target)}</small>}</button>;
}
function GuidedInput({sentence,value,difficulty,disabled,deckWord,deckMeaning,onChange,onWarning,onComposing,onSubmit,onVirtualKey}:{sentence:string;value:string[];difficulty:string;disabled:boolean;deckWord:string;deckMeaning:string;onChange:(values:string[])=>void;onWarning:(show:boolean)=>void;onComposing:(active:boolean)=>void;onSubmit:()=>void;onVirtualKey:(key:string)=>void}){
 const words:string[]=writtenWords(sentence),inputs=useRef<(HTMLInputElement|null)[]>([]);
 const {peek:wordPeek,begin,hover,cancel,consumeClick}=useWordPeek(`${sentence}|${difficulty}|${disabled}`,!disabled);
 const target=(word:string,node:Element)=>()=>({word,anchor:node.getBoundingClientRect(),meaning:normalizeDefinitionWord(word)===normalizeDefinitionWord(deckWord)?deckMeaning:undefined});
 const letterGroups=(w:string)=>{const values:{letter:string;punctuation:string}[]=[];for(const character of w){if(/[\p{L}\p{N}]/u.test(character))values.push({letter:character,punctuation:''});else if(values.length)values[values.length-1].punctuation+=character;}return values;};
 const editableWord=(word:string)=>/[a-z]/i.test(word);
 const savedValues=()=>words.map((word,j)=>editableWord(word)?value[j]||'':word);
 const update=(i:number,v:string)=>{const next=savedValues();next[i]=v;onChange(next);};
 const wordPress=(word:string,e:ReactPointerEvent<HTMLLabelElement>)=>{
  if(disabled||e.button!==0||!e.isPrimary)return;
  begin(target(word,e.currentTarget),e);
 };
 return <div className="guided-input" onClickCapture={consumeClick} onContextMenu={e=>e.preventDefault()} aria-label={difficulty==='easy'?'显示单词和字母数量':'只显示单词数量'}>{words.map((word,i)=>{
  const expected=letterGroups(word),entered=editableWord(word)?value[i]||'':word,typed=letterGroups(entered),capacity=expected.length,slots=Math.max(capacity,typed.length);
  return <label key={i} className="guided-word" style={{width:difficulty==='easy'?`min(${slots*16}px,100%)`:80}} onPointerDown={e=>wordPress(word,e)} onPointerEnter={e=>hover(target(word,e.currentTarget),e)} onPointerLeave={e=>{if(e.pointerType==='mouse'&&!e.buttons)cancel();}}>
   <EnglishInput key={`${sentence}:${i}`} ref={n=>{inputs.current[i]=n as HTMLInputElement|null;}} label={`第 ${i+1} 个单词${difficulty==='easy'?`，${capacity} 个字母`:''}`} readOnly={disabled} onVirtualKey={onVirtualKey} value={entered} onWarning={onWarning} onComposing={onComposing}
    onValue={(raw,advance)=>{const next=raw.replace(/\s/g,''),before=letterGroups(entered).length,after=letterGroups(next).length,later=value.some((v,j)=>j>i&&editableWord(words[j])&&!!String(v||'').trim());update(i,next);if(advance&&!later&&before<capacity&&after>=capacity)inputs.current.find((node,j)=>j>i&&editableWord(words[j]))?.focus({preventScroll:true});}}
    onPaste={e=>{const text=e.clipboardData.getData('text');if(!/\s/.test(text))return;e.preventDefault();const next=savedValues();text.trim().split(/\s+/).forEach((v,j)=>{if(i+j<next.length)next[i+j]=v;});onChange(next);}}
    onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Enter'){e.preventDefault();if(!disabled&&inputs.current[i+1])inputs.current[i+1]?.focus({preventScroll:true});else onSubmit();return;}if(disabled)return;if(e.key==='Backspace'&&!entered){e.preventDefault();inputs.current[i-1]?.focus({preventScroll:true});}}}/>
   {difficulty==='easy'&&<span className="guided-letters" aria-hidden="true">{Array.from({length:slots},(_,j)=>{const want=expected[j],got=typed[j],punctuation=got?.punctuation||want?.punctuation,apostrophe=/^['’‘]$/.test(punctuation||'');return <i key={j} className={got&&(!want||got.letter.toLowerCase()!==want.letter.toLowerCase())?'bad-letter':''}><span className="letter-glyph">{got?.letter||'\u00a0'}</span>{punctuation&&<b className={`guided-punctuation${apostrophe?' guided-apostrophe':''}`}>{punctuation}</b>}</i>;})}</span>}
  </label>;
 })}<WordPeekTooltip peek={wordPeek}/></div>;
}
function HardDictationInput({promptKey,sentence,value,disabled,deckWord,deckMeaning,onValue,onWarning,onComposing,onVirtualKey,onKeyDown}:{promptKey:string;sentence:string;value:string;disabled:boolean;deckWord:string;deckMeaning:string;onValue:(value:string)=>void;onWarning:(show:boolean)=>void;onComposing:(active:boolean)=>void;onVirtualKey:(key:string)=>void;onKeyDown:(event:ReactKeyboardEvent<HTMLInputElement|HTMLTextAreaElement>)=>void}){
 const field=useRef<HTMLInputElement|HTMLTextAreaElement|null>(null);
 const {peek,begin,hover,cancel,consumeClick}=useWordPeek(`${promptKey}|${disabled}`,!disabled);
 const target=(x:number,y:number)=>()=>{
  const node=field.current;if(!node)return null;
  const hit=wordTargetAtPoint(node,x,y),word=hit&&writtenWords(sentence)[hit.index];
  return hit&&word?{word,anchor:hit.anchor,meaning:normalizeDefinitionWord(word)===normalizeDefinitionWord(deckWord)?deckMeaning:undefined}:null;
 };
 const press=(e:ReactPointerEvent<HTMLDivElement>)=>{
  if(disabled||e.button!==0||!e.isPrimary)return;
  begin(target(e.clientX,e.clientY),e);
 };
 return <div className="hard-dictation-peek" onPointerDown={press} onPointerMove={e=>hover(target(e.clientX,e.clientY),e)} onPointerLeave={e=>{if(e.pointerType==='mouse'&&!e.buttons)cancel();}} onClickCapture={consumeClick} onContextMenu={e=>e.preventDefault()}><EnglishInput ref={field} key={promptKey} multiline className="dictation-input" label="听写句子" onWarning={onWarning} placeholder="听一句，写下听到的英文" value={value} maxLength={2000} onVirtualKey={onVirtualKey} readOnly={disabled} onComposing={onComposing} onValue={onValue} onKeyDown={e=>onKeyDown(e)}/><WordPeekTooltip peek={peek}/></div>;
}

export default function NativePractice({deck,openGame,gameBusy,deckChoices,loadPurchaseChoices,selectDeck,spellingRequest=0,consumeSpellingRequest,notify,exit,download,share,installedDecks,saveDownloaded}:{deck:PracticeDeck;openGame:()=>void;gameBusy:boolean;deckChoices:DeckPickerChoice[];loadPurchaseChoices:(signal:AbortSignal)=>Promise<DeckPickerChoice[]>;selectDeck:(id:string)=>void;spellingRequest?:number;consumeSpellingRequest:(sequence:number)=>void;notify:(s:string)=>void;exit:()=>void;download:()=>void;share:()=>void;installedDecks:{id:string;fingerprint?:string}[];saveDownloaded:(bytes:Uint8Array,signal:AbortSignal,source?:{url:string;feed:SourceDeck})=>Promise<void>}){
 usePageViewport();
 const desktopKeyboard=useDesktopKeyboard();
 const desktopShortcut=useDesktopKeyboard(700);
 const [photoState,setPhotoState]=useState<'loading'|'ready'|'error'>('loading'),[photoRetry,setPhotoRetry]=useState(0);
 const xp=useExperience(),[effect]=useState(()=>readPreference('piclex-web.particle-effect')||'socialCode');
 const particleEffect=xp.level>=7?effect:'socialCode';
 const [typingSound]=useState(()=>readPreference('piclex-web.typing-sound')!=='false');
 const storageKey=`piclex-web.study.v2.${deck.fingerprint}`;
 // The model validates untrusted saved state and migrates the first public release's progress.
 const [state,setState]=useState<any>(()=>{let restored=restoreStudyFromStorage(deck,readJSON);const globalQuick=readPreference('piclex-web.quick');if(globalQuick!==null)restored=reduceStudy(deck,restored,{type:'preference',name:'quick',value:globalQuick==='true',question:studyKey(restored)});const route=parseLearningURL(location.hash);restored=applyRoute(deck,restored,route);return spellingRequest>acceptedSpellingSequence&&!route?.module?reduceStudy(deck,restored,{type:'module',value:'spelling',question:studyKey(restored)}):restored;});
 usePositionSync(deck,state,setState,notify);
 const key=studyKey(state),input=useRef<HTMLInputElement>(null),warned=useRef(false),[panel,setPanel]=useState<'gallery'|'settings'|'download'|'level'|null>(null);
 const [visible,setVisible]=useState(!document.hidden),[composing,setComposing]=useState(false),[imeWarning,setImeWarning]=useState(false);
 const [repeat,setRepeat]=useState(()=>readPreference('piclex-web.listening.repeat')||'once'),[onePhoto]=useState(()=>readPreference('piclex-web.listening.single-photo')==='true');
 const [listenRun,setListenRun]=useState(false),[pass,setPass]=useState(0),[seek,setSeek]=useState(0),[seekRevision,setSeekRevision]=useState(0);
 const freeDictation=state.module==='listening'&&state.mode==='free';
 const readingContinuation=useRef(false),readingSaved=useRef(new Map<string,ReadingDraft>()),audio=useSpeech(notify,freeDictation),prompts=useMemo(()=>promptsFor(deck),[deck]);
 const prompt=prompts[state.sentenceIndex],word=deck.words[state.index],draft=wordDraft(deck,state),sentence=prompt?(state.sentences[prompt.key]||newSentence(prompt)):null;
 const promptAudio=recordingFor(deck.words,prompt);
 const active=visible&&!panel,complete=!word,playback=state.module==='listening'&&state.mode==='listening';
 const sentenceResult=sentence?.outcomes[state.mode],check=sentence?.checks[state.mode],revealed=sentence?.revealed.includes(state.mode);
 const layoutRoot=useRef<HTMLElement>(null),dictationFocus=useRef<HTMLInputElement|HTMLTextAreaElement|null>(null);
 const ambienceControl=useSentenceAmbience({active:active&&!complete&&state.module!=='speaking',speaking:audio.playing});
 const playlist=useMemo(()=>listeningPlaylist(prompts,deck.words,onePhoto,prompt?.key),[prompts,deck.words,onePhoto,prompt?.key]);
 const nextListeningIndex=playback?listeningNeighbor(playlist,state.sentenceIndex,1):state.sentenceIndex;
 const nextRecording=playback&&nextListeningIndex!==state.sentenceIndex?recordingFor(deck.words,prompts[nextListeningIndex]):undefined;
 const photos=useMemo(()=>new PhotoCache(),[deck]);
 const upcoming=useMemo(()=>upcomingPhotos(deck,state,prompts,playlist),[deck,state.index,state.module,state.mode,state.sentenceIndex,state.sentenceFinished,state.quick,state.history,prompts,playlist]);
 const photoWindow=JSON.stringify(upcoming);
 useEffect(()=>{photos.setWindow(deck.images[word?.imageIndex],visible?upcoming:[]);},[photos,word?.imageIndex,photoWindow,visible]);
 useEffect(()=>()=>photos.setWindow(undefined),[photos]);
 const skipListening=(offset:number)=>{audio.stopPlayback();setPass(0);setSeek(0);setSeekRevision(n=>n+1);dispatch({type:'listeningJump',index:listeningNeighbor(playlist,state.sentenceIndex,offset)});};
 const pauseListening=()=>{if(listenRun)setSeek(promptAudio?audio.readProgress():Math.max(0,audio.position));setListenRun(false);audio.stop();};
 const pauseListeningRef=useRef(pauseListening);pauseListeningRef.current=pauseListening;
 const navigationAudio=useRef<{module:string;from:string}|null>(null),revealAudio=useRef<string|null>(null);
 const bootAudio=useRef(!document.hidden),playCurrentRef=useRef<(automatic?:boolean)=>void>(()=>{});
 function dispatch(action:Action){if(action.type==='preference'&&action.name==='quick')writePreference('piclex-web.quick',String(action.value));if(action.type==='restart')readingSaved.current.clear();if(['next','sentenceNext','selectWord'].includes(action.type))navigationAudio.current={module:state.module,from:state.module==='spelling'?word?.id:prompt?.key};else if(['module','pause','restart'].includes(action.type))navigationAudio.current=null;setState((s:any)=>reduceStudy(deck,s,{...action,question:key},prompts));}
 const [urlRevision,setURLRevision]=useState(0),consumedHash=useRef(location.hash);
 // Subscribe during commit: a fast link after Back can arrive before passive effects.
 useLayoutEffect(()=>{
  const restore=()=>{
   const route=parseLearningURL(location.hash);if(route?.id!==deck.id)return;
   consumedHash.current=location.hash;
   navigationAudio.current=null;readingContinuation.current=false;setListenRun(false);audio.stop();setPanel(null);
   setState((current:any)=>applyRoute(deck,current,route));setURLRevision(n=>n+1);
  };
  window.addEventListener('hashchange',restore);
  if(location.hash!==consumedHash.current)restore();
  return()=>window.removeEventListener('hashchange',restore);
 },[deck]);
 // Replace only a URL already consumed by this state. An incoming navigation
 // wins over an older render while its hashchange event is still queued.
 useLayoutEffect(()=>{
  if(location.hash!==consumedHash.current||parseLearningURL(location.hash)?.id!==deck.id)return;
  const hash=learningHash(deck,state);consumedHash.current=hash;
  if(location.hash!==hash)history.replaceState(history.state,'',hash);
 },[deck,state.module,state.mode,state.difficulty,state.index,state.sentenceIndex,state.sentenceFinished,urlRevision]);
 const credited=useRef(new Set<string>());
 const award=(event:any)=>{const stamp=event.id+':'+(event.matched||'');if(credited.current.has(stamp))return;credited.current.add(stamp);void transactExperience(event).catch(e=>{credited.current.delete(stamp);notify(e.message);});};
 useEffect(()=>{prepareExperienceEffects();return()=>{clearExperienceEffects();stopTypingSound();};},[]);
 useEffect(()=>{if(!active||!typingSound)stopTypingSound();else prepareTypingSound();},[active,typingSound]);
 useEffect(()=>{if(!active||!typingSound)return;const sound=(e:Event)=>{const node=e.target as HTMLElement;if(node.closest('.native-practice')&&node.matches('input,textarea')&&!(e as InputEvent).isComposing)playTypingSound();};document.addEventListener('input',sound);return()=>document.removeEventListener('input',sound);},[active,typingSound]);
 // Only a fresh answer transition earns the cue; restored/revealed answers are silent.
 const completionResult=freeDictation?sentenceResult:draft.result;
 const completionState=useRef({key,result:completionResult});
 const completionCue=useMemo(createCompletionSound,[]);
 useLayoutEffect(()=>{
  if(!active||!(state.module==='spelling'||freeDictation))return;
  void completionCue.prepare();
  const unlock=(event:Event)=>{
   if(event.isTrusted&&navigator.userActivation?.isActive!==false&&event.target instanceof Node&&layoutRoot.current?.contains(event.target))completionCue.unlock();
  };
  const gestures=['pointerup','click','keydown'];
  for(const gesture of gestures)document.addEventListener(gesture,unlock,true);
  return ()=>{for(const gesture of gestures)document.removeEventListener(gesture,unlock,true);completionCue.stop();};
 },[active,freeDictation,state.module,completionCue]);
 useEffect(()=>{
  const previous=completionState.current;completionState.current={key,result:completionResult};
  if(!active||previous.key!==key||previous.result)return;
  if(state.module==='spelling'&&(completionResult==='correct'||completionResult==='reviewed'))return completionCue.start(playCue=>playCue());
  if(freeDictation&&completionResult==='correct'&&sentence?.pending==='free'){
   const board=layoutRoot.current?.querySelector<HTMLElement>('.guided-input,.hard-dictation-peek');
   if(!board)return;
   let stopSweep:(()=>void)|undefined;
   const cancel=completionCue.start(playCue=>{
    const feedback=()=>{
     playCue();
     if(board.matches('.guided-input'))emitExperience([board.getBoundingClientRect()],true,true,particleEffect);
    };
    stopSweep=startDictationGoldSweep(board,feedback);
    if(!stopSweep)feedback();
   });
   return ()=>{cancel();stopSweep?.();};
  }
 },[key,completionResult,active,state.module,freeDictation,completionCue]);
 useEffect(()=>{window.addEventListener('pagehide',completionCue.stop);return()=>window.removeEventListener('pagehide',completionCue.stop);},[completionCue]);
 const sentenceEffects=useRef(new Set<string>());
 useEffect(()=>{if(!active||state.module!=='listening'||state.mode!=='chunks'||sentence?.outcomes.chunks!=='correct')return;const stamp=`${key}:chunks`;if(sentenceEffects.current.has(stamp))return;sentenceEffects.current.add(stamp);if(sentence.pending!=='chunks')return;const sources=[...document.querySelectorAll('.selected-chunk')].map(n=>n.getBoundingClientRect());emitExperience(sources,true,true,particleEffect);},[key,state.mode,sentence?.outcomes,state.module,active]);
 useEffect(()=>{if(!active)clearExperienceEffects();},[active]);
 useEffect(()=>{
  for(const w of deck.words){const d=state.words[w.id];if(d?.result==='correct'||d?.result==='reviewed')award({id:`spell:${studyEventScope(deck,state,w)}:${w.id}`,kind:'spelling',result:d.result,wordKey:w.occurrenceID?.trim()?'occurrence:'+w.occurrenceID.trim():w.english.toLowerCase().trim()});}
  for(const p of prompts){const d=state.sentences[p.key];for(const mode of ['chunks','free'])if(d?.outcomes[mode]==='correct')award({id:`dictation:${studyEventScope(deck,state,deck.words[p.wordIndex])}:${studySentenceKey(deck,p)}:${mode}`,kind:'dictation',mode,correct:true,wordCount:writtenWords(p.sentence).length});}
 },[key,draft.result,sentence?.outcomes,state.round]);
 const act=(action:Action)=>{if(action.type==='retry')audio.stop();dispatch({type:'sentence',action});if(action.type==='giveUp'&&prompt)audio.play([prompt.sentence],state.rate,undefined,0,promptAudio);};
 const revealWord=()=>{if(!active||!word||draft.result)return;revealAudio.current=word.id;dispatch({type:'reveal'});};
 // Create a stable shuffled bank once, even before the first chip is selected.
 useEffect(()=>{if(prompt&&!state.sentences[prompt.key])setState((s:any)=>({...s,sentences:{...s.sentences,[prompt.key]:newSentence(prompt)}}));},[prompt?.key]);
 const portableHistoryRef=useRef(state.history);portableHistoryRef.current=state.history;
 useEffect(()=>{let cancelled=false;const refresh=()=>{const initial=portableHistoryRef.current;portableHistory(deck).then(history=>{if(!cancelled)setState((s:any)=>({...s,history:{...s.history,...Object.fromEntries(Object.entries(history).filter(([id])=>s.history[id]===initial[id]))}}));}).catch(e=>notify(e.message));};refresh();window.addEventListener('piclex-progress-imported',refresh);return()=>{cancelled=true;window.removeEventListener('piclex-progress-imported',refresh);};},[deck.fingerprint]);
 const portablePrevious=useRef({words:state.words,round:state.round});
 useEffect(()=>{const previous=portablePrevious.current;portablePrevious.current={words:state.words,round:state.round};const words=Object.fromEntries(Object.entries(state.words).filter(([id,d]:[string,any])=>d.result&&(previous.round!==state.round||previous.words[id]?.result!==d.result)));if(Object.keys(words).length)void recordPortableStudy(deck,{...state,words}).catch(e=>notify(e.message));},[key,draft.result,state.round]);
 useStudyPersistence(storageKey,state,`${key}:${draft.result}:${sentence?.outcomes.chunks}:${sentence?.outcomes.free}`,()=>{if(!warned.current){warned.current=true;notify('浏览器无法保存进度；关闭页面后可能无法恢复。');}});
 useEffect(()=>{
  const visibility=()=>{setVisible(!document.hidden);if(document.hidden){pauseListeningRef.current();setState((s:any)=>reduceStudy(deck,s,{type:'pause',question:studyKey(s)}));}};
  const leave=()=>pauseListeningRef.current();
  document.addEventListener('visibilitychange',visibility,true);window.addEventListener('pagehide',leave,true);
  return()=>{document.removeEventListener('visibilitychange',visibility,true);window.removeEventListener('pagehide',leave,true);};
 },[deck]);
 const focusAnswer=()=>{
  const fields=[...(layoutRoot.current?.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('.spelling-input,.guided-input input,.dictation-input')||[])];
  const words=freeDictation&&prompt&&state.difficulty!=='hard'?writtenWords(prompt.sentence):[];
  const incomplete=words.length
   ? fields.find((node,i)=>/[a-z]/i.test(words[i]||'')&&node.value.replace(/[^\p{L}\p{N}]/gu,'').length<words[i].replace(/[^\p{L}\p{N}]/gu,'').length)
   : fields.find(node=>!node.value);
  const remembered=freeDictation?fields.find(node=>node===dictationFocus.current):undefined;
  const target=fields.find(node=>node===document.activeElement)||remembered||incomplete||fields[0];
  if(target&&target!==document.activeElement){target.focus({preventScroll:true});if(target!==remembered)target.setSelectionRange(target.value.length,target.value.length);}
 };
 useLayoutEffect(()=>{
  if(!freeDictation||!active||!prompt||state.sentenceFinished||sentenceResult)return;
  const interactive='button,a[href],label,summary,input,textarea,select,[contenteditable],[tabindex="0"],[role=button],[role=menuitem],dialog,[role=dialog],.sentence-ambience';
  const resume=()=>{
   const root=layoutRoot.current;
   if(!root||document.hidden||!matchMedia('(any-hover: hover) and (any-pointer: fine)').matches||document.querySelector('dialog[open],[role=dialog],.sentence-ambience[open]'))return;
   focusAnswer();
  };
  const click=(event:MouseEvent)=>{
   if(event.button!==0||event.detail!==1||('pointerType' in event&&event.pointerType!=='mouse'))return;
   if(event.target instanceof Element&&!event.target.closest(interactive))resume();
  };
  const focus=()=>{if(!document.activeElement?.closest(interactive))resume();};
  document.addEventListener('click',click);window.addEventListener('focus',focus);
  return()=>{document.removeEventListener('click',click);window.removeEventListener('focus',focus);};
 },[freeDictation,active,key,state.sentenceFinished,sentenceResult]);
 useEffect(()=>{if(playback&&active&&listenRun)audio.stopPlayback();else audio.stop();audio.clearError();setImeWarning(false);setComposing(false);if(active&&!complete)focusAnswer();},[key,panel]);
 useEffect(()=>{setSeek(0);setPass(0);},[prompt?.key,state.module,state.mode]);
 useEffect(()=>{if(audio.error)setListenRun(false);},[audio.error]);
 useLayoutEffect(()=>{if(active&&!complete&&(state.module==='spelling'||!state.sentenceFinished))focusAnswer();},[key,panel,state.difficulty,active]);
 useEffect(()=>{
  if(!active||!word)return;
  if(revealAudio.current===word.id&&draft.result==='revealed'){revealAudio.current=null;navigationAudio.current=null;audio.play([word.english],state.rate);return;}
  const intent=navigationAudio.current,current=state.module==='spelling'?word.id:prompt?.key;
  if(!intent||intent.module!==state.module||intent.from===current||!current||state.sentenceFinished||state.module==='speaking'||playback)return;
  const timer=setTimeout(()=>{navigationAudio.current=null;if(state.module==='spelling')audio.play(word.example?(word.audio?[word.example]:[word.example,word.english]):[word.english],state.rate,undefined,0,word.example?word.audio:undefined);else if(prompt)audio.play([prompt.sentence],state.rate,undefined,0,promptAudio);},120);
  return ()=>clearTimeout(timer);
 },[key,active,draft.result]);

 useEffect(()=>{if(!active)return;const isWord=state.module==='spelling'&&state.pending==='word',isSentence=state.module==='listening'&&state.mode!=='listening'&&sentence?.pending===state.mode;
  if(!isWord&&!isSentence)return;const timer=setTimeout(()=>dispatch({type:isWord?'next':'sentenceNext'}),isWord?300:matchMedia('(prefers-reduced-motion: reduce)').matches?450:1000);return()=>clearTimeout(timer);
 },[key,active,state.pending,sentence?.pending]);
 const openPanel=(value:'gallery'|'settings'|'download'|'level')=>{pauseListening();dispatch({type:'pause'});setPanel(value);};
 // An explicit Learning entry opens spelling without discarding any saved drafts.
 useLayoutEffect(()=>{if(!spellingRequest)return;consumeSpellingRequest(spellingRequest);if(spellingRequest<=acceptedSpellingSequence)return;acceptedSpellingSequence=spellingRequest;if(parseLearningURL(location.hash)?.module)return;navigationAudio.current=null;readingContinuation.current=false;setListenRun(false);audio.stop();setPanel(null);setState((current:any)=>reduceStudy(deck,current,{type:'module',value:'spelling',question:studyKey(current)}));},[spellingRequest]);
 const selectModule=(value:string)=>{if(value===state.module)return;readingContinuation.current=false;setListenRun(false);audio.stop();flushSync(()=>dispatch({type:'module',value}));focusAnswer();};
 const setMode=(value:string)=>{if(value===state.mode)return;setListenRun(false);setPass(0);audio.stop();flushSync(()=>dispatch({type:'mode',value}));focusAnswer();};
 const setDifficulty=(value:string)=>{setComposing(false);setImeWarning(false);flushSync(()=>dispatch({type:'preference',name:'difficulty',value}));focusAnswer();};
 const replay=()=>{if(!active)return;navigationAudio.current=null;if(state.module==='spelling'&&word)audio.play(word.example?[word.example,word.english]:[word.english],state.rate,undefined,0,word.example?word.audio:undefined);else if(prompt){act({type:'play',rate:state.rate});audio.play([prompt.sentence],state.rate,undefined,0,promptAudio);}};
 // First-load sound stays inside spelling and sentence exercises. Passive
 // listening already has transport state, and speaking has its own microphone
 // controls; neither should start audio behind the user's back.
 const autoAudioScope=state.module==='spelling'||state.module==='listening'&&state.mode!=='listening';
 const playCurrent=(automatic=false)=>{
  if(!active||complete||panel||!autoAudioScope)return;
  if(state.module==='spelling'&&word)audio.play(word.example?[word.example,word.english]:[word.english],state.rate,undefined,0,word.example?word.audio:undefined,0,automatic);
  else if(state.module==='listening'&&prompt&&!state.sentenceFinished)audio.play([prompt.sentence],state.rate,undefined,0,promptAudio,0,automatic);
 };playCurrentRef.current=playCurrent;
 const retryCurrent=()=>{if(!audio.retryBlocked())playCurrentRef.current();};
 useEffect(()=>{
  if(!bootAudio.current)return;
  const timer=setTimeout(()=>{
   if(!bootAudio.current)return;bootAudio.current=false;
   if(!document.hidden)playCurrentRef.current(true);
  },0);
  return ()=>clearTimeout(timer);
 },[]);
 // A first real click/tap or hardware letter retries the retained segment in
 // the same gesture scope. It never prevents the input or repeats later keys.
 useLayoutEffect(()=>{
  if(!active||panel||!autoAudioScope)return;
  // Listen before the page can accept input, including the interval between a
  // denied play() and its blocked-state render. The request ref is immediate;
  // ordinary later gestures have no pending request and must not replay.
  const retryGesture=()=>{if(!audio.retryBlocked()&&audio.blocked)playCurrentRef.current();};
  const excluded='.audio-unlock,.native-header,.module-tabs,.sentence-toolbar,.native-playback,.listening-transport,.listening-metadata,.reading-actions,.reading-next,.native-primary,.sentence-actions,.peek-letter,.photo-open,.native-completion,.native-example,.practice-library,[role=dialog]';
  const click=(event:MouseEvent)=>{const target=event.target as Element|null;if(!event.isTrusted)return;if(target?.closest?.(excluded)){audio.acknowledgeGesture();return;}retryGesture();};
  const key=(event:KeyboardEvent)=>{if(!event.isTrusted||event.repeat||event.isComposing||event.metaKey||event.ctrlKey||event.altKey)return;if(/^[a-z]$/i.test(event.key)||/^Key[A-Z]$/.test(event.code))retryGesture();};
  document.addEventListener('click',click);window.addEventListener('keydown',key,true);
  return ()=>{document.removeEventListener('click',click);window.removeEventListener('keydown',key,true);};
 },[audio.blocked,audio.retryBlocked,active,panel,autoAudioScope,state.module,state.mode]);
 const setRate=(rate:number)=>{if(playback&&listenRun)setSeek(promptAudio?audio.readProgress():Math.max(0,audio.position));navigationAudio.current=null;dispatch({type:'preference',name:'rate',value:rate});if(state.module==='listening'&&!playback)act({type:'play',rate});if(!playback&&word)audio.play(state.module==='spelling'?(word.example?[word.example,word.english]:[word.english]):[prompt.sentence],rate,undefined,0,state.module==='spelling'?(word.example?word.audio:undefined):promptAudio);};
 useEffect(()=>{if(!listenRun||!active||!playback||!prompt||state.sentenceFinished)return;
  const rate=repeat==='fastThreeSlowTwo'?(pass<3?1:.75):state.rate;
  audio.play([promptAudio?prompt.sentence:prompt.sentence.slice(seek)],rate,()=>{
   const count=repeat==='single'?Infinity:repeat==='once'?1:5;
   if(pass+1<count){setSeek(0);setPass(p=>p+1);}else{
    setPass(0);setSeek(0);
    dispatch({type:'listeningJump',index:nextListeningIndex});
    setSeekRevision(n=>n+1);
   }
  },promptAudio?0:seek,promptAudio,promptAudio?seek:0);
  return audio.stopPlayback;
 },[listenRun,active,playback,prompt?.key,pass,repeat,state.rate,seek,seekRevision,onePhoto,nextListeningIndex]);
 // Start the current segment first so it can claim the previous preload.
 useEffect(()=>{
  audio.preloadClip(active&&listenRun&&repeat!=='single'&&!state.sentenceFinished?nextRecording:undefined);
 },[audio.preloadClip,active,listenRun,repeat,nextRecording,state.sentenceFinished]);
 useEffect(()=>{
  if(!desktopShortcut)return;
  // Capture Space before EnglishInput can treat it as printable text. Native
  // button/select activation, dialogs and menus keep their own handling.
  const space=(e:KeyboardEvent)=>{
   if(e.key!==' '||e.repeat||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||composing||e.isComposing||e.keyCode===229)return;
   if(!active||complete||panel||document.hidden)return;
   if(!(state.module==='spelling'&&word||state.module==='listening'&&(state.mode==='chunks'||state.mode==='free')&&prompt&&!state.sentenceFinished))return;
   if(document.querySelector('dialog[open],[role=dialog],.sentence-ambience[open],.chunk-menu'))return;
   const target=e.target instanceof HTMLElement?e.target:null;if(!target)return;
   if(target.closest('button,a,summary,select,[contenteditable=true],[role=button],[role=menuitem]'))return;
   const field=target.closest('input,textarea');
   if(field&&!field.matches('.spelling-input,.guided-input input,.dictation-input'))return;
   if(!(target.closest('.native-practice')||target===document.body||target===document.documentElement||target.id==='main-content'))return;
   e.preventDefault();e.stopPropagation();replay();
  };
  window.addEventListener('keydown',space,true);return()=>window.removeEventListener('keydown',space,true);
 });
 useEffect(()=>{const keyboard=(e:KeyboardEvent)=>{
  const hardwareKey=/^Key[A-Z]$/.test(e.code)&&(e.key==='Process'||e.key==='Unidentified'||e.keyCode===229)?(e.shiftKey?e.code.slice(3):e.code.slice(3).toLowerCase()):e.key;
  if(e.defaultPrevented||!active||composing||e.isComposing||(e.keyCode===229&&hardwareKey===e.key)||e.metaKey||e.ctrlKey||e.altKey)return;
  const target=e.target instanceof HTMLElement?e.target:null;
  // Replay and hint buttons may keep focus after a click. Resume typing without
  // capturing other fields, dialogs, browser shortcuts, or button activation keys.
  if(state.module==='spelling'&&!draft.result&&target&&!target.closest('input,textarea,select,[contenteditable=true],[role=dialog]')&&(target===document.body||target===document.documentElement||target.id==='main-content'||!!target.closest('.native-practice'))&&(/^[a-z]$/i.test(hardwareKey)||hardwareKey==='Backspace'||hardwareKey==='Delete')){
   e.preventDefault();focusAnswer();virtualPress(hardwareKey);return;
  }
  if(e.repeat||e.shiftKey)return;
  const shortcutTarget=target?.closest('.native-practice')||target===document.body||target===document.documentElement||target?.id==='main-content';
  const shortcutBlocked=target?.closest('select,dialog,[role=dialog],[contenteditable=true],.sentence-ambience')||document.querySelector('.sentence-ambience[open],.chunk-menu');
  const shortcutField=target?.closest('input,textarea');
  if(desktopShortcut&&e.key==='Escape'&&!complete&&state.module==='listening'&&prompt&&!state.sentenceFinished&&(state.mode==='chunks'||state.mode==='free')&&!sentenceResult&&!shortcutBlocked&&shortcutTarget&&(!shortcutField||shortcutField.matches('.guided-input input,.dictation-input'))){
   e.preventDefault();act({type:'giveUp'});return;
  }
  if(state.module==='spelling'&&e.key==='Escape'&&!draft.result&&!shortcutBlocked&&(!shortcutField||shortcutField.matches('.spelling-input'))&&(shortcutTarget||target===document.body||target===document.documentElement||target?.id==='main-content')){
   e.preventDefault();revealWord();return;
  }
  if(e.target!==input.current&&e.target!==document.body&&e.target!==document.documentElement)return;
  if(state.module==='spelling'){if(e.key===' '){e.preventDefault();replay();}if(e.key==='Enter'&&draft.result){e.preventDefault();dispatch({type:'next'});}}
 };window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);});
 const virtualPress=(pressed:string)=>{
  if(!active||complete||composing)return;
  if(state.module==='spelling'){
   input.current?.focus({preventScroll:true});
   if(pressed===' '){replay();return;}
   if(pressed==='Escape'){revealWord();return;}
   if(pressed==='Enter'){if(draft.result)dispatch({type:'next'});return;}
   if(draft.result)return;
   const edited=editSpellingText(expectedInput(word,draft),draft.input,input.current?.selectionStart,input.current?.selectionEnd,pressed);
   if(edited){setImeWarning(false);if(typingSound)playTypingSound();flushSync(()=>dispatch({type:'input',value:edited.value}));input.current?.setSelectionRange(edited.cursor,edited.end);}
  }else if(state.module==='listening'&&state.mode==='free'&&!state.sentenceFinished){
   if(pressed===' ')return;
   if(sentenceResult){if(pressed==='Enter'&&sentence.pending!==state.mode)dispatch({type:'sentenceNext'});return;}
   const inputs=[...document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('.guided-input input,.dictation-input')];
   let target=inputs.find(node=>node===document.activeElement)||inputs.find(node=>!node.value)||inputs[0];if(!target)return;
   if(target.matches('.guided-input input')&&!/[a-z]/i.test(sentenceWords[inputs.indexOf(target)]||'')){target=inputs.find((node,j)=>j>inputs.indexOf(target)&&/[a-z]/i.test(sentenceWords[j]||''))!;if(!target)return;}
   target.focus({preventScroll:true});
   const index=inputs.indexOf(target);
   const edit=(field:HTMLInputElement|HTMLTextAreaElement,key:string)=>prompt?editDictationText(field.matches('.dictation-input')?prompt.sentence:(sentenceWords[inputs.indexOf(field)]||'').replace(/['’‘]/g,''),field.value,field.selectionStart,field.selectionEnd,key):editKeyboardText(field.value,field.selectionStart,field.selectionEnd,key);
   const commit=(field:HTMLInputElement|HTMLTextAreaElement,edited:{value:string;cursor:number})=>{
    const prototype=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(field,edited.value);field.setSelectionRange(edited.cursor,edited.cursor);flushSync(()=>field.dispatchEvent(new Event('input',{bubbles:true})));if(field===document.activeElement)field.setSelectionRange(Math.min(edited.cursor,field.value.length),Math.min(edited.cursor,field.value.length));
   };
   if(pressed==='Escape'){act({type:'giveUp'});return;}
   if(pressed==='Backspace'&&target.selectionStart===target.selectionEnd&&target.selectionStart===0){
    const previous=inputs.slice(0,index).filter((node,j)=>/[a-z]/i.test(sentenceWords[j]||'')).at(-1);if(previous){previous.focus({preventScroll:true});previous.setSelectionRange(previous.value.length,previous.value.length);const edited=edit(previous,'Backspace');if(edited)commit(previous,edited);}return;
   }
   if(pressed==='Enter'){const next=inputs[index+1];if(next)next.focus({preventScroll:true});else act({type:'submit'});return;}
   const edited=edit(target,pressed);if(!edited)return;commit(target,edited);
  }
 };
 const required=word?expectedInput(word,draft):'',wrong=word?mismatch(required,draft.input):-1;
 const progress=completionProgress(required,draft.input);
 const results=Object.values(state.words) as any[],correct=results.filter(d=>d.result==='correct').length,reviewed=results.filter(d=>d.result&&d.result!=='correct').length;
 const sentenceWords=prompt?writtenWords(prompt.sentence):[];
 const photoPalette=usePhotoPalette();
 const spellingPhotoBudget=useRef<{height:number;photo:number}|null>(null);
 useLayoutEffect(()=>{
  const root=layoutRoot.current;if(!root)return;
  let frame=0;
  const update=()=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    const photo=root.querySelector<HTMLElement>('.photo-browse');if(!photo)return;
    const style=getComputedStyle(root),body=root.querySelector<HTMLElement>('.native-body')!;
    const height=(node:Element)=>{const s=getComputedStyle(node);return node.getBoundingClientRect().height+parseFloat(s.marginTop)+parseFloat(s.marginBottom);};
    // Measure real controls, including feedback and wrapped dictation. Preserve a
    // readable photograph on exceptionally short screens; only those scroll.
    const siblings=[...root.children].filter(n=>n!==body&&getComputedStyle(n).position!=='absolute'&&getComputedStyle(n).position!=='fixed'&&n.tagName!=='DIALOG');
    const bodyExtras=[...body.children].reduce((sum,n)=>sum+(n.classList.contains('native-card')?height(n)-photo.getBoundingClientRect().height:height(n)),0);
    const available=root.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-parseFloat(style.rowGap)*siblings.length-siblings.reduce((sum,n)=>sum+height(n),0)-bodyExtras;
    const minimum=desktopKeyboard?220:140,preferred=word?.example?330:270;
    const matched=state.module!=='spelling'&&spellingPhotoBudget.current?Math.max(minimum,Math.min(preferred,spellingPhotoBudget.current.photo+root.clientHeight-spellingPhotoBudget.current.height)):preferred;
    const target=Math.max(minimum,Math.min(preferred,matched,Math.floor(available)));
    if(state.module==='spelling')spellingPhotoBudget.current={height:root.clientHeight,photo:target};
    if(root.style.getPropertyValue('--photo-height')!==`${target}px`)root.style.setProperty('--photo-height',`${target}px`);
    revealFocusedAnswer();
   });
  };
  const observer=new ResizeObserver(update);
  for(const element of [root,...root.querySelectorAll('.native-header,.module-tabs,.virtual-keyboard,.native-answer-footer,.native-hint,.sentence-toolbar,.native-example,.sentence-content')])observer.observe(element);
  update();return()=>{cancelAnimationFrame(frame);observer.disconnect();};
 },[state.module,state.mode,state.difficulty,desktopKeyboard,!!word?.example,complete]);
 const held=useRef(new Set<number>()),swipe=useRef<{x:number;y:number}|null>(null),suppressPhoto=useRef(0);
 return <main onFocusCapture={e=>{const field=e.target;if((field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement)&&field.matches('.guided-input input,.dictation-input'))dictationFocus.current=field;revealFocusedAnswer();}} ref={layoutRoot} style={photoPalette.style} className="native-practice" data-example={!!word?.example} data-module={state.module} data-mode={state.mode} aria-label="学习">
  {imeWarning&&<div className="english-input-warning" role="status">请切换到英语输入法</div>}
  <header className="native-header">{state.module!=='spelling'&&<button className="native-back" aria-label="返回单词学习" onClick={()=>selectModule('spelling')}><Icon name="back"/></button>}<PracticeProgress deckTitle={deck.title} position={state.index} count={deck.words.length} openLevel={()=>openPanel('level')} openDeck={()=>openPanel('settings')}/><button className="practice-library" aria-label="下载第三方卡组" onClick={()=>openPanel('download')}><strong>下载</strong><small>第三方卡组</small></button></header>
  <div className="module-tabs" role="tablist" aria-label="学习模块">{modules.map(([id,title])=><button role="tab" aria-selected={state.module===id} key={id} onClick={()=>selectModule(id)}>{state.module===id&&<Icon name={id==='spelling'?'keycap':id==='listening'?'headphones':'microphone'}/>}<span>{title}</span></button>)}</div>
  {complete?<section className="native-completion"><h1>{state.module==='speaking'?'本轮口语练习完成':'本轮训练完成'}</h1>{state.module==='speaking'?<p>已到达卡组末尾。</p>:<p>拼对 {correct} 个词，复习 {reviewed} 个词。</p>}<button className="native-primary" onClick={()=>dispatch({type:'restart'})}>再来一轮</button><button className="native-button" onClick={exit}>换个卡组</button>{state.module==='spelling'?<label className="settings-row native-completion-quick"><span>快拼{xp.level<6&&!state.quick?' · LV6 解锁':''}<small>开启快拼后，只拼写曾经错误的字符</small></span><input aria-label="快拼" type="checkbox" role="switch" disabled={xp.level<6&&!state.quick} checked={state.quick} onChange={e=>dispatch({type:'preference',name:'quick',value:e.target.checked})}/></label>:<button className="text-button" onClick={download}>下载卡组，在 App 中打开</button>}</section>:<>
   <div className="native-body" onPointerDown={e=>{if(e.pointerType==='mouse'||(e.target as HTMLElement).closest('input,textarea,select,.chunk,.reading-content,.native-example'))return;swipe.current={x:e.clientX,y:e.clientY};}} onPointerUp={e=>{const start=swipe.current;swipe.current=null;if(!start||panel||held.current.size>1)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.4){const i=modules.findIndex(([id])=>id===state.module),target=modules[i+(dx<0?1:-1)];if(target){suppressPhoto.current=Date.now()+400;selectModule(target[0]);}}}} onPointerCancel={()=>{swipe.current=null;}}>
    <article className="native-card"><div className="photo-browse">
     <StablePhotoFocus cache={photos} onImageReady={photoPalette.read} src={deck.images[word.imageIndex]} fit={desktopKeyboard||state.module==='listening'?'contain':'focus'} focus={word.focus} alt={word.focus?'训练照片，彩色框标示当前物体':'完整场景照片'} active={active} retry={photoRetry} onLoadState={setPhotoState}/>{audio.blocked&&autoAudioScope&&<button className="audio-unlock" aria-label="开启声音，播放当前内容" title="点击开启声音" onClick={e=>{e.preventDefault();e.stopPropagation();retryCurrent();}} onPointerDown={e=>e.stopPropagation()}><MutedSpeakerIcon/></button>}<button className="photo-open" aria-label={photoState==='error'?'重新加载图片':'选择照片'} onClick={()=>{if(photoState==='error'){setPhotoRetry(n=>n+1);return;}if(Date.now()<suppressPhoto.current){suppressPhoto.current=0;return;}openPanel('gallery');}} onPointerDown={e=>{held.current.add(e.pointerId);if(held.current.size>1)openPanel('gallery');}} onPointerUp={e=>held.current.delete(e.pointerId)} onPointerCancel={()=>held.current.clear()}></button></div>
     {state.module==='spelling'?<div className="native-hint"><button aria-label={state.hiddenChinese?'显示中文提示':'隐藏中文提示'} aria-pressed={state.hiddenChinese} onClick={()=>dispatch({type:'preference',name:'hiddenChinese',value:!state.hiddenChinese})}><h1 className="native-hint-word" data-hidden={state.hiddenChinese}><span className="native-hint-word-text" aria-hidden={state.hiddenChinese||undefined}>{word.chinese}</span></h1><small>{word.phonetic}</small></button>{ambienceControl}</div>:state.module==='listening'?<div className="sentence-toolbar"><select aria-label="句子练习模式" value={state.mode} onChange={e=>setMode(e.target.value)}>{modes.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select>{ambienceControl}{state.mode==='free'&&<select aria-label="听写难度" value={state.difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="easy">简单 · 字母数量</option><option value="medium">中等 · 单词数量</option><option value="hard">困难 · 无提示</option></select>}</div>:null}
    </article>
    {state.module==='spelling'&&word.example&&<SentenceLine sentence={word.example} target={word.english} translation={word.exampleChinese} hidden={state.hiddenChinese} position={audio.position} open={()=>selectModule('speaking')}/>}
    {state.module==='listening'&&(!prompt?<p className="native-unavailable">这张卡片没有可练习的例句。</p>:state.sentenceFinished?<section className="native-completion"><h2>本轮句子练习完成</h2><p>已到达卡组末尾。</p>{state.mode==='chunks'&&!sentence?.outcomes.free&&<button className="native-button" onClick={()=>dispatch({type:'dictationChallenge'})}>挑战这句自由听写</button>}<button className="native-primary" onClick={()=>dispatch({type:'dictationRestart'})}>再听写一轮</button><button className="native-button" onClick={()=>selectModule('spelling')}>返回单词学习</button></section>:<section className="sentence-content" aria-label={modes.find(([id])=>id===state.mode)?.[1]}>
     {state.mode==='listening'?<><p className="listening-sentence">{exampleWords(prompt.sentence).map((w,i)=><span className={audio.position>=w.start&&audio.position<w.end?'spoken-word':''} key={i}>{w.text} </span>)}</p><p className="muted">{prompt.translation}</p>{audio.preparing&&<p className="small muted" role="status">正在准备当前句，准备好后立即播放</p>}{audio.error&&<p role="alert">{audio.error}</p>}</>:state.mode==='chunks'?<><p className="chunk-instruction">{sentence.selected.length?'点词块可撤回，长按或右键可调整位置':'听一句，点选词块拼成句子'}</p><div className="chunk-answer" aria-label="已选词块">{sentence.selected.map((id:number)=><Chunk key={id} text={sentence.chunks[id].text} disabled={!!sentenceResult} remove={()=>act({type:'remove',id})} move={offset=>act({type:'move',id,offset})}/>)}</div><div className="chunk-bank" aria-label="待选词块">{sentence.bank.filter((id:number)=>!sentence.selected.includes(id)).map((id:number)=><button className="chunk" key={id} disabled={!!sentenceResult} onClick={()=>act({type:'select',id})}>{sentence.chunks[id].text}</button>)}</div></>:state.difficulty==='hard'?<HardDictationInput deckWord={deck.words[prompt.wordIndex].english} deckMeaning={deck.words[prompt.wordIndex].chinese} promptKey={prompt.key} sentence={prompt.sentence} value={sentence.freeText} disabled={!!sentenceResult} onWarning={setImeWarning} onComposing={setComposing} onVirtualKey={virtualPress} onValue={value=>act({type:'input',value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&!e.shiftKey){e.preventDefault();if(!sentenceResult)act({type:'submit'});else if(sentence.pending!==state.mode)dispatch({type:'sentenceNext'});}}}/>:<GuidedInput key={prompt.key} deckWord={deck.words[prompt.wordIndex].english} deckMeaning={deck.words[prompt.wordIndex].chinese} onVirtualKey={virtualPress} sentence={prompt.sentence} value={sentence.guided||sentenceWords.map((_:string,i:number)=>writtenWords(sentence.freeText)[i]||'')} difficulty={state.difficulty} disabled={!!sentenceResult} onWarning={setImeWarning} onComposing={setComposing} onSubmit={()=>{if(!sentenceResult)act({type:'submit'});else if(sentence.pending!==state.mode)dispatch({type:'sentenceNext'});}} onChange={values=>act({type:'guided',values})}/>}
     {sentenceResult==='assisted'?<p className="sentence-feedback" role="status">参考答案</p>:check&&!check.isCorrect&&<div className="sentence-feedback" role="status"><strong>再听一次，试着修改答案</strong>{state.mode==='chunks'?<p>词块顺序还需要调整。</p>:<><div className="sentence-diff">{check.edits.map((edit:any,i:number)=><span key={i} className={edit.kind==='match'?'matched':'needs-work'}>{edit.kind==='match'?edit.actual:edit.kind==='omission'?revealed?`遗漏：${edit.expected}`:'遗漏一词':edit.kind==='addition'?`多余：${edit.actual}`:revealed?`${edit.actual} → ${edit.expected}`:`替换：${edit.actual}`}</span>)}</div><button className="text-button" onClick={()=>act({type:revealed?'retry':'reveal'})}>{revealed?'重新拼写':'显示答案'}</button></>}</div>}
     {revealed&&<div className="standard-answer"><p>{prompt.sentence}</p><p className="muted">{prompt.translation}</p></div>}
    </section>)}
    {state.module==='speaking'&&(word.example?<Reading key={word.id} continuation={readingContinuation} word={word} active={active} audio={audio} rate={state.rate} notify={notify} saved={readingSaved.current} reward={(matched,count)=>award({id:`reading:${studyEventScope(deck,state,word)}:${word.id}`,kind:"reading",matched,wordCount:count})} next={()=>dispatch({type:'speakingNext'})}/>:<div><p className="native-unavailable">这张卡片没有可跟读的例句。</p><button className="native-button" onClick={()=>dispatch({type:'speakingNext'})}>下一句</button></div>)}
   </div>
   {state.module==='spelling'?<div className="native-answer-footer">
    <div className={`native-answer ${wrong>=0?'wrong':''}`} onClick={()=>input.current?.focus({preventScroll:true})}><AnswerSlots expected={word.english} entered={draft.input} revealed={draft.result==='revealed'} quickIndices={draft.quickIndices} scope={key} active={active} effect={particleEffect} completed={draft.result==='correct'||draft.result==='reviewed'} perfect={draft.result==='correct'}/><SpellingGlow progress={progress} complete={draft.result==='correct'||draft.result==='reviewed'} revealed={draft.result==='revealed'} error={wrong>=0} active={active} scope={`${deck.fingerprint}:${state.round}`}/><EnglishInput key={key} ref={input} label="输入英文" className="spelling-input" onVirtualKey={virtualPress} value={draft.input} readOnly={!!draft.result} onWarning={setImeWarning} onComposing={setComposing} onValue={value=>dispatch({type:'input',value})}/></div>
    <Playback play={replay} audio={audio} rate={state.rate} setRate={setRate} shortcut={desktopShortcut} label={word.example?'播放句子和单词':'播放单词'}/>
    {draft.result==='revealed'||draft.result&&!state.pending?<button className="native-primary" onClick={()=>dispatch({type:'next'})}>{state.index+1===deck.words.length?'完成本轮':'下一个'}</button>:<button className="native-primary" disabled={!!draft.result} aria-keyshortcuts={desktopShortcut?'Escape':undefined} onClick={revealWord}>不认识 <kbd className="esc-keycap" aria-hidden="true">Esc</kbd></button>}
   </div>:state.module==='listening'&&prompt&&!state.sentenceFinished?<div className="native-answer-footer sentence-footer">
    {playback?<><ListeningSeek onBegin={()=>{if(listenRun)setSeek(promptAudio?audio.readProgress():Math.max(0,audio.position));audio.stopPlayback();}} audio={audio} prompt={prompt.sentence} original={!!promptAudio} seek={seek} onSeek={value=>{audio.stopPlayback();setSeek(value);setSeekRevision(n=>n+1);}}/><div className="listening-metadata"><span aria-label="播放列表位置">{Math.max(0,playlist.indexOf(state.sentenceIndex))+1}/{playlist.length}</span><label className="listening-repeat"><span aria-hidden="true">↻</span><select aria-label="循环方式" value={repeat} onChange={e=>{if(listenRun)setSeek(promptAudio?audio.readProgress():Math.max(0,audio.position));setRepeat(e.target.value);setPass(0);writePreference('piclex-web.listening.repeat',e.target.value);}}>{repeatModes.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label><select aria-label="播放速度" disabled={repeat==='fastThreeSlowTwo'} value={repeat==='fastThreeSlowTwo'?(pass<3?1:.75):state.rate} onChange={e=>setRate(Number(e.target.value))}>{rates.map(r=><option key={r} value={r}>{r}×</option>)}</select></div><div className="listening-transport"><button className="native-button" aria-label="上一句" onClick={()=>skipListening(-1)}><span className="transport-skip previous" aria-hidden="true"/></button><button className="native-button" onClick={()=>{if(listenRun)pauseListening();else setListenRun(true);}}>{listenRun?<Icon name="pause"/>:<span className="transport-play" aria-hidden="true"/>}{audio.preparing&&listenRun?'准备中…':listenRun?'暂停':audio.error?'重新准备':'播放'}</button><button className="native-button" aria-label="下一句" onClick={()=>skipListening(1)}><span className="transport-skip" aria-hidden="true"/></button></div></>:<><Playback play={replay} audio={audio} rate={state.rate} setRate={setRate} shortcut={desktopShortcut}/>{sentenceResult&&sentence.pending!==state.mode?<div className="sentence-actions">{state.mode==='chunks'&&sentenceResult==='correct'&&<button className="native-button" onClick={()=>setMode('free')}>挑战自由听写</button>}<button className="native-primary" onClick={()=>dispatch({type:'sentenceNext'})}>下一个</button></div>:<div className={`sentence-actions${sentenceResult?' sentence-actions-pending':''}`} aria-hidden={sentenceResult?true:undefined} inert={!!sentenceResult}><button className="native-primary" aria-keyshortcuts={desktopShortcut&&!sentenceResult?'Escape':undefined} onClick={()=>act({type:'giveUp'})}>听不懂 <kbd className="esc-keycap" aria-hidden="true">Esc</kbd></button></div>}</>}
   </div>:null}
  </>}
  {!complete&&(state.module==='spelling'||state.module==='listening'&&state.mode==='free'&&!!prompt&&!state.sentenceFinished)&&<VirtualKeyboard active={active} press={virtualPress} lettersOnly />}
  {panel==='download'&&<DeckDownload close={()=>setPanel(null)} installed={installedDecks} save={saveDownloaded}/>}
  {panel==='level'&&<Dialog title="我的等级" close={()=>setPanel(null)}><LevelPage embedded openGame={openGame} gameBusy={gameBusy} learn={()=>{setPanel(null);selectModule('spelling');}}/></Dialog>}
  {panel&&panel!=='download'&&panel!=='level'&&<Dialog title={panel==='gallery'?'选择照片':'选择卡组'} close={()=>setPanel(null)}>{panel==='settings'?<DeckPicker choices={deckChoices} loadPurchaseChoices={loadPurchaseChoices} selectedID={deck.id} position={state.index} notify={notify} select={id=>{audio.stop();setPanel(null);selectDeck(id);}}/>:<><div className="gallery-tools"><button className="native-button" aria-label="分享卡组" onClick={share}><Icon name="share"/></button><button className="native-button" aria-label="下载卡组" onClick={download}>↓</button></div><div className="native-photo-grid">{deck.images.map((src,imageIndex)=>{const first=deck.words.findIndex(w=>w.imageIndex===imageIndex);return <button key={src} aria-label={`照片 ${imageIndex+1}`} aria-pressed={word?.imageIndex===imageIndex} onClick={()=>{dispatch({type:'selectWord',index:word?.imageIndex===imageIndex?state.index:first});setPanel(null);}}><img src={src} alt="" loading="lazy"/><span>{imageIndex+1}</span></button>;})}</div></>}</Dialog>}
 </main>;
}
function Chunk({text,disabled,remove,move}:{text:string;disabled:boolean;remove:()=>void;move:(offset:number)=>void}){
 const [menu,setMenu]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),long=useRef(false);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <span className="selected-chunk"><button className="chunk" disabled={disabled} onClick={()=>{if(!long.current)remove();long.current=false;}} onContextMenu={e=>{e.preventDefault();setMenu(true);}} onPointerDown={()=>{long.current=false;timer.current=setTimeout(()=>{long.current=true;setMenu(true);},450);}} onPointerUp={()=>clearTimeout(timer.current)} onPointerCancel={()=>clearTimeout(timer.current)} onKeyDown={e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}if(e.key==='Escape'){if(menu){e.preventDefault();e.stopPropagation();}setMenu(false);}}}>{text}</button>{menu&&!disabled&&<span className="chunk-menu"><button aria-label={`向前移动 ${text}`} onClick={()=>{move(-1);setMenu(false);}}><Icon name="back"/></button><button aria-label={`向后移动 ${text}`} onClick={()=>{move(1);setMenu(false);}}><Icon name="arrow"/></button><button aria-label={`撤回 ${text}`} onClick={remove}>撤回</button><button aria-label="关闭词块菜单" onClick={()=>setMenu(false)}><Icon name="close"/></button></span>}</span>;
}
