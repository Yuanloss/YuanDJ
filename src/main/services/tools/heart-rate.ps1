# heart-rate.ps1 - 入口脚本
# 检测/编译 heart-rate.exe 并调用，透传 stdout 给 server.ts
# 不再有 paired device fallback（旧版本的问题根源）
param(
    [string]$Action = "scan",
    [string]$DeviceId = "",
    # exe 输出目录：生产环境传 app.getPath('userData')，因为 Program Files 是只读的
    # 留空时回退到脚本同目录（开发模式）
    [string]$ExeDir = ""
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here 'heart-rate.cs'
# exe 路径：优先 ExeDir 参数（生产环境），否则脚本同目录（开发环境）
if ($ExeDir) {
    if (-not (Test-Path $ExeDir)) { New-Item -ItemType Directory -Path $ExeDir -Force | Out-Null }
    $exe = Join-Path $ExeDir 'heart-rate.exe'
} else {
    $exe = Join-Path $here 'heart-rate.exe'
}

function Write-Json {
    param([hashtable]$Data)
    try { [Console]::WriteLine((ConvertTo-Json -Compress $Data)) }
    catch { [Console]::WriteLine("{""type"":""error"",""message"":""$($_.Exception.Message -replace '"','\"')""}") }
}

function Find-Csc {
    $paths = @(
        "$env:SystemRoot\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "$env:SystemRoot\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )
    foreach ($p in $paths) { if (Test-Path $p) { return $p } }
    return $null
}

function Find-Winmd {
    # 优先 System32\WinMetadata（Win10+ 自带）
    $p = "$env:SystemRoot\System32\WinMetadata\Windows.winmd"
    if (Test-Path $p) { return $p }

    # 兜底: Windows Kits\10\UnionMetadata\<版本>\Windows.winmd（取最新版本）
    $kitsRoots = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\UnionMetadata",
        "$env:ProgramFiles\Windows Kits\10\UnionMetadata"
    )
    foreach ($root in $kitsRoots) {
        if (-not (Test-Path $root)) { continue }
        $latest = $null
        # 只接受数字版本目录（10.0.x.x），排除 Facade 等非版本目录
        $dirs = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
            Sort-Object Name -Descending
        foreach ($d in $dirs) {
            $candidate = Join-Path $d.FullName 'Windows.winmd'
            if (Test-Path $candidate) { $latest = $candidate; break }
        }
        if ($latest) { return $latest }
    }
    return $null
}

function Find-DotNetAssembly {
    param([string]$Name)
    $paths = @(
        "$env:SystemRoot\Microsoft.NET\Framework64\v4.0.30319\$Name",
        "$env:SystemRoot\Microsoft.NET\Framework\v4.0.30319\$Name"
    )
    foreach ($p in $paths) { if (Test-Path $p) { return $p } }
    return $null
}

function Stop-StaleHeartRateProcess {
    # 旧的心率监测进程会锁住 exe，导致 csc 覆盖输出失败（CS0016）
    try {
        Get-Process -Name 'heart-rate' -ErrorAction SilentlyContinue | ForEach-Object {
            try { $_.Kill() } catch { }
        }
        Start-Sleep -Milliseconds 500
    } catch { }
}

function Build-Exe {
    if (-not (Test-Path $src)) {
        Write-Json @{ type = 'error'; message = "heart-rate.cs source not found at $src" }
        exit 1
    }

    $csc = Find-Csc
    if (-not $csc) {
        Write-Json @{ type = 'error'; message = 'csc.exe not found, .NET Framework 4.x required' }
        exit 1
    }

    $winmd = Find-Winmd
    if (-not $winmd) {
        Write-Json @{ type = 'error'; message = 'Windows.winmd not found, install Windows 10 SDK' }
        exit 1
    }

    $syswr = Find-DotNetAssembly 'System.Runtime.WindowsRuntime.dll'
    if (-not $syswr) {
        Write-Json @{ type = 'error'; message = 'System.Runtime.WindowsRuntime.dll not found' }
        exit 1
    }

    $interop = Find-DotNetAssembly 'System.Runtime.InteropServices.WindowsRuntime.dll'
    if (-not $interop) {
        Write-Json @{ type = 'error'; message = 'System.Runtime.InteropServices.WindowsRuntime.dll not found' }
        exit 1
    }

    Write-Json @{ type = 'status'; message = 'compiling heart-rate.exe...' }

    $args = @(
        '/nologo', '/target:exe', '/platform:anycpu',
        "/r:$winmd",
        "/r:$syswr",
        "/r:$interop",
        '/r:System.Runtime.dll',
        "/out:$exe",
        $src
    )

    # 编译前先清理残留进程（它锁着 old exe）
    Stop-StaleHeartRateProcess

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $cscLog = & $csc @args 2>&1 | Out-String
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        # 可能是 exe 被占用：再清一次进程后重试
        Stop-StaleHeartRateProcess
        try { if (Test-Path $exe) { Remove-Item $exe -Force -ErrorAction SilentlyContinue } } catch { }
        $cscLog = & $csc @args 2>&1 | Out-String
        $code = $LASTEXITCODE
    }
    $ErrorActionPreference = $prevEap

    if ($code -ne 0) {
        $detail = ($cscLog -replace '\s+', ' ').Trim()
        if ($detail.Length -gt 280) { $detail = $detail.Substring(0, 280) }
        Write-Json @{ type = 'error'; message = "csc.exe compilation failed (exit $code): $detail" }
        exit 1
    }
    if (-not (Test-Path $exe)) {
        Write-Json @{ type = 'error'; message = 'heart-rate.exe not produced' }
        exit 1
    }

    Write-Json @{ type = 'status'; message = 'build OK: heart-rate.exe' }
}

# 自动编译：EXE 不存在或源码比 EXE 新时触发
function Ensure-Exe {
    $needBuild = $false
    if (-not (Test-Path $exe)) {
        $needBuild = $true
    } elseif ((Get-Item $src).LastWriteTime -gt (Get-Item $exe).LastWriteTime) {
        $needBuild = $true
    }
    if ($needBuild) { Build-Exe }
}

Ensure-Exe

# 单实例：清掉可能残留的旧 exe。孤儿进程会一直占着蓝牙链路，
# 导致这次连接始终 AccessDenied（设备被占用）
Stop-StaleHeartRateProcess

# 调用 EXE 并透传参数
# C# Console.WriteLine 是行缓冲，stdout 直接转发
try {
    if ($Action -eq 'monitor') {
        & $exe monitor $DeviceId
    } elseif ($Action -eq 'scan') {
        & $exe scan
    } else {
        Write-Json @{ type = 'error'; message = "unknown action: $Action" }
        exit 1
    }
} catch {
    Write-Json @{ type = 'error'; message = $_.Exception.Message }
    exit 1
}
