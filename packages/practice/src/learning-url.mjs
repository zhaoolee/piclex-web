import {reduceStudy,studyKey} from './study.mjs';
import {promptsFor,promptIndex} from './sentence.mjs';
const member=(value,choices)=>choices.includes(value)?value:null;
const positive=value=>/^[1-9]\d{0,8}$/.test(value||'')?Number(value):null;
/** Hash parameters are locators, never imported answers or grades. */
export function parseLearningURL(hash){
 const match=/^#\/deck\/([^?]+)(?:\?(.*))?$/.exec(hash);
 if(!match)return null;
 let id;try{id=decodeURIComponent(match[1]);}catch{return null;}
 const p=new URLSearchParams(match[2]);
 return {id,module:member(p.get('module'),['spelling','listening','speaking']),mode:member(p.get('mode'),['listening','chunks','free']),photo:positive(p.get('photo')),word:(p.get('word')||'').slice(0,256),sentenceWord:(p.get('sentenceWord')||'').slice(0,256),sentence:positive(p.get('sentence'))};
}
export function applyLearningURL(deck,state,route){
 if(!route||route.id!==deck.id||!['module','mode','photo','word','sentence'].some(k=>route[k]))return state;
 const dispatch=(s,action)=>reduceStudy(deck,s,{...action,question:studyKey(s)});
 let next=dispatch(state,{type:'pause'}),index=deck.words.findIndex(w=>w.id===route.word);
 if(index<0&&route.photo)index=deck.words.findIndex(w=>w.imageIndex===route.photo-1);
 if(index>=0)next=dispatch(next,{type:'selectWord',index});
 if(route.module)next=dispatch(next,{type:'module',value:route.module});
 // A direct spelling link is a fresh attempt at that word, even when its saved
 // answer was already complete. Keep the round and other words' drafts intact.
 if(route.module==='spelling'&&index>=0&&deck.words[index].id===route.word)next=dispatch(next,{type:'retryWord'});
 if(next.module==='listening'){
  if(route.mode)next=dispatch(next,{type:'mode',value:route.mode});
  if(index>=0){
   const prompts=promptsFor(deck),anchor=deck.words.findIndex(w=>w.id===route.sentenceWord&&w.imageIndex===deck.words[index].imageIndex),first=promptIndex(prompts,deck,anchor>=0?anchor:index),parts=prompts.map((p,i)=>({p,i})).filter(({p})=>p.wordIndex===prompts[first]?.wordIndex);
   const chosen=parts[(route.sentence||1)-1]?.i??first;
   if(chosen>=0)next={...next,sentenceIndex:chosen,sentenceFinished:false};
  }
 }
 return next;
}
export function learningHash(deck,state){
 // Completion has no active item. A module-only URL preserves the owner's saved
 // completion while a recipient starts their own study, without importing a grade.
 const finished=state.index>=deck.words.length||state.module==='listening'&&state.sentenceFinished;
 const prompts=promptsFor(deck),prompt=!finished&&state.module==='listening'?prompts[state.sentenceIndex]:null;
 const word=finished?null:deck.words[state.index];
 const p=new URLSearchParams({module:state.module});
 if(word){p.set('photo',String(word.imageIndex+1));p.set('word',word.id);}
 if(state.module==='listening'){
  p.set('mode',state.mode);
  if(prompt){p.set('sentence',String(prompts.filter(p=>p.wordIndex===prompt.wordIndex).indexOf(prompt)+1));if(prompt.wordIndex!==state.index)p.set('sentenceWord',deck.words[prompt.wordIndex].id);}
  // Older Web versions still read this parameter and otherwise default to hard.
  if(state.mode==='free')p.set('difficulty','easy');
 }
 return `#/deck/${encodeURIComponent(deck.id)}?${p}`;
}
