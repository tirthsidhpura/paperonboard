import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import socket
import ftplib
import json
import tempfile


class MemoryFTP:
    def __init__(self):
        self.files = {}
        self.directory = '/htdocs'
        self.uploads = []
        self.downloads = []
        self.fail_on = None

    def cwd(self, directory):
        self.directory = directory if directory.startswith('/') else self.directory + '/' + directory

    def voidcmd(self, _command):
        pass

    def retrbinary(self, command, receive):
        filename = self.directory + '/' + command.removeprefix('RETR ')
        self.downloads.append(filename)
        if filename not in self.files:
            raise ftplib.error_perm('550 Missing file')
        receive(self.files[filename])

    def size(self, filename):
        key = self.directory + '/' + filename
        if key not in self.files:
            raise ftplib.error_perm('550 Missing file')
        return len(self.files[key])

    def storbinary(self, command, source):
        key = self.directory + '/' + command.removeprefix('STOR ')
        if key == self.fail_on:
            raise ConnectionError('Interrupted transfer')
        self.uploads.append(key)
        self.files[key] = source.read()

    def rename(self, temporary, target):
        self.files[self.directory + '/' + target] = self.files.pop(self.directory + '/' + temporary)

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('deployment', ROOT / 'scripts/deploy.py')
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class DeploymentTests(unittest.TestCase):
    def test_check_only_validates_login_and_root_without_build_or_upload(self):
        environment = {'FTP_HOST': 'ftpupload.net', 'FTP_USERNAME': 'test-user', 'FTP_PASSWORD': 'test-only-value', 'FTP_DIRECTORY': '/htdocs'}
        with patch.dict(deployment.os.environ, environment), patch.object(deployment.ftplib, 'FTP_TLS') as connection, patch.object(deployment, 'deployment_files') as files:
            ftp = connection.return_value.__enter__.return_value
            deployment.deploy(check_only=True)
            ftp.login.assert_called_once_with('test-user', 'test-only-value')
            ftp.cwd.assert_called_with('/htdocs')
            ftp.storbinary.assert_not_called()
            files.assert_not_called()

    def test_ftp_hostname_is_normalized_without_modifying_passwords(self):
        self.assertEqual(deployment.checked_host(' ftpupload.net\r\n'), 'ftpupload.net')
        for value in ('ftp://ftpupload.net', 'ftps://ftpupload.net', 'ftpupload.net:21', 'ftpupload.net/htdocs', '"ftpupload.net"', 'ftp host', '', '-bad.net'):
            with self.assertRaises(ValueError):
                deployment.checked_host(value)

    def test_dns_failure_is_actionable_without_exposing_connection_values(self):
        ftp = Mock()
        ftp.connect.side_effect = socket.gaierror('private-host-value')
        with self.assertRaises(ValueError) as error:
            deployment.connect_ftp(ftp, 'private-host-value')
        self.assertIn('DNS lookup failed before login', str(error.exception))
        self.assertNotIn('private-host-value', str(error.exception))
        ftp.login.assert_not_called()

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

    def test_json_content_comparison_then_cached_hashes_skip_unchanged_uploads(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / 'data').mkdir()
            catalog = directory / 'data/catalog.json'
            catalog.write_bytes(b'{"value":1}')
            html = directory / 'index.html'
            html.write_text('Home')
            ftp = MemoryFTP()
            ftp.files['/htdocs/data/catalog.json'] = catalog.read_bytes()
            self.assertEqual(deployment.upload_files(ftp, directory, [catalog, html], '/htdocs'), (1, 1))
            self.assertNotIn('/htdocs/data/catalog.json.uploading', ftp.uploads)
            state = json.loads(ftp.files['/htdocs/' + deployment.JSON_STATE])
            self.assertIn('data/catalog.json', state['files'])
            ftp.uploads.clear()
            ftp.downloads.clear()
            self.assertEqual(deployment.upload_files(ftp, directory, [catalog, html], '/htdocs'), (0, 2))
            self.assertEqual(ftp.uploads, [])
            self.assertEqual(ftp.downloads, ['/htdocs/' + deployment.JSON_STATE, '/htdocs/' + deployment.FILE_STATE])
            # A same-size edit still changes the content hash and is uploaded.
            catalog.write_bytes(b'{"value":2}')
            self.assertEqual(deployment.upload_files(ftp, directory, [catalog, html], '/htdocs'), (1, 1))
            self.assertEqual(ftp.files['/htdocs/data/catalog.json'], b'{"value":2}')
            # A deleted remote JSON is restored despite a matching state record.
            del ftp.files['/htdocs/data/catalog.json']
            self.assertEqual(deployment.upload_files(ftp, directory, [catalog, html], '/htdocs'), (1, 1))

    def test_interrupted_upload_does_not_commit_json_state_and_retry_skips_completed_json(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            catalog = directory / 'catalog.json'
            catalog.write_bytes(b'{"value":1}')
            html = directory / 'index.html'
            html.write_text('Home')
            ftp = MemoryFTP()
            deployment.upload_files(ftp, directory, [catalog, html], '/htdocs')
            previous = ftp.files['/htdocs/' + deployment.JSON_STATE]
            catalog.write_bytes(b'{"value":2}')
            html.write_text('Updated home')
            ftp.fail_on = '/htdocs/index.html.uploading'
            with self.assertRaises(ConnectionError):
                deployment.upload_files(ftp, directory, [catalog, html], '/htdocs')
            self.assertEqual(ftp.files['/htdocs/' + deployment.JSON_STATE], previous)
            ftp.fail_on = None
            ftp.uploads.clear()
            self.assertEqual(deployment.upload_files(ftp, directory, [catalog, html], '/htdocs'), (1, 1))
            self.assertNotIn('/htdocs/catalog.json.uploading', ftp.uploads)

    def test_invalid_json_state_compares_actual_remote_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            catalog = directory / 'catalog.json'
            catalog.write_bytes(b'[]')
            ftp = MemoryFTP()
            ftp.files['/htdocs/' + deployment.JSON_STATE] = b'invalid'
            ftp.files['/htdocs/catalog.json'] = b'[]'
            self.assertEqual(deployment.upload_files(ftp, directory, [catalog], '/htdocs'), (0, 1))
            self.assertEqual(json.loads(ftp.files['/htdocs/' + deployment.JSON_STATE])['version'], 1)

    def test_partial_html_upload_resumes_after_a_completed_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            files = []
            for index in range(55):
                file = directory / f'page-{index:03}.html'
                file.write_text(f'Page {index}')
                files.append(file)
            ftp = MemoryFTP()
            ftp.fail_on = '/htdocs/page-052.html.uploading'
            with self.assertRaises(ConnectionError):
                deployment.upload_files(ftp, directory, files, '/htdocs')
            state = json.loads(ftp.files['/htdocs/' + deployment.FILE_STATE])['files']
            self.assertEqual(len(state), deployment.CHECKPOINT_FILES)
            self.assertNotIn('page-052.html', state)
            ftp.fail_on = None
            ftp.uploads.clear()
            self.assertEqual(deployment.upload_files(ftp, directory, files, '/htdocs'), (5, 50))
            self.assertNotIn('/htdocs/page-000.html.uploading', ftp.uploads)
            self.assertEqual(len(json.loads(ftp.files['/htdocs/' + deployment.FILE_STATE])['files']), 55)


if __name__ == '__main__':
    unittest.main()
