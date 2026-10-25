@echo off
rem Builds and saves output\poc01_garden_reveal_preview.blend without rendering, to open and inspect in Blender.
setlocal
call "%~dp0_find_blender.bat" || exit /b 1
"%BLENDER%" --background --factory-startup --python "%~dp0build_scene.py" -- --preset preview --render none 
echo.
echo Finished. Results are in "%~dp0output" (see build_report_preview.json for timings and any warnings).
pause
