import type { SceneInstance } from '../lib/types';

export interface ExamplePreset {
  id: string;
  title: string;
  subtitle: string;
  sizeId: 'landscape' | 'square' | 'portrait';
  palette: string;
  objects: Array<Pick<SceneInstance, 'assetId' | 'x' | 'y' | 'scale' | 'rotation'>>;
}

export const EXAMPLES: ExamplePreset[] = [
  {
    id: 'ideas-connect',
    title: 'Ideas that connect',
    subtitle: 'Reading, playful problem solving, and a little room to grow.',
    sizeId: 'landscape',
    palette: 'lavender',
    objects: [
      { assetId: 'book', x: 82, y: 74, scale: 0.23, rotation: -5 },
      { assetId: 'phone-silhouette', x: 515, y: 118, scale: 0.34, rotation: 7 },
      { assetId: 'puzzle-pieces', x: 545, y: 410, scale: 0.46, rotation: -8 },
      { assetId: 'tulips', x: 920, y: 116, scale: 0.3, rotation: 4 },
      { assetId: 'pen', x: 835, y: 505, scale: 0.58, rotation: 12 },
    ],
  },
  {
    id: 'calmer-workspace',
    title: 'A calmer workspace',
    subtitle: 'Small tools for focus, notes, and a quiet reset.',
    sizeId: 'square',
    palette: 'peach',
    objects: [
      { assetId: 'paper', x: 96, y: 165, scale: 0.37, rotation: -4 },
      { assetId: 'pen', x: 230, y: 485, scale: 0.55, rotation: -17 },
      { assetId: 'desk-lamp', x: 575, y: 86, scale: 0.22, rotation: -4 },
      { assetId: 'headphones-silhouette', x: 650, y: 660, scale: 0.29, rotation: 8 },
      { assetId: 'tulips', x: 775, y: 260, scale: 0.26, rotation: 5 },
    ],
  },
  {
    id: 'same-wavelength',
    title: 'On the same wavelength',
    subtitle: 'A mix of signals, shared sounds, and creative sparks.',
    sizeId: 'landscape',
    palette: 'mint',
    objects: [
      { assetId: 'phone', x: 96, y: 96, scale: 0.4, rotation: -6 },
      { assetId: 'headphones', x: 440, y: 356, scale: 0.3, rotation: 8 },
      { assetId: 'compact-disc', x: 853, y: 118, scale: 0.75, rotation: 12 },
      { assetId: 'tulips-silhouette', x: 1000, y: 388, scale: 0.26, rotation: -4 },
      { assetId: 'puzzle-silhouette', x: 780, y: 444, scale: 0.42, rotation: -10 },
    ],
  },
];
