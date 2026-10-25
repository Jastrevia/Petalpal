@echo off
rem Quality check (Cycles, 1920x1080, GPU if available): the same five frames at final quality.
setlocal
call "%~dp0_find_blender.bat" || exit /b 1
"%BLENDER%" --background --factory-startup --python "%~dp0build_scene.py" -- --preset final --render stills 
echo.
echo Finished. Results are in "%~dp0output" (see build_report_final.json for timings and any warnings).
pause
