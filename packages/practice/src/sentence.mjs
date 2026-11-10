// Port of SentenceDictation.swift: token grading, phrase costs, drafts and terminal outcomes.
// Browsers use the native deterministic grammar fallback (NLTagger is Apple-only).
export const rates = [.75, .85, 1, 1.15];
export function tokens(text) {
  const contractions = {wanna:'want to',gonna:'going to',gotta:'got to',"can't":'can not',cannot:'can not',"won't":'will not',"shan\'t":'shall not',"i'm":'i am',"let's":'let us',"it's":'it is',"that's":'that is',"there's":'there is',"what's":'what is',"here's":'here is'};
  return (text.toLowerCase().replace(/[‘’]/g,"'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu)||[]).flatMap(word=>{
    if(Object.hasOwn(contractions,word)) return contractions[word].split(' ');
    for(const [suffix,value] of [["n't",'not'],["'re",'are'],["'ve",'have'],["'ll",'will']]) if(word.endsWith(suffix)) return [word.slice(0,-suffix.length),value];
    return [word];
  });
}
export function checkSentence(expected, answer) {
  const target=tokens(expected),actual=tokens(answer),heard=actual.slice(0,512);
  const costs=Array.from({length:target.length+1},(_,i)=>Array.from({length:heard.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=target.length;i++) for(let j=1;j<=heard.length;j++) costs[i][j]=Math.min(costs[i-1][j]+1,costs[i][j-1]+1,costs[i-1][j-1]+(target[i-1]===heard[j-1]?0:1));
  const edits=[];let i=target.length,j=heard.length;
  while(i||j){
    if(i&&j&&costs[i][j]===costs[i-1][j-1]+(target[i-1]===heard[j-1]?0:1)){edits.push({kind:target[i-1]===heard[j-1]?'match':'substitution',expected:target[--i],actual:heard[--j]});}
    else if(i&&costs[i][j]===costs[i-1][j]+1) edits.push({kind:'omission',expected:target[--i],actual:null});
    else edits.push({kind:'addition',expected:null,actual:heard[--j]});
  }
  return {isCorrect:!!target.length&&target.join('\0')===actual.join('\0'),accuracy:target.length?Math.max(0,1-costs[target.length][heard.length]/Math.max(target.length,actual.length)):0,edits:edits.reverse()};
}
const sets=Object.fromEntries(Object.entries({
 determiner:'the a an this that these those my your his her its our their some any each every no another both either neither all most such many much few several enough own same',
 pronoun:'i you he she it we they me him us them there here who whom someone anyone everyone nobody something anything everything nothing myself yourself himself herself itself ourselves themselves',
 preposition:'in on at under over beside behind near with without through across into from toward towards next of for by about above below between around along against during after before since until among onto upon throughout within via per despite except inside outside off down up out like plus including beyond beneath',
 conjunction:'and but or nor so yet while whereas because although though if when unless whether once that which whose than as',
 auxiliary:'am is are was were be been being has have had do does did can could will would shall should may might must ought',
 negation:'not never no',number:'one two three four five six seven eight nine ten eleven twelve twenty thirty hundred thousand first second third last next',
 verb:'use take capture show stand sit walk run hold wear photograph look enjoy play eat drink read write drive ride watch make carry work rest wait hang shine light reflect stretch grow bloom float fly swim pose smile lean cover feature surround frame create swing hit jump climb throw catch kick push pull open close paint draw sing dance cook bake sleep wake wash clean cut mix pour serve relax travel arrive leave return build buy sell give bring put place pick meet visit explore help start begin finish keep learn teach tell say speak ask answer call find see hear feel know think need want'
}).map(([key,value])=>[key,new Set(value.split(' '))]));
const pairs=new Set(['next to','according to','due to','close to','prior to','thanks to','instead of','because of','out of','in front','on top','as well','rather than','such as','apart from','along with','front of']);
const verb=w=>sets.verb.has(w)||['s','es','ed','ing'].some(s=>w.endsWith(s)&&(sets.verb.has(w.slice(0,-s.length))||sets.verb.has(w.slice(0,-s.length)+'e')));
export function chunks(sentence) {
  const words=sentence.trim().split(/\s+/).filter(Boolean);if(words.length<=6)return words.map((text,id)=>({id,text}));
  const clean=words.map(w=>tokens(w)[0]||'');
  const kinds=[];
  clean.forEach((w,i)=>{
    let kind='noun';
    if(w==='to') kind=verb(clean[i+1]||'')||sets.auxiliary.has(clean[i+1])?'infinitive':'preposition';
    else {const match=['conjunction','determiner','pronoun','preposition','auxiliary','negation','number'].find(k=>sets[k].has(w));
      if(match)kind=match;else if(/^\d+$/.test(w))kind='number';else if(w.endsWith('ing')&&['determiner','adjective','number','preposition'].includes(kinds.at(-1)))kind='noun';else if(verb(w))kind='verb';else if(w.endsWith('ly')&&w.length>4)kind='adverb';}
    kinds.push(kind);
  });
  const segment=(start,end)=>{
    const length=end-start,k=kinds[start],last=kinds[end-1];let cost=[0,.15,0,.3][length]??1.2+(length-4)*1.5;
    if(length===1)cost+=['determiner','preposition','conjunction','auxiliary','infinitive','negation'].includes(k)?3.5:['noun','adjective','number'].includes(k)?.6:k==='adverb'?.9:k==='other'?1.2:0;
    cost+=({determiner:6,preposition:3.5,conjunction:3,infinitive:6,negation:1.2,adjective:.8,adverb:.5,number:.5}[last]||0);
    if(last==='auxiliary')cost+=length>=2&&['pronoun','noun','determiner'].includes(kinds[end-2])?.8:2.5;
    return cost;
  };
  const boundary=i=>{
    const prev=kinds[i-1],next=kinds[i];if(pairs.has(clean[i-1]+' '+clean[i]))return 6;
    if(i>=2&&pairs.has(clean[i-2]+' '+clean[i-1]))return ['determiner','pronoun'].includes(next)?-.2:0;
    if(/^[A-Z]/.test(words[i-1])&&/^[A-Z]/.test(words[i]))return 4;
    let cost=({determiner:5.5,preposition:4.5,auxiliary:3,infinitive:6,number:1.5,adverb:.4,negation:1}[prev]||0);
    if(prev==='adjective')cost+=next==='noun'?1.6:.7;if(prev==='noun'&&next==='noun')cost+=.7;
    cost+=({adverb:.4,pronoun:-.7,verb:-.5,determiner:-.1,infinitive:-1,conjunction:-.5,number:-.2}[next]||0);
    if(prev==='pronoun'&&next==='verb')cost-=1.3;if(prev==='verb'&&next==='determiner')cost-=.9;if(prev==='verb'&&next==='infinitive')cost-=.6;if(prev==='noun'&&next==='infinitive')cost-=.4;return cost;
  };
  const n=words.length,desired=n<=12?Math.min(6,Math.max(4,Math.round(n/2))):Math.max(6,Math.round(n/2.5));
  const lo=n<=12?Math.min(n,4):Math.min(n,Math.max(Math.ceil(n/4),desired-1)),hi=n<=12?Math.min(n,6):Math.min(n,Math.max(lo,desired+1));
  const costs=Array.from({length:n+1},()=>Array(hi+1).fill(Infinity)),origins=Array.from({length:n+1},()=>Array(hi+1));costs[0][0]=0;
  for(let start=0;start<n;start++)for(let used=0;used<hi;used++)if(Number.isFinite(costs[start][used]))for(let len=1;len<=4&&start+len<=n;len++){
    const end=start+len,cost=costs[start][used]+segment(start,end)+(start?boundary(start):0);
    if(cost<costs[end][used+1]){costs[end][used+1]=cost;origins[end][used+1]=[start,used];}
  }
  let best=lo;for(let used=lo;used<=hi;used++)if(costs[n][used]+Math.abs(used-desired)*.55<costs[n][best]+Math.abs(best-desired)*.55)best=used;
  const out=[];let end=n,used=best;while(end){const [start,prev]=origins[end][used];out.unshift(words.slice(start,end).join(' '));end=start;used=prev;}
  return out.map((text,id)=>({id,text}));
}
function turns(text){
  text=text.replace(/\\n/g,'\n');const matches=[...text.matchAll(/(?:^|[\r\n]|(?<=\s))(A|B|Speaker A|Speaker B|Person A|Person B|甲|乙)\s*[:：]\s*/g)];
  if(matches.length<2||text.slice(0,matches[0].index).trim()||new Set(matches.map(m=>m[1]==='甲'||m[1].endsWith('A')?'A':'B')).size!==2)return null;
  return matches.map((m,i)=>text.slice(m.index+m[0].length,matches[i+1]?.index).trim().replace(/^["“‘]([\s\S]*)["”’]$/,'$1'));
}
function segments(text,lang){return [...new Intl.Segmenter(lang,{granularity:'sentence'}).segment(text.replace(/\\n/g,'\n'))].map(s=>s.segment.trim()).filter(Boolean);}
export function sentenceParts(sentence,translation='',occurrenceID=''){
  if(occurrenceID&&!turns(sentence))return [{sentence:sentence.trim(),translation:translation.trim()}];
  const et=turns(sentence),ct=turns(translation),en=(et||[sentence]).map(t=>segments(t,'en'));
  if(et&&ct&&ct.length===en.length)return en.flatMap((lines,i)=>{const zh=segments(ct[i],'zh');return lines.map((sentence,j)=>({sentence,translation:zh.length===lines.length?zh[j]:''}));});
  const flat=en.flat(),zh=(ct||[translation]).flatMap(t=>segments(t,'zh'));return flat.map((sentence,i)=>({sentence,translation:zh.length===flat.length?zh[i]:''}));
}
const promptCache=new WeakMap();
export function promptsFor(deck){
  if(promptCache.has(deck))return promptCache.get(deck);
  const seen=new Set(),prompts=[];
  deck.words.forEach((word,wordIndex)=>{
    if(!tokens(word.example||'').length)return;
    const identity=word.occurrenceID?`occurrence:${word.occurrenceID}`:`${deck.studySources?word.id.split(':')[0]:word.imageIndex}:${tokens(word.example).join(' ')}`;
    if(seen.has(identity))return;seen.add(identity);
    for(const [part,value] of sentenceParts(word.example,word.exampleChinese,word.occurrenceID).entries())prompts.push({...value,key:`${identity}:${part}`,wordIndex,imageIndex:word.imageIndex});
  });promptCache.set(deck,prompts);return prompts;
}
export function promptIndex(prompts,deck,wordIndex){
  const word=deck.words[wordIndex];if(!word)return -1;
  const direct=prompts.findIndex(p=>p.wordIndex===wordIndex);if(direct>=0)return direct;
  const same=prompts.findIndex(p=>p.imageIndex===word.imageIndex&&tokens(deck.words[p.wordIndex].example).join(' ')===tokens(word.example||'').join(' '));
  return same>=0?same:prompts.findIndex(p=>p.wordIndex>=wordIndex);
}
export function newSentence(prompt,random=Math.random){
  const list=chunks(prompt.sentence),bank=list.map(x=>x.id);
  for(let i=bank.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bank[i],bank[j]]=[bank[j],bank[i]];}
  if(bank.length>1&&bank.every((id,i)=>id===i))bank.push(bank.shift());
  return {key:prompt.key,chunks:list,bank,selected:[],freeText:'',guided:null,checks:{},outcomes:{},revealed:[],statistics:{chunks:{submissions:0,correct:0,assisted:0,plays:0},free:{submissions:0,correct:0,assisted:0,plays:0}},pending:null};
}
export const writtenWords=sentence=>sentence.match(/[\p{L}\p{N}]+(?:['’‘][\p{L}\p{N}]+)*/gu)||[];
export const isGuidedWordEditable=word=>/[a-z]/i.test(word??'')&&!/\p{N}/u.test(word);
const alphanumericLength=value=>(String(value??'').match(/[\p{L}\p{N}]/gu)||[]).length;
// Hard input scaffolds fixed separators, so only its typed letters/numbers count.
const hardFilled=(sentence,value)=>alphanumericLength(value)>=alphanumericLength(sentence);
// Each guided slot is complete once its own letters/numbers reach the target word length.
const guidedFilled=(sentence,values)=>{const expected=writtenWords(sentence).map(alphanumericLength);return values.length>=expected.length&&expected.every((length,index)=>alphanumericLength(values[index])>=length);};
export function reduceSentence(prompt,session,mode,action){
  if(!['chunks','free'].includes(mode)||action.key!==prompt.key)return session;
  if(action.type==='pause')return {...session,pending:null};
  if(['select','remove','move'].includes(action.type)&&mode!=='chunks'||['input','guided','retry'].includes(action.type)&&mode!=='free')return session;
  const next=structuredClone(session),stats=next.statistics[mode];
  if(action.type==='play'){if(next.outcomes[mode])next.pending=null;stats.plays++;stats.lowestRate=Math.min(stats.lowestRate??action.rate,action.rate);return next;}
  if(next.outcomes[mode])return session;
  let evaluate=false;
  if(action.type==='select'&&next.chunks.some(c=>c.id===action.id)&&!next.selected.includes(action.id)){next.selected.push(action.id);delete next.checks.chunks;evaluate=next.selected.length===next.chunks.length;}
  else if(action.type==='remove'){next.selected=next.selected.filter(id=>id!==action.id);delete next.checks.chunks;}
  else if(action.type==='move') {const i=next.selected.indexOf(action.id),j=i+action.offset;if(i<0||j<0||j>=next.selected.length)return session;[next.selected[i],next.selected[j]]=[next.selected[j],next.selected[i]];delete next.checks.chunks;evaluate=next.selected.length===next.chunks.length;}
  else if(action.type==='input') {next.freeText=String(action.value).slice(0,2000).replace(/[\r\n]+/g,' ');next.guided=null;delete next.checks.free;evaluate=checkSentence(prompt.sentence,next.freeText).isCorrect||hardFilled(prompt.sentence,next.freeText);}
  else if(action.type==='guided'){
    const words=writtenWords(prompt.sentence);
    next.guided=words.map((word,i)=>isGuidedWordEditable(word)?String(action.values[i]??'').slice(0,100):word);
    next.freeText=next.guided.join(' ').trimEnd().slice(0,2000);delete next.checks.free;
    evaluate=guidedCorrect(prompt.sentence,next.guided)||guidedFilled(prompt.sentence,next.guided);
  }
  else if(action.type==='submit')evaluate=mode==='free'?!!tokens(next.freeText).length:next.selected.length===next.chunks.length&&!next.checks.chunks;
  else if(action.type==='reveal') {if(!next.revealed.includes(mode))next.revealed.push(mode);next.pending=null;}
  else if(action.type==='retry'){next.freeText='';next.guided=null;delete next.checks.free;next.revealed=next.revealed.filter(v=>v!=='free');next.pending=null;}
  else if(action.type==='giveUp'){if(mode==='chunks')next.selected=next.chunks.map(c=>c.id);else next.freeText=prompt.sentence;delete next.checks[mode];next.outcomes[mode]='assisted';next.revealed=[...new Set([...next.revealed,mode])];stats.submissions++;stats.assisted++;next.pending=null;}
  if(evaluate){const answer=mode==='chunks'?next.selected.map(id=>next.chunks[id].text).join(' '):next.guided&&guidedCorrect(prompt.sentence,next.guided)?prompt.sentence:next.freeText;
    const check=checkSentence(prompt.sentence,answer);next.checks[mode]=check;stats.submissions++;stats.accuracy=check.accuracy;
    if(check.isCorrect){next.outcomes[mode]='correct';stats.correct++;next.pending=mode;}
  }return next;
}
export function guidedCorrect(sentence,values){const expected=writtenWords(sentence).map(w=>w.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''));return values.length===expected.length&&values.every((v,i)=>! /\s/.test(v)&&v.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')===expected[i]);}
