import {restoreCaptureStudy} from './capture-group.mjs';
import {resolve,mismatch,convertPrompt,fixed} from '../../learning-ui/src/spelling.mjs';
import {promptsFor,promptIndex,newSentence,reduceSentence,checkSentence} from './sentence.mjs';
export function newStudy(deck){return {version:2,fingerprint:deck.fingerprint,index:0,round:0,presentation:0,module:'spelling',mode:'chunks',rate:1,difficulty:'hard',quick:false,hiddenChinese:false,words:{},history:{},sentences:{},sentenceIndex:0,sentenceFinished:false,pending:null};}
export const studyKey=s=>`${s.fingerprint}:${s.round}:${s.presentation}:${s.index}:${s.module}:${s.mode}:${s.sentenceIndex}`;
export function wordDraft(deck,s){return s.words[deck.words[s.index]?.id]||{input:'',hadMistake:false,result:null,quickIndices:null};}
export function expectedInput(word,draft){return draft.quickIndices?draft.quickIndices.map(i=>[...word.english][i]).join(''):word.english;}
function prepare(deck,s){
 const word=deck.words[s.index];if(!word)return;
 if(s.words[word.id])return;
 s.words[word.id]={input:'',hadMistake:false,result:null,quickIndices:null};
 const draft=s.words[word.id];
 if(!draft.result){const indices=s.quick?s.history[word.id]?.mistakes:null;draft.quickIndices=indices?.length?indices:null;}
}
function pause(s){s.pending=null;for(const value of Object.values(s.sentences))value.pending=null;s.presentation++;}
// A revisited finished dictation starts a writable attempt instead of restoring
// terminal controls. Only that sentence's dictation state is discarded.
function forgetSentence(s,prompts,index){const prompt=prompts[index];if(!prompt)return false;s.sentences={...s.sentences,[prompt.key]:newSentence(prompt)};s.sentenceFinished=false;return true;}
// A reopened word starts a writable attempt; quick mode still blanks its known mistakes.
function reopen(s,word){const mistakes=s.quick?s.history[word.id]?.mistakes:null;s.words[word.id]={input:'',hadMistake:false,result:null,quickIndices:mistakes?.length?mistakes:null};}
export function restoreStudyFromStorage(deck, read) {
 if(deck.studySources)return restoreCaptureStudy(deck,read);
 const keys = [deck.fingerprint, ...(deck.legacyFingerprints || [])];
 for (const fingerprint of keys) {
  const saved = read(`piclex-web.study.v2.${fingerprint}`), legacy = read(`piclex-web.progress.v1.${fingerprint}`);
  if (saved?.fingerprint === fingerprint || legacy?.fingerprint === fingerprint) return {...restoreStudy({...deck, fingerprint}, saved, legacy), fingerprint: deck.fingerprint};
 }
 return newStudy(deck);
}
export function restoreStudy(deck,saved,legacy){
 const fresh=newStudy(deck);
 if(saved?.version!==2||saved.fingerprint!==deck.fingerprint){
  if(legacy?.version===1&&legacy.fingerprint===deck.fingerprint&&Number.isInteger(legacy.index)&&legacy.index>=0&&legacy.index<=deck.words.length&&typeof legacy.input==='string'){
   fresh.index=legacy.index;fresh.round=legacy.round||0;
   for(let i=0;i<legacy.index;i++)if(['correct','reviewed','revealed'].includes(legacy.results?.[i]))fresh.words[deck.words[i].id]={input:deck.words[i].english,result:legacy.results[i],hadMistake:legacy.results[i]==='reviewed',quickIndices:null};
   if(deck.words[legacy.index])fresh.words[deck.words[legacy.index].id]={input:legacy.input.slice(0,100),result:['correct','reviewed','revealed'].includes(legacy.result)?legacy.result:null,hadMistake:!!legacy.hadMistake,quickIndices:null};
  }return fresh;
 }
 // Stored content is untrusted and may be from an interrupted/older build.
 if(!Number.isInteger(saved.index)||saved.index<0||saved.index>deck.words.length)return fresh;
 const s={...fresh,index:saved.index,round:Number.isSafeInteger(saved.round)&&saved.round>=0?saved.round:0};
 for(const key of ['quick','hiddenChinese'])s[key]=saved[key]===true;
 if(['spelling','listening','speaking'].includes(saved.module))s.module=saved.module;
 if(['chunks','free','listening'].includes(saved.mode))s.mode=saved.mode;
 if([.75,.85,1,1.15].includes(saved.rate))s.rate=saved.rate;
 if(['easy','medium','hard'].includes(saved.difficulty))s.difficulty=saved.difficulty;
 for(const word of deck.words){
  const h=saved.history?.[word.id];if(h&&Array.isArray(h.mistakes))s.history[word.id]={mastered:h.mastered===true,mistakes:[...new Set(h.mistakes.filter(i=>Number.isInteger(i)&&i>=0&&i<word.english.length&&!fixed(word.english[i])))].sort((a,b)=>a-b)};
  const d=saved.words?.[word.id];if(!d||typeof d.input!=='string'||d.input.length>100||!['correct','reviewed','revealed',null].includes(d.result))continue;
  const indices=Array.isArray(d.quickIndices)?[...new Set(d.quickIndices.filter(i=>Number.isInteger(i)&&i>=0&&i<word.english.length&&!fixed(word.english[i])))].sort((a,b)=>a-b):[];
  const draft={input:d.input,result:d.result,hadMistake:d.hadMistake===true,quickIndices:indices.length?indices:null};
  if(draft.result&&draft.result!=='revealed'&&draft.input.toLowerCase()!==expectedInput(word,draft).toLowerCase())continue;
  s.words[word.id]=draft;
 }
 const prompts=promptsFor(deck);
 if(Number.isInteger(saved.sentenceIndex)&&saved.sentenceIndex>=0&&saved.sentenceIndex<prompts.length)s.sentenceIndex=saved.sentenceIndex;
 s.sentenceFinished=saved.sentenceFinished===true;
 for(const prompt of prompts){const d=saved.sentences?.[prompt.key];if(!d)continue;let next=newSentence(prompt);
  // Reconstruct terminal outcomes from the persisted answer instead of trusting a stored grade.
  if(Array.isArray(d.bank)&&d.bank.length===next.bank.length&&new Set(d.bank).size===next.bank.length&&d.bank.every(i=>next.bank.includes(i)))next.bank=d.bank;
  if(Array.isArray(d.selected))for(const id of d.selected.slice(0,next.chunks.length))next=reduceSentence(prompt,next,'chunks',{key:prompt.key,type:'select',id});
  if(typeof d.freeText==='string')next=reduceSentence(prompt,next,'free',{key:prompt.key,type:'input',value:d.freeText});
  if(Array.isArray(d.guided)&&d.guided.length<=512&&d.guided.every(v=>typeof v==='string'))next=reduceSentence(prompt,next,'free',{key:prompt.key,type:'guided',values:d.guided});
  for(const mode of ['chunks','free']){if(d.outcomes?.[mode]==='assisted'){delete next.outcomes[mode];next.statistics[mode].correct=0;next=reduceSentence(prompt,next,mode,{key:prompt.key,type:'giveUp'});}if(Array.isArray(d.revealed)&&d.revealed.includes(mode)&&!next.revealed.includes(mode))next.revealed.push(mode);}
  for(const mode of ['chunks','free']){
   const stats=d.statistics?.[mode];if(stats&&['submissions','correct','assisted','plays'].every(k=>Number.isSafeInteger(stats[k])&&stats[k]>=0&&stats[k]<100000))next.statistics[mode]={...next.statistics[mode],submissions:stats.submissions,correct:stats.correct,assisted:stats.assisted,plays:stats.plays};
   if(d.checks?.[mode]&&!next.outcomes[mode]&&mode==='free')next.checks.free=checkSentence(prompt.sentence,next.freeText);
  }
  next.pending=null;s.sentences[prompt.key]=next;
 }
 return s;
}
/** Both spelling and sentence cursors refer to the same photo/word. Sentences never grade spelling. */
export function reduceStudy(deck,s,action,preparedPrompts){
 if(action.question!==studyKey(s))return s;
 if(action.type==='input')return inputStudy(deck,s,action);
 const prompts=preparedPrompts??promptsFor(deck);
 if(action.type==='sentence'){
  const p=prompts[s.sentenceIndex];if(!p||s.module!=='listening'||!['chunks','free'].includes(s.mode))return s;
  const current=s.sentences[p.key]||newSentence(p),draft=reduceSentence(p,current,s.mode,{...action.action,key:p.key});
  return draft===current?s:{...s,sentences:{...s.sentences,[p.key]:draft}};
 }
 const next=structuredClone(s),word=deck.words[s.index];
 const navigate=(index)=>{next.index=index;pause(next);prepare(deck,next);};
 if(action.type==='pause'){pause(next);return next;}
 if(action.type==='dictationRestart'){
  if(s.module!=='listening'||!s.sentenceFinished)return s;
  const at=promptIndex(prompts,deck,s.index);next.sentenceIndex=at>=0?at:0;const prompt=prompts[next.sentenceIndex];next.sentences=prompt?{[prompt.key]:newSentence(prompt)}:{};next.sentenceFinished=false;pause(next);return next;
 }
 if(action.type==='dictationChallenge'){
  if(s.module!=='listening'||!s.sentenceFinished||s.mode!=='chunks')return s;
  const last=prompts[s.sentenceIndex],draft=last&&s.sentences[last.key];
  if(!last||draft?.outcomes.free)return s;
  next.mode='free';next.sentenceFinished=false;pause(next);return next;
 }
 if(action.type==='freshSentence'){
  if(s.module!=='listening')return s;
  if(!forgetSentence(next,prompts,Number.isInteger(action.index)?action.index:s.sentenceIndex))return s;
  pause(next);return next;
 }
 if(action.type==='module'){
  if(!['spelling','listening','speaking'].includes(action.value)||action.value===s.module)return s;
  if(action.value==='listening'){const at=promptIndex(prompts,deck,s.index);if(at>=0&&(!prompts[s.sentenceIndex]||prompts[s.sentenceIndex].wordIndex!==s.index)){next.sentenceIndex=at;next.sentenceFinished=false;if(!deck.words[s.index]?.example)next.index=prompts[at].wordIndex;}}
  next.module=action.value;pause(next);return next;
 }
 if(action.type==='mode'){if(['chunks','free','listening'].includes(action.value)){next.mode=action.value;pause(next);}return next;}
 if(action.type==='preference'){
  if(action.name==='rate'&&[.75,.85,1,1.15].includes(action.value)){next.rate=action.value;return next;}
  if(action.name==='difficulty'&&['easy','medium','hard'].includes(action.value))next.difficulty=action.value;
  if(action.name==='hiddenChinese')next.hiddenChinese=!!action.value;
  if(action.name==='quick'){
   next.quick=!!action.value;
   if(word){const old=wordDraft(deck,s);prepare(deck,next);const d=wordDraft(deck,next);d.quickIndices=next.quick&&next.history[word.id]?.mistakes?.length?next.history[word.id].mistakes:null;
    if(!d.result){d.input=convertPrompt(word.english,old.input,old.quickIndices,d.quickIndices);}}
  }if(action.name==='quick'&&next.quick&&!wordDraft(deck,next).hadMistake&&!wordDraft(deck,next).result){let i=next.index;while(deck.words[i]&&next.history[deck.words[i].id]?.mastered)i++;if(i!==next.index)navigate(i);}
  pause(next);
  const current=deck.words[next.index],draft=wordDraft(deck,next);
  if(action.name==='quick'&&current&&!draft.result&&draft.input.toLowerCase()===expectedInput(current,draft).toLowerCase())return reduceStudy(deck,next,{type:'input',value:draft.input,question:studyKey(next)});
  return next;
 }
 if(action.type==='restart') {const n=newStudy(deck);if(next.quick)while(deck.words[n.index]&&next.history[deck.words[n.index].id]?.mastered)n.index++;const restarted={...n,...(s.captureScopes?{captureScopes:s.captureScopes,captureWordOrder:s.captureWordOrder,capturePromptOrder:s.capturePromptOrder}:{}),module:s.module,history:next.history,quick:next.quick,hiddenChinese:next.hiddenChinese,rate:next.rate,difficulty:next.difficulty,mode:next.mode,round:s.round+1};if(restarted.module==='spelling'&&restarted.quick)prepare(deck,restarted);return restarted;}
 if(action.type==='selectWord'&&Number.isInteger(action.index)&&deck.words[action.index]){
  const listeningFinished=s.sentenceFinished&&s.module==='listening';
  if(action.index===s.index){
   if(!s.sentenceFinished)return s;
   if(listeningFinished){const at=promptIndex(prompts,deck,action.index),target=at>=0?at:s.sentenceIndex;if(forgetSentence(next,prompts,target)){if(at>=0)next.sentenceIndex=at;pause(next);return next;}}
   next.sentenceFinished=false;pause(next);return next;
  }
  navigate(action.index);
  const at=promptIndex(prompts,deck,action.index);if(at>=0){next.sentenceIndex=at;next.sentenceFinished=false;if(listeningFinished)forgetSentence(next,prompts,at);}return next;
 }
 if(action.type==='retryWord'&&word&&s.module==='spelling'&&s.words[word.id]?.result){reopen(next,word);pause(next);return next;}
 if(action.type==='listeningJump'&&s.module==='listening'&&s.mode==='listening'&&Number.isInteger(action.index)&&prompts[action.index]){next.sentenceIndex=action.index;next.sentenceFinished=false;navigate(prompts[action.index].wordIndex);return next;}
 if(action.type==='sentenceNext'){
  const p=prompts[s.sentenceIndex],draft=p&&s.sentences[p.key];if(!p||(s.mode!=='listening'&&!draft?.outcomes[s.mode]))return s;
  if(s.sentenceIndex+1<prompts.length){next.sentenceIndex++;navigate(prompts[next.sentenceIndex].wordIndex);}else {next.sentenceFinished=true;pause(next);}return next;
 }
 if(action.type==='speakingNext'&&s.module==='speaking'&&word){navigate(Math.min(deck.words.length,s.index+1));return next;}
 if(action.type==='sentencePrevious'){
  if(s.sentenceIndex>0){next.sentenceIndex--;next.sentenceFinished=false;navigate(prompts[next.sentenceIndex].wordIndex);}return next;
 }
 if(!word||s.module!=='spelling')return s;
 prepare(deck,next);const draft=next.words[word.id],expected=expectedInput(word,draft);
 if(action.type==='next'&&draft.result){
  let index=s.index+1;while(next.quick&&deck.words[index]&&next.history[deck.words[index].id]?.mastered)index++;
  // Stepping into a word answered earlier in the round must open a fresh attempt, not a read-only answer.
  const target=deck.words[index];if(target&&next.words[target.id]?.result)reopen(next,target);
  navigate(index);return next;
 }
 if(draft.result)return s;
 if(action.type==='reveal'){draft.input=expected;draft.result='revealed';next.history[word.id]={mastered:false,mistakes:[...word.english].flatMap((c,i)=>fixed(c)?[]:[i])};pause(next);return next;}
 return s;
}
// Keystrokes only copy the current draft and maps that actually change. Navigation
// still uses the general reducer; no unrelated sentence bank is rebuilt per letter.
function inputStudy(deck,s,action){
 const word=deck.words[s.index];
 if(!word||s.module!=='spelling'||typeof action.value!=='string'||wordDraft(deck,s).result)return s;
 const next={...s,words:{...s.words}},old=s.words[word.id];
 if(old)next.words[word.id]={...old};else prepare(deck,next);
 const draft=next.words[word.id],expected=expectedInput(word,draft);
 draft.input=resolve(expected,draft.input,action.value.slice(0,200));const wrong=mismatch(expected,draft.input);
 if(draft.input===old?.input&&draft.input.toLowerCase()!==expected.toLowerCase())return s;
 if(wrong>=0){draft.hadMistake=true;const actualIndex=draft.quickIndices?.[wrong]??wrong;const old=next.history[word.id]?.mistakes||[];next.history={...next.history};next.history[word.id]={mastered:false,mistakes:[...new Set([...old,actualIndex])].sort((a,b)=>a-b)};}
 if(draft.input.toLowerCase()===expected.toLowerCase()){draft.result=draft.hadMistake?'reviewed':'correct';next.pending='word';if(!draft.hadMistake){next.history={...next.history};next.history[word.id]={mastered:true,mistakes:[]};}}
 return next;
}
