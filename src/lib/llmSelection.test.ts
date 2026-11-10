import { describe, expect, it, vi } from 'vitest';
import {
  LlmSelectionError,
  llmFallbackReason,
  requestLlmThemeSelection,
  validateLlmThemeSelection,
} from './llmSelection';

const assets = [{ id: 'book' }, { id: 'desk-lamp' }, { id: 'tulips' }];

describe('client-side LLM response whitelist', () => {
  it('accepts only current manifest IDs and optional plain semantic roles', () => {
    expect(validateLlmThemeSelection({
      mode: 'llm',
      model: 'local-model',
      selections: [
        { assetId: 'book', role: 'knowledge and discovery' },
        { assetId: 'desk-lamp' },
      ],
    }, assets)).toEqual({
      mode: 'llm',
      model: 'local-model',
      selections: [
        { assetId: 'book', role: 'knowledge and discovery' },
        { assetId: 'desk-lamp' },
      ],
    });
  });

  it.each([
    ['an unknown ID', { mode: 'llm', model: 'm', selections: [{ assetId: 'new-dragon' }] }],
    ['a duplicate ID', { mode: 'llm', model: 'm', selections: [{ assetId: 'book' }, { assetId: 'book' }] }],
    ['generated SVG', { mode: 'llm', model: 'm', selections: [{ assetId: 'book', svg: '<svg/>' }] }],
    ['path markup in a role', { mode: 'llm', model: 'm', selections: [{ assetId: 'book', role: '<path d="M0 0"/>' }] }],
    ['raw path commands in a role', { mode: 'llm', model: 'm', selections: [{ assetId: 'book', role: 'M0 0 L20 20' }] }],
    ['a URL in a role', { mode: 'llm', model: 'm', selections: [{ assetId: 'book', role: 'https://example.test/image.svg' }] }],
    ['an extra top-level field', { mode: 'llm', model: 'm', selections: [{ assetId: 'book' }], image: 'data:image/png;base64,x' }],
    ['an empty selection', { mode: 'llm', model: 'm', selections: [] }],
  ])('rejects %s', (_label, payload) => {
    expect(() => validateLlmThemeSelection(payload, assets)).toThrow(LlmSelectionError);
  });

  it('sends only the theme to the server proxy and revalidates its response', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ theme: 'Свет знаний' });
      expect(String(init?.body)).not.toContain('desk-lamp');
      return new Response(JSON.stringify({
        mode: 'llm',
        model: 'mock-model',
        selections: [{ assetId: 'book', role: 'knowledge' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await requestLlmThemeSelection('Свет знаний', assets, fetcher);
    expect(result.selections).toEqual([{ assetId: 'book', role: 'knowledge' }]);
    expect(fetcher).toHaveBeenCalledWith('/api/llm/theme', expect.objectContaining({ method: 'POST' }));
  });

  it('turns an unconfigured proxy response into an explicit local-fallback reason', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'LLM_NOT_CONFIGURED', message: 'not configured' },
    }), { status: 503, headers: { 'content-type': 'application/json' } }));

    let caught: unknown;
    try {
      await requestLlmThemeSelection('focus', assets, fetcher);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LlmSelectionError);
    expect((caught as LlmSelectionError).code).toBe('LLM_NOT_CONFIGURED');
    expect(llmFallbackReason(caught)).toContain('не настроены');
  });

  it('maps invalid upstream output to whitelist fallback without exposing its body', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'MODEL_RESPONSE_INVALID', message: '<svg>bad output</svg>' },
    }), { status: 502, headers: { 'content-type': 'application/json' } }));

    await expect(requestLlmThemeSelection('focus', assets, fetcher)).rejects.toMatchObject({
      code: 'LLM_INVALID_RESPONSE',
      message: 'LLM proxy вернул HTTP 502.',
    });
  });

  it('treats a non-JSON gateway error as an unavailable local proxy', async () => {
    const fetcher = vi.fn(async () => new Response('proxy connection refused', { status: 502 }));
    await expect(requestLlmThemeSelection('focus', assets, fetcher)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      message: 'LLM proxy недоступен (HTTP 502).',
    });
  });

  it('times out a stalled browser-to-proxy request and enables fallback', async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await expect(requestLlmThemeSelection('focus', assets, fetcher, 5)).rejects.toMatchObject({
      code: 'LLM_TIMEOUT',
    });
  });
});
