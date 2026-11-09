import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseVerifiedBuild} from '../scripts/release-verified-build.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const pending = new Map(), calls = [];
  const run = (command, args, signal) => new Promise((resolve, reject) => {
    const name = command === 'npm' ? 'dependencies' : args[0].includes('deploy-') ? 'pages' : args[0].includes('promote-') ? 'docker' : 'live';
    calls.push(name); pending.set(name, {resolve, reject});
    signal.addEventListener('abort', () => reject(Error('cancelled')), {once: true});
    if (signal.aborted) reject(Error('cancelled'));
  });
  return {run, calls, pending};
}
test('deployment overlaps preparation and image promotion; success waits for live checks AND Docker', async () => {
  const h = harness(), done = releaseVerifiedBuild(h); let complete = false;
  done.then(() => complete = true);
  assert.deepEqual(h.calls, ['pages', 'dependencies', 'docker']);
  h.pending.get('pages').resolve(); await tick(); assert.equal(h.calls.includes('live'), false);
  h.pending.get('dependencies').resolve(); await tick(); assert.equal(h.calls.includes('live'), true);
  h.pending.get('live').resolve(); await tick(); assert.equal(complete, false);
  h.pending.get('docker').resolve(); const result = await done;
  assert.equal(result.status, 'passed'); assert.deepEqual(Object.keys(result.stages).sort(), ['dependencies','docker','live','pages']);
});
for (const failed of ['pages', 'dependencies', 'docker']) test(`${failed} failure cancels siblings and cannot report a verified release`, async () => {
  const h = harness(), done = releaseVerifiedBuild(h);
  const rejected = assert.rejects(done, error => error.message === failed && error.releaseTiming.status === 'failed');
  h.pending.get(failed).reject(Error(failed)); await rejected;
  assert.equal(h.calls.includes('live'), false);
});
test('cancellation stops all release work', async () => {
  const h = harness(), controller = new AbortController();
  const done = releaseVerifiedBuild({...h, signal: controller.signal});
  const rejected = assert.rejects(done, /cancelled/); controller.abort(); await rejected;
});
test('a failed live check prevents a successful result after deployment', async () => {
  const h = harness(), done = releaseVerifiedBuild(h), rejected = assert.rejects(done, /live failed/);
  for (const name of ['pages','dependencies','docker']) h.pending.get(name).resolve();
  await tick(); h.pending.get('live').reject(Error('live failed')); await rejected;
});
