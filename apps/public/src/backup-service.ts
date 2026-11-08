import {strToU8,strFromU8} from 'fflate';
import {backupState,collectPhotos,mergeBackup,mergePortableProgress,type BackupPhoto} from './backup-store';
import {encodeProgress,decodeProgress,mergeProgress,emptyProgress,stableID,spellingEvent,practiceWordKey} from '../../../packages/backup/src/progress.mjs';
import {readPhotos,writePhotos} from '../../../packages/backup/src/photos.mjs';
import {hashBlob,bytesOf,checkSize,MAX_MANIFEST_BYTES,MAX_PROGRESS_BYTES} from '../../../packages/backup/src/streaming.mjs';
import {experienceEvents,mergeBackupExperience} from '../../../packages/practice/src/experience-store.mjs';
export type CompleteFiles=Record<string,Blob|Uint8Array>;
export async function currentProgress(studies?:string[]){
 const state=await backupState(false);
 return mergeProgress(state.content,await experienceContent([],state.content,studies));
}
export async function mergeSyncedProgress(remote:any){
 await mergePortableProgress(remote);
 await restoreExperience((await backupState(false)).content);
 globalThis.dispatchEvent(new Event('piclex-progress-imported'));
}
function legacyStudies(){const values:string[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;if(key.startsWith('piclex-web.study.v2.'))values.push(localStorage.getItem(key)!);}return values;}
async function experienceContent(photos:BackupPhoto[],existing:any,studies=legacyStudies()){
 const rows=(await experienceEvents() as any[]).sort((a,b)=>a.at-b.at),content:any=emptyProgress(),words=new Map<string,any>(),drafts=new Map<string,any>(),histories=new Map<string,any>();
 content.readingEvents=[];content.laboratoryExperienceEvents=[];
 for(const p of photos)for(const [index,label] of p.meta.labels.entries())words.set(`${p.meta.id}:${index}`,{english:label.english,occurrenceID:label.learning?.occurrenceID});
 // Older Web versions retained terminal drafts and XP dates, but no portable records.
 // Recover those records without assigning a new practice date to old answers.
 for(const raw of studies){let state;try{state=JSON.parse(raw);}catch{continue;}if(state?.version!==2)continue;
  for(const [id,d] of Object.entries(state.words||{}) as [string,any][]){drafts.set(`spell:${state.fingerprint}:${state.round}:${id}`,d);if(!words.has(id)&&d.result&&typeof d.input==='string'&&d.input.trim()&&!d.quickIndices?.length)words.set(id,{english:d.input});}
  for(const [id,h] of Object.entries(state.history||{}))histories.set(id,h);
 }
 const progress=new Map<string,any>();
 for(const e of rows){if(e.nativeRecord)continue;const id=await stableID(e.id),at=e.at;
  if(e.kind==='spelling'){
   const wordID=e.id.match(/([0-9a-f-]{36}:\d+)$/i)?.[1],word=wordID?words.get(wordID):null,draft=drafts.get(e.id),wordKey=e.wordKey||(word?practiceWordKey(word):'web-history');
   const result=e.result||draft?.result||'correct';content.events.push(spellingEvent(id,wordKey,result,at));
   if(wordKey!=='web-history'&&!existing.progress.some((p:any)=>p.wordKey===wordKey)){const old=progress.get(wordKey),history=wordID?histories.get(wordID):null;const mistakes=Array.isArray(history?.mistakes)?history.mistakes.filter((n:any)=>Number.isInteger(n)&&n>=0&&n<(word?.english.length||wordKey.length)):[];
    progress.set(wordKey,{wordKey,attempts:(old?.attempts||0)+1,correctAnswers:(old?.correctAnswers||0)+1,streak:(old?.streak||0)+1,lastPracticedAt:at,nextReviewAt:at+86400000,misspelledIndices:[...new Set(mistakes)]});}
  }
  if(e.kind==='reading')content.readingEvents.push({id,completedAt:at,wordCount:e.wordCount||Math.max(1,(e.credit-3)*8+1),experience:e.credit});
  if(e.kind==='dictation')content.laboratoryExperienceEvents.push({id,occurredAt:at,amount:e.credit,action:'dictation.'+(e.mode||e.id.split(':').at(-1)),tier:e.wordCount||Math.max(1,(e.credit-3)*8+1)});
  if(e.kind==='laboratory'){let action=e.action,tier=e.tier;if(!action){action=e.credit<0?'spend':e.credit===1?'word':'wave';tier=action==='spend'?[12,18,26,36].indexOf(-e.credit)+1:action==='wave'?(e.credit-2)*5+1:0;}content.laboratoryExperienceEvents.push({id,occurredAt:at,amount:e.credit,action,tier});}
 }content.progress=[...progress.values()];return content;
}
export async function createComplete(job?:any){
 const [photos,state]=await Promise.all([collectPhotos(),backupState(false)]);const experience=await experienceContent(photos,state.content);const content=mergeProgress(state.content,experience),progress=await encodeProgress(content),progressBytes=strToU8(JSON.stringify(progress));checkSize(progressBytes.byteLength,MAX_PROGRESS_BYTES);const photoBytes=await writePhotos(photos,'我的照片',Date.now(),{job}),now=new Date();
 const recordCount=Object.values(content).reduce((n:number,a:any)=>n+a.length,0);
 const manifest={format:'com.zhaoolee.piclex.complete-backup',version:1,createdAt:now.toISOString(),photos:'photos.piclexdeck',learningProgress:'learning-progress.json',photoCount:photos.length,progressRecordCount:recordCount,photosSHA256:await hashBlob(photoBytes,{signal:job?.signal}),progressSHA256:progress.contentSHA256};
 return {name:'PicLex-Backup-'+now.toISOString().replace(/[-:.]/g,'').replace('Z','')+'-'+crypto.randomUUID().slice(0,8),files:{'backup.json':strToU8(JSON.stringify(manifest)),'photos.piclexdeck':photoBytes,'learning-progress.json':progressBytes},photoCount:photos.length,recordCount};
}
export async function validateComplete(files:CompleteFiles,job?:any){let manifest;try{manifest=JSON.parse(strFromU8(await bytesOf(files['backup.json'],MAX_MANIFEST_BYTES)));}catch{throw Error('备份清单损坏。');}if(manifest.format!=='com.zhaoolee.piclex.complete-backup'||manifest.version!==1||manifest.photos!=='photos.piclexdeck'||manifest.learningProgress!=='learning-progress.json')throw Error('请选择 App 或 Web 创建的完整备份。');
 const content=await decodeProgress(await bytesOf(files['learning-progress.json'],MAX_PROGRESS_BYTES)),photos=await readPhotos(files['photos.piclexdeck'],{job});const progress=await encodeProgress(content);if(photos.length!==manifest.photoCount||await hashBlob(files['photos.piclexdeck'],{signal:job?.signal})!==manifest.photosSHA256||progress.contentSHA256!==manifest.progressSHA256)throw Error('备份内容与清单不一致，未恢复任何数据。');return {photos,content};
}
async function restoreExperience(content:any){const existing=await experienceEvents() as any[],ids=new Map(await Promise.all(existing.map(async e=>[e.portableID||await stableID(e.id),e.id] as const))),incoming:any[]=[];
 const add=(r:any,kind:string,credit:number,at:number)=>incoming.push({id:ids.get(r.id)||'native:'+r.id,portableID:r.id,kind,credit,at,nativeRecord:true});
 for(const r of content.events){const at=r.levelCreditAt??(r.finalCorrect===true?r.completedAt:null);if(at!=null)add(r,'spelling',1,at);}
 for(const r of content.readingEvents||[])add(r,'reading',r.experience,r.completedAt);
 for(const r of content.laboratoryExperienceEvents||[])add(r,r.action.startsWith('dictation.')?'dictation':'laboratory',r.amount,r.occurredAt);
 await mergeBackupExperience(incoming);
}
export async function restoreComplete(checked:{photos:BackupPhoto[];content:any}){const legacy=await experienceContent(await collectPhotos(),(await backupState(false)).content);const result=await mergeBackup(checked.photos,mergeProgress(legacy,checked.content));const state=await backupState(false);await restoreExperience(state.content);return result;}
