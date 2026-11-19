@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0qs-vpets.ps1" %*
exit /b %ERRORLEVEL%
