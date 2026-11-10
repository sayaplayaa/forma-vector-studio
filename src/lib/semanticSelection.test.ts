import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/manifest.json';
import { resolveObjectNames, selectAssetsForTheme } from './semanticSelection';
import type { AssetManifestEntry } from './types';

const assets = manifest.assets as AssetManifestEntry[];
const ids = (values: readonly AssetManifestEntry[]) => values.map((asset) => asset.id);

describe('named-object selection from the real manifest', () => {
  it('recognizes Russian/English names, ё, synonyms, and list separators', () => {
    const input = 'КНИГА; phone / НАСТОЛЬНАЯ ЛАМПА + headphones & тюльпаны\nкошелёк и pen and paper sheets | детали пазла, CD';
    const result = resolveObjectNames(input, assets);
    expect(ids(result.matches)).toEqual(['book', 'phone', 'desk-lamp', 'headphones', 'tulips', 'wallet', 'pen', 'paper', 'puzzle-pieces', 'compact-disc']);
    expect(result.missing).toEqual([]);
  });

  it('takes the longest complete name and also accepts space-separated names', () => {
    const result = resolveObjectNames('открытая книга шариковая ручка настольная лампа', assets);
    expect(ids(result.matches)).toEqual(['book', 'pen', 'desk-lamp']);
    expect(result.missing).toEqual([]);
  });

  it('preserves explicit shadow variants and exact manifest IDs', () => {
    const result = resolveObjectNames('book-silhouette; тень лампы; Phone shadow; фоновые цветы', assets);
    expect(ids(result.matches)).toEqual(['book-silhouette', 'lamp-silhouette', 'phone-silhouette', 'tulips-silhouette']);
    expect(result.missing).toEqual([]);
  });

  it('retains repeated requested objects and reports unknown objects', () => {
    const result = resolveObjectNames('книга, book, книгу, ракета и чайник', assets);
    expect(ids(result.matches)).toEqual(['book', 'book', 'book']);
    expect(result.missing).toEqual(['ракета', 'чайник']);
  });

  it('never substitutes a foreground object for an unavailable requested shadow', () => {
    const subset = assets.filter((asset) => asset.id === 'book');
    const result = resolveObjectNames('phone; тень книги; книга', subset);
    expect(ids(result.matches)).toEqual(['book']);
    expect(result.missing).toEqual(['phone', 'тень книги']);
  });

  it('does not use substring matches or arbitrarily resolve ambiguous generic tags', () => {
    const result = resolveObjectNames('penny; music', assets);
    expect(result.matches).toEqual([]);
    expect(result.missing).toEqual(['penny', 'music']);
  });

  it('handles empty input and an empty catalog', () => {
    expect(resolveObjectNames(' , ; ', assets)).toEqual({ matches: [], missing: [] });
    expect(resolveObjectNames('книга', [])).toEqual({ matches: [], missing: ['книга'] });
  });
});

describe('transparent local theme selection', () => {
  it('associates a Russian knowledge metaphor with existing learning objects', () => {
    const result = selectAssetsForTheme('Свет знаний и новые открытия', assets);
    expect(result.strategy).toBe('local-keywords');
    expect(ids(result.matches)).toContain('book');
    expect(ids(result.matches)).toContain('desk-lamp');
    expect(result.notice).toContain('эвристика');
    expect(result.reasons.some((reason) => reason.reason.includes('знания'))).toBe(true);
  });

  it('supports English topics and mixes Russian finance/growth associations', () => {
    const music = selectAssetsForTheme('Music brings people together on the same wavelength', assets);
    expect(ids(music.matches)).toEqual(expect.arrayContaining(['headphones', 'compact-disc', 'phone']));
    const finance = selectAssetsForTheme('Рост бизнеса и финансовая свобода', assets);
    expect(ids(finance.matches)).toEqual(expect.arrayContaining(['wallet', 'tulips', 'paper']));
  });

  it('uses an honestly labeled neutral fallback for an unrecognized phrase', () => {
    const result = selectAssetsForTheme('Бирюзовый зефир на орбите', assets);
    expect(result.strategy).toBe('neutral-fallback');
    expect(result.matches.length).toBeGreaterThanOrEqual(3);
    expect(result.matches.length).toBeLessThanOrEqual(5);
    expect(result.notice).toContain('не распознана');
    expect(result.notice).toContain('нейтральный');
  });

  it('uses only supplied manifest entries, including an available shadow alternative', () => {
    const subset = assets.filter((asset) => ['book', 'lamp-silhouette'].includes(asset.id));
    const result = selectAssetsForTheme('Свет знаний', subset);
    expect(ids(result.matches)).toEqual(['book', 'lamp-silhouette']);
    expect(result.matches.every((asset) => subset.includes(asset))).toBe(true);
  });

  it('caps selection, avoids duplicate IDs, and does not mutate manifest objects', () => {
    const snapshot = JSON.stringify(assets);
    for (const phrase of ['новые идеи', 'тихая работа', 'рост бизнеса', 'телефон телефон', 'unrecognized words']) {
      const result = selectAssetsForTheme(phrase, assets, 3);
      expect(result.matches.length).toBeLessThanOrEqual(3);
      expect(new Set(ids(result.matches)).size).toBe(result.matches.length);
      expect(result.matches.every((asset) => assets.includes(asset))).toBe(true);
      expect(result.reasons.map((reason) => reason.assetId)).toEqual(ids(result.matches));
    }
    expect(JSON.stringify(assets)).toBe(snapshot);
  });

  it('does not select on empty input or fabricate objects for an empty catalog', () => {
    expect(selectAssetsForTheme(' ', assets).strategy).toBe('empty');
    expect(selectAssetsForTheme('знания', []).matches).toEqual([]);
    expect(selectAssetsForTheme('знания', assets, 0).matches).toEqual([]);
  });
});
