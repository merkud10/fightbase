@echo off
set PATH=C:\Program Files\nodejs;%PATH%
if exist next-start.log del /f /q next-start.log
if exist next-start.err.log del /f /q next-start.err.log
start "fightbase-prod" /b cmd /c "npm.cmd run start 1>next-start.log 2>next-start.err.log"
timeout /t 5 /nobreak >nul
if exist next-start.log type next-start.log
if exist next-start.err.log type next-start.err.log
