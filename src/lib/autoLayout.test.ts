import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/manifest.json';
import { layoutAssets, LAYOUT_TEMPLATES, type LayoutTemplate } from './autoLayout';
import { SIZE_PRESETS } from './scene';
import type { AssetManifestEntry, CompositionSize, SceneInstance } from './types';

const catalog = manifest.assets as AssetManifestEntry[];

function checkGeometry(instances: SceneInstance[], requested: readonly AssetManifestEntry[], size: CompositionSize) {
  if (instances.length !== requested.length) throw new Error('Layout dropped a requested object.');
  const margin = Math.min(size.width, size.height) * 0.04;
  const boxes = instances.map((instance, index) => {
    const asset = requested[index];
    if (instance.assetId !== asset.id) throw new Error('Layout changed the requested asset order.');
    if (![instance.x, instance.y, instance.scale].every(Number.isFinite) || instance.scale <= 0) throw new Error('Non-finite transform.');
    if (instance.rotation !== 0) throw new Error('Automatic rotation must stay within the cell bounds.');
    const width = asset.width * instance.scale;
    const height = asset.height * instance.scale;
    const box = { left: instance.x, top: instance.y, right: instance.x + width, bottom: instance.y + height };
    if (box.left < margin - 1e-8 || box.top < margin - 1e-8
      || box.right > size.width - margin + 1e-8 || box.bottom > size.height - margin + 1e-8) {
      throw new Error(`${asset.id} is outside the canvas margin (${size.id}).`);
    }
    if (Math.abs(width / height - asset.width / asset.height) > 1e-8) throw new Error('Object proportions changed.');
    return box;
  });
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first];
      const b = boxes[second];
      // Disjoint complete bounding boxes are stronger than non-overlap of visible paths.
      const separation = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
      if (separation <= 0) throw new Error(`Objects ${first} and ${second} overlap or touch (${size.id}).`);
    }
  }
}

describe('automatic layout using the real SVG manifest', () => {
  for (const template of LAYOUT_TEMPLATES) {
    for (const size of SIZE_PRESETS) {
      it(`${template.id}: fits 1–40 objects with gutters on ${size.id}`, () => {
        for (let count = 1; count <= 40; count += 1) {
          const requested = Array.from({ length: count }, (_, index) => catalog[(index * 7 + count) % catalog.length]);
          for (const revision of [0, 1, 3]) {
            const result = layoutAssets(requested, size, template.id, { revision });
            checkGeometry(result, requested, size);
            if (count <= 8) {
              for (let index = 0; index < count; index += 1) {
                const extent = Math.max(requested[index].width, requested[index].height) * result[index].scale;
                if (extent < Math.min(size.width, size.height) * 0.09) throw new Error('An object is unnecessarily tiny.');
              }
            }
          }
        }
      });
    }
  }

  it('uses distinct templates, preserves repeated assets, and creates fresh layer IDs', () => {
    const requested = [catalog[0], catalog[0], catalog[5], catalog[2], catalog[6]];
    const before = JSON.stringify(requested);
    const results = LAYOUT_TEMPLATES.map(({ id }) => layoutAssets(requested, SIZE_PRESETS[0], id));
    const coordinates = results.map((items) => JSON.stringify(items.map(({ x, y, scale }) => [x, y, scale])));
    expect(new Set(coordinates).size).toBe(3);
    expect(new Set(results.flatMap((items) => items.map(({ id }) => id))).size).toBe(15);
    expect(JSON.stringify(requested)).toBe(before);
    for (const result of results) expect(result.map(({ assetId }) => assetId)).toEqual(requested.map(({ id }) => id));
  });

  it('makes the first requested object the largest in the hero template', () => {
    for (const size of SIZE_PRESETS) {
      for (const first of catalog) {
        const requested = [first, catalog[5], catalog[8], catalog[6]];
        const result = layoutAssets(requested, size, 'hero');
        const areas = result.map((instance, index) => requested[index].width * requested[index].height * instance.scale ** 2);
        expect(Math.max(...areas.slice(1))).toBeLessThan(areas[0]);
      }
    }
  });

  it('repeats coordinates for the same revision but can rebuild a different arrangement', () => {
    const requested = catalog.slice(0, 6);
    const positions = (items: SceneInstance[]) => items.map(({ assetId, x, y, scale, rotation }) => ({ assetId, x, y, scale, rotation }));
    const first = layoutAssets(requested, SIZE_PRESETS[0], 'balanced', { revision: 0 });
    const sameRevision = layoutAssets(requested, SIZE_PRESETS[0], 'balanced', { revision: 0 });
    const nextRevision = layoutAssets(requested, SIZE_PRESETS[0], 'balanced', { revision: 1 });
    expect(positions(first)).toEqual(positions(sameRevision));
    expect(first.map(({ id }) => id)).not.toEqual(sameRevision.map(({ id }) => id));
    expect(positions(first)).not.toEqual(positions(nextRevision));
    expect(positions(layoutAssets([catalog[0]], SIZE_PRESETS[0], 'balanced', { revision: 0 })))
      .not.toEqual(positions(layoutAssets([catalog[0]], SIZE_PRESETS[0], 'balanced', { revision: 1 })));
  });

  it('handles mixed extreme aspect ratios and small or narrow canvases without overlaps', () => {
    const requested = [{ ...catalog[0], width: 10000, height: 2 }, { ...catalog[1], width: 2, height: 10000 }, catalog[5], catalog[8]];
    for (const dimensions of [[80, 60], [50, 1800], [1800, 50], [0.5, 0.25]]) {
      const size = { id: 'custom', name: 'Custom', width: dimensions[0], height: dimensions[1] };
      for (const { id } of LAYOUT_TEMPLATES) checkGeometry(layoutAssets(requested, size, id), requested, size);
    }
  });

  it('returns no layers for an empty selection and rejects invalid inputs explicitly', () => {
    expect(layoutAssets([], SIZE_PRESETS[0], 'balanced')).toEqual([]);
    for (const invalid of [0, -1, NaN, Infinity]) {
      expect(() => layoutAssets([catalog[0]], { ...SIZE_PRESETS[0], width: invalid }, 'balanced')).toThrow();
      expect(() => layoutAssets([{ ...catalog[0], height: invalid }], SIZE_PRESETS[0], 'balanced')).toThrow();
    }
    expect(() => layoutAssets([catalog[0]], SIZE_PRESETS[0], 'missing' as LayoutTemplate)).toThrow(/шаблон/);
    expect(() => layoutAssets([catalog[0]], SIZE_PRESETS[0], 'balanced', { revision: NaN })).toThrow();
    expect(() => layoutAssets([catalog[0]], SIZE_PRESETS[0], 'balanced', { revision: 0.5 })).toThrow();
  });
});
