@echo off
rem Double-click to start BD Map. Keep this window open while the app is in use; close it to stop.
cd /d "%~dp0"
node server.js
pause
