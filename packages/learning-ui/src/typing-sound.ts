// Raw App samples, at their original rate and gain. No synthesized system click.
export const typingSounds = [{"id": "classic", "label": "经典", "file": "key-click.wav"}, {"id": "alpaca", "label": "Alpaca", "file": "alpaca.mp3"}, {"id": "buckling-spring", "label": "Buckling Spring", "file": "buckling-spring.mp3"}, {"id": "cherry-mx-black", "label": "Cherry MX Black", "file": "cherry-mx-black.mp3"}, {"id": "cherry-mx-blue", "label": "Cherry MX Blue", "file": "cherry-mx-blue.mp3"}, {"id": "cherry-mx-brown", "label": "Cherry MX Brown", "file": "cherry-mx-brown.mp3"}, {"id": "gateron-black-ink", "label": "Gateron Black Ink", "file": "gateron-black-ink.mp3"}, {"id": "gateron-red-ink", "label": "Gateron Red Ink", "file": "gateron-red-ink.mp3"}, {"id": "holy-panda", "label": "Holy Panda", "file": "holy-panda.mp3"}, {"id": "kailh-box-navy", "label": "Kailh Box Navy", "file": "kailh-box-navy.mp3"}, {"id": "novelkeys-cream", "label": "NovelKeys Cream", "file": "novelkeys-cream.mp3"}, {"id": "skcm-blue-alps", "label": "SKCM Blue Alps", "file": "skcm-blue-alps.mp3"}, {"id": "topre", "label": "Topre", "file": "topre.mp3"}, {"id": "turquoise-tealios", "label": "Turquoise Tealios", "file": "turquoise-tealios.mp3"}];
export const defaultTypingSound='cherry-mx-blue';
let voices:HTMLAudioElement[]=[];
let nextVoice=0,selected='',generation=0;
const pending=new Set<HTMLAudioElement>();
export function currentTypingSound(){let id=defaultTypingSound;try{id=localStorage.getItem('piclex-web.typing-sound-id')||id;}catch{}return typingSounds.some(s=>s.id===id)?id:defaultTypingSound;}
export function prepareTypingSound(id=currentTypingSound()){
 const option=typingSounds.find(s=>s.id===id)||typingSounds.find(s=>s.id===defaultTypingSound)!;
 if(voices.length&&selected===option.id)return;
 stopTypingSound();selected=option.id;nextVoice=0;
 // Match PracticeTypingSoundPlayer's eight prepared voices. Prefer a finished
 // voice, keeping the tail of each recording intact during rapid typing.
 voices=Array.from({length:8},()=>{const voice=new Audio(`${import.meta.env.BASE_URL}audio/${option.file}`);voice.preload='auto';voice.volume=1;voice.playbackRate=1;voice.load();return voice;});
}
export async function playTypingSound(id=currentTypingSound()):Promise<boolean>{
 if(document.hidden)return false;
 prepareTypingSound(id);const ticket=generation;
 const candidates=voices.map((_,i)=>(nextVoice+i)%voices.length);
 const index=candidates.find(i=>!pending.has(voices[i])&&(voices[i].paused||voices[i].ended))??nextVoice;
 const voice=voices[index];nextVoice=(index+1)%voices.length;
 voice.currentTime=0;pending.add(voice);
 try{await voice.play();if(ticket!==generation){voice.pause();voice.currentTime=0;return false;}return true;}catch{return false;}finally{pending.delete(voice);}
}
export function stopTypingSound(){generation++;for(const voice of voices){voice.pause();voice.currentTime=0;}pending.clear();}
if(typeof document!=='undefined'){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTypingSound();});
 window.addEventListener('pagehide',stopTypingSound);
}
