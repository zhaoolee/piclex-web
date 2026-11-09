import hashlib
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from contextlib import ExitStack, contextmanager
import activate
import release_lifecycle as lifecycle
import release_state
from test_release_lifecycle import ReleaseFixture

MODULE=pathlib.Path(__file__).with_name('auto-update-public.py')
spec=importlib.util.spec_from_file_location('auto_update_public',MODULE)
auto=importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto)


class AutoUpdatePublicTests(unittest.TestCase):
    def test_rejects_unsafe_manifest_paths_and_downloads(self):
        info={'bytes':1,'sha256':'a'*64}
        self.assertTrue(auto.safe_file('piclex-web/library/card.json',info))
        for name in ('piclex-web/../other','piclex-web//file','piclex-web/.env','piclex-web/a?x','other/file'):
            self.assertFalse(auto.safe_file(name,info))
        with patch.object(auto,'fetch',return_value=b'{}'):
            with self.assertRaises(RuntimeError):auto.manifest_from_pages()
        files={'piclex-web/index.html':{'bytes':1,'sha256':hashlib.sha256(b'x').hexdigest()}}
        revision='a'*40
        identity=revision[:12]+'-'+hashlib.sha256(json.dumps(files,separators=(',',':')).encode()).hexdigest()[:12]
        manifest={'releaseID':identity,'sourceRevision':revision,'origin':'https://piclex.v2fy.com','files':files}
        with patch.object(auto,'fetch',return_value=json.dumps(manifest).encode()):
            self.assertEqual(auto.manifest_from_pages(),manifest)

    def test_reuses_verified_old_file_and_checks_new_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory).resolve();old=root/'old';stage=root/'stage'
            (old/'piclex-web').mkdir(parents=True);stage.mkdir(mode=0o700)
            previous=old/'piclex-web/old.txt';previous.write_bytes(b'old')
            same={'bytes':3,'sha256':hashlib.sha256(b'old').hexdigest()}
            fresh={'bytes':3,'sha256':hashlib.sha256(b'new').hexdigest()}
            (old/'release.json').write_text(json.dumps({'files':{'piclex-web/old.txt':same}}))
            required={f'piclex-web/{name}':{'bytes':1,'sha256':hashlib.sha256(b'x').hexdigest()} for name in ('index.html','source.json','library/catalog.json')}
            manifest={'releaseID':'a'*12+'-'+'b'*12,'sourceRevision':'a'*40,'origin':'https://piclex.v2fy.com','files':{'piclex-web/old.txt':same,'piclex-web/new.txt':fresh,**required}}
            def fetch(url,output=None,limit=None):output.write_bytes(b'new' if url.endswith('new.txt') else b'x')
            with patch.object(auto,'fetch',side_effect=fetch):auto.populate(stage,manifest,old)
            self.assertEqual(stage.stat().st_mode & 0o777,0o755)
            self.assertEqual((stage/'piclex-web/old.txt').stat().st_ino,previous.stat().st_ino)
            self.assertEqual((stage/'piclex-web/new.txt').read_bytes(),b'new')
            from activate import verify_release
            self.assertEqual(verify_release(stage),manifest)
            (root/'bad-stage').mkdir()
            with patch.object(auto,'fetch',side_effect=lambda url,output=None,limit=None:output.write_bytes(b'bad')):
                with self.assertRaises(RuntimeError):auto.populate(root/'bad-stage',manifest,None)

    def test_pointer_switch_retains_previous_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory).resolve();first=root/'old';second=root/'new'
            first.mkdir();second.mkdir();(root/'current').symlink_to(first)
            with patch.object(auto,'ROOT',root):auto.switch(second)
            self.assertEqual((root/'current').resolve(),second)
            self.assertTrue(first.exists())


class AutoUpdateLifecycleTests(ReleaseFixture):
    def setUp(self):
        super().setUp()
        (self.root/'incoming').mkdir()
        (self.root/'current').unlink()
        (self.root/'current').symlink_to(self.old)
        self.site.write_text(activate.patch_site(self.site.read_text()))
        os.utime(self.old,None)  # The predecessor is still inside the upload grace period.
        self.manifest=json.loads((self.new/'release.json').read_text())
        self.lock=self.base/'deployment.lock'
        self.lock.touch()
        self.context=ExitStack()
        self.addCleanup(self.context.close)
        for name,value in [('ROOT',self.root),('SITE',self.site),('LOCK_PATH',self.lock)]:
            self.context.enter_context(patch.object(auto,name,value))
        self.context.enter_context(patch.object(auto.os,'geteuid',return_value=0))
        self.context.enter_context(patch.object(auto,'patch_site',side_effect=lambda text:text))
        self.context.enter_context(patch.object(auto,'manifest_from_pages',return_value=self.manifest))
        # Download from a fixture; retain real checksums, manifests, pointer and cleanup.
        def fetch(url,output=None,limit=None):
            output.write_bytes((self.new/'piclex-web'/url.removeprefix(auto.PAGES)).read_bytes())
        self.context.enter_context(patch.object(auto,'fetch',side_effect=fetch))
        self.context.enter_context(patch.object(auto.subprocess,'run'))
        self.context.enter_context(patch('sys.argv',['auto-update-public.py']))
        self.live=self.context.enter_context(patch.object(auto,'verify_live_release'))

    def finalize(self):
        self.main_context(['--finalize-current','--apply'])
        with patch.object(activate,'verify_live_release'):
            activate.main()

    def test_cleanup_failure_records_previous_and_can_retry_immediately(self):
        with patch.object(lifecycle,'release_references',side_effect=PermissionError('process scan denied')):
            with self.assertRaisesRegex(PermissionError,'process scan denied'):
                auto.main()
        self.live.assert_called_once()
        self.assertEqual((self.root/'current').resolve(),self.new)
        self.assertTrue(self.old.exists())
        state=release_state.read_activation(self.root,self.site,self.new)
        self.assertEqual(state['previousRelease'],str(self.old))
        # No timestamp edits or grace-period wait between failure and finalizer.
        self.finalize()
        self.assertFalse(self.old.exists())
        self.assertEqual(list((self.root/'releases').iterdir()),[self.new])

    def test_recent_unrelated_upload_remains_protected_during_retry(self):
        pending=self.release('c');os.utime(pending,None)
        with patch.object(auto,'prune_old_releases',side_effect=RuntimeError('interrupted cleanup')):
            with self.assertRaisesRegex(RuntimeError,'interrupted cleanup'):auto.main()
        with self.assertRaisesRegex(RuntimeError,'cleanup is incomplete'):self.finalize()
        self.assertFalse(self.old.exists())
        self.assertTrue(pending.exists())
        report=json.loads((self.root/'reports/last-release-cleanup.json').read_text())
        self.assertIn('recent unrelated candidate',report['skipped'][0]['reason'])

    def test_predecessor_record_does_not_override_active_references_or_extra_files(self):
        with patch.object(auto,'prune_old_releases',side_effect=RuntimeError('interrupted cleanup')):
            with self.assertRaises(RuntimeError):auto.main()
        with patch.object(lifecycle,'release_references',return_value={self.old:{'open process reference'}}):
            with self.assertRaisesRegex(RuntimeError,'cleanup is incomplete'):self.finalize()
        self.assertTrue(self.old.exists())
        private=self.old/'private-photo.jpg';private.write_bytes(b'private')
        with self.assertRaisesRegex(RuntimeError,'cleanup is incomplete'):self.finalize()
        self.assertEqual(private.read_bytes(),b'private')

    def test_receipt_failure_prevents_cutover(self):
        with patch.object(release_state.os,'fsync',side_effect=OSError('disk failure')):
            with self.assertRaisesRegex(OSError,'disk failure'):auto.main()
        self.live.assert_not_called()
        self.assertEqual((self.root/'current').resolve(),self.old)
        self.assertTrue(self.old.exists())
        self.assertFalse(list((self.root/'reports').glob('.activation-*')))

    def test_receipt_is_durable_before_switch_and_survives_crash_after_switch(self):
        switch=auto.switch
        def interrupted(target):
            state=release_state.read_activation(self.root,self.site,target)
            self.assertEqual(state['previousRelease'],str(self.old))
            switch(target)
            os._exit(75)  # Abrupt exit: no Python cleanup/rollback handlers run.
        pid=os.fork()
        if pid==0:
            try:
                with patch.object(auto,'switch',side_effect=interrupted):auto.main()
            finally:os._exit(76)
        _,status=os.waitpid(pid,0)
        self.assertEqual(os.waitstatus_to_exitcode(status),75)
        self.assertEqual((self.root/'current').resolve(),self.new)
        self.finalize()
        self.assertFalse(self.old.exists())

    def test_failed_live_verification_rolls_back_and_preserves_active_receipt(self):
        third=self.release('c')
        (self.root/'current').unlink();(self.root/'current').symlink_to(third)
        release_state.record_activation(self.root,self.old,third,lifecycle.file_sha256(self.site))
        auto.switch(self.old)
        before=release_state.receipt_path(self.root,self.old).read_bytes()
        self.live.side_effect=RuntimeError('HTTPS failed')
        with self.assertRaisesRegex(RuntimeError,'HTTPS failed'):auto.main()
        self.assertEqual((self.root/'current').resolve(),self.old)
        self.assertEqual(release_state.receipt_path(self.root,self.old).read_bytes(),before)
        self.assertTrue(self.old.exists())
        self.assertTrue(self.new.exists())

    def test_first_release_failure_removes_pointer(self):
        (self.root/'current').unlink()
        self.live.side_effect=RuntimeError('HTTPS failed')
        with self.assertRaisesRegex(RuntimeError,'HTTPS failed'):auto.main()
        self.assertFalse((self.root/'current').is_symlink())

    def test_parallel_candidate_copies_delta_and_records_the_exact_cutover(self):
        previous = self.old
        source = self.new
        manifest = self.manifest
        digest = hashlib.sha256(json.dumps(manifest['files'], separators=(',', ':')).encode()).hexdigest()
        manifest['releaseID'] = manifest['sourceRevision'][:12] + '-' + digest[:12]
        # A staged bundle lives outside releases so the cleaner cannot mistake it for history.
        staged = self.root / 'incoming' / 'fixture'
        source.rename(staged)
        request = {'candidateRun': 10, 'releaseRun': 11, 'revision': manifest['sourceRevision'],
                   'previousRevision': 'a' * 40}

        @contextmanager
        def candidate(*_):
            fd = os.open(staged, os.O_DIRECTORY)
            try:
                yield manifest, fd
            finally:
                os.close(fd)

        target = self.root / 'releases' / manifest['releaseID']
        with patch.object(auto, 'read_request', return_value=request), \
                patch.object(auto, 'staged_candidate', candidate), \
                patch.object(auto, 'authorize_cutover') as authorize, \
                patch.object(auto, 'fetch', side_effect=AssertionError('Pages fallback forbidden')):
            auto.main()
        authorize.assert_called_once_with(request)
        self.assertEqual((self.root / 'current').resolve(), target)
        self.assertEqual((target / 'piclex-web/assets/main.js').read_bytes(), b'code-b')
        self.assertFalse(previous.exists())
        timing = json.loads((self.root / 'reports/parallel-timing-11.json').read_text())
        self.assertEqual(timing['request'], request)
        self.assertEqual(timing['status'], 'passed')
        self.assertEqual(set(timing['phases']), {
            'candidate', 'lock', 'previous', 'populate', 'hashes', 'isolatedNginx',
            'authorization', 'installCandidate', 'cutover', 'liveHttp', 'cleanup'})
        self.assertTrue(all(phase['seconds'] >= 0 for phase in timing['phases'].values()))

    def test_nonroot_apply_fails_before_download_or_cutover_but_check_is_allowed(self):
        with patch.object(auto.os,'geteuid',return_value=1000):
            with patch.object(auto,'manifest_from_pages') as fetch:
                with self.assertRaisesRegex(SystemExit,'Run activation as root'):auto.main()
                fetch.assert_not_called()
            with patch('sys.argv',['auto-update-public.py','--check']):auto.main()
        self.assertEqual((self.root/'current').resolve(),self.old)
        self.assertFalse((self.root/'reports').exists())
        self.live.assert_not_called()


if __name__=='__main__':unittest.main()
