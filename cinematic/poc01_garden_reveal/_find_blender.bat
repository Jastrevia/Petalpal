@echo off
rem Locates blender.exe. Set BLENDER yourself to override, e.g.  set BLENDER=D:\Apps\Blender 5.2\blender.exe
if defined BLENDER if exist "%BLENDER%" goto :eof
set "BLENDER="
for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender*") do if exist "%%~D\blender.exe" set "BLENDER=%%~D\blender.exe"
if not defined BLENDER for /f "delims=" %%B in ('where blender 2^>nul') do if not defined BLENDER set "BLENDER=%%B"
if not defined BLENDER (
  echo Could not find blender.exe. Install Blender 5.2 LTS, or run:  set BLENDER=C:\path\to\blender.exe
  exit /b 1
)
echo Using %BLENDER%
