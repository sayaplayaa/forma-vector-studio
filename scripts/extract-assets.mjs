import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(projectRoot, 'src', 'data', 'verified-assets.json');
const outputDirectory = path.join(projectRoot, 'public', 'assets');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const sourcePath = path.join(projectRoot, config.source.file);
const source = await readFile(sourcePath, 'utf8');
const sourceBytes = await readFile(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');

if (sourceHash !== config.source.sha256) {
  throw new Error(`Source hash mismatch for ${config.source.file}; refusing to extract from changed geometry.`);
}

function tagEnd(xml, start) {
  let quote = '';
  for (let index = start + 1; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index + 1;
    }
  }
  throw new Error(`Unterminated XML tag at byte ${start}.`);
}

function parseTag(token) {
  const content = token.slice(1, -1).trim();
  if (!content || content.startsWith('!') || content.startsWith('?')) return null;
  const closing = content.startsWith('/');
  const name = content.replace(/^\//, '').match(/^[^\s/>]+/)?.[0];
  if (!name) return null;
  return { name, closing, selfClosing: !closing && /\/\s*>$/.test(token) };
}

function readTopLevelElements(xml) {
  const rootStart = xml.search(/<svg\b/i);
  if (rootStart < 0) throw new Error('Source XML has no <svg> root.');
  const rootOpenEnd = tagEnd(xml, rootStart);
  const children = [];
  let position = rootOpenEnd;
  let depth = 0;
  let currentStart = -1;
  let currentName = '';

  while (position < xml.length) {
    const start = xml.indexOf('<', position);
    if (start < 0) break;
    if (xml.startsWith('<!--', start)) {
      const close = xml.indexOf('-->', start + 4);
      if (close < 0) throw new Error('Unterminated XML comment in source.');
      position = close + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const close = xml.indexOf(']]>', start + 9);
      if (close < 0) throw new Error('Unterminated CDATA section in source.');
      position = close + 3;
      continue;
    }

    const end = tagEnd(xml, start);
    const token = xml.slice(start, end);
    const parsed = parseTag(token);
    position = end;
    if (!parsed) continue;

    if (depth === 0 && parsed.closing && parsed.name.toLowerCase() === 'svg') break;
    if (depth === 0) {
      if (parsed.closing) throw new Error(`Unexpected closing </${parsed.name}> outside a child element.`);
      currentStart = start;
      currentName = parsed.name;
      if (parsed.selfClosing) {
        children.push({ index: children.length, tag: currentName, markup: xml.slice(currentStart, end) });
        currentStart = -1;
        currentName = '';
      } else {
        depth = 1;
      }
      continue;
    }

    if (parsed.closing) depth -= 1;
    else if (!parsed.selfClosing) depth += 1;
    if (depth === 0) {
      children.push({ index: children.length, tag: currentName, markup: xml.slice(currentStart, end) });
      currentStart = -1;
      currentName = '';
    }
  }

  if (depth !== 0 || currentStart >= 0) throw new Error('Source XML ended inside an element.');
  return { rootOpen: xml.slice(rootStart, rootOpenEnd), children };
}

function attribute(xml, name) {
  const match = xml.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

const { rootOpen, children } = readTopLevelElements(source);
const rootWidth = Number(attribute(rootOpen, 'width'));
const rootHeight = Number(attribute(rootOpen, 'height'));
const rootPathCount = children.filter((element) => element.tag === 'path').length;
if (rootWidth !== config.source.width || rootHeight !== config.source.height) {
  throw new Error(`Source dimensions changed: expected ${config.source.width} × ${config.source.height}, found ${rootWidth} × ${rootHeight}.`);
}
if (children.length !== config.source.rootElementCount || rootPathCount !== config.source.rootPathCount) {
  throw new Error(`Source structure changed: found ${children.length} root elements and ${rootPathCount} paths.`);
}

await mkdir(outputDirectory, { recursive: true });
const usedIndexes = new Map();
const assets = [];
for (const definition of config.assets) {
  const selected = [];
  for (const range of definition.sourceElementRanges) {
    if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 || range.to < range.from) {
      throw new Error(`${definition.id} has an invalid source element range.`);
    }
    for (let index = range.from; index <= range.to; index += 1) {
      if (usedIndexes.has(index)) throw new Error(`Source element ${index} is assigned to both ${usedIndexes.get(index)} and ${definition.id}.`);
      const element = children[index];
      if (!element) throw new Error(`${definition.id} references missing root element ${index}.`);
      if (element.tag !== 'path') throw new Error(`${definition.id} references <${element.tag}> at source element ${index}; expected an illustration path.`);
      usedIndexes.set(index, definition.id);
      selected.push(element);
    }
  }
  if (selected.length !== definition.pathCount) {
    throw new Error(`${definition.id} expected ${definition.pathCount} paths but its source ranges select ${selected.length}.`);
  }
  if (selected.some((element, index) => index > 0 && selected[index - 1].index >= element.index)) {
    throw new Error(`${definition.id} source elements are not in original paint order.`);
  }
  const [viewX, viewY, viewWidth, viewHeight] = definition.viewBox.split(/\s+/).map(Number);
  if (![viewX, viewY, viewWidth, viewHeight].every(Number.isFinite) || viewWidth <= 0 || viewHeight <= 0) {
    throw new Error(`${definition.id} has an invalid source viewBox.`);
  }

  const filename = `${definition.id}.svg`;
  const markup = selected.map((element) => element.markup).join('\n');
  if (/\b(?:href|xlink:href)\s*=|url\(/i.test(markup)) {
    throw new Error(`${definition.id} uses a linked resource or definition that must be copied explicitly.`);
  }
  const assetSvg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewWidth}" height="${viewHeight}" viewBox="${definition.viewBox}" fill="none" data-asset-id="${definition.id}">`,
    `<g data-source-elements="${definition.sourceElementRanges.map(({ from, to }) => from === to ? from : `${from}-${to}`).join(',')}">`,
    markup,
    '</g>',
    '</svg>',
  ].join('\n');
  await writeFile(path.join(outputDirectory, filename), assetSvg, 'utf8');
  assets.push({
    id: definition.id,
    name: definition.name,
    role: definition.role,
    category: definition.category,
    tags: definition.tags,
    filename,
    viewBox: definition.viewBox,
    width: viewWidth,
    height: viewHeight,
    pathCount: definition.pathCount,
    sourceRegion: definition.selectionRegion,
    sourceElements: definition.sourceElementRanges,
  });
}

const extractedPathCount = assets.reduce((total, asset) => total + asset.pathCount, 0);
const excludedPathCount = rootPathCount - extractedPathCount;
if (excludedPathCount !== config.source.excludedPathCount) {
  throw new Error(`Expected ${config.source.excludedPathCount} documented non-asset paths; found ${excludedPathCount}.`);
}

await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify({
  source: {
    file: config.source.file,
    sha256: sourceHash,
    width: rootWidth,
    height: rootHeight,
    rootPathCount,
    excludedPathCount,
    excludedReason: config.source.excludedReason,
  },
  assets,
}, null, 2) + '\n', 'utf8');

console.log(`Extracted ${assets.length} verified SVG assets (${extractedPathCount} original paths); documented ${excludedPathCount} non-asset paths.`);
