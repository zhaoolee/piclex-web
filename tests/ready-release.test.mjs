import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {findArtifact} from '../scripts/find-performance-artifact.mjs';
import {checkedImage,checkPlatforms} from '../scripts/promote-verified-image.mjs';
import {verifyLive} from '../scripts/verify-live-release.mjs';
const revision='a'.repeat(40),repository='fixture/repository';
function ready(){return {run:{id:123,head_sha:revision,status:'completed',conclusion:'success',event:'push',head_repository:{full_name:repository},head_branch:'main',path:'.github/workflows/pages.yml'},jobs:['build','Performance release gate','docker / publish',...['desktop','mobile','mobile-webkit'].flatMap(p=>[1,2].map(s=>`Browser ${p} ${s}/2`))].map(name=>({name,status:'completed',conclusion:'success'})),artifacts:['github-pages','verified-image'].map(name=>({name,expired:false}))};}
test('fast release needs the exact full gates, prepared image and unexpired artifact',async()=>{
 const original=globalThis.fetch;
 try{for(const change of [null,d=>d.run.head_sha='b'.repeat(40),d=>d.run.head_branch='feature',d=>d.jobs[1].conclusion='failure',d=>d.jobs[2].conclusion='skipped',d=>d.jobs.pop(),d=>d.artifacts.pop(),d=>d.artifacts[0].expired=true]){
  const data=ready();change?.(data);
  globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/jobs?')?{jobs:data.jobs}:url.includes('/artifacts?')?{artifacts:data.artifacts}:{workflow_runs:[data.run]}});
  const call=findArtifact({repository,revision,token:'test-placeholder',ready:true});
  if(change)await assert.rejects(call,/No full performance-verified/);else assert.equal(await call,123);
 }}finally{globalThis.fetch=original;}
});
test('image promotion accepts only the immutable tested source and both architectures',()=>{
 const receipt={sourceRevision:revision,image:'fixture/piclex-web',digest:'sha256:'+'b'.repeat(64)};
 assert.equal(checkedImage(receipt,revision,receipt.image),receipt.image+'@'+receipt.digest);
 for(const patch of [{sourceRevision:'c'.repeat(40)},{image:'outside/piclex-web'},{digest:'latest'}])assert.throws(()=>checkedImage({...receipt,...patch},revision,receipt.image));
 const manifests=['amd64','arm64'].map(architecture=>({platform:{os:'linux',architecture}}));checkPlatforms({manifests});assert.throws(()=>checkPlatforms({manifests:manifests.slice(0,1)}));
});
test('live verification rejects stale and corrupt application resources',async()=>{
 const bytes=Buffer.from('<div id="root"></div>'),manifest={sourceRevision:revision,releaseID:'fixture-release',files:{'piclex-web/index.html':{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}};
 const original=globalThis.fetch;
 try{for(const mode of ['correct','stale','corrupt']){
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>String(url).endsWith('release.json')?Buffer.from(JSON.stringify({...manifest,...(mode==='stale'?{sourceRevision:'c'.repeat(40)}:{})})):mode==='corrupt'?Buffer.from('wrong'):bytes});
  const call=verifyLive('https://fixture.invalid/piclex-web/',revision,manifest);
  if(mode==='correct')assert.equal((await call).verifiedAssets,1);else await assert.rejects(call,/Live release|Wrong live asset/);
 }}finally{globalThis.fetch=original;}
});
