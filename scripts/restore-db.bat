@echo off
setlocal

cd /d "%~dp0\.."

if "%~1"=="" (
    echo Usage: restore-db.bat ^<path_to_backup_sql_file^>
    echo Example: restore-db.bat backups\house_rental_backup_20260821_120000.sql
    pause
    exit /b 1
)

set "BACKUP_FILE=%~1"

if not exist "%BACKUP_FILE%" (
    echo Backup file "%BACKUP_FILE%" not found!
    pause
    exit /b 1
)

echo Restoring PostgreSQL database from %BACKUP_FILE%...
docker exec -i house_rental_postgres psql -U postgres -d house_rental_db < "%BACKUP_FILE%"

if %ERRORLEVEL% equ 0 (
    echo Database restoration completed successfully!
) else (
    echo Error during database restore.
)
pause
