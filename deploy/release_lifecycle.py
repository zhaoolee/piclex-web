"""Post-cutover verification and bounded retention for immutable Web releases."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
from urllib.parse import quote, urlsplit

ORIGIN = 'https://piclex.v2fy.com'
RELEASE_ID = re.compile(r'[0-9a-f]{12}-[0-9a-f]{12}')


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_live(path, origin):
    command = ['curl', '--fail', '--silent', '--show-error', '--compressed',
               '--connect-timeout', '5', '--max-time', '20', '--retry', '1']
    if origin:
        command += ['--resolve', 'piclex.v2fy.com:443:127.0.0.1']
    return subprocess.check_output(command + [ORIGIN + quote(path, safe='/')])


def verify_live_release(release, manifest):
    paths = {'piclex-web/index.html', 'piclex-web/source.json', 'piclex-web/library/catalog.json'}
    for entry in ('piclex-web/index.html', 'piclex-web/subscribe/index.html', 'piclex-web/lab/index.html'):
        if entry not in manifest['files']:
            continue
        paths.add(entry)
        for url in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', (release / entry).read_text()):
            parsed = urlsplit(url)
            if parsed.path.endswith(('.js', '.css')):
                if parsed.scheme or parsed.netloc or not parsed.path.startswith('/piclex-web/'):
                    raise ValueError('Entry references a non-release script or stylesheet')
                path = parsed.path.lstrip('/')
                if path not in manifest['files']:
                    raise ValueError(f'Entry references an unlisted asset: {path}')
                paths.add(path)
    ordered_paths = sorted(paths)
    channels = (('originHTTPS', True), ('publicHTTPS', False))
    verified = {}
    # Each channel/path request is independent. Submit them all first so a slow
    # endpoint cannot serialize the rest, then evaluate in the original order so
    # failures and their messages stay deterministic; shutdown waits for threads.
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = []
        for channel, origin in channels:
            for path in ordered_paths:
                jobs.append((channel, path, pool.submit(fetch_live, '/' + path, origin)))
            jobs.append((channel, None, pool.submit(fetch_live, '/healthz', origin)))
        for channel, path, future in jobs:
            data = future.result()
            if path is None:
                if json.loads(data).get('status') != 'ok':
                    raise ValueError(f'{channel} health check failed')
                verified[channel] = list(ordered_paths)
            elif hashlib.sha256(data).hexdigest() != manifest['files'][path]['sha256']:
                raise ValueError(f'{channel} checksum mismatch: {path}')
    return verified


def assert_current(root, site, expected, config_hash):
    pointer = root / 'current'
    if not pointer.is_symlink() or pointer.resolve() != expected or file_sha256(site) != config_hash:
        raise RuntimeError('Live release/configuration changed; cleanup stopped')


def release_references(root, candidates):
    """Read active references, not old logs or historical configuration backups."""
    references = {path: set() for path in candidates}
    host_mounts = []
    if shutil.which('docker'):
        ids = subprocess.check_output(['docker', 'ps', '-q'], text=True).split()
        containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids])) if ids else []
        for container in containers:
            for mount in container.get('Mounts', []):
                source = mount.get('Source', '')
                # A read-only whole-host mount alone is not a dependency on every
                # historical release. Its concrete process references still count.
                if source == '/' and mount.get('RW') is False:
                    host_mounts.append(mount['Destination'].rstrip('/'))
                    continue
                for path in candidates:
                    if source and (str(path) == source or str(path).startswith(source.rstrip('/') + '/')
                                   or source.startswith(str(path) + '/')):
                        references[path].add('container mount')

    def record(target, reason):
        for prefix in host_mounts:
            if target.startswith(prefix + '/'):
                target = target[len(prefix):]
                break
        for path in candidates:
            if target == str(path) or target.startswith(str(path) + '/'):
                references[path].add(reason)

    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            for entry in [process / 'cwd', process / 'root', process / 'exe', *(process / 'fd').iterdir()]:
                try:
                    record(os.readlink(entry), 'open process reference')
                except (FileNotFoundError, ProcessLookupError):
                    pass
            command = (process / 'cmdline').read_bytes()
            maps = (process / 'maps').read_bytes()
            for path in candidates:
                if os.fsencode(path) in command or os.fsencode(path) in maps:
                    references[path].add('process arguments/memory map')
        except (FileNotFoundError, ProcessLookupError):
            pass
    for directory in ('/etc/nginx/conf.d', '/etc/nginx/sites-enabled', '/etc/systemd/system',
                      '/etc/cron.d', '/var/spool/cron/crontabs'):
        for config in Path(directory).rglob('*'):
            if config.is_file():
                content = config.read_bytes()
                for path in candidates:
                    if os.fsencode(path) in content:
                        references[path].add('active service configuration')
    for entry in root.iterdir():
        if entry.is_symlink():
            record(str(entry.resolve()), 'deployment symlink')
    return references


def prune_old_releases(root, site, current, previous, started, verify_release):
    """Caller holds the deployment lock and has verified the live release.

    Unknown files, mounts, active references and recent unrelated candidates are
    retained and reported. Cleanup failure must never roll back a verified current
    release: some retired packages may already have been unlinked.
    """
    releases = root / 'releases'
    if releases.is_symlink() or releases.resolve() != releases or current.parent != releases:
        raise ValueError('Unexpected releases directory')
    if not shutil.rmtree.avoids_symlink_attacks:
        raise RuntimeError('Platform lacks safe directory removal')
    config_hash = file_sha256(site)
    assert_current(root, site, current, config_hash)
    if verify_release(current)['releaseID'] != current.name:
        raise ValueError('Current manifest/directory identity mismatch')
    before = shutil.disk_usage(root).free
    candidates, skipped = [], []
    for path in sorted(releases.iterdir()):
        if path == current:
            continue
        try:
            if not RELEASE_ID.fullmatch(path.name):
                raise ValueError('not a managed release name')
            if path != previous and path.stat().st_mtime > started - 3600:
                raise ValueError('recent unrelated candidate; may be uploading')
            manifest = verify_release(path)
            if manifest['releaseID'] != path.name:
                raise ValueError('manifest/directory identity mismatch')
            candidates.append(path)
        except (ValueError, OSError, KeyError, TypeError) as error:
            skipped.append({'name': path.name, 'reason': str(error)})
    references = release_references(root, candidates) if candidates else {}
    identities = {path: (path.stat().st_dev, path.stat().st_ino) for path in candidates}
    deleted = []
    for path in candidates:
        if references[path]:
            skipped.append({'name': path.name, 'reason': sorted(references[path])})
            continue
        assert_current(root, site, current, config_hash)
        if path.is_symlink() or (path.stat().st_dev, path.stat().st_ino) != identities[path]:
            raise RuntimeError('Release directory was replaced during cleanup')
        # Recheck immediately before deletion. Never follow links or cross mounts;
        # user files absent from the public manifest make verification fail closed.
        verify_release(path)
        shutil.rmtree(path)
        deleted.append(path.name)
    assert_current(root, site, current, config_hash)
    verify_release(current)
    report = {'current': current.name, 'deleted': deleted, 'skipped': skipped,
              'remaining': sorted(path.name for path in releases.iterdir()),
              'freeBytesBefore': before, 'freeBytesAfter': shutil.disk_usage(root).free,
              'completedAt': time.time()}
    reports = root / 'reports'
    if reports.is_symlink():
        raise ValueError('Reports directory must not be a symlink')
    reports.mkdir(exist_ok=True)
    output = reports / 'last-release-cleanup.json'
    if output.is_symlink():
        raise ValueError('Cleanup report must not be a symlink')
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)
    if skipped or report['remaining'] != [current.name]:
        raise RuntimeError('Release is live, but cleanup is incomplete; inspect last-release-cleanup.json')
    return report
