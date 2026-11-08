#!/usr/bin/env python3
"""Verify the full domestic manifest without transferring its entire file."""
import argparse
import hashlib
import json
import re
import shlex
import subprocess
from pathlib import Path

REMOTE = '''import hashlib,json
from pathlib import Path
p=Path('/home/hermes/piclex-web/current')
before=p.resolve(strict=True)
manifest=json.loads((before/'release.json').read_text())
digest=hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
if p.resolve(strict=True)!=before:raise RuntimeError('Release changed during verification')
print(json.dumps({'sourceRevision':manifest['sourceRevision'],'releaseID':manifest['releaseID'],'manifestSHA256':digest}))
'''


def identity(manifest):
    return {'sourceRevision': manifest['sourceRevision'], 'releaseID': manifest['releaseID'],
            'manifestSHA256': hashlib.sha256(json.dumps(manifest, sort_keys=True,
                separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()}


def verify(manifest, revision, host, run=subprocess.check_output):
    if not re.fullmatch(r'[0-9a-f]{40}', revision) or manifest.get('sourceRevision') != revision:
        raise ValueError('Wrong expected revision')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._@-]*', host):
        raise ValueError('Invalid SSH host')
    actual = json.loads(run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host,
                            'python3 -B -c ' + shlex.quote(REMOTE)], text=True, timeout=30))
    if actual != identity(manifest):
        raise ValueError('Remote release identity or complete manifest mismatch')
    return actual


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--host', default='hermes-v2fy')
    args = parser.parse_args()
    print(json.dumps(verify(json.loads(args.manifest.read_text()), args.revision, args.host)))
