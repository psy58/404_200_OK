@echo off
rem Work Navigator - browser window (pywebview)
cd /d "%~dp0backend"
start "" ".venv\Scripts\pythonw.exe" desktop.py
