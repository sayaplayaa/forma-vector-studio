import type { AssetManifestEntry, CompositionScene, CompositionSize, SceneInstance, SvgAsset } from './types';

export const SIZE_PRESETS: CompositionSize[] = [
  { id: 'landscape', name: 'Landscape', width: 1280, height: 720 },
  { id: 'square', name: 'Square', width: 1024, height: 1024 },
  { id: 'portrait', name: 'Portrait', width: 720, height: 1024 },
];

let fallbackId = 0;
export function createId(prefix = 'object'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  fallbackId += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

export function createScene(size = SIZE_PRESETS[0], name = 'Untitled composition', palette = 'lavender'): CompositionScene {
  return { name, size: { ...size }, palette, instances: [] };
}

export function instanceDimensions(asset: Pick<AssetManifestEntry, 'width' | 'height'>, instance: Pick<SceneInstance, 'scale'>) {
  return { width: asset.width * instance.scale, height: asset.height * instance.scale };
}

export function fitScale(asset: Pick<AssetManifestEntry, 'width' | 'height'>, scene: CompositionScene): number {
  return Math.min(400 / asset.width, 300 / asset.height, scene.size.width * 0.6 / asset.width, scene.size.height * 0.62 / asset.height);
}

export function addAsset(scene: CompositionScene, asset: SvgAsset | AssetManifestEntry, id = createId()): CompositionScene {
  const scale = fitScale(asset, scene);
  const width = asset.width * scale;
  const height = asset.height * scale;
  const offset = scene.instances.length * 22;
  const instance: SceneInstance = {
    id,
    assetId: asset.id,
    x: Math.max(16, (scene.size.width - width) / 2 + offset),
    y: Math.max(16, (scene.size.height - height) / 2 + offset),
    scale,
    rotation: 0,
  };
  return { ...scene, instances: [...scene.instances, instance] };
}

export function updateInstance(scene: CompositionScene, id: string, update: Partial<Omit<SceneInstance, 'id' | 'assetId'>>): CompositionScene {
  return { ...scene, instances: scene.instances.map((instance) => instance.id === id ? { ...instance, ...update } : instance) };
}

export function moveInstance(scene: CompositionScene, id: string, x: number, y: number): CompositionScene {
  return updateInstance(scene, id, { x, y });
}

export function removeInstance(scene: CompositionScene, id: string): CompositionScene {
  return { ...scene, instances: scene.instances.filter((instance) => instance.id !== id) };
}

export function duplicateInstance(scene: CompositionScene, id: string, nextId = createId()): CompositionScene {
  const original = scene.instances.find((instance) => instance.id === id);
  if (!original) return scene;
  const copy = { ...original, id: nextId, x: original.x + 28, y: original.y + 28 };
  return { ...scene, instances: [...scene.instances, copy] };
}

export function moveLayer(scene: CompositionScene, id: string, direction: 'forward' | 'backward'): CompositionScene {
  const index = scene.instances.findIndex((instance) => instance.id === id);
  const targetIndex = direction === 'forward' ? index + 1 : index - 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= scene.instances.length) return scene;
  const instances = [...scene.instances];
  [instances[index], instances[targetIndex]] = [instances[targetIndex], instances[index]];
  return { ...scene, instances };
}

export function resizeScene(scene: CompositionScene, size: CompositionSize): CompositionScene {
  const factor = Math.min(size.width / scene.size.width, size.height / scene.size.height);
  const offsetX = (size.width - scene.size.width * factor) / 2;
  const offsetY = (size.height - scene.size.height * factor) / 2;
  return {
    ...scene,
    size: { ...size },
    instances: scene.instances.map((instance) => ({ ...instance, x: instance.x * factor + offsetX, y: instance.y * factor + offsetY, scale: instance.scale * factor })),
  };
}

export function findAssetsByNames(input: string, assets: SvgAsset[]): { matches: SvgAsset[]; missing: string[] } {
  const requested = input.split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean);
  const matches: SvgAsset[] = [];
  const missing: string[] = [];
  for (const name of requested) {
    const normalized = name.toLocaleLowerCase();
    const asset = assets.find((candidate) => candidate.role === 'foreground' && (
      candidate.name.toLocaleLowerCase() === normalized ||
      candidate.id.toLocaleLowerCase() === normalized ||
      candidate.tags.some((tag) => tag.toLocaleLowerCase() === normalized)
    ));
    if (asset) matches.push(asset);
    else missing.push(name);
  }
  return { matches, missing };
}
