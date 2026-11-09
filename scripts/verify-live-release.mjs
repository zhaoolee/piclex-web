import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyLive(base,revision,manifest){
 if(!/^[a-f0-9]{40}$/.test(revision||'')||manifest.sourceRevision!==revision)throw Error('Wrong expected release revision');
 const url=new URL(base);if(url.protocol!=='https:')throw Error('Live checks require HTTPS');
 const read=async path=>{const r=await fetch(new URL(path,url),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`Live ${path}: HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());};
 const current=JSON.parse(await read('release.json'));
 if(current.sourceRevision!==revision||current.releaseID!==manifest.releaseID)throw Error('Live release is not the tested candidate');
 const entries=Object.entries(manifest.files).filter(([name])=>/\.(html|js|css)$/.test(name));
 if(!entries.some(([name])=>name==='piclex-web/index.html'))throw Error('Missing application entry');
 let index=0;await Promise.all(Array.from({length:6},async()=>{while(index<entries.length){const [name,info]=entries[index++];if(!/^piclex-web\/[A-Za-z0-9_./-]+$/.test(name)||name.split('/').includes('..'))throw Error('Unsafe manifest path');const bytes=await read(name.slice('piclex-web/'.length));if(bytes.length!==info.bytes||sha(bytes)!==info.sha256)throw Error('Wrong live asset: '+name);}}));
 const after=JSON.parse(await read('release.json'));if(after.releaseID!==manifest.releaseID)throw Error('Release changed during live verification');
 return {sourceRevision:revision,releaseID:manifest.releaseID,verifiedAssets:entries.length};
}
async function smokeLive(base, bundled = false) {
  if(process.platform!=='linux')throw Error('Browser smoke requires isolated Linux');
  if(bundled) {
    const {access} = await import('node:fs/promises');
    if(process.env.PULSE_SERVER || process.env.PIPEWIRE_REMOTE)throw Error('Host audio connection is present');
    for(const device of ['/dev/snd','/run/user/1000/pulse/native']){
      try {await access(device);throw Error('Host audio connection is present');}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  const {chromium,expect}=await import('@playwright/test');
  const browser=await chromium.launch({...(bundled?{}:{channel:'chrome'}),headless:true,args:['--mute-audio']});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},...(bundled?{hasTouch:true,isMobile:true}:{})});
    await page.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],speak(){},cancel(){},pause(){},resume(){},addEventListener(){},removeEventListener(){}}});});
    await page.goto(base+'#/decks');
    await page.getByLabel('选择照片卡组文件').setInputFiles('tests/fixtures/demo/decks/cafe.piclexdeck');
    await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
    for(const [label,module] of [['练听力','listening'],['拼单词','spelling']]){
      const tab=page.getByRole('tab',{name:label,exact:true});
      if(bundled)await tab.tap();else await tab.click();
      await expect(page.locator('.native-practice')).toHaveAttribute('data-module',module);
    }
    if(bundled){
      const [catalog]=await Promise.all([
        page.waitForResponse(response=>new URL(response.url()).pathname==='/piclex-web/library/catalog.json'),
        page.reload(),
      ]);
      if(!catalog.ok())throw Error('Catalog did not load during reload');
      await catalog.finished();
    }else await page.reload();
    await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
    await expect(page.locator('.native-practice')).toHaveAttribute('data-module','spelling');
    return 'import, module navigation and reload persistence passed in fresh isolated storage';
  } finally {await browser.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [base,revision,file,smoke]=process.argv.slice(2);
  if(revision==='--mirror-smoke'){
    if(base!=='https://piclex.v2fy.com/piclex-web/')throw Error('Mirror smoke requires the public domestic URL');
    console.log(JSON.stringify({smoke:await smokeLive(base,true)}));
  }else{
    const result=await verifyLive(base,revision,JSON.parse(await readFile(file,'utf8')));
    if(smoke==='--smoke')result.smoke=await smokeLive(base);
    console.log(JSON.stringify(result));
  }
}
