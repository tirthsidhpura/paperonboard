"""Upload only dist/ to an existing InfinityFree htdocs directory using FTPS.

Credentials are environment variables, never repository files. No remote files
are deleted. Each upload is staged beside its destination and renamed on success.
"""
import ftplib
import argparse
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
FILE_STATE = 'deployment-file-state.json'
CHECKPOINT_FILES = 50
CURRENT_STAGE = 'starting deployment'


def stage(message):
    global CURRENT_STAGE
    CURRENT_STAGE = message
    print(message, flush=True)


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


def read_json_state(ftp, filename=JSON_STATE):
    content = bytearray()

    def receive(chunk):
        content.extend(chunk)
        if len(content) > 5 * 1024 * 1024:
            raise ValueError('Deployment state exceeds its size limit.')

    try:
        ftp.retrbinary('RETR ' + filename, receive)
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


def write_state(ftp, remote, filename, records):
    ftp.cwd(remote)
    state = json.dumps({'version': 1, 'files': records}, sort_keys=True).encode('utf-8')
    ftp.storbinary('STOR ' + filename + '.uploading', io.BytesIO(state))
    ftp.rename(filename + '.uploading', filename)


def upload_files(ftp, directory, files, remote, verbose=False):
    global CURRENT_STAGE
    stage('Reading deployment checkpoints')
    ftp.cwd(remote)
    previous_json = read_json_state(ftp)
    previous_files = read_json_state(ftp, FILE_STATE)
    previous = {**previous_json, **previous_files}
    paths = {file.relative_to(directory).as_posix() for file in files}
    current = {key: value for key, value in previous.items() if key in paths}
    current_json = {}
    uploaded = skipped = 0
    since_checkpoint = 0
    current_directory = remote
    ftp.voidcmd('TYPE I')
    print(f'Uploading {len(files)} build files; unchanged files will be skipped.', flush=True)
    for position, file in enumerate(files, 1):
        relative = file.relative_to(directory)
        CURRENT_STAGE = f'file {position}/{len(files)}: {relative.as_posix()}'
        if verbose:
            print(f'Checking {CURRENT_STAGE}', flush=True)
        parent = relative.parent.as_posix()
        target_directory = remote if parent == '.' else remote + '/' + parent
        if current_directory != target_directory:
            ftp.cwd(remote)
            for part in relative.parts[:-1]:
                try:
                    ftp.cwd(part)
                except ftplib.error_perm:
                    ftp.mkd(part)
                    ftp.cwd(part)
            current_directory = target_directory
        record = {'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'size': file.stat().st_size}
        unchanged = False
        if previous.get(relative.as_posix()) == record:
            try:
                unchanged = ftp.size(file.name) == record['size']
            except ftplib.error_perm as error:
                if not str(error).startswith('550'):
                    raise
        elif file.suffix.lower() == '.json':
            unchanged = remote_digest(ftp, file.name) == record['sha256']
        if file.suffix.lower() == '.json':
            current_json[relative.as_posix()] = record
        if unchanged:
            skipped += 1
            if verbose:
                print('  Unchanged: skipped', flush=True)
        else:
            temporary = file.name + '.uploading'
            with file.open('rb') as source:
                ftp.storbinary('STOR ' + temporary, source)
            ftp.rename(temporary, file.name)
            uploaded += 1
            if verbose:
                print('  Uploaded and renamed successfully', flush=True)
        # Never record a new hash until its final rename has succeeded.
        if current.get(relative.as_posix()) != record:
            current[relative.as_posix()] = record
            since_checkpoint += 1
        if since_checkpoint >= CHECKPOINT_FILES:
            CURRENT_STAGE = f'saving checkpoint after file {position}/{len(files)}'
            write_state(ftp, remote, FILE_STATE, current)
            current_directory = remote
            since_checkpoint = 0
        if position % 25 == 0 or position == len(files):
            print(f'Progress {position}/{len(files)}: {uploaded} uploaded, {skipped} unchanged; {relative.as_posix()}', flush=True)
    if current != previous_files:
        stage('Saving final file checkpoint')
        write_state(ftp, remote, FILE_STATE, current)
    # Retain the old JSON-only state for compatibility with earlier deployers.
    if current_json != previous_json:
        stage('Saving JSON checkpoint')
        write_state(ftp, remote, JSON_STATE, current_json)
    return uploaded, skipped


def deploy(check_only=False, verbose=False):
    required = ['FTP_HOST', 'FTP_USERNAME', 'FTP_PASSWORD', 'FTP_DIRECTORY']
    if any(not os.environ.get(key) for key in required):
        raise ValueError('Set FTP_HOST, FTP_USERNAME, FTP_PASSWORD, and FTP_DIRECTORY in GitHub Actions secrets.')
    host = checked_host(os.environ['FTP_HOST'])
    remote = checked_remote(os.environ['FTP_DIRECTORY'])
    directory = ROOT / 'dist'
    files = [] if check_only else deployment_files(directory)
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    with ftplib.FTP_TLS(context=context, timeout=60) as ftp:
        stage('Connecting to FTP host using TLS')
        connect_ftp(ftp, host)
        stage('Authenticating FTP account')
        ftp.login(os.environ['FTP_USERNAME'], os.environ['FTP_PASSWORD'])
        stage('Enabling encrypted data transfers')
        ftp.prot_p()
        ftp.set_pasv(True)
        # Require the owner-confirmed document root to already exist.
        stage('Checking confirmed document root')
        ftp.cwd(remote)
        if check_only:
            stage('FTPS login and document root checks passed. No files uploaded.')
            return
        uploaded, skipped = upload_files(ftp, directory, files, remote, verbose=verbose)
    print(f'Deployed {uploaded} static files; skipped {skipped} unchanged files. Existing unrelated remote files were not removed.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Deploy the reviewed static build over encrypted FTPS.')
    parser.add_argument('--check', action='store_true', help='Check login and the configured document root without uploading.')
    parser.add_argument('--verbose', action='store_true', help='Print each public file and its upload/skip result.')
    args = parser.parse_args()
    try:
        deploy(check_only=args.check, verbose=args.verbose)
    except Exception as error:
        print(f'Failed during {CURRENT_STAGE}.', file=sys.stderr, flush=True)
        # Do not echo remote server replies or connection details into public logs.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print(f'Deployment failed ({type(error).__name__}). Check FTP settings and server availability.', file=sys.stderr)
        sys.exit(1)
