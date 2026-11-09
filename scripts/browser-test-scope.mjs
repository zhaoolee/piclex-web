import {execFileSync, spawnSync} from 'node:child_process';
import {appendFileSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Full browser coverage, NOT a performance/release approval. Keep this anchor
// until another full browser run is reviewed; always diff cumulatively from it.
export const baseline = {
  repository: 'zhaoolee/piclex-web',
  revision: '7a9d5b0a8dbdd36a4ceba7c33b9f0fc04d98fb47',
  run: 42479218892,
};
export const browserJobs = ['desktop', 'mobile', 'mobile-webkit'].flatMap(
  project => [1, 2].map(shard => `Browser ${project} ${shard}/2`));
// Reviewed workflow changes wire selection and bound package mirror requests.
// Browser install commands, projects, shards and assertions remain the same.
// Any subsequent workflow edit invalidates reuse until reviewed again.
export const reviewedWorkflowHash = 'be1bc4453fc1a99618b1b2143857a6a9d81665ccdb0abf2ec52c5a9ea615e494';
const specs = names => names.trim().split(/\s+/).map(name => `${name}.spec.ts`);
const learning = specs(`app-shell alignment-extension audio-unlock audio-unlock-speech
  capture capture-grouping deck-picker-audio desktop-fit focus-ambience guided-no-eyes
  http-crypto ime input-performance interaction-audit keyboard-viewport learning-entry
  learning-keyboard-shortcuts learning-parity learning-url learning listening-layout layout-audit
  loading native-style parity-speaking parity-state parity-subscriptions deck-subscriptions photo-prefetch playback-parity
  settings-parity speech-voice spelling-feedback spelling-letter-color spelling-revisit
  touch-spelling visible-focus visual-viewport word-completion word-peek
  deck-progress-background spelling-completion-quick spelling-gold-sweep`);
const capture = specs(`ai-settings alignment-extension app-shell camera-parity camera-surface
  capture capture-grouping capture-mobile-fit capture-render learning-parity loading
  native-style photo-prefetch settings-parity webdav-backup`);
const game = specs('lab-loading learning-parity alignment-extension app-shell');

// Intentionally small allowlist. Shared persistence, assets, dependencies, build
// inputs and unclassified source files use all tests. Mixed specs run in full.
const rules = [
  {name: 'learning', match: /^apps\/public\/src\/(NativePractice\.tsx|EnglishInput\.tsx|Reading\.tsx|WordPeek\.tsx|word-definitions\.ts|practice\.css|reading\.css|useSpeech\.ts|speech-voice\.ts|speech-voice-choice\.mjs|speech-progress\.mjs|playback-progress\.ts|SentenceAmbience\.tsx|ambience-mixer\.ts)$/, tests: learning},
  {name: 'learning-effects', match: /^packages\/learning-ui\/src\/(SpellingGlow\.tsx|AnswerSlots\.tsx|VirtualKeyboard\.tsx|spelling\.mjs|spelling-edit\.mjs|gold-sweep\.css|dictation-edit\.mjs|keyboard-edit\.mjs|CharacterRipples\.tsx|character-ripples\.mjs)$/, tests: learning},
  {name: 'capture', match: /^apps\/public\/src\/(Capture\.tsx|capture\.css|PolaroidPrint\.tsx|RecognitionHalo\.tsx|FlowingSand\.tsx)$/, tests: capture},
  {name: 'game', match: /^(packages\/laboratory\/|apps\/public\/src\/(Laboratory\.tsx|lab-entry\.ts)$)/, tests: game},
  // Experience is used by practice, settings AND the game entry, not game alone.
  {name: 'experience', match: /^apps\/public\/src\/(Experience\.tsx|level\.css)$/, tests: [...learning, ...capture, ...game]},
];
const tooling = new Set([
  'scripts/browser-test-scope.mjs', 'scripts/ci-release-scope.mjs',
  'deploy/verify-remote-release.py', 'deploy/test_remote_release.py',
  'deploy/release_lifecycle.py', 'deploy/test_release_lifecycle.py',
  'scripts/release-verified-build.mjs', 'scripts/deploy-verified-pages.mjs', 'scripts/performance-shards.mjs', 'scripts/run-web-performance.mjs', 'scripts/web-performance-policy.mjs',
  'scripts/find-performance-artifact.mjs', 'scripts/prepare-verified-image.mjs',
  'scripts/promote-verified-image.mjs', 'scripts/verify-live-release.mjs',
  '.github/workflows/release.yml', '.github/workflows/docker-publish.yml',
]);
export function selectBrowserTests(paths, available, {workflowHash} = {}) {
  const all = [...available].sort();
  const selected = new Set(), modules = new Set();
  for (const path of paths) {
    if (path === '.github/workflows/pages.yml' && workflowHash === reviewedWorkflowHash) continue;
    if (/^(docs|memory)\//.test(path) || /^(README|ASSET_LICENSES)\.md$/.test(path)
      || path === 'AGENTS.md' || tooling.has(path) || /^tests\/[^/]+\.test\.mjs$/.test(path)) continue;
    if (/^tests\/browser\/[^/]+\.spec\.ts$/.test(path) && all.includes(path.split('/').at(-1))) {
      selected.add(path.split('/').at(-1)); continue;
    }
    const matches = rules.filter(rule => rule.match.test(path));
    if (!matches.length) return {mode: 'full', files: all, reason: `Shared or unknown input: ${path}`};
    for (const rule of matches) {
      modules.add(rule.name);
      for (const file of rule.tests) {
        if (!all.includes(file)) return {mode: 'full', files: all, reason: `Mapping needs review: ${file}`};
        selected.add(file);
      }
    }
  }
  return {mode: selected.size ? 'scoped' : 'reuse', files: [...selected].sort(), modules: [...modules], reason: 'Cumulative diff from verified browser baseline'};
}

export function hasFullBrowserEvidence(run, jobs) {
  return run.id === baseline.run && run.head_sha === baseline.revision && run.status === 'completed'
    && ['push', 'workflow_dispatch'].includes(run.event) && run.head_repository?.full_name === baseline.repository
    && run.path?.split('@')[0] === '.github/workflows/pages.yml'
    && ['build', ...browserJobs].every(name => jobs.some(job => job.name === name
      && job.status === 'completed' && job.conclusion === 'success'));
}
async function verifyBaseline() {
  if (process.env.GITHUB_REPOSITORY !== baseline.repository) throw Error('Different repository');
  const get = async suffix => {
    const response = await fetch(`https://api.github.com/repos/${baseline.repository}/actions/runs/${baseline.run}${suffix}`, {
      headers: {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json'},
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`Baseline lookup HTTP ${response.status}`);
    return response.json();
  };
  const [run, {jobs}] = await Promise.all([get(''), get('/jobs?per_page=100')]);
  if (!hasFullBrowserEvidence(run, jobs)) throw Error('Baseline browser evidence incomplete');
}
export function changedPaths(base, head = 'HEAD', cwd = process.cwd()) {
  execFileSync('git', ['merge-base', '--is-ancestor', base, head], {cwd, stdio: 'pipe'});
  // No rename detection: both old and new paths must participate in selection.
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], {cwd, encoding: 'utf8'}).split('\0').filter(Boolean);
}
export function playwrightArgs(plan, extra = []) {
  if (!['full', 'scoped', 'reuse'].includes(plan.mode) || !Array.isArray(plan.files)) throw Error('Invalid browser plan');
  if (plan.mode === 'reuse') {
    if (plan.files.length) throw Error('Invalid reuse plan');
    return null;
  }
  if (!plan.files.length || plan.files.some(file => !/^[\w-]+\.spec\.ts$/.test(file))) throw Error('Empty or invalid test selection');
  // Existing WebKit testMatch and sharding can legitimately leave a scoped job
  // empty. Full runs retain Playwright's error on an empty test collection.
  return ['test', ...plan.files.map(file => `tests/browser/${file.replaceAll('.', '\\.')}$`),
    ...(plan.mode === 'scoped' ? ['--pass-with-no-tests'] : []), ...extra];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--run') {
    const plan = JSON.parse(process.env.BROWSER_SCOPE);
    const args = playwrightArgs(plan, process.argv.slice(3));
    if (!args) console.log(`Reusing unchanged browser coverage from ${baseline.run}`);
    else {
      const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', ...args], {stdio: 'inherit'});
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } else {
    const available = readdirSync('tests/browser').filter(file => file.endsWith('.spec.ts')).sort();
    let plan;
    try {
      if (process.env.FULL_BROWSER === 'true') throw Error('Explicit full browser check');
      await verifyBaseline();
      const workflowHash = createHash('sha256').update(readFileSync('.github/workflows/pages.yml')).digest('hex');
      plan = selectBrowserTests(changedPaths(baseline.revision, process.env.GITHUB_SHA || 'HEAD'), available, {workflowHash});
    } catch (error) {
      plan = {mode: 'full', files: available, reason: error.message};
    }
    plan = {...plan, baseline, revision: process.env.GITHUB_SHA};
    const json = JSON.stringify(plan);
    writeFileSync('browser-scope.json', json + '\n');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `plan=${json}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Browser coverage\n\n${plan.mode}: ${plan.files.length}/${available.length} spec files. ${plan.reason}\n\nBaseline: https://github.com/${baseline.repository}/actions/runs/${baseline.run}\n\nPerformance approval is independent and is never inherited.\n`);
    console.log(json);
  }
}
