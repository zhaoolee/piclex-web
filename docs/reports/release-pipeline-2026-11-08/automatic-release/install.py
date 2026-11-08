#!/usr/bin/env python3
"""Prepare the fixed public updater; installation requires one explicit sudo action."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess

PACKAGE = Path(__file__).resolve().parent
SOURCE = Path('/home/hermes/piclex-web/deploy')
SNAPSHOT = Path('/usr/local/lib/piclex-public-updater')
UNITS = Path('/etc/systemd/system')
TMPFILES = Path('/etc/tmpfiles.d/piclex-public-updater.conf')
NAMES = ('activate.py', 'auto-update-public.py', 'check-mirror.py',
         'release_lifecycle.py', 'release_state.py')


def checked_sources(source, expected):
    if source.is_symlink() or source.resolve() != source:
        raise ValueError('Unexpected updater directory')
    if set(expected) != set(NAMES):
        raise ValueError('Unexpected updater file list')
    result = {}
    for name in NAMES:
        path = source / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('Updater must be a regular file: ' + name)
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != expected[name]:
            raise ValueError('Updater changed; review before installation: ' + name)
        compile(content, name, 'exec')
        result[name] = content
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    expected = json.loads((PACKAGE / 'source-sha256.json').read_text())
    sources = checked_sources(SOURCE, expected)
    account = pwd.getpwnam('hermes')
    if account.pw_uid == 0:
        raise ValueError('The trigger account must be unprivileged')
    templates = {name: (PACKAGE / name).read_bytes() for name in
                 ('piclex-public-updater.service', 'piclex-public-updater.path',
                  'piclex-public-updater.conf')}
    targets = [SNAPSHOT, TMPFILES, UNITS / 'piclex-public-updater.service',
               UNITS / 'piclex-public-updater.path', Path('/run/piclex-public-updater')]
    if any(path.exists() or path.is_symlink() for path in targets):
        raise ValueError('A target already exists; refusing to overwrite it')
    subprocess.run(['/usr/bin/systemd-analyze', 'verify',
                    str(PACKAGE / 'piclex-public-updater.service'),
                    str(PACKAGE / 'piclex-public-updater.path')], check=True)
    print('Verified the five unchanged updater files and systemd units.')
    print('Install a root-owned immutable updater copy, a fixed oneshot service,')
    print('and one hermes-writable request file. No sudoers change, SSH key,')
    print('Nginx reload, user-data change, or immediate deployment.')
    if not args.apply:
        print('Preview only. Explicit sudo with --apply is required to install.')
        return
    if os.geteuid() != 0:
        raise SystemExit('Installation needs explicit sudo approval')
    SNAPSHOT.mkdir(mode=0o755)
    for name, content in sources.items():
        target = SNAPSHOT / name
        target.write_bytes(content)
        target.chmod(0o644)
    for name, content in templates.items():
        target = TMPFILES if name.endswith('.conf') else UNITS / name
        with target.open('xb') as output:
            output.write(content)
        target.chmod(0o644)
    subprocess.run(['/usr/bin/systemd-tmpfiles', '--create', str(TMPFILES)], check=True)
    subprocess.run(['/usr/bin/systemctl', 'daemon-reload'], check=True)
    subprocess.run(['/usr/bin/systemctl', 'enable', '--now',
                    'piclex-public-updater.path'], check=True)
    print("Installed. Future request: printf release > /run/piclex-public-updater/request")
    print('Check completion: systemctl show piclex-public-updater.service '
          '-p ActiveState -p Result -p ExecMainStatus')


if __name__ == '__main__':
    main()
