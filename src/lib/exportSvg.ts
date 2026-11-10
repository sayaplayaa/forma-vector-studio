import { getPalette, recolorSvgMarkup } from './palette';
import { instanceDimensions } from './scene';
import type { CompositionScene, SvgAsset } from './types';

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function number(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function serializeSceneSvg(scene: CompositionScene, assets: SvgAsset[]): string {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const palette = getPalette(scene.palette);
  const layers = scene.instances.map((instance) => {
    const asset = assetsById.get(instance.assetId);
    if (!asset) throw new Error(`Missing vector asset: ${instance.assetId}.`);
    const { width, height } = instanceDimensions(asset, instance);
    const markup = recolorSvgMarkup(asset.pathsMarkup, scene.palette);
    return [
      `  <g id="layer-${escapeXml(instance.id)}" data-asset-id="${escapeXml(asset.id)}" data-asset-name="${escapeXml(asset.name)}" transform="translate(${number(instance.x)} ${number(instance.y)}) rotate(${number(instance.rotation)} ${number(width / 2)} ${number(height / 2)})">`,
      `    <svg x="0" y="0" width="${number(width)}" height="${number(height)}" viewBox="${asset.viewBox}" preserveAspectRatio="xMidYMid meet">`,
      `      <g fill="none">${markup}</g>`,
      '    </svg>',
      '  </g>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.size.width}" height="${scene.size.height}" viewBox="0 0 ${scene.size.width} ${scene.size.height}">`,
    `  <title>${escapeXml(scene.name || 'Vector composition')}</title>`,
    `  <rect width="${scene.size.width}" height="${scene.size.height}" fill="${palette.canvas}"/>`,
    layers,
    '</svg>',
    '',
  ].join('\n');
}
