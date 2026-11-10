import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/manifest.json';
import { buildComposition, markLlmFallback } from './autoCompose';
import { LAYOUT_TEMPLATES } from './autoLayout';
import { serializeSceneSvg } from './exportSvg';
import { createScene, duplicateInstance, moveInstance, moveLayer, removeInstance, resizeScene, SIZE_PRESETS, updateInstance } from './scene';
import type { CompositionScene, SvgAsset } from './types';

const assets: SvgAsset[] = manifest.assets.map((entry) => ({
  ...entry,
  role: entry.role as SvgAsset['role'],
  pathsMarkup: new DOMParser().parseFromString(readFileSync(`public/assets/${entry.filename}`, 'utf8'), 'image/svg+xml').documentElement.firstElementChild!.innerHTML,
}));

function assertWithinScene(scene: CompositionScene) {
  const boxes = scene.instances.map((instance) => {
    const asset = assets.find((item) => item.id === instance.assetId)!;
    expect(asset).toBeDefined();
    const box = { x: instance.x, y: instance.y, right: instance.x + asset.width * instance.scale, bottom: instance.y + asset.height * instance.scale };
    expect(box.x).toBeGreaterThan(0);
    expect(box.y).toBeGreaterThan(0);
    expect(box.right).toBeLessThan(scene.size.width);
    expect(box.bottom).toBeLessThan(scene.size.height);
    return box;
  });
  boxes.forEach((a, index) => boxes.slice(index + 1).forEach((b) => {
    expect(a.right < b.x || b.right < a.x || a.bottom < b.y || b.bottom < a.y).toBe(true);
  }));
}

describe('complete automatic composition scenarios', () => {
  for (const mode of ['theme', 'objects'] as const) {
    it(`${mode}: uses current size and palette across all templates`, () => {
      for (const size of SIZE_PRESETS) for (const template of LAYOUT_TEMPLATES) {
        const current = createScene(size, 'Existing project', 'mint');
        const result = buildComposition(current, assets, { mode, input: mode === 'theme' ? 'Свет знаний и новые идеи' : 'книга, desk lamp, цветы, компакт-диск', template: template.id, revision: 0 });
        expect(result.feedback.status).toBe('success');
        expect(result.scene!.size).toEqual(size);
        expect(result.scene!.palette).toBe('mint');
        expect(result.scene!.instances.length).toBeGreaterThanOrEqual(3);
        expect(current.instances).toHaveLength(0);
        assertWithinScene(result.scene!);
      }
    });
  }

  it('rebuilds the scene after manual edits without accumulating old layers', () => {
    const request = { mode: 'objects' as const, input: 'книга, phone, лампа', template: 'diagonal' as const, revision: 0 };
    const first = buildComposition(createScene(), assets, request).scene!;
    const edited = duplicateInstance(moveInstance(first, first.instances[0].id, -500, -400), first.instances[0].id);
    const snapshot = JSON.stringify(edited);
    const rebuilt = buildComposition(edited, assets, { ...request, revision: 1 }).scene!;
    expect(rebuilt.instances).toHaveLength(3);
    expect(rebuilt.instances.map((item) => item.assetId)).toEqual(['book', 'phone', 'desk-lamp']);
    expect(rebuilt.instances.some((item) => edited.instances.some((old) => old.id === item.id))).toBe(false);
    expect(JSON.stringify(edited)).toBe(snapshot);
    assertWithinScene(rebuilt);
  });

  it('makes partial matches and neutral fallback explicit, without inventing assets', () => {
    const partial = buildComposition(createScene(), assets, { mode: 'objects', input: 'book, ракета, phone, book', template: 'balanced', revision: 0 });
    expect(partial.feedback.status).toBe('partial');
    expect(partial.feedback.missing).toEqual(['ракета']);
    expect(partial.scene!.instances.map((item) => item.assetId)).toEqual(['book', 'phone', 'book']);
    const fallback = buildComposition(createScene(), assets, { mode: 'theme', input: 'Зефир на орбите Сатурна', template: 'hero', revision: 0 });
    expect(fallback.feedback.strategy).toBe('neutral-fallback');
    expect(fallback.feedback.message).toMatch(/не распознана/);
    assertWithinScene(fallback.scene!);
  });

  it('leaves the old scene intact on empty, unknown, unavailable or overlong lists', () => {
    const current = buildComposition(createScene(), assets, { mode: 'objects', input: 'book, phone', template: 'hero', revision: 0 }).scene!;
    const before = JSON.stringify(current);
    for (const input of ['', 'ракета и чайник', Array(41).fill('book').join(','), 'a'.repeat(2001)]) {
      const result = buildComposition(current, assets, { mode: 'objects', input, template: 'balanced', revision: 1 });
      expect(result.scene).toBeNull();
      expect(result.feedback.status).toBe('error');
      expect(JSON.stringify(current)).toBe(before);
    }
    expect(buildComposition(current, [], { mode: 'theme', input: 'знания', template: 'balanced', revision: 0 }).scene).toBeNull();
  });

  it('uniformly fits an automatic composition when switching canvas sizes', () => {
    const scene = buildComposition(createScene(), assets, { mode: 'objects', input: 'book, phone, lamp, tulips', template: 'hero', revision: 0 }).scene!;
    for (const size of SIZE_PRESETS) {
      const resized = resizeScene(scene, size);
      assertWithinScene(resized);
      expect(resized.instances.map((item) => item.id)).toEqual(scene.instances.map((item) => item.id));
      const factors = resized.instances.map((item, index) => item.scale / scene.instances[index].scale);
      expect(factors.every((factor) => Math.abs(factor - factors[0]) < 1e-12)).toBe(true);
    }
  });

  it('keeps manual transforms, duplication, deletion, layers and vector export working after auto-build', () => {
    let scene = buildComposition(createScene(), assets, { mode: 'theme', input: 'Музыка и общий ритм', template: 'balanced', revision: 0 }).scene!;
    const first = scene.instances[0];
    scene = moveInstance(scene, first.id, 42, 67);
    scene = updateInstance(scene, first.id, { rotation: 31, scale: 0.4 });
    scene = duplicateInstance(scene, first.id, 'manual-copy');
    scene = moveLayer(scene, 'manual-copy', 'backward');
    scene = removeInstance(scene, first.id);
    const copy = scene.instances.find((item) => item.id === 'manual-copy')!;
    expect(copy).toMatchObject({ x: 70, y: 95, rotation: 31, scale: 0.4 });
    const xml = new DOMParser().parseFromString(serializeSceneSvg(scene, assets), 'image/svg+xml');
    expect(xml.querySelector('parsererror, image, foreignObject')).toBeNull();
    expect(Array.from(xml.querySelectorAll(':scope > g')).map((group) => group.getAttribute('data-asset-id'))).toEqual(scene.instances.map((item) => item.assetId));
    const group = xml.getElementById('layer-manual-copy')!;
    const original = assets.find((asset) => asset.id === copy.assetId)!;
    const source = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${original.pathsMarkup}</svg>`, 'image/svg+xml');
    expect(Array.from(group.querySelectorAll('path'), (path) => path.getAttribute('d'))).toEqual(Array.from(source.querySelectorAll('path'), (path) => path.getAttribute('d')));
  });

  it('builds an LLM selection only from whitelisted manifest assets and preserves scene settings', () => {
    const current = createScene(SIZE_PRESETS[2], 'Before LLM', 'peach');
    const result = buildComposition(current, assets, {
      mode: 'theme', input: 'Знания освещают путь', template: 'hero', revision: 2,
    }, {
      mode: 'llm',
      model: 'mock-model',
      selections: [
        { assetId: 'book', role: 'знания' },
        { assetId: 'desk-lamp', role: 'свет' },
      ],
    });

    expect(result.feedback.strategy).toBe('llm');
    expect(result.feedback.message).toContain('проверен по текущему manifest');
    expect(result.scene?.instances.map((item) => item.assetId)).toEqual(['book', 'desk-lamp']);
    expect(result.scene?.size).toEqual(SIZE_PRESETS[2]);
    expect(result.scene?.palette).toBe('peach');
    assertWithinScene(result.scene!);
  });

  it('rejects an unverified LLM ID and marks local fallback without changing its vector scene', () => {
    const rejected = buildComposition(createScene(), assets, {
      mode: 'theme', input: 'Новый мир', template: 'balanced', revision: 0,
    }, {
      mode: 'llm', model: 'mock-model', selections: [{ assetId: 'invented-object' }],
    });
    expect(rejected.scene).toBeNull();
    expect(rejected.feedback.status).toBe('error');

    const local = buildComposition(createScene(), assets, {
      mode: 'theme', input: 'Свет знаний', template: 'balanced', revision: 0,
    });
    const fallback = markLlmFallback(local, 'endpoint и model не настроены');
    expect(fallback.scene).toBe(local.scene);
    expect(fallback.feedback.strategy).toBe('llm-fallback-local');
    expect(fallback.feedback.message).toContain('LLM не использована');
  });
});
