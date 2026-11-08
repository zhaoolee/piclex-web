import {editKeyboardText} from './keyboard-edit.mjs';

// Only Latin letters are typed into hard dictation. Expected spaces, digits,
// apostrophes and punctuation are decorations at their expected positions.
const editable = c => /^[a-z]$/i.test(c);

function scaffold(expected){
 const before = [];
 let pending = '';
 for(const c of expected){
  if(editable(c)){before.push(pending);pending='';}
  else pending += c;
 }
 return {before,trailing:pending,count:before.length};
}

function deletion(value,start,end,key){
 if(key==='Backspace'&&start===end&&start>0&&!editable(value[start-1])){
  let previous=start;
  while(previous>0&&!editable(value[previous-1]))previous--;
  if(previous>0)return [previous-[...value.slice(0,previous)].at(-1).length,start];
 }
 if(key==='Delete'&&start===end&&end<value.length&&!editable(value[end])){
  let next=end;
  while(next<value.length&&!editable(value[next]))next++;
  if(next<value.length)return [start,next+[...value.slice(next)][0].length];
 }
 return [start,end];
}

function caret(raw,value,positions){
 const letters=[...raw.value.slice(0,raw.cursor)].filter(editable).length;
 if(!letters)return 0;
 let cursor=positions[letters-1];
 if(raw.cursor>0&&!editable(raw.value[raw.cursor-1])){
  while(cursor<value.length&&!editable(value[cursor]))cursor++;
 }
 return cursor;
}

/**
 * Apply one hardware/virtual key to a hard-dictation draft while regenerating
 * the expected fixed separators around the typed logical letters. Wrong and
 * overflow letters remain in typed order; only Backspace/Delete and letters are
 * accepted so a space cannot enter the answer manually.
 */
export function editDictationText(expected,current,start,end,key){
 if(key!=='Backspace'&&key!=='Delete'&&!(typeof key==='string'&&key.length===1&&editable(key)))return null;
 const length=current.length;
 start=Math.max(0,Math.min(length,start??length));end=Math.max(start,Math.min(length,end??start));
 if(key==='Backspace'||key==='Delete')[start,end]=deletion(current,start,end,key);
 const edited=editKeyboardText(current,start,end,key);if(!edited)return null;
 const parts=scaffold(expected),letters=[...edited.value].filter(editable);
 const found=parts.trailing?edited.value.lastIndexOf(parts.trailing):-1;
 const suffixAfter=Math.max(parts.count,found>=0?[...edited.value.slice(0,found)].filter(editable).length:0);
 let value='',positions=[];
 for(const [index,letter] of letters.entries()){
  if(index<parts.before.length)value+=parts.before[index];
  value+=letter;positions.push(value.length);
  if(index+1===suffixAfter)value+=parts.trailing;
 }
 let cursor=caret(edited,value,positions);
 if(value.length>2000){value=value.slice(0,2000);cursor=Math.min(cursor,value.length);}
 return {value,cursor};
}
