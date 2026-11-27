@echo off
REM build.cmd - 编译 heart-rate.cs 为独立 EXE
REM 依赖: .NET Framework 4.x（Windows 自带）+ Windows SDK WinMD（Win10+ 自带）
setlocal enabledelayedexpansion

set "HERE=%~dp0"
set "OUT=%HERE%heart-rate.exe"
set "SRC=%HERE%heart-rate.cs"

REM ---- 1. 查找 csc.exe ----
set "CSC="
if exist "%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not defined CSC (
    echo {"type":"error","message":"csc.exe not found, .NET Framework 4.x required"}
    exit /b 1
)

REM ---- 2. 查找 Windows.winmd ----
set "WINMD="
REM 优先: System32\WinMetadata（Win10 默认路径）
if exist "%SystemRoot%\System32\WinMetadata\Windows.winmd" set "WINMD=%SystemRoot%\System32\WinMetadata\Windows.winmd"

REM 兜底1: Windows Kits\10\UnionMetadata\<版本>\Windows.winmd（取最新版本）
if not defined WINMD (
    set "KITS_BASE="
    if exist "%ProgramFiles(x86)%\Windows Kits\10\UnionMetadata" set "KITS_BASE=%ProgramFiles(x86)%\Windows Kits\10\UnionMetadata"
    if not defined KITS_BASE if exist "%ProgramFiles%\Windows Kits\10\UnionMetadata" set "KITS_BASE=%ProgramFiles%\Windows Kits\10\UnionMetadata"

    if defined KITS_BASE (
        set "LATEST_WINMD="
        for /f "delims=" %%v in ('dir /b /ad "!KITS_BASE!" 2^>nul ^| sort') do (
            if exist "!KITS_BASE!\%%v\Windows.winmd" set "LATEST_WINMD=!KITS_BASE!\%%v\Windows.winmd"
        )
        if defined LATEST_WINMD set "WINMD=!LATEST_WINMD!"
    )
)

if not defined WINMD (
    echo {"type":"error","message":"Windows.winmd not found, install Windows SDK or Win10 SDK"}
    exit /b 1
)

REM ---- 3. 查找 System.Runtime.WindowsRuntime.dll ----
set "SYSWR="
if exist "%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll" set "SYSWR=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll"
if not defined SYSWR if exist "%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\System.Runtime.WindowsRuntime.dll" set "SYSWR=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\System.Runtime.WindowsRuntime.dll"

if not defined SYSWR (
    echo {"type":"error","message":"System.Runtime.WindowsRuntime.dll not found"}
    exit /b 1
)

REM ---- 4. 查找 System.Runtime.InteropServices.WindowsRuntime.dll ----
set "INTOP="
if exist "%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.InteropServices.WindowsRuntime.dll" set "INTOP=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.InteropServices.WindowsRuntime.dll"
if not defined INTOP if exist "%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\System.Runtime.InteropServices.WindowsRuntime.dll" set "INTOP=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\System.Runtime.InteropServices.WindowsRuntime.dll"

if not defined INTOP (
    echo {"type":"error","message":"System.Runtime.InteropServices.WindowsRuntime.dll not found"}
    exit /b 1
)

REM ---- 5. 编译 ----
"%CSC%" /nologo /target:exe /platform:anycpu ^
    /r:"%WINMD%" ^
    /r:"%SYSWR%" ^
    /r:"%INTOP%" ^
    /r:System.Runtime.dll ^
    /out:"%OUT%" ^
    "%SRC%"

if errorlevel 1 (
    echo {"type":"error","message":"csc.exe compilation failed"}
    exit /b 1
)

if not exist "%OUT%" (
    echo {"type":"error","message":"heart-rate.exe not produced"}
    exit /b 1
)

echo {"type":"status","message":"build OK: heart-rate.exe"}
exit /b 0
