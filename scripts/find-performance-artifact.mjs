import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function verifiedRun(run,jobs,revision,repository){
 const required=['build','Performance release gate',...['desktop','mobile','mobile-webkit'].flatMap(project=>[1,2].map(shard=>`Browser ${project} ${shard}/2`))];
 return run.head_sha===revision&&run.status==='completed'&&run.conclusion==='success'&&['push','workflow_dispatch'].includes(run.event)&&run.head_repository?.full_name===repository&&run.path?.split('@')[0]==='.github/workflows/pages.yml'&&required.every(name=>jobs.some(job=>job.name===name&&job.status==='completed'&&job.conclusion==='success'));
}
export async function findArtifact({repository,revision,token}){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'')||!/^[a-f0-9]{40}$/.test(revision||'')||!token)throw Error('Missing release identity or Actions read token');
 const get=async path=>{const response=await fetch('https://api.github.com/repos/'+repository+path,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Actions verification failed (HTTP '+response.status+')');return response.json();};
 const {workflow_runs:runs}=await get('/actions/workflows/pages.yml/runs?head_sha='+revision+'&status=success&per_page=30');
 for(const run of runs){const {jobs}=await get('/actions/runs/'+run.id+'/jobs?per_page=100');if(!verifiedRun(run,jobs,revision,repository))continue;const {artifacts}=await get('/actions/runs/'+run.id+'/artifacts?name=github-pages&per_page=100');if(artifacts.some(a=>a.name==='github-pages'&&!a.expired))return run.id;}
 throw Error('No full performance-verified artifact for this exact commit. Run Check and publish first; manual/tag publication cannot bypass its gate.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const id=await findArtifact({repository:process.env.GITHUB_REPOSITORY,revision:process.env.GITHUB_SHA,token:process.env.GITHUB_TOKEN});appendFileSync(process.env.GITHUB_OUTPUT,`run-id=${id}\n`);console.log('Reusing verified artifact from workflow run '+id);
}
