import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergePublished} from '../scripts/latest-public-snapshot.mjs';

const snapshot=JSON.parse(await readFile(new URL('../content/snapshot.json',import.meta.url)));
const feeds=()=>new Map([...new Set(snapshot.decks.map(deck=>deck.sourceURL))].map(url=>[
  url,{format:'com.piclex.deck-source',schemaVersion:1,decks:snapshot.decks.filter(deck=>deck.sourceURL===url).map(deck=>({...deck}))},
]));

test('every reviewed public card advances from its own source and carries prior progress',()=>{
  const sources=feeds(),old=snapshot.decks[4],updated={...old,version:old.version+1,packageSHA256:'a'.repeat(64)};
  sources.get(old.sourceURL).decks[0]=updated;
  sources.get(snapshot.decks[0].sourceURL).decks.push({...snapshot.decks[0],deckID:'f'.repeat(8)+'-ffff-ffff-ffff-ffffffffffff',access:'storekit'});
  const catalog=[[{id:old.deckID,learningFingerprint:'b'.repeat(64),progressAliases:['c'.repeat(64)]}]];
  const result=mergePublished(snapshot,sources,catalog);
  assert.equal(result.changed.length,1);
  assert.equal(result.snapshot.decks.length,snapshot.decks.length);
  assert.equal(result.snapshot.decks[4].version,updated.version);
  assert.deepEqual(result.snapshot.decks[4].progressAliases,[old.learningSHA256,...old.progressAliases,'b'.repeat(64),'c'.repeat(64)]);
  assert.equal(result.snapshot.decks[4].learningSHA256,undefined);
  assert.equal(snapshot.decks[4].version,old.version);
});

test('source rollback and mutable versions stop publication',()=>{
  const old=snapshot.decks[4];
  for(const change of [deck=>{deck.version--;},deck=>{deck.packageSHA256='a'.repeat(64);},deck=>{deck.access='storekit';}]){
    const sources=feeds();change(sources.get(old.sourceURL).decks[0]);
    assert.throws(()=>mergePublished(snapshot,sources));
  }
});

test('new public cards join trusted sources but paid cards remain excluded',()=>{
  const sources=feeds(),source=sources.get(snapshot.decks[0].sourceURL);
  source.decks.push({...source.decks[0],deckID:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',title:'New public card'});
  source.decks.push({...source.decks[0],deckID:'ffffffff-ffff-ffff-ffff-ffffffffffff',access:'storekit'});
  const result=mergePublished(snapshot,sources);
  assert.equal(result.snapshot.decks.length,snapshot.decks.length+1);
  assert.equal(result.snapshot.decks.at(-1).title,'New public card');
  assert.equal(result.snapshot.decks.at(-1).sourceURL,snapshot.decks[0].sourceURL);
});

test('updated and new official decks resolve root-relative assets before validating',()=>{
  const original=snapshot.decks[0],sourceURL=original.sourceURL,origin=new URL(sourceURL).origin;
  assert.equal(origin,'https://piclex.v2fy.com');
  const sources=feeds(),source=sources.get(sourceURL);
  const root='/decks/'+original.deckID+'/v'+(original.version+1)+'-'+original.packageSHA256.slice(0,16)+'/';
  const relative={...original,version:original.version+1,packageURL:root+'deck.piclexdeck',coverURL:root+'cover.jpg',
    covers:Object.fromEntries(Object.entries(original.covers).map(([role,cover])=>[
      role,{...cover,url:root+'cover-'+role+'.jpg'}]))};
  source.decks[0]=relative;
  const fresh={...relative,deckID:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'};
  source.decks.push(fresh);
  const result=mergePublished(snapshot,sources);
  assert.equal(result.snapshot.decks[0].packageURL,origin+relative.packageURL);
  assert.equal(result.snapshot.decks[0].coverURL,origin+relative.coverURL);
  assert.equal(result.snapshot.decks[0].covers.portrait.url,origin+relative.covers.portrait.url);
  assert.equal(result.snapshot.decks.at(-1).packageURL,origin+fresh.packageURL);
  assert.equal(source.decks[0].packageURL,relative.packageURL);
  for(const packageURL of ['//outside.invalid/decks/asset.piclexdeck','/decks/../private/asset.piclexdeck',
    'https://outside.invalid/decks/asset.piclexdeck','/other/asset.piclexdeck']){
    source.decks[0]={...relative,packageURL};
    assert.throws(()=>mergePublished(snapshot,sources),/公开卡组内容校验失败/);
  }
});
