export interface Palette {
  id: string;
  name: string;
  note: string;
  background: [string, string, string];
  objects: [string, string, string];
  canvas: string;
}

export const PALETTES: Palette[] = [
  {
    id: 'lavender',
    name: 'Lavender',
    note: 'Soft · thoughtful',
    background: ['#D7CDF5', '#AA9BF0', '#7864D7'],
    objects: ['#F9ECB0', '#F9A3AA', '#FFE3E1'],
    canvas: '#FFFEFC',
  },
  {
    id: 'peach',
    name: 'Peach',
    note: 'Warm · welcoming',
    background: ['#FDD7B9', '#FAC896', '#D27532'],
    objects: ['#F9ECB0', '#80DADA', '#BEEBEB'],
    canvas: '#FFFCF8',
  },
  {
    id: 'mint',
    name: 'Mint',
    note: 'Fresh · clear',
    background: ['#BEEBEB', '#80DADA', '#5ABEBE'],
    objects: ['#FFD4F2', '#6D7BFC', '#B6C6FE'],
    canvas: '#F8FEFD',
  },
];

const SOURCE_COLOR_ROLES: Record<string, { group: 'background' | 'objects'; index: 0 | 1 | 2 }> = {
  '#D7CDF5': { group: 'background', index: 0 },
  '#AA9BF0': { group: 'background', index: 1 },
  '#7864D7': { group: 'background', index: 2 },
  '#F9ECB0': { group: 'objects', index: 0 },
  '#F9A3AA': { group: 'objects', index: 1 },
  '#FFE3E1': { group: 'objects', index: 2 },
};

export function getPalette(id: string): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

export function getColorMap(paletteId: string): Map<string, string> {
  const palette = getPalette(paletteId);
  const map = new Map<string, string>();
  for (const [source, role] of Object.entries(SOURCE_COLOR_ROLES)) {
    map.set(source, palette[role.group][role.index]);
  }
  return map;
}

export function recolorSvgMarkup(markup: string, paletteId: string): string {
  const map = getColorMap(paletteId);
  return markup.replace(/\b(fill|stroke)=(['"])(.*?)\2/gi, (_attribute, name: string, quote: string, value: string) => {
    const replacement = map.get(value.toUpperCase()) ?? value;
    return `${name}=${quote}${replacement}${quote}`;
  });
}
