import {useLayoutEffect,useRef} from 'react';
import {RIPPLE_DURATION,rippleFrame} from '../../../packages/learning-ui/src/character-ripples.mjs';
import {startDictationGoldSweep} from './dictation-gold';

type LetterGroup={letter:string;punctuation:string};

export function letterGroups(word:string){
 const groups:LetterGroup[]=[];
 for(const character of word){
  if(/[\p{L}\p{N}]/u.test(character))groups.push({letter:character,punctuation:''});
  else if(groups.length)groups[groups.length-1].punctuation+=character;
 }
 return groups;
}

// Sample spelling's ripple curve once. The browser then animates the circle
// with transform and opacity without repainting a sentence-sized canvas.
const rippleFrames=[0,.06,.16,.28,.44,.62,.8,1].map(offset=>{
 const frame=rippleFrame(offset*RIPPLE_DURATION);
 return {offset,opacity:(frame?.opacity??0)*.65,transform:`translate(-50%,-50%) scale(${(frame?.radius??26.5)/26.5})`};
});

export default function GuidedLetters({expected,typed,active,sentenceComplete}:{expected:LetterGroup[];typed:LetterGroup[];active:boolean;sentenceComplete:boolean}){
 const target=expected.map(group=>group.letter).join('').toLowerCase();
 const entered=typed.map(group=>group.letter).join('');
 const previous=useRef(entered),letters=useRef<HTMLSpanElement>(null);
 const stopSweep=useRef<ReturnType<typeof startDictationGoldSweep>>(undefined);
 useLayoutEffect(()=>{
  const before=previous.current;
  previous.current=entered;
  const word=letters.current?.parentElement;
  if(!word)return;
  const correct=entered.toLowerCase()===target;
  if(!active||!correct||sentenceComplete){stopSweep.current?.();stopSweep.current=undefined;}
  // Hand off from earlier letters to the full sentence effect. The last
  // keystroke still gets its own circle below.
  if(!active||sentenceComplete){
   for(const ripple of word.querySelectorAll('.guided-letter-ripple'))ripple.remove();
  }
  if(!active||before===entered||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const oldLetters=[...before],newLetters=[...entered];
  let first=0,last=newLetters.length,oldEnd=oldLetters.length;
  // An edit can shift an existing suffix. Animate the inserted letters only.
  while(first<last&&oldLetters[first]===newLetters[first])first++;
  while(last>first&&oldEnd>first&&oldLetters[oldEnd-1]===newLetters[last-1]){last--;oldEnd--;}
  for(let index=first;index<last;index++){
   const glyph=letters.current?.children[index]?.firstElementChild;
   if(!glyph)continue;
   const ripple=document.createElement('span');
   ripple.className='guided-letter-ripple';
   glyph.append(ripple);
   ripple.animate(rippleFrames,RIPPLE_DURATION).onfinish=()=>ripple.remove();
  }
  // Completing the final missing word already starts the full sentence sweep.
  if(correct&&before.toLowerCase()!==target&&!sentenceComplete){
   stopSweep.current=startDictationGoldSweep(word);
  }
 },[active,entered,target,sentenceComplete]);
 useLayoutEffect(()=>()=>stopSweep.current?.(),[]);
 return <span ref={letters} className="guided-letters" aria-hidden="true">
  {Array.from({length:Math.max(expected.length,typed.length)},(_,index)=>{
   const want=expected[index],got=typed[index],punctuation=got?.punctuation||want?.punctuation;
   const apostrophe=/^['’‘]$/.test(punctuation||'');
   return <i key={index} className={got&&(!want||got.letter.toLowerCase()!==want.letter.toLowerCase())?'bad-letter':''}>
    <span key={got?.letter} className="letter-glyph">{got?.letter||'\u00a0'}</span>
    {punctuation&&<b className={`guided-punctuation${apostrophe?' guided-apostrophe':''}`}>{punctuation}</b>}
   </i>;
  })}
 </span>;
}
