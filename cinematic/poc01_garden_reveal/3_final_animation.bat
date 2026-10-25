@echo off
rem Full 6.25 s shot (150 frames, Cycles 1920x1080). Can take hours; run 2_final_stills first.
setlocal
call "%~dp0_find_blender.bat" || exit /b 1
"%BLENDER%" --background --factory-startup --python "%~dp0build_scene.py" -- --preset final --render anim 
echo.
echo Finished. Results are in "%~dp0output" (see build_report_final.json for timings and any warnings).
pause
