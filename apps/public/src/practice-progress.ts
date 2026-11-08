import {ProgressWork} from './progress-work';
let worker:ProgressWork|undefined;
// Pass only learning metadata, never photograph bytes or media assets.
function metadata(deck:any){return {fingerprint:deck.fingerprint,words:deck.words.map((w:any)=>({id:w.id,english:w.english,occurrenceID:w.occurrenceID})),studySources:deck.studySources?.map((s:any)=>({id:s.id,words:s.words.map((w:any)=>({id:w.id}))}))};}
async function call(operation:string,args:any){
 const current=worker??=new ProgressWork(new AbortController().signal);
 try{return await current.call(operation,args);}catch(e){current.close();if(worker===current)worker=undefined;throw e;}
}
export async function recordPortableStudy(deck:any,state:any){
 await call('record',{deck:metadata(deck),state:{words:state.words,history:state.history,round:state.round,captureScopes:state.captureScopes}});
 window.dispatchEvent(new Event('piclex-progress-changed'));
}
export function portableHistory(deck:any){return call('history',{deck:metadata(deck)});}
