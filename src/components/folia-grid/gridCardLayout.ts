// src/components/folia-grid/gridCardLayout.ts
// Card-box adjustments the folia hex walls share. Kept out of GridView and ArtistGridView because
// both hold their own breakpoint table and would otherwise each carry a copy of this arithmetic.

export type GridCardBox = {
    cardWidth: number;
    cardHeight: number;
    spacingX: number;
    spacingY: number;
};

/**
 * Squares the card box for the square-card option, at constant area.
 *
 * The side is the geometric mean of the poster box, so the square card covers the same artwork
 * area the breakpoint was tuned to show — squaring by simply dropping the height instead loses a
 * third of the card and leaves the wall looking sparse. Each axis' spacing then scales by that
 * axis' own change, which keeps every gap in proportion and keeps the grid cell's area identical.
 *
 * The two scale factors multiply to exactly 1, so the wall's radial density is unchanged and
 * `maxDistance` / `lodStart` / `lodEnd` need no adjustment: a card N rings out sits where it did.
 */
export const squareGridCardBox = <T extends GridCardBox>(box: T): T => {
    const side = Math.round(Math.sqrt(box.cardWidth * box.cardHeight));
    return {
        ...box,
        cardWidth: side,
        cardHeight: side,
        spacingX: Math.round(box.spacingX * (side / box.cardWidth)),
        spacingY: Math.round(box.spacingY * (side / box.cardHeight)),
    };
};

/** Fits Android drag limits to the actual finite card coordinates in the current collection. */
export const resolveGridContentDragBounds = (
    coords: ReadonlyArray<{ baseX: number; baseY: number }>,
    viewport: { width: number; height: number },
    card: { width: number; height: number; minScale: number },
) => {
    if (coords.length === 0) return { left: 0, right: 0, top: 0, bottom: 0 };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const coord of coords) {
        minX = Math.min(minX, coord.baseX);
        maxX = Math.max(maxX, coord.baseX);
        minY = Math.min(minY, coord.baseY);
        maxY = Math.max(maxY, coord.baseY);
    }

    const edgeInsetX = Math.max(0, (viewport.width - card.width * 1.18 * card.minScale) / 2);
    const edgeInsetY = Math.max(0, (viewport.height - card.height * 1.18 * card.minScale) / 2);
    let left = -maxX + edgeInsetX;
    let right = -minX - edgeInsetX;
    let top = -maxY + edgeInsetY;
    let bottom = -minY - edgeInsetY;

    // If the finite collection already fits in the viewport on an axis, keep that axis still.
    if (left > right) left = right = (left + right) / 2;
    if (top > bottom) top = bottom = (top + bottom) / 2;
    return { left, right, top, bottom };
};
