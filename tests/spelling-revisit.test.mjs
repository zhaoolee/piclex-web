import test from 'node:test';
import assert from 'node:assert/strict';
import {newStudy,reduceStudy,studyKey} from '../packages/practice/src/study.mjs';
import {promptsFor} from '../packages/practice/src/sentence.mjs';
import {parseLearningURL,applyLearningURL} from '../packages/practice/src/learning-url.mjs';

const deck={id:'revisit',fingerprint:'revisit',words:[
 {id:'a',english:'apple',chinese:'苹果',imageIndex:0,example:'I eat an apple.',exampleChinese:'我吃一个苹果。'},
 {id:'b',english:'bed',chinese:'床',imageIndex:0,example:'I am in bed.',exampleChinese:'我在床上。'},
 {id:'c',english:'cup',chinese:'杯子',imageIndex:1,example:'The cup is here.',exampleChinese:'杯子在这里。'},
 {id:'d',english:'door',chinese:'门',imageIndex:1,example:'Open the door.',exampleChinese:'打开门。'}
]};
const act=(s,action)=>reduceStudy(deck,s,{...action,question:studyKey(s)},promptsFor(deck));
const empty={input:'',hadMistake:false,result:null,quickIndices:null};
const link=(index)=>`#/deck/${deck.id}?module=spelling&photo=${deck.words[index].imageIndex+1}&word=${encodeURIComponent(deck.words[index].id)}`;
function finishAll(){
 let s=newStudy(deck);
 for(let i=0;i<deck.words.length;i++){s=act(s,{type:'input',value:deck.words[i].english});s=act(s,{type:'next'});}
 return s;
}

test('a link revisit keeps reopening every completed word the next action reaches',()=>{
 const done=finishAll();assert.equal(done.index,deck.words.length);
 let s=applyLearningURL(deck,done,parseLearningURL(link(1)));
 assert.equal(s.index,1);assert.deepEqual(s.words.b,empty);
 const {round,history}=s;
 s=act(s,{type:'input',value:'bed'});assert.equal(s.words.b.result,'correct');
 s=act(s,{type:'next'});assert.equal(s.index,2);assert.deepEqual(s.words.c,empty);
 s=act(s,{type:'input',value:'cup'});assert.ok(s.words.c.result);
 s=act(s,{type:'next'});assert.equal(s.index,3);assert.deepEqual(s.words.d,empty);
 s=act(s,{type:'input',value:'door'});s=act(s,{type:'next'});
 assert.equal(s.index,deck.words.length);assert.equal(s.round,round);
 assert.deepEqual(s.history.a,history.a);assert.deepEqual(s.history.b,history.b);
});

test('manual next after reveal reopens the next completed word',()=>{
 let s=applyLearningURL(deck,finishAll(),parseLearningURL(link(1)));
 s=act(s,{type:'input',value:'b'});s=act(s,{type:'reveal'});
 assert.equal(s.words.b.result,'revealed');
 s=act(s,{type:'next'});assert.equal(s.index,2);assert.deepEqual(s.words.c,empty);
});

test('a word without a grade keeps the unfinished draft when it is reached again',()=>{
 let s=newStudy(deck);
 s=act(s,{type:'input',value:'apple'});s=act(s,{type:'next'});
 s=act(s,{type:'input',value:'be'});
 s=act(s,{type:'selectWord',index:0});s=act(s,{type:'next'});
 assert.equal(s.index,1);assert.equal(s.words.b.input,'be');assert.equal(s.words.b.result,null);
});

test('dictation and speaking navigation never clear a spelling draft or grade',()=>{
 let s=applyLearningURL(deck,finishAll(),parseLearningURL(link(1)));
 s=act(s,{type:'input',value:'b'});const words=structuredClone(s.words);
 let listening=act(s,{type:'module',value:'listening'});
 listening=act(listening,{type:'selectWord',index:2});
 assert.deepEqual(listening.words,words);assert.equal(listening.words.c.result,'correct');
 let speaking=act(s,{type:'module',value:'speaking'});speaking=act(speaking,{type:'speakingNext'});
 assert.equal(speaking.index,2);assert.deepEqual(speaking.words,words);
});

test('quick still skips mastered words and reopens a reviewed word from its mistakes',()=>{
 const history={a:{mastered:true,mistakes:[]},b:{mastered:false,mistakes:[1]},c:{mastered:true,mistakes:[]}};
 let s={...newStudy(deck),quick:true,index:0,history,words:{
  a:{input:'apple',result:'correct',hadMistake:false,quickIndices:null},
  b:{input:'bed',result:'reviewed',hadMistake:true,quickIndices:null},
  c:{input:'cup',result:'correct',hadMistake:false,quickIndices:null}
 }};
 s=act(s,{type:'next'});
 assert.equal(s.index,1);assert.deepEqual(s.words.b,{input:'',hadMistake:false,result:null,quickIndices:[1]});
 assert.equal(s.words.c.result,'correct');
 s=act(s,{type:'input',value:'e'});assert.equal(s.words.b.result,'correct');
 assert.deepEqual(s.history.b,{mastered:true,mistakes:[]});
 s=act(s,{type:'next'});
 assert.equal(s.index,3);assert.deepEqual(s.words.d,empty);
});

test('restart in quick mode prepares the first unmastered word from its mistakes',()=>{
 const history={a:{mastered:true,mistakes:[]},b:{mastered:false,mistakes:[1]},c:{mastered:true,mistakes:[]},d:{mastered:false,mistakes:[0,2]}};
 let s={...newStudy(deck),quick:true,index:deck.words.length,history};
 s=act(s,{type:'restart'});
 assert.equal(s.index,1);assert.equal(s.quick,true);
 assert.deepEqual(s.history,history);
 assert.deepEqual(s.words.b,{input:'',hadMistake:false,result:null,quickIndices:[1]});
});

test('quick restart on an all-mastered deck stays complete without an empty word',()=>{
 const history=Object.fromEntries(deck.words.map(word=>[word.id,{mastered:true,mistakes:[]}]));
 let s={...newStudy(deck),quick:true,index:deck.words.length,history};
 s=act(s,{type:'restart'});
 assert.equal(s.index,deck.words.length);assert.equal(s.quick,true);
 assert.deepEqual(s.history,history);assert.deepEqual(s.words,{});
});

for(const result of ['correct','reviewed','revealed'])test(`next reopens a ${result} target without mutating saved history`,()=>{
 const s=finishAll();s.index=0;s.round=7;
 s.words.b={input:'bed',hadMistake:result==='reviewed',result,quickIndices:null};
 s.history.b={mastered:result==='correct',mistakes:result==='correct'?[]:[1]};
 const before=structuredClone(s),key=studyKey(s),next=act(s,{type:'next'});
 assert.equal(next.index,1);assert.deepEqual(next.words.b,empty);
 assert.deepEqual(next.history,before.history);assert.equal(next.round,7);
 assert.deepEqual(s,before);assert.equal(reduceStudy(deck,next,{type:'next',question:key}),next);
});
