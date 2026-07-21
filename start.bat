@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:8090/"
where py >nul 2>&1 && py -3 -m http.server 8090 --bind 127.0.0.1 & goto :eof
where python >nul 2>&1 && python -m http.server 8090 --bind 127.0.0.1 & goto :eof
echo Open index.html directly if Python is missing.
pause
