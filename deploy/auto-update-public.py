#!/usr/bin/env python3
"""Promote a verified GitHub Pages release to the existing Web mirror."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

from activate import ROOT, SITE, LOCK_PATH, patch_site, verify_release
from release_lifecycle import verify_live_release, prune_old_releases
from release_state import record_activation
from contextlib import ExitStack, contextmanager
from verified_candidate import authorize_cutover, copy_delta, read_request, staged_candidate

PAGES='https://zhaoolee.com/piclex-web/'
HASH=re.compile(r'[0-9a-f]{64}')
RELEASE=re.compile(r'[0-9a-f]{12}-[0-9a-f]{12}')


def fetch(url, output=None, limit=2*1024*1024):
    command=['curl','--fail','--silent','--show-error','--connect-timeout','10','--max-time','180','--max-filesize',str(limit)]
    if output is not None:command+=['--output',str(output)]
    result=subprocess.run(command+[url],check=True,stdout=subprocess.PIPE if output is None else subprocess.DEVNULL)
    return result.stdout if output is None else None


def digest(path):
    value=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):
            value.update(chunk)
    return value.hexdigest()


def manifest_from_pages():
    return validate_manifest(json.loads(fetch(PAGES+'release.json')))


def validate_manifest(manifest):
    if (not RELEASE.fullmatch(manifest.get('releaseID','')) or
        not re.fullmatch(r'[0-9a-f]{40}',manifest.get('sourceRevision','')) or
        manifest.get('origin')!='https://piclex.v2fy.com' or
        not isinstance(manifest.get('files'),dict) or
        len(manifest['files'])>10000):
        raise RuntimeError('Invalid Pages release manifest')
    files=manifest['files']
    if (any(not safe_file(name,info) for name,info in files.items()) or
        sum(info['bytes'] for info in files.values())>10*1024**3 or
        manifest['releaseID']!=manifest['sourceRevision'][:12]+'-'+hashlib.sha256(json.dumps(files,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()[:12]):
        raise RuntimeError('Invalid Pages release files or identity')
    return manifest


def safe_file(name, info):
    parts=name.split('/') if isinstance(name,str) else []
    return (len(parts)>1 and parts[0]=='piclex-web' and
            re.fullmatch(r'[A-Za-z0-9_./-]+',name) is not None and
            all(part not in ('','.','..') and not part.startswith('.') for part in parts) and
            isinstance(info,dict) and isinstance(info.get('bytes'),int) and
            0<=info['bytes']<=134217728 and HASH.fullmatch(info.get('sha256','')))


def populate(stage,manifest,previous,staged_files=None,reuse_links=True):
    # The final release must be traversable by the existing Nginx worker.
    stage.chmod(0o755)
    old_files={}
    if previous is not None:
        try:old_files=json.loads((previous/'release.json').read_text()).get('files',{})
        except (OSError,ValueError):pass
    def obtain(item):
        name,info=item
        if not safe_file(name,info):raise RuntimeError(f'Invalid release file path or metadata: {name}')
        destination=stage/name
        destination.parent.mkdir(parents=True,exist_ok=True)
        old=previous/name if previous else None
        if old is not None and old_files.get(name)==info and old.is_file() and not old.is_symlink() and digest(old)==info['sha256']:
            if reuse_links:os.link(old,destination)
            else:shutil.copyfile(old,destination)
        elif staged_files is not None:
            copy_delta(staged_files,name,destination,info)
        else:
            fetch(PAGES+name.removeprefix('piclex-web/'),destination,info['bytes']+1)
        if destination.stat().st_size!=info['bytes'] or digest(destination)!=info['sha256']:
            raise RuntimeError(f'Pages file checksum mismatch: {name}')
    with ThreadPoolExecutor(max_workers=8) as workers:list(workers.map(obtain,manifest['files'].items()))
    (stage/'release.json').write_text(json.dumps(manifest,indent=2)+'\n')


def switch(target):
    if target is None:
        (ROOT/'current').unlink(missing_ok=True)
        return
    temporary=ROOT/f'.current-auto-{os.getpid()}'
    try:
        temporary.symlink_to(target)
        os.replace(temporary,ROOT/'current')
    finally:temporary.unlink(missing_ok=True)


@contextmanager
def release_timing(request):
    """Record each phase of the parallel service, including a failed phase."""
    receipt = {'request': request, 'started': time.time(), 'status': 'running', 'phases': {}}

    def save():
        reports = ROOT / 'reports'
        if reports.is_symlink():
            raise ValueError('Timing reports directory must not be a symlink')
        reports.mkdir(exist_ok=True)
        fd, temp = tempfile.mkstemp(prefix='.parallel-timing-', dir=reports)
        try:
            with os.fdopen(fd, 'w') as stream:
                os.fchmod(stream.fileno(), 0o644)
                json.dump(receipt, stream, indent=2)
                stream.write('\n')
            os.replace(temp, reports / f"parallel-timing-{request['releaseRun']}.json")
        finally:
            Path(temp).unlink(missing_ok=True)

    @contextmanager
    def phase(name):
        if request is None:
            yield
            return
        item = receipt['phases'][name] = {'started': time.time()}
        elapsed = time.monotonic()
        try:
            yield
        except BaseException:
            item['status'] = 'failed'
            raise
        else:
            item['status'] = 'passed'
        finally:
            item.update(completed=time.time(), seconds=time.monotonic() - elapsed)
            save()

    try:
        yield phase
    except BaseException:
        receipt['status'] = 'failed'
        raise
    else:
        receipt['status'] = 'passed'
    finally:
        if request is not None:
            receipt['completed'] = time.time()
            save()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Verify the candidate without activating it')
    parser.add_argument('--from-pages',action='store_true',help='Use the original Pages mirror source explicitly')
    parser.add_argument('--candidate-run',type=int,help='Staged GitHub run to rehearse with --check')
    parser.add_argument('--revision',help='Exact staged SHA to rehearse with --check')
    args=parser.parse_args()
    if (args.candidate_run is not None or args.revision is not None) and (
            not args.check or args.from_pages or not args.candidate_run or not args.revision):
        parser.error('--candidate-run and --revision require --check and each other')
    if not ROOT.is_dir() or ROOT.resolve()!=ROOT or SITE.is_symlink():raise RuntimeError('Unexpected deployment paths')
    if not args.check and os.geteuid()!=0:
        raise SystemExit('Run activation as root so all process/container cleanup checks can complete; use --check for validation only')
    config=SITE.read_bytes()
    if patch_site(config.decode())!=config.decode():raise RuntimeError('Nginx configuration needs privileged review')
    request = None if args.check or args.from_pages else read_request()
    staged = request or ({'candidateRun': args.candidate_run, 'revision': args.revision}
                         if args.candidate_run else None)
    with release_timing(request) as phase, ExitStack() as stack:
        staged_files = None
        if staged:
            with phase('candidate'):
                manifest, staged_files = stack.enter_context(
                    staged_candidate(ROOT, staged['candidateRun'], staged['revision']))
                validate_manifest(manifest)
        with phase('lock'):
            lock = stack.enter_context(LOCK_PATH.open('r'))
            fcntl.flock(lock, fcntl.LOCK_EX)
        started = time.time()
        if not staged:
            manifest = manifest_from_pages()
        current = ROOT / 'current'
        if current.exists() and not current.is_symlink():
            raise RuntimeError('current must be a symlink')
        previous = current.resolve() if current.is_symlink() else None
        if previous and previous.name == manifest['releaseID'] and not (staged and args.check):
            if request:
                raise ValueError('Requested mirror version is already live')
            return print('Public Web release unchanged; no deployment')
        previous_manifest = {}
        with phase('previous'):
            if previous:
                if previous.parent != ROOT / 'releases':
                    raise RuntimeError('Current release is outside the managed directory')
                previous_manifest = verify_release(previous)
            if request and previous_manifest.get('sourceRevision') != request['previousRevision']:
                raise ValueError('Mirror base changed after candidate staging')
        # The root service uses systemd PrivateTmp for the parallel candidate so
        # uploaded paths cannot replace the verified tree during authorization.
        stage_parent = Path('/tmp').resolve() if request else ROOT / 'incoming'
        with tempfile.TemporaryDirectory(prefix='piclex-auto-', dir=stage_parent) as directory:
            stage = Path(directory)
            with phase('populate'):
                populate(stage, manifest, previous, staged_files, reuse_links=not args.check and not request)
            with phase('hashes'):
                if verify_release(stage) != manifest:
                    raise ValueError('Mirror manifest changed during staging')
            with phase('isolatedNginx'):
                subprocess.run(['/usr/bin/python3', '-B', str(ROOT / 'deploy/check-mirror.py'),
                                '--release', str(stage)], check=True)
            if args.check:
                return print(f'Candidate verified: {manifest["releaseID"]}')
            if request:
                with phase('authorization'):
                    authorize_cutover(request)
            if SITE.read_bytes() != config:
                raise RuntimeError('Nginx configuration changed during preparation')
            if (current.resolve() if current.is_symlink() else None) != previous or (current.exists() and not current.is_symlink()):
                raise RuntimeError('Current changed during preparation')
            release = ROOT / 'releases' / manifest['releaseID']
            with phase('installCandidate'):
                if release.exists() or release.is_symlink():
                    if verify_release(release) != manifest:
                        raise RuntimeError('Release ID collision')
                else:
                    stage.rename(release)
                record_activation(ROOT, release, previous, hashlib.sha256(config).hexdigest())
            try:
                with phase('cutover'):
                    switch(release)
                with phase('liveHttp'):
                    verify_live_release(release, manifest)
            except BaseException:
                with phase('rollback'):
                    switch(previous)
                raise
            print(f'Activated {manifest["releaseID"]}')
            with phase('cleanup'):
                prune_old_releases(ROOT, SITE, release, previous, started, verify_release)


if __name__=='__main__':main()
