# SVG Asset Analysis

## Scope and method

Inspected the XML structure of `Размер L edited.svg` and `Размер S edited.svg` without editing either source file. Counts below are from the parsed SVG element tree. The exports contain no useful object names or labels, so visual object naming and semantic grouping cannot be recovered reliably from the markup alone.

## Summary

- Both files are valid, self-contained SVG documents with editable vector geometry.
- The artwork is exported as a largely flat list of root-level elements. There are no named groups for the individual illustrations.
- Individual path elements can be extracted, but most are component shapes. An illustration assembled from multiple paths must be identified visually and its component elements collected together.
- The three palette families are visible as separate color-coded rectangle sets, not CSS classes or named styles.
- Both size files contain the same palette colors and repeated style/color inventory, but no path has identical raw path data across the two exports. The markup alone does not prove a one-to-one correspondence between every illustration.
- Exact vector geometry and color can be retained when copying elements. The original document viewBox differs between sizes and must be respected; using the original viewBox on an extracted object would retain the canvas, not tightly crop the object.

## File inventory

| File | Root viewBox / dimensions | Paths | Rectangles | Lines | Groups | Other |
|---|---:|---:|---:|---:|---:|---|
| `Размер L edited.svg` | `0 0 4799 11051` (4799 × 11051) | 1,579 total | 28 total | 4 total | 1 | 1 defs block |
| `Размер S edited.svg` | `0 0 3490 11051` (3490 × 11051) | 1,495 total | 28 total | 4 total | 1 | 1 defs block |

The path and rectangle totals include the four child elements in the single `defs` block. In the drawable root content, each file has 1,578/1,494 paths respectively, 26 rectangles, two lines, and one group. The group is anonymous (no `id`, label, or transform) and contains only four children; it does not organize the illustration collection. Elements have no useful IDs, classes, or text labels. There are no CSS style blocks or per-element `style` attributes. Four transforms in each file apply to palette rectangles.

## Asset structure and extractability

### Separate objects

The SVGs do contain separate vector elements: predominantly `<path>`, with palette/background `<rect>` elements and two `<line>` elements in the root content. They do **not** contain one group per illustration. The path elements are therefore separable at the primitive level, but a path is not necessarily a complete illustration. A recognizable object may consist of many adjacent paths, including white fills, dark details, and colored pieces.

### Main objects versus backgrounds

The exports do not encode a reliable semantic distinction such as `main-object`, `background`, or illustration names. The visible palette boards can be recognized structurally: each file has three large square background rectangles and three adjacent color swatch grids. In L, the squares are 1000 × 1000; in S, they are 500 × 500. The swatches are also scaled between files (L: 500-wide cells; S: 250-wide cells). Other drawing paths have no semantic labels. Identifying which paths form each foreground illustration, and which are incidental/background details, requires visual inspection and manual grouping.

### Independent extraction

Extraction is feasible without redrawing. Copy the relevant source `<path>`/`<rect>`/`<line>` elements, along with any needed definitions and inherited attributes, into a new SVG. Keep all component paths for a multi-part object and preserve their original coordinates. The current exports do not supply ready-made object groups, so extraction requires recording the chosen element set and its stacking order. A tight crop requires calculating a new viewBox around the selected geometry; retaining the source viewBox preserves the original canvas coordinates and proportions but leaves large empty areas.

## Palette inventory

The three palette families are represented by actual filled SVG elements (large color tiles and repeated swatch rectangles). They are not represented by named CSS styles, reusable classes, or palette-level groups. Palette colors also occur on illustration geometry, so a color's presence does not by itself identify palette artwork.

| Palette family | Main tile color | Associated visible swatch colors |
|---|---|---|
| Lavender | `#D7CDF5` | `#AA9BF0`, `#7864D7`, `#181817`, `#F9ECB0`, `#F9A3AA`, `#FFE3E1`, white |
| Peach | `#FDD7B9` | `#FAC896`, `#D27532`, `#F9ECB0`, `#80DADA`, `#BEEBEB`, `#181817`, white |
| Mint | `#BEEBEB` | `#80DADA`, `#5ABEBE`, `#FFD4F2`, `#6D7BFC`, `#B6C6FE`, `#181817` |

The files also use `#F9ECB0`, `#F9A3AA`, `#FFE3E1`, black, white, and `none` in other artwork. Across both files the set of explicit fill values is the same: `#181817`, `#5ABEBE`, `#6D7BFC`, `#7864D7`, `#80DADA`, `#AA9BF0`, `#B6C6FE`, `#BEEBEB`, `#D27532`, `#D7CDF5`, `#F9A3AA`, `#F9ECB0`, `#FAC896`, `#FDD7B9`, `#FFD4F2`, `#FFE3E1`, `black`, `white`, and `none`.

## L/S correspondence

The two exports share the same palette family colors and swatch structure. Their overall aspect ratio and height are the same, while their widths differ (L is 4,799 units; S is 3,490 units). The palette tiles and swatches are scaled and positioned differently. Path counts differ by 84 (L has more paths).

No raw path `d` value is identical between the two files. This indicates that the vector data is not a direct byte-for-byte reuse of path geometry; it does not establish that the depicted objects differ, because objects may have been independently redrawn, rescaled, or reshaped. On markup evidence alone, correspondence can be confirmed for the three palette families, but not asserted for every illustration. A visual side-by-side comparison is needed to establish object-level mapping and whether the two sizes depict the same set.

## Preservation assessment

| Property | Can it be preserved? | Notes |
|---|---|---|
| Original object proportions | Yes | Retain original path coordinates and transforms; do not non-uniformly scale. |
| Original document viewBox | Yes | Keep `0 0 4799 11051` for L or `0 0 3490 11051` for S when preserving the full source canvas. |
| Object-only crop | Yes | Compute a bounding viewBox for the selected elements. This changes the canvas bounds but need not change the artwork geometry. |
| Colors | Yes | Copy literal `fill` values and relevant stroke attributes exactly. No style indirection needs resolving. |
| Vector geometry | Yes | Preserve the original path `d` strings and element attributes. Avoid rasterization or geometry simplification. |
| Layering/appearance | Yes, with care | Preserve source stacking order and include dependent definitions. Most elements are root-level, so extraction must explicitly retain the intended order. |

## Practical conclusion

These are usable source assets for independent extraction, with the qualification that the Figma export flattened illustration groupings. Palette boards are identifiable and represented as separate vector shapes. The source files support lossless element-level reuse, but a reliable catalog of named illustrations and a definitive L-to-S mapping requires visual segmentation and comparison; the SVG metadata alone does not provide it.
