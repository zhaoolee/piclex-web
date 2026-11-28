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

test('advancing in free dictation opens a blank attempt for a saved destination',()=>{
 const [first,second]=promptsFor(dialogueDeck);
 for(const savedAnswer of [
  {type:'guided',values:['Read','the','reply']},
  {type:'giveUp'},
  {type:'guided',values:['Read','th']},
 ]){
  let s={...start('chunks'),sentenceIndex:1};
  s=act(s,{type:'sentence',action:{type:'select',id:0}});
  s=act(s,{type:'mode',value:'free'});
  s=act(s,{type:'sentence',action:savedAnswer});
  s=act(s,{type:'sentencePrevious'});
  s=restoreStudy(dialogueDeck,JSON.parse(JSON.stringify(s)));
  const saved=s.sentences[second.key];
  assert.notEqual(saved.freeText,'');

  s=act(answer(s,['Send','a','request']),{type:'sentenceNext'});
  assert.equal(s.sentenceIndex,1);
  assert.equal(s.sentences[first.key].outcomes.free,'correct');
  const fresh=s.sentences[second.key];
  assert.equal(fresh.freeText,'');
  assert.equal(fresh.guided,null);
  assert.equal(fresh.pending,null);
  assert.equal(fresh.outcomes.free,undefined);
  assert.equal(fresh.checks.free,undefined);
  assert.ok(!fresh.revealed.includes('free'));
  assert.deepEqual(fresh.selected,saved.selected);
  assert.deepEqual(fresh.statistics,saved.statistics);
  assert.deepEqual(answer(s,['R']).sentences[second.key].guided,['R','','']);
 }
});

test('a saved draft and direct link to a repeated sentence still open that attempt',()=>{
 const link='#/deck/dialogue?module=listening&photo=1&word=request&mode=free&sentence=1&difficulty=easy';
 let s=applyLearningURL(dialogueDeck,start(),parseLearningURL(link));
 assert.equal(s.sentenceIndex,2);
 s=answer(s,['Send']);
 s=restoreStudy(dialogueDeck,JSON.parse(JSON.stringify(s)));
 assert.equal(learningHash(dialogueDeck,s),link);
 // A legacy hard link opens the same easy guided attempt and writes the current link.
 const legacy=applyLearningURL(dialogueDeck,start(),parseLearningURL(link.replace('difficulty=easy','difficulty=hard')));
 assert.equal(legacy.sentenceIndex,2);assert.equal(legacy.mode,'free');
 assert.equal(learningHash(dialogueDeck,restoreStudy(dialogueDeck,JSON.parse(JSON.stringify(legacy)))),link);
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

const fragmentDeck={
 id:'fragments',fingerprint:'fragments',
 words:[
  {id:'ready',imageIndex:0,english:'ready',example:'Ready? We can go. Wait! Take the map. Quiet.'},
  {id:'stop',imageIndex:1,english:'stop',example:'Stop.'},
 ],
};
const fragmentAction=(state,action)=>reduceStudy(fragmentDeck,state,{...action,question:studyKey(state)});

test('free dictation opens and advances through full sentences on the same card',()=>{
 const prompts=promptsFor(fragmentDeck),prompt=state=>prompts[state.sentenceIndex].sentence;
 const spelling=newStudy(fragmentDeck);
 const chunks=fragmentAction(spelling,{type:'module',value:'listening'});
 assert.equal(prompt(chunks),'Ready?');
 const listening=fragmentAction(chunks,{type:'mode',value:'listening'});
 assert.equal(prompt(listening),'Ready?');
 let state=fragmentAction(listening,{type:'mode',value:'free'});
 assert.equal(prompt(state),'We can go.');
 state=fragmentAction(state,{type:'module',value:'spelling'});
 state=fragmentAction(state,{type:'selectWord',index:1});
 state=fragmentAction(state,{type:'selectWord',index:0});
 state=fragmentAction(state,{type:'module',value:'listening'});
 assert.equal(prompt(state),'We can go.');
 assert.equal(state.index,0);

 const advance=(state,values)=>{
  const solved=fragmentAction(state,{type:'sentence',action:{type:'guided',values}});
  assert.equal(solved.sentences[prompts[state.sentenceIndex].key].outcomes.free,'correct');
  return fragmentAction(solved,{type:'sentenceNext'});
 };
 state=advance(state,['We','can','go']);
 assert.equal(prompt(state),'Take the map.');
 const previous=fragmentAction(state,{type:'sentencePrevious'});
 assert.equal(prompt(previous),'We can go.');
 state=advance(state,['Take','the','map']);
 assert.equal(prompt(state),'Stop.');
 assert.equal(state.index,1);
});

test('old fragment links and saved cursors select a full sentence without reusing the fragment draft',()=>{
 const prompts=promptsFor(fragmentDeck);
 const start={...newStudy(fragmentDeck),module:'listening',mode:'free',sentenceIndex:1};
 const drafted=fragmentAction(start,{type:'sentence',action:{type:'guided',values:['We','c']}});
 const old={...drafted,sentenceIndex:0};
 const fragmentDraft=fragmentAction(old,{type:'sentence',action:{type:'guided',values:['Re']}});
 const restored=restoreStudy(fragmentDeck,fragmentDraft);
 assert.equal(restored.sentenceIndex,1);
 assert.deepEqual(restored.sentences[prompts[1].key].guided,['We','c','']);
 assert.deepEqual(restored.sentences[prompts[0].key].guided,['Re']);

 const link=sentence=>parseLearningURL(`#/deck/fragments?module=listening&mode=free&photo=1&word=ready&sentence=${sentence}`);
 assert.equal(applyLearningURL(fragmentDeck,restored,link(1)).sentenceIndex,1);
 assert.equal(applyLearningURL(fragmentDeck,restored,link(3)).sentenceIndex,3);
 assert.equal(applyLearningURL(fragmentDeck,restored,link(5)).sentenceIndex,3);
 assert.match(learningHash(fragmentDeck,restored),/&sentence=2&/);
});

test('a free dictation challenge from a final fragment opens the previous full sentence',()=>{
 const deck={...fragmentDeck,words:fragmentDeck.words.slice(0,1)};
 const last={...newStudy(deck),module:'listening',mode:'chunks',sentenceIndex:4,sentenceFinished:true};
 const challenge=reduceStudy(deck,last,{type:'dictationChallenge',question:studyKey(last)});
 assert.equal(challenge.mode,'free');
 assert.equal(challenge.sentenceFinished,false);
 assert.equal(challenge.sentenceIndex,3);
 const finished={...challenge,sentenceFinished:true};
 const restarted=reduceStudy(deck,finished,{type:'dictationRestart',question:studyKey(finished)});
 assert.equal(restarted.sentenceIndex,1);
});
