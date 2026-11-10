import { describe, expect, it, vi } from 'vitest';
import { loadAssets } from './assets';
import { serializeSceneSvg } from './exportSvg';
import { addAsset, createScene, duplicateInstance, moveInstance, moveLayer, removeInstance, SIZE_PRESETS } from './scene';
import type { SvgAsset } from './types';

const asset: SvgAsset = {
  id: 'test-book',
  name: 'Test book',
  role: 'foreground',
  category: 'Test',
  tags: ['book'],
  filename: 'test-book.svg',
  viewBox: '10 20 100 50',
  width: 100,
  height: 50,
  pathCount: 1,
  sourceRegion: { x: 10, y: 20, width: 100, height: 50 },
  sourceElements: [{ from: 2, to: 2 }],
  pathsMarkup: '<path d="M10 20L110 20L110 70Z" fill="#D7CDF5"/>',
};

describe('asset loading', () => {
  it('loads the manifest and verifies each asset contains the expected editable paths', async () => {
    const manifest = {
      source: { file: 'source.svg', sha256: 'abc', width: 100, height: 100, rootPathCount: 1, excludedPathCount: 0, excludedReason: '' },
      assets: [{ ...asset, pathsMarkup: undefined }],
    };
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
      return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${asset.viewBox}"><g><path d="M10 20L110 20L110 70Z" fill="#D7CDF5"/></g></svg>`);
    });

    const loaded = await loadAssets(fetcher, '/test-assets/');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].pathCount).toBe(1);
    expect(loaded[0].pathsMarkup).toContain('d="M10 20L110 20L110 70Z"');
  });
});

describe('scene transformations', () => {
  it('adds, moves, duplicates, reorders, and removes vector instances without distorting their scale', () => {
    let scene = createScene(SIZE_PRESETS[0]);
    scene = addAsset(scene, asset, 'first');
    scene = addAsset(scene, { ...asset, id: 'second' }, 'second');
    scene = moveInstance(scene, 'first', 100, 120);
    expect(scene.instances[0]).toMatchObject({ x: 100, y: 120, scale: 4, rotation: 0 });

    scene = duplicateInstance(scene, 'first', 'copy');
    expect(scene.instances.at(-1)).toMatchObject({ assetId: 'test-book', x: 128, y: 148, scale: 4 });
    expect(scene.instances.at(-1)?.id).toBe('copy');

    scene = moveLayer(scene, 'first', 'forward');
    expect(scene.instances.map((instance) => instance.id)).toEqual(['second', 'first', 'copy']);
    scene = removeInstance(scene, 'copy');
    expect(scene.instances.map((instance) => instance.id)).toEqual(['second', 'first']);
  });
});

describe('SVG export', () => {
  it('exports valid editable vector geometry with transformations and the selected palette', () => {
    const scene = createScene(SIZE_PRESETS[0], 'Color study', 'peach');
    scene.instances = [{ id: 'layer-1', assetId: asset.id, x: 72, y: 88, scale: 2, rotation: 15 }];
    const svg = serializeSceneSvg(scene, [asset]);
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');

    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelector('image')).toBeNull();
    expect(document.querySelector('[data-asset-id="test-book"]')?.getAttribute('transform')).toContain('translate(72 88) rotate(15');
    expect(document.querySelector('path')?.getAttribute('d')).toBe('M10 20L110 20L110 70Z');
    expect(document.querySelector('path')?.getAttribute('fill')).toBe('#FDD7B9');
  });
});
