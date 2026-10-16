import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock
import socket

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('deployment', ROOT / 'scripts/deploy.py')
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class DeploymentTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
