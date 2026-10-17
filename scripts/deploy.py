"""Upload only dist/ to an existing InfinityFree htdocs directory using FTPS.

Credentials are environment variables, never repository files. No remote files
are deleted. Each upload is staged beside its destination and renamed on success.
"""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import socket
import ssl
import sys

ROOT = Path(__file__).resolve().parents[1]
JSON_STATE = 'deployment-json-state.json'


def checked_host(value):
    host = value.strip()
    labels = host.rstrip('.').split('.')
    if (len(host) > 253 or not host or
            any(not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', label) for label in labels)):
        raise ValueError('FTP_HOST must contain only the FTP hostname from InfinityFree, such as ftpupload.net. Remove ftp://, ftps://, https://, port numbers, paths, and quotes.')
    return host


def connect_ftp(ftp, host):
    try:
        ftp.connect(host, 21)
    except socket.gaierror:
        raise ValueError('Cannot resolve FTP_HOST (DNS lookup failed before login). Check the FTP_HOST GitHub secret against your InfinityFree FTP details. Use only the hostname, typically ftpupload.net. If it is correct, rerun the job to rule out a temporary DNS failure.') from None


def checked_remote(value):
    remote = PurePosixPath(value)
    if not value.startswith('/') or '..' in remote.parts or '\\' in value or any(ord(c) < 32 for c in value):
        raise ValueError('FTP_DIRECTORY must be an absolute FTP path without traversal.')
    if remote.name != 'htdocs':
        raise ValueError('FTP_DIRECTORY must end in /htdocs; use the exact domain directory from InfinityFree.')
    return str(remote)


def deployment_files(directory):
    directory = directory.resolve()
    if directory != ROOT / 'dist' or not (directory / 'index.html').is_file():
        raise ValueError('Build dist/ before deploying.')
    files = []
    for file in directory.rglob('*'):
        if file.is_symlink():
            raise ValueError('Deployment cannot contain symlinks.')
        if file.is_file():
            relative = file.relative_to(directory)
            if any(part.startswith('.') for part in relative.parts) or (relative.as_posix() not in {'ads.txt', 'robots.txt', 'llms.txt', 'sitemap.xml'} and file.suffix.lower() not in {'.html', '.css', '.js', '.json', '.svg', '.gif', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.md'}):
                raise ValueError('Unexpected file type in build output.')
            files.append(file)
    # The entry page goes last so new dependencies exist before it is replaced.
    return sorted(files, key=lambda file: (file.name == 'index.html', file.as_posix()))


def remote_digest(ftp, filename):
    digest = hashlib.sha256()
    try:
        ftp.retrbinary('RETR ' + filename, digest.update)
    except ftplib.error_perm as error:
        if str(error).startswith('550'):
            return None
        raise
    return digest.hexdigest()


def read_json_state(ftp):
    content = bytearray()

    def receive(chunk):
        content.extend(chunk)
        if len(content) > 1024 * 1024:
            raise ValueError('Deployment JSON state exceeds its size limit.')

    try:
        ftp.retrbinary('RETR ' + JSON_STATE, receive)
    except ftplib.error_perm as error:
        if str(error).startswith('550'):
            return {}
        raise
    try:
        state = json.loads(content)
        if state.get('version') == 1 and isinstance(state.get('files'), dict):
            return state['files']
    except (ValueError, AttributeError):
        pass
    # Existing JSON is compared directly when no usable deployment state exists.
    return {}


def upload_files(ftp, directory, files, remote):
    ftp.cwd(remote)
    previous = read_json_state(ftp)
    current = {}
    uploaded = skipped = 0
    ftp.voidcmd('TYPE I')
    for file in files:
        relative = file.relative_to(directory)
        ftp.cwd(remote)
        for part in relative.parts[:-1]:
            try:
                ftp.cwd(part)
            except ftplib.error_perm:
                ftp.mkd(part)
                ftp.cwd(part)
        if file.suffix.lower() == '.json':
            record = {'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'size': file.stat().st_size}
            current[relative.as_posix()] = record
            unchanged = False
            if previous.get(relative.as_posix()) == record:
                try:
                    unchanged = ftp.size(file.name) == record['size']
                except ftplib.error_perm as error:
                    if not str(error).startswith('550'):
                        raise
            else:
                unchanged = remote_digest(ftp, file.name) == record['sha256']
            if unchanged:
                skipped += 1
                continue
        temporary = file.name + '.uploading'
        with file.open('rb') as source:
            ftp.storbinary('STOR ' + temporary, source)
        ftp.rename(temporary, file.name)
        uploaded += 1
    # Commit hashes only after every file succeeds. An interrupted run cannot
    # incorrectly mark a JSON file as deployed, and retries can compare its bytes.
    if current != previous:
        ftp.cwd(remote)
        state = json.dumps({'version': 1, 'files': current}, sort_keys=True).encode('utf-8')
        ftp.storbinary('STOR ' + JSON_STATE + '.uploading', io.BytesIO(state))
        ftp.rename(JSON_STATE + '.uploading', JSON_STATE)
    return uploaded, skipped


def deploy():
    required = ['FTP_HOST', 'FTP_USERNAME', 'FTP_PASSWORD', 'FTP_DIRECTORY']
    if any(not os.environ.get(key) for key in required):
        raise ValueError('Set FTP_HOST, FTP_USERNAME, FTP_PASSWORD, and FTP_DIRECTORY in GitHub Actions secrets.')
    host = checked_host(os.environ['FTP_HOST'])
    remote = checked_remote(os.environ['FTP_DIRECTORY'])
    directory = ROOT / 'dist'
    files = deployment_files(directory)
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    with ftplib.FTP_TLS(context=context, timeout=60) as ftp:
        connect_ftp(ftp, host)
        ftp.login(os.environ['FTP_USERNAME'], os.environ['FTP_PASSWORD'])
        ftp.prot_p()
        ftp.set_pasv(True)
        # Require the owner-confirmed document root to already exist.
        ftp.cwd(remote)
        uploaded, skipped = upload_files(ftp, directory, files, remote)
    print(f'Deployed {uploaded} static files; skipped {skipped} unchanged JSON files. Existing unrelated remote files were not removed.')


if __name__ == '__main__':
    try:
        deploy()
    except Exception as error:
        # Do not echo remote server replies or connection details into public logs.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print(f'Deployment failed ({type(error).__name__}). Check FTP settings and server availability.', file=sys.stderr)
        sys.exit(1)
