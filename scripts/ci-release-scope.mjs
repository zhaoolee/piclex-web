import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function changesProduct(paths){
  const tooling=new Set(['deploy/verify-remote-release.py','deploy/test_remote_release.py','README.md','ASSET_LICENSES.md','AGENTS.md','deploy/README.md','docker/Dockerfile.verified','scripts/prepare-verified-image.mjs','scripts/ci-release-scope.mjs','scripts/browser-test-scope.mjs']);
  return paths.some(path=>!tooling.has(path)&&! /^(\.github|docs|memory|tests)\//.test(path));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 let product=true;
 const base=process.env.GITHUB_EVENT_NAME==='pull_request'?event.pull_request?.base?.sha:event.before;
 if(['push','pull_request'].includes(process.env.GITHUB_EVENT_NAME)&&/^[a-f0-9]{40}$/.test(base)&&!/^0+$/.test(base)){
  const paths=execFileSync('git',['diff','--no-renames','--name-only','-z',base,process.env.GITHUB_SHA],{encoding:'utf8'}).split('\0').filter(Boolean);
  product=changesProduct(paths);
 }
 const publish=process.env.GITHUB_EVENT_NAME!=='pull_request'&&product;
 // A tooling-only run is NOT a release candidate: the release verifier still
 // requires this exact commit's successful performance job, never a skipped one.
 appendFileSync(process.env.GITHUB_OUTPUT,`publish=${publish}\nperformance=${product}\n`);
 console.log(publish?'Product change: publish after checks':'Tooling-only: verify affected checks without redeploying');
}
