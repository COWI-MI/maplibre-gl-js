import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {beforeMapTest, createMap} from '../../util/test/util.ts';

import type {Map} from '../map.ts';
import type {UnderzoomLevels, SourceSpecification, StyleSpecification} from '../../style/source_specification.ts';
import type {VectorTileSource} from '../../source/vector_tile_source.ts';
import type {RasterTileSource} from '../../source/raster_tile_source.ts';

let map: Map;

beforeEach(() => {
    beforeMapTest();
});

afterEach(() => {
    map?.remove();
});

describe('source underzoom options', () => {
    test('loads, serializes and restores typed source options from a whole style', async () => {
        const style: StyleSpecification = {version: 8, sources: {
            vector: {type: 'vector', tiles: ['https://example.com/{z}/{x}/{y}.pbf'], minzoom: 2, underzoomLevels: 2},
            raster: {type: 'raster', tiles: ['https://example.com/{z}/{x}/{y}.png'], minzoom: 2, underzoomLevels: 1}
        }, layers: []};
        map = createMap({style});
        await map.once('load');
        expect(map.getSource<VectorTileSource>('vector').underzoomLevels).toBe(2);
        expect(map.getSource<RasterTileSource>('raster').underzoomLevels).toBe(1);
        const serialized = map.getStyle();
        expect(serialized.sources.vector).toMatchObject({underzoomLevels: 2});
        expect(serialized.sources.raster).toMatchObject({underzoomLevels: 1});
        map.setStyle(serialized, {diff: false});
        await map.once('style.load');
        expect(map.getSource<VectorTileSource>('vector').underzoomLevels).toBe(2);
    });

    test('accepts supported source options through addSource and defaults to zero', async () => {
        map = createMap({style: {version: 8, sources: {}, layers: []}});
        await map.once('load');
        const levels: UnderzoomLevels[] = [0, 1, 2, 3, 4];
        for (const level of levels) {
            map.addSource(`vector-${level}`, {type: 'vector', tiles: ['https://example.com/{z}/{x}/{y}.pbf'], underzoomLevels: level});
            expect(map.getSource<VectorTileSource>(`vector-${level}`).underzoomLevels).toBe(level);
        }
        map.addSource('raster', {type: 'raster', tiles: ['https://example.com/{z}/{x}/{y}.png'], underzoomLevels: 2});
        expect(map.getSource<RasterTileSource>('raster').underzoomLevels).toBe(2);
        map.addSource('default', {type: 'vector', tiles: ['https://example.com/{z}/{x}/{y}.pbf']});
        expect(map.getSource<VectorTileSource>('default').underzoomLevels).toBe(0);
    });

    test('rejects invalid values and unsupported source types through the public API', async () => {
        map = createMap({style: {version: 8, sources: {}, layers: []}});
        await map.once('load');
        const errors: string[] = [];
        map.on('error', event => errors.push(event.error.message));
        for (const value of [-1, 1.5, 5, '2', null, true, NaN, Infinity]) {
            map.addSource('invalid', {type: 'vector', tiles: ['https://example.com/{z}/{x}/{y}.pbf'], underzoomLevels: value} as SourceSpecification);
            expect(map.getSource('invalid')).toBeUndefined();
        }
        map.addSource('dem', {type: 'raster-dem', tiles: ['https://example.com/{z}/{x}/{y}.png'], underzoomLevels: 2} as unknown as SourceSpecification);
        expect(map.getSource('dem')).toBeUndefined();
        map.addSource('geojson', {type: 'geojson', data: {type: 'FeatureCollection', features: []}, underzoomLevels: 2} as unknown as SourceSpecification);
        expect(map.getSource('geojson')).toBeUndefined();
        expect(errors).toHaveLength(10);
        expect(errors.every(message => message.includes('underzoomLevels'))).toBe(true);
    });
});
