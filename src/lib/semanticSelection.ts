import { ASSET_VOCABULARY, THEME_RULES } from '../data/asset-semantics';
import type { AssetManifestEntry } from './types';

export interface NameSelection<T> {
  matches: T[];
  missing: string[];
}

export interface ThemeSelection<T> {
  matches: T[];
  reasons: { assetId: string; reason: string }[];
  strategy: 'local-keywords' | 'neutral-fallback' | 'empty';
  notice: string;
}

/** Keep word boundaries: “pen” must never be found inside “open”. */
export function normalizeObjectText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

interface LookupValue<T> {
  priority: number;
  candidates: Map<string, T | undefined>;
}

function createNameLookup<T extends AssetManifestEntry>(assets: readonly T[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const lookup = new Map<string, LookupValue<T>>();
  function add(alias: string, id: string, priority: number) {
    const key = normalizeObjectText(alias);
    if (!key) return;
    const previous = lookup.get(key);
    if (!previous || priority > previous.priority) {
      lookup.set(key, { priority, candidates: new Map([[id, byId.get(id)]]) });
    } else if (priority === previous.priority) {
      previous.candidates.set(id, byId.get(id));
    }
  }

  // Retain vocabulary for absent IDs only to report the whole unavailable name.
  // For example, a missing “тень книги” must not silently become a foreground book.
  for (const vocabulary of ASSET_VOCABULARY) {
    for (const alias of [vocabulary.id, ...vocabulary.aliases]) add(alias, vocabulary.id, 2);
    for (const alias of [vocabulary.shadowId, ...vocabulary.shadowAliases]) add(alias, vocabulary.shadowId, 2);
  }
  for (const asset of assets) {
    add(asset.id, asset.id, 3);
    add(asset.name, asset.id, 3);
    for (const tag of asset.tags) add(tag, asset.id, 1);
  }

  const resolved = new Map<string, T | undefined>();
  for (const [key, value] of lookup) {
    const candidates = Array.from(value.candidates.values()).filter((asset): asset is T => asset !== undefined);
    const foreground = candidates.filter((asset) => asset.role === 'foreground');
    // A broad shared tag such as “music” has no unique named object.
    resolved.set(key, candidates.length === 1 ? candidates[0] : foreground.length === 1 ? foreground[0] : undefined);
  }
  const maxWords = Math.max(1, ...Array.from(resolved.keys(), (key) => key.split(' ').length));
  return { lookup: resolved, maxWords };
}

export function resolveObjectNames<T extends AssetManifestEntry>(input: string, assets: readonly T[]): NameSelection<T> {
  const { lookup, maxWords } = createNameLookup(assets);
  const matches: T[] = [];
  const missing: string[] = [];
  const chunks = input.normalize('NFKC')
    .replace(/(^|[^\p{L}\p{N}])(?:and|и|плюс)(?=$|[^\p{L}\p{N}])/giu, '$1,')
    .split(/[,;\n\r/\\+&|•]+/);

  for (const chunk of chunks) {
    const normalized = normalizeObjectText(chunk);
    if (!normalized) continue;
    const words = normalized.split(' ');
    let unknown: string[] = [];
    const flushUnknown = () => {
      if (unknown.length) missing.push(unknown.join(' '));
      unknown = [];
    };
    for (let start = 0; start < words.length;) {
      let found = false;
      for (let length = Math.min(maxWords, words.length - start); length > 0; length -= 1) {
        const phrase = words.slice(start, start + length).join(' ');
        if (!lookup.has(phrase)) continue;
        flushUnknown();
        const asset = lookup.get(phrase);
        if (asset) matches.push(asset);
        else missing.push(phrase);
        start += length;
        found = true;
        break;
      }
      if (!found) {
        unknown.push(words[start]);
        start += 1;
      }
    }
    flushUnknown();
  }
  return { matches, missing };
}

export function selectAssetsForTheme<T extends AssetManifestEntry>(input: string, assets: readonly T[], limit = 5): ThemeSelection<T> {
  const phrase = normalizeObjectText(input);
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(10, Math.floor(limit))) : 5;
  if (!phrase || assets.length === 0 || count === 0) {
    return { matches: [], reasons: [], strategy: 'empty', notice: !phrase ? 'Введите тему или метафору.' : 'В библиотеке нет доступных объектов для подбора.' };
  }

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const scores = new Map<string, { asset: T; score: number; reasons: Set<string> }>();
  function addScore(id: string, weight: number, reason: string) {
    const vocabulary = ASSET_VOCABULARY.find((item) => item.id === id);
    const asset = byId.get(id) ?? (vocabulary ? byId.get(vocabulary.shadowId) : undefined);
    if (!asset) return;
    const previous = scores.get(asset.id) ?? { asset, score: 0, reasons: new Set<string>() };
    previous.score += weight;
    previous.reasons.add(reason);
    scores.set(asset.id, previous);
  }

  const words = phrase.split(' ');
  for (const rule of THEME_RULES) {
    if (!rule.prefixes.some((prefix) => words.some((word) => word.startsWith(prefix)))) continue;
    for (const [id, weight] of Object.entries(rule.weights)) addScore(id, weight, `Ассоциация: ${rule.label}.`);
  }
  for (const asset of resolveObjectNames(input, assets).matches) {
    addScore(asset.id, 14, 'Объект или его название встречается в запросе.');
  }

  if (scores.size) {
    const ranked = Array.from(scores.values()).sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
    const selected = ranked.slice(0, count);
    return {
      matches: selected.map((item) => item.asset),
      reasons: selected.map((item) => ({ assetId: item.asset.id, reason: Array.from(item.reasons).join(' ') })),
      strategy: 'local-keywords',
      notice: 'Локальная эвристика: подбор по словам и тематическим ассоциациям из словаря, без ИИ-модели и API.',
    };
  }

  const selected: T[] = [];
  const concepts = new Set<string>();
  function append(asset: T | undefined) {
    if (!asset || selected.length >= Math.min(4, count)) return;
    const vocabulary = ASSET_VOCABULARY.find((item) => item.id === asset.id || item.shadowId === asset.id);
    const concept = vocabulary?.id ?? asset.id;
    if (concepts.has(concept)) return;
    selected.push(asset);
    concepts.add(concept);
  }
  for (const id of ['book', 'desk-lamp', 'paper', 'tulips', 'pen']) append(byId.get(id));
  for (const asset of assets.filter((item) => item.role === 'foreground')) append(asset);
  for (const asset of assets) append(asset);
  return {
    matches: selected,
    reasons: selected.map((asset) => ({ assetId: asset.id, reason: 'Нейтральный набор из доступной библиотеки; связь с темой не установлена.' })),
    strategy: 'neutral-fallback',
    notice: 'Тема не распознана локальным словарём. Использован нейтральный набор из существующей библиотеки; его можно изменить вручную.',
  };
}
