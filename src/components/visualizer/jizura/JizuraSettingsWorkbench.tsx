import React from 'react';
import { ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import type { Theme } from '../../../types';
import { colorWithAlpha } from '../colorMix';
import { JIZURA_THEME_OPTIONS, getJizuraStyleLabel } from './styleOptions';
import type { JizuraRerollScope, JizuraSettings } from './settings';

interface JizuraSettingsWorkbenchProps {
    settings: JizuraSettings;
    style: string;
    theme: Theme;
    isDaylight: boolean;
    onChange?: (patch: Partial<JizuraSettings>) => void;
    onReset?: () => void;
    onThemeChange?: (themeId: JizuraSettings['themeId']) => void;
    onReroll?: (scope: JizuraRerollScope) => void;
    songLabel?: string | null;
    songScoped?: boolean;
    t: (key: string) => string;
}

type JizuraSwitchKey = keyof Pick<JizuraSettings, 'extra' | 'wa' | 'horror' | 'typo' | 'kinetic' | 'unify' | 'typeset'>;

const SWITCHES: Array<{ key: JizuraSwitchKey; labelKey: string; descriptionKey: string }> = [
    { key: 'extra', labelKey: 'options.jizuraUseExtra', descriptionKey: 'options.jizuraUseExtraDesc' },
    { key: 'wa', labelKey: 'options.jizuraUseWa', descriptionKey: 'options.jizuraUseWaDesc' },
    { key: 'horror', labelKey: 'options.jizuraUseHorror', descriptionKey: 'options.jizuraUseHorrorDesc' },
    { key: 'typo', labelKey: 'options.jizuraUseTypo', descriptionKey: 'options.jizuraUseTypoDesc' },
    { key: 'kinetic', labelKey: 'options.jizuraUseKinetic', descriptionKey: 'options.jizuraUseKineticDesc' },
    { key: 'unify', labelKey: 'options.jizuraUseUnify', descriptionKey: 'options.jizuraUseUnifyDesc' },
    { key: 'typeset', labelKey: 'options.jizuraUseTypeset', descriptionKey: 'options.jizuraUseTypesetDesc' },
];

const sectionStyle = (theme: Theme, isDaylight: boolean): React.CSSProperties => ({
    borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.22 : 0.18),
    backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.16 : 0.42),
});

const JizuraSettingsWorkbench: React.FC<JizuraSettingsWorkbenchProps> = ({
    settings,
    style,
    theme,
    isDaylight,
    onChange,
    onReset,
    onThemeChange,
    onReroll,
    songLabel,
    songScoped = false,
    t,
}) => {
    const selectedTheme = JIZURA_THEME_OPTIONS.find(option => option.value === settings.themeId) ?? JIZURA_THEME_OPTIONS[0];
    const enabledGroups = SWITCHES.filter(item => settings[item.key]).length;

    return (
        <div className="folia-jizura-workbench min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <div className="folia-jizura-workbench-card space-y-3 rounded-[26px] border p-3 sm:p-4" style={{ ...sectionStyle(theme, isDaylight), boxShadow: `0 18px 50px ${colorWithAlpha(theme.backgroundColor, 0.24)}` }}>
                <div className="folia-jizura-workbench-header flex items-start justify-between gap-3 px-1">
                    <div>
                        <div className="flex items-center gap-2 text-base font-semibold" style={{ color: theme.primaryColor }}>
                            <Sparkles size={16} style={{ color: theme.accentColor }} />
                            JIZURA
                        </div>
                        <div className="folia-jizura-context mt-1 text-xs leading-relaxed opacity-65" style={{ color: theme.secondaryColor }}>
                            {songScoped
                                ? `本曲专属配置 · ${songLabel || '当前歌曲'} · 修改会跟随这首歌保存`
                                : '全局默认配置 · 主题、素材与排版独立于 Folia'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={!onReset}
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ color: theme.secondaryColor, borderColor: colorWithAlpha(theme.secondaryColor, 0.2) }}
                        title={t('ui.default')}
                    >
                        <RotateCcw size={12} />
                        {t('ui.default')}
                    </button>
                </div>

                <div className="folia-jizura-summary-inline text-[10px] opacity-65" style={{ color: theme.secondaryColor }}>
                    {selectedTheme.label} · {getJizuraStyleLabel(style)} · {enabledGroups}/{SWITCHES.length}
                </div>

                <section className="folia-jizura-theme-section rounded-2xl border p-3" style={sectionStyle(theme, isDaylight)}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.18em]" style={{ color: theme.secondaryColor }}>主题</div>
                            <div className="mt-1 text-xs opacity-60" style={{ color: theme.secondaryColor }}>
                                选择后，会在该方向内生成歌词 MV
                            </div>
                        </div>
                        <ChevronRight size={15} className="opacity-45" style={{ color: theme.secondaryColor }} />
                    </div>
                    <select
                        value={settings.themeId}
                        onChange={event => onThemeChange?.(event.target.value as JizuraSettings['themeId'])}
                        className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none"
                        style={{ color: theme.primaryColor, borderColor: colorWithAlpha(theme.accentColor, 0.65) }}
                    >
                        {JIZURA_THEME_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <div className="mt-2 text-xs leading-relaxed opacity-65" style={{ color: theme.secondaryColor }}>
                        {selectedTheme.description}
                    </div>
                </section>

                <section className="folia-jizura-reroll-section rounded-2xl border p-3" style={sectionStyle(theme, isDaylight)}>
                    <div className="mb-2 text-xs font-semibold tracking-[0.18em]" style={{ color: theme.secondaryColor }}>只换这一项</div>
                    <div className="folia-jizura-reroll-grid grid grid-cols-2 gap-2">
                        {([
                            ['style', '风格'],
                            ['color', '配色'],
                            ['mood', '氛围'],
                            ['arrange', '编排'],
                        ] as const).map(([scope, label]) => (
                            <button
                                key={scope}
                                type="button"
                                onClick={() => onReroll?.(scope)}
                                disabled={!onReroll}
                                className="folia-jizura-reroll-button rounded-md border px-3 py-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                                style={{
                                    color: theme.primaryColor,
                                    borderColor: colorWithAlpha(theme.secondaryColor, 0.22),
                                    backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.16 : 0.24),
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="folia-jizura-options-section rounded-2xl border p-3" style={sectionStyle(theme, isDaylight)}>
                    <div className="mb-2 text-xs font-semibold tracking-[0.18em]" style={{ color: theme.secondaryColor }}>JIZURA 选项</div>
                    <div className="folia-jizura-options-list divide-y" style={{ borderColor: colorWithAlpha(theme.secondaryColor, 0.12) }}>
                        {SWITCHES.map(item => (
                            <label key={item.key} className="folia-jizura-option-row flex cursor-pointer items-start gap-3 py-3 first:pt-1 last:pb-1">
                                <input
                                    type="checkbox"
                                    checked={settings[item.key]}
                                    onChange={event => onChange?.({ [item.key]: event.target.checked })}
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-color)]"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium" style={{ color: theme.primaryColor }}>{t(item.labelKey)}</span>
                                    <span className="folia-jizura-option-description mt-0.5 block text-xs leading-relaxed opacity-65" style={{ color: theme.secondaryColor }}>{t(item.descriptionKey)}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </section>

                <section className="folia-jizura-layout-section rounded-2xl border p-3" style={sectionStyle(theme, isDaylight)}>
                    <div className="mb-2 text-xs font-semibold tracking-[0.18em]" style={{ color: theme.secondaryColor }}>排版</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1 text-xs" style={{ color: theme.secondaryColor }}>
                            <span>中心方向</span>
                            <select
                                value={settings.centerDir}
                                onChange={event => onChange?.({ centerDir: event.target.value as JizuraSettings['centerDir'] })}
                                className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                                style={{ color: theme.primaryColor, borderColor: colorWithAlpha(theme.secondaryColor, 0.2) }}
                            >
                                <option value="tb">从上到下</option>
                                <option value="lr">从左到右</option>
                            </select>
                        </label>
                        <label className="flex items-end gap-2 rounded-xl border px-3 py-2 text-xs" style={{ color: theme.primaryColor, borderColor: colorWithAlpha(theme.secondaryColor, 0.2) }}>
                            <input
                                type="checkbox"
                                checked={settings.centerFree}
                                onChange={event => onChange?.({ centerFree: event.target.checked })}
                                className="h-4 w-4 accent-[var(--accent-color)]"
                            />
                            <span>允许自由布局</span>
                        </label>
                    </div>
                </section>

                <section className="folia-jizura-summary-section rounded-2xl border p-3" style={sectionStyle(theme, isDaylight)}>
                    <div className="mb-2 text-xs font-semibold tracking-[0.18em]" style={{ color: theme.secondaryColor }}>当前方案</div>
                    <dl className="divide-y text-xs" style={{ borderColor: colorWithAlpha(theme.secondaryColor, 0.12) }}>
                        <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
                            <dt className="opacity-60" style={{ color: theme.secondaryColor }}>主题</dt>
                            <dd style={{ color: theme.primaryColor }}>{selectedTheme.label}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2">
                            <dt className="opacity-60" style={{ color: theme.secondaryColor }}>配色方案</dt>
                            <dd className="max-w-[65%] truncate text-right" style={{ color: theme.primaryColor }}>{getJizuraStyleLabel(style)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2 last:pb-0">
                            <dt className="opacity-60" style={{ color: theme.secondaryColor }}>已启用选项</dt>
                            <dd style={{ color: theme.primaryColor }}>{enabledGroups} / {SWITCHES.length}</dd>
                        </div>
                    </dl>
                </section>
            </div>
        </div>
    );
};

export default JizuraSettingsWorkbench;
