import { fixed, board, boardMismatch } from './spelling.mjs';
import CharacterRipples from './CharacterRipples';
export function AnswerSlots({ expected, entered, revealed, scope, quickIndices=null,active=true,effect="socialCode",completed=false,perfect=false }: { expected: string; entered: string; revealed: boolean; scope: string; quickIndices?:number[]|null;active?:boolean;effect?:string;completed?:boolean;perfect?:boolean }) {
  const inputExpected=quickIndices?quickIndices.map(i=>[...expected][i]).join(''):expected;
  const value=revealed?expected:board(expected,entered,quickIndices),wrong=revealed?null:boardMismatch(inputExpected,entered,quickIndices);
  const next=[...value].findIndex((c,i)=>c==='_'&&!fixed(expected[i]));
  return <div className="answer-slots" aria-hidden="true" style={{fontSize:Math.max(14,Math.min(28,300/[...expected].length))}}>
    {[...value].map((char,index)=><span key={index} data-letter-index={index} className={`letter-slot ${fixed(expected[index])?'fixed':''} ${wrong===index?'wrong':''} ${char==='_'?'empty':''} ${index===next?'next-letter':''} ${quickIndices&&!quickIndices.includes(index)?'prefilled':''}`}>
      {/* The glyph keeps its own identity per answer: editing, correcting or moving to the next
          word must never inherit the previous glyph node's in-flight animation or paint. */}
      <span key={`${scope}:${char}:${wrong===index}`} className="letter-glyph">{char==='_'?'\u00a0':char}</span>
    </span>)}
    <CharacterRipples scope={scope} expected={expected} entered={entered} quickIndices={quickIndices} revealed={revealed} active={active&&!revealed} effect={effect} completed={completed} perfect={perfect}/>
  </div>;
}
