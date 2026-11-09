import {useEffect,useState,type CSSProperties} from 'react';
import {levelProgress,rewards} from '../../../packages/practice/src/experience.mjs';
import {experienceReport,subscribeExperience} from '../../../packages/practice/src/experience-store.mjs';
import {NativeIcon as Icon} from '../../../packages/learning-ui/src/NativeIcon';
import './level.css';
export function useExperience(){const [value,setValue]=useState<any>(()=>({...levelProgress(0),statistics:{},milestones:[]}));const [error,setError]=useState('');useEffect(()=>{experienceReport().then(setValue).catch(e=>setError(e.message));return subscribeExperience(setValue);},[]);return {...value,error};}
export function ExperienceMeter({open}:{open?:()=>void}){const xp=useExperience(),Tag=open?'button':'div';return <Tag className="experience-meter" onClick={open} aria-label={`等级 LV${xp.level}，${xp.total} 经验`}><strong>LV{xp.level}</strong><span className="learning-experience" role="progressbar" aria-label="等级经验" aria-valuenow={Math.round(xp.fraction*100)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${xp.fraction*100}%`}}/></span><small>{xp.earned} / {xp.required}</small></Tag>;}
export function PracticeProgress({deckTitle,position,count,openLevel,openDeck}:{deckTitle:string;position:number;count:number;openLevel:()=>void;openDeck:()=>void}){
 const xp=useExperience(),deckProgress=count>0?Math.min(1,Math.max(0,position/count)):0;return <div className="practice-progress-battery">
  <button className="practice-level-target" onClick={openLevel} aria-label={`等级 LV${xp.level}，${xp.total} 经验`}>
   <span className="practice-player-avatar"><img src={`${import.meta.env.BASE_URL}lab/assets/hero.webp`} alt=""/><strong>LV{xp.level}</strong></span>
  </button>
  <button className="practice-deck-target" onClick={openDeck} aria-label="当前卡组，学习设置">
   <span className="practice-experience-target">
   <span className="learning-experience" role="progressbar" aria-label="等级经验" aria-valuenow={Math.round(xp.fraction*100)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${xp.fraction*100}%`}}/><b>{(xp.fraction*100).toFixed(2)}%</b></span>
   </span>
   <span className="practice-deck-lane" style={{'--deck-progress':deckProgress} as CSSProperties}><span>{deckTitle}</span><i aria-hidden="true">▾</i></span>
  </button>
  <span className="sr-only" role="progressbar" aria-label="本轮练习进度" aria-valuenow={position} aria-valuemin={0} aria-valuemax={count}/>
 </div>;
}
const rewardDetails:Record<number,{detail:string;setting?:string}>={
 2:{detail:'选一个感兴趣的学习目标，让照片里的单词更贴近你想学的内容。'},
 3:{detail:'给每次敲击换一种声音，让拼写更有节奏感。',setting:'keyboard'},
 4:{detail:'挑选喜欢的快门音，让拍照收词多一点仪式感。',setting:'shutter'},
 5:{detail:'在简洁取景、复古胶片和经典银黑之间切换，找到喜欢的相机样子。'},
 6:{detail:'专练曾经拼错的字母，已经会拼的部分自动补齐，轻快地巩固单词。',setting:'personalization'},
 7:{detail:'解锁粒子效果选择，包含“社交暗号”和“裁决之光”，让拼写与朗读换上喜欢的粒子。',setting:'particles'},
 8:{detail:'闭上眼睛听单词，用语音逐个字母拼写，不看屏幕也能练听音和拼写。'}
};
export function LevelPage({embedded=false,openGame,gameBusy=false,gameReady=true,learn}:{embedded?:boolean;openGame:()=>void;gameBusy?:boolean;gameReady?:boolean;learn:()=>void}){
 const xp=useExperience(),[rewardLevel,setRewardLevel]=useState<number|null>(null);
 const reward=rewards.find(r=>r.level===rewardLevel);
 const levels=[...new Set<number>([...xp.milestones.map((m:{level:number})=>m.level),...rewards.map(r=>r.level)])].sort((a,b)=>b-a);
 if(reward){const threshold=reward.level*(reward.level+1),unlocked=xp.total>=threshold,details=rewardDetails[reward.level];return <section className="level-page level-detail">
  <button className="text-button" onClick={()=>setRewardLevel(null)}><Icon name="back"/>返回我的等级</button>
  <h3>{reward.title}</h3><p>{details.detail}</p>
  <div className="level-detail-state">{unlocked?<p>这份等级奖励已经点亮</p>:<><p>达到 LV{reward.level}，累计 {threshold} 点经验就能解锁。</p><p className="muted">再获得 {threshold-xp.total} 点经验，这份奖励就是你的了。</p><progress aria-label={`${reward.title}解锁进度`} max={threshold} value={xp.total}/></>}
   {!reward.web&&<p className="muted">在 iPhone App 中使用</p>}
   {unlocked&&details.setting?<button className="settings-row" onClick={()=>{location.hash=`/settings/${details.setting}`;}}>去设置，体验新玩法 <Icon name="forward"/></button>:!unlocked?<button className="settings-row" onClick={learn}>去拼几个单词 <Icon name="forward"/></button>:null}
  </div>
 </section>;}
 return <section className="level-page" data-embedded={embedded}>{!embedded&&<h1>我的等级</h1>}
  <div className="level-summary"><ExperienceMeter/><p>共 {xp.total} 经验 · 距离 LV{xp.level+1} 还需 {xp.remaining} 经验</p></div>
  <div className="level-scroll">{xp.error&&<p role="alert">{xp.error}</p>}
  <button className="level-game-entry" aria-label="薯薯求生" disabled={!gameReady||gameBusy} onClick={openGame}><span className="level-game-avatar"><img src={`${import.meta.env.BASE_URL}lab/assets/hero.webp`} alt=""/></span><span><strong>薯薯求生</strong><small>{gameBusy||!gameReady?'正在准备游戏':'冒险、拼词，赢取经验'}</small></span><Icon name="forward"/></button>
  <h2>等级奖励</h2><div className="level-rewards">{rewards.map(r=><button className="level-reward" key={r.level} onClick={()=>setRewardLevel(r.level)} aria-label={`${r.title}，LV${r.level} ${xp.total>=r.level*(r.level+1)?'已解锁':'解锁'}`}><b>LV{r.level}</b><span>{r.title}<small>{r.web?'':'App 中使用'}</small></span><span>{xp.total>=r.level*(r.level+1)?'已解锁 · 去看看':`还需 ${r.level*(r.level+1)-xp.total} 经验`}</span><Icon name="forward"/></button>)}</div>
  <h2>等级与解锁</h2><div className="level-history">{levels.map(level=>{const reached=xp.milestones.some((m:{level:number})=>m.level===level)||xp.total>=level*(level+1);return <div key={level} className="level-milestone" data-reached={reached}><strong>LV{level}{level===xp.level&&<small>当前等级</small>}</strong><span>累计经验 {level*(level+1)} 点</span><small>{reached?'已达到':`再获得 ${Math.max(0,level*(level+1)-xp.total)} 点经验，点亮新玩法`}</small>{rewards.filter(r=>r.level===level).map(r=><button key={r.level} onClick={()=>setRewardLevel(r.level)}>{r.title} <Icon name="forward"/></button>)}</div>;})}</div>
  {!xp.milestones.length&&xp.level===0&&<p className="muted">获得 2 点经验，开启 LV1。</p>}
  <h2>升级规则</h2><p className="muted">拼对单词 +1；拼句和听写 +3–6；跟读按匹配进度计分。薯薯求生与学习共用经验。</p>
  <div className="experience-totals">{[['spelling','拼写'],['dictation','拼句与听写'],['reading','跟读'],['gameEarned','游戏获得'],['gameSpent','游戏消耗']].map(([k,title])=><div key={k}><span>{title}</span><strong>{k==='gameSpent'?'−':'+'}{xp.statistics[k]||0}</strong></div>)}</div>
  </div>
 </section>;
}
