import SubscriptionSettings from './SubscriptionSettings';
import PhotoDataSettings from './PhotoDataSettings';
import AppearanceSettings from './AppearanceSettings';
import {ShutterSettings,SpeechSettings} from './SoundSettings';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {NativeIcon as Icon} from '../../../packages/learning-ui/src/NativeIcon';
import {useExperience} from './Experience';
import AISettings from './AISettings';
import {useAIModelLabel} from './ai-settings';
import {readPreference,writePreference} from './storage';
import {typingSounds,defaultTypingSound,currentTypingSound,prepareTypingSound,playTypingSound,stopTypingSound} from '../../../packages/learning-ui/src/typing-sound';

type Card={id:string;title:string;count:number;photoCount?:number;local?:boolean;subscribed?:boolean;sourceURL?:string;cover:string;covers?:Partial<Record<'portrait'|'landscape',string>>};
type Props={cards:Card[];ready:boolean;error:string;theme:string;setTheme:(mode:string)=>void;importFile:()=>void;exportDeck:(id:string)=>void;openDeck:(id:string)=>void;openGame:()=>void;gameBusy:boolean;gameDeckID:string;setGameDeckID:(id:string)=>void;notify:(message:string)=>void};
const asset=(path:string)=>`${import.meta.env.BASE_URL}${path}`;
const isOfficialDeck=(card:Card)=>!card.local&&card.sourceURL==='https://piclex.v2fy.com/decks/source.json';
const names:Record<string,string>={ai:'AI配置',decks:'照片卡组',data:'照片数据',appearance:'外观与主题',personalization:'个性化设置',about:'关于',keyboard:'键盘声音',laboratory:'实验室',particles:'粒子效果',shutter:'快门声音',speech:'朗读声音',themes:'内置主题'};
function Row({title,value,action}:{title:string;value?:string;action:()=>void}){return <button className="settings-row" onClick={action}><span>{title}</span>{value&&<span className="settings-value">{value}</span>}<Icon name="forward"/></button>;}
function Page({title,back,children}:{title:string;back:string;children:ReactNode}){return <main className="settings-page native-settings-detail"><header className="settings-detail-header"><button aria-label={`返回${names[back]||'设置'}`} onClick={()=>{location.hash=back?`/settings/${back}`:'/settings';}}><Icon name="back"/></button><h1>{title}</h1></header><div className="settings-detail-content">{children}</div></main>;}
function KeyboardSettings({notify}:{notify:(message:string)=>void}){const [enabled,setEnabled]=useState(()=>readPreference('piclex-web.typing-sound')!=='false'),[selected,setSelected]=useState(currentTypingSound);const xp=useExperience();useEffect(()=>{if(enabled)prepareTypingSound(selected);return stopTypingSound;},[enabled]);function preview(id=selected){if(!enabled){notify('请先开启键盘敲击音。');return;}void playTypingSound(id).then(ok=>{if(!ok)notify('暂时无法播放，请重试并检查设备音量。');});}return <><label className="settings-row"><span>键盘敲击音</span><input type="checkbox" role="switch" aria-label="键盘敲击音" checked={enabled} onChange={e=>{setEnabled(e.target.checked);writePreference('piclex-web.typing-sound',String(e.target.checked));if(!e.target.checked)stopTypingSound();}}/></label><label className="settings-row"><span>按键音</span><select aria-label="按键音" value={selected} onChange={e=>{const id=e.target.value;writePreference('piclex-web.typing-sound-id',id);setSelected(id);preview(id);}}>{typingSounds.map(s=><option key={s.id} value={s.id} disabled={s.id!==defaultTypingSound&&s.id!=='classic'&&xp.level<3}>{s.label}{s.id!==defaultTypingSound&&s.id!=='classic'&&xp.level<3?' · LV3 解锁':''}</option>)}</select></label><button className="settings-row" onClick={()=>preview()}>试听当前按键音</button><p className="settings-footnote">按键音使用设备媒体音量；听不到时请调高音量。</p></>;}
function OfficialDeckCarousel({cards,cover,openDeck}:{cards:Card[];cover:(card:Card)=>string;openDeck:(id:string)=>void}) {
 const rail=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const element=rail.current;if(!element)return;
  let selected=0,interacting=false,frame=0,timer:ReturnType<typeof setTimeout>|undefined;
  const nearest=()=>{
   const buttons=Array.from(element.querySelectorAll('button'));
   const origin=buttons[0]?.offsetLeft??0;
   let index=0,distance=Infinity;
   buttons.forEach((button,i)=>{const delta=Math.abs(button.offsetLeft-origin-element.scrollLeft);if(delta<distance){index=i;distance=delta;}});
   return index;
  };
  const begin=()=>{interacting=true;};
  const finish=()=>{interacting=false;selected=nearest();};
  const scroll=()=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    const next=nearest();
    if(interacting&&next!==selected){try{navigator.vibrate?.(12);}catch{/* Browser may deny haptics. */}}
    selected=next;
   });
   clearTimeout(timer);timer=setTimeout(finish,180);
  };
  const resize=new ResizeObserver(()=>{selected=nearest();interacting=false;});resize.observe(element);
  element.addEventListener('pointerdown',begin,{passive:true});
  element.addEventListener('touchstart',begin,{passive:true});
  element.addEventListener('wheel',begin,{passive:true});
  element.addEventListener('keydown',begin);
  element.addEventListener('scroll',scroll,{passive:true});
  element.addEventListener('scrollend',finish);
  return()=>{cancelAnimationFrame(frame);clearTimeout(timer);resize.disconnect();element.removeEventListener('pointerdown',begin);element.removeEventListener('touchstart',begin);element.removeEventListener('wheel',begin);element.removeEventListener('keydown',begin);element.removeEventListener('scroll',scroll);element.removeEventListener('scrollend',finish);};
 },[cards.map(card=>card.id).join('|')]);
 return <div ref={rail} className="settings-official-carousel">{cards.map(c=><button key={c.id} onClick={()=>openDeck(c.id)}><img src={cover(c)} alt={c.title} loading="lazy"/><span>已下载</span></button>)}</div>;
}
export default function Settings(props:Props){const {cards,ready,error,theme,setTheme,importFile,exportDeck,openDeck,openGame,gameBusy,gameDeckID,setGameDeckID,notify}=props;
 const aiModelLabel=useAIModelLabel();
 const [path,setPath]=useState(()=>location.hash.split('/').slice(2).join('/')||'');useEffect(()=>{const update=()=>setPath(location.hash.split('/').slice(2).join('/')||'');window.addEventListener('hashchange',update);update();return()=>window.removeEventListener('hashchange',update);},[]);
 const [deckFilter,setDeckFilter]=useState<'official'|'personal'>('personal');const xp=useExperience();const [effect,setEffect]=useState(()=>readPreference('piclex-web.particle-effect')||'socialCode');
 const [onePhoto,setOnePhoto]=useState(()=>readPreference('piclex-web.listening.single-photo')==='true');
 const [quick,setQuick]=useState(()=>readPreference('piclex-web.quick')==='true'),[importAnimation,setImportAnimation]=useState(()=>readPreference('piclex-web.import-animation')!=='false');
 const open=(name:string)=>{location.hash=`/settings/${name}`;};
 const official=cards.filter(isOfficialDeck);
 const personal=cards.filter(c=>!isOfficialDeck(c));
 const own=personal.filter(c=>c.local&&!c.subscribed);
 const subscribed=personal.filter(c=>!c.local||c.subscribed);
 function cover(c:Card){const url=c.covers?.portrait||c.cover;return c.local?url:asset(url);}
 function deckList(values:Card[],exporting=false){
  if(exporting)return <div className="settings-deck-list">{values.map(c=><button key={c.id} className="settings-deck-item" onClick={()=>exportDeck(c.id)}><img src={cover(c)} alt="" loading="lazy"/><span><strong>{c.title}</strong><small>{c.count} 个词</small></span><Icon name="forward"/></button>)}</div>;
  return <div className="settings-deck-list settings-deck-grid">{values.map(c=><button key={c.id} className="settings-deck-item settings-deck-card" data-official={isOfficialDeck(c)} onClick={()=>openDeck(c.id)}><img src={cover(c)} alt="" loading="lazy"/><span className="settings-deck-meta"><strong title={c.title}>{c.title}</strong><small className="settings-deck-counts">{c.photoCount!==undefined&&<span>{c.photoCount} 张卡牌</span>}<span>{c.count} 个单词</span></small></span></button>)}</div>;
 }
 if(!path)return <main className="settings-page native-settings-home" aria-label="设置"><button className="settings-level-card" aria-label={`用户等级，LV${xp.level}，当前经验 ${xp.total} 点`} onClick={()=>open('level')}><span className="settings-level-inset"><span className="settings-level-heading"><strong>LV{xp.level}</strong><small>再获得 {xp.remaining} 点经验升级</small></span><span className="learning-experience" role="progressbar" aria-label="等级经验" aria-valuenow={Math.round(xp.fraction*100)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${xp.fraction*100}%`}}/></span></span><span className="settings-level-total"><small>当前经验</small><strong>{xp.total}</strong></span></button><div className="settings-home-rows"><Row title="AI配置" value={aiModelLabel} action={()=>open('ai')}/><section className="settings-official"><header><h2>官方卡组</h2><button aria-label="查看更多官方卡组" onClick={()=>{setDeckFilter('official');open('decks');}}>更多 <Icon name="forward"/></button></header><OfficialDeckCarousel cards={official} cover={cover} openDeck={openDeck}/>{!ready&&<p role="status">{error||'正在获取官方卡组…'}</p>}</section><Row title="照片卡组" action={()=>{setDeckFilter('personal');open('decks');}}/><Row title="照片数据" action={()=>open('data')}/><Row title="外观与主题" action={()=>open('appearance')}/><Row title="个性化设置" action={()=>open('personalization')}/><Row title="关于" action={()=>open('about')}/></div></main>;
 if(path==='data'||path.startsWith('data/'))return <PhotoDataSettings path={path} importFile={importFile} notify={notify}/>;
 const back=path==='themes'?'appearance':['keyboard','laboratory','particles','shutter','speech'].includes(path)?'personalization':'';
 return <Page title={names[path]||'设置'} back={back}>
 {path==='ai'&&<AISettings/>}
 {path==='decks'&&<><div className="settings-segmented" role="group" aria-label="卡组分类">{([['official','官方卡组'],['personal','个人卡组']] as const).map(([id,label])=><button key={id} aria-pressed={deckFilter===id} onClick={()=>setDeckFilter(id)}>{label}</button>)}</div>{deckFilter==='official'?deckList(official):<>
  {own.length>0&&<section className="settings-deck-section" aria-label="我的卡组">{subscribed.length>0&&<h2>我的卡组</h2>}{deckList(own)}</section>}
  {subscribed.length>0&&<section className="settings-deck-section" aria-labelledby="subscribed-decks-heading"><h2 id="subscribed-decks-heading">订阅的卡组</h2>{deckList(subscribed)}</section>}
  {ready&&personal.length===0&&<p className="settings-footnote">还没有个人卡组</p>}
 <SubscriptionSettings notify={notify}/></>}<button className="settings-row" onClick={importFile}>导入卡组文件 <Icon name="upload"/></button></>}

 {(path==='appearance'||path==='themes')&&<AppearanceSettings mode={theme} setMode={setTheme} showPicker={path==='themes'}/>}
 {path==='personalization'&&<><Row title="键盘声音" value={xp.level<3?'更多音色 · LV3 解锁':undefined} action={()=>open('keyboard')}/><Row title="快门声音" value={xp.level<4?'更多音色 · LV4 解锁':undefined} action={()=>open('shutter')}/><Row title="朗读声音" action={()=>open('speech')}/><Row title="粒子效果" value={effect==='judgmentLight'&&xp.level>=7?'裁决之光':'社交暗号'} action={()=>open('particles')}/><label className="settings-row"><span>快拼{xp.level<6?' · LV6 解锁':''}</span><input aria-label="快拼" type="checkbox" role="switch" disabled={xp.level<6&&!quick} checked={quick} onChange={e=>{setQuick(e.target.checked);writePreference('piclex-web.quick',String(e.target.checked));}}/></label><p className="settings-footnote">只填写曾经拼错的字符，其余自动显示。完全拼对且没有字符错误记录的词直接跳过，新词仍需完整拼写。</p><label className="settings-row"><span>单卡单句模式</span><input aria-label="单卡单句模式" type="checkbox" role="switch" checked={onePhoto} onChange={e=>{setOnePhoto(e.target.checked);writePreference('piclex-web.listening.single-photo',String(e.target.checked));}}/></label><p className="settings-footnote">随身听每张照片只播放一句，并显示完整照片。关闭后保留全部句子。</p><Row title="实验室" action={()=>open('laboratory')}/><label className="settings-row"><span>导入图片拍立得动画</span><input aria-label="导入图片拍立得动画" type="checkbox" role="switch" checked={importAnimation} onChange={e=>{setImportAnimation(e.target.checked);writePreference('piclex-web.import-animation',String(e.target.checked));}}/></label><p className="settings-footnote">从相册导入图片时播放拍立得出片动画。关闭后直接显示识别页面。</p></>}
 {path==='shutter'&&<ShutterSettings notify={notify}/>}
 {path==='speech'&&<SpeechSettings notify={notify}/>}
 {path==='keyboard'&&<KeyboardSettings notify={notify}/>}
 {path==='particles'&&<>{[['socialCode','社交暗号'],['judgmentLight','裁决之光']].map(([id,title])=><button className="settings-row" key={id} disabled={id==='judgmentLight'&&xp.level<7} aria-pressed={effect===id} onClick={()=>{setEffect(id);writePreference('piclex-web.particle-effect',id);}}><span>{title}</span><span>{id==='judgmentLight'&&xp.level<7?'LV7 解锁':effect===id?'✓':''}</span></button>)}</>}
 {path==='laboratory'&&<><label className="settings-row"><span>游戏卡组</span><select aria-label="游戏卡组" value={gameDeckID||cards[0]?.id||''} onChange={e=>setGameDeckID(e.target.value)}>{cards.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button className="settings-row" disabled={!ready||gameBusy} onClick={openGame}><span>薯薯求生</span><span>{gameBusy?'加载中…':<Icon name="forward"/>}</span></button></>}
 {path==='about'&&<><div className="settings-about-brand"><img src={asset('brand/app-icon.png')} alt=""/><h2>摄影学英语</h2></div><a className="settings-row" href="https://apps.apple.com/cn/app/id6808490052" target="_blank" rel="noreferrer">获取 iPhone App <Icon name="external"/></a><a className="settings-row" href="https://github.com/zhaoolee/piclex-web" target="_blank" rel="noreferrer">开源代码 <Icon name="external"/></a><a className="settings-row" href={asset('credits.html')}>素材与隐私 <Icon name="forward"/></a></>}
 </Page>;
}
