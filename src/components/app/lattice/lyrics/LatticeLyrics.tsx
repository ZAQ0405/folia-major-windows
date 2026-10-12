import { useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFontsEpoch } from '../../../../hooks/useFontsEpoch';
import { useLatticeLyrics } from './LatticeLyricsProvider';
import { useLatticeLyricCanvas } from './useLatticeLyricCanvas';
import type { LatticeTile } from '../latticeModel';
import { isAndroidCapacitor } from '../../../../utils/runtimePlatform';
import './LatticeLyrics.css';

// src/components/app/lattice/lyrics/LatticeLyrics.tsx
export default function LatticeLyrics({ tile, reducedMotion }: { tile: LatticeTile; reducedMotion: boolean }) {
    const source = useLatticeLyrics();
    const fontsEpoch = useFontsEpoch();
    const host = useRef<HTMLDivElement>(null);
    const input = useMemo(() => source && source.songKey === tile.id
        ? { ...source, fontsEpoch, reducedMotion } : null, [source, tile.id, fontsEpoch, reducedMotion]);
    // Android WebView can flatten Pixi's transparent WebGL canvas to opaque black inside the
    // transformed poster wall. Keep the current timed lyric readable with native text there;
    // desktop still uses the full Pixi lyric treatment.
    const useAndroidTextPreview = isAndroidCapacitor;
    const ready = useLatticeLyricCanvas(host, useAndroidTextPreview ? null : input);
    const line = input?.lines[input.currentLineIndex];
    const previousLine = input?.lines[input.currentLineIndex - 1];
    const nextLine = input?.lines[input.currentLineIndex + 1];
    const hasAndroidLyric = Boolean(line?.fullText.trim());
    return <>
        <AnimatePresence initial={false}>
            <motion.span
                key={ready ? 'lyrics-ready' : 'lyrics-loading'}
                className={`lattice-poster-copy ${ready ? 'lattice-lyric-metadata' : ''}`}
                initial={{ opacity: reducedMotion ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: reducedMotion ? 1 : 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.24, ease: 'easeInOut' }}
            >
                <strong>{tile.title}</strong><small>{tile.artist}</small>
            </motion.span>
        </AnimatePresence>
        <div className={`lattice-lyrics ${ready || (useAndroidTextPreview && hasAndroidLyric) ? 'is-ready' : ''} ${useAndroidTextPreview ? 'lattice-lyrics--android' : ''}`}>
            {useAndroidTextPreview ? (
                <div className="lattice-lyrics-android-lines" aria-hidden="true">
                    {previousLine?.fullText.trim() && <span>{previousLine.fullText}</span>}
                    {hasAndroidLyric && <strong key={`${input?.songKey}:${input?.currentLineIndex}`}>{line?.fullText}</strong>}
                    {nextLine?.fullText.trim() && <span>{nextLine.fullText}</span>}
                </div>
            ) : <div ref={host} className="lattice-lyrics-canvas" aria-hidden="true" />}
            {ready && <span className="sr-only">{line?.fullText}</span>}
        </div>
    </>;
}
