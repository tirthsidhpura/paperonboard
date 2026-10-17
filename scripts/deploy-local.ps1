param([switch]$Configure, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$localDirectory = Join-Path $root '.local'
$credentialFile = Join-Path $localDirectory 'deploy-credential.clixml'
New-Item -ItemType Directory -Path $localDirectory -Force | Out-Null
$logFile = Join-Path $localDirectory ('deploy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$stage = 'Setup'

function Status([string]$Message) {
    $line = '[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $Message
    Write-Host $line
    Add-Content -LiteralPath $logFile -Value $line
}

function Find-Program([string]$Name, [string[]]$Candidates) {
    foreach ($candidate in $Candidates) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    throw ('Required program not found: ' + $Name)
}

function Run-Step([string]$Label, [string]$Program, [string[]]$Arguments) {
    $script:stage = $Label
    Status $Label
    # Windows PowerShell wraps native stderr as error records, even for passing tests.
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Program @Arguments 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Host
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($code -ne 0) { throw ('Step failed with exit code ' + $code) }
}

Push-Location $root
try {
    if ($env:OS -ne 'Windows_NT') { throw 'This encrypted launcher requires Windows.' }
    $python = Find-Program 'python.exe' @((Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'))
    $node = Find-Program 'node.exe' @('C:\Program Files\nodejs\node.exe')
    $git = Find-Program 'git.exe' @('C:\Program Files\Git\cmd\git.exe', (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'))
    $env:GIT_BIN = $git
    $saved = if (Test-Path -LiteralPath $credentialFile) { Import-Clixml -LiteralPath $credentialFile } else { $null }
    if ($Configure -or -not $saved -or -not $saved.Directory) {
        $stage = 'Save encrypted FTP settings'
        $defaultHost = if ($saved) { $saved.Hostname } else { 'ftpupload.net' }
        $hostname = Read-Host ('FTP hostname (Enter for ' + $defaultHost + ')')
        if (-not $hostname) { $hostname = $defaultHost }
        $username = Read-Host 'FTP username (Enter to keep saved username, if any)'
        if (-not $username -and $saved) { $username = $saved.Credential.UserName }
        $password = Read-Host 'FTP password (hidden)' -AsSecureString
        $directory = Read-Host 'Confirmed domain FTP directory, such as /htdocs'
        if (-not $directory) { throw 'The domain document root must be set before upload.' }
        $settings = [pscustomobject]@{ Hostname = $hostname; Directory = $directory; Credential = [System.Management.Automation.PSCredential]::new($username, $password) }
        $settings | Export-Clixml -LiteralPath $credentialFile
        $acl = Get-Acl -LiteralPath $credentialFile
        $acl.SetAccessRuleProtection($true, $false)
        $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl.SetAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow'))
        Set-Acl -LiteralPath $credentialFile -AclObject $acl
        Status 'FTP credential encrypted for this Windows account and saved under ignored .local/.'
    }
    $stage = 'Read encrypted FTP settings'
    $settings = Import-Clixml -LiteralPath $credentialFile
    if (-not $settings.Directory) { throw 'Document root is not configured. Run the launcher with -Configure.' }
    Status ('Log: ' + $logFile)
    Status 'Credentials are never printed. All uploads use encrypted FTPS.'
    if ($CheckOnly) {
        $env:FTP_HOST = $settings.Hostname
        $env:FTP_USERNAME = $settings.Credential.UserName
        $env:FTP_PASSWORD = $settings.Credential.GetNetworkCredential().Password
        $env:FTP_DIRECTORY = $settings.Directory
        Run-Step 'Check FTPS connection and confirmed document root (no uploads)' $python @('-u', 'scripts/deploy.py', '--check')
    } else {
        $env:FTP_HOST = $settings.Hostname
        $env:FTP_USERNAME = $settings.Credential.UserName
        $env:FTP_PASSWORD = $settings.Credential.GetNetworkCredential().Password
        $env:FTP_DIRECTORY = $settings.Directory
        Run-Step 'Check FTPS login and document root before building' $python @('-u', 'scripts/deploy.py', '--check')
        foreach ($key in @('FTP_HOST', 'FTP_USERNAME', 'FTP_PASSWORD', 'FTP_DIRECTORY')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
        Run-Step 'Check files for accidental secrets' $node @('scripts/check-public.mjs')
        Run-Step 'Build website' $node @('scripts/build.mjs')
        $tests = @(Get-ChildItem -LiteralPath (Join-Path $root 'tests') -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
        Run-Step 'Test website' $node (@('--test') + $tests)
        Run-Step 'Test deployment and data tools' $python @('-m', 'unittest', 'discover', '-s', 'tests', '-p', '*_test.py')
        $env:FTP_HOST = $settings.Hostname
        $env:FTP_USERNAME = $settings.Credential.UserName
        $env:FTP_PASSWORD = $settings.Credential.GetNetworkCredential().Password
        $env:FTP_DIRECTORY = $settings.Directory
        Run-Step 'Upload changed files to InfinityFree' $python @('-u', 'scripts/deploy.py', '--verbose')
    }
    Status 'SUCCESS: all requested steps completed.'
    exit 0
} catch {
    Status ('FAILED at: ' + $stage)
    Status ('Reason: ' + $_.Exception.Message)
    # Print only the controlled step error; never serialize settings or environment values.
    Status 'See the preceding output for the failing file or operation. Use -Configure to replace saved FTP settings.'
    Status ('Log saved: ' + $logFile)
    exit 1
} finally {
    foreach ($key in @('FTP_HOST', 'FTP_USERNAME', 'FTP_PASSWORD', 'FTP_DIRECTORY', 'GIT_BIN')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
    $settings = $null
    $saved = $null
    $password = $null
    Pop-Location
}
