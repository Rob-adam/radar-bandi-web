import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/push_catalog_update.sh'

class ConcurrentCatalogPublication(unittest.TestCase):
    def test_concurrent_site_change_is_preserved_in_published_catalog_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def git(cwd, *args):
                return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.STDOUT, text=True).strip()
            remote = root / 'remote.git'
            git(root, 'init', '--bare', '--initial-branch=main', str(remote))
            editor = root / 'editor'
            git(root, 'clone', str(remote), str(editor))
            for repo in [editor]:
                git(repo, 'config', 'user.name', 'Test')
                git(repo, 'config', 'user.email', 'test@example.invalid')
            (editor / 'catalog.json').write_text('old')
            (editor / 'site.txt').write_text('old')
            git(editor, 'add', '.')
            git(editor, 'commit', '-m', 'Initial')
            git(editor, 'push', 'origin', 'main')
            worker = root / 'worker'
            git(root, 'clone', str(remote), str(worker))
            git(worker, 'config', 'user.name', 'Test')
            git(worker, 'config', 'user.email', 'test@example.invalid')
            git(worker, 'checkout', '--detach')
            (worker / 'catalog.json').write_text('new catalog')
            git(worker, 'add', '.')
            git(worker, 'commit', '-m', 'Catalog collected')
            (editor / 'site.txt').write_text('new site')
            git(editor, 'add', '.')
            git(editor, 'commit', '-m', 'Concurrent site fix')
            git(editor, 'push', 'origin', 'main')
            output = root / 'output'
            subprocess.run(['bash', str(SCRIPT)], cwd=worker, env={**os.environ, 'GITHUB_OUTPUT': str(output)}, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            git(editor, 'pull', '--ff-only')
            self.assertEqual((editor / 'site.txt').read_text(), 'new site')
            self.assertEqual((editor / 'catalog.json').read_text(), 'new catalog')
            published = git(editor, 'rev-parse', 'HEAD')
            self.assertEqual(output.read_text().strip(), 'catalog_commit=' + published)
