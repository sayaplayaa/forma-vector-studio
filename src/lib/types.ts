export type AssetRole = 'foreground' | 'background';

export interface SourceElementRange {
  from: number;
  to: number;
}

export interface AssetManifestEntry {
  id: string;
  name: string;
  role: AssetRole;
  category: string;
  tags: string[];
  filename: string;
  viewBox: string;
  width: number;
  height: number;
  pathCount: number;
  sourceRegion: { x: number; y: number; width: number; height: number };
  sourceElements: SourceElementRange[];
}

export interface SvgAsset extends AssetManifestEntry {
  pathsMarkup: string;
}

export interface CompositionSize {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface SceneInstance {
  id: string;
  assetId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CompositionScene {
  name: string;
  size: CompositionSize;
  palette: string;
  instances: SceneInstance[];
}
