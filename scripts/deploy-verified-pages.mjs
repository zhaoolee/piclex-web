import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findArtifact} from './find-performance-artifact.mjs';

// Same Pages API/OIDC contract as actions/deploy-pages. GitHub stores the
// immutable artifact: deploy its verified ID instead of downloading/reuploading it.
export async function deployVerifiedPages({repository, revision, token, ref, oidcURL, oidcToken, expectedRun,
  request = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, onStatus = () => {}}) {
  if (ref !== 'refs/heads/main') throw Error('Pages deployment requires protected main workflow');
  const receipt = await findArtifact({repository, revision, token, ready: true, details: true, expectedRun});
  if (String(receipt.runID) !== String(expectedRun)) throw Error('Verified candidate run changed');
  if (!oidcURL || !oidcToken) throw Error('Missing Actions OIDC credentials');
  const api = async (path, method = 'GET', body) => {
    const response = await request(`https://api.github.com/repos/${repository}${path}`, {
      method, headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`Pages API ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? {} : response.json();
  };
  const response = await request(oidcURL, {headers: {Authorization: `Bearer ${oidcToken}`}, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`OIDC request failed: HTTP ${response.status}`);
  const identity = await response.json();
  if (!identity.value) throw Error('Missing OIDC identity token');
  const deployment = await api('/pages/deployments', 'POST', {
    artifact_id: receipt.artifactID, pages_build_version: revision, oidc_token: identity.value,
  });
  const id = deployment.id || deployment.status_url?.split('/').pop();
  if (!id || !/^[\w-]+$/.test(String(id))) throw Error('Invalid Pages deployment identity');
  let complete = false;
  const cancel = async () => {if (!complete) await api(`/pages/deployments/${id}/cancel`, 'POST');};
  const signal = () => {cancel().finally(() => process.exit(1));};
  process.once('SIGTERM', signal); process.once('SIGINT', signal);
  try {
    const start = now(); let previousStatus;
    onStatus({deploymentID: id, status: 'created', elapsedMs: 0});
    while (now() - start < 600000) {
      const state = await api(`/pages/deployments/${id}`);
      if (state.status !== previousStatus) {onStatus({deploymentID: id, status: state.status, elapsedMs: now() - start}); previousStatus = state.status;}
      if (state.status === 'succeed') {complete = true; return {...receipt, deploymentID: id, pageURL: deployment.page_url};}
      if (['deployment_failed', 'deployment_perms_error', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost'].includes(state.status)) throw Error(`Pages deployment: ${state.status}`);
      await sleep(1000);
    }
    throw Error('Pages deployment timed out');
  } finally {
    try {await cancel();} finally {process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal);}
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await deployVerifiedPages({repository: process.env.GITHUB_REPOSITORY, revision: process.env.RELEASE_REVISION,
    token: process.env.GITHUB_TOKEN, ref: process.env.GITHUB_REF, expectedRun: process.env.VERIFIED_RUN_ID,
    oidcURL: process.env.ACTIONS_ID_TOKEN_REQUEST_URL, oidcToken: process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    onStatus: status => console.log(JSON.stringify(status))});
  appendFileSync(process.env.GITHUB_OUTPUT, `page_url=${result.pageURL}\n`);
  console.log(JSON.stringify(result));
}
