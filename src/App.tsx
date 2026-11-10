import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, Copy, Download, Layers, Move, Plus, RotateCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { EXAMPLES } from './data/examples';
import { CompositionBuilder } from './components/CompositionBuilder';
import { loadAssets } from './lib/assets';
import { buildComposition, markLlmFallback, type CompositionFeedback, type CompositionMode } from './lib/autoCompose';
import type { LayoutTemplate } from './lib/autoLayout';
import { serializeSceneSvg } from './lib/exportSvg';
import { llmFallbackReason, requestLlmThemeSelection } from './lib/llmSelection';
import { getPalette, PALETTES, recolorSvgMarkup } from './lib/palette';
import { addAsset, createId, createScene, duplicateInstance, instanceDimensions, moveInstance, moveLayer, removeInstance, resizeScene, SIZE_PRESETS, updateInstance } from './lib/scene';
import type { CompositionScene, SceneInstance, SvgAsset } from './lib/types';
import './styles.css';

type LibraryFilter = 'all' | 'foreground' | 'background';
type ActiveDrag = { id: string; offsetX: number; offsetY: number };

function makeExampleScene(exampleId: string, assets: SvgAsset[]): CompositionScene {
  const example = EXAMPLES.find((item) => item.id === exampleId) ?? EXAMPLES[0];
  const size = SIZE_PRESETS.find((preset) => preset.id === example.sizeId) ?? SIZE_PRESETS[0];
  const available = new Set(assets.map((asset) => asset.id));
  const missing = example.objects.find((item) => !available.has(item.assetId));
  if (missing) throw new Error(`Example ${example.title} references missing asset ${missing.assetId}.`);
  return {
    name: example.title,
    size: { ...size },
    palette: example.palette,
    instances: example.objects.map((item, index) => ({ id: `${example.id}-${item.assetId}-${index + 1}`, ...item })),
  };
}

function AssetThumbnail({ asset, paletteId }: { asset: SvgAsset; paletteId: string }) {
  return (
    <svg className="asset-thumbnail" viewBox={asset.viewBox} role="img" aria-label={asset.name}>
      <g fill="none" dangerouslySetInnerHTML={{ __html: recolorSvgMarkup(asset.pathsMarkup, paletteId) }} />
    </svg>
  );
}

function slug(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vector-composition';
}

export default function App() {
  const [assets, setAssets] = useState<SvgAsset[]>([]);
  const [scene, setScene] = useState<CompositionScene>(() => createScene());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [search, setSearch] = useState('');
  const [compositionFeedback, setCompositionFeedback] = useState<CompositionFeedback | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const buildRevision = useRef(0);
  const sceneRef = useRef(scene);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    let alive = true;
    loadAssets().then((loaded) => {
      if (!alive) return;
      setAssets(loaded);
      setScene(makeExampleScene(EXAMPLES[0].id, loaded));
      setIsReady(true);
    }).catch((error: unknown) => {
      if (alive) setLoadError(error instanceof Error ? error.message : 'Could not load the SVG library.');
    });
    return () => { alive = false; };
  }, []);

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      const matchesRole = libraryFilter === 'all' || asset.role === libraryFilter;
      const matchesSearch = !term || asset.name.toLocaleLowerCase().includes(term) || asset.tags.some((tag) => tag.toLocaleLowerCase().includes(term));
      return matchesRole && matchesSearch;
    });
  }, [assets, libraryFilter, search]);
  const assetRoleCounts = useMemo(() => ({
    all: assets.length,
    foreground: assets.filter((asset) => asset.role === 'foreground').length,
    background: assets.filter((asset) => asset.role === 'background').length,
  }), [assets]);

  const selected = scene.instances.find((instance) => instance.id === selectedId) ?? null;
  const selectedAsset = selected ? assets.find((asset) => asset.id === selected.assetId) ?? null : null;
  const selectedDimensions = selected && selectedAsset ? instanceDimensions(selectedAsset, selected) : null;
  const palette = getPalette(scene.palette);

  function addFromLibrary(asset: SvgAsset) {
    const instanceId = createId(`asset-${asset.id}`);
    setScene((current) => addAsset(current, asset, instanceId));
    setSelectedId(instanceId);
  }

  async function composeFromInput(mode: CompositionMode, input: string, template: LayoutTemplate) {
    try {
      const request = { mode, input, template, revision: buildRevision.current };
      let result;
      if (mode === 'theme' && input.trim() && input.trim().length <= 2000 && assets.length) {
        try {
          const selection = await requestLlmThemeSelection(input, assets);
          result = buildComposition(sceneRef.current, assets, request, selection);
        } catch (error) {
          result = markLlmFallback(
            buildComposition(sceneRef.current, assets, request),
            llmFallbackReason(error),
          );
        }
      } else {
        result = buildComposition(sceneRef.current, assets, request);
      }
      setCompositionFeedback(result.feedback);
      if (result.scene) {
        buildRevision.current += 1;
        dragRef.current = null;
        sceneRef.current = result.scene;
        setScene(result.scene);
        setSelectedId(null);
      }
    } catch (error) {
      setCompositionFeedback({ status: 'error', strategy: 'empty', message: error instanceof Error ? error.message : 'Не удалось собрать композицию.', missing: [], selections: [] });
    }
  }

  function loadExample(exampleId: string) {
    setScene(makeExampleScene(exampleId, assets));
    setSelectedId(null);
    setCompositionFeedback(null);
  }

  function clientPoint(event: React.PointerEvent<SVGElement>) {
    const canvas = svgRef.current;
    const matrix = canvas?.getScreenCTM?.();
    if (canvas && matrix) {
      const point = canvas.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      return point.matrixTransform(matrix.inverse());
    }
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (event.clientX - bounds.left) * scene.size.width / bounds.width,
      y: (event.clientY - bounds.top) * scene.size.height / bounds.height,
    };
  }

  function startDrag(event: React.PointerEvent<SVGGElement>, instance: SceneInstance) {
    event.preventDefault();
    event.stopPropagation();
    const point = clientPoint(event);
    dragRef.current = { id: instance.id, offsetX: point.x - instance.x, offsetY: point.y - instance.y };
    setSelectedId(instance.id);
    try { svgRef.current?.setPointerCapture(event.pointerId); } catch { /* Some SVG engines capture on the group itself. */ }
  }

  function drag(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const point = clientPoint(event);
    const { id, offsetX, offsetY } = dragRef.current;
    setScene((current) => moveInstance(current, id, point.x - offsetX, point.y - offsetY));
  }

  function finishDrag(event: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    try { svgRef.current?.releasePointerCapture(event.pointerId); } catch { /* Capture can already be released. */ }
  }

  function updateSelected(update: Partial<Pick<SceneInstance, 'x' | 'y' | 'scale' | 'rotation'>>) {
    if (!selectedId) return;
    setScene((current) => updateInstance(current, selectedId, update));
  }

  function removeSelected() {
    if (!selectedId) return;
    setScene((current) => removeInstance(current, selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selectedId) return;
    const nextId = createId('duplicate');
    setScene((current) => duplicateInstance(current, selectedId, nextId));
    setSelectedId(nextId);
  }

  function exportComposition() {
    const svg = serializeSceneSvg(scene, assets);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${slug(scene.name)}.svg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        setScene((current) => removeInstance(current, selectedId));
        setSelectedId(null);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault();
        const nextId = createId('duplicate');
        setScene((current) => duplicateInstance(current, selectedId, nextId));
        setSelectedId(nextId);
      } else if (event.key === 'Escape') {
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  if (loadError) {
    return (
      <main className="load-error">
        <div className="error-mark"><X size={20} /></div>
        <h1>SVG library could not be loaded</h1>
        <p>{loadError}</p>
        <p className="error-hint">Run <code>npm run dev</code> from the project folder so the extracted asset manifest is served by Vite.</p>
      </main>
    );
  }

  if (!isReady) {
    return <main className="loading-screen"><div className="brand-mark"><Layers size={19} /></div><span>Loading verified SVG library…</span></main>;
  }

  const activeExample = EXAMPLES.find((example) => example.title === scene.name);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Layers size={18} strokeWidth={2.2} /></div>
          <div><strong>forma</strong><span>VECTOR STUDIO</span></div>
        </div>
        <div className="topbar-divider" />
        <div className="project-heading">
          <span className="eyebrow">COMPOSITION</span>
          <input aria-label="Composition name" value={scene.name} onChange={(event) => setScene((current) => ({ ...current, name: event.target.value }))} />
        </div>
        <div className="topbar-spacer" />
        <div className="save-state"><span className="save-dot" /> Local draft</div>
        <button className="export-button" onClick={exportComposition}><Download size={16} /> Export SVG</button>
      </header>

      <main className="studio-layout">
        <aside className="library-panel panel">
          <div className="panel-head">
            <div><span className="eyebrow">SOURCE LIBRARY</span><h2>Illustrations <span className="count-pill">{assets.length}</span></h2></div>
            <span className="asset-badge"><Check size={13} /> verified</span>
          </div>

          <CompositionBuilder onBuild={composeFromInput} feedback={compositionFeedback} />

          <div className="library-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search objects" aria-label="Search object library" /><kbd>/</kbd></div>
          <div className="library-tabs" role="tablist" aria-label="Asset role">
            {([['all', 'All'], ['foreground', 'Objects'], ['background', 'Shadows']] as const).map(([filter, label]) => (
              <button key={filter} role="tab" aria-selected={libraryFilter === filter} className={libraryFilter === filter ? 'active' : ''} onClick={() => setLibraryFilter(filter)}>{label}<span>{assetRoleCounts[filter]}</span></button>
            ))}
          </div>

          <div className="asset-list">
            {filteredAssets.map((asset) => (
              <button key={asset.id} className="asset-card" onClick={() => addFromLibrary(asset)} title={`Add ${asset.name} to the canvas`}>
                <span className="asset-preview"><AssetThumbnail asset={asset} paletteId={scene.palette} /></span>
                <span className="asset-card-copy"><strong>{asset.name}</strong><small>{asset.role === 'foreground' ? asset.category : `${asset.category} · shadow`}</small></span>
                <span className="asset-add"><Plus size={15} /></span>
              </button>
            ))}
            {filteredAssets.length === 0 && <div className="empty-search">No assets match “{search}”.</div>}
          </div>
          <div className="library-footnote"><BookOpen size={14} /><span>All artwork comes from the supplied SVG source.</span></div>
        </aside>

        <section className="canvas-workspace">
          <div className="workspace-topline">
            <div className="workspace-title"><div className="eyebrow">CANVAS</div><h1>{activeExample ? 'Example composition' : 'Your composition'} <span className="live-dot" /></h1></div>
            <label className="size-select-wrap"><span>Size</span><select aria-label="Composition size" value={scene.size.id} onChange={(event) => {
              const size = SIZE_PRESETS.find((preset) => preset.id === event.target.value);
              if (size) setScene((current) => resizeScene(current, size));
            }}>{SIZE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.width} × {preset.height}</option>)}</select></label>
            <span className="canvas-dimensions">{scene.size.width} × {scene.size.height}</span>
          </div>

          <div className="example-strip" aria-label="Example compositions">
            <span className="example-label"><Sparkles size={14} /> Start with</span>
            {EXAMPLES.map((example, index) => (
              <button key={example.id} onClick={() => loadExample(example.id)} className={scene.name === example.title ? 'selected' : ''}>
                <span className={`example-number number-${index + 1}`}>0{index + 1}</span>{example.title}
              </button>
            ))}
          </div>

          <div className="canvas-zone">
            <div className="canvas-caption"><span><Move size={13} /> Drag objects to arrange</span><span>{scene.instances.length} layer{scene.instances.length === 1 ? '' : 's'}</span></div>
            <div className="canvas-frame" style={{ aspectRatio: `${scene.size.width} / ${scene.size.height}` }}>
              <svg
                ref={svgRef}
                className="composition-canvas"
                viewBox={`0 0 ${scene.size.width} ${scene.size.height}`}
                role="application"
                aria-label="SVG composition canvas"
                onPointerMove={drag}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onPointerDown={() => { if (!dragRef.current) setSelectedId(null); }}
              >
                <rect width={scene.size.width} height={scene.size.height} fill={palette.canvas} />
                {scene.instances.map((instance) => {
                  const asset = assets.find((candidate) => candidate.id === instance.assetId);
                  if (!asset) return null;
                  const { width, height } = instanceDimensions(asset, instance);
                  const isSelected = selectedId === instance.id;
                  const markup = recolorSvgMarkup(asset.pathsMarkup, scene.palette);
                  return (
                    <g
                      key={instance.id}
                      className={`canvas-layer ${isSelected ? 'is-selected' : ''}`}
                      data-instance-id={instance.id}
                      data-asset-id={asset.id}
                      transform={`translate(${instance.x} ${instance.y}) rotate(${instance.rotation} ${width / 2} ${height / 2})`}
                      onPointerDown={(event) => startDrag(event, instance)}
                      onDoubleClick={(event) => { event.stopPropagation(); setSelectedId(instance.id); }}
                    >
                      <svg x="0" y="0" width={width} height={height} viewBox={asset.viewBox} preserveAspectRatio="xMidYMid meet">
                        <g fill="none" dangerouslySetInnerHTML={{ __html: markup }} />
                      </svg>
                      {isSelected && <rect className="selection-outline" x="0" y="0" width={width} height={height} />}
                    </g>
                  );
                })}
                {scene.instances.length === 0 && <text x={scene.size.width / 2} y={scene.size.height / 2} textAnchor="middle" className="canvas-empty-label">Add an illustration from the source library</text>}
              </svg>
            </div>
            <div className="canvas-bottomline"><span>Original geometry · editable vector layers</span><span>Hold and drag to move</span></div>
          </div>

          <div className="workspace-footer">
            <div className="keyboard-hints"><span><kbd>Ctrl</kbd><kbd>D</kbd> duplicate</span><span><kbd>Del</kbd> remove</span><span><kbd>Esc</kbd> deselect</span></div>
            <button className="clear-canvas" onClick={() => { setScene((current) => ({ ...current, instances: [] })); setSelectedId(null); }}>Clear canvas</button>
          </div>
        </section>

        <aside className="inspector-panel panel">
          <div className="inspector-top"><div><span className="eyebrow">STYLE</span><h2>Color palette</h2></div><span className="auto-tag"><Sparkles size={12} /> auto</span></div>
          <p className="inspector-copy">Mapped to the original illustration color roles.</p>
          <div className="palette-list" role="radiogroup" aria-label="Color palette">
            {PALETTES.map((option) => (
              <button key={option.id} className={`palette-card ${scene.palette === option.id ? 'active' : ''}`} role="radio" aria-checked={scene.palette === option.id} onClick={() => setScene((current) => ({ ...current, palette: option.id }))}>
                <span className="palette-swatch-row">{[...option.background, ...option.objects].map((color, index) => <i key={index} style={{ background: color }} />)}</span>
                <span className="palette-name"><strong>{option.name}</strong><small>{option.note}</small></span>
                {scene.palette === option.id && <Check className="palette-check" size={15} />}
              </button>
            ))}
          </div>

          <div className="inspector-divider" />
          <div className="inspector-top object-heading"><div><span className="eyebrow">SELECTION</span><h2>Object details</h2></div>{selected && <span className="selected-layer-count">{scene.instances.findIndex((item) => item.id === selected.id) + 1}/{scene.instances.length}</span>}</div>
          {selected && selectedAsset && selectedDimensions ? (
            <div className="object-controls">
              <div className="selected-asset-card"><span className="selected-asset-preview"><AssetThumbnail asset={selectedAsset} paletteId={scene.palette} /></span><span><strong>{selectedAsset.name}</strong><small>{selectedAsset.role === 'foreground' ? 'Foreground object' : 'Background shadow'}</small></span></div>
              <div className="control-group"><div className="control-label"><span>Position</span><small>canvas units</small></div><div className="xy-inputs"><label><span>X</span><input type="number" value={Math.round(selected.x)} onChange={(event) => updateSelected({ x: Number(event.target.value) || 0 })} /></label><label><span>Y</span><input type="number" value={Math.round(selected.y)} onChange={(event) => updateSelected({ y: Number(event.target.value) || 0 })} /></label></div></div>
              <div className="control-group"><div className="control-label"><span>Rotation</span><strong>{Math.round(selected.rotation)}°</strong></div><div className="range-control"><RotateCw size={14} /><input type="range" min="-180" max="180" step="1" value={selected.rotation} onChange={(event) => updateSelected({ rotation: Number(event.target.value) })} aria-label="Object rotation" /></div></div>
              <div className="control-group"><div className="control-label"><span>Scale</span><strong>{selected.scale.toFixed(2)}×</strong></div><input className="scale-range" type="range" min="0.08" max="2" step="0.01" value={Math.min(2, selected.scale)} onChange={(event) => updateSelected({ scale: Number(event.target.value) })} aria-label="Object scale" /><div className="dimensions-note">{Math.round(selectedDimensions.width)} × {Math.round(selectedDimensions.height)} units · proportions locked</div></div>

              <div className="layer-actions"><button onClick={duplicateSelected}><Copy size={15} /> Duplicate <kbd>Ctrl D</kbd></button><button onClick={() => setScene((current) => moveLayer(current, selected.id, 'backward'))} disabled={scene.instances.findIndex((item) => item.id === selected.id) === 0} aria-label="Move layer backward"><ArrowDown size={15} /></button><button onClick={() => setScene((current) => moveLayer(current, selected.id, 'forward'))} disabled={scene.instances.findIndex((item) => item.id === selected.id) === scene.instances.length - 1} aria-label="Move layer forward"><ArrowUp size={15} /></button><button className="delete-button" onClick={removeSelected}><Trash2 size={15} /></button></div>
              <p className="source-note"><Check size={13} /> {selectedAsset.pathCount} source paths · geometry unchanged</p>
            </div>
          ) : (
            <div className="no-selection"><span className="selection-icon"><Move size={17} /></span><strong>Select an object</strong><p>Click an illustration on the canvas or add one from the source library.</p><div className="layer-summary"><Layers size={14} /><span>{scene.instances.length} layers in this composition</span></div></div>
          )}

          <div className="inspector-bottom"><div className="phase-note"><Sparkles size={14} /><span><strong>LLM с локальным fallback</strong><small>Только ID из manifest; новые SVG и изображения не генерируются.</small></span></div></div>
        </aside>
      </main>
    </div>
  );
}
