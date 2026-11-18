import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSnapshot,parsePublicCatalog,parsePublicDeck} from '../packages/deck-format/src/public.mjs';
const snapshot=JSON.parse(await readFile(new URL('../content/snapshot.json',import.meta.url)));
test('reviewed public snapshot excludes paid entitlements and rejects duplicates or foreign origins',()=>{
 const reviewedIDs=['add03b54-d0a7-46fd-88c8-2aa0fa7f0c7f','121d190a-5d4c-4a09-8d50-4741acdbbb1b','56a51624-d8aa-4167-99c5-e1c727a938db','ba777e29-70c7-4706-8ea3-dd65f592ac16','c13f43cf-3e7d-461a-a7b8-5acb134210d8','099b791c-b48b-4439-b3e1-000ac98ebb0c','0a1ff2e2-3db0-4bb1-889a-b27b62798cbe','b33417a7-0f7e-4081-be35-2fe44d9d30c4'];
 assert.deepEqual(validateSnapshot(structuredClone(snapshot)).decks.map(d=>d.deckID).sort(),reviewedIDs.sort());
 for(const mutate of [s=>s.decks[0].access='storekit',s=>s.decks[0].productID='paid',s=>s.decks.push(s.decks[0]),s=>s.decks[0].packageURL='https://other.example/deck.piclexdeck',s=>s.decks[0].packageBytes=129*1024*1024]){
  const value=structuredClone(snapshot);mutate(value);assert.throws(()=>validateSnapshot(value));
 }
});
test('a reviewed mirror is bound to its deck ID, version, hash and asset name',()=>{
 const source=structuredClone(snapshot.decks.find(d=>d.packageURL.includes('/piclex-web/library/')));
 assert.ok(source);assert.equal(validateSnapshot({decks:[source]}).decks.length,1);
 for(const change of [d=>d.version++,d=>d.packageSHA256='a'.repeat(64),d=>d.deckID=snapshot.decks[0].deckID,
   d=>d.packageURL=d.packageURL.replace('deck.piclexdeck','private.json'),
   d=>d.packageURL=d.packageURL.replace('https://piclex.v2fy.com','https://other.example'),
   d=>d.packageURL+='?token=private',d=>d.coverURL=d.coverURL.replace('cover.jpg','cover-portrait.jpg'),
   d=>d.covers.portrait.url=d.covers.landscape.url]){
  const value=structuredClone(source);change(value);assert.throws(()=>validateSnapshot({decks:[value]}));
 }
});
test('catalog cannot replace local asset paths with external or traversal URLs',()=>{
 const entry={id:snapshot.decks[0].deckID,title:'Example',description:'',count:1,photoCount:1,cover:'library/a/cover.jpg',package:'library/a/deck.piclexdeck',payload:'library/a/deck.json',payloadSHA256:'a'.repeat(64),fingerprint:'b'.repeat(64),preview:{english:'word',chinese:'词'}};
 assert.equal(parsePublicCatalog([entry]).length,1);
 for(const path of ['https://other.example/a','library/../secret','library/.env','//other.example/a']) assert.throws(()=>parsePublicCatalog([{...entry,payload:path}]));
 assert.throws(()=>parsePublicCatalog([entry,entry]));
});
test('a modified public payload is rejected before the practice state is created',async()=>{
 const bytes=new TextEncoder().encode('{}');
 await assert.rejects(parsePublicDeck(bytes,{payloadSHA256:'a'.repeat(64)}));
});
