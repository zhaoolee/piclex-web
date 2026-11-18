import test from 'node:test';
import assert from 'node:assert/strict';
import {listeningPlaylist,listeningNeighbor} from '../packages/practice/src/listening.mjs';
import {applyLearningURL,learningHash,parseLearningURL} from '../packages/practice/src/learning-url.mjs';
import {promptsFor} from '../packages/practice/src/sentence.mjs';
import {newStudy,reduceStudy,restoreStudy,studyKey} from '../packages/practice/src/study.mjs';
const prompts=[{key:'a',imageIndex:0,wordIndex:0},{key:'b',imageIndex:0,wordIndex:1},{key:'c',imageIndex:1,wordIndex:2},{key:'d',imageIndex:1,wordIndex:3},{key:'e',imageIndex:1,wordIndex:4}];
const words=[{},{},{},{occurrenceID:'song-1'},{occurrenceID:'song-2'}];
test('one photo retains current sentence and every explicit song occurrence',()=>{
 assert.deepEqual(listeningPlaylist(prompts,words,false,'b'),[0,1,2,3,4]);
 assert.deepEqual(listeningPlaylist(prompts,words,true,'b'),[1,2,3,4]);
 assert.deepEqual(listeningPlaylist(prompts,words,true,'e'),[0,2,3,4]);
});
test('manual and automatic navigation wrap in both directions in the filtered list',()=>{
 const list=listeningPlaylist(prompts,words,true,'b');
 assert.equal(listeningNeighbor(list,1,-1),4);assert.equal(listeningNeighbor(list,4,1),1);assert.equal(listeningNeighbor(list,1,1),2);
 assert.equal(listeningNeighbor([2],2,1),2);
});
test('jump selects exact sentence even when multiple sentences share a word',()=>{
 const deck={fingerprint:'test',words:[{id:'a',english:'desk',example:'This is a desk. It is white.',exampleChinese:'',imageIndex:0}]};
 let s={...newStudy(deck),module:'listening',mode:'listening'};
 s=reduceStudy(deck,s,{type:'listeningJump',index:1,question:studyKey(s)});assert.equal(s.sentenceIndex,1);assert.equal(s.index,0);assert.equal(s.sentenceFinished,false);
 s=reduceStudy(deck,s,{type:'listeningJump',index:0,question:studyKey(s)});assert.equal(s.sentenceIndex,0);
});

const dialogueDeck={
 id:'dialogue',fingerprint:'dialogue',
 words:[
  {id:'dialogue',imageIndex:0,english:'reply',example:'A: Send a request. B: Read the reply.'},
  {id:'request',imageIndex:0,english:'request',example:'Send a request.'},
  {id:'reply',imageIndex:0,english:'read',example:'Read the reply.'},
  {id:'next-photo',imageIndex:1,english:'send',example:'Send a request.'},
  {id:'line-one',imageIndex:2,english:'hello',example:'Hello again.',occurrenceID:'line:1'},
  {id:'line-two',imageIndex:2,english:'again',example:'Hello again.',occurrenceID:'line:2'},
 ]
};
const act=(s,action)=>reduceStudy(dialogueDeck,s,{...action,question:studyKey(s)});
const start=(mode='free')=>act(act(newStudy(dialogueDeck),{type:'module',value:'listening'}),{type:'mode',value:mode});
const answer=(s,values)=>act(s,{type:'sentence',action:{type:'guided',values}});

test('free dictation advances past repeated sentences on the same photo only',()=>{
 const prompts=promptsFor(dialogueDeck);
 let s=act(start(),{type:'preference',name:'difficulty',value:'easy'});
 for(const [index,values,next] of [
  [0,['Send','a','request'],1],
  [1,['Read','the','reply'],4],
  [4,['Send','a','request'],5],
  [5,['Hello','again'],6],
 ]){
  const solved=answer(s,values);
  assert.equal(solved.sentences[prompts[index].key].statistics.free.correct,1);
  s=act(solved,{type:'sentenceNext'});
  assert.equal(s.sentenceIndex,next);
  assert.equal(s.index,prompts[next].wordIndex);
 }
 assert.deepEqual(Object.keys(s.sentences),[0,1,4,5].map(i=>prompts[i].key));
});

test('a saved draft and direct link to a repeated sentence still open that attempt',()=>{
 const link='#/deck/dialogue?module=listening&photo=1&word=request&mode=free&sentence=1&difficulty=easy';
 let s=applyLearningURL(dialogueDeck,start(),parseLearningURL(link));
 assert.equal(s.sentenceIndex,2);
 s=answer(s,['Send']);
 s=restoreStudy(dialogueDeck,JSON.parse(JSON.stringify(s)));
 assert.equal(learningHash(dialogueDeck,s),link);
 const prompts=promptsFor(dialogueDeck);
 assert.equal(s.sentences[prompts[2].key].guided[0],'Send');
 s=act(answer(s,['Send','a','request']),{type:'sentenceNext'});
 assert.equal(s.index,3);
});

test('a trailing repeated sentence completes free dictation while chunks retain their prompts',()=>{
 const deck={...dialogueDeck,words:dialogueDeck.words.slice(0,3)};
 const prompts=promptsFor(deck);
 for(const mode of ['free','chunks']){
  const s={...newStudy(deck),module:'listening',mode,sentenceIndex:1};
  const assisted=reduceStudy(deck,s,{type:'sentence',question:studyKey(s),action:{type:'giveUp'}});
  const next=reduceStudy(deck,assisted,{type:'sentenceNext',question:studyKey(assisted)});
  assert.equal(next.sentenceFinished,mode==='free');
  assert.equal(next.sentenceIndex,mode==='free'?1:2);
  assert.equal(next.sentences[prompts[1].key].outcomes[mode],'assisted');
 }
});
