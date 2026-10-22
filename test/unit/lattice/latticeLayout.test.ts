import { describe, expect, it } from 'vitest';
import {
    getInstanceBlock,
    getLatticeGeometry,
    layoutExpandedBlock,
    layoutLattice,
    locateInstanceAt,
    locateNearestInstance,
} from '../../../src/components/app/lattice/layout';
import {
    BLOCK_COLS,
    BLOCK_ROWS,
    EXPANSION_SPAN,
    SLOTS_PER_BLOCK,
    getBlockReflow,
    getBlockTemplate,
    getPreferredBlockReflow,
} from '../../../src/components/app/lattice/blockTemplates';

// Covers the anchored expansion contract and the infinite lattice, without the browser UI.

const overlaps = (
    first: { x: number; y: number; width: number; height: number },
    second: { x: number; y: number; width: number; height: number },
) => first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;

describe('gear reflow tables', () => {
    const coordinates = Array.from({ length: 36 }, (_, index) => [index % 6, Math.floor(index / 6)]);

    it('re-covers the block exactly for every slot that can be expanded', () => {
        for (const [column, row] of coordinates) {
            for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
                const reflow = getBlockReflow(column, row, slotIndex)!;
                expect(reflow).toHaveLength(SLOTS_PER_BLOCK);

                const cover = new Int8Array(BLOCK_COLS * BLOCK_ROWS);
                for (const slot of reflow) {
                    expect(slot.x).toBeGreaterThanOrEqual(0);
                    expect(slot.y).toBeGreaterThanOrEqual(0);
                    expect(slot.x + slot.cols).toBeLessThanOrEqual(BLOCK_COLS);
                    expect(slot.y + slot.rows).toBeLessThanOrEqual(BLOCK_ROWS);
                    for (let y = slot.y; y < slot.y + slot.rows; y += 1) {
                        for (let x = slot.x; x < slot.x + slot.cols; x += 1) {
                            cover[y * BLOCK_COLS + x] += 1;
                        }
                    }
                }

                expect(cover.filter(count => count !== 1)).toHaveLength(0);
            }
        }
    });

    it('gives the expanded slot the expansion gear', () => {
        for (const [column, row] of coordinates) {
            for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
                const slot = getBlockReflow(column, row, slotIndex)![slotIndex];
                expect({ cols: slot.cols, rows: slot.rows }).toEqual(EXPANSION_SPAN);
            }
        }
    });

    it('prefers a mirror reflow that reduces movement around the tapped card', () => {
        for (const [column, row] of coordinates) {
            const template = getBlockTemplate(column, row);
            for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
                const score = (candidate: ReturnType<typeof getBlockReflow>) => candidate!.reduce((total, to, index) => {
                    const from = template[index];
                    const dx = to.x - from.x;
                    const dy = to.y - from.y;
                    const dCols = to.cols - from.cols;
                    const dRows = to.rows - from.rows;
                    const movement = dx * dx + dy * dy + 0.5 * (dCols * dCols + dRows * dRows);
                    return total + movement * (index === slotIndex ? 16 : 1);
                }, 0);

                expect(score(getPreferredBlockReflow(column, row, slotIndex)))
                    .toBeLessThanOrEqual(score(getBlockReflow(column, row, slotIndex)));
            }
        }
    });

    it('keeps every card, so nothing pops out of existence while one is open', () => {
        for (const [column, row] of coordinates) {
            const base = getBlockTemplate(column, row);
            for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
                expect(getBlockReflow(column, row, slotIndex)).toHaveLength(base.length);
            }
        }
    });

    it('refuses a slot outside the block', () => {
        expect(getBlockReflow(0, 0, -1)).toBeNull();
        expect(getBlockReflow(0, 0, SLOTS_PER_BLOCK)).toBeNull();
    });
});

describe('block templates', () => {
    const orientations = Array.from({ length: 64 }, (_, index) => getBlockTemplate(index % 8, Math.floor(index / 8)));

    it('covers every block exactly, with no gap to leave', () => {
        for (const slots of orientations) {
            expect(slots).toHaveLength(SLOTS_PER_BLOCK);

            const cover = new Int8Array(BLOCK_COLS * BLOCK_ROWS);
            for (const slot of slots) {
                expect(slot.x).toBeGreaterThanOrEqual(0);
                expect(slot.y).toBeGreaterThanOrEqual(0);
                expect(slot.x + slot.cols).toBeLessThanOrEqual(BLOCK_COLS);
                expect(slot.y + slot.rows).toBeLessThanOrEqual(BLOCK_ROWS);
                for (let row = slot.y; row < slot.y + slot.rows; row += 1) {
                    for (let column = slot.x; column < slot.x + slot.cols; column += 1) {
                        cover[row * BLOCK_COLS + column] += 1;
                    }
                }
            }

            expect(cover.filter(count => count !== 1)).toHaveLength(0);
        }
    });

    it('keeps real size contrast inside every block', () => {
        for (const slots of orientations) {
            const areas = slots.map(slot => slot.cols * slot.rows);
            expect(Math.max(...areas)).toBeGreaterThanOrEqual(16);
            expect(areas.filter(area => area === 4).length).toBeGreaterThanOrEqual(2);
            expect(new Set(slots.map(slot => `${slot.cols}x${slot.rows}`)).size).toBeGreaterThanOrEqual(5);
        }
    });

    it('does not hand neighbouring blocks the same orientation', () => {
        const key = (column: number, row: number) => JSON.stringify(getBlockTemplate(column, row));
        let repeats = 0;
        for (let row = 0; row < 8; row += 1) {
            for (let column = 0; column < 8; column += 1) {
                if (column > 0 && key(column, row) === key(column - 1, row)) repeats += 1;
                if (row > 0 && key(column, row) === key(column, row - 1)) repeats += 1;
            }
        }

        expect(repeats).toBe(0);
    });
});

describe('infinite lattice', () => {
    const metrics = { cellSize: 128, gap: 8 };
    const TOTAL = 30;
    const geometry = getLatticeGeometry(TOTAL, metrics);

    const viewport = (left: number, top: number) => ({
        left, top, right: left + 2400, bottom: top + 1400,
    });

    it('seats at least the whole queue in one cell', () => {
        expect(geometry.cellSlots).toBeGreaterThanOrEqual(TOTAL);
        expect(geometry.cellSlots % SLOTS_PER_BLOCK).toBe(0);
    });

    it('fills the viewport no matter how far it travels', () => {
        for (const [left, top] of [[0, 0], [50_000, 0], [-90_000, 40_000], [0, -250_000]]) {
            const instances = layoutLattice(geometry, TOTAL, viewport(left, top), 0, metrics);

            expect(instances.length).toBeGreaterThan(0);
            expect(instances.every(instance => instance.queueIndex >= 0 && instance.queueIndex < TOTAL)).toBe(true);
        }
    });

    it('limits offscreen preloads without removing visible posters', () => {
        const bounds = viewport(-3000, -2000);
        const instances = layoutLattice(geometry, TOTAL, bounds, 500, metrics, 24);
        const visibleIds = layoutLattice(geometry, TOTAL, bounds, 0, metrics)
            .map(instance => instance.instanceId);

        expect(instances.length).toBeGreaterThanOrEqual(visibleIds.length);
        expect(instances.map(instance => instance.instanceId)).toEqual(expect.arrayContaining(visibleIds));
        expect(instances.length - visibleIds.length).toBeLessThanOrEqual(Math.max(0, 24 - visibleIds.length));
        expect(instances.every(instance => instance.queueIndex >= 0 && instance.queueIndex < TOTAL)).toBe(true);
    });

    it('keeps every on-screen poster even when the viewport exceeds the render budget', () => {
        const bounds = { left: 0, top: 0, right: 480, bottom: 320 };
        const allCandidates = layoutLattice(geometry, TOTAL, bounds, 1200, metrics);
        const visibleIds = allCandidates
            .filter(instance => overlaps(instance, {
                x: bounds.left,
                y: bounds.top,
                width: bounds.right - bounds.left,
                height: bounds.bottom - bounds.top,
            }))
            .map(instance => instance.instanceId);
        const capped = layoutLattice(geometry, TOTAL, bounds, 1200, metrics, 18);

        expect(visibleIds.length).toBeLessThanOrEqual(18);
        expect(capped.map(instance => instance.instanceId)).toEqual(expect.arrayContaining(visibleIds));
        expect(capped).toHaveLength(18);

        const wideBounds = { left: 0, top: 0, right: 2400, bottom: 1400 };
        const wideCandidates = layoutLattice(geometry, TOTAL, wideBounds, 1000, metrics);
        const wideVisibleIds = wideCandidates
            .filter(instance => overlaps(instance, {
                x: wideBounds.left,
                y: wideBounds.top,
                width: wideBounds.right - wideBounds.left,
                height: wideBounds.bottom - wideBounds.top,
            }))
            .map(instance => instance.instanceId);
        const wideCapped = layoutLattice(geometry, TOTAL, wideBounds, 1000, metrics, 18);

        expect(wideVisibleIds.length).toBeGreaterThan(18);
        expect(wideCapped.map(instance => instance.instanceId)).toEqual(expect.arrayContaining(wideVisibleIds));
        expect(wideCapped.length).toBe(wideVisibleIds.length);
    });

    it('prioritizes the live viewport instead of a larger reserved pan region', () => {
        const reserved = { left: -1200, top: -900, right: 2400, bottom: 1700 };
        const liveViewport = { left: 150, top: 140, right: 630, bottom: 460 };
        const allCandidates = layoutLattice(geometry, TOTAL, reserved, 0, metrics);
        const viewportIds = allCandidates
            .filter(instance => overlaps(instance, {
                x: liveViewport.left,
                y: liveViewport.top,
                width: liveViewport.right - liveViewport.left,
                height: liveViewport.bottom - liveViewport.top,
            }))
            .map(instance => instance.instanceId);
        const capped = layoutLattice(geometry, TOTAL, reserved, 0, metrics, 18, liveViewport);

        expect(viewportIds.length).toBeLessThanOrEqual(18);
        expect(capped.map(instance => instance.instanceId)).toEqual(expect.arrayContaining(viewportIds));
    });

    it('never overlaps two posters, including across cell seams', () => {
        const instances = layoutLattice(geometry, TOTAL, {
            left: geometry.cellWidth - 400,
            right: geometry.cellWidth + 2000,
            top: geometry.cellHeight - 400,
            bottom: geometry.cellHeight + 1400,
        }, 0, metrics);

        expect(instances.length).toBeGreaterThan(0);
        for (let i = 0; i < instances.length; i += 1) {
            for (let j = i + 1; j < instances.length; j += 1) {
                expect(overlaps(instances[i], instances[j])).toBe(false);
            }
        }
    });

    it('repeats by pure translation of the cell', () => {
        for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
            const base = locateInstanceAt(geometry, TOTAL, 0, 0, slotIndex, metrics)!;
            const shifted = locateInstanceAt(
                geometry,
                TOTAL,
                3 * geometry.blocksPerRow,
                -2 * geometry.blockRows,
                slotIndex,
                metrics,
            )!;

            expect(shifted.cellSlot).toBe(base.cellSlot);
            expect(shifted.queueIndex).toBe(base.queueIndex);
            expect(shifted.x).toBe(base.x + 3 * geometry.cellWidth);
            expect(shifted.y).toBe(base.y - 2 * geometry.cellHeight);
        }
    });

    it('gives every song at least one seat per cell', () => {
        const seats = new Set<number>();
        for (let cellSlot = 0; cellSlot < geometry.cellSlots; cellSlot += 1) {
            seats.add(cellSlot % TOTAL);
        }

        expect(seats.size).toBe(TOTAL);
    });

    it('keeps instance ids unique per drawn copy', () => {
        const instances = layoutLattice(geometry, TOTAL, viewport(-3000, -2000), 500, metrics);

        expect(new Set(instances.map(instance => instance.instanceId)).size).toBe(instances.length);
    });

    it('reports the absolute block a poster sits in', () => {
        const instance = locateInstanceAt(geometry, TOTAL, -5, 7, 3, metrics)!;
        const block = getInstanceBlock(geometry, instance);

        expect(block).toEqual({ column: -5, row: 7, slotIndex: 3 });
    });

    describe('layoutExpandedBlock', () => {
        const active = locateInstanceAt(geometry, TOTAL, 1, 1, 5, metrics)!;
        const reflowed = layoutExpandedBlock(geometry, TOTAL, active, metrics);

        it('reflows the complete block so the selected poster does not cover its neighbours', () => {
            expect(reflowed.size).toBe(SLOTS_PER_BLOCK);
            expect(reflowed.has(active.instanceId)).toBe(true);

            for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
                const sibling = locateInstanceAt(geometry, TOTAL, 1, 1, slotIndex, metrics)!;
                expect(reflowed.has(sibling.instanceId)).toBe(true);
            }
        });

        it('leaves every poster outside the selected block at its base rect', () => {
            for (const [column, row] of [[0, 1], [2, 1], [1, 0], [1, 2], [-1, -1]]) {
                for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
                    const outsider = locateInstanceAt(geometry, TOTAL, column, row, slotIndex, metrics)!;
                    expect(reflowed.has(outsider.instanceId)).toBe(false);
                }
            }
        });

        it('keeps the reflow inside the block and free of card overlap', () => {
            const rects = [...reflowed.values()];
            const originX = geometry.blockWidth;
            const originY = geometry.blockHeight;

            for (const rect of rects) {
                expect(rect.x).toBeGreaterThanOrEqual(originX);
                expect(rect.y).toBeGreaterThanOrEqual(originY);
                expect(rect.x + rect.width).toBeLessThanOrEqual(originX + geometry.blockWidth);
                expect(rect.y + rect.height).toBeLessThanOrEqual(originY + geometry.blockHeight);
            }

            for (let i = 0; i < rects.length; i += 1) {
                for (let j = i + 1; j < rects.length; j += 1) {
                    expect(overlaps(rects[i], rects[j])).toBe(false);
                }
            }
        });

        it('gives the open card the expansion gear', () => {
            const pitch = metrics.cellSize + metrics.gap;
            const rect = reflowed.get(active.instanceId)!;

            expect(rect.width).toBe(EXPANSION_SPAN.cols * pitch - metrics.gap);
            expect(rect.height).toBe(EXPANSION_SPAN.rows * pitch - metrics.gap);
        });

        it('does nothing for an empty queue', () => {
            expect(layoutExpandedBlock(geometry, 0, active, metrics).size).toBe(0);
        });
    });

    describe('locateNearestInstance', () => {
        it('picks the copy closest to the viewport, cells away from the origin', () => {
            const far = { x: geometry.cellWidth * 6 + 500, y: geometry.cellHeight * 4 + 300 };
            const nearest = locateNearestInstance(geometry, TOTAL, 7, far, metrics)!;

            expect(nearest.queueIndex).toBe(7);
            for (const repeatX of [-1, 0, 1]) {
                for (const repeatY of [-1, 0, 1]) {
                    const rival = locateInstanceAt(
                        geometry,
                        TOTAL,
                        (nearest.repeatX + repeatX) * geometry.blocksPerRow
                            + (Math.floor(nearest.cellSlot / SLOTS_PER_BLOCK) % geometry.blocksPerRow),
                        (nearest.repeatY + repeatY) * geometry.blockRows
                            + Math.floor(Math.floor(nearest.cellSlot / SLOTS_PER_BLOCK) / geometry.blocksPerRow),
                        nearest.cellSlot % SLOTS_PER_BLOCK,
                        metrics,
                    )!;
                    const distance = (instance: typeof rival) => (
                        (instance.x + instance.width / 2 - far.x) ** 2
                        + (instance.y + instance.height / 2 - far.y) ** 2
                    );
                    expect(distance(nearest)).toBeLessThanOrEqual(distance(rival) + 1e-6);
                }
            }
        });

        it('refuses an index outside the queue', () => {
            expect(locateNearestInstance(geometry, TOTAL, -1, { x: 0, y: 0 }, metrics)).toBeNull();
            expect(locateNearestInstance(geometry, TOTAL, TOTAL, { x: 0, y: 0 }, metrics)).toBeNull();
        });
    });
});
