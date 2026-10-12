import { ArrowDown, ArrowUp, Code2, FileUp, Trash2 } from 'lucide-react';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { jsMusicSourceManager } from '../../../services/jsMusicSource/jsSourceManager';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';

// src/components/modal/settings/JsMusicSourcesSection.tsx

type JsMusicSourcesSectionProps = {
    settingsCardClass: string;
};

const JsMusicSourcesSection = ({ settingsCardClass }: JsMusicSourcesSectionProps) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const sources = useSyncExternalStore(
        jsMusicSourceManager.subscribe,
        jsMusicSourceManager.getSources,
        () => [],
    );
    const runtimeStates = sources.map(source => jsMusicSourceManager.getRuntimeState(source.id));

    const handleImport = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        try {
            const code = await file.text();
            if (!code.trim()) throw new Error(t('options.jsMusicSourceEmpty'));
            jsMusicSourceManager.addSource(code, file.name);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <SettingsAnchor anchorId="jsMusicSources" label={t('options.jsMusicSources')}>
            <SettingsSectionHeading icon={Code2} label={t('options.jsMusicSources')} />
            <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`}>
                <div className="space-y-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('options.jsMusicSources')}
                    </div>
                    <div className="text-[11px] opacity-50 max-w-[560px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.jsMusicSourcesDesc')}
                    </div>
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".js,text/javascript,application/javascript"
                    className="hidden"
                    onChange={event => void handleImport(event.target.files?.[0])}
                />
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors hover:bg-white/8"
                    style={{ color: 'var(--text-primary)' }}
                >
                    <FileUp size={14} />
                    {t('options.jsMusicSourceImport')}
                </button>

                {error && <div className="text-xs text-red-400">{error}</div>}

                {sources.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-xs opacity-55" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.jsMusicSourcesEmpty')}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sources.map((source, index) => {
                            const runtime = runtimeStates[index];
                            const runtimeLabel = runtime.status === 'ready'
                                ? t('options.jsMusicSourceReady')
                                : runtime.status === 'error'
                                    ? t('options.jsMusicSourceError')
                                    : runtime.status === 'loading'
                                        ? t('options.jsMusicSourceLoading')
                                        : t('options.jsMusicSourceNotLoaded');
                            return (
                                <div key={source.id} className="flex items-center gap-3 rounded-xl border p-3">
                                    <button
                                        type="button"
                                        onClick={() => jsMusicSourceManager.setEnabled(source.id, !source.enabled)}
                                        className={`h-5 w-5 rounded-full border-2 transition-colors ${source.enabled ? 'border-emerald-400 bg-emerald-400/80' : 'border-current/30'}`}
                                        title={source.enabled ? t('options.jsMusicSourceDisable') : t('options.jsMusicSourceEnable')}
                                        aria-label={source.enabled ? t('options.jsMusicSourceDisable') : t('options.jsMusicSourceEnable')}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{source.name}</div>
                                        <div className="truncate text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                            {source.version ? `v${source.version} · ` : ''}{runtimeLabel}
                                            {runtime.error ? ` · ${runtime.error}` : ''}
                                        </div>
                                    </div>
                                    <button type="button" disabled={index === 0} onClick={() => jsMusicSourceManager.move(source.id, -1)} className="opacity-60 disabled:opacity-20" title={t('options.jsMusicSourceMoveUp')} aria-label={t('options.jsMusicSourceMoveUp')}><ArrowUp size={14} /></button>
                                    <button type="button" disabled={index === sources.length - 1} onClick={() => jsMusicSourceManager.move(source.id, 1)} className="opacity-60 disabled:opacity-20" title={t('options.jsMusicSourceMoveDown')} aria-label={t('options.jsMusicSourceMoveDown')}><ArrowDown size={14} /></button>
                                    <button type="button" onClick={() => jsMusicSourceManager.removeSource(source.id)} className="text-red-400 opacity-75 hover:opacity-100" title={t('options.jsMusicSourceRemove')} aria-label={t('options.jsMusicSourceRemove')}><Trash2 size={14} /></button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </SettingsAnchor>
    );
};

export default JsMusicSourcesSection;
