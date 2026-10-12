import utilSource from './vendor/01_util.js?raw';
import fontsSource from './vendor/02_fonts.js?raw';
import languageSource from './vendor/02b_lang.js?raw';
import textSource from './vendor/03_text.js?raw';
import stylesSource from './vendor/04_styles.js?raw';
import animationSource from './vendor/05_anim.js?raw';
import registrySource from './vendor/05b_registry.js?raw';
import layoutsSource from './vendor/06_layouts.js?raw';
import decorSource from './vendor/07_decor.js?raw';
import plannerSource from './vendor/08_planner.js?raw';
import omakaseSource from './vendor/08b_omakase.js?raw';
import rendererSource from './vendor/09_render.js?raw';
import bgCamPackSource from './vendor/11p_bgcamB.js?raw';
import decorPackSource from './vendor/11p_decor.js?raw';
import decorBPackSource from './vendor/11p_decorB.js?raw';
import enterPackSource from './vendor/11p_enter.js?raw';
import enterBPackSource from './vendor/11p_enterB.js?raw';
import exitPackSource from './vendor/11p_exit.js?raw';
import exitBPackSource from './vendor/11p_exitB.js?raw';
import fxBPackSource from './vendor/11p_fxB.js?raw';
import horror1PackSource from './vendor/11p_horror1.js?raw';
import horror2PackSource from './vendor/11p_horror2.js?raw';
import horror3PackSource from './vendor/11p_horror3.js?raw';
import kinetic1PackSource from './vendor/11p_kinetic1.js?raw';
import kinetic2PackSource from './vendor/11p_kinetic2.js?raw';
import kinetic3PackSource from './vendor/11p_kinetic3.js?raw';
import layoutsAPackSource from './vendor/11p_layoutsA.js?raw';
import layoutsBPackSource from './vendor/11p_layoutsB.js?raw';
import layoutsCPackSource from './vendor/11p_layoutsC.js?raw';
import layoutsDPackSource from './vendor/11p_layoutsD.js?raw';
import looksPackSource from './vendor/11p_looks.js?raw';
import stylesPackSource from './vendor/11p_styles.js?raw';
import treatTransPackSource from './vendor/11p_treattrans.js?raw';
import typo1PackSource from './vendor/11p_typo1.js?raw';
import typo2PackSource from './vendor/11p_typo2.js?raw';
import typo3PackSource from './vendor/11p_typo3.js?raw';
import setsSource from './vendor/11q_sets.js?raw';
import type { JizuraSettings } from './settings';

// JIZURA is distributed as a browser single-file app. Folia does not mount its web UI;
// this adapter evaluates the MIT-licensed planner and Canvas renderer against a private
// window-like object, so the engine cannot overwrite Folia globals or another instance.
const JIZURA_SOURCES = [
    utilSource,
    fontsSource,
    languageSource,
    textSource,
    stylesSource,
    animationSource,
    registrySource,
    layoutsSource,
    decorSource,
    plannerSource,
    omakaseSource,
    rendererSource,
    bgCamPackSource,
    decorPackSource,
    decorBPackSource,
    enterPackSource,
    enterBPackSource,
    exitPackSource,
    exitBPackSource,
    fxBPackSource,
    horror1PackSource,
    horror2PackSource,
    horror3PackSource,
    kinetic1PackSource,
    kinetic2PackSource,
    kinetic3PackSource,
    layoutsAPackSource,
    layoutsBPackSource,
    layoutsCPackSource,
    layoutsDPackSource,
    looksPackSource,
    stylesPackSource,
    treatTransPackSource,
    typo1PackSource,
    typo2PackSource,
    typo3PackSource,
    setsSource,
] as const;

export interface JizuraProject {
    themeId?: string | null;
    mood?: string | null;
    title: string;
    artist: string;
    lyrics: string;
    style: string;
    lang: 'auto' | 'ja' | 'zh-Hant' | 'zh-Hans' | 'ko' | 'en';
    // Fixed presets are still accepted by the embedded JIZURA planner. Folia
    // also passes a custom:WIDTH:HEIGHT value so the plan can match the actual
    // player viewport instead of being letterboxed inside a fixed 16:9 frame.
    aspect: string;
    fps: number;
    res: number;
    seed: number;
    extra: boolean;
    wa: boolean;
    horror: boolean;
    typo: boolean;
    kinetic: boolean;
    unify: boolean;
    typeset: boolean;
    centerDir: 'tb' | 'lr';
    centerFree: boolean;
    fx: Record<string, unknown>;
    colors?: Record<string, unknown>;
    fonts?: Record<string, unknown>;
    timing: Record<string, unknown>;
    enabled: Record<string, Record<string, boolean>>;
}

export interface JizuraPlan {
    W: number;
    H: number;
    duration: number;
    [key: string]: unknown;
}

interface JizuraGlobal {
    defaultProject: () => JizuraProject;
    plan: (project: JizuraProject, audio?: { duration?: number }) => JizuraPlan;
    omakase?: (project: JizuraProject, rnd?: () => number, themeId?: string | null) => Partial<JizuraProject>;
    STYLE_ORDER?: string[];
    fontsOfPlan?: (plan: JizuraPlan) => string[];
    Renderer: new () => { frame: (ctx: CanvasRenderingContext2D, plan: JizuraPlan, time: number, options?: Record<string, unknown>) => void };
    ensureFonts?: (text: string, keys?: string[]) => Promise<void>;
}

let enginePromise: Promise<JizuraGlobal> | null = null;

const createEngine = (): JizuraGlobal => {
    if (typeof document === 'undefined') {
        throw new Error('JIZURA requires a browser Canvas document');
    }

    const privateWindow: { J?: JizuraGlobal } = {};
    const evaluate = new Function('window', 'document', `${JIZURA_SOURCES.join('\n')}\nreturn window.J;`);
    const engine = evaluate(privateWindow, document) as JizuraGlobal | undefined;
    if (!engine?.plan || !engine.Renderer || !engine.defaultProject) {
        throw new Error('JIZURA core did not expose planner and renderer');
    }
    return engine;
};

export const loadJizuraEngine = () => {
    if (!enginePromise) {
        enginePromise = Promise.resolve().then(createEngine);
    }
    return enginePromise;
};

export const formatLrcTimestamp = (seconds: number) => {
    const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = (safeSeconds - minutes * 60).toFixed(2).padStart(5, '0');
    return `[${String(minutes).padStart(2, '0')}:${remainder}]`;
};

export const buildJizuraLyrics = (lines: { fullText: string; startTime: number; endTime?: number }[]) => lines
    .filter(line => line.fullText.trim())
    .map(line => `${formatLrcTimestamp(line.startTime)}${line.fullText}`)
    .join('\n');

export const resolveJizuraAspect = (width: number, height: number) => {
    const safeWidth = Number.isFinite(width) ? width : 0;
    const safeHeight = Number.isFinite(height) ? height : 0;
    if (safeWidth < 2 || safeHeight < 2) return '16:9';

    // Keep extreme side ratios usable for the planner while preserving the
    // real player ratio. The planner works in a 1080px design height and all
    // of its layout primitives scale from W/H, so this avoids both cropping
    // and the blank bands caused by fitting a fixed 16:9 composition.
    const ratio = Math.min(2.75, Math.max(0.45, safeWidth / safeHeight));
    const designHeight = 1080;
    const designWidth = Math.max(480, Math.round(designHeight * ratio));
    return `custom:${designWidth}:${designHeight}`;
};

const hashJizuraSeed = (value: string) => {
    let seed = 2166136261;
    for (const character of value) {
        seed ^= character.charCodeAt(0);
        seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0;
};

const createJizuraRandom = (seed: number) => {
    let randomState = seed >>> 0;
    return () => {
        randomState = Math.imul(randomState ^ (randomState >>> 16), 2246822519);
        randomState = Math.imul(randomState ^ (randomState >>> 13), 3266489917);
        return ((randomState ^= randomState >>> 16) >>> 0) / 4294967296;
    };
};

export const buildJizuraProject = (
    engine: JizuraGlobal,
    input: {
        lines: { fullText: string; startTime: number; endTime?: number }[];
        title?: string | null;
        artist?: string | null;
        seed?: string | number;
        style?: string;
        aspect?: string;
        settings?: Partial<JizuraSettings>;
    },
): JizuraProject => {
    const defaults = engine.defaultProject();
    const settings = { ...defaults, ...input.settings };
    const lyrics = buildJizuraLyrics(input.lines);
    const seed = hashJizuraSeed(String(input.seed ?? 'folia-jizura'));

    const project: JizuraProject = {
        ...defaults,
        title: input.title?.trim() ?? '',
        artist: input.artist?.trim() ?? '',
        lyrics: lyrics || `[00:00.00]${input.title?.trim() || '♫'}`,
        style: input.style?.trim() || 'noir',
        themeId: settings.themeId,
        lang: 'auto',
        aspect: input.aspect ?? '16:9',
        fps: 24,
        res: 1080,
        seed: seed >>> 0,
        // Folia's line timeline is the source of truth. JIZURA still handles
        // chunking, random seed and cut transitions, but it must not replace
        // real line ends with text-length estimates.
        timing: {
            ...defaults.timing,
            offset: 0,
            snap: false,
            useAudioLength: true,
            lineTimes: Object.fromEntries(
                input.lines
                    .filter(line => line.fullText.trim())
                    .map((line, index) => [index, line.startTime]),
            ),
            lineEnds: Object.fromEntries(
                input.lines
                    .filter(line => line.fullText.trim())
                    .map((line, index) => [index, line.endTime]),
            ),
        },
        fx: { ...defaults.fx, hud: 'off' },
        extra: settings.extra,
        wa: settings.wa,
        horror: settings.horror,
        typo: settings.typo,
        kinetic: settings.kinetic,
        unify: settings.unify,
        typeset: settings.typeset,
        centerDir: settings.centerDir,
        centerFree: settings.centerFree,
    };

    // JIZURA's website uses おまかせ to select a coordinated subset of its
    // hundreds of layout / motion / decor entries. Keep the requested style
    // direction, while letting the full embedded catalogue shape each preview.
    if (engine.omakase) {
        const baseRandomized = engine.omakase(project, createJizuraRandom(project.seed), settings.themeId);
        let randomized = baseRandomized;

        // JIZURA's four partial rerolls keep the current proposal and replace
        // only the requested family. A separate deterministic stream makes the
        // result repeatable for a song while still changing on each click.
        if (settings.rerollScope) {
            const variationSeed = hashJizuraSeed(`${project.seed}:${settings.rerollScope}:${settings.revision ?? 0}`);
            const variation = engine.omakase(
                { ...project, seed: variationSeed },
                createJizuraRandom(variationSeed),
                settings.themeId,
            );
            if (settings.rerollScope === 'style') {
                randomized = { ...baseRandomized, style: variation.style };
            } else if (settings.rerollScope === 'color') {
                randomized = { ...baseRandomized, colors: variation.colors };
            } else if (settings.rerollScope === 'mood') {
                randomized = { ...baseRandomized, mood: variation.mood, fx: variation.fx };
            } else if (settings.rerollScope === 'arrange') {
                randomized = { ...baseRandomized, enabled: variation.enabled };
            }
        }
        return {
            ...project,
            ...randomized,
            title: project.title,
            artist: project.artist,
            lyrics: project.lyrics,
            timing: project.timing,
            themeId: project.themeId,
            aspect: project.aspect,
        };
    }

    return project;
};

export const renderJizuraFrame = (
    renderer: { frame: (ctx: CanvasRenderingContext2D, plan: JizuraPlan, time: number, options?: Record<string, unknown>) => void },
    ctx: CanvasRenderingContext2D,
    plan: JizuraPlan,
    time: number,
) => {
    // The settings workbench can temporarily collapse the preview canvas while its
    // panel is switching. JIZURA's scratch surfaces must never be fed a zero-sized
    // target because CanvasRenderingContext2D rejects those drawImage sources.
    if (ctx.canvas.width < 2 || ctx.canvas.height < 2) return;
    const end = Math.max(0.01, Number(plan.duration) || 0.01);
    // The plan is generated for the current viewport ratio. Keep contain as a
    // defensive fallback for a one-frame resize race, so a just-resized canvas
    // never crops a lyric element while the next adaptive plan is being built.
    const scale = Math.min(
        ctx.canvas.width / Math.max(1, plan.W),
        ctx.canvas.height / Math.max(1, plan.H),
    );
    const offsetX = (ctx.canvas.width - plan.W * scale) / 2;
    const offsetY = (ctx.canvas.height - plan.H * scale) / 2;
    const firstScheme = (plan.style as { schemes?: Array<{ bg?: string }> } | undefined)?.schemes?.[0];
    renderer.frame(ctx, plan, Math.max(0, Math.min(end - 0.001, time)), {
        scale,
        offsetX,
        offsetY,
        outsideColor: firstScheme?.bg || '#080808',
        fast: false,
        noHud: true,
        noGhost: false,
    });
};
