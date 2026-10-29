@echo off
title Kumon Onpoint
echo ========================================================
echo   Iniciando Kumon Onpoint...
echo ========================================================
start http://localhost:3000
node "%~dp0server.js"
pause
