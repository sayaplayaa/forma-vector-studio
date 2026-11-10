import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/manifest.json';
import { PALETTES } from '../lib/palette';
import { serializeSceneSvg } from '../lib/exportSvg';
import { SIZE_PRESETS } from '../lib/scene';
import type { CompositionScene, SvgAsset } from '../lib/types';
import { EXAMPLES } from './examples';

const assets: SvgAsset[] = manifest.assets.map((entry) => ({
  ...entry,
  role: entry.role as SvgAsset['role'],
  pathsMarkup: new DOMParser()
    .parseFromString(readFileSync(`public/assets/${entry.filename}`, 'utf8'), 'image/svg+xml')
    .documentElement.firstElementChild!.innerHTML,
}));
const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

function sceneForExample(index: number): CompositionScene {
  const example = EXAMPLES[index];
  const size = SIZE_PRESETS.find((item) => item.id === example.sizeId)!;
  return {
    name: example.title,
    size: { ...size },
    palette: example.palette,
    instances: example.objects.map((object, objectIndex) => ({
      id: `${example.id}-${objectIndex}`,
      ...object,
    })),
  };
}

describe('the three demonstration compositions', () => {
  it('reference only real assets, sizes and palettes and remain inside their canvases', () => {
    expect(EXAMPLES).toHaveLength(3);
    expect(new Set(EXAMPLES.map((example) => example.id)).size).toBe(3);
    const sizeIds = new Set(SIZE_PRESETS.map((size) => size.id));
    const paletteIds = new Set(PALETTES.map((palette) => palette.id));

    EXAMPLES.forEach((example, exampleIndex) => {
      expect(sizeIds.has(example.sizeId)).toBe(true);
      expect(paletteIds.has(example.palette)).toBe(true);
      const scene = sceneForExample(exampleIndex);
      scene.instances.forEach((instance) => {
        const asset = assetsById.get(instance.assetId);
        expect(asset, instance.assetId).toBeDefined();
        expect(Number.isFinite(instance.x) && Number.isFinite(instance.y)).toBe(true);
        expect(Number.isFinite(instance.rotation) && Number.isFinite(instance.scale)).toBe(true);
        expect(instance.scale).toBeGreaterThan(0);

        const width = asset!.width * instance.scale;
        const height = asset!.height * instance.scale;
        const radians = instance.rotation * Math.PI / 180;
        const halfAabbWidth = Math.abs(Math.cos(radians)) * width / 2 + Math.abs(Math.sin(radians)) * height / 2;
        const halfAabbHeight = Math.abs(Math.sin(radians)) * width / 2 + Math.abs(Math.cos(radians)) * height / 2;
        const centerX = instance.x + width / 2;
        const centerY = instance.y + height / 2;
        expect(centerX - halfAabbWidth).toBeGreaterThanOrEqual(0);
        expect(centerY - halfAabbHeight).toBeGreaterThanOrEqual(0);
        expect(centerX + halfAabbWidth).toBeLessThanOrEqual(scene.size.width);
        expect(centerY + halfAabbHeight).toBeLessThanOrEqual(scene.size.height);
      });
    });
  });

  it('export as valid editable SVGs with the original paths and preset layer order', () => {
    EXAMPLES.forEach((_example, index) => {
      const scene = sceneForExample(index);
      const document = new DOMParser().parseFromString(serializeSceneSvg(scene, assets), 'image/svg+xml');
      expect(document.querySelector('parsererror, image, foreignObject, script')).toBeNull();
      const layers = Array.from(document.documentElement.children).filter((element) => element.localName === 'g');
      expect(layers.map((layer) => layer.getAttribute('data-asset-id'))).toEqual(scene.instances.map((item) => item.assetId));

      layers.forEach((layer, layerIndex) => {
        const asset = assetsById.get(scene.instances[layerIndex].assetId)!;
        const source = new DOMParser().parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg">${asset.pathsMarkup}</svg>`,
          'image/svg+xml',
        );
        expect(Array.from(layer.querySelectorAll('path'), (path) => path.getAttribute('d')))
          .toEqual(Array.from(source.querySelectorAll('path'), (path) => path.getAttribute('d')));
      });
    });
  });
});
