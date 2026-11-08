export const limits=Object.freeze({mainTaskMs:33,frameGapMs:50,eventMs:100,minDurationMs:8000,minFrames:120,rounds:3,historyRows:5000});
export const scenarios=['spelling','dictation','modules','sync'];
export function assessSample(sample){
 const failures=[],{raw,actions,trace}=sample;
 const need=(condition,message)=>{if(!condition)failures.push(message);};
 need(sample.error==null,'sample execution failed');
 need(raw&&actions&&trace,'missing raw evidence');if(!raw||!actions||!trace)return failures;
 const finite=a=>Array.isArray(a)&&a.every(n=>Number.isFinite(n)&&n>=0);
 need(finite(raw.frames)&&finite(trace.tasks)&&finite(raw.events),'invalid numeric samples');
 if(!finite(raw.frames)||!finite(trace.tasks)||!finite(raw.events))return failures;
 need(raw.end-raw.start>=limits.minDurationMs,'insufficient duration');
 need(raw.frames.length>=limits.minFrames&&trace.paints>0&&trace.taskCount>0,'missing actual page frames/tasks/paints');
 need(raw.visibility.every(v=>v==='visible')&&!raw.reducedMotion,'hidden page or reduced effects');
 need(trace.tasks.every(n=>n<limits.mainTaskMs),'main-thread task reached 33ms');
 need(raw.frames.every(n=>n<limits.frameGapMs),'animation frame gap reached 50ms');
 need(raw.longTasks.length===0&&raw.longFrames.length===0,'long task or long animation frame');
 need(raw.events.every(n=>n<limits.eventMs),'input event reached 100ms');
 need(raw.errors.length===0,'page error');
 need(Number.isFinite(sample.environment?.cpuBusyPercent)&&sample.environment.cpuBusyPercent<85,'measurement environment busy or missing');
 if(sample.viewport==='touch'&&sample.scenario==='modules')need(['pointerdown','pointerup','touchstart','touchend','click'].every(type=>raw.trustedEventCounts?.[type]>=9),'missing trusted touch module transitions');
 if(sample.scenario==='modules')need(['spelling','listening','speaking'].every(k=>actions.modules[k]>=2),'missing module transitions');
 else{need(raw.trustedInputs>=40&&actions.letters>=40,'insufficient real input');need(actions.completed>=(sample.scenario==='dictation'?2:3),'missing completed transitions');if(sample.scenario!=='dictation')need(raw.glyphs>0&&raw.particles>0,'missing full spelling effects');}
 if(sample.scenario==='sync'){need(actions.syncUploads>=1&&actions.syncedRows>=limits.historyRows,'no verified large-history sync');need(actions.integrity?.events===limits.historyRows+actions.completed&&actions.integrity?.total===limits.historyRows+actions.completed,'sync lost or duplicated experience');}
 return failures;
}
export function assessSuite(report){
 const failures=[];if(!/^[a-f0-9]{40}$/.test(report.sourceRevision||''))failures.push('missing source revision');
 const keys=new Set();for(const sample of report.samples||[]){const key=[sample.viewport,sample.scenario,sample.round].join('/');if(!['desktop','touch'].includes(sample.viewport)||!scenarios.includes(sample.scenario)||!Number.isInteger(sample.round)||sample.round<1||sample.round>limits.rounds)failures.push('unexpected '+key);if(keys.has(key))failures.push('duplicate '+key);keys.add(key);for(const reason of assessSample(sample))failures.push(key+': '+reason);}
 for(const view of ['desktop','touch'])for(const scenario of scenarios)for(let round=1;round<=limits.rounds;round++)if(!keys.has([view,scenario,round].join('/')))failures.push(`missing ${view}/${scenario}/${round}`);
 return failures;
}
