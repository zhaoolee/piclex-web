import { useEffect, useLayoutEffect, useRef } from 'react';
import { fixed, board, boardMismatch } from './spelling.mjs';
import CharacterRipples from './CharacterRipples';
import './gold-sweep.css';

// Mirrors PracticeGoldSweepStyle, fitted to the 300ms spelling auto-advance so
// the fresh answer shows the whole crossing instead of being cut off by the
// next word. The advance itself is untouched.
const SWEEP_MS = 230, FADE_MS = 50, TAIL_MS = 10;

type SweepState = { scope: string; completed: boolean; seen: boolean };

export function AnswerSlots({ expected, entered, revealed, scope, quickIndices=null,active=true,effect="socialCode",completed=false,perfect=false }: { expected: string; entered: string; revealed: boolean; scope: string; quickIndices?:number[]|null;active?:boolean;effect?:string;completed?:boolean;perfect?:boolean }) {
  const inputExpected=quickIndices?quickIndices.map(i=>[...expected][i]).join(''):expected;
  const value=revealed?expected:board(expected,entered,quickIndices),wrong=revealed?null:boardMismatch(inputExpected,entered,quickIndices);
  const next=[...value].findIndex((c,i)=>c==='_'&&!fixed(expected[i]));
  const node=useRef<HTMLDivElement>(null),timer=useRef<number|undefined>(undefined),sweep=useRef<SweepState>({scope,completed:false,seen:false});
  // Cancel leaves no gold class or measurements on a reused board, so the next
  // word can never inherit an in-flight sweep.
  const cancel=()=>{
    if(timer.current!==undefined){window.clearTimeout(timer.current);timer.current=undefined;}
    const root=node.current;if(!root)return;
    root.classList.remove('gold-sweep');
    for(const slot of root.querySelectorAll<HTMLElement>('.letter-slot')){
      slot.style.removeProperty('--gold-word');slot.style.removeProperty('--gold-offset');
    }
  };
  useLayoutEffect(()=>{
    const previous=sweep.current,same=previous.seen&&previous.scope===scope;
    sweep.current={scope,completed,seen:true};
    cancel();
    // Only a fresh nil -> completed transition on this same answer earns the
    // sweep. Reveal, a restored/revisited completion and the next question do not.
    if(!same||previous.completed||!completed||revealed||!active||document.hidden)return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const root=node.current;if(!root)return;
    const slots=[...root.querySelectorAll<HTMLElement>('.letter-slot')];
    if(!slots.length)return;
    const first=slots[0].getBoundingClientRect(),last=slots[slots.length-1].getBoundingClientRect();
    // The gradient crosses the word's own intrinsic width, never the panel.
    const width=last.right-first.left;
    if(!(width>0))return;
    for(const slot of slots){
      const rect=slot.getBoundingClientRect();
      slot.style.setProperty('--gold-word',`${width}px`);
      slot.style.setProperty('--gold-offset',`${rect.left-first.left}px`);
    }
    root.classList.add('gold-sweep');
    timer.current=window.setTimeout(cancel,SWEEP_MS+FADE_MS+TAIL_MS);
  },[scope,completed,revealed,active]);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const reduce=()=>{if(media.matches)cancel();};
    const hide=()=>{if(document.hidden)cancel();};
    media.addEventListener('change',reduce);
    document.addEventListener('visibilitychange',hide);
    window.addEventListener('pagehide',cancel);
    return ()=>{
      media.removeEventListener('change',reduce);
      document.removeEventListener('visibilitychange',hide);
      window.removeEventListener('pagehide',cancel);
      cancel();
    };
  },[]);
  return <div ref={node} className="answer-slots" aria-hidden="true" style={{fontSize:Math.max(14,Math.min(28,300/[...expected].length))}}>
    {[...value].map((char,index)=><span key={index} data-letter-index={index} className={`letter-slot ${fixed(expected[index])?'fixed':''} ${wrong===index?'wrong':''} ${char==='_'?'empty':''} ${index===next?'next-letter':''} ${quickIndices&&!quickIndices.includes(index)?'prefilled':''}`}>
      {/* The glyph keeps its own identity per answer: editing, correcting or moving to the next
          word must never inherit the previous glyph node's in-flight animation or paint. */}
      <span key={`${scope}:${char}:${wrong===index}`} className="letter-glyph" data-gold={char==='_'?'':char}>{char==='_'?'\u00a0':char}</span>
    </span>)}
    <CharacterRipples scope={scope} expected={expected} entered={entered} quickIndices={quickIndices} revealed={revealed} active={active&&!revealed} effect={effect} completed={completed} perfect={perfect}/>
  </div>;
}
