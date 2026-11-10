import { createId } from './scene';
import type { AssetManifestEntry, CompositionSize, SceneInstance } from './types';

export type LayoutTemplate = 'balanced' | 'hero' | 'diagonal';

export const LAYOUT_TEMPLATES: Array<{ id: LayoutTemplate; name: string; description: string }> = [
  { id: 'balanced', name: 'Равновесие', description: 'Равномерные ряды с одинаковыми отступами.' },
  { id: 'hero', name: 'Главный объект', description: 'Первый объект крупнее, остальные собраны рядом.' },
  { id: 'diagonal', name: 'Диагональ', description: 'Ступенчатые ряды создают движение по холсту.' },
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Placement extends Rect {
  scale: number;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function fitInCell(asset: AssetManifestEntry, cell: Rect, fill: number, maximumScale = Infinity): Placement {
  const scale = Math.min(cell.width / asset.width, cell.height / asset.height, maximumScale) * fill;
  if (!positiveFinite(scale)) throw new RangeError(`Размеры объекта «${asset.name}» невозможно разместить на этом холсте.`);
  const width = asset.width * scale;
  const height = asset.height * scale;
  return {
    x: cell.x + (cell.width - width) / 2,
    y: cell.y + (cell.height - height) / 2,
    width,
    height,
    scale,
  };
}

/** Each object owns a disjoint rectangular cell, including its source shadows. */
function gridCells(count: number, area: Rect, columns: number, preferredGap: number, stepped: boolean): Rect[] {
  const rows = Math.ceil(count / columns);
  // Scale the gutter down for dense or unusually narrow canvases without making a cell negative.
  const gap = Math.min(preferredGap, area.width / (columns * 8), area.height / (rows * 8));
  const horizontalSweep = stepped && rows > 1 ? area.width * 0.22 : 0;
  const verticalSweep = stepped && rows === 1 && count > 1 ? area.height * 0.28 : 0;
  const cellWidth = (area.width - horizontalSweep - gap * (columns - 1)) / columns;
  const cellHeight = (area.height - verticalSweep - gap * (rows - 1)) / rows;
  const cells: Rect[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const rowOffset = (columns - rowCount) * (cellWidth + gap) / 2;
    const sweepX = rows > 1 ? horizontalSweep * row / (rows - 1) : 0;
    const sweepY = count > 1 ? verticalSweep * index / (count - 1) : 0;
    cells.push({
      x: area.x + rowOffset + sweepX + column * (cellWidth + gap),
      y: area.y + sweepY + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    });
  }
  return cells;
}

function bestGrid(
  assets: readonly AssetManifestEntry[],
  area: Rect,
  gap: number,
  fill: number,
  stepped = false,
): Placement[] {
  let best: Placement[] = [];
  let bestScore = -Infinity;
  for (let columns = 1; columns <= assets.length; columns += 1) {
    const cells = gridCells(assets.length, area, columns, gap, stepped);
    const placements = assets.map((asset, index) => fitInCell(asset, cells[index], fill));
    // Compare occupied fractions rather than raw areas to keep large canvas calculations finite.
    const coverage = placements.map((item) => (item.width / area.width) * (item.height / area.height));
    const score = coverage.reduce((total, value) => total + value, 0) + Math.min(...coverage) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = placements;
    }
  }
  return best;
}

function heroLayout(assets: readonly AssetManifestEntry[], area: Rect, preferredGap: number): Placement[] {
  if (assets.length === 1) return [fitInCell(assets[0], area, 0.78)];
  const gap = Math.min(preferredGap, area.width * 0.06, area.height * 0.06);
  const horizontal = area.width >= area.height;
  const available = (horizontal ? area.width : area.height) - gap;
  const heroExtent = available * 0.56;
  const heroCell = horizontal
    ? { ...area, width: heroExtent }
    : { ...area, height: heroExtent };
  const supportingArea = horizontal
    ? { x: area.x + heroExtent + gap, y: area.y, width: available - heroExtent, height: area.height }
    : { x: area.x, y: area.y + heroExtent + gap, width: area.width, height: available - heroExtent };
  const hero = fitInCell(assets[0], heroCell, 0.92);
  const supporting = bestGrid(assets.slice(1), supportingArea, preferredGap, 0.86);

  // Keep the first object visually dominant even if its aspect ratio differs from the others.
  const cappedSupporting = supporting.map((placement, index) => {
    const asset = assets[index + 1];
    const maximumScale = Math.exp((Math.log(hero.width) - Math.log(asset.width)
      + Math.log(hero.height) - Math.log(asset.height) + Math.log(0.55)) / 2);
    if (placement.scale <= maximumScale) return placement;
    const width = asset.width * maximumScale;
    const height = asset.height * maximumScale;
    return {
      x: placement.x + (placement.width - width) / 2,
      y: placement.y + (placement.height - height) / 2,
      width,
      height,
      scale: maximumScale,
    };
  });
  return [hero, ...cappedSupporting];
}

/**
 * Places only supplied manifest entries. No path, color, or source-coordinate data is changed.
 * Cells never overlap, rotation is zero, and the same scalar applies to both object dimensions.
 * `revision` mirrors the composition for a new arrangement while preserving the requested order.
 */
export function layoutAssets(
  assets: readonly AssetManifestEntry[],
  size: CompositionSize,
  template: LayoutTemplate,
  options: { revision?: number } = {},
): SceneInstance[] {
  if (!positiveFinite(size.width) || !positiveFinite(size.height)) {
    throw new RangeError('Ширина и высота холста должны быть положительными конечными числами.');
  }
  if (!LAYOUT_TEMPLATES.some((candidate) => candidate.id === template)) {
    throw new Error(`Неизвестный шаблон композиции: ${String(template)}.`);
  }
  const revision = options.revision ?? 0;
  if (!Number.isSafeInteger(revision)) throw new RangeError('Номер сборки должен быть целым безопасным числом.');
  for (const asset of assets) {
    if (!asset.id || !positiveFinite(asset.width) || !positiveFinite(asset.height)) {
      throw new RangeError(`У объекта «${asset.name || asset.id || '?'}» некорректные размеры в manifest.`);
    }
  }
  if (assets.length === 0) return [];

  const shortSide = Math.min(size.width, size.height);
  const margin = shortSide * 0.055;
  const gap = shortSide * 0.038;
  const area = { x: margin, y: margin, width: size.width - 2 * margin, height: size.height - 2 * margin };
  const phase = ((revision % 4) + 4) % 4;
  let placements: Placement[];
  if (template === 'hero') {
    placements = heroLayout(assets, area, gap);
  } else {
    const fill = assets.length === 1 ? [0.76, 0.7, 0.8, 0.74][phase] : template === 'diagonal' ? 0.88 : 0.9;
    placements = bestGrid(assets, area, gap, fill, template === 'diagonal');
  }

  const generation = createId('layout');
  return placements.map((placement, index) => {
    const x = phase % 2 === 1 ? size.width - placement.x - placement.width : placement.x;
    const y = phase >= 2 ? size.height - placement.y - placement.height : placement.y;
    if (![x, y, placement.scale].every(Number.isFinite) || placement.scale <= 0) {
      throw new RangeError('Композицию невозможно представить с указанными размерами.');
    }
    return { id: `${generation}-${index}`, assetId: assets[index].id, x, y, scale: placement.scale, rotation: 0 };
  });
}
