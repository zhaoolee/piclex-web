import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {shards, shardFailures, traceEvidence, mergeShards} from '../scripts/performance-shards.mjs';
import {assessSuite} from '../scripts/web-performance-policy.mjs';
const revision = 'a'.repeat(40), harness = {runnerSHA256: 'r', policySHA256: 'p', shardsSHA256: 's'};
const manifest = {sourceRevision: revision, releaseID: 'test-release', files: {'piclex-web/index.html': {sha256: 'html'}}};
const events = [{name: 'piclex-performance-start', pid: 1, tid: 2, ts: 1},
  ...Array.from({length: 100}, (_, i) => ({name: 'RunTask', ph: 'X', pid: 1, tid: 2, ts: i * 1000 + 2, dur: 1000})),
  {name: 'Paint', pid: 1, tid: 2, ts: 5000}, {name: 'piclex-performance-end', pid: 1, tid: 2, ts: 10000001}];
function sample(viewport, scenario, round) {
  return {viewport, scenario, round, environment: {cpuBusyPercent: 20},
    raw: {start: 0, end: 10000, frames: Array(600).fill(16.7), events: [16], longTasks: [], longFrames: [], visibility: ['visible'], reducedMotion: false, errors: [], trustedInputs: 70, glyphs: 70, particles: 70, trustedEventCounts: {pointerdown: 70, pointerup: 70, touchstart: 70, touchend: 70, click: 70}},
    actions: {letters: 70, completed: 6, modules: {spelling: 3, listening: 3, speaking: 3}, syncUploads: 1, syncedRows: 5000, integrity: {events: 5006, total: 5006}}, trace: traceEvidence(events), failures: []};
}
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'performance-shards-')), input = join(root, 'parts'), output = join(root, 'merged');
  await mkdir(input);
  const parts = [];
  for (const shard of shards) {
    const [viewport, scenario] = shard.split('/'), directory = join(input, `performance-${viewport}-${scenario}`);
    await mkdir(directory);
    const report = {sourceRevision: revision, shard, harness, status: 'shard-passed', failures: [], startedAt: '2026-11-08T00:00:00Z', finishedAt: '2026-11-08T00:01:00Z', environment: {platform: 'linux', arch: 'x64', browser: 'fixture'}, fixture: {historyRows: 5000, historySHA256: 'same'}, artifact: {releaseID: manifest.releaseID, assets: [{path: 'index.html', sha256: 'html'}]}, samples: [1, 2, 3].map(round => sample(viewport, scenario, round))};
    for (const item of report.samples) {
      const id = `${viewport}-${scenario}-${item.round}`;
      await writeFile(join(directory, `${id}.json`), JSON.stringify(item));
      await writeFile(join(directory, `${id}.trace.json.gz`), gzipSync(JSON.stringify({traceEvents: events})));
    }
    await writeFile(join(directory, 'report.json'), JSON.stringify(report));
    parts.push({directory, report});
  }
  try {await fn({root, input, output, parts});} finally {await rm(root, {recursive: true, force: true});}
}
test('partial shards never satisfy the full gate; every round remains required', () => {
  const report = {sourceRevision: revision, samples: [1, 2, 3].map(n => sample('desktop', 'spelling', n))};
  assert.deepEqual(shardFailures(report, 'desktop/spelling'), []);
  assert.ok(assessSuite(report).length);
  report.samples.pop(); assert.ok(shardFailures(report, 'desktop/spelling').length);
  report.samples.push(report.samples[0]); assert.ok(shardFailures(report, 'desktop/spelling').length);
  assert.throws(() => shardFailures(report, 'desktop/unknown'));
});
test('eight independent shards retain all 24 raw traces and the original full gate', () => fixture(async f => {
  const report = await mergeShards(f.input, f.output, revision, manifest, harness);
  assert.equal(report.status, 'passed'); assert.equal(report.samples.length, 24);
  assert.deepEqual(assessSuite(report), []);
  for (const s of report.samples) assert.ok((await readFile(join(f.output, `${s.viewport}-${s.scenario}-${s.round}.trace.json.gz`))).length);
}));
test('wrong versions, harnesses, assets, environment, duplicate rounds and failed shards reject', async () => {
  for (const mutate of [r => r.sourceRevision = 'b'.repeat(40), r => r.shard = 'touch/sync', r => r.status = 'passed', r => r.harness = {...harness, runnerSHA256: 'wrong'}, r => r.harness = {...harness, diagnosticScenario: 'sync'}, r => r.artifact.assets = [], r => r.artifact.assets[0].sha256 = 'wrong', r => r.environment.browser = 'other', r => r.fixture.historySHA256 = 'other', r => r.samples.pop(), r => r.samples.push(r.samples[0]), r => r.samples[0].raw.events.push(100), r => r.error = 'version changed']) {
    await fixture(async f => {const {report, directory} = f.parts[1]; mutate(report); await writeFile(join(directory, 'report.json'), JSON.stringify(report)); await assert.rejects(mergeShards(f.input, f.output, revision, manifest, harness));});
  }
});
test('missing and tampered raw evidence cannot be replaced by a passing receipt', async () => {
  for (const mode of ['missing', 'tampered', 'sample']) await fixture(async f => {
    const directory = f.parts[0].directory, file = join(directory, 'desktop-spelling-1.trace.json.gz');
    if (mode === 'missing') await rm(file);
    if (mode === 'tampered') {const changed = structuredClone(events); changed[1].dur = 120000; await writeFile(file, gzipSync(JSON.stringify({traceEvents: changed})));}
    if (mode === 'sample') await writeFile(join(directory, 'desktop-spelling-1.json'), '{}');
    await assert.rejects(mergeShards(f.input, f.output, revision, manifest, harness));
  });
});
