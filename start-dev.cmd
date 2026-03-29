@echo off
set PATH=C:\Program Files\nodejs;%PATH%
if exist next-dev.log del /f /q next-dev.log
if exist next-dev.err.log del /f /q next-dev.err.log
start "fightbase-dev" /b cmd /c "npm.cmd run dev 1>next-dev.log 2>next-dev.err.log"
timeout /t 8 /nobreak >nul
if exist next-dev.log type next-dev.log
if exist next-dev.err.log type next-dev.err.log
