import type {
    SourceSpecification as SpecSourceSpecification,
    VectorSourceSpecification as SpecVectorSourceSpecification,
    RasterSourceSpecification as SpecRasterSourceSpecification,
    StyleSpecification as SpecStyleSpecification
} from '@maplibre/maplibre-gl-style-spec';

/** The supported number of native zoom levels to retain when zooming out below a source minimum. */
export type UnderzoomLevels = 0 | 1 | 2 | 3 | 4;

/**
 * Options for displaying vector and raster tiles below their native minimum zoom.
 *
 * Each extra level can require four times as many tiles. Source bounds limit network requests,
 * but tile covering still traverses the visible area. Vector symbols retain native-tile layout.
 */
export type UnderzoomOptions = {
    /**
     * Number of zoom levels below the source minimum at which native minimum-zoom tiles remain visible.
     * Applies to tile selection; style-layer minzoom and maxzoom still control layer visibility.
     * Uses the source tile size and zoom rounding, as normal tile selection does.
     * @defaultValue 0
     */
    underzoomLevels?: UnderzoomLevels;
};

/** A vector source with bounded underzooming options. */
export type VectorSourceSpecification = SpecVectorSourceSpecification & UnderzoomOptions;

/** A raster source with bounded underzooming options; raster DEM sources do not support underzooming. */
export type RasterSourceSpecification = SpecRasterSourceSpecification & UnderzoomOptions;

/** Source definitions accepted by the renderer, including bounded vector and raster underzooming. */
export type SourceSpecification = Exclude<SpecSourceSpecification, {type: 'vector' | 'raster'}> |
    VectorSourceSpecification | RasterSourceSpecification;

/** A style whose vector and raster sources can opt into bounded underzooming. */
export type StyleSpecification = Omit<SpecStyleSpecification, 'sources'> & {
    sources: Record<string, SourceSpecification>;
};
