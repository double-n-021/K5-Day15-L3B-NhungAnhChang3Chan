import type { StyleSpecification } from '@maplibre/maplibre-react-native';

export const CHARGEPILOT_DARK_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'ChargePilot Automotive Dark',
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#0B1017',
      },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: {
        'fill-color': '#112420',
        'fill-opacity': 0.9,
      },
    },
    {
      id: 'landuse-residential',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'retail'], true, false],
      paint: {
        'fill-color': '#0F1621',
        'fill-opacity': 0.75,
      },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: {
        'fill-color': '#102B48',
      },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      paint: {
        'line-color': '#163B63',
        'line-width': 1.5,
      },
    },
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': '#1E2F45',
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          0,
          14.5,
          ['coalesce', ['get', 'render_height'], 18],
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: 'road-base',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#253548',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 3.5],
      },
    },
    {
      id: 'road-secondary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#38506D',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 16, 7],
      },
    },
    {
      id: 'road-primary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], ['primary', 'trunk', 'motorway'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#4F7096',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.8, 16, 9],
      },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:vi'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': '#B8C9DC',
        'text-halo-color': '#0B1017',
        'text-halo-width': 1.5,
      },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 10,
      layout: {
        'text-field': ['coalesce', ['get', 'name:vi'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 14, 15],
      },
      paint: {
        'text-color': '#E2EAF3',
        'text-halo-color': '#0B1017',
        'text-halo-width': 2,
      },
    },
  ],
};
