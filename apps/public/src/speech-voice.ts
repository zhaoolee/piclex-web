import {readPreference} from './storage';
import {chooseSpeechVoice,isEnglishVoice} from './speech-voice-choice.mjs';
export const voiceKey='practice.speechVoiceIdentifier';
export function englishVoices(){return (window.speechSynthesis?.getVoices()||[]).filter(isEnglishVoice).sort((a,b)=>Number(/^en[-_]US$/i.test(b.lang))-Number(/^en[-_]US$/i.test(a.lang))||a.name.localeCompare(b.name));}
export function selectedSpeechVoice(preferLocal=false){
 const voices=englishVoices(),saved=readPreference(voiceKey);
 if(preferLocal&&!voices.some(voice=>voice.voiceURI===saved)){
  const local=chooseSpeechVoice(voices.filter(voice=>voice.localService),null);
  if(local)return local;
 }
 return chooseSpeechVoice(voices,saved);
}
