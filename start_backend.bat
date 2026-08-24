@echo off
echo ============================================
echo  RazorRecon AI - Backend
echo ============================================
echo.

cd /d "c:\My codings\razorpay buildthon"

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Changing to backend folder...
cd backend

echo Starting uvicorn on port 8001...
echo Open http://127.0.0.1:8001/docs in your browser
echo.
uvicorn app.main:app --reload --port 8001

pause
