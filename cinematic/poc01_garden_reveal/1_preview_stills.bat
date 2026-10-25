@echo off
rem Fast look (EEVEE, 960x540): builds the scene and renders five frames across the shot. Minutes, not hours.
setlocal
call "%~dp0_find_blender.bat" || exit /b 1
"%BLENDER%" --background --factory-startup --python "%~dp0build_scene.py" -- --preset preview --render stills 
echo.
echo Finished. Results are in "%~dp0output" (see build_report_preview.json for timings and any warnings).
pause
