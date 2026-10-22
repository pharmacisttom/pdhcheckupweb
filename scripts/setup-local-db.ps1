$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mysqlRoot = Join-Path $taskRoot '.local\mysql\mysql-8.4.13-winx64'
$dataPath = Join-Path $taskRoot '.local\mysql-data'
$serverPath = Join-Path $mysqlRoot 'bin\mysqld.exe'
if (!(Test-Path -LiteralPath $serverPath)) { throw 'Download and extract the official MySQL portable distribution first.' }
if (Test-Path -LiteralPath $dataPath) { throw 'Refusing to initialize an existing data directory.' }
New-Item -ItemType Directory -Path $dataPath | Out-Null
function New-TaskSecret { $bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); return -join ($bytes | ForEach-Object { $_.ToString('x2') }) }
$rootPassword = New-TaskSecret
$appPassword = New-TaskSecret
$adminPassword = New-TaskSecret
$initPath = Join-Path $taskRoot '.local\mysql-init.sql'
$initSql = "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';`nCREATE DATABASE pdh_healthcheck CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`nCREATE DATABASE pdh_healthcheck_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`nCREATE USER 'pdh_dev'@'localhost' IDENTIFIED BY '$appPassword';`nGRANT ALL PRIVILEGES ON pdh_healthcheck.* TO 'pdh_dev'@'localhost';`nGRANT ALL PRIVILEGES ON pdh_healthcheck_test.* TO 'pdh_dev'@'localhost';"
[System.IO.File]::WriteAllText($initPath, $initSql)
& $serverPath --no-defaults --initialize-insecure "--basedir=$mysqlRoot" "--datadir=$dataPath" --console
if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed.' }
$logPath = Join-Path $taskRoot '.local\mysql-error.log'
$pidPath = Join-Path $taskRoot '.local\mysql.pid'
Start-Process -FilePath $serverPath -WindowStyle Hidden -ArgumentList @('--no-defaults', "--basedir=$mysqlRoot", "--datadir=$dataPath", '--bind-address=127.0.0.1', '--port=3308', '--mysqlx=0', "--init-file=$initPath", "--log-error=$logPath", "--pid-file=$pidPath")
$envPath = Join-Path $taskRoot '.env'
if (Test-Path -LiteralPath $envPath) { throw 'Refusing to overwrite .env.' }
$envText = "DATABASE_URL=`"mysql://pdh_dev:$appPassword@127.0.0.1:3308/pdh_healthcheck`"`nAPP_URL=`"http://localhost:3036`"`nDATA_ENCRYPTION_KEY=`"$(New-TaskSecret)`"`nOTP_PEPPER=`"$(New-TaskSecret)`"`nOTP_PROVIDER=`"test`"`nSEED_DEMO=`"true`"`nSEED_ADMIN_EMAIL=`"admin@pdh.test`"`nSEED_ADMIN_PASSWORD=`"$adminPassword`"`n"
[System.IO.File]::WriteAllText($envPath, $envText)
$rootConfig = "[client]`nuser=root`npassword=$rootPassword`nhost=127.0.0.1`nport=3308`n"
[System.IO.File]::WriteAllText((Join-Path $taskRoot '.local\mysql-root.cnf'), $rootConfig)
Write-Output 'Isolated development MySQL started on loopback port 3308. Credentials saved only in ignored .env and .local files. Delete the initialization SQL after verifying readiness.'
