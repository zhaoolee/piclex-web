import {execFileSync} from 'node:child_process';
import {validateSnapshot} from '../packages/deck-format/src/public.mjs';

const hash=/^[0-9a-f]{64}$/;
const officialSource='https://piclex.v2fy.com/decks/source.json';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

export function purchaseListings(feed){
  if(feed?.format!=='com.piclex.deck-source'||feed.schemaVersion!==1||feed.purchasesAvailable!==true||!Array.isArray(feed.decks))return [];
  return feed.decks.flatMap(deck=>{
    if(deck?.access!=='storekit'||typeof deck.productID!=='string'||!deck.productID||
      !uuid.test(deck.deckID)||typeof deck.title!=='string'||!deck.title.trim()||deck.title.length>80||
      !Number.isSafeInteger(deck.version)||deck.version<1||!hash.test(deck.packageSHA256))return [];
    const directory=`/decks/${deck.deckID}/v${deck.version}-${deck.packageSHA256.slice(0,16)}/`;
    const portrait=directory+'cover-portrait.jpg',fallback=directory+'cover.jpg';
    const officialOrigin=new URL(officialSource).origin;
    const declared=deck.covers?.portrait?.url;
    const path=declared===portrait||declared===officialOrigin+portrait?portrait:
      deck.coverURL===fallback||deck.coverURL===officialOrigin+fallback?fallback:null;
    return path?[{id:deck.deckID,title:deck.title,cover:officialOrigin+path}]:[];
  });
}
const catalogs=[
  'https://piclex.v2fy.com/piclex-web/library/catalog.json',
  'https://zhaoolee.com/piclex-web/library/catalog.json',
];

function publicJSON(url){
  const bytes=execFileSync('curl',['--fail','--silent','--show-error','--connect-timeout','20','--max-time','45','--max-filesize','2097152',url],{maxBuffer:2*1024*1024});
  return JSON.parse(bytes.toString('utf8'));
}

export function mergePublished(snapshot,feeds,previousCatalogs=[]){
  const changed=[];
  const existing=new Set(snapshot.decks.map(deck=>deck.deckID));
  const decks=snapshot.decks.map(current=>{
    const feed=feeds.get(current.sourceURL);
    if(feed?.format!=='com.piclex.deck-source'||feed.schemaVersion!==1||!Array.isArray(feed.decks))throw Error(`Invalid public source: ${current.sourceURL}`);
    const matches=feed.decks.filter(item=>item?.deckID===current.deckID);
    if(matches.length!==1)throw Error(`Missing or duplicate published deck: ${current.deckID}`);
    const latest=matches[0];
    if(latest.access!=='public'||!Number.isSafeInteger(latest.version)||latest.version<current.version)throw Error(`Public deck reverted: ${current.title}`);
    if(latest.version===current.version){
      if(latest.packageSHA256!==current.packageSHA256)throw Error(`Published deck changed without version: ${current.title}`);
      return current;
    }
    const aliases=new Set([current.learningSHA256,...(current.progressAliases||[])]);
    for(const catalog of previousCatalogs){
      if(!Array.isArray(catalog))throw Error('Invalid previous Web catalog');
      const previous=catalog.find(card=>card?.id===current.deckID);
      if(previous){aliases.add(previous.learningFingerprint);for(const alias of previous.progressAliases||[])aliases.add(alias);}
    }
    const progressAliases=[...aliases].filter(value=>hash.test(value));
    if(progressAliases.length>100)throw Error(`Too many progress aliases: ${current.title}`);
    const merged={...latest,sourceURL:current.sourceURL,progressAliases};
    // The package parser calculates the new learning fingerprint after checking its bytes.
    delete merged.learningSHA256;
    changed.push(`${current.title}: v${current.version} → v${latest.version}`);
    return merged;
  });
  for(const url of snapshot.sources){
    const feed=feeds.get(url);
    if(feed?.format!=='com.piclex.deck-source'||feed.schemaVersion!==1||!Array.isArray(feed.decks))throw Error(`Invalid public source: ${url}`);
    for(const published of feed.decks){
      if(published?.access!=='public'||existing.has(published.deckID))continue;
      if(decks.some(deck=>deck.deckID===published.deckID))throw Error(`Duplicate new public deck: ${published.deckID}`);
      decks.push({...published,sourceURL:url});
      changed.push(`${published.title}: new public deck v${published.version}`);
    }
  }
  return {snapshot:validateSnapshot({...snapshot,decks}),changed};
}

export function latestPublicSnapshot(snapshot){
  const feeds=new Map([...new Set(snapshot.decks.map(deck=>deck.sourceURL))].map(url=>[url,publicJSON(url)]));
  const purchases=purchaseListings(feeds.get(officialSource));
  const first=mergePublished(snapshot,feeds);
  if(!first.changed.length)return {...first,purchases};
  // A prior public catalog contains fingerprints from builds since the reviewed
  // snapshot. Keep them so updating a card does not reset Web study progress.
  const previous=catalogs.map(publicJSON);
  return {...mergePublished(snapshot,feeds,previous),purchases};
}
