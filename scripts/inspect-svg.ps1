param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [double]$Scale = 0.2
)

Add-Type -AssemblyName WindowsBase, PresentationCore

$document = [System.Xml.XmlDocument]::new()
$document.Load((Resolve-Path -LiteralPath $SourcePath).Path)
$root = $document.DocumentElement
$width = [double]$root.GetAttribute('width')
$height = [double]$root.GetAttribute('height')
$pixelWidth = [int][Math]::Ceiling($width * $Scale)
$pixelHeight = [int][Math]::Ceiling($height * $Scale)

$visual = [System.Windows.Media.DrawingVisual]::new()
$context = $visual.RenderOpen()
$context.DrawRectangle([System.Windows.Media.Brushes]::White, $null, [System.Windows.Rect]::new(0, 0, $width, $height))
$context.PushTransform([System.Windows.Media.ScaleTransform]::new($Scale, $Scale))

function Convert-Brush([string]$Color, [string]$Opacity) {
    if ([string]::IsNullOrWhiteSpace($Color) -or $Color -eq 'none') { return $null }
    try {
        $parsed = [System.Windows.Media.ColorConverter]::ConvertFromString($Color)
        $brush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]$parsed)
        if ($Opacity) { $brush.Opacity = [double]$Opacity }
        $brush.Freeze()
        return $brush
    } catch { return $null }
}

function Draw-Node([System.Xml.XmlElement]$Element, [System.Windows.Media.DrawingContext]$Target) {
    switch ($Element.LocalName) {
        'path' {
            $geometry = [System.Windows.Media.Geometry]::Parse($Element.GetAttribute('d'))
            $fill = Convert-Brush $Element.GetAttribute('fill') $Element.GetAttribute('fill-opacity')
            $strokeColor = $Element.GetAttribute('stroke')
            $pen = $null
            if ($strokeColor -and $strokeColor -ne 'none') {
                $strokeBrush = Convert-Brush $strokeColor $Element.GetAttribute('stroke-opacity')
                $strokeWidth = [double]$Element.GetAttribute('stroke-width')
                if ($strokeWidth -le 0) { $strokeWidth = 1 }
                if ($strokeBrush) { $pen = [System.Windows.Media.Pen]::new($strokeBrush, $strokeWidth) }
            }
            $Target.DrawGeometry($fill, $pen, $geometry)
        }
        'rect' {
            $x = [double]$Element.GetAttribute('x'); $y = [double]$Element.GetAttribute('y')
            $w = [double]$Element.GetAttribute('width'); $h = [double]$Element.GetAttribute('height')
            $transform = $Element.GetAttribute('transform')
            if ($transform -match 'translate\(\s*([-\d.]+)[ ,]+([-\d.]+)') { $x += [double]$Matches[1]; $y += [double]$Matches[2] }
            $fill = Convert-Brush $Element.GetAttribute('fill') $Element.GetAttribute('fill-opacity')
            $Target.DrawRectangle($fill, $null, [System.Windows.Rect]::new($x, $y, $w, $h))
        }
        'line' {
            $brush = Convert-Brush $Element.GetAttribute('stroke') $Element.GetAttribute('stroke-opacity')
            if ($brush) {
                $width = [double]$Element.GetAttribute('stroke-width')
                if ($width -le 0) { $width = 1 }
                $Target.DrawLine([System.Windows.Media.Pen]::new($brush, $width), [System.Windows.Point]::new([double]$Element.GetAttribute('x1'), [double]$Element.GetAttribute('y1')), [System.Windows.Point]::new([double]$Element.GetAttribute('x2'), [double]$Element.GetAttribute('y2')))
            }
        }
        'g' { foreach ($child in $Element.ChildNodes) { if ($child -is [System.Xml.XmlElement]) { Draw-Node $child $Target } } }
    }
}

foreach ($element in $root.ChildNodes) {
    if ($element -is [System.Xml.XmlElement]) { Draw-Node $element $context }
}

$context.Pop()
$context.Close()
$bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new($pixelWidth, $pixelHeight, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
$bitmap.Render($visual)
$encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
$encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
$destination = [System.IO.File]::Create([System.IO.Path]::GetFullPath($OutputPath))
try { $encoder.Save($destination) } finally { $destination.Dispose() }

Write-Output "Rendered $($root.LocalName) $($width)x$($height) to $OutputPath ($pixelWidth x $pixelHeight)"
