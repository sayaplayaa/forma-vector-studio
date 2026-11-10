import { createFormaApiServer } from './app.mjs';
import { loadLlmConfig, loadManifestAssets } from './llm-contract.mjs';

const projectRoot = process.cwd();
const assets = await loadManifestAssets(projectRoot);
const config = await loadLlmConfig({ cwd: projectRoot });
const rawPort = Number(process.env.FORMA_SERVER_PORT ?? 8787);
const port = Number.isInteger(rawPort) && rawPort > 0 && rawPort < 65536 ? rawPort : 8787;
const host = process.env.FORMA_SERVER_HOST?.trim() || '127.0.0.1';
const server = createFormaApiServer({ assets, config });

server.listen(port, host, () => {
  const mode = config.configured ? 'LLM proxy enabled' : 'LLM is not configured; the client will use its local fallback';
  console.log(`Forma API listening on http://${host}:${port} (${mode}).`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
