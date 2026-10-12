import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import {
    buildJizuraProject,
    loadJizuraEngine,
    renderJizuraFrame,
    resolveJizuraAspect,
    type JizuraPlan,
} from './jizuraEngine';

const VisualizerJizura: React.FC<VisualizerSharedProps> = props => {
    const {
        currentTime,
        lines,
        theme,
        audioPower,
        audioBands,
        songTitle,
        songArtist,
        seed,
        paused = false,
        staticMode = false,
        visualizerOpacity = 1,
        jizuraStyle = 'noir',
        jizuraSettings,
        jizuraSeed,
        duration,
    } = props;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<{ frame: (ctx: CanvasRenderingContext2D, plan: JizuraPlan, time: number, options?: Record<string, unknown>) => void } | null>(null);
    const [engine, setEngine] = useState<Awaited<ReturnType<typeof loadJizuraEngine>> | null>(null);
    const [plan, setPlan] = useState<JizuraPlan | null>(null);
    const [viewportAspect, setViewportAspect] = useState('16:9');
    const [isCoarsePointer, setIsCoarsePointer] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mediaQuery = window.matchMedia('(pointer: coarse)');
        const syncPointerMode = () => setIsCoarsePointer(mediaQuery.matches);
        syncPointerMode();
        mediaQuery.addEventListener?.('change', syncPointerMode);
        return () => mediaQuery.removeEventListener?.('change', syncPointerMode);
    }, []);

    useEffect(() => {
        let active = true;
        loadJizuraEngine()
            .then(nextEngine => {
                if (active) setEngine(nextEngine);
            })
            .catch(error => {
                console.error('[JIZURA] failed to load embedded engine', error);
            });
        return () => {
            active = false;
        };
    }, []);

    const lyricInput = useMemo(
        () => lines.map(line => ({ fullText: line.fullText, startTime: line.startTime, endTime: line.endTime })),
        [lines],
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let lastAspect = '';
        const updateAspect = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return;
            const nextAspect = resolveJizuraAspect(rect.width, rect.height);
            if (nextAspect === lastAspect) return;
            lastAspect = nextAspect;
            setViewportAspect(current => current === nextAspect ? current : nextAspect);
        };

        updateAspect();
        const observer = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(updateAspect)
            : null;
        observer?.observe(canvas);
        return () => observer?.disconnect();
    }, []);

    useEffect(() => {
        if (!engine) return;
        let active = true;
        try {
            const nextProject = buildJizuraProject(engine, {
                lines: lyricInput,
                title: songTitle,
                artist: songArtist,
                seed: jizuraSeed ?? seed,
                style: jizuraStyle,
                aspect: viewportAspect,
                settings: jizuraSettings,
            });
            const lastLineEnd = lines.at(-1)?.endTime ?? 0;
            const planDuration = Math.max(2, duration && duration > 0 ? duration : lastLineEnd + 2);
            const nextPlan = engine.plan(nextProject, { duration: planDuration });
            rendererRef.current = new engine.Renderer();
            setPlan(nextPlan);

            // JIZURA measures glyphs through the browser's loaded font faces. Build a usable
            // fallback frame immediately, then rebuild after the selected faces are ready.
            if (engine.ensureFonts && engine.fontsOfPlan) {
                const fontKeys = engine.fontsOfPlan(nextPlan);
                void engine.ensureFonts(nextProject.lyrics, fontKeys)
                    .then(() => {
                        if (!active) return;
                        const hydratedPlan = engine.plan(nextProject, { duration: planDuration });
                        rendererRef.current = new engine.Renderer();
                        setPlan(hydratedPlan);
                    })
                    .catch(error => console.warn('[JIZURA] font loading failed; using fallback faces', error));
            }
        } catch (error) {
            rendererRef.current = null;
            setPlan(null);
            console.error('[JIZURA] failed to build lyric MV plan', error);
        }
        return () => {
            active = false;
        };
    }, [duration, engine, jizuraSettings, jizuraSeed, jizuraStyle, lines, lyricInput, seed, songArtist, songTitle, viewportAspect]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const renderer = rendererRef.current;
        if (!canvas || !renderer || !plan) return;

        let raf = 0;
        let disposed = false;
        let lastDrawTimestamp = 0;
        const frameInterval = isCoarsePointer ? 1000 / 30 : 0;
        const draw = (timestamp = performance.now()) => {
            if (disposed) return;
            if (document.visibilityState === 'hidden') {
                if (!paused && !staticMode) raf = window.requestAnimationFrame(draw);
                return;
            }
            if (frameInterval > 0 && lastDrawTimestamp > 0 && timestamp - lastDrawTimestamp < frameInterval) {
                raf = window.requestAnimationFrame(draw);
                return;
            }
            lastDrawTimestamp = timestamp;
            const rect = canvas.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) {
                if (!paused && !staticMode) raf = window.requestAnimationFrame(draw);
                return;
            }
            // The embedded JIZURA renderer is intentionally detailed. On touch devices,
            // limiting the canvas DPR and draw cadence keeps the lyric MV fluid without
            // turning every playback frame into a full-resolution canvas repaint.
            const dpr = Math.min(isCoarsePointer ? 1.25 : 2, window.devicePixelRatio || 1);
            const width = Math.max(1, Math.round(rect.width * dpr));
            const height = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            const context = canvas.getContext('2d');
            if (context) {
                context.clearRect(0, 0, canvas.width, canvas.height);
                renderJizuraFrame(renderer, context, plan, currentTime.get());
            }
            if (!paused && !staticMode) raf = window.requestAnimationFrame(draw);
        };

        draw();
        return () => {
            disposed = true;
            window.cancelAnimationFrame(raf);
        };
    }, [currentTime, isCoarsePointer, paused, plan, staticMode]);

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
            renderBackground={false}
            visualizerOpacity={visualizerOpacity}
        >
            <canvas
                ref={canvasRef}
                aria-label="JIZURA lyric MV"
                className="absolute inset-0 block h-full w-full"
                style={{ imageRendering: 'auto' }}
            />
        </VisualizerShell>
    );
};

export default VisualizerJizura;
