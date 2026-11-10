import { createServer } from 'node:http';
import { LlmProxyError, MAX_THEME_LENGTH, requestThemeSelection } from './llm-contract.mjs';

const MAX_BODY_BYTES = 12_000;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new LlmProxyError('INVALID_REQUEST', 'Request body is too large.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new LlmProxyError('INVALID_REQUEST', 'Request body must be valid JSON.', 400, { cause: error });
  }
}

export function createFormaApiServer({ assets, config, fetchImpl = fetch } = {}) {
  if (!Array.isArray(assets) || assets.length === 0) throw new Error('A non-empty manifest asset list is required.');
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true, llmConfigured: Boolean(config?.configured), assetCount: assets.length });
      return;
    }
    if (request.method !== 'POST' || url.pathname !== '/api/llm/theme') {
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
      return;
    }

    try {
      if (!config?.configured) throw new LlmProxyError('LLM_NOT_CONFIGURED', 'LLM integration is not configured.', 503);
      const body = await readJsonBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).some((key) => key !== 'theme')
          || typeof body.theme !== 'string' || !body.theme.trim() || body.theme.trim().length > MAX_THEME_LENGTH) {
        throw new LlmProxyError('INVALID_REQUEST', 'Theme must contain 1 to 2000 characters.', 400);
      }
      const selections = await requestThemeSelection({
        theme: body.theme,
        assets,
        config,
        fetchImpl,
      });
      sendJson(response, 200, { mode: 'llm', model: config.model, selections });
    } catch (error) {
      const known = error instanceof LlmProxyError;
      const status = known ? error.status : 500;
      const code = known ? error.code : 'INTERNAL_ERROR';
      const message = known ? error.message : 'Internal server error.';
      sendJson(response, status, { error: { code, message } });
    }
  });
}
