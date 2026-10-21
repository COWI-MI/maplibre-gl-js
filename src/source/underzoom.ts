/**
 * The largest supported underzoom distance. Each extra level can require four times as many tiles.
 */
export const MAX_UNDERZOOM_LEVELS = 4;

/**
 * Bounds tile selection even when source validation is disabled or coveringTiles is called directly.
 * Non-finite values disable underzooming; finite values are floored and clamped to zero through four.
 */
export function normalizeUnderzoomLevels(levels = 0): number {
    return Number.isFinite(levels) ? Math.max(0, Math.min(MAX_UNDERZOOM_LEVELS, Math.floor(levels))) : 0;
}
