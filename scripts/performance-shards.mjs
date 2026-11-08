import {readFile, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scenarios, limits, assessSample, assessSuite} from './web-performance-policy.mjs';

export const shards = ['desktop', 'touch'].flatMap(viewport => scenarios.map(scenario => `${viewport}/${scenario}`));
export function shardFailures(report, shard) {
  if (!shards.includes(shard)) throw Error('Unknown performance shard');
  const failures = [], seen = new Set();
  for (const sample of report.samples || []) {
    const key = `${sample.viewport}/${sample.scenario}`;
    if (key !== shard || !Number.isInteger(sample.round) || sample.round < 1 || sample.round > limits.rounds) failures.push('Unexpected shard sample');
    if (seen.has(sample.round)) failures.push('Duplicate shard round');
    seen.add(sample.round);
    failures.push(...assessSample(sample));
  }
  for (let round = 1; round <= limits.rounds; round++) if (!seen.has(round)) failures.push(`Missing shard round ${round}`);
  return failures;
}
export function traceEvidence(events) {
  const starts = events.filter(e => e.name === 'piclex-performance-start');
  const ends = events.filter(e => e.name === 'piclex-performance-end');
  if (starts.length !== 1 || ends.length !== 1) throw Error('Missing or ambiguous trace markers');
  const [start] = starts, [end] = ends;
  if (end.ts <= start.ts || start.pid !== end.pid || start.tid !== end.tid) throw Error('Invalid trace interval');
  const same = events.filter(e => e.pid === start.pid && e.tid === start.tid && e.ts >= start.ts && e.ts <= end.ts);
  const kind = same.some(e => e.name === 'RunTask') ? 'RunTask' : 'ThreadControllerImpl::RunTask';
  const tasks = same.filter(e => e.ph === 'X' && e.name === kind);
  return {tasks: tasks.map(e => e.dur / 1000), taskCount: tasks.length, paints: same.filter(e => e.name === 'Paint').length};
}
const hash = value => createHash('sha256').update(value).digest('hex');
const signature = report => JSON.stringify({
  releaseID: report.artifact?.releaseID,
  assets: [...(report.artifact?.assets || [])].sort((a, b) => a.path.localeCompare(b.path)),
  fixture: report.fixture,
  platform: report.environment?.platform, arch: report.environment?.arch, browser: report.environment?.browser,
});

// Called only after all independent runners finish. A shard is never a release certificate.
export async function mergeShards(input, output, revision, manifest, harness) {
  if (!/^[a-f0-9]{40}$/.test(revision) || manifest.sourceRevision !== revision) throw Error('Wrong merge revision');
  await mkdir(output, {recursive: false});
  const report = {schema: 1, sourceRevision: revision, harness, samples: [], shards: [], status: 'running'};
  let expectedSignature;
  for (const shard of shards) {
    const directory = join(input, `performance-${shard.replace('/', '-')}`);
    const part = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
    if (part.sourceRevision !== revision || part.shard !== shard || part.status !== 'shard-passed' || part.error || part.failures?.length) throw Error(`Invalid shard receipt: ${shard}`);
    if (part.harness?.runnerSHA256 !== harness.runnerSHA256 || part.harness?.policySHA256 !== harness.policySHA256 || part.harness?.shardsSHA256 !== harness.shardsSHA256 || part.harness?.diagnosticScenario) throw Error('Different or diagnostic measurement harness');
    if (part.artifact?.releaseID !== manifest.releaseID || !part.artifact.assets?.length) throw Error('Different measured artifact');
    const expectedAssets = Object.keys(manifest.files).filter(p => p === 'piclex-web/index.html' || /\.(js|css)$/.test(p)).sort();
    if (JSON.stringify(part.artifact.assets.map(a => `piclex-web/${a.path}`).sort()) !== JSON.stringify(expectedAssets)) throw Error('Missing measured assets');
    for (const asset of part.artifact.assets) if (manifest.files[`piclex-web/${asset.path}`]?.sha256 !== asset.sha256) throw Error('Wrong measured bytes');
    if (part.environment?.platform !== 'linux' || !part.environment.browser || !part.fixture || !part.startedAt || !part.finishedAt) throw Error('Missing measurement identity');
    const currentSignature = signature(part);
    expectedSignature ??= currentSignature;
    if (currentSignature !== expectedSignature) throw Error('Inconsistent shard environment or fixtures');
    if (shardFailures(part, shard).length) throw Error(`Failed shard: ${shard}`);
    for (const sample of part.samples) {
      const id = `${sample.viewport}-${sample.scenario}-${sample.round}`;
      const saved = JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8'));
      if (JSON.stringify(saved) !== JSON.stringify(sample)) throw Error('Sample receipt mismatch');
      const events = JSON.parse(gunzipSync(await readFile(join(directory, `${id}.trace.json.gz`)))).traceEvents;
      if (JSON.stringify(traceEvidence(events)) !== JSON.stringify(sample.trace)) throw Error('Raw trace differs from report');
      for (const suffix of ['.json', '.trace.json.gz']) await copyFile(join(directory, id + suffix), join(output, id + suffix));
      report.samples.push(sample);
    }
    report.shards.push({shard, startedAt: part.startedAt, finishedAt: part.finishedAt, environment: part.environment});
    report.artifact = {...part.artifact, base: 'independent runners; identical verified bytes'};
    report.fixture = part.fixture;
  }
  report.startedAt = report.shards.map(s => s.startedAt).sort()[0];
  report.finishedAt = new Date().toISOString();
  report.failures = assessSuite(report);
  report.status = report.failures.length ? 'failed' : 'passed';
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (report.failures.length) throw Error(report.failures.join('\n'));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, revision, file] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  const harness = {};
  for (const [key, name] of [['runnerSHA256', 'run-web-performance.mjs'], ['policySHA256', 'web-performance-policy.mjs'], ['shardsSHA256', 'performance-shards.mjs']]) harness[key] = hash(await readFile(new URL(name, import.meta.url)));
  const report = await mergeShards(input, output, revision, manifest, harness);
  console.log(`Verified all ${report.samples.length} rounds from raw traces across ${report.shards.length} independent runners`);
}
