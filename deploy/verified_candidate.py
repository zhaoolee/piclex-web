"""Validate and read the staged bytes of an independently approved Web candidate."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
from zipfile import ZipFile

REPO = 'zhaoolee/piclex-web'
REQUEST = Path('/run/piclex-public-updater/request')
SHA = re.compile(r'[0-9a-f]{40}')
MANIFEST_LIMIT = 2 * 1024**2
REQUIRED = {'build', 'Performance release gate', 'docker / publish'} | {
    f'Browser {project} {shard}/2'
    for project in ('desktop', 'mobile', 'mobile-webkit') for shard in (1, 2)
}


def valid_run_id(value):
    return type(value) is int and 0 < value < 10**15


def github(path):
    body = subprocess.check_output([
        '/usr/bin/curl', '--fail', '--silent', '--show-error', '--connect-timeout', '4',
        '--max-time', '8', '--max-filesize', str(MANIFEST_LIMIT),
        '-H', 'Accept: application/vnd.github+json',
        '-H', 'X-GitHub-Api-Version: 2022-11-28',
        f'https://api.github.com/repos/{REPO}{path}',
    ])
    return json.loads(body)


def same_workflow(run, run_id, workflow):
    return (run.get('id') == run_id and run.get('head_branch') == 'main'
            and (run.get('head_repository') or {}).get('full_name') == REPO
            and (run.get('repository') or {}).get('full_name') == REPO
            and run.get('path', '').split('@')[0] == f'.github/workflows/{workflow}.yml')


def candidate_artifacts(run_id, revision, read=github):
    if not valid_run_id(run_id) or not SHA.fullmatch(revision):
        raise ValueError('Invalid candidate identity')
    path = f'/actions/runs/{run_id}'
    with ThreadPoolExecutor(3) as pool:
        lookup = [pool.submit(read, path + suffix) for suffix in ('', '/jobs?per_page=100', '/artifacts?per_page=100')]
        run, jobs, artifacts = [future.result() for future in lookup]
    successful = {job['name'] for job in jobs['jobs']
                  if job.get('status') == 'completed' and job.get('conclusion') == 'success'}
    if (not same_workflow(run, run_id, 'pages') or run.get('head_sha') != revision
            or run.get('event') not in ('push', 'workflow_dispatch')
            or run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or not REQUIRED <= successful):
        raise ValueError('Candidate has not passed all required GitHub jobs')
    found = {}
    for name in ('release-manifest', 'github-pages', 'verified-image'):
        matches = [entry for entry in artifacts['artifacts']
                   if entry['name'] == name and entry.get('expired') is False]
        if len(matches) != 1 or not valid_run_id(matches[0].get('id')):
            raise ValueError(f'Missing unique, unexpired artifact: {name}')
        found[name] = matches[0]
    return found


@contextmanager
def regular_file(name, maximum, directory=None):
    fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=directory)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or not 0 <= info.st_size <= maximum:
            raise ValueError('Invalid staged file type or size')
        yield stream


def read_request(path=REQUEST):
    try:
        with regular_file(path, 1024) as stream:
            raw = stream.read(1025).strip()
    except FileNotFoundError:
        return None
    if not raw or SHA.fullmatch(raw.decode('ascii')):
        return None  # Existing Pages update trigger.
    value = json.loads(raw)
    if (not isinstance(value, dict) or set(value) != {'candidateRun', 'releaseRun', 'revision', 'previousRevision'}
            or not valid_run_id(value['candidateRun']) or not valid_run_id(value['releaseRun'])
            or any(not isinstance(value[key], str) or not SHA.fullmatch(value[key])
                   for key in ('revision', 'previousRevision'))):
        raise ValueError('Invalid parallel release request')
    return value


def read_manifest_zip(raw, entry):
    if (len(raw) != entry.get('size_in_bytes') or len(raw) > MANIFEST_LIMIT
            or 'sha256:' + hashlib.sha256(raw).hexdigest() != entry.get('digest')):
        raise ValueError('Staged manifest archive does not match GitHub digest')
    with ZipFile(BytesIO(raw)) as archive:
        if archive.namelist() != ['release.json'] or archive.getinfo('release.json').file_size > MANIFEST_LIMIT:
            raise ValueError('Unexpected release manifest archive')
        return json.loads(archive.read('release.json'))


@contextmanager
def staged_candidate(root, run_id, revision):
    entry = candidate_artifacts(run_id, revision)['release-manifest']
    with ExitStack() as stack:
        incoming = os.open(root / 'incoming', os.O_DIRECTORY | os.O_NOFOLLOW)
        stack.callback(os.close, incoming)
        directory = os.open(f'verified-{run_id}', os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=incoming)
        stack.callback(os.close, directory)
        with regular_file('release-manifest.zip', MANIFEST_LIMIT, directory) as stream:
            manifest = read_manifest_zip(stream.read(MANIFEST_LIMIT + 1), entry)
        if manifest.get('sourceRevision') != revision:
            raise ValueError('Staged manifest belongs to another revision')
        files = os.open('files', os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
        stack.callback(os.close, files)
        yield manifest, files


def delta_names(manifest, previous):
    return {name for name, info in manifest['files'].items()
            if previous.get('files', {}).get(name) != info}


def copy_delta(files, name, destination, expected):
    digest = hashlib.sha256()
    size = 0
    with ExitStack() as stack:
        directory = files
        parts = name.split('/')
        if any(part in ('', '.', '..') for part in parts):
            raise ValueError('Invalid staged path')
        for part in parts[:-1]:
            directory = os.open(part, os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            stack.callback(os.close, directory)
        source = stack.enter_context(regular_file(parts[-1], expected['bytes'], directory))
        output = stack.enter_context(destination.open('xb'))
        while chunk := source.read(1024 * 1024):
            size += len(chunk)
            if size > expected['bytes']:
                raise ValueError(f'Staged file too large: {name}')
            digest.update(chunk)
            output.write(chunk)
    if size != expected['bytes'] or digest.hexdigest() != expected['sha256']:
        raise ValueError(f'Staged file checksum mismatch: {name}')


def authorize_cutover(request, read=github, now=lambda: datetime.now(timezone.utc),
                      clock=time.monotonic, sleep=time.sleep):
    revision, previous = request['revision'], request['previousRevision']
    run_id = request['releaseRun']
    if read(f'/compare/{previous}...{revision}?per_page=1').get('status') != 'ahead':
        raise ValueError('Candidate must be ahead of the current mirror release')
    path = f'/actions/runs/{run_id}'
    title = f"Release {revision} candidate {request['candidateRun']}"
    deadline = clock() + 60
    while clock() < deadline:
        run = read(path)
        age = (now() - datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))).total_seconds()
        if (not same_workflow(run, run_id, 'release') or run.get('event') != 'workflow_dispatch'
                or run.get('display_title') != title or not -10 <= age <= 300
                or run.get('run_attempt') != 1 or run.get('conclusion') not in (None, 'success')):
            raise ValueError('Missing fresh, authorized GitHub production release')
        # The protected environment must have admitted the release job and its gate.
        for job in read(path + '/jobs?per_page=100')['jobs']:
            if job.get('name') != 'release' or job.get('status') not in ('in_progress', 'completed'):
                continue
            if job.get('conclusion') not in (None, 'success'):
                raise ValueError('GitHub production release failed')
            if any(step.get('name') == 'Require the exact fully verified candidate'
                   and step.get('conclusion') == 'success' for step in job.get('steps', [])):
                return
        sleep(1)
    raise TimeoutError('Protected GitHub release job did not pass its candidate gate')
