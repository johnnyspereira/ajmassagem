@echo off
set "JP_MASSAGEM_PROJECT_DIR=%~dp0.."
cd /d "%JP_MASSAGEM_PROJECT_DIR%"
start "JP Designer CRM Control Center" cmd /c "npm.cmd run control:center"
