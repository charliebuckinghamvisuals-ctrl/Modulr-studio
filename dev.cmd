@echo off
rem Dev launcher for the cost-controls worktree. Exists because the Browser
rem pane's launch.json mangles paths containing spaces, and Vite rejects 8.3
rem short paths in its fs allow-list - so the launcher is addressed by short
rem path but switches to the real one before starting.
cd /d "C:\Users\Charlie Buckingham\Downloads\modulr-cost-controls"
npm run dev
