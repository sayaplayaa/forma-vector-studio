param([Parameter(Mandatory = $true)][string]$SourcePath, [string]$OutputPath)

Add-Type -AssemblyName WindowsBase, PresentationCore
$regions = @(
    [pscustomobject]@{ id='book'; role='foreground'; x=350; y=3400; right=1850; bottom=4450 },
    [pscustomobject]@{ id='phone'; role='foreground'; x=1850; y=3650; right=2900; bottom=4250 },
    [pscustomobject]@{ id='puzzle-pieces'; role='foreground'; x=3000; y=3750; right=3700; bottom=4250 },
    [pscustomobject]@{ id='compact-disc'; role='foreground'; x=3950; y=3900; right=4350; bottom=4250 },
    [pscustomobject]@{ id='headphones'; role='foreground'; x=420; y=4750; right=1400; bottom=5600 },
    [pscustomobject]@{ id='desk-lamp'; role='foreground'; x=1850; y=4350; right=2850; bottom=5600 },
    [pscustomobject]@{ id='tulips'; role='foreground'; x=2950; y=4650; right=3700; bottom=5600 },
    [pscustomobject]@{ id='wallet'; role='foreground'; x=3800; y=4950; right=4550; bottom=5600 },
    [pscustomobject]@{ id='paper'; role='foreground'; x=320; y=5850; right=1650; bottom=6700 },
    [pscustomobject]@{ id='pen'; role='foreground'; x=1700; y=6050; right=2400; bottom=6500 },
    [pscustomobject]@{ id='book-silhouette'; role='background'; x=350; y=7450; right=1850; bottom=8500 },
    [pscustomobject]@{ id='phone-silhouette'; role='background'; x=1850; y=7650; right=2900; bottom=8300 },
    [pscustomobject]@{ id='puzzle-silhouette'; role='background'; x=3000; y=7750; right=3700; bottom=8300 },
    [pscustomobject]@{ id='disc-silhouette'; role='background'; x=3950; y=7850; right=4350; bottom=8300 },
    [pscustomobject]@{ id='headphones-silhouette'; role='background'; x=420; y=8750; right=1400; bottom=9600 },
    [pscustomobject]@{ id='lamp-silhouette'; role='background'; x=1850; y=8350; right=2850; bottom=9650 },
    [pscustomobject]@{ id='tulips-silhouette'; role='background'; x=2950; y=8700; right=3700; bottom=9600 },
    [pscustomobject]@{ id='wallet-silhouette'; role='background'; x=3800; y=9000; right=4550; bottom=9600 },
    [pscustomobject]@{ id='paper-silhouette'; role='background'; x=320; y=9850; right=1650; bottom=10700 },
    [pscustomobject]@{ id='pen-silhouette'; role='background'; x=1700; y=10000; right=2400; bottom=10500 }
)

$document = [System.Xml.XmlDocument]::new()
$document.Load((Resolve-Path -LiteralPath $SourcePath).Path)
$root = $document.DocumentElement
$entries = @{}
foreach ($region in $regions) { $entries[$region.id] = [System.Collections.Generic.List[object]]::new() }
$ambiguous = [System.Collections.Generic.List[object]]::new()
$unassigned = [System.Collections.Generic.List[object]]::new()
$rootPathCount = 0
$elementIndex = 0
foreach ($node in $root.ChildNodes) {
    if ($node -isnot [System.Xml.XmlElement]) { continue }
    if ($node.LocalName -eq 'path') {
        $rootPathCount++
        try { $bounds = [System.Windows.Media.Geometry]::Parse($node.GetAttribute('d')).Bounds }
        catch { throw "Cannot parse source element ${elementIndex}: $($_.Exception.Message)" }
        $cx = $bounds.X + $bounds.Width / 2; $cy = $bounds.Y + $bounds.Height / 2
        $matches = @()
        if ($bounds.Width -lt 2000 -and $bounds.Height -lt 2000) {
            $matches = @($regions | Where-Object { $cx -ge $_.x -and $cx -lt $_.right -and $cy -ge $_.y -and $cy -lt $_.bottom })
        }
        if ($matches.Count -eq 1) {
            $entries[$matches[0].id].Add([pscustomobject]@{ index=$elementIndex; x=$bounds.X; y=$bounds.Y; right=$bounds.Right; bottom=$bounds.Bottom; fill=$node.GetAttribute('fill') })
        } elseif ($matches.Count -gt 1) { $ambiguous.Add([pscustomobject]@{ index=$elementIndex; x=$cx; y=$cy; assets=@($matches | ForEach-Object { $_.id }) }) }
        else { $unassigned.Add([pscustomobject]@{ index=$elementIndex; x=$bounds.X; y=$bounds.Y; width=$bounds.Width; height=$bounds.Height; fill=$node.GetAttribute('fill') }) }
    }
    $elementIndex++
}

$result = foreach ($region in $regions) {
    $selected = @($entries[$region.id] | Sort-Object index)
    $xs = @($selected | ForEach-Object { $_.x }); $ys = @($selected | ForEach-Object { $_.y })
    $rs = @($selected | ForEach-Object { $_.right }); $bs = @($selected | ForEach-Object { $_.bottom })
    [pscustomobject]@{
        id = $region.id; role = $region.role
        selectionRegion = [pscustomobject]@{ x=$region.x; y=$region.y; width=($region.right-$region.x); height=($region.bottom-$region.y) }
        viewBox = if ($selected.Count) {
            $cropLeft = [Math]::Floor(($xs | Measure-Object -Minimum).Minimum)
            $cropTop = [Math]::Floor(($ys | Measure-Object -Minimum).Minimum)
            $cropRight = [Math]::Ceiling(($rs | Measure-Object -Maximum).Maximum)
            $cropBottom = [Math]::Ceiling(($bs | Measure-Object -Maximum).Maximum)
            '{0} {1} {2} {3}' -f $cropLeft, $cropTop, ($cropRight - $cropLeft), ($cropBottom - $cropTop)
        } else { '' }
        elementCount = $selected.Count; elementIndices = @($selected | ForEach-Object { $_.index })
        colorCounts = @($selected | Group-Object fill | ForEach-Object { [pscustomobject]@{ color=$_.Name; count=$_.Count } })
    }
}
$payload = [pscustomobject]@{ source=$SourcePath; sourceWidth=[double]$root.GetAttribute('width'); sourceHeight=[double]$root.GetAttribute('height'); parsedElementCount=$elementIndex; rootPathCount=$rootPathCount; ambiguousAssignments=@($ambiguous); unassignedPaths=@($unassigned); assets=@($result) }
$json = ConvertTo-Json -InputObject $payload -Depth 8
if ($OutputPath) { [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), $json, [System.Text.UTF8Encoding]::new($false)) }
else { Write-Output $json }
