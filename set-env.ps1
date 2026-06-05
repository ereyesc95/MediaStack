# Dot-source in PowerShell: . .\set-env.ps1
$env:MEDIASTACK_MEDIA_ROOT = "C:\Users\reyedu01\AI Projects\MediaStack\Media"
$env:MEDIASTACK_TMDB_API_KEY = "33bf954f6c57bf828ad8050ee0cc05ac"
Write-Host "MEDIASTACK_MEDIA_ROOT=$env:MEDIASTACK_MEDIA_ROOT"
Write-Host "MEDIASTACK_TMDB_API_KEY set (hidden)"
