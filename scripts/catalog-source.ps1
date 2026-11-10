param([Parameter(Mandatory = $true)][string]$SourcePath, [double]$ClusterGap = 90, [switch]$ShowPaths)

Add-Type -AssemblyName WindowsBase, PresentationCore
$document = [System.Xml.XmlDocument]::new()
$document.Load((Resolve-Path -LiteralPath $SourcePath).Path)
$root = $document.DocumentElement
$items = [System.Collections.Generic.List[object]]::new()
$elementIndex = 0

foreach ($node in $root.ChildNodes) {
    if ($node -isnot [System.Xml.XmlElement]) { continue }
    $bounds = $null
    try {
        switch ($node.LocalName) {
            'path' { $bounds = [System.Windows.Media.Geometry]::Parse($node.GetAttribute('d')).Bounds }
            'rect' {
                $x = [double]$node.GetAttribute('x'); $y = [double]$node.GetAttribute('y')
                if ($node.GetAttribute('transform') -match 'translate\(\s*([-\d.]+)[ ,]+([-\d.]+)') { $x += [double]$Matches[1]; $y += [double]$Matches[2] }
                $bounds = [System.Windows.Rect]::new($x, $y, [double]$node.GetAttribute('width'), [double]$node.GetAttribute('height'))
            }
            'line' {
                $x1 = [double]$node.GetAttribute('x1'); $x2 = [double]$node.GetAttribute('x2')
                $y1 = [double]$node.GetAttribute('y1'); $y2 = [double]$node.GetAttribute('y2')
                $bounds = [System.Windows.Rect]::new([Math]::Min($x1, $x2), [Math]::Min($y1, $y2), [Math]::Abs($x2 - $x1), [Math]::Abs($y2 - $y1))
            }
            'g' {
                $groupBounds = [System.Windows.Rect]::Empty
                foreach ($child in $node.ChildNodes) {
                    if ($child -is [System.Xml.XmlElement] -and $child.LocalName -eq 'path') { $groupBounds.Union([System.Windows.Media.Geometry]::Parse($child.GetAttribute('d')).Bounds) }
                    elseif ($child -is [System.Xml.XmlElement] -and $child.LocalName -eq 'rect') {
                        $x = [double]$child.GetAttribute('x'); $y = [double]$child.GetAttribute('y')
                        if ($child.GetAttribute('transform') -match 'translate\(\s*([-\d.]+)[ ,]+([-\d.]+)') { $x += [double]$Matches[1]; $y += [double]$Matches[2] }
                        $groupBounds.Union([System.Windows.Rect]::new($x, $y, [double]$child.GetAttribute('width'), [double]$child.GetAttribute('height')))
                    }
                }
                $bounds = $groupBounds
            }
        }
    } catch { throw "Cannot parse source element $elementIndex ($($node.LocalName)): $($_.Exception.Message)" }
    if ($bounds -and -not $bounds.IsEmpty) {
        $items.Add([pscustomobject]@{ index = $elementIndex; tag = $node.LocalName; fill = $node.GetAttribute('fill'); x = $bounds.X; y = $bounds.Y; right = $bounds.Right; bottom = $bounds.Bottom; width = $bounds.Width; height = $bounds.Height; cx = $bounds.X + $bounds.Width / 2; cy = $bounds.Y + $bounds.Height / 2 })
    }
    $elementIndex++
}

$candidates = @($items | Where-Object { $_.tag -eq 'path' -and $_.cy -gt 2500 -and $_.width -lt 2000 -and $_.height -lt 2000 })
$parent = [int[]]::new($candidates.Count)
for ($i = 0; $i -lt $parent.Length; $i++) { $parent[$i] = $i }
$script:parent = $parent
function Find-Root([int]$Index) {
    while ($script:parent[$Index] -ne $Index) { $script:parent[$Index] = $script:parent[$script:parent[$Index]]; $Index = $script:parent[$Index] }
    return $Index
}
for ($i = 0; $i -lt $candidates.Count; $i++) {
    for ($j = $i + 1; $j -lt $candidates.Count; $j++) {
        $a = $candidates[$i]; $b = $candidates[$j]
        $gapX = [Math]::Max(0, [Math]::Max($a.x - $b.right, $b.x - $a.right))
        $gapY = [Math]::Max(0, [Math]::Max($a.y - $b.bottom, $b.y - $a.bottom))
        if ([Math]::Sqrt($gapX * $gapX + $gapY * $gapY) -le $ClusterGap) {
            $ra = Find-Root $i; $rb = Find-Root $j
            if ($ra -ne $rb) { $parent[$rb] = $ra }
        }
    }
}

$clusters = @{}
for ($i = 0; $i -lt $candidates.Count; $i++) {
    $r = Find-Root $i
    if (-not $clusters.ContainsKey($r)) { $clusters[$r] = [System.Collections.Generic.List[object]]::new() }
    $clusters[$r].Add($candidates[$i])
}
$summary = foreach ($cluster in $clusters.Values) {
    $xs = @($cluster | ForEach-Object { $_.x }); $ys = @($cluster | ForEach-Object { $_.y })
    $rs = @($cluster | ForEach-Object { $_.right }); $bs = @($cluster | ForEach-Object { $_.bottom })
    [pscustomobject]@{ x = [Math]::Floor(($xs | Measure-Object -Minimum).Minimum); y = [Math]::Floor(($ys | Measure-Object -Minimum).Minimum); width = [Math]::Ceiling(($rs | Measure-Object -Maximum).Maximum - ($xs | Measure-Object -Minimum).Minimum); height = [Math]::Ceiling(($bs | Measure-Object -Maximum).Maximum - ($ys | Measure-Object -Minimum).Minimum); paths = $cluster.Count; firstIndex = ($cluster | Measure-Object index -Minimum).Minimum; lastIndex = ($cluster | Measure-Object index -Maximum).Maximum; indices = (@($cluster | Sort-Object index | ForEach-Object { $_.index }) -join ',') }
}

Write-Output "Source: $SourcePath | parsed elements: $elementIndex | candidate paths: $($candidates.Count) | clusters: $($summary.Count) | max gap: $ClusterGap"
$summary | Sort-Object y, x | Select-Object x, y, width, height, paths, firstIndex, lastIndex | Format-Table -AutoSize | Out-String | Write-Output
if ($ShowPaths) {
    $candidates | Where-Object { $_.cy -gt 3400 -and $_.cy -lt 5600 -and $_.x -lt 2800 } | Sort-Object y, x | Select-Object index, fill, x, y, width, height | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
}
