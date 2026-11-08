import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from contextlib import ExitStack
from unittest.mock import patch
import activate
import release_lifecycle as lifecycle
from test_deploy import SITE


class ReleaseFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'web'
        (self.root / 'releases').mkdir(parents=True)
        self.site = self.base / 'nginx/conf.d/site.conf'
        self.site.parent.mkdir(parents=True)
        self.site.write_text(SITE)
        self.old = self.release('a')
        self.new = self.release('b')
        (self.root / 'current').symlink_to(self.new)
        self.original_config = self.site.read_bytes()
        self.refs = patch.object(lifecycle, 'release_references', side_effect=lambda root, paths: {p: set() for p in paths})
        self.refs.start()
        self.addCleanup(self.refs.stop)

    def release(self, char):
        path = self.root / 'releases' / (char * 12 + '-' + char * 12)
        path.mkdir()
        files = {}
        data = {'piclex-web/index.html': b'<script src="/piclex-web/assets/main.js"></script>',
                'piclex-web/assets/main.js': ('code-' + char).encode(),
                'piclex-web/source.json': b'{"decks":[]}',
                'piclex-web/library/catalog.json': b'[]',
                'piclex-web/subscribe/index.html': b'<link href="/piclex-web/assets/style.css">',
                'piclex-web/assets/style.css': b'body{}'}
        for name, content in data.items():
            output = path / name
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(content)
            files[name] = {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
        (path / 'release.json').write_text(json.dumps({'origin': lifecycle.ORIGIN, 'releaseID': path.name,
                                                     'sourceRevision': char * 40, 'files': files}))
        os.utime(path, (time.time() - 7200, time.time() - 7200))
        return path

    def prune(self, previous=None):
        return lifecycle.prune_old_releases(self.root, self.site, self.new, previous, time.time(), activate.verify_release)

    def main_context(self, args):
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(activate, 'ROOT', self.root))
        stack.enter_context(patch.object(activate, 'SITE', self.site))
        stack.enter_context(patch.object(activate, 'LOCK_PATH', self.base / 'deployment.lock'))
        stack.enter_context(patch.object(activate.os, 'geteuid', return_value=0))
        stack.enter_context(patch.object(activate, 'replace_file', side_effect=lambda p, data, _: p.write_bytes(data)))
        stack.enter_context(patch.object(activate.subprocess, 'run'))
        stack.enter_context(patch('sys.argv', ['activate.py', *args]))
        return stack


class ReleaseLifecycleTests(ReleaseFixture):
    def test_success_keeps_only_current_and_preserves_hard_links_and_user_data(self):
        old_file = self.old / 'piclex-web/library/catalog.json'
        new_file = self.new / 'piclex-web/library/catalog.json'
        new_file.unlink()
        os.link(old_file, new_file)
        outside = self.base / 'user-data.sqlite'
        outside.write_bytes(b'private data')
        report = self.prune(self.old)
        self.assertEqual(report['deleted'], [self.old.name])
        self.assertEqual(list((self.root / 'releases').iterdir()), [self.new])
        self.assertEqual(new_file.read_bytes(), b'[]')
        self.assertEqual(outside.read_bytes(), b'private data')
        self.assertEqual(self.site.read_bytes(), self.original_config)

    def test_unlisted_user_file_blocks_removal(self):
        user_file = self.old / 'private-photo.jpg'
        user_file.write_bytes(b'user photo')
        os.utime(self.old, (time.time() - 7200, time.time() - 7200))
        with self.assertRaisesRegex(RuntimeError, 'cleanup is incomplete'):
            self.prune()
        self.assertEqual(user_file.read_bytes(), b'user photo')
        self.assertTrue(self.old.exists())

    def test_unknown_directory_and_symlink_are_never_removed(self):
        data = self.root / 'releases/uploads'
        data.mkdir()
        (data / 'private').write_bytes(b'private')
        linked = self.root / 'releases' / ('d' * 12 + '-' + 'd' * 12)
        linked.symlink_to(data)
        with self.assertRaises(RuntimeError):
            self.prune()
        self.assertTrue(linked.is_symlink())
        self.assertEqual((data / 'private').read_bytes(), b'private')

    def test_recent_unrelated_candidate_is_retained(self):
        pending = self.release('c')
        os.utime(pending, None)
        with self.assertRaisesRegex(RuntimeError, 'cleanup is incomplete'):
            self.prune(self.old)
        self.assertTrue(pending.exists())
        self.assertFalse(self.old.exists())

    def test_recent_previous_can_be_removed_after_success(self):
        os.utime(self.old, None)
        self.prune(self.old)
        self.assertFalse(self.old.exists())

    def test_active_reference_is_retained(self):
        with patch.object(lifecycle, 'release_references', return_value={self.old: {'active service configuration'}}):
            with self.assertRaisesRegex(RuntimeError, 'cleanup is incomplete'):
                self.prune()
        self.assertTrue(self.old.exists())

    def test_bind_mount_inside_release_blocks_removal(self):
        protected = self.old / 'piclex-web/library'
        real = os.path.ismount
        with patch.object(activate.os.path, 'ismount', side_effect=lambda p: p == protected or real(p)):
            with self.assertRaisesRegex(RuntimeError, 'cleanup is incomplete'):
                self.prune()
        self.assertTrue(protected.exists())

    def test_pointer_change_stops_cleanup_before_deletion(self):
        def changed(root, paths):
            (root / 'current').unlink()
            (root / 'current').symlink_to(self.old)
            return {p: set() for p in paths}
        with patch.object(lifecycle, 'release_references', side_effect=changed):
            with self.assertRaisesRegex(RuntimeError, 'changed'):
                self.prune()
        self.assertTrue(self.old.exists())
        self.assertTrue(self.new.exists())

    def test_config_change_stops_cleanup_before_deletion(self):
        def changed(root, paths):
            self.site.write_bytes(b'changed by another publisher')
            return {p: set() for p in paths}
        with patch.object(lifecycle, 'release_references', side_effect=changed):
            with self.assertRaisesRegex(RuntimeError, 'changed'):
                self.prune()
        self.assertTrue(self.old.exists())

    def fetch(self, path, origin):
        if path == '/healthz':
            return b'{"status":"ok"}'
        return (self.new / path.lstrip('/')).read_bytes()

    def test_live_verification_checks_both_channels_and_all_entry_assets(self):
        manifest = activate.verify_release(self.new)
        with patch.object(lifecycle, 'fetch_live', side_effect=self.fetch) as fetch:
            report = lifecycle.verify_live_release(self.new, manifest)
        self.assertEqual(set(report), {'originHTTPS', 'publicHTTPS'})
        self.assertIn('piclex-web/assets/style.css', report['originHTTPS'])
        self.assertIn('piclex-web/assets/main.js', report['publicHTTPS'])
        self.assertEqual(fetch.call_count, 14)

    def test_public_checksum_failure_is_detected(self):
        def fetch(path, origin):
            return self.fetch(path, origin) if origin else b'stale CDN bytes'
        with patch.object(lifecycle, 'fetch_live', side_effect=fetch):
            with self.assertRaisesRegex(ValueError, 'publicHTTPS checksum mismatch'):
                lifecycle.verify_live_release(self.new, activate.verify_release(self.new))

    def test_health_failure_is_detected(self):
        def fetch(path, origin):
            return b'{"status":"unhealthy"}' if path == '/healthz' else self.fetch(path, origin)
        with patch.object(lifecycle, 'fetch_live', side_effect=fetch):
            with self.assertRaisesRegex(ValueError, 'health check failed'):
                lifecycle.verify_live_release(self.new, activate.verify_release(self.new))

    LIVE_PATHS = ['piclex-web/assets/main.js', 'piclex-web/assets/style.css',
                  'piclex-web/index.html', 'piclex-web/library/catalog.json',
                  'piclex-web/source.json', 'piclex-web/subscribe/index.html']

    def live_calls(self):
        calls = []
        lock = threading.Lock()
        def record(path, origin):
            with lock:
                calls.append((path, origin))
        return calls, record

    def test_every_selected_path_is_fetched_over_both_channels(self):
        calls, record = self.live_calls()
        def fetch(path, origin):
            record(path, origin)
            return self.fetch(path, origin)
        with patch.object(lifecycle, 'fetch_live', side_effect=fetch):
            report = lifecycle.verify_live_release(self.new, activate.verify_release(self.new))
        expected = {(f'/{path}', origin) for path in self.LIVE_PATHS for origin in (True, False)}
        expected |= {('/healthz', origin) for origin in (True, False)}
        self.assertEqual(len(calls), len(expected))
        self.assertEqual(set(calls), expected)
        self.assertEqual(report, {'originHTTPS': self.LIVE_PATHS, 'publicHTTPS': self.LIVE_PATHS})

    def test_damaged_resource_on_either_channel_is_rejected_after_all_requests_finish(self):
        for channel, damaged_origin in (('originHTTPS', True), ('publicHTTPS', False)):
            with self.subTest(channel=channel):
                calls, record = self.live_calls()
                def fetch(path, origin, damaged_origin=damaged_origin):
                    record(path, origin)
                    if origin == damaged_origin and path == '/piclex-web/library/catalog.json':
                        return b'corrupted'
                    return self.fetch(path, origin)
                with patch.object(lifecycle, 'fetch_live', side_effect=fetch):
                    with self.assertRaisesRegex(ValueError, f'{channel} checksum mismatch: piclex-web/library/catalog.json'):
                        lifecycle.verify_live_release(self.new, activate.verify_release(self.new))
                self.assertEqual(len(calls), 14)

    def test_health_failure_on_either_channel_is_rejected_after_all_requests_finish(self):
        for channel, unhealthy_origin in (('originHTTPS', True), ('publicHTTPS', False)):
            with self.subTest(channel=channel):
                calls, record = self.live_calls()
                def fetch(path, origin, unhealthy_origin=unhealthy_origin):
                    record(path, origin)
                    if origin == unhealthy_origin and path == '/healthz':
                        return b'{"status":"unhealthy"}'
                    return self.fetch(path, origin)
                with patch.object(lifecycle, 'fetch_live', side_effect=fetch):
                    with self.assertRaisesRegex(ValueError, f'{channel} health check failed'):
                        lifecycle.verify_live_release(self.new, activate.verify_release(self.new))
                self.assertEqual(len(calls), 14)

    def test_transport_error_propagates_and_waits_for_all_requests(self):
        calls, record = self.live_calls()
        def fetch(path, origin):
            record(path, origin)
            if origin and path == '/piclex-web/index.html':
                raise subprocess.CalledProcessError(22, ['curl'])
            time.sleep(0.05)
            return self.fetch(path, origin)
        with patch.object(lifecycle, 'fetch_live', side_effect=fetch):
            with self.assertRaises(subprocess.CalledProcessError):
                lifecycle.verify_live_release(self.new, activate.verify_release(self.new))
        self.assertEqual(len(calls), 14)

    def test_requests_run_in_bounded_parallelism(self):
        lock = threading.Lock()
        state = {'active': 0, 'peak': 0}
        def fetch(path, origin):
            with lock:
                state['active'] += 1
                state['peak'] = max(state['peak'], state['active'])
            time.sleep(0.05)
            with lock:
                state['active'] -= 1
            return self.fetch(path, origin)
        with patch.object(lifecycle, 'fetch_live', side_effect=fetch):
            lifecycle.verify_live_release(self.new, activate.verify_release(self.new))
        self.assertLessEqual(state['peak'], 6)
        self.assertGreater(state['peak'], 1)

    def test_publish_validates_before_deleting_and_only_then_reports_success(self):
        (self.root / 'current').unlink()
        (self.root / 'current').symlink_to(self.old)
        self.main_context(['--release', str(self.new), '--apply'])
        def verified(path, manifest):
            self.assertEqual((self.root / 'current').resolve(), self.new)
            self.assertTrue(self.old.exists(), 'old package must survive until live verification passes')
        with patch.object(activate, 'verify_live_release', side_effect=verified):
            activate.main()
        self.assertFalse(self.old.exists())
        self.assertEqual((self.root / 'current').resolve(), self.new)

    def test_live_verification_failure_restores_old_version_without_cleanup(self):
        (self.root / 'current').unlink()
        (self.root / 'current').symlink_to(self.old)
        self.main_context(['--release', str(self.new), '--apply'])
        with patch.object(activate, 'verify_live_release', side_effect=RuntimeError('health failed')):
            with patch.object(activate, 'prune_old_releases') as prune:
                with self.assertRaisesRegex(RuntimeError, 'health failed'):
                    activate.main()
                prune.assert_not_called()
        self.assertEqual((self.root / 'current').resolve(), self.old)
        self.assertEqual(self.site.read_bytes(), self.original_config)
        self.assertTrue(self.old.exists())

    def test_failed_cleanup_keeps_verified_new_version_and_finalize_retries(self):
        (self.root / 'current').unlink()
        (self.root / 'current').symlink_to(self.old)
        os.utime(self.old, None)
        self.main_context(['--release', str(self.new), '--apply'])
        with patch.object(activate, 'verify_live_release'):
            with patch.object(lifecycle, 'release_references', return_value={self.old: {'open process'}}):
                with self.assertRaisesRegex(RuntimeError, 'cleanup is incomplete'):
                    activate.main()
            self.assertEqual((self.root / 'current').resolve(), self.new)
            with patch('sys.argv', ['activate.py', '--finalize-current', '--apply']):
                activate.main()
        self.assertFalse(self.old.exists())

    def test_preview_never_switches_verifies_network_or_deletes(self):
        self.main_context(['--release', str(self.new)])
        with patch.object(activate, 'verify_live_release') as live, patch.object(activate, 'prune_old_releases') as prune:
            activate.main()
            live.assert_not_called()
            prune.assert_not_called()
        self.assertTrue(self.old.exists())

    def test_partial_cleanup_failure_never_rolls_back_to_deleted_package(self):
        third = self.release('c')
        (self.root / 'current').unlink()
        (self.root / 'current').symlink_to(self.old)
        self.main_context(['--release', str(self.new), '--apply'])
        remove = lifecycle.shutil.rmtree
        def fail_later(path):
            if path == third:
                raise OSError('injected removal failure')
            remove(path)
        with patch.object(activate, 'verify_live_release'), patch.object(lifecycle.shutil, 'rmtree', side_effect=fail_later) as removal:
            removal.avoids_symlink_attacks = True
            with self.assertRaisesRegex(OSError, 'injected'):
                activate.main()
        self.assertFalse(self.old.exists())
        self.assertTrue(third.exists())
        self.assertEqual((self.root / 'current').resolve(), self.new)

    def test_isolated_check_failure_never_switches_or_deletes(self):
        (self.root / 'current').unlink()
        (self.root / 'current').symlink_to(self.old)
        self.main_context(['--release', str(self.new), '--apply'])
        with patch.object(activate.subprocess, 'run', side_effect=RuntimeError('isolated check failed')):
            with self.assertRaisesRegex(RuntimeError, 'isolated'):
                activate.main()
        self.assertEqual((self.root / 'current').resolve(), self.old)
        self.assertTrue(self.old.exists())
        self.assertEqual(self.site.read_bytes(), self.original_config)

    def test_whole_host_mount_does_not_hide_concrete_container_process_references(self):
        self.refs.stop()
        process = self.base / 'processes/123'
        (process / 'fd').mkdir(parents=True)
        for leaf in ['cwd', 'root', 'exe']:
            (process / leaf).symlink_to('/dev/null')
        (process / 'fd/1').symlink_to('/host' + str(self.old / 'piclex-web/index.html'))
        (process / 'cmdline').write_bytes(b'worker')
        (process / 'maps').write_bytes(b'')
        original_iter = Path.iterdir
        def iterdir(path):
            return iter([process]) if str(path) == '/proc' else original_iter(path)
        mounts = [{'Mounts': [{'Source': '/', 'Destination': '/host', 'RW': False}]}]
        with patch.object(Path, 'iterdir', iterdir), patch.object(lifecycle.shutil, 'which', return_value='/usr/bin/docker'):
            with patch.object(lifecycle.subprocess, 'check_output', side_effect=['container-id', json.dumps(mounts)]):
                refs = lifecycle.release_references(self.root, [self.old])
            self.assertIn('open process reference', refs[self.old])
            (process / 'fd/1').unlink()
            (process / 'fd/1').symlink_to('/dev/null')
            with patch.object(lifecycle.subprocess, 'check_output', side_effect=['container-id', json.dumps(mounts)]):
                self.assertFalse(lifecycle.release_references(self.root, [self.old])[self.old])
