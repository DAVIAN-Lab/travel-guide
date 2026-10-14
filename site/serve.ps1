# Local preview server for the travel-guide site. No admin rights needed.
# Mimics GitHub Pages: serves the repo root under /travel-guide/, exact-case paths only.
# Usage (from the repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File site/serve.ps1 [-Port 8000]
# Then open http://localhost:8000/travel-guide/
param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = '/travel-guide/'
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.md'   = 'text/markdown; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
}

# Windows paths are case-insensitive; GitHub Pages is not. Resolve segment by segment.
function Resolve-ExactPath([string]$rel) {
  $cur = $root
  foreach ($seg in ($rel -split '/' | Where-Object { $_ -ne '' })) {
    if ($seg -eq '.' -or $seg -eq '..' -or $seg.IndexOfAny([char[]]'*?\:') -ge 0) { return $null }
    if (-not [System.IO.Directory]::Exists($cur)) { return $null }
    $hit = $null
    foreach ($e in [System.IO.Directory]::EnumerateFileSystemEntries($cur, $seg)) {
      if ([System.IO.Path]::GetFileName($e) -ceq $seg) { $hit = $e; break }
    }
    if ($null -eq $hit) { return $null }
    $cur = $hit
  }
  return $cur
}

function Send([System.Net.HttpListenerResponse]$res, [int]$code, [string]$type, [byte[]]$body) {
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.Headers['Cache-Control'] = 'no-store'
  $res.ContentLength64 = $body.Length
  if ($body.Length -gt 0) { $res.OutputStream.Write($body, 0, $body.Length) }
  $res.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port$base"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/' -or $path -eq '/travel-guide') {
      $res.Redirect($base); $res.Close(); continue
    }
    if (-not $path.StartsWith($base)) {
      Send $res 404 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('not found')); continue
    }
    $file = Resolve-ExactPath $path.Substring($base.Length)
    if ($null -ne $file -and [System.IO.Directory]::Exists($file)) {
      if (-not $path.EndsWith('/')) { $res.Redirect($path + '/'); $res.Close(); continue }
      $file = Resolve-ExactPath ($path.Substring($base.Length) + 'index.html')
    }
    if ($null -eq $file -or -not [System.IO.File]::Exists($file)) {
      Send $res 404 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('not found'))
      Write-Host "404 $path"
      continue
    }
    $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    $type = $mime[$ext]
    if ($null -eq $type) { $type = 'application/octet-stream' }
    Send $res 200 $type ([System.IO.File]::ReadAllBytes($file))
  } catch {
    try { Send $res 500 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('error')) } catch {}
    Write-Host "500 $($req.Url.AbsolutePath): $_"
  }
}
