// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFormaApiServer } from './app.mjs';
import {
  createSelectionMessages,
  loadLlmConfig,
  loadManifestAssets,
  parseEnvText,
  validateModelSelection,
} from './llm-contract.mjs';

const assets = [
  { id: 'book', name: 'Open book', role: 'foreground', category: 'Learning', tags: ['knowledge'] },
  { id: 'desk-lamp', name: 'Desk lamp', role: 'foreground', category: 'Work', tags: ['light'] },
  { id: 'tulips', name: 'Tulips', role: 'foreground', category: 'Growth', tags: ['flowers'] },
];
const openServers = [];

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  openServers.push(server);
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('server-only LLM configuration', () => {
  it('parses .env syntax without interpolation or evaluating values', () => {
    expect(parseEnvText('A=one\nB="two words"\nC=three # note\nexport D=local\n# E=no')).toEqual({
      A: 'one', B: 'two words', C: 'three', D: 'local',
    });
  });

  it('uses process environment over .env and allows keyless local endpoints', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'forma-env-'));
    try {
      await writeFile(path.join(directory, '.env'), 'FORMA_LLM_ENDPOINT=http://file.test/v1/chat/completions\nFORMA_LLM_MODEL=file-model\nFORMA_LLM_API_KEY=file-secret\n');
      const config = await loadLlmConfig({
        cwd: directory,
        env: { FORMA_LLM_ENDPOINT: 'http://127.0.0.1:9000/v1/chat/completions', FORMA_LLM_MODEL: 'local-model', FORMA_LLM_API_KEY: '' },
      });
      expect(config).toMatchObject({
        configured: true,
        endpoint: 'http://127.0.0.1:9000/v1/chat/completions',
        model: 'local-model',
        apiKey: '',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('is disabled by default when endpoint and model are absent', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'forma-empty-env-'));
    try {
      await expect(loadLlmConfig({ cwd: directory, env: {} })).resolves.toMatchObject({ configured: false, endpoint: '', model: '', apiKey: '' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('model response whitelist', () => {
  it('accepts manifest IDs and optional plain semantic roles, deduplicating IDs', () => {
    const response = '```json\n{"objects":[{"id":"book","role":"knowledge anchor"},"desk-lamp",{"id":"book"}]}\n```';
    expect(validateModelSelection(response, assets)).toEqual([
      { assetId: 'book', role: 'knowledge anchor' },
      { assetId: 'desk-lamp' },
    ]);
  });

  it.each([
    ['unknown ID', '{"objects":[{"id":"invented-object"}]}'],
    ['generated SVG field', '{"objects":[{"id":"book","svg":"<svg/>"}]}'],
    ['path data as a role', '{"objects":[{"id":"book","role":"<path d=M0/>"}]}'],
    ['raw path commands as a role', '{"objects":[{"id":"book","role":"M0 0 L20 20"}]}'],
    ['an external URL as a role', '{"objects":[{"id":"book","role":"https://example.test/image.svg"}]}'],
    ['extra root data', '{"objects":[{"id":"book"}],"image":"data:image/png"}'],
    ['prose', 'Use the book and lamp'],
  ])('rejects %s', (_label, response) => {
    expect(() => validateModelSelection(response, assets)).toThrow();
  });

  it('puts the complete manifest catalog and restrictive contract into the prompt', () => {
    const messages = createSelectionMessages('light of knowledge', assets);
    expect(messages[0].content).toContain('Do not return SVG');
    expect(messages[0].content).toContain('"id":"book"');
    expect(messages[1]).toEqual({ role: 'user', content: 'light of knowledge' });
  });

  it('loads all real IDs from the generated manifest', async () => {
    const manifestAssets = await loadManifestAssets(process.cwd());
    expect(manifestAssets).toHaveLength(20);
    expect(new Set(manifestAssets.map((asset) => asset.id)).size).toBe(20);
  });
});

describe('HTTP proxy integration', () => {
  it('makes an actual OpenAI-compatible HTTP request and returns only whitelisted selections', async () => {
    let upstreamRequest;
    const mockLlm = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      upstreamRequest = {
        method: request.method,
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: '{"objects":[{"id":"book","role":"knowledge"},{"id":"desk-lamp","role":"insight"}]}' } }],
      }));
    });
    const upstreamBase = await listen(mockLlm);
    const forma = createFormaApiServer({
      assets,
      config: { configured: true, endpoint: `${upstreamBase}/v1/chat/completions`, model: 'mock-model', apiKey: 'server-secret', timeoutMs: 2_000 },
    });
    const formaBase = await listen(forma);

    const response = await fetch(`${formaBase}/api/llm/theme`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'light of knowledge' }),
    });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toEqual({
      mode: 'llm',
      model: 'mock-model',
      selections: [
        { assetId: 'book', role: 'knowledge' },
        { assetId: 'desk-lamp', role: 'insight' },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('server-secret');
    expect(upstreamRequest.method).toBe('POST');
    expect(upstreamRequest.authorization).toBe('Bearer server-secret');
    expect(upstreamRequest.body.model).toBe('mock-model');
    expect(upstreamRequest.body.messages[0].content).toContain('Allowed catalog');
    expect(upstreamRequest.body.response_format).toEqual({ type: 'json_object' });
    expect(upstreamRequest.body).not.toHaveProperty('max_tokens');
  });

  it('returns a generic error and no model content when upstream violates the whitelist', async () => {
    const mockLlm = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '{"objects":[{"id":"new-dragon","svg":"<svg/>"}]}' } }] }));
    });
    const upstreamBase = await listen(mockLlm);
    const forma = createFormaApiServer({
      assets,
      config: { configured: true, endpoint: `${upstreamBase}/v1/chat/completions`, model: 'mock-model', apiKey: '', timeoutMs: 2_000 },
    });
    const formaBase = await listen(forma);
    const response = await fetch(`${formaBase}/api/llm/theme`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: 'dragon' }),
    });
    const body = await response.text();
    expect(response.status).toBe(502);
    expect(body).toContain('MODEL_RESPONSE_INVALID');
    expect(body).not.toContain('new-dragon');
    expect(body).not.toContain('<svg');
  });

  it('reports the unconfigured mode without contacting any upstream', async () => {
    let called = false;
    const forma = createFormaApiServer({
      assets,
      config: { configured: false, endpoint: '', model: '', apiKey: '', timeoutMs: 2_000 },
      fetchImpl: async () => { called = true; throw new Error('must not run'); },
    });
    const formaBase = await listen(forma);
    const response = await fetch(`${formaBase}/api/llm/theme`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: 'anything' }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'LLM_NOT_CONFIGURED', message: 'LLM integration is not configured.' } });
    expect(called).toBe(false);
  });
});
