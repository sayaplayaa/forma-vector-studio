import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, type AssetLibraryManifest } from './assets';
import { serializeSceneSvg } from './exportSvg';
import { createScene, SIZE_PRESETS } from './scene';
import type { AssetManifestEntry, SvgAsset } from './types';

const projectRoot = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'public/assets/manifest.json'), 'utf8')) as AssetLibraryManifest;
const sourceBytes = readFileSync(path.join(projectRoot, manifest.source.file));
const sourceDocument = parseSvg(sourceBytes.toString('utf8'));
const sourceElements = Array.from(sourceDocument.documentElement.children);
let loadedAssets: SvgAsset[];

function parseSvg(markup: string): XMLDocument {
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  expect(document.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
  return document;
}

function sourcePaths(asset: AssetManifestEntry): Element[] {
  return asset.sourceElements.flatMap(({ from, to }) =>
    Array.from({ length: to - from + 1 }, (_, offset) => sourceElements[from + offset]),
  );
}

function attributes(element: Element, omitColors = false): Record<string, string> {
  return Object.fromEntries(Array.from(element.attributes)
    .filter((attribute) => attribute.name !== 'xmlns' && (!omitColors || !['fill', 'stroke'].includes(attribute.name)))
    .map((attribute) => [attribute.name, attribute.value]));
}

function paths(markup: string): Element[] {
  return Array.from(parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`).querySelectorAll('path'));
}

const fileFetcher: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(url, 'http://localhost').pathname;
  if (!pathname.startsWith('/assets/')) return new Response('Unknown asset route', { status: 404 });
  try {
    return new Response(readFileSync(path.join(projectRoot, 'public', pathname.slice(1)), 'utf8'));
  } catch {
    return new Response('Asset file not found', { status: 404 });
  }
};

beforeAll(async () => {
  loadedAssets = await loadAssets(fileFetcher);
});

describe('the real extracted source library', () => {
  it('accounts for the original source and every extracted component exactly once', () => {
    expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(manifest.source.sha256);
    expect(sourceDocument.documentElement.getAttribute('viewBox')).toBe(`0 0 ${manifest.source.width} ${manifest.source.height}`);
    const selectedIndexes = manifest.assets.flatMap((asset) => asset.sourceElements.flatMap(({ from, to }) =>
      Array.from({ length: to - from + 1 }, (_, offset) => from + offset)));
    const rootPaths = sourceElements.filter((element) => element.localName === 'path');
    expect(new Set(selectedIndexes).size).toBe(selectedIndexes.length);
    expect(rootPaths).toHaveLength(manifest.source.rootPathCount);
    expect(rootPaths.length - selectedIndexes.length).toBe(manifest.source.excludedPathCount);
    expect(selectedIndexes).toHaveLength(1552);
    expect(manifest.assets).toHaveLength(20);
    expect(manifest.assets.every((asset) => asset.pathCount > 1)).toBe(true);
  });

  it.each(manifest.assets)('$id preserves every original path and its paint order', (asset) => {
    const svg = parseSvg(readFileSync(path.join(projectRoot, 'public/assets', asset.filename), 'utf8'));
    const extractedPaths = Array.from(svg.querySelectorAll('path'));
    const expectedPaths = sourcePaths(asset);

    expect(expectedPaths.every((element) => element.localName === 'path')).toBe(true);
    expect(extractedPaths).toHaveLength(asset.pathCount);
    expect(extractedPaths.map((element) => attributes(element))).toEqual(expectedPaths.map((element) => attributes(element)));
    expect(svg.documentElement.getAttribute('viewBox')).toBe(asset.viewBox);
    expect(svg.documentElement.getAttribute('fill')).toBe(sourceDocument.documentElement.getAttribute('fill'));
    expect(Number(svg.documentElement.getAttribute('width'))).toBe(asset.width);
    expect(Number(svg.documentElement.getAttribute('height'))).toBe(asset.height);
    expect(svg.querySelector('image, foreignObject, use')).toBeNull();
  });

  it('loads the complete real manifest with original geometry through the browser loader', () => {
    expect(loadedAssets.map((asset) => asset.id)).toEqual(manifest.assets.map((asset) => asset.id));
    for (const asset of loadedAssets) {
      expect(paths(asset.pathsMarkup).map((element) => attributes(element)))
        .toEqual(sourcePaths(asset).map((element) => attributes(element)));
    }
  });

  it('reports a broken real asset instead of silently omitting its missing component', async () => {
    const asset = manifest.assets.find((entry) => entry.id === 'book')!;
    const broken = parseSvg(readFileSync(path.join(projectRoot, 'public/assets', asset.filename), 'utf8'));
    broken.querySelector('path')!.remove();
    const brokenMarkup = new XMLSerializer().serializeToString(broken);
    const fetcher: typeof fetch = async (input, init) => String(input).endsWith('/book.svg')
      ? new Response(brokenMarkup)
      : fileFetcher(input, init);

    await expect(loadAssets(fetcher)).rejects.toThrow(/Open book expected 54 vector paths but found 53/);
  });
});

// Independent reference swatches from the supplied illustration palette boards.
const colorExpectations: Record<string, Record<string, string>> = {
  lavender: {},
  peach: {
    '#D7CDF5': '#FDD7B9', '#AA9BF0': '#FAC896', '#7864D7': '#D27532',
    '#F9ECB0': '#F9ECB0', '#F9A3AA': '#80DADA', '#FFE3E1': '#BEEBEB',
  },
  mint: {
    '#D7CDF5': '#BEEBEB', '#AA9BF0': '#80DADA', '#7864D7': '#5ABEBE',
    '#F9ECB0': '#FFD4F2', '#F9A3AA': '#6D7BFC', '#FFE3E1': '#B6C6FE',
  },
};

describe('editable export of the real library', () => {
  it.each(['lavender', 'peach', 'mint'])('retains geometry, layer order, transforms, and proportions in %s', (palette) => {
    const scene = createScene(SIZE_PRESETS[0], 'Ideas <connect> & "grow"', palette);
    const orderedAssets = [...loadedAssets].reverse();
    scene.instances = orderedAssets.map((asset, index) => ({
      id: `real-${index}`,
      assetId: asset.id,
      x: 31.125 + index * 17,
      y: 42.875 + (index % 4) * 60,
      scale: 0.137159 + index * 0.00317,
      rotation: index % 2 ? -13.5 : 22.25,
    }));
    const before = loadedAssets.map((asset) => asset.pathsMarkup);
    const exported = parseSvg(serializeSceneSvg(scene, loadedAssets));
    const layers = Array.from(exported.documentElement.children).filter((element) => element.localName === 'g');

    expect(exported.querySelector('title')?.textContent).toBe(scene.name);
    expect(exported.documentElement.getAttribute('viewBox')).toBe('0 0 1280 720');
    expect(layers.map((layer) => layer.getAttribute('data-asset-id'))).toEqual(scene.instances.map((instance) => instance.assetId));
    expect(exported.querySelector('image, foreignObject, use, script')).toBeNull();
    expect(Array.from(exported.querySelectorAll('*')).flatMap((element) => Array.from(element.attributes))
      .some((attribute) => attribute.localName === 'href' || /url\s*\(/i.test(attribute.value))).toBe(false);

    layers.forEach((layer, index) => {
      const asset = orderedAssets[index];
      const instance = scene.instances[index];
      const viewport = layer.querySelector('svg')!;
      const width = Number(viewport.getAttribute('width'));
      const height = Number(viewport.getAttribute('height'));
      const transform = layer.getAttribute('transform')!;
      const expected = sourcePaths(asset);
      const actual = Array.from(layer.querySelectorAll('path'));

      expect(actual).toHaveLength(asset.pathCount);
      expect(actual.map((element) => attributes(element, true))).toEqual(expected.map((element) => attributes(element, true)));
      expect(viewport.getAttribute('viewBox')).toBe(asset.viewBox);
      expect(viewport.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
      expect(Math.abs(width - asset.width * instance.scale)).toBeLessThanOrEqual(0.00051);
      expect(Math.abs(height - asset.height * instance.scale)).toBeLessThanOrEqual(0.00051);
      expect(Math.abs(width / asset.width - height / asset.height)).toBeLessThan(0.00001);
      expect(transform).toContain(`translate(${instance.x} ${instance.y}) rotate(${instance.rotation} `);
      const rotation = transform.match(/rotate\(([^)]+)\)/)![1].split(/\s+/).map(Number);
      expect(Math.abs(rotation[1] - asset.width * instance.scale / 2)).toBeLessThanOrEqual(0.00051);
      expect(Math.abs(rotation[2] - asset.height * instance.scale / 2)).toBeLessThanOrEqual(0.00051);

      actual.forEach((element, pathIndex) => {
        for (const attribute of ['fill', 'stroke']) {
          const original = expected[pathIndex].getAttribute(attribute);
          const recolored = original === null ? null : colorExpectations[palette][original] ?? original;
          expect(element.getAttribute(attribute)).toBe(recolored);
        }
      });
    });
    expect(loadedAssets.map((asset) => asset.pathsMarkup)).toEqual(before);
  });
});
