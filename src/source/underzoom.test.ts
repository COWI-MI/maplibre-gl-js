import {expect, test} from 'vitest';
import {normalizeUnderzoomLevels} from './underzoom.ts';

test('bounds values supplied without source validation', () => {
    expect(normalizeUnderzoomLevels()).toBe(0);
    expect([0, 2, 4, -1, 2.5, 100, NaN, Infinity].map(normalizeUnderzoomLevels)).toEqual([0, 2, 4, 0, 2, 4, 0, 0]);
});
