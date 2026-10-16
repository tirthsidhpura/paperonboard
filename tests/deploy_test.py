import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('deployment', ROOT / 'scripts/deploy.py')
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class DeploymentTests(unittest.TestCase):
    def test_requires_confirmed_document_root(self):
        self.assertEqual(deployment.checked_remote('/paperonboard.in/htdocs/'), '/paperonboard.in/htdocs')
        self.assertEqual(deployment.checked_remote('/htdocs'), '/htdocs')
        for path in ('/', '/paperonboard.in', 'htdocs', '/htdocs/../other/htdocs', '/htdocs\n', '/htdocs\\'):
            with self.assertRaises(ValueError):
                deployment.checked_remote(path)

    def test_only_build_files_and_entry_page_last(self):
        files = deployment.deployment_files(ROOT / 'dist')
        self.assertEqual(files[-1].name, 'index.html')
        self.assertFalse(any('legacy-private' in str(file) or file.suffix == '.php' for file in files))
        with self.assertRaises(ValueError):
            deployment.deployment_files(ROOT)


if __name__ == '__main__':
    unittest.main()
