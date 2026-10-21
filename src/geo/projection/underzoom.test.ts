import {describe, expect, test} from 'vitest';
import {coveringTiles} from './covering_tiles.ts';
import {createMercatorTransform} from './mercator_transform.ts';
import {createGlobeTransform} from './globe_transform.ts';
import {LngLat} from '../lng_lat.ts';

import type {ITransform} from '../transform_interface.ts';

/** A small viewport with a stable tile ordering and no repeated world copies. */
function createView(zoom: number, size = 200): ITransform {
    const transform = createMercatorTransform();
    transform.setRenderWorldCopies(false);
    transform.resize(size, size);
    transform.setCenter(new LngLat(-0.01, 0.01));
    transform.setZoom(zoom);
    return transform;
}

describe('bounded underzooming', () => {
    test('zero preserves default coverage both inside and outside the native range', () => {
        for (const pitch of [0, 60]) {
            for (const zoom of [0, 1, 2, 14, 18]) {
                const transform = createView(zoom);
                transform.setPitch(pitch);
                const options = {tileSize: 512, minzoom: 2, maxzoom: 14};
                expect(coveringTiles(transform, {...options, underzoomLevels: 0})).toEqual(coveringTiles(transform, options));
            }
        }
        expect(coveringTiles(createView(1), {tileSize: 512, minzoom: 2})).toEqual([]);
    });

    test('uses native minimum tiles over the same geographic footprint', () => {
        const options = {tileSize: 512, minzoom: 2, maxzoom: 14};
        const tiles = coveringTiles(createView(1), {...options, underzoomLevels: 1});
        const nativeTiles = coveringTiles(createView(2, 400), options);
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles.map(tile => tile.key).sort()).toEqual(nativeTiles.map(tile => tile.key).sort());
        expect(tiles.every(tile => tile.canonical.z === 2 && tile.overscaledZ === 2)).toBe(true);
    });

    test('drops coverage beyond the limit without descending to a high source minimum', () => {
        expect(coveringTiles(createView(0), {tileSize: 512, minzoom: 2, underzoomLevels: 1})).toEqual([]);
        expect(coveringTiles(createView(0), {tileSize: 512, minzoom: 22, underzoomLevels: 4})).toEqual([]);
        expect(coveringTiles(createView(0), {tileSize: 512, minzoom: 5, underzoomLevels: 100})).toEqual([]);
    });

    test('retains native coverage and overzooming when enabled', () => {
        for (const zoom of [2, 6, 14, 18]) {
            const options = {tileSize: 512, minzoom: 2, maxzoom: 14, reparseOverscaled: true};
            expect(coveringTiles(createView(zoom), {...options, underzoomLevels: 3})).toEqual(coveringTiles(createView(zoom), options));
        }
    });

    test('uses the existing tile-size adjustment and raster zoom rounding', () => {
        const options = {tileSize: 512, minzoom: 2, roundZoom: true, underzoomLevels: 1};
        expect(coveringTiles(createView(0.4), options)).toEqual([]);
        expect(coveringTiles(createView(0.6), options).every(tile => tile.canonical.z === 2)).toBe(true);
        const tiles = coveringTiles(createView(0), {...options, tileSize: 256});
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles.every(tile => tile.canonical.z === 2)).toBe(true);
    });

    test('bounds the full-world subdivision at four levels', () => {
        const counts = [1, 2, 3, 4].map(minzoom => coveringTiles(createView(0, 512), {
            tileSize: 512, minzoom, maxzoom: 14, underzoomLevels: 4
        }).length);
        expect(counts).toEqual([4, 16, 64, 256]);
    });

    test('keeps pitched, antimeridian and globe coverage in native tile coordinates', () => {
        for (const longitude of [0, 179.9, -179.9]) {
            const transform = createView(1, 512);
            transform.setCenter(new LngLat(longitude, 0));
            transform.setPitch(60);
            const tiles = coveringTiles(transform, {tileSize: 512, minzoom: 2, underzoomLevels: 2});
            expect(tiles.length).toBeGreaterThan(0);
            expect(tiles.length).toBeLessThanOrEqual(16);
            expect(tiles.every(tile => tile.canonical.z === 2 && tile.canonical.x >= 0 && tile.canonical.x < 4)).toBe(true);
        }
        const globe = createGlobeTransform();
        globe.resize(512, 512);
        globe.setCenter(new LngLat(179.9, 0));
        globe.setZoom(0);
        const tiles = coveringTiles(globe, {tileSize: 512, minzoom: 2, underzoomLevels: 2});
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles.every(tile => tile.canonical.z === 2)).toBe(true);
    });
});
