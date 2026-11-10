import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_THEME_LENGTH = 2000;
export const MAX_SELECTIONS = 8;

export class LlmProxyError extends Error {
  constructor(code, message, status = 502, options = {}) {
    super(message, options);
    this.name = 'LlmProxyError';
    this.code = code;
    this.status = status;
  }
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed.at(-1) === '"') {
    return trimmed.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (trimmed.length >= 2 && trimmed[0] === "'" && trimmed.at(-1) === "'") return trimmed.slice(1, -1);
  return trimmed.replace(/\s+#.*$/, '').trim();
}

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = unquoteEnvValue(match[2]);
  }
  return values;
}

export async function loadLlmConfig({ cwd = process.cwd(), env = process.env } = {}) {
  let fileValues = {};
  try {
    fileValues = parseEnvText(await readFile(path.join(cwd, '.env'), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const merged = { ...fileValues, ...env };
  const endpoint = String(merged.FORMA_LLM_ENDPOINT ?? '').trim();
  const model = String(merged.FORMA_LLM_MODEL ?? '').trim();
  const apiKey = String(merged.FORMA_LLM_API_KEY ?? '').trim();
  const rawTimeout = Number(merged.FORMA_LLM_TIMEOUT_MS ?? 20_000);
  const timeoutMs = Number.isFinite(rawTimeout) ? Math.min(60_000, Math.max(1_000, rawTimeout)) : 20_000;
  return { endpoint, model, apiKey, timeoutMs, configured: Boolean(endpoint && model) };
}

export async function loadManifestAssets(projectRoot = process.cwd()) {
  const manifestPath = path.join(projectRoot, 'public', 'assets', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!manifest || !Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new Error('Asset manifest contains no assets.');
  }
  const ids = new Set();
  return manifest.assets.map((asset) => {
    if (!asset || typeof asset.id !== 'string' || !asset.id || ids.has(asset.id)) {
      throw new Error('Asset manifest contains an invalid or duplicate ID.');
    }
    if (asset.role !== 'foreground' && asset.role !== 'background') {
      throw new Error(`Asset ${asset.id} has an invalid role.`);
    }
    ids.add(asset.id);
    return {
      id: asset.id,
      name: String(asset.name ?? asset.id),
      role: asset.role,
      category: String(asset.category ?? ''),
      tags: Array.isArray(asset.tags) ? asset.tags.map(String) : [],
    };
  });
}

function stripSingleCodeFence(value) {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value.trim());
  return match ? match[1] : value.trim();
}

function assertPlainSemanticRole(role) {
  if (role === undefined) return undefined;
  if (typeof role !== 'string') throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model returned an invalid semantic role.');
  const normalized = role.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 100
      || /[<>{}\[\]\r\n]/.test(normalized)
      || /(?:https?:\/\/|data:|url\s*\()/i.test(normalized)
      || /\b(?:m|l|c|q|h|v|s|t|a|z)\s*-?(?:\d|\.)/i.test(normalized)) {
    throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model returned an invalid semantic role.');
  }
  return normalized;
}

/**
 * Accepts only {"objects":[{"id":"manifest-id","role":"optional text"}]}.
 * Unknown IDs or extra fields reject the whole response so unsafe partial output
 * can never cross the server boundary.
 */
export function validateModelSelection(content, allowedAssets) {
  if (typeof content !== 'string' || content.length === 0 || content.length > 20_000) {
    throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model did not return a usable JSON response.');
  }
  let payload;
  try {
    payload = JSON.parse(stripSingleCodeFence(content));
  } catch (error) {
    throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model did not return valid JSON.', 502, { cause: error });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).length !== 1 || !Array.isArray(payload.objects)) {
    throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model response does not match the selection contract.');
  }
  if (payload.objects.length === 0 || payload.objects.length > MAX_SELECTIONS) {
    throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model returned an invalid number of objects.');
  }

  const allowedIds = new Set(allowedAssets.map((asset) => asset.id));
  const seen = new Set();
  const selections = [];
  for (const value of payload.objects) {
    let id;
    let role;
    if (typeof value === 'string') {
      id = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.some((key) => key !== 'id' && key !== 'role') || !keys.includes('id')) {
        throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model returned fields outside the selection contract.');
      }
      id = value.id;
      role = assertPlainSemanticRole(value.role);
    } else {
      throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model returned an invalid object selection.');
    }
    if (typeof id !== 'string' || !allowedIds.has(id)) {
      throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model selected an object outside the asset manifest.');
    }
    if (seen.has(id)) continue;
    seen.add(id);
    selections.push(role ? { assetId: id, role } : { assetId: id });
  }
  if (!selections.length) throw new LlmProxyError('MODEL_RESPONSE_INVALID', 'Model returned no unique manifest objects.');
  return selections;
}

export function createSelectionMessages(theme, assets) {
  const catalog = assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    sourceRole: asset.role,
    category: asset.category,
    tags: asset.tags,
  }));
  return [
    {
      role: 'system',
      content: [
        'You select existing SVG illustration objects for a composition.',
        'Return JSON only, with exactly this shape: {"objects":[{"id":"existing-id","role":"optional short semantic role"}]}.',
        `Select 3 to ${Math.min(6, MAX_SELECTIONS)} useful objects when the catalog permits.`,
        'Every id MUST be copied verbatim from the catalog. Do not invent IDs.',
        'Do not return SVG, paths, coordinates, images, URLs, markup, prose, or any other fields.',
        `Allowed catalog: ${JSON.stringify(catalog)}`,
      ].join('\n'),
    },
    { role: 'user', content: theme },
  ];
}

function assistantContent(responsePayload) {
  const content = responsePayload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('');
    if (text) return text;
  }
  throw new LlmProxyError('UPSTREAM_RESPONSE_INVALID', 'LLM endpoint returned an unsupported response.');
}

export async function requestThemeSelection({ theme, assets, config, fetchImpl = fetch }) {
  const normalizedTheme = typeof theme === 'string' ? theme.trim() : '';
  if (!normalizedTheme || normalizedTheme.length > MAX_THEME_LENGTH) {
    throw new LlmProxyError('INVALID_REQUEST', 'Theme must contain 1 to 2000 characters.', 400);
  }
  if (!config?.configured || !config.endpoint || !config.model) {
    throw new LlmProxyError('LLM_NOT_CONFIGURED', 'LLM integration is not configured.', 503);
  }
  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
  } catch (error) {
    throw new LlmProxyError('LLM_CONFIG_INVALID', 'LLM endpoint is invalid.', 503, { cause: error });
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new LlmProxyError('LLM_CONFIG_INVALID', 'LLM endpoint must use HTTP or HTTPS.', 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 20_000);
  let response;
  try {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: createSelectionMessages(normalizedTheme, assets),
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE';
    const status = code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
    throw new LlmProxyError(code, code === 'UPSTREAM_TIMEOUT' ? 'LLM endpoint timed out.' : 'LLM endpoint is unavailable.', status, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new LlmProxyError('UPSTREAM_ERROR', 'LLM endpoint rejected the request.', 502);
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new LlmProxyError('UPSTREAM_RESPONSE_INVALID', 'LLM endpoint returned invalid JSON.', 502, { cause: error });
  }
  return validateModelSelection(assistantContent(payload), assets);
}
