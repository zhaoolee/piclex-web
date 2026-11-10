import {readPreference} from './storage';
import {chooseSpeechVoice,isEnglishVoice} from './speech-voice-choice.mjs';
export const voiceKey='practice.speechVoiceIdentifier';
export function englishVoices(){return (window.speechSynthesis?.getVoices()||[]).filter(isEnglishVoice).sort((a,b)=>Number(/^en[-_]US$/i.test(b.lang))-Number(/^en[-_]US$/i.test(a.lang))||a.name.localeCompare(b.name));}
export function selectedSpeechVoice(){
 return chooseSpeechVoice(englishVoices(),readPreference(voiceKey));
}
