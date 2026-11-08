import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {baseline, browserJobs, reviewedWorkflowHash, selectBrowserTests, hasFullBrowserEvidence, changedPaths, playwrightArgs} from '../scripts/browser-test-scope.mjs';
import {changesProduct} from '../scripts/ci-release-scope.mjs';
const available = readdirSync(new URL('./browser/', import.meta.url)).filter(f => f.endsWith('.spec.ts'));
const plan = paths => selectBrowserTests(paths, available);

test('learning edit retains cross-module behavior but excludes unrelated camera/export/game suites', () => {
  const selected = plan(['apps/public/src/practice.css']);
  assert.equal(selected.mode, 'scoped');
  for (const file of ['app-shell', 'alignment-extension', 'capture-grouping', 'playback-parity', 'settings-parity', 'learning-url', 'parity-subscriptions', 'deck-subscriptions', 'layout-audit']) assert.ok(selected.files.includes(file + '.spec.ts'), file);
  for (const file of ['camera-surface', 'capture-render', 'large-backup', 'subscription-poster', 'subscription-qr', 'lab-loading']) assert.ok(!selected.files.includes(file + '.spec.ts'), file);
});
test('camera, game and mixed experience changes union complete specs', () => {
  const photo = plan(['apps/public/src/capture.css']);
  assert.equal(photo.mode, 'scoped');
  assert.ok(photo.files.includes('camera-surface.spec.ts'));
  assert.ok(photo.files.includes('webdav-backup.spec.ts'));
  const game = plan(['packages/laboratory/src/sound.mjs']);
  assert.equal(game.files.length, 4);
  const combined = plan(['apps/public/src/capture.css', 'packages/laboratory/src/sound.mjs']);
  assert.deepEqual(combined.files, [...new Set([...photo.files, ...game.files])].sort());
  const experience = plan(['apps/public/src/Experience.tsx']);
  for (const file of ['lab-loading.spec.ts', 'learning-parity.spec.ts', 'settings-parity.spec.ts']) assert.ok(experience.files.includes(file));
});
test('shared, unknown, deleted tests and execution configuration fail closed', () => {
  for (const path of ['package-lock.json', 'playwright.config.ts', 'vite.config.ts', '.github/workflows/pages.yml', 'apps/public/src/storage.ts', 'apps/public/src/new-feature.ts', 'tests/browser/helpers.ts', 'tests/browser/removed.spec.ts', 'tests/fixtures/demo/demo.json', 'scripts/build-public-content.mjs']) {
    assert.equal(plan([path]).mode, 'full', path);
  }
  assert.equal(selectBrowserTests(['apps/public/src/practice.css'], []).mode, 'full');
});
test('only reviewed workflow bytes can reuse baseline coverage', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url));
  assert.equal(createHash('sha256').update(workflow).digest('hex'), reviewedWorkflowHash);
  assert.equal(selectBrowserTests(['.github/workflows/pages.yml'], available, {workflowHash: reviewedWorkflowHash}).mode, 'reuse');
  assert.equal(selectBrowserTests(['.github/workflows/pages.yml'], available, {workflowHash: 'changed'}).mode, 'full');
});
test('test-only changes select that spec; logs and selector tooling do not republish', () => {
  assert.deepEqual(plan(['tests/browser/camera-surface.spec.ts']).files, ['camera-surface.spec.ts']);
  const paths = ['docs/report.md', 'memory/2026-11-08.md', 'scripts/browser-test-scope.mjs', 'tests/browser-test-scope.test.mjs'];
  assert.equal(plan(paths).mode, 'reuse');
  assert.equal(changesProduct(paths), false);
});
function evidence() {
  return {run: {id: baseline.run, head_sha: baseline.revision, status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', head_repository: {full_name: baseline.repository}, path: '.github/workflows/pages.yml'}, jobs: ['build', ...browserJobs].map(name => ({name, status: 'completed', conclusion: 'success'}))};
}
test('browser evidence is independent of performance; missing, failed and foreign evidence is rejected', () => {
  const good = evidence();
  assert.equal(hasFullBrowserEvidence(good.run, good.jobs), true);
  for (const mutate of [d => d.jobs.pop(), d => d.jobs[1].conclusion = 'failure', d => d.jobs[1].conclusion = 'skipped', d => d.run.head_sha = 'b'.repeat(40), d => d.run.head_repository.full_name = 'foreign/repo', d => d.run.status = 'in_progress', d => d.run.event = 'pull_request', d => d.run.path = 'other.yml', d => d.run.id++]) {
    const data = evidence(); mutate(data);
    assert.equal(hasFullBrowserEvidence(data.run, data.jobs), false);
  }
});
test('cumulative comparison retains earlier changes and both sides of renames', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'piclex-scope-git-'));
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  try {
    git('init'); git('config', 'user.name', 'Scope fixture'); git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(cwd, 'old.css'), 'a'); git('add', '.'); git('commit', '-m', 'baseline'); const base = git('rev-parse', 'HEAD');
    git('mv', 'old.css', 'new.css'); git('commit', '-m', 'rename');
    writeFileSync(join(cwd, 'latest.css'), 'b'); git('add', '.'); git('commit', '-m', 'later');
    assert.deepEqual(changedPaths(base, 'HEAD', cwd).sort(), ['latest.css', 'new.css', 'old.css']);
    assert.throws(() => changedPaths('0'.repeat(40), 'HEAD', cwd));
  } finally {rmSync(cwd, {recursive: true, force: true});}
});
test('execution never turns an empty/malformed selection into an accidental full run', () => {
  assert.equal(playwrightArgs({mode: 'reuse', files: []}), null);
  assert.throws(() => playwrightArgs({mode: 'scoped', files: []}));
  assert.throws(() => playwrightArgs({mode: 'scoped', files: ['.*']}));
  const args = playwrightArgs(plan(['tests/browser/camera-surface.spec.ts']), ['--project=mobile-webkit']);
  assert.ok(args.includes('tests/browser/camera-surface\\.spec\\.ts$'));
  assert.ok(args.includes('--pass-with-no-tests'));
  assert.ok(!playwrightArgs(plan(['package-lock.json'])).includes('--pass-with-no-tests'));
});
test('tooling-only CI skips performance but a product PR still measures performance', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'piclex-pipeline-scope-'));
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  try {
    git('init'); git('config', 'user.name', 'Scope fixture'); git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(cwd, 'README.md'), 'baseline'); git('add', '.'); git('commit', '-m', 'base'); const base = git('rev-parse', 'HEAD');
    writeFileSync(join(cwd, 'README.md'), 'documentation'); git('add', '.'); git('commit', '-m', 'tooling'); const doc = git('rev-parse', 'HEAD');
    writeFileSync(join(cwd, 'product.js'), 'changed'); git('add', '.'); git('commit', '-m', 'product'); const product = git('rev-parse', 'HEAD');
    for (const [eventName, head, expected] of [['push', doc, 'publish=false\nperformance=false\n'], ['pull_request', product, 'publish=false\nperformance=true\n'], ['push', product, 'publish=true\nperformance=true\n'], ['workflow_dispatch', doc, 'publish=true\nperformance=true\n']]) {
      const event = join(cwd, 'event.json'), output = join(cwd, 'outputs');
      writeFileSync(event, JSON.stringify({before: base, pull_request: {base: {sha: base}}})); writeFileSync(output, '');
      execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/ci-release-scope.mjs', import.meta.url))], {cwd, env: {...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_SHA: head, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output}});
      assert.equal(readFileSync(output, 'utf8'), expected);
    }
  } finally {rmSync(cwd, {recursive: true, force: true});}
});
