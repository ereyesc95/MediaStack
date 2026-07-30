# Dot-source in PowerShell: . .\set-env.ps1
$env:MYSTACK_MEDIA_ROOT = "C:\Users\reyedu01\AI Projects\MediaStack\Media"
$env:MYSTACK_TMDB_API_KEY = "33bf954f6c57bf828ad8050ee0cc05ac"
Write-Host "MYSTACK_MEDIA_ROOT=$env:MYSTACK_MEDIA_ROOT"
Write-Host "MYSTACK_TMDB_API_KEY set (hidden)"
