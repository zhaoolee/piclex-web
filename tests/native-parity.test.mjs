import test from 'node:test';
import assert from 'node:assert/strict';
import {convertPrompt,completionProgress} from '../packages/learning-ui/src/spelling.mjs';
import {tokens,chunks,checkSentence,newSentence,reduceSentence,sentenceParts,promptsFor,guidedCorrect} from '../packages/practice/src/sentence.mjs';
import {newStudy,restoreStudy,reduceStudy,studyKey,wordDraft} from '../packages/practice/src/study.mjs';
const deck={fingerprint:'parity',words:[{id:'a',english:'apple',chinese:'苹果',imageIndex:0,example:'I eat an apple.',exampleChinese:'我吃一个苹果。'},{id:'b',english:'bed',chinese:'床',imageIndex:0,example:'I am in bed.',exampleChinese:'我在床上。'},{id:'c',english:'cup',chinese:'杯子',imageIndex:1,example:'The cup is on the table.',exampleChinese:'杯子在桌上。'}]};
const act=(s,type,extra={})=>reduceStudy(deck,s,{type,...extra,question:studyKey(s)});
const prompt={key:'test',sentence:'To be or not to be.',translation:'生存还是毁灭。'};
const sentenceAct=(s,mode,type,extra={})=>reduceSentence(prompt,s,mode,{key:prompt.key,type,...extra});
test('native contraction and punctuation grading preserves negation and repeated words',()=>{
 for(const [a,b] of [["I'm here.",'I am here'],["I can't go!",'I cannot go'],['We’re ready.','we are ready'],['a red-blue bag','a red blue bag']])assert.equal(checkSentence(a,b).isCorrect,true);
 assert.equal(checkSentence('I can go.',"I can't go").isCorrect,false);
 const check=checkSentence('the red car is parked here','the blue car parked here today');assert.deepEqual(check.edits.map(e=>e.kind),['match','substitution','match','omission','match','match','addition']);
 assert.equal(checkSentence('', '').isCorrect,false);
 assert.equal(checkSentence('to be or not to be','to be or not be').edits.filter(e=>e.kind==='omission').length,1);
});
test('native phrase partition keeps punctuation, duplicate identity, complete coverage and bounded phrase lengths',()=>{
 for(const text of ['go go go','I use a camera to take pictures of the garden.','The man in the blue shirt is reading a newspaper under a tree while his dog sleeps peacefully on the grass beside him.']){
  const list=chunks(text);assert.equal(list.map(c=>c.text).join(' '),text);assert.equal(new Set(list.map(c=>c.id)).size,list.length);assert.ok(list.every(c=>c.text.split(' ').length<=4));
 }
 assert.deepEqual(chunks('I am in bed.').map(c=>c.text),['I','am','in','bed.']);
});
test('dialogue segmentation aligns only matching translations; curated sentence occurrences remain distinct',()=>{
 const parts=sentenceParts('A: Good morning. B: Hello!','甲：早上好。\n乙：你好！');assert.equal(parts.length,2);assert.deepEqual(parts.map(p=>p.translation),['早上好。','你好！']);
 assert.equal(sentenceParts('Hi! Come in.','你好！')[0].translation,'');
 const clone={...deck,words:[deck.words[0],{...deck.words[0],id:'alias'},{...deck.words[0],id:'o1',occurrenceID:'lesson:1'},{...deck.words[0],id:'o2',occurrenceID:'lesson:2'}]};assert.equal(promptsFor(clone).length,3);
});
test('chunks auto-check on fill, preserve repeated IDs, allow correction and resolve only once',()=>{
 let s=newSentence(prompt,()=>.1);assert.notDeepEqual(s.bank,s.chunks.map(c=>c.id));
 for(const id of [1,0,2,3,4,5])s=sentenceAct(s,'chunks','select',{id});assert.equal(s.checks.chunks.isCorrect,false);assert.equal(s.statistics.chunks.submissions,1);
 s=sentenceAct(s,'chunks','move',{id:0,offset:-1});assert.equal(s.outcomes.chunks,'correct');assert.equal(s.statistics.chunks.correct,1);assert.equal(s.pending,'chunks');
 const done=s;assert.equal(sentenceAct(s,'chunks','submit'),done);assert.equal(sentenceAct(s,'chunks','remove',{id:0}),done);
});
test('assistance is terminal, independent by mode and never a correct result',()=>{
 let s=sentenceAct(newSentence(prompt),'chunks','select',{id:0});s=sentenceAct(s,'free','input',{value:'to be'});assert.equal(s.selected.length,1);
 s=sentenceAct(s,'free','giveUp');assert.equal(s.outcomes.free,'assisted');assert.equal(s.statistics.free.correct,0);assert.equal(s.pending,null);assert.equal(s.selected.length,1);
 s=sentenceAct(s,'chunks','giveUp');assert.equal(s.outcomes.chunks,'assisted');assert.equal(s.statistics.chunks.correct,0);
});
test('free typing auto-completes with native equivalence; guided apostrophe handling does not weaken hard mode',()=>{
 const p={key:'contraction',sentence:"I'm here.",translation:''};let s=newSentence(p);
 s=reduceSentence(p,s,'free',{key:p.key,type:'input',value:'I am here'});assert.equal(s.outcomes.free,'correct');
 assert.equal(guidedCorrect("I'm here.",['im','here']),true);assert.equal(checkSentence("I'm here.",'im here').isCorrect,false);
 let bad=sentenceAct(newSentence(prompt),'free','input',{value:'To bee'});bad=sentenceAct(bad,'free','submit');assert.equal(bad.checks.free.isCorrect,false);bad=sentenceAct(bad,'free','reveal');bad=sentenceAct(bad,'free','retry');assert.equal(bad.freeText,'');assert.equal(bad.statistics.free.submissions,1);
});
test('complete free dictation checks automatically, clears stale errors while incomplete, and still completes after correction',()=>{
 const p={key:'auto-free',sentence:"I'm in room 3 at 8 pm.",translation:''};
 const freeAct=(s,type,extra={})=>reduceSentence(p,s,'free',{key:p.key,type,...extra});
 let hard=newSentence(p);
 hard=freeAct(hard,'input',{value:'Iminroom3at8'});
 assert.equal(hard.checks.free,undefined);assert.equal(hard.statistics.free.submissions,0);assert.equal(hard.outcomes.free,undefined);
 hard=freeAct(hard,'input',{value:'Iminroom3at8pm'});
 assert.equal(hard.checks.free?.isCorrect,false);assert.equal(hard.statistics.free.submissions,1);assert.equal(hard.outcomes.free,undefined);assert.equal(hard.pending,null);
 hard=freeAct(hard,'input',{value:'Iminroom3at8'});
 assert.equal(hard.checks.free,undefined);assert.equal(hard.statistics.free.submissions,1);
 hard=freeAct(hard,'input',{value:'Iminroom3at8pm'});assert.equal(hard.checks.free?.isCorrect,false);assert.equal(hard.statistics.free.submissions,2);
 hard=freeAct(hard,'input',{value:p.sentence});
 assert.equal(hard.checks.free.isCorrect,true);assert.equal(hard.outcomes.free,'correct');assert.equal(hard.pending,'free');assert.equal(hard.statistics.free.correct,1);
 let guided=newSentence(p);
 guided=freeAct(guided,'guided',{values:['I','in','room','3','at','8','pm']});
 assert.equal(guided.checks.free,undefined);assert.equal(guided.statistics.free.submissions,0);
 guided=freeAct(guided,'guided',{values:['xx','in','room','3','at','8','pm']});
 assert.equal(guided.checks.free?.isCorrect,false);assert.equal(guided.statistics.free.submissions,1);assert.equal(guided.outcomes.free,undefined);
 guided=freeAct(guided,'guided',{values:['x','in','room','3','at','8','pm']});
 assert.equal(guided.checks.free,undefined);assert.equal(guided.statistics.free.submissions,1);
 guided=freeAct(guided,'guided',{values:['Im','in','room','3','at','8','pm']});
 assert.equal(guided.checks.free.isCorrect,true);assert.equal(guided.outcomes.free,'correct');assert.equal(guided.pending,'free');assert.equal(guided.statistics.free.correct,1);
});
test('spelling blocks additions after errors, remembers quick slots and rejects delayed actions after navigation',()=>{
 let s=act(newStudy(deck),'input',{value:'ax'});assert.equal(act(s,'input',{value:'axp'}).words.a.input,'ax');s=act(s,'input',{value:'a'});s=act(s,'input',{value:'apple'});assert.equal(s.words.a.result,'reviewed');const stale=studyKey(s);
 s=act(s,'selectWord',{index:2});assert.equal(reduceStudy(deck,s,{type:'next',question:stale}),s);
 s=act(s,'restart');s=act(s,'preference',{name:'quick',value:true});s=act(s,'input',{value:'p'});assert.equal(s.words.a.result,'correct');assert.deepEqual(s.words.a.quickIndices,[1]);
 s=act(s,'restart');assert.equal(s.index,1); // mastered apple skipped, never all words skipped blindly
});
test('sentence navigation begins at current word, preserves drafts and never grades spelling',()=>{
 let s=act(newStudy(deck),'selectWord',{index:1});s=act(s,'input',{value:'b'});s=act(s,'module',{value:'listening'});assert.equal(s.sentenceIndex,1);
 s=act(s,'sentence',{action:{type:'select',id:0}});const p=promptsFor(deck)[1];const bank=s.sentences[p.key].bank;
 s=act(s,'mode',{value:'free'});s=act(s,'sentence',{action:{type:'input',value:'I am'}});s=act(s,'selectWord',{index:2});s=act(s,'selectWord',{index:1});assert.equal(s.sentences[p.key].freeText,'I am');assert.deepEqual(s.sentences[p.key].bank,bank);assert.deepEqual(s.sentences[p.key].selected,[0]);
 s=act(s,'sentence',{action:{type:'input',value:'I am in bed'}});assert.equal(s.sentences[p.key].pending,'free');s=act(s,'mode',{value:'chunks'});assert.equal(s.sentences[p.key].pending,null);assert.equal(s.words.b.input,'b');assert.equal(s.words.b.result,null);
 s=act(s,'mode',{value:'free'});s=act(s,'sentenceNext');assert.equal(s.index,2);assert.equal(s.sentenceIndex,2);assert.equal(s.words.b.result,null);
});
test('refresh validates drafts, preserves bank order and assistance, and clears automatic callbacks',()=>{
 let s=act(newStudy(deck),'module',{value:'listening'});s=act(s,'sentence',{action:{type:'select',id:0}});s=act(s,'mode',{value:'free'});s=act(s,'sentence',{action:{type:'giveUp'}});
 const restored=restoreStudy(deck,JSON.parse(JSON.stringify(s)));const key=promptsFor(deck)[0].key;assert.deepEqual(restored.sentences[key].bank,s.sentences[key].bank);assert.deepEqual(restored.sentences[key].selected,[0]);assert.equal(restored.sentences[key].outcomes.free,'assisted');assert.equal(restored.sentences[key].statistics.free.correct,0);assert.equal(restored.sentences[key].pending,null);
 assert.equal(restoreStudy(deck,{...s,index:-1}).index,0);
 const legacy={version:1,fingerprint:deck.fingerprint,round:0,index:1,input:'be',hadMistake:false,result:null,results:['correct']};const migrated=restoreStudy(deck,null,legacy);assert.equal(migrated.index,1);assert.equal(wordDraft(deck,migrated).input,'be');assert.equal(migrated.words.a.result,'correct');
});

test('native teaching chunks match the mobile baseline example',()=>assert.deepEqual(chunks('She swings the racket to hit the ball.').map(c=>c.text),['She','swings','the racket','to hit','the ball.']));

test('programming vocabulary cannot collide with Object prototype properties',()=>{assert.deepEqual(tokens('constructor prototype toString hasOwnProperty'),['constructor','prototype','tostring','hasownproperty']);assert.equal(checkSentence('Use the constructor.','use the constructor').isCorrect,true);});

test('quick/full conversion never invents typed letters, and glow counts only the correct prefix',()=>{
 assert.equal(convertPrompt('apple','p',[2],null),'');
 assert.equal(convertPrompt('apple','ap',null,[1,3]),'p');
 assert.equal(convertPrompt('ice cream','ice c',null,null),'ice c');
 assert.equal(completionProgress('ice cream','ice c'),4/8);
 assert.equal(completionProgress('apple','axp'),1/5);
});

import {accumulateReading} from '../packages/practice/src/reading.mjs';
test('speaking retains earlier matched positions without crediting repeated partials twice',()=>{
 let result=accumulateReading('I am still in bed.','I am still');assert.equal(result.passed,false);assert.equal(result.matched.length,3);
 result=accumulateReading('I am still in bed.','in bed',result.matched);assert.equal(result.passed,true);
 const once=accumulateReading('go go','go');assert.equal(once.matched.length,1);assert.equal(accumulateReading('go go','go',once.matched).passed,false);assert.equal(accumulateReading('go go','go go',once.matched).passed,true);
});
test('speaking can finish the final sentence and restart in the same module without grading spelling',()=>{
 let s=act(newStudy(deck),'module',{value:'speaking'});for(let i=0;i<deck.words.length;i++)s=act(s,'speakingNext');assert.equal(s.index,deck.words.length);assert.equal(s.module,'speaking');assert.ok(Object.values(s.words).every(d=>!d.result));s=act(s,'restart');assert.equal(s.index,0);assert.equal(s.module,'speaking');
});

test('guided drafts switch to hard input without phantom trailing word spaces',()=>{
 const p={key:'guided-space-boundary',sentence:'A croissant is on the wooden plate.'};
 const s=reduceSentence(p,newSentence(p),'free',{key:p.key,type:'guided',values:['a','','is','','','','']});
 assert.equal(s.freeText,'a  is');
 assert.deepEqual(s.guided,['a','','is','','','','']);
 assert.equal(s.outcomes.free,undefined);
});
