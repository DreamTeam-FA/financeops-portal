@echo off
:: FinanceOps Portal — Integration Test Runner
:: Double-click this file to run tests against the live Render deployment.
:: Or edit TEST_URL below to point at localhost for local dev.

set TEST_URL=https://financeops-portal.onrender.com

echo.
echo  FinanceOps Portal — Integration Tests
echo  Target: %TEST_URL%
echo  ─────────────────────────────────────
echo.

cd /d "%~dp0"

call npx vitest run tests/integration --reporter=verbose

echo.
if %ERRORLEVEL%==0 (
  echo  All tests passed!
) else (
  echo  Some tests failed — see output above.
)
echo.
pause
