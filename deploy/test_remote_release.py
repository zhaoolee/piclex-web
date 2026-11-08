import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('remote_release', Path(__file__).with_name('verify-remote-release.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RemoteReleaseTests(unittest.TestCase):
    def setUp(self):
        self.revision = 'a' * 40
        self.manifest = {'sourceRevision': self.revision, 'releaseID': 'test-release',
                         'files': {'piclex-web/index.html': {'sha256': 'expected', 'bytes': 42}}}

    def test_checks_complete_manifest_and_only_receives_digest(self):
        expected = module.identity(self.manifest)
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return json.dumps(expected)
        self.assertEqual(module.verify(self.manifest, self.revision, 'hermes-v2fy', run), expected)
        self.assertEqual(calls[0][:5], ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'])

    def test_any_changed_resource_or_revision_is_rejected(self):
        for change in ['sha256', 'bytes', 'sourceRevision', 'releaseID']:
            other = json.loads(json.dumps(self.manifest))
            if change in ['sha256', 'bytes']:
                other['files']['piclex-web/index.html'][change] = 'changed'
            else:
                other[change] = 'changed'
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                module.verify(self.manifest, self.revision, 'hermes-v2fy', lambda *a, **kw: json.dumps(module.identity(other)))

    def test_bad_identity_or_host_never_connects(self):
        def run(*args, **kwargs):
            self.fail('Should not connect')
        for revision, host in [('b' * 40, 'hermes-v2fy'), ('invalid', 'hermes-v2fy'), (self.revision, '-oProxyCommand=bad')]:
            with self.assertRaises(ValueError):
                module.verify(self.manifest, revision, host, run)

    def test_canonical_digest_ignores_only_object_order(self):
        reversed_manifest = dict(reversed(list(self.manifest.items())))
        self.assertEqual(module.identity(self.manifest), module.identity(reversed_manifest))
