import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SongResult } from '../../../types';
import {
    getLatticeGeometry,
    getInstanceBlock,
    layoutExpandedBlock,
    layoutLattice,
    locateInstanceAt,
    overlaps,
    toBounds,
    type Bounds,
    type QueueInstance,
    type ReflowTile,
    type WallMetrics,
} from './layout';
import { useWallCameraPan, type LatticeCamera } from './useWallCameraPan';
import { useLatticePosterSelection } from './useLatticePosterSelection';
import { useWallKeyboardFocus } from './useWallKeyboardFocus';
import { useWallPointerPan } from './useWallPointerPan';
import type { LatticeTile } from './latticeModel';
import LatticePoster from './LatticePoster';
import { countRender } from '../../../dev/renderCount';
import {
    useLatticePlaybackFocus,
} from './useLatticePlaybackFocus';
import { setLatticeCurrentSongPosterVisible } from '../../../stores/useLatticeControlsStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { useDevicePixelRatio } from '../../../hooks/useMediaQuery';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { EXPANSION_SPAN, SLOTS_PER_BLOCK } from './blockTemplates';
import { isAndroidCapacitor } from '../../../utils/runtimePlatform';

// Draggable poster field: one greedily packed block template repeats over the queue.

type PosterWallProps = {
    tiles: LatticeTile[];
    /** Only for playback focus and visibility tracking; the chrome reads transport state from context. */
    currentSong: SongResult | null;
    onPlay: (tile: LatticeTile) => void;
    onTogglePlayback: () => void;
    onSeek: (time: number) => void;
    onOpenPlayer: () => void;
    onBack: () => void;
};


const CELL_SIZE = 128;
const GAP = 8;
// Android WebView has a much tighter composited-tile budget than desktop Chromium. Keep enough
// poster area ahead of a swipe to avoid blank edges, but do not retain half a screen of duplicate
// poster layers beyond the viewport.
// Cards are also the artwork prefetch window: keep enough offscreen instances mounted so a
// quick swipe does not outrun cover decoding on Android. Rendering is optimized separately by
// suppressing entrance motion and duplicate hidden image elements.
const OVERSCAN = isAndroidCapacitor ? 320 : 500;
// Five times the previous Android window: preserve a broad ring of already-mounted cards so
// ordinary swipes reveal decoded artwork instead of triggering a burst of cold image requests.
const MAX_ANDROID_POSTERS = 140;
// How much of the flight path may stay rendered while the camera travels, in viewports.
const MAX_RESERVED_VIEWPORTS = 3;
// Metro tile landing: the wave starts at the top-left of the viewport and runs down the diagonal.
const ENTRANCE_STAGGER = 0.03;
const ENTRANCE_MAX_DELAY = 0.34;
const ENTRANCE_WINDOW = 1100;
const METRICS: WallMetrics = { cellSize: CELL_SIZE, gap: GAP };
// Longest edge a card can reach, which is the gear expansion hands it.
const EXPANDED_SIZE = EXPANSION_SPAN.cols * (CELL_SIZE + GAP) - GAP;


const getScale = (width: number, height: number) => {
    const widthScale = width < 640 ? 0.52 : width < 1100 ? 0.64 : 0.76;
    if (!isAndroidCapacitor || height <= 0) return widthScale;

    // The expanded slot is a 6x6 block. On the Android landscape canvas the
    // height, rather than the width, is the limiting dimension; using width
    // alone lets the expanded poster run underneath the transport controls.
    const expandedWorldHeight = EXPANSION_SPAN.rows * (CELL_SIZE + GAP) - GAP;
    const availableHeight = Math.max(160, height - 18);
    return Math.min(widthScale, availableHeight / expandedWorldHeight);
};

const getWorldBounds = (camera: LatticeCamera, viewport: { width: number; height: number }): Bounds => ({
    left: -camera.x / camera.scale,
    top: -camera.y / camera.scale,
    right: (viewport.width - camera.x) / camera.scale,
    bottom: (viewport.height - camera.y) / camera.scale,
});

export default function PosterWall({
    tiles,
    currentSong,
    onPlay,
    onTogglePlayback,
    onSeek,
    onOpenPlayer,
    onBack,
}: PosterWallProps) {
    countRender('PosterWall');
    const containerRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const cameraRef = useRef<LatticeCamera>({ x: 34, y: 80, scale: 0.76 });
    const viewportRef = useRef({ width: 1280, height: 720 });
    const frameRef = useRef<number | null>(null);
    const trackedCurrentPosterRef = useRef<{
        enabled: boolean;
        rect: Omit<ReflowTile, 'instanceId'> | null;
    }>({ enabled: false, rect: null });
    const currentPosterVisibleRef = useRef(true);
    const [bounds, setBounds] = useState<Bounds>(() => getWorldBounds(cameraRef.current, viewportRef.current));
    // Nothing is drawn until the field reports its size: the seeded camera and the default
    // viewport would otherwise place the entering wave, and the playing song, off centre.
    const [measured, setMeasured] = useState(false);
    const [entranceDone, setEntranceDone] = useState(false);
    // Camera scale, mirrored into state only so posters can size their artwork. It follows the
    // width breakpoints, so this settles after the first measure and then only moves on a resize.
    const [cameraScale, setCameraScale] = useState(() => cameraRef.current.scale);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const reducedMotion = useReducedMotionFor('lattice');
    const devicePixelRatio = useDevicePixelRatio();
    const pixelScale = cameraScale * devicePixelRatio;

    const geometry = useMemo(() => getLatticeGeometry(tiles.length, METRICS), [tiles.length]);
    const [activePoster, setActivePoster] = useLatticePosterSelection(tiles, geometry, METRICS);

    const publishCurrentPosterVisibility = useCallback((camera: LatticeCamera) => {
        const tracked = trackedCurrentPosterRef.current;
        const visible = !tracked.enabled || Boolean(
            tracked.rect && overlaps(toBounds(tracked.rect), getWorldBounds(camera, viewportRef.current)),
        );
        if (currentPosterVisibleRef.current === visible) return;
        currentPosterVisibleRef.current = visible;
        setLatticeCurrentSongPosterVisible(visible);
    }, []);

    const applyCamera = useCallback((next: LatticeCamera, updateBounds = false) => {
        cameraRef.current = next;
        if (worldRef.current) {
            worldRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
        }
        publishCurrentPosterVisibility(next);
        if (!updateBounds || frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
            setBounds(getWorldBounds(cameraRef.current, viewportRef.current));
            frameRef.current = null;
        });
    }, [publishCurrentPosterVisibility]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(([entry]) => {
            const nextViewport = { width: entry.contentRect.width, height: entry.contentRect.height };
            viewportRef.current = nextViewport;
            setViewportSize(previous => previous.width === nextViewport.width && previous.height === nextViewport.height
                ? previous : nextViewport);
            const scale = getScale(entry.contentRect.width, entry.contentRect.height);
            const previousCamera = cameraRef.current;
            // Preserve the point under the viewport centre while changing scale.
            // Without this correction a height-driven Android scale change keeps
            // the old pixel offset and throws the expanded poster below the wall.
            const worldCenterX = (entry.contentRect.width / 2 - previousCamera.x) / previousCamera.scale;
            const worldCenterY = (entry.contentRect.height / 2 - previousCamera.y) / previousCamera.scale;
            applyCamera({
                x: entry.contentRect.width / 2 - worldCenterX * scale,
                y: entry.contentRect.height / 2 - worldCenterY * scale,
                scale,
            }, true);
            setCameraScale(previous => previous === scale ? previous : scale);
            setMeasured(true);
        });
        observer.observe(container);
        return () => {
            observer.disconnect();
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
    }, [applyCamera]);

    // Widens the culled region to cover a pan's destination the moment it starts. Held arrow
    // keys interrupt each pan before it settles, so bounds cannot wait for the animation to end.
    const reserveBounds = useCallback((camera: LatticeCamera) => {
        const destination = getWorldBounds(camera, viewportRef.current);
        setBounds(current => {
            const covered = destination.left >= current.left && destination.right <= current.right
                && destination.top >= current.top && destination.bottom <= current.bottom;
            if (covered) return current;

            const merged = {
                left: Math.min(current.left, destination.left),
                right: Math.max(current.right, destination.right),
                top: Math.min(current.top, destination.top),
                bottom: Math.max(current.bottom, destination.bottom),
            };
            // A long flight would otherwise reserve more than the render cap can fill, which
            // empties the far end; past that point only the destination is worth keeping.
            const mergedArea = (merged.right - merged.left) * (merged.bottom - merged.top);
            const destinationArea = (destination.right - destination.left)
                * (destination.bottom - destination.top);
            return mergedArea > destinationArea * MAX_RESERVED_VIEWPORTS ? destination : merged;
        });
    }, []);

    const { panTo, stopPan, animationRef } = useWallCameraPan({ cameraRef, viewportRef, reducedMotion, applyCamera, reserveBounds });

    useEffect(() => {
        if (!measured || entranceDone) return;
        if (reducedMotion) {
            setEntranceDone(true);
            return;
        }
        const timer = setTimeout(() => setEntranceDone(true), ENTRANCE_WINDOW);
        return () => clearTimeout(timer);
    }, [entranceDone, measured, reducedMotion]);

    // Posters landing in the opening wave are held back by their distance from that corner; once
    // the wave is over every poster mounts in place, so panning never replays it.
    const getEntranceDelay = useCallback((rect: { x: number; y: number }) => {
        // On Android, cards mount continuously as the camera crosses the cull boundary. Replaying
        // an opacity/scale entrance for each arriving card reads as flicker and competes with touch.
        if (isAndroidCapacitor || entranceDone || reducedMotion) return null;
        const steps = Math.max(0, rect.x - bounds.left) + Math.max(0, rect.y - bounds.top);
        return Math.min(ENTRANCE_MAX_DELAY, (steps / (CELL_SIZE + GAP)) * ENTRANCE_STAGGER);
    }, [bounds.left, bounds.top, entranceDone, reducedMotion]);

    // The entry wave reaches the top-left first; leaving reverses that order while cards retrace
    // their upward flight, so the wall empties back toward the corner it entered from.
    //
    // Permanently identified, and reading the corner it measures from through a ref, because the
    // posters hold this across camera moves. A delay computed per render would have to be handed
    // down as a changing number, and the corner moves with every pan - which defeated
    // LatticePoster's memo and re-rendered every mounted card on each re-cull. The card calls this
    // when it actually leaves, so the wave is still measured against the corner of the moment.
    const exitWaveRef = useRef({ bounds, reducedMotion });
    exitWaveRef.current = { bounds, reducedMotion };
    const getExitDelay = useCallback((rect: { x: number; y: number }) => {
        const { bounds: corner, reducedMotion: reduced } = exitWaveRef.current;
        if (reduced) return 0;
        const steps = Math.max(0, rect.x - corner.left) + Math.max(0, rect.y - corner.top);
        const entranceDelay = Math.min(ENTRANCE_MAX_DELAY, (steps / (CELL_SIZE + GAP)) * ENTRANCE_STAGGER);
        return ENTRANCE_MAX_DELAY - entranceDelay;
    }, []);

    const instances = useMemo(() => {
        if (!measured) return [];
        // `bounds` may include a swept region reserved for the next pan destination. Use the
        // camera's actual viewport as the cap priority so overscan never evicts visible cards.
        const priorityBounds = getWorldBounds(cameraRef.current, viewportRef.current);
        const visible = layoutLattice(
            geometry,
            tiles.length,
            bounds,
            OVERSCAN,
            METRICS,
            isAndroidCapacitor ? MAX_ANDROID_POSTERS : undefined,
            priorityBounds,
        );
        if (!activePoster) return visible;

        // Expansion reflows every card in its block. Some siblings can move into the viewport
        // even when their pre-expansion rect was outside the culling window, so keep the entire
        // source block mounted until it collapses; otherwise those destination slots show holes.
        const block = getInstanceBlock(geometry, activePoster.instance);
        const renderedIds = new Set(visible.map(instance => instance.instanceId));
        const expandedSiblings = Array.from({ length: SLOTS_PER_BLOCK }, (_, slotIndex) => (
            locateInstanceAt(geometry, tiles.length, block.column, block.row, slotIndex, METRICS)
        )).filter((instance): instance is QueueInstance => (
            instance !== null && !renderedIds.has(instance.instanceId)
        ));
        return [...visible, ...expandedSiblings];
    }, [activePoster, bounds, geometry, measured, tiles.length]);

    // World point the viewport is centred on; both the keyboard seed and playback follow need it.
    const getViewportCenter = useCallback(() => {
        const camera = cameraRef.current;
        const viewport = viewportRef.current;
        return {
            x: (viewport.width / 2 - camera.x) / camera.scale,
            y: (viewport.height / 2 - camera.y) / camera.scale,
        };
    }, []);

    const { didDragRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture } = useWallPointerPan({
        applyCamera,
        animationRef,
        stopPan,
        containerRef,
        reducedMotion,
        overscan: OVERSCAN,
        bounds,
        cameraRef,
        getWorldBounds,
        viewportRef,
    });

    // Only the block holding the open card is re-geared; every other poster keeps its base rect.
    const layout = useMemo(() => (
        activePoster
            ? layoutExpandedBlock(geometry, tiles.length, activePoster.instance, METRICS)
            : new Map<string, { x: number; y: number; width: number; height: number }>()
    ), [activePoster, geometry, tiles.length]);

    // The resize correction reads current selection/layout, but must not run when a poster is
    // selected: `expandPoster` already animates the camera to its expanded rect. Running both
    // paths used to cancel that pan and snap to the destination on the next layout commit.
    const resizeTargetRef = useRef({ activePoster, layout });
    resizeTargetRef.current = { activePoster, layout };

    useEffect(() => {
        const currentSongKey = currentSong ? getPlaybackSongKey(currentSong) : null;
        const isTracking = measured && Boolean(currentSongKey);
        const rect = activePoster && activePoster.tile.id === currentSongKey
            ? layout.get(activePoster.instance.instanceId) ?? activePoster.instance
            : null;
        trackedCurrentPosterRef.current = { enabled: isTracking, rect };
        publishCurrentPosterVisibility(cameraRef.current);
    }, [activePoster, currentSong, layout, measured, publishCurrentPosterVisibility]);

    useEffect(() => () => {
        currentPosterVisibleRef.current = true;
        setLatticeCurrentSongPosterVisible(true);
    }, []);

    const { focused, setFocused, handleKeyDown, handleFocusCapture, handleBlurCapture } = useWallKeyboardFocus({
        activePoster,
        containerRef,
        geometry,
        getViewportCenter,
        instances,
        metrics: METRICS,
        panTo,
        rendered: layout,
        setActivePoster,
        tiles,
        worldRef,
        onBack,
    });

    // Permanent identities for the two handlers every poster receives. An arrow per poster is
    // re-created on each wall render, which alone would defeat LatticePoster's memo and put all
    // 50+ poster bodies back on the critical path of every unrelated App re-render.
    const latestWall = useRef({ geometry, instances, tiles });
    latestWall.current = { geometry, instances, tiles };
    const expandPoster = useCallback((instanceId: string) => {
        const { geometry: currentGeometry, instances: currentInstances, tiles: currentTiles } = latestWall.current;
        const instance = currentInstances.find(item => item.instanceId === instanceId);
        const tile = instance ? currentTiles[instance.queueIndex] : undefined;
        if (!instance || !tile) return;
        setFocused(instance);
        setActivePoster({ instance, tile });
        // Expansion reflows both the position and size of the selected slot.
        const expandedRect = layoutExpandedBlock(currentGeometry, currentTiles.length, instance, METRICS).get(instanceId);
        if (expandedRect) panTo(expandedRect);
    }, [panTo, setActivePoster, setFocused]);
    const collapsePoster = useCallback(() => setActivePoster(null), [setActivePoster]);

    useLatticePlaybackFocus({
        currentSong,
        ready: measured,
        tiles,
        geometry,
        metrics: METRICS,
        getViewportCenter,
        setActivePoster,
        setFocused,
        panTo,
    });

    // A viewport resize changes the camera scale and can leave the opened queue card
    // outside the short Android landscape frame. Once the new measurement and reflow
    // have committed, re-centre that card using the actual viewport instead of keeping
    // the old camera's screen-space offset.
    useLayoutEffect(() => {
        if (!measured || viewportSize.width <= 0 || viewportSize.height <= 0) return;
        const { activePoster: selectedPoster, layout: currentLayout } = resizeTargetRef.current;
        if (!selectedPoster) return;
        const expandedRect = currentLayout.get(selectedPoster.instance.instanceId);
        if (expandedRect) panTo(expandedRect, true);
    }, [cameraScale, measured, panTo, viewportSize]);

    return (
        <div
            ref={containerRef}
            className="lattice-field"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            onFocusCapture={handleFocusCapture}
            onBlurCapture={handleBlurCapture}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={event => {
                // Touch transfers implicit capture from the poster to the field when dragging.
                if (event.target === event.currentTarget) onPointerCancel(event);
            }}
            onClickCapture={onClickCapture}
        >
            <div ref={worldRef} className="lattice-world">
                {instances.map(instance => {
                    const tile = tiles[instance.queueIndex];
                    if (!tile) return null;
                    const expanded = activePoster?.instance.instanceId === instance.instanceId;
                    const rect = layout.get(instance.instanceId) ?? instance;
                    return (
                        <LatticePoster
                            key={instance.instanceId}
                            instanceId={instance.instanceId}
                            isFocused={focused?.instanceId === instance.instanceId}
                            tile={tile}
                            rect={rect}
                            gap={METRICS.gap}
                            pixelScale={pixelScale}
                            expandedSize={EXPANDED_SIZE}
                            entranceDelay={getEntranceDelay(rect)}
                            getExitDelay={getExitDelay}
                            expanded={expanded}
                            reducedMotion={reducedMotion}
                            didDragRef={didDragRef}
                            onExpand={expandPoster}
                            onPlay={onPlay}
                            onTogglePlayback={onTogglePlayback}
                            onSeek={onSeek}
                            onOpenPlayer={onOpenPlayer}
                        />
                    );
                })}
            </div>

        </div>
    );
}
