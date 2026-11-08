// Reproduce delayed protocol delivery against the release runner's actual tap
// function. A host-side 50ms timer must not become a shorter browser gesture.
import fs from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
if(process.platform!=='linux')throw Error('Run only in an audio-isolated Linux environment');
for(const p of ['/dev/snd','/run/user/1000/pulse/native','/tmp/.X11-unix'])try{await fs.access(p);throw Error('Host audio/display integration: '+p);}catch(e){if(e.code!=='ENOENT')throw e;}
const source=await fs.readFile(process.argv[2]||new URL('./run-web-performance.mjs',import.meta.url),'utf8');
const body=source.split('const tap=async button=>{')[1]?.split('\n   const type=')[0];
if(!body?.endsWith('};'))throw Error('Cannot locate the actual release runner tap implementation');
const browser=await chromium.launch({args:['--mute-audio']}),results=[];
try{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage();
 await page.setContent('<button style="width:150px;height:60px">Switch module</button>');
 await page.evaluate(()=>{window.__perf={trustedEventCounts:{},touchEvents:[]};for(const type of ['touchstart','touchend','click'])addEventListener(type,e=>{if(e.isTrusted)window.__perf.trustedEventCounts[type]=(window.__perf.trustedEventCounts[type]||0)+1;window.__perf.touchEvents.push({type,time:e.timeStamp,trusted:e.isTrusted});},true);});
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmitTouchEventsForMouse',{enabled:true,configuration:'mobile'});
 const errors=[];const sendTouch=params=>{const send=()=>cdp.send('Input.dispatchMouseEvent',params).catch(e=>errors.push(e));if(params.type==='mousePressed')setTimeout(send,35);else send();};
 // Use the production function, including its visibility/hit tests and event
 // acknowledgements. Only the transport delays press delivery by 35ms.
 const tap=new Function('page','expect','sendTouch',`let touchCount=0,touchInputError;const tap=async button=>{${body};return tap;`)(page,expect,sendTouch);
 for(let i=0;i<3;i++)await tap(page.getByRole('button',{name:'Switch module'}));
 const evidence=await page.evaluate(()=>window.__perf),starts=evidence.touchEvents.filter(e=>e.type==='touchstart'),ends=evidence.touchEvents.filter(e=>e.type==='touchend');
 for(let i=0;i<starts.length;i++)results.push({start:starts[i],end:ends[i],durationMs:ends[i].time-starts[i].time});
 console.log(JSON.stringify({results,counts:evidence.trustedEventCounts,errors:errors.map(String)},null,2));
 expect(errors).toEqual([]);expect(starts).toHaveLength(3);expect(ends).toHaveLength(3);expect(evidence.trustedEventCounts.click).toBe(3);expect(evidence.touchEvents.every(e=>e.trusted)).toBe(true);
 for(const result of results)expect(result.durationMs,'actual trusted press-to-release duration').toBeGreaterThanOrEqual(40);
}finally{await browser.close();}
