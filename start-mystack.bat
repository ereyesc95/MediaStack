@echo off
REM Double-click to start/restart MyStack (API + Vite UI).
REM Closes prior MyStack consoles; prefers one Windows Terminal window with two tabs.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mystack.ps1"
if errorlevel 1 pause
