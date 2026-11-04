@echo off
title PetalPal Treehouse preview - http://localhost:8081
cd /d "%~dp0mobile"
echo Starting the PetalPal local preview at http://localhost:8081 (fake sign-in and fake data; nothing is sent anywhere)
node scripts\web-local\start.mjs
pause
