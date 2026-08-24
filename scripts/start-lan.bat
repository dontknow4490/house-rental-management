@echo off
title House Rental Management System (LAN Testing Mode)
echo Starting House Rental Management System...
cd /d "%~dp0\.."
node scripts/start-lan.js
pause
