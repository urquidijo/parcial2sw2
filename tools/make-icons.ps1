# Genera los íconos de la PWA (mfe-shell/icons) con System.Drawing: cuadrado azul de marca con "HP".
# Uso: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\mfe-shell\icons'
New-Item -ItemType Directory -Force $out | Out-Null
$brand = [System.Drawing.Color]::FromArgb(255, 29, 78, 216)   # #1d4ed8

function New-Icon([int]$size, [string]$name, [bool]$maskable) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Transparent)
    $brush = New-Object System.Drawing.SolidBrush($brand)

    if ($maskable) {
        # Maskable: fondo a sangre; el sistema recorta en círculo o en "squircle" (zona segura = 80 % central).
        $g.FillRectangle($brush, 0, 0, $size, $size)
        $fontSize = $size * 0.30
    } else {
        $r = [int]($size * 0.22)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
        $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
        $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
        $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
        $path.CloseFigure()
        $g.FillPath($brush, $path)
        $fontSize = $size * 0.40
    }

    $font = New-Object System.Drawing.Font('Segoe UI', [single]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'
    $fmt.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF(0, [single]($size * 0.02), $size, $size)
    $g.DrawString('HP', $font, [System.Drawing.Brushes]::White, $rect, $fmt)

    $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "  $name ($size px)"
}

New-Icon 192 'icon-192.png' $false
New-Icon 512 'icon-512.png' $false
New-Icon 512 'icon-maskable-512.png' $true
New-Icon 180 'apple-touch-icon.png' $true
# Insignia de notificaciones (Android la pinta de un solo color): "HP" blanco sobre transparente
function New-Badge([int]$size, [string]$name) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Transparent)
    $font = New-Object System.Drawing.Font('Segoe UI', [single]($size * 0.46), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'
    $fmt.LineAlignment = 'Center'
    $g.DrawString('HP', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, [single]($size * 0.03), $size, $size)), $fmt)
    $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "  $name ($size px, insignia)"
}
New-Badge 96 'badge-96.png'
