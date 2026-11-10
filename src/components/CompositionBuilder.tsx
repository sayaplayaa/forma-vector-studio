import { useState, type FormEvent } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { LAYOUT_TEMPLATES, type LayoutTemplate } from '../lib/autoLayout';
import type { CompositionFeedback, CompositionMode } from '../lib/autoCompose';

interface Props {
  onBuild: (mode: CompositionMode, input: string, template: LayoutTemplate) => void | Promise<void>;
  feedback: CompositionFeedback | null;
}

export function CompositionBuilder({ onBuild, feedback }: Props) {
  const [mode, setMode] = useState<CompositionMode>('theme');
  const [themeInput, setThemeInput] = useState('Свет знаний и новые идеи');
  const [objectInput, setObjectInput] = useState('книга, настольная лампа, flowers');
  const [template, setTemplate] = useState<LayoutTemplate>('balanced');
  const [submitted, setSubmitted] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const input = mode === 'theme' ? themeInput : objectInput;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isBuilding) return;
    setIsBuilding(true);
    try {
      await onBuild(mode, input, template);
      setSubmitted(true);
    } finally {
      setIsBuilding(false);
    }
  }

  return (
    <form className="auto-builder" onSubmit={submit} aria-label="Автоматическая сборка" aria-busy={isBuilding}>
      <div className="section-title-row"><strong>Автокомпозиция</strong><span className="phase-tag">LLM / fallback</span></div>
      <div className="builder-modes" role="tablist" aria-label="Сценарий сборки">
        <button type="button" role="tab" disabled={isBuilding} aria-selected={mode === 'theme'} aria-controls="composition-input" className={mode === 'theme' ? 'active' : ''} onClick={() => setMode('theme')}>По теме</button>
        <button type="button" role="tab" disabled={isBuilding} aria-selected={mode === 'objects'} aria-controls="composition-input" className={mode === 'objects' ? 'active' : ''} onClick={() => setMode('objects')}>По объектам</button>
      </div>
      <label className="builder-input-label" htmlFor="composition-input">{mode === 'theme' ? 'Тема или метафора' : 'Названия объектов'}</label>
      <textarea
        id="composition-input"
        value={input}
        onChange={(event) => mode === 'theme' ? setThemeInput(event.target.value) : setObjectInput(event.target.value)}
        placeholder={mode === 'theme' ? 'Например: музыка помогает сосредоточиться' : 'книга, lamp; цветы / phone'}
        maxLength={2000}
        rows={3}
        disabled={isBuilding}
      />
      <p className="builder-explanation">{mode === 'theme'
        ? 'При настроенном сервере — LLM-подбор только ID из manifest. Без API работает локальная эвристика; это не полноценный ИИ.'
        : 'Русские и английские названия, синонимы. Разделяйте запятыми, строками, /, +, «и» или «and».'}</p>
      <label className="builder-layout-label" htmlFor="composition-template">Шаблон</label>
      <select id="composition-template" value={template} disabled={isBuilding} onChange={(event) => setTemplate(event.target.value as LayoutTemplate)}>
        {LAYOUT_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <p className="builder-template-hint">{LAYOUT_TEMPLATES.find((item) => item.id === template)?.description}</p>
      <button className="build-button" type="submit" disabled={isBuilding}>{submitted || isBuilding ? <RefreshCw className={isBuilding ? 'is-spinning' : undefined} size={14} /> : <ArrowRight size={14} />}{isBuilding ? 'Подбираю объекты…' : submitted ? 'Пересобрать композицию' : 'Собрать композицию'}</button>
      <p className="builder-replace-note">Сборка заменяет объекты на холсте. Размер и палитра сохраняются.</p>
      {feedback && (
        <div className={`build-feedback ${feedback.status}`} role="status" aria-live="polite">
          {feedback.strategy === 'llm' && <strong>Режим: LLM через локальный серверный proxy</strong>}
          {feedback.strategy === 'llm-fallback-local' && <strong>Режим: локальная эвристика — LLM не использована</strong>}
          {feedback.strategy === 'neutral-fallback' && <strong>Тема не распознана — нейтральная подборка</strong>}
          <p>{feedback.message}</p>
          {feedback.selections.length > 0 && <details><summary>Почему выбраны эти объекты</summary><ul>{feedback.selections.map((item, index) => <li key={`${item.assetId}-${index}`}><b>{item.name}</b> — {item.reason}</li>)}</ul></details>}
        </div>
      )}
    </form>
  );
}
