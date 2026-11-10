import type { AssetManifestEntry } from './types';

export interface LlmSelectionItem {
  assetId: string;
  role?: string;
}

export interface LlmThemeSelection {
  mode: 'llm';
  model: string;
  selections: LlmSelectionItem[];
}

export type LlmSelectionErrorCode =
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_UPSTREAM_ERROR'
  | 'LLM_INVALID_RESPONSE'
  | 'LLM_REQUEST_FAILED';

export class LlmSelectionError extends Error {
  constructor(public readonly code: LlmSelectionErrorCode, message: string) {
    super(message);
    this.name = 'LlmSelectionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const whitelist = new Set(allowed);
  return Object.keys(value).every((key) => whitelist.has(key));
}

export function isSafeSemanticRole(value: string): boolean {
  const role = value.trim();
  return role.length > 0
    && role.length <= 120
    && !/[<>\u0000-\u001f\u007f]/u.test(role)
    && !/(?:https?:\/\/|data:|url\s*\()/iu.test(role)
    && !/\b(?:m|l|c|q|h|v|s|t|a|z)\s*-?(?:\d|\.)/iu.test(role);
}

/**
 * Revalidates the server response against the manifest already loaded by the editor.
 * The returned structure can reference existing asset IDs only; geometry is never accepted.
 */
export function validateLlmThemeSelection(
  payload: unknown,
  assets: readonly Pick<AssetManifestEntry, 'id'>[],
): LlmThemeSelection {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ['mode', 'model', 'selections'])) {
    throw new LlmSelectionError('LLM_INVALID_RESPONSE', 'Ответ LLM не соответствует разрешённому контракту.');
  }
  if (payload.mode !== 'llm' || typeof payload.model !== 'string') {
    throw new LlmSelectionError('LLM_INVALID_RESPONSE', 'В ответе LLM отсутствуют сведения о режиме или модели.');
  }
  const model = payload.model.trim();
  if (!model || model.length > 160 || /[<>\u0000-\u001f\u007f]/u.test(model)) {
    throw new LlmSelectionError('LLM_INVALID_RESPONSE', 'Имя модели в ответе недопустимо.');
  }
  if (!Array.isArray(payload.selections) || payload.selections.length < 1 || payload.selections.length > 8) {
    throw new LlmSelectionError('LLM_INVALID_RESPONSE', 'LLM должна выбрать от 1 до 8 объектов.');
  }

  const availableIds = new Set(assets.map((asset) => asset.id));
  const seen = new Set<string>();
  const selections = payload.selections.map((raw): LlmSelectionItem => {
    if (!isRecord(raw) || !hasOnlyKeys(raw, ['assetId', 'role']) || typeof raw.assetId !== 'string') {
      throw new LlmSelectionError('LLM_INVALID_RESPONSE', 'Элемент ответа LLM содержит запрещённые поля.');
    }
    const assetId = raw.assetId.trim();
    if (!availableIds.has(assetId)) {
      throw new LlmSelectionError('LLM_INVALID_RESPONSE', `LLM вернула объект вне текущего manifest: ${assetId || 'пустой ID'}.`);
    }
    if (seen.has(assetId)) {
      throw new LlmSelectionError('LLM_INVALID_RESPONSE', `LLM повторила идентификатор ${assetId}.`);
    }
    seen.add(assetId);

    if (raw.role === undefined) return { assetId };
    if (typeof raw.role !== 'string' || !isSafeSemanticRole(raw.role)) {
      throw new LlmSelectionError('LLM_INVALID_RESPONSE', `Смысловая роль для ${assetId} недопустима.`);
    }
    return { assetId, role: raw.role.trim() };
  });

  return { mode: 'llm', model, selections };
}

function errorCodeFromPayload(payload: unknown): LlmSelectionErrorCode | null {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.code !== 'string') return null;
  switch (payload.error.code) {
    case 'LLM_NOT_CONFIGURED':
    case 'LLM_CONFIG_INVALID': return 'LLM_NOT_CONFIGURED';
    case 'UPSTREAM_TIMEOUT':
    case 'LLM_TIMEOUT': return 'LLM_TIMEOUT';
    case 'MODEL_RESPONSE_INVALID':
    case 'UPSTREAM_RESPONSE_INVALID':
    case 'LLM_INVALID_RESPONSE': return 'LLM_INVALID_RESPONSE';
    case 'UPSTREAM_ERROR':
    case 'UPSTREAM_UNAVAILABLE':
    case 'LLM_UPSTREAM_ERROR': return 'LLM_UPSTREAM_ERROR';
    case 'INVALID_REQUEST':
    case 'LLM_REQUEST_FAILED': return 'LLM_REQUEST_FAILED';
    case 'LLM_UNAVAILABLE': return 'LLM_UNAVAILABLE';
    default: return null;
  }
}

export function llmFallbackReason(error: unknown): string {
  const code = error instanceof LlmSelectionError ? error.code : 'LLM_UNAVAILABLE';
  switch (code) {
    case 'LLM_NOT_CONFIGURED': return 'endpoint и model не настроены';
    case 'LLM_TIMEOUT': return 'сервер модели не ответил вовремя';
    case 'LLM_INVALID_RESPONSE': return 'ответ модели не прошёл whitelist-проверку';
    case 'LLM_UPSTREAM_ERROR': return 'OpenAI-compatible endpoint вернул ошибку';
    case 'LLM_REQUEST_FAILED': return 'локальный proxy отклонил запрос';
    default: return 'локальный proxy недоступен';
  }
}

export async function requestLlmThemeSelection(
  theme: string,
  assets: readonly Pick<AssetManifestEntry, 'id'>[],
  fetcher: typeof fetch = fetch,
  timeoutMs = 25_000,
): Promise<LlmThemeSelection> {
  const input = theme.trim();
  if (!input || input.length > 2000) {
    throw new LlmSelectionError('LLM_REQUEST_FAILED', 'Тема должна содержать от 1 до 2000 символов.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher('/api/llm/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: input }),
        signal: controller.signal,
      });
    } catch {
      const timedOut = controller.signal.aborted;
      throw new LlmSelectionError(
        timedOut ? 'LLM_TIMEOUT' : 'LLM_UNAVAILABLE',
        timedOut ? 'Истекло время ожидания LLM.' : 'Локальный LLM proxy недоступен.',
      );
    }

    let payload: unknown;
    try {
      payload = await response.json() as unknown;
    } catch {
      throw new LlmSelectionError(
        response.ok ? 'LLM_INVALID_RESPONSE' : response.status >= 500 ? 'LLM_UNAVAILABLE' : 'LLM_REQUEST_FAILED',
        response.ok ? 'Proxy вернул не JSON.' : `LLM proxy недоступен (HTTP ${response.status}).`,
      );
    }
    if (!response.ok) {
      const code = errorCodeFromPayload(payload)
        ?? (response.status === 503 ? 'LLM_UNAVAILABLE' : 'LLM_REQUEST_FAILED');
      throw new LlmSelectionError(code, `LLM proxy вернул HTTP ${response.status}.`);
    }
    return validateLlmThemeSelection(payload, assets);
  } finally {
    window.clearTimeout(timeout);
  }
}
