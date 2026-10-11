Set-Location $PSScriptRoot

$env:PUSHER_APP_ID = "2200322"
$env:PUSHER_KEY = "d605185ab5aa0e8904aa"
$env:PUSHER_SECRET = "05c7dbbe63ce5901aa88"
$env:PUSHER_CLUSTER = "ap2"
# optional if you set it on Railway:
$env:PUSHER_TUNNEL_KEY = "helooworldme1234"

# Gateway and agent both stay running; separate windows (see PUSHER-TUNNEL.md).
Start-Process cmd -ArgumentList '/k', 'npm run gateway' -WorkingDirectory $PSScriptRoot
Start-Process cmd -ArgumentList '/k', 'npm run pusher-agent' -WorkingDirectory $PSScriptRoot
