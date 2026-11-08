import test from 'node:test';
import assert from 'node:assert/strict';
import {editDictationText} from '../packages/learning-ui/src/dictation-edit.mjs';

function type(expected,letters,current='',cursor=0){
 for(const key of letters){const edit=editDictationText(expected,current,cursor,cursor,key);assert.ok(edit,`${expected}: ${key}`);current=edit.value;cursor=edit.cursor;}
 return {value:current,cursor};
}

test('continuous letters insert expected spaces, punctuation, apostrophes and fixed numbers',()=>{
 let typed=type('I am still in bed.','Iamstillinbed');
 assert.equal(typed.value,'I am still in bed.');assert.equal(typed.cursor,'I am still in bed'.length);
 typed=type("I'm here.",'Imhere');
 assert.equal(typed.value,"I'm here.");assert.equal(typed.cursor,"I'm here".length);
 typed=type('Room 3 is here.','Roomishere');
 assert.equal(typed.value,'Room 3 is here.');
 assert.equal(editDictationText('I am here.','I',1,1,' '),null);
});

test('wrong and overflow letters stay in typed order instead of being corrected or discarded',()=>{
 assert.equal(type('I am here.','Ixmhere').value,'I xm here.');
 let typed=type('I am here.','Iamhere'),value=typed.value,cursor=value.length;
 for(const key of 'xyz'){const edit=editDictationText('I am here.',value,cursor,cursor,key);value=edit.value;cursor=edit.cursor;}
 assert.equal(value,'I am here.xyz');
 assert.equal(cursor,value.length);
 assert.notEqual(value,'I am here.');
});

test('middle insert, selection replacement, Backspace and Delete keep logical letter carets',()=>{
 assert.deepEqual(editDictationText('I am here.','I am here.',1,1,'x'),{value:'I xa mhere.',cursor:3});
 assert.deepEqual(editDictationText('I am here.','I am here.',2,8,'x'),{value:'I xe',cursor:3});
 assert.deepEqual(editDictationText('I am here.','I am here.',1,3,'Backspace'),{value:'I mh ere',cursor:1});
 assert.deepEqual(editDictationText('I am here.','I am here.',1,1,'Delete'),{value:'I mh ere',cursor:1});
});

test('automatic separator boundaries delete a letter rather than becoming a no-op, and preserve insertion before trailing punctuation',()=>{
 assert.deepEqual(editDictationText('I am.','I am.',5,5,'Backspace'),{value:'I a',cursor:3});
 assert.deepEqual(editDictationText('I am.','I am.',4,4,'x'),{value:'I amx.',cursor:5});
 assert.deepEqual(editDictationText('I am.','I am.',5,5,'x'),{value:'I am.x',cursor:6});
 const end=editDictationText('I am still in bed.','I am still in bed.',18,18,'Backspace');
 assert.equal(end.value,'I am still in be');assert.equal(end.cursor,end.value.length);
});
