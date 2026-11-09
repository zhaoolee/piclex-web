from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

import verified_candidate as candidate

REVISION = 'b' * 40
PREVIOUS = 'a' * 40


def workflow(run, name):
    repo = {'full_name': candidate.REPO}
    return dict(id=run, head_branch='main', head_repository=repo, repository=repo,
                path=f'.github/workflows/{name}.yml', event='workflow_dispatch')


class ParallelCandidateTests(unittest.TestCase):
    def test_candidate_requires_exact_sha_every_gate_and_unexpired_receipts(self):
        run = dict(workflow(12, 'pages'), head_sha=REVISION, status='completed', conclusion='success')
        jobs = [dict(name=name, status='completed', conclusion='success') for name in candidate.REQUIRED]
        artifacts = [dict(name=name, id=index, expired=False) for index, name in enumerate(
            ('github-pages', 'verified-image', 'release-manifest'), 1)]
        def read(path):
            if '/jobs?' in path: return {'jobs': jobs}
            if '/artifacts?' in path: return {'artifacts': artifacts}
            return run
        self.assertEqual(candidate.candidate_artifacts(12, REVISION, read)['release-manifest']['id'], 3)
        with self.assertRaisesRegex(ValueError, 'required GitHub jobs'):
            candidate.candidate_artifacts(12, PREVIOUS, read)
        jobs[0]['conclusion'] = 'skipped'
        with self.assertRaisesRegex(ValueError, 'required GitHub jobs'):
            candidate.candidate_artifacts(12, REVISION, read)
        jobs[0]['conclusion'] = 'success'
        artifacts[1]['expired'] = True
        with self.assertRaisesRegex(ValueError, 'unexpired artifact'):
            candidate.candidate_artifacts(12, REVISION, read)

    def test_zip_manifest_is_authenticated_before_extraction(self):
        stream = BytesIO()
        with ZipFile(stream, 'w') as archive:
            archive.writestr('release.json', '{"sourceRevision":"' + REVISION + '"}')
        raw = stream.getvalue()
        entry = {'size_in_bytes': len(raw), 'digest': 'sha256:' + hashlib.sha256(raw).hexdigest()}
        self.assertEqual(candidate.read_manifest_zip(raw, entry)['sourceRevision'], REVISION)
        with self.assertRaisesRegex(ValueError, 'does not match GitHub digest'):
            candidate.read_manifest_zip(raw[:-1] + b'x', entry)

    def test_delta_checks_bytes_and_never_follows_file_or_directory_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'piclex-web').mkdir()
            item = root / 'piclex-web/index.html'
            item.write_bytes(b'good')
            expected = {'bytes': 4, 'sha256': hashlib.sha256(b'good').hexdigest()}
            fd = os.open(root, os.O_DIRECTORY)
            try:
                candidate.copy_delta(fd, 'piclex-web/index.html', root / 'ok', expected)
                self.assertEqual((root / 'ok').read_bytes(), b'good')
                item.write_bytes(b'evil')
                with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                    candidate.copy_delta(fd, 'piclex-web/index.html', root / 'bad', expected)
                item.unlink()
                item.symlink_to(root / 'ok')
                with self.assertRaises(OSError):
                    candidate.copy_delta(fd, 'piclex-web/index.html', root / 'linked', expected)
                (root / 'linked-dir').symlink_to(root / 'piclex-web')
                with self.assertRaises(OSError):
                    candidate.copy_delta(fd, 'linked-dir/index.html', root / 'linked2', expected)
            finally:
                os.close(fd)

    def test_cutover_waits_for_authorized_job_and_rejects_wrong_run_or_rollback(self):
        now = datetime(2026, 11, 9, tzinfo=timezone.utc)
        request = dict(candidateRun=12, releaseRun=13, revision=REVISION, previousRevision=PREVIOUS)
        run = dict(workflow(13, 'release'), display_title=f'Release {REVISION} candidate 12',
                   created_at=now.isoformat(), run_attempt=1, conclusion=None)
        active = []
        comparison = 'ahead'
        def read(path):
            if path.startswith('/compare/'): return {'status': comparison}
            if '/jobs?' in path: return {'jobs': active}
            return run
        def admit(_):
            active.append({'name': 'release', 'status': 'in_progress', 'conclusion': None,
                           'steps': [{'name': 'Require the exact fully verified candidate', 'conclusion': 'success'}]})
        candidate.authorize_cutover(request, read, now=lambda: now, sleep=admit)
        self.assertEqual(len(active), 1)
        run['display_title'] = f'Release {REVISION} candidate 11'
        with self.assertRaisesRegex(ValueError, 'Missing fresh'):
            candidate.authorize_cutover(request, read, now=lambda: now)
        comparison = 'behind'
        with self.assertRaisesRegex(ValueError, 'ahead of'):
            candidate.authorize_cutover(request, read, now=lambda: now)
