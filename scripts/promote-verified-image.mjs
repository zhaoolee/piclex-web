import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function checkedImage(receipt,revision,image){
 if(!/^[a-f0-9]{40}$/.test(revision||'')||receipt.sourceRevision!==revision)throw Error('Wrong image source revision');
 if(!/^[a-z0-9_-]+\/piclex-web$/.test(image||'')||receipt.image!==image)throw Error('Wrong image repository');
 if(!/^sha256:[a-f0-9]{64}$/.test(receipt.digest||''))throw Error('Missing immutable image digest');
 return image+'@'+receipt.digest;
}
export function checkPlatforms(manifest){
 const platforms=new Set((manifest.manifests||[]).map(x=>x.platform?.os+'/'+x.platform?.architecture));
 if(!platforms.has('linux/amd64')||!platforms.has('linux/arm64'))throw Error('Both tested architectures are required');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const receipt=JSON.parse(readFileSync(process.argv[2],'utf8')),image=process.env.IMAGE,source=checkedImage(receipt,process.env.REVISION,image);
 const docker=(args)=>execFileSync('docker',['buildx','imagetools',...args],{encoding:'utf8'});
 checkPlatforms(JSON.parse(docker(['inspect','--raw',source])));
 docker(['create','--tag',image+':latest',source]);
 const inspect=docker(['inspect',image+':latest']);
 if(!new RegExp('^Digest:\\s+'+receipt.digest+'\\s*$','m').test(inspect))throw Error('Published image digest does not match the tested candidate');
 checkPlatforms(JSON.parse(docker(['inspect','--raw',image+':latest'])));
 console.log('Published and verified '+source+' without rebuilding');
}
