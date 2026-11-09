import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Each child owns its existing validation. Overlap preparation with deployment,
// but never run the live check until both Pages and browser dependencies are ready.
export async function releaseVerifiedBuild({run, now = Date.now, signal}) {
  const start = now(), controller = new AbortController(), stages = {};
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  if (signal?.aborted) abort();
  const stage = async (name, command, args) => {
    const started = now();
    try {await run(command, args, controller.signal);}
    finally {stages[name] = {started, completed: now()};}
  };
  const tasks = [
    stage('pages', process.execPath, ['scripts/deploy-verified-pages.mjs']),
    stage('dependencies', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']),
    stage('docker', process.execPath, ['scripts/promote-verified-image.mjs', 'candidate/verified-image.json']),
  ];
  tasks.push(Promise.all(tasks.slice(0, 2)).then(() => stage('live', process.execPath,
    ['scripts/verify-live-release.mjs', 'https://zhaoolee.com/piclex-web/', process.env.RELEASE_REVISION,
      'candidate/release.json', '--smoke'])));
  try {
    await Promise.all(tasks);
    return {status: 'passed', started: start, completed: now(), stages};
  } catch (error) {
    controller.abort();
    await Promise.allSettled(tasks);
    error.releaseTiming = {status: 'failed', started: start, completed: now(), stages};
    throw error;
  } finally {signal?.removeEventListener('abort', abort);}
}

function run(command, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'inherit', detached: true});
    let timer;
    const stop = () => {
      try {process.kill(-child.pid, 'SIGTERM');} catch (error) {if (error.code !== 'ESRCH') throw error;}
      timer = setTimeout(() => {try {process.kill(-child.pid, 'SIGKILL');} catch {}}, 35000);
      timer.unref();
    };
    signal.addEventListener('abort', stop, {once: true});
    child.once('error', reject);
    child.once('close', code => {
      signal.removeEventListener('abort', stop); clearTimeout(timer);
      if (code === 0) resolve(); else reject(Error(`${command} ${args[0]} failed (${code})`));
    });
    if (signal.aborted) stop();
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController(), stop = () => controller.abort();
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {writeFileSync('release-timing.json', JSON.stringify(await releaseVerifiedBuild({run, signal: controller.signal}), null, 2) + '\n');}
  catch (error) {
    if (error.releaseTiming) writeFileSync('release-timing.json', JSON.stringify(error.releaseTiming, null, 2) + '\n');
    console.error(error.message); process.exitCode = 1;
  } finally {process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);}
}
