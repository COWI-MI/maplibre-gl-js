import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test} from 'vitest';
import http from 'node:http';
import st from 'st';
import {GeoJSONVT, type GeoJSONVTTile} from '@maplibre/geojson-vt';
import {fromGeojsonVt} from '@maplibre/vt-pbf';
import {PNG} from 'pngjs';
import {launchPuppeteer} from '../lib/puppeteer_config.ts';

import type {AddressInfo} from 'node:net';
import type {Browser, Page} from 'puppeteer';
import type * as MapLibreGL from '../../../dist/maplibre-gl';

const vectorTiles = new GeoJSONVT({type: 'FeatureCollection', features: [
    {type: 'Feature', properties: {kind: 'fill'}, geometry: {type: 'Polygon', coordinates: [[[-20, -15], [20, -15], [20, 15], [-20, 15], [-20, -15]]]}},
    {type: 'Feature', properties: {kind: 'line'}, geometry: {type: 'LineString', coordinates: [[-30, -20], [30, 20]]}},
    ...[-179.5, 30, 179.5].map(longitude => ({type: 'Feature' as const, properties: {kind: 'point'}, geometry: {type: 'Point' as const, coordinates: [longitude, 1]}}))
]}, {maxZoom: 2, indexMaxZoom: 2});

let server: http.Server;
let browser: Browser;
let page: Page;
let port: number;
let requestedZooms: number[];

beforeAll(async () => {
    const serveFiles = st(process.cwd());
    server = http.createServer((request, response) => {
        const tile = /^\/underzoom-tiles\/(\d+)\/(\d+)\/(\d+)\.(pbf|png)$/.exec(request.url);
        if (request.url === '/underzoom-page') {
            response.setHeader('Content-Type', 'text/html');
            response.end('<html><body style="margin:0"><div id="map" style="width:512px;height:512px"></div></body></html>');
            return;
        }
        if (!tile) {
            serveFiles(request, response);
            return;
        }
        const [z, x, y] = tile.slice(1, 4).map(Number);
        requestedZooms.push(z);
        if (tile[4] === 'pbf') {
            response.setHeader('Content-Type', 'application/x-protobuf');
            response.end(fromGeojsonVt({shapes: vectorTiles.getTile(z, x, y) || {features: []} as GeoJSONVTTile}));
            return;
        }
        const image = new PNG({width: 256, height: 256});
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = 40 + x * 40;
            image.data[i + 1] = 40 + y * 40;
            image.data[i + 2] = 180;
            image.data[i + 3] = 255;
        }
        response.setHeader('Content-Type', 'image/png');
        response.end(PNG.sync.write(image));
    });
    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    browser = await launchPuppeteer();
}, 40000);

beforeEach(async () => {
    requestedZooms = [];
    page = await browser.newPage();
    await page.setViewport({width: 512, height: 512});
    await page.goto(`http://localhost:${port}/underzoom-page`);
    await page.addScriptTag({type: 'module', content: 'import * as maplibregl from \'/dist/maplibre-gl-dev.mjs\'; window.maplibregl = maplibregl; maplibregl.setWorkerUrl(\'/dist/maplibre-gl-worker-dev.mjs\');'});
    await page.waitForFunction(() => Boolean((window as any).maplibregl));
});

afterEach(async () => {
    await page?.close();
});

afterAll(async () => {
    await browser?.close();
    await new Promise<void>(resolve => server?.close(() => resolve()));
});

describe('bounded source underzoom rendering', () => {
    test.each([
        {name: 'disabled vector', type: 'vector', zoom: 0, limit: 0, visible: false},
        {name: 'vector beyond limit', type: 'vector', zoom: 0, limit: 1, visible: false},
        {name: 'vector fill, line and icon', type: 'vector', zoom: 0, limit: 2, visible: true},
        {name: 'native pitched vector', type: 'vector', zoom: 2, limit: 0, visible: true, pitch: 60},
        {name: 'native globe vector', type: 'vector', zoom: 2, limit: 0, visible: true, globe: true},
        {name: 'pitched vector', type: 'vector', zoom: 1, limit: 2, visible: true, pitch: 60},
        {name: 'antimeridian vector', type: 'vector', zoom: 0, limit: 2, visible: true, longitude: 179.9},
        {name: 'globe vector', type: 'vector', zoom: 0, limit: 2, visible: true, globe: true},
        {name: 'underzoomed raster', type: 'raster', zoom: 0, limit: 2, visible: true},
        {name: 'raster beyond limit', type: 'raster', zoom: 0, limit: 1, visible: false},
        {name: 'overzoomed raster', type: 'raster', zoom: 3, limit: 2, visible: true}
    ] as const)('$name', async (scenario) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(String(error)));
        const result = await page.evaluate(async (scenario) => {
            const maplibregl: typeof MapLibreGL = (window as any).maplibregl;
            const source: MapLibreGL.SourceSpecification = {
                type: scenario.type,
                tiles: [`${location.origin}/underzoom-tiles/{z}/{x}/{y}.${scenario.type === 'vector' ? 'pbf' : 'png'}`],
                minzoom: 2, maxzoom: 2, underzoomLevels: scenario.limit
            };
            const layers: MapLibreGL.LayerSpecification[] = scenario.type === 'raster' ? [
                {id: 'raster', type: 'raster', source: 'tiles', paint: {'raster-fade-duration': 0}}
            ] : [
                {id: 'fill', type: 'fill', source: 'tiles', 'source-layer': 'shapes', filter: ['==', ['get', 'kind'], 'fill'], paint: {'fill-color': '#00aa00'}},
                {id: 'line', type: 'line', source: 'tiles', 'source-layer': 'shapes', filter: ['==', ['get', 'kind'], 'line'], paint: {'line-color': '#0000ff', 'line-width': 4}},
                {id: 'icon', type: 'symbol', source: 'tiles', 'source-layer': 'shapes', filter: ['==', ['get', 'kind'], 'point'], layout: {'icon-image': 'dot', 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 2]}}
            ];
            const map = new maplibregl.Map({container: 'map', center: [scenario.longitude || 0, 0], zoom: scenario.zoom,
                pitch: scenario.pitch || 0, renderWorldCopies: false, fadeDuration: 0,
                canvasContextAttributes: {preserveDrawingBuffer: true},
                style: {version: 8, sources: {}, layers: [], ...(scenario.globe ? {projection: {type: 'globe'}} : {})}
            });
            const sourceErrors: string[] = [];
            map.on('error', event => sourceErrors.push(event.error.message));
            await map.once('style.load');
            const data = new Uint8Array(16 * 16 * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255;
                data[i + 3] = 255;
            }
            map.addImage('dot', {width: 16, height: 16, data});
            map.addSource('tiles', source);
            for (const layer of layers) map.addLayer(layer);
            await map.once('idle');
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const rendered = [...new Set(map.queryRenderedFeatures().map(feature => feature.layer.id))].sort();
            const gl = map.getCanvas().getContext('webgl2');
            const pixel = new Uint8Array(4);
            gl.readPixels(200, 256, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            map.remove();
            return {rendered, pixel: [...pixel], sourceErrors};
        }, scenario);
        expect(errors).toEqual([]);
        expect(result.sourceErrors).toEqual([]);
        expect(requestedZooms.length > 0).toBe(scenario.visible);
        expect(requestedZooms.every(zoom => zoom === 2)).toBe(true);
        expect(result.rendered).toEqual(scenario.visible && scenario.type === 'vector' ? ['fill', 'icon', 'line'] : []);
        const rasterVisible = scenario.visible && scenario.type === 'raster';
        expect(rasterVisible ? result.pixel[2] : undefined).toBe(rasterVisible ? 180 : undefined);
    }, 30000);
});
