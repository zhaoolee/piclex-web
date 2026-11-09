import test from 'node:test';
import assert from 'node:assert/strict';
import {deployVerifiedPages} from '../scripts/deploy-verified-pages.mjs';
const revision = 'a'.repeat(40), repository = 'fixture/repository';
test('Pages directly deploys only the exact immutable fully verified candidate with OIDC', async () => {
  for (const mode of ['success', 'failed-gate', 'expired', 'duplicate', 'missing-manifest', 'changed-run', 'other-ref', 'server-failure']) {
    const original = globalThis.fetch, calls = [];
    const run = {id: 123, head_sha: revision, status: 'completed', conclusion: 'success', event: 'push', head_repository: {full_name: repository}, head_branch: 'main', path: '.github/workflows/pages.yml'};
    const jobs = ['build', 'Performance release gate', 'docker / publish', ...['desktop', 'mobile', 'mobile-webkit'].flatMap(p => [1, 2].map(s => `Browser ${p} ${s}/2`))].map(name => ({name, status: 'completed', conclusion: 'success'}));
    const artifacts = ['github-pages', 'verified-image', 'release-manifest'].map((name, i) => ({name, id: 456 + i, expired: false}));
    if (mode === 'failed-gate') jobs[1].conclusion = 'failure';
    if (mode === 'expired') artifacts[0].expired = true;
    if (mode === 'duplicate') artifacts.push({...artifacts[0], id: 999});
    if (mode === 'missing-manifest') artifacts.pop();
    const request = async (url, options = {}) => {
      calls.push({url, options});
      let data;
      if (url.includes('/jobs?')) data = {jobs};
      else if (url.includes('/artifacts?')) data = {artifacts};
      else if (/\/actions\/runs\/[0-9]+$/.test(url)) data = run;
      else if (url === 'https://oidc.invalid/token') data = {value: 'identity-placeholder'};
      else if (url.endsWith('/pages/deployments')) data = {id: 'deployment-1', page_url: 'https://fixture.invalid/'};
      else data = {status: mode === 'server-failure' ? 'deployment_failed' : 'succeed'};
      return {ok: true, status: 200, json: async () => data};
    };
    globalThis.fetch = request;
    try {
      const operation = deployVerifiedPages({repository, revision, token: 'placeholder', ref: mode === 'other-ref' ? 'refs/heads/feature' : 'refs/heads/main', expectedRun: mode === 'changed-run' ? 124 : 123, oidcURL: 'https://oidc.invalid/token', oidcToken: 'placeholder', request});
      if (mode === 'success') {
        assert.equal((await operation).artifactID, 456);
        const post = calls.find(c => c.url.endsWith('/pages/deployments'));
        assert.deepEqual(JSON.parse(post.options.body), {artifact_id: 456, pages_build_version: revision, oidc_token: 'identity-placeholder'});
      } else await assert.rejects(operation);
      assert.equal(calls.some(c => c.url.endsWith('/pages/deployments')), ['success', 'server-failure'].includes(mode), mode);
      assert.equal(calls.some(c => c.url.endsWith('/cancel')), mode === 'server-failure');
    } finally {globalThis.fetch = original;}
  }
});
