import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function verifiedRun(run, jobs, revision, repository) {
  const required = ['build', 'Performance release gate', ...['desktop', 'mobile', 'mobile-webkit']
    .flatMap(project => [1, 2].map(shard => `Browser ${project} ${shard}/2`))];
  return run.head_sha === revision && run.status === 'completed' && run.conclusion === 'success'
    && ['push', 'workflow_dispatch'].includes(run.event) && run.head_repository?.full_name === repository
    && run.path?.split('@')[0] === '.github/workflows/pages.yml'
    && required.every(name => jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success'));
}

export async function findArtifact({repository, revision, token, ready = false, details = false, expectedRun}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !/^[a-f0-9]{40}$/.test(revision || '') || !token) {
    throw Error('Missing release identity or Actions read token');
  }
  if (expectedRun && (!/^[1-9][0-9]{0,14}$/.test(String(expectedRun)))) throw Error('Invalid candidate run ID');
  const get = async path => {
    const response = await fetch('https://api.github.com/repos/' + repository + path, {
      headers: {Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28'},
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error('Actions verification failed (HTTP ' + response.status + ')');
    return response.json();
  };
  const runs = expectedRun
    ? [await get('/actions/runs/' + expectedRun)]
    : (await get('/actions/workflows/pages.yml/runs?head_sha=' + revision + '&status=success&per_page=30')).workflow_runs;
  for (const run of runs) {
    if (expectedRun && String(run.id) !== String(expectedRun)) continue;
    const path = '/actions/runs/' + run.id;
    const [{jobs}, {artifacts}] = await Promise.all([get(path + '/jobs?per_page=100'), get(path + '/artifacts?per_page=100')]);
    if (!verifiedRun(run, jobs, revision, repository)) continue;
    if (ready && !(run.head_branch === 'main' && jobs.some(job => job.name === 'docker / publish'
      && job.status === 'completed' && job.conclusion === 'success'))) continue;
    const required = ready ? ['github-pages', 'verified-image'] : ['github-pages'];
    if (!required.every(name => artifacts.some(artifact => artifact.name === name && !artifact.expired))) continue;
    if (!details) return run.id;
    const pages = artifacts.filter(artifact => artifact.name === 'github-pages' && !artifact.expired);
    if (pages.length !== 1 || !Number.isSafeInteger(pages[0].id) || pages[0].id <= 0
      || !artifacts.some(artifact => artifact.name === 'release-manifest' && !artifact.expired)) {
      throw Error('Missing immutable Pages artifact identity or manifest');
    }
    return {runID: run.id, artifactID: pages[0].id};
  }
  throw Error('No full performance-verified artifact for this exact commit. Run Check and publish first; manual/tag publication cannot bypass its gate.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const id = await findArtifact({
    repository: process.env.GITHUB_REPOSITORY, revision: process.env.RELEASE_REVISION || process.env.GITHUB_SHA,
    token: process.env.GITHUB_TOKEN, ready: process.env.REQUIRE_READY_RELEASE === 'true', expectedRun: process.env.EXPECTED_CANDIDATE_RUN,
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `run-id=${id}\n`);
  console.log('Reusing verified artifact from workflow run ' + id);
}
