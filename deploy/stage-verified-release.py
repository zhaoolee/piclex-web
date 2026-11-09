#!/usr/bin/env python3
"""Stage the changed files of an already verified Pages artifact for the mirror."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
from shlex import quote
import tarfile
import tempfile

from verified_candidate import REPO, SHA, candidate_artifacts, delta_names, read_manifest_zip

ROOT = '/home/hermes/piclex-web'
UPLOAD = """set -eu
cd /home/hermes/piclex-web/incoming
scratch=$(mktemp -d .verified-upload.XXXXXXXX)
trap 'rm -rf -- "$scratch"' EXIT
tar --no-same-owner --no-same-permissions -xf - -C "$scratch"
mv -T --no-clobber "$scratch" "$1"
test ! -e "$scratch"
"""


# Assemble the exact candidate on the release filesystem ahead of dispatch.
# PrivateTmp is a separate mount, so the root service should never need a
# cross-mount rename for a normal parallel release.
MATERIALIZE = """import fcntl,runpy,sys,tempfile
from pathlib import Path
sys.path.insert(0,'/usr/local/lib/piclex-public-updater')
from verified_candidate import staged_candidate
from activate import ROOT,LOCK_PATH,verify_release
updater=runpy.run_path('/usr/local/lib/piclex-public-updater/auto-update-public.py')
run=int(sys.argv[1]); revision=sys.argv[2]; base=sys.argv[3]
with staged_candidate(ROOT,run,revision) as (manifest,files), LOCK_PATH.open('r') as lock:
    updater['validate_manifest'](manifest)
    fcntl.flock(lock,fcntl.LOCK_EX)
    pointer=ROOT/'current'
    if not pointer.is_symlink():raise ValueError('Current mirror pointer is not a symlink')
    previous=pointer.resolve(strict=True)
    if previous.parent!=ROOT/'releases' or verify_release(previous)['sourceRevision']!=base:
        raise ValueError('Current mirror changed during staging')
    target=ROOT/'releases'/manifest['releaseID']
    if target.exists() or target.is_symlink():
        if verify_release(target)!=manifest:raise ValueError('Staged release ID collision')
    else:
        with tempfile.TemporaryDirectory(prefix='piclex-prepare-',dir=ROOT/'incoming') as name:
            stage=Path(name)
            updater['populate'](stage,manifest,previous,files,reuse_links=False)
            if verify_release(stage)!=manifest or pointer.resolve(strict=True)!=previous:
                raise ValueError('Candidate or current changed during assembly')
            stage.rename(target)
    print(target.name)
"""


def gh_read(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}{path}'], timeout=30))


def ssh(host, command):
    return ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, command]


def prepare_files(archive, manifest, names, destination):
    if not names:
        return
    missing = set(names)
    with tarfile.open(archive, 'r|*') as bundle:
        for member in bundle:
            name = 'piclex-web/' + member.name.removeprefix('./')
            if name not in names:
                continue
            parts = PurePosixPath(name).parts
            if '..' in parts or any(not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*', part) for part in parts):
                raise ValueError(f'Invalid candidate file path: {name}')
            expected = manifest['files'][name]
            if name not in missing or not member.isfile() or member.size != expected['bytes']:
                raise ValueError(f'Wrong candidate archive member: {name}')
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with bundle.extractfile(member) as source, target.open('xb') as output:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != expected['sha256']:
                raise ValueError(f'Candidate file checksum mismatch: {name}')
            missing.remove(name)
    if missing:
        raise ValueError(f'Missing {len(missing)} files in the Pages archive')


def stage(host, run_id, revision, local_tar=None):
    with ThreadPoolExecutor(2) as pool:
        receipt = pool.submit(candidate_artifacts, run_id, revision, gh_read)
        live = pool.submit(subprocess.check_output, ssh(host, f'cat {ROOT}/current/release.json'), timeout=25)
        artifacts, previous = receipt.result(), json.loads(live.result())
    if not SHA.fullmatch(previous['sourceRevision']):
        raise ValueError('Invalid current mirror revision')
    entry = artifacts['release-manifest']
    raw = subprocess.check_output(['gh', 'api', f'repos/{REPO}/actions/artifacts/{entry["id"]}/zip'], timeout=40)
    manifest = read_manifest_zip(raw, entry)
    if manifest['sourceRevision'] != revision:
        raise ValueError('Wrong candidate manifest revision')
    names = delta_names(manifest, previous)
    with tempfile.TemporaryDirectory(prefix='piclex-verified-upload-') as directory:
        root = Path(directory)
        files = root / 'files'
        files.mkdir()
        if names and local_tar is None:
            artifact = root / 'pages'
            subprocess.run(['gh', 'run', 'download', str(run_id), '--repo', REPO,
                            '--name', 'github-pages', '--dir', str(artifact)], check=True, timeout=480)
            local_tar = artifact / 'artifact.tar'
        prepare_files(local_tar, manifest, names, files)
        (root / 'release-manifest.zip').write_bytes(raw)
        upload = root / 'upload.tar'
        with tarfile.open(upload, 'w') as bundle:
            bundle.add(root / 'release-manifest.zip', arcname='release-manifest.zip')
            bundle.add(files, arcname='files')
        command = 'bash -c ' + quote(UPLOAD) + f' _ verified-{run_id}'
        with upload.open('rb') as stream:
            subprocess.run(ssh(host, command), stdin=stream, check=True, timeout=480)
    if previous['sourceRevision'] != revision:
        assembled = subprocess.check_output(
            ssh(host, f'python3 -B - {run_id} {revision} {previous["sourceRevision"]}'),
            input=MATERIALIZE.encode(), timeout=150,
        ).decode().strip().splitlines()[-1]
        if assembled != manifest['releaseID']:
            raise ValueError('Assembled mirror release does not match the verified candidate')
    return {'candidateRun': run_id, 'revision': revision, 'previousRevision': previous['sourceRevision'],
            'releaseID': manifest['releaseID'], 'uploadedFiles': len(names)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate-run', required=True, type=int)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--host', default='hermes-v2fy')
    parser.add_argument('--pages-tar', type=Path, help='Existing downloaded GitHub Pages artifact.tar')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._@-]*', args.host):
        parser.error('Invalid SSH host')
    print(json.dumps(stage(args.host, args.candidate_run, args.revision, args.pages_tar)))


if __name__ == '__main__':
    main()
