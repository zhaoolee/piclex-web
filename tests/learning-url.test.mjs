import test from 'node:test';
import assert from 'node:assert/strict';
import {newStudy,reduceStudy,restoreStudy,studyKey} from '../packages/practice/src/study.mjs';
import {promptsFor} from '../packages/practice/src/sentence.mjs';
import {parseLearningURL,applyLearningURL,learningHash} from '../packages/practice/src/learning-url.mjs';
const deck={id:'deck / ? 中文',fingerprint:'test',words:[
 {id:'word?a&b',imageIndex:0,english:'apple',example:'I eat an apple.',exampleChinese:'我吃一个苹果。'},
 {id:'b',imageIndex:0,english:'bed',example:'A: Hello. B: Hi!',exampleChinese:'甲：你好。\n乙：嗨！'},
 {id:'c',imageIndex:1,english:'cup',example:'Here is a cup.',exampleChinese:'这是一个杯子。'}
]};
const apply=(s,p)=>applyLearningURL(deck,s,parseLearningURL(`#/deck/${encodeURIComponent(deck.id)}?${p}`));
test('shared links restore each module and exact sentence part in a clean study',()=>{
 const prompts=promptsFor(deck);
 for(const module of ['spelling','listening','speaking'])for(const mode of ['chunks','free','listening']){
  const original={...newStudy(deck),index:1,module,mode,sentenceIndex:prompts.findLastIndex(p=>p.wordIndex===1)};
  const restored=applyLearningURL(deck,newStudy(deck),parseLearningURL(learningHash(deck,original)));
  assert.equal(restored.module,module);assert.equal(restored.index,1);
  if(module==='listening'){assert.equal(restored.mode,mode);assert.equal(restored.sentenceIndex,original.sentenceIndex);}
 }
});
test('legacy dictation difficulty does not override the saved or linked exercise',()=>{
 const prompt=promptsFor(deck)[0];
 for(const [difficulty,guided] of [['medium',['I','eat','','']],['hard',null]]){
  const opened=apply(newStudy(deck),`module=listening&mode=free&difficulty=${difficulty}&photo=2&sentence=1`);
  assert.equal(opened.mode,'free');
  assert.equal(opened.index,2);
  assert.match(learningHash(deck,opened),/&difficulty=easy$/);
  const saved={...newStudy(deck),module:'listening',mode:'free',difficulty,sentences:{[prompt.key]:{freeText:'I eat',guided}}};
  const restored=restoreStudy(deck,JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.mode,'free');
  assert.equal(restored.sentences[prompt.key].freeText,'I eat');
  assert.deepEqual(restored.sentences[prompt.key].guided,guided);
 }
});
test('stable word identity wins after photo reordering; missing word falls back to photo',()=>{
 const hash=learningHash(deck,{...newStudy(deck),index:2});
 const changed={...deck,words:[deck.words[2],deck.words[0],deck.words[1]]};
 assert.equal(applyLearningURL(changed,newStudy(changed),parseLearningURL(hash)).index,0);
 assert.equal(apply(newStudy(deck),'photo=2&word=removed').index,2);
});
test('URL navigation preserves drafts, grades, history and does not accept forged progress',()=>{
 let saved=reduceStudy(deck,newStudy(deck),{type:'input',value:'a',question:studyKey(newStudy(deck))});
 const before=structuredClone(saved),next=apply(saved,'module=listening&photo=2&mode=free&difficulty=easy&xp=99999&result=correct&input=cup');
 assert.deepEqual(saved,before);assert.deepEqual(next.words[deck.words[0].id],before.words[deck.words[0].id]);assert.equal(next.words.c.input,'');assert.equal(next.words.c.result,null);assert.deepEqual(next.history,before.history);assert.equal(next.round,0);assert.equal(next.pending,null);
 assert.equal(next.index,2);assert.equal(next.module,'listening');
 const hash=learningHash(deck,next);for(const privateKey of ['input','xp','result','history','round','rate'])assert.equal(new URLSearchParams(hash.split('?')[1]).has(privateKey),false);
});
test('a spelling link reopens a completed word without erasing the round or other drafts',()=>{
 let saved=newStudy(deck);
 saved=reduceStudy(deck,saved,{type:'input',value:'apple',question:studyKey(saved)});
 saved=reduceStudy(deck,saved,{type:'next',question:studyKey(saved)});
 saved=reduceStudy(deck,saved,{type:'input',value:'b',question:studyKey(saved)});
 const original=structuredClone(saved),reopened=apply(saved,'module=spelling&photo=1&word=word%3Fa%26b');
 assert.equal(reopened.index,0);assert.equal(reopened.words[deck.words[0].id].input,'');assert.equal(reopened.words[deck.words[0].id].result,null);
 assert.deepEqual(reopened.words.b,original.words.b);assert.deepEqual(reopened.history,original.history);assert.equal(reopened.round,original.round);
 assert.equal(saved.words[deck.words[0].id].result,'correct');
 const repeated=apply(reopened,'module=spelling&photo=1&word=word%3Fa%26b');assert.equal(repeated.words[deck.words[0].id].result,null);
});
test('legacy links retain saved state; invalid or foreign destinations cannot corrupt cursors',()=>{
 const saved={...newStudy(deck),index:2};
 assert.equal(apply(saved,''),saved);assert.equal(parseLearningURL('#/deck/%zz'),null);assert.equal(parseLearningURL('#/settings'),null);
 assert.equal(applyLearningURL(deck,saved,parseLearningURL('#/deck/other?photo=1')),saved);
 for(const p of ['photo=-1','photo=0','photo=999999999','photo=NaN','word=missing','module=evil&mode=evil&difficulty=evil','photo=1e6','sentence=999999999'])assert.equal(apply(saved,p).index,2);
 const encoded=learningHash(deck,newStudy(deck));assert.equal(parseLearningURL(encoded).id,deck.id);assert.equal(parseLearningURL(encoded).word,deck.words[0].id);
});

test('completion URLs preserve locally earned completion without sharing a fabricated grade',()=>{
 for(const original of [{...newStudy(deck),index:deck.words.length},{...newStudy(deck),module:'listening',mode:'free',index:2,sentenceIndex:promptsFor(deck).length-1,sentenceFinished:true}]){
  const route=parseLearningURL(learningHash(deck,original));assert.equal(route.photo,null);assert.equal(route.word,'');
  const restored=applyLearningURL(deck,original,route);assert.equal(restored.index,original.index);assert.equal(restored.sentenceFinished,original.sentenceFinished);
  const recipient=applyLearningURL(deck,newStudy(deck),route);assert.equal(recipient.index,0);assert.equal(recipient.sentenceFinished,false);assert.deepEqual(recipient.history,{});
 }
});

test('shared sentences preserve the active word, focus box and progress independently of prompt identity',()=>{
 const shared={...deck,words:[...deck.words,{...deck.words[1],id:'another-object'}]};
 const original={...newStudy(shared),index:3,module:'listening',mode:'listening',sentenceIndex:promptsFor(shared).findLastIndex(p=>p.wordIndex===1)};
 const restored=applyLearningURL(shared,newStudy(shared),parseLearningURL(learningHash(shared,original)));
 assert.equal(restored.index,3);assert.equal(restored.sentenceIndex,original.sentenceIndex);
});
