import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {changesProduct} from '../scripts/ci-release-scope.mjs';
import {prepareVerifiedImage} from '../scripts/prepare-verified-image.mjs';
const hash=data=>createHash('sha256').update(data).digest('hex'),revision='a'.repeat(40);
test('CI-only changes run verification without republishing; product changes still publish',()=>{
 assert.equal(changesProduct(['deploy/verify-remote-release.py','deploy/test_remote_release.py']),false);
 assert.equal(changesProduct(['.github/workflows/pages.yml','scripts/prepare-verified-image.mjs','scripts/ci-release-scope.mjs','docker/Dockerfile.verified','tests/ci-release.test.mjs','memory/2026-11-06.md']),false);
 for(const path of ['apps/public/index.html','packages/learning-ui/src/LoadProgress.tsx','content/snapshot.json','Dockerfile','docker/nginx.conf','package-lock.json','scripts/build-public-content.mjs'])assert.equal(changesProduct(['.github/workflows/pages.yml',path]),true,path);
});
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'piclex-verified-test-'));const input=join(root,'dist'),output=join(root,'context');
 await mkdir(input);const html='<div id="root"></div>';await writeFile(join(input,'index.html'),html);
 const files={'piclex-web/index.html':{bytes:Buffer.byteLength(html),sha256:hash(html)}};
 const manifest={sourceRevision:revision,releaseID:revision.slice(0,12)+'-'+hash(JSON.stringify(files)).slice(0,12),files};
 await writeFile(join(input,'release.json'),JSON.stringify(manifest));
 try{await fn({input,output,root,manifest});}finally{await rm(root,{recursive:true,force:true});}
}
test('verified image context preserves exact artifact bytes and minimal runtime inputs',()=>fixture(async({input,output})=>{
 await prepareVerifiedImage(input,output,revision);
 assert.deepEqual(await readFile(join(output,'dist/index.html')),await readFile(join(input,'index.html')));
 assert.match(await readFile(join(output,'Dockerfile'),'utf8'),/COPY dist\//);
 assert.doesNotMatch(await readFile(join(output,'Dockerfile'),'utf8'),/npm|content:build/);
 await assert.rejects(prepareVerifiedImage(input,output,revision),/EEXIST/);
}));
test('different source revisions and tampered bytes are rejected before packaging',()=>fixture(async({input,output})=>{
 await assert.rejects(prepareVerifiedImage(input,output,'b'.repeat(40)),/revision mismatch/);
 await writeFile(join(input,'index.html'),'tampered');
 await assert.rejects(prepareVerifiedImage(input,output,revision),/checksum mismatch/);
}));
test('unexpected files cannot enter the image context',()=>fixture(async({input,output})=>{
 await writeFile(join(input,'.env'),'not a public asset');
 await assert.rejects(prepareVerifiedImage(input,output,revision),/Unexpected artifact file/);
}));
