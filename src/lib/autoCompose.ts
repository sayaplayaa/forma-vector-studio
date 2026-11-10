import { layoutAssets, type LayoutTemplate } from './autoLayout';
import { isSafeSemanticRole, type LlmThemeSelection } from './llmSelection';
import { resolveObjectNames, selectAssetsForTheme } from './semanticSelection';
import type { CompositionScene, SvgAsset } from './types';

export type CompositionMode = 'theme' | 'objects';

export interface CompositionRequest {
  mode: CompositionMode;
  input: string;
  template: LayoutTemplate;
  revision: number;
}

export interface CompositionFeedback {
  status: 'success' | 'partial' | 'error';
  strategy: 'object-names' | 'llm' | 'llm-fallback-local' | 'local-keywords' | 'neutral-fallback' | 'empty';
  message: string;
  missing: string[];
  selections: { assetId: string; name: string; reason: string }[];
}

export interface CompositionResult {
  scene: CompositionScene | null;
  feedback: CompositionFeedback;
}

/** Builds a replacement scene; source assets and the input scene are never mutated. */
export function buildComposition(
  currentScene: CompositionScene,
  assets: readonly SvgAsset[],
  request: CompositionRequest,
  llmSelection?: LlmThemeSelection,
): CompositionResult {
  const error = (message: string, missing: string[] = []): CompositionResult => ({
    scene: null,
    feedback: { status: 'error', strategy: 'empty', message, missing, selections: [] },
  });
  const input = request.input.trim();
  if (!input) return error(request.mode === 'theme' ? 'Введите тему или метафору.' : 'Введите названия объектов.');
  if (input.length > 2000) return error('Сократите запрос до 2000 символов.');
  if (!assets.length) return error('Библиотека SVG ещё не загружена.');
  if (llmSelection && request.mode !== 'theme') return error('LLM-подбор разрешён только для сценария «По теме».');

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  let llmMatches: SvgAsset[] | null = null;
  let llmReasons: { assetId: string; reason: string }[] = [];
  if (llmSelection) {
    if (llmSelection.selections.length < 1 || llmSelection.selections.length > 8) {
      return error('LLM должна выбрать от 1 до 8 объектов из manifest.');
    }
    const seen = new Set<string>();
    llmMatches = [];
    for (const selection of llmSelection.selections) {
      const asset = byId.get(selection.assetId);
      if (!asset || seen.has(selection.assetId)) {
        return error('Ответ LLM содержит отсутствующий или повторяющийся объект и отклонён whitelist-проверкой.');
      }
      if (selection.role !== undefined && !isSafeSemanticRole(selection.role)) {
        return error('Ответ LLM содержит недопустимую смысловую роль.');
      }
      seen.add(selection.assetId);
      llmMatches.push(asset);
      llmReasons.push({
        assetId: asset.id,
        reason: selection.role ? `Смысловая роль от LLM: ${selection.role}` : 'Выбран LLM из разрешённого asset manifest.',
      });
    }
  }

  const names = request.mode === 'objects' ? resolveObjectNames(input, assets) : null;
  const theme = request.mode === 'theme' && !llmMatches ? selectAssetsForTheme(input, assets, 5) : null;
  const matches = names?.matches ?? llmMatches ?? theme?.matches ?? [];
  const missing = names?.missing ?? [];
  if (!matches.length) return error(
    missing.length ? `Объекты не найдены: ${missing.join(', ')}. Выберите названия из библиотеки.` : 'Для этой темы нет доступных объектов в библиотеке.',
    missing,
  );
  if (matches.length > 40) return error('В одной автоматической композиции поддерживается до 40 объектов. Сократите список.', missing);

  // Selection may annotate a known ID, but only the loaded manifest supplies geometry.
  const selectedAssets = matches.map((match) => byId.get(match.id));
  if (selectedAssets.some((asset) => !asset)) return error('Подбор содержит объект, отсутствующий в текущем manifest.');
  const verifiedAssets = selectedAssets as SvgAsset[];
  const instances = layoutAssets(verifiedAssets, currentScene.size, request.template, { revision: request.revision });
  const selections = verifiedAssets.map((asset) => ({
    assetId: asset.id,
    name: asset.name,
    reason: llmReasons.find((reason) => reason.assetId === asset.id)?.reason
      ?? theme?.reasons.find((reason) => reason.assetId === asset.id)?.reason
      ?? 'Совпадение названия или синонима',
  }));
  const notice = llmSelection
    ? `LLM (${llmSelection.model}) выбрала только разрешённые идентификаторы; ответ проверен по текущему manifest.`
    : theme?.notice ?? 'Названия сопоставлены с существующей библиотекой.';
  return {
    scene: {
      ...currentScene,
      size: { ...currentScene.size },
      name: request.mode === 'theme' ? input.slice(0, 120) : 'Композиция по объектам',
      instances,
    },
    feedback: {
      status: missing.length ? 'partial' : 'success',
      strategy: llmSelection ? 'llm' : theme?.strategy ?? 'object-names',
      message: `${notice} Размещено объектов: ${instances.length}.${missing.length ? ` Не найдены: ${missing.join(', ')}.` : ''}`,
      missing,
      selections,
    },
  };
}

/** Marks a successful or failed local build as an explicit LLM fallback without changing its scene. */
export function markLlmFallback(result: CompositionResult, reason: string): CompositionResult {
  return {
    scene: result.scene,
    feedback: {
      ...result.feedback,
      strategy: 'llm-fallback-local',
      message: `LLM не использована (${reason}). ${result.feedback.message}`,
    },
  };
}
