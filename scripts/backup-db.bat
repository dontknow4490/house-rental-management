@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0\.."

if not exist "backups" mkdir "backups"

for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~0,4%"
set "MM=%dt:~4,2%"
set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%"
set "Min=%dt:~10,2%"
set "Sec=%dt:~12,2%"

set "BACKUP_FILE=backups\house_rental_backup_%YY%%MM%%DD%_%HH%%Min%%Sec%.sql"

echo Creating PostgreSQL database backup to %BACKUP_FILE%...
docker exec -t house_rental_postgres pg_dump -U postgres -d house_rental_db > "%BACKUP_FILE%"

if %ERRORLEVEL% equ 0 (
    echo Backup completed successfully! Saved to %BACKUP_FILE%
) else (
    echo Error during database backup. Please ensure Docker container 'house_rental_postgres' is running.
)
pause
