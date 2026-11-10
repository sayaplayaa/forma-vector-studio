import type { AssetManifestEntry, SvgAsset } from './types';

export interface AssetLibraryManifest {
  source: { file: string; sha256: string; width: number; height: number; rootPathCount: number; excludedPathCount: number; excludedReason: string };
  assets: AssetManifestEntry[];
}

async function readResponse(response: Response, url: string): Promise<string> {
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.text();
}

export async function loadAssets(fetcher: typeof fetch = fetch, baseUrl = '/assets/'): Promise<SvgAsset[]> {
  const manifestUrl = `${baseUrl}manifest.json`;
  const manifestResponse = await fetcher(manifestUrl);
  const manifestText = await readResponse(manifestResponse, manifestUrl);
  let manifest: AssetLibraryManifest;
  try {
    manifest = JSON.parse(manifestText) as AssetLibraryManifest;
  } catch {
    throw new Error('Asset manifest is not valid JSON.');
  }
  if (!manifest || !Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new Error('Asset manifest contains no assets.');
  }

  return Promise.all(manifest.assets.map(async (entry) => {
    if (!entry.id || !entry.filename || !entry.viewBox || !Number.isFinite(entry.pathCount)) {
      throw new Error('Asset manifest contains an incomplete asset record.');
    }
    const url = `${baseUrl}${entry.filename}`;
    const response = await fetcher(url);
    const svgText = await readResponse(response, url);
    const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (document.querySelector('parsererror')) throw new Error(`${entry.name} has invalid SVG XML.`);
    const root = document.documentElement;
    if (root.localName !== 'svg' || root.getAttribute('viewBox') !== entry.viewBox) {
      throw new Error(`${entry.name} SVG root does not match the manifest viewBox.`);
    }
    const paths = Array.from(root.querySelectorAll('path'));
    if (paths.length !== entry.pathCount) {
      throw new Error(`${entry.name} expected ${entry.pathCount} vector paths but found ${paths.length}.`);
    }
    if (root.querySelector('image, foreignObject')) throw new Error(`${entry.name} contains a non-vector embedded image.`);
    const pathsMarkup = root.firstElementChild?.innerHTML;
    if (!pathsMarkup) throw new Error(`${entry.name} contains no extracted vector geometry.`);
    return { ...entry, pathsMarkup };
  }));
}
