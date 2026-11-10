import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/manifest.json';
import { getColorMap, PALETTES, recolorSvgMarkup } from './palette';

const expected = {
  lavender: {
    background: ['#D7CDF5', '#AA9BF0', '#7864D7'],
    objects: ['#F9ECB0', '#F9A3AA', '#FFE3E1'],
  },
  peach: {
    background: ['#FDD7B9', '#FAC896', '#D27532'],
    objects: ['#F9ECB0', '#80DADA', '#BEEBEB'],
  },
  mint: {
    background: ['#BEEBEB', '#80DADA', '#5ABEBE'],
    objects: ['#FFD4F2', '#6D7BFC', '#B6C6FE'],
  },
} as const;

describe('source palette roles', () => {
  it('matches the three six-swatch matrices visible in the supplied SVG', () => {
    for (const palette of PALETTES) {
      expect(palette.background).toEqual(expected[palette.id as keyof typeof expected].background);
      expect(palette.objects).toEqual(expected[palette.id as keyof typeof expected].objects);
    }

    const source = [...expected.lavender.background, ...expected.lavender.objects];
    for (const palette of PALETTES) {
      const target = [...expected[palette.id as keyof typeof expected].background, ...expected[palette.id as keyof typeof expected].objects];
      expect(source.map((color) => getColorMap(palette.id).get(color))).toEqual(target);
    }
    expect(recolorSvgMarkup('<path fill="white"/><path fill="#181817"/>', 'mint'))
      .toBe('<path fill="white"/><path fill="#181817"/>');
  });

  it('keeps silhouette assets on source background swatches without rewriting geometry', () => {
    const objectColumn = new Set(expected.lavender.objects);
    const colorPattern = /\b(?:fill|stroke)=["'](#[0-9a-f]{6})["']/gi;
    const silhouettes = manifest.assets.filter((asset) => asset.role === 'background');
    expect(silhouettes).toHaveLength(10);
    for (const asset of silhouettes) {
      const markup = readFileSync(`public/assets/${asset.filename}`, 'utf8');
      const colors = Array.from(markup.matchAll(colorPattern), (match) => match[1].toUpperCase());
      expect(colors.some((color) => objectColumn.has(color as typeof expected.lavender.objects[number]))).toBe(false);
    }
  });
});
