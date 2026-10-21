Add-Type -AssemblyName System.Drawing

$width = 164
$height = 314
$logoPath = Join-Path $PSScriptRoot "..\src\img\prozlecenie.png"
$bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.Rectangle]::new(0, 0, $width, $height),
    [System.Drawing.Color]::FromArgb(12, 31, 52),
    [System.Drawing.Color]::FromArgb(21, 61, 78),
    90
)
$graphics.FillRectangle($background, 0, 0, $width, $height)
$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(61, 190, 190))
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190, 215, 225))
$titleFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$sectionFont = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)

$graphics.FillRectangle($accent, 16, 18, 34, 3)
$graphics.DrawString("CYBERSCOPE.PL", $titleFont, $white, 14, 32)
$graphics.DrawString("APPLICATION SECURITY", $sectionFont, $muted, 14, 58)
$graphics.DrawString("Responsible for", $bodyFont, $muted, 14, 78)
$graphics.DrawString("application security", $bodyFont, $muted, 14, 94)

$separatorPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(75, 140, 155), 1)
$graphics.DrawLine($separatorPen, 14, 137, 150, 137)
$graphics.DrawString("SPONSOR", $sectionFont, $accent, 14, 154)

$logo = [System.Drawing.Image]::FromFile((Resolve-Path $logoPath))
$graphics.DrawImage($logo, 34, 177, 96, 96)
$graphics.DrawString("ProZlecenie.pl", $sectionFont, $white, 14, 282)

$bitmap.Save((Join-Path $PSScriptRoot "..\build\installerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)

$logo.Dispose()
$background.Dispose()
$accent.Dispose()
$white.Dispose()
$muted.Dispose()
$separatorPen.Dispose()
$titleFont.Dispose()
$sectionFont.Dispose()
$bodyFont.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
