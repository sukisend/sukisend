const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function getWebMapStyleDefinition() {
  const configuredStyleUrl = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
  if (configuredStyleUrl) {
    return configuredStyleUrl;
  }

  return {
    version: 8,
    sources: {
      openstreetmap: {
        attribution: '&copy; OpenStreetMap contributors',
        maxzoom: 19,
        tiles: [OSM_TILE_URL],
        tileSize: 256,
        type: 'raster',
      },
    },
    layers: [
      {
        id: 'openstreetmap',
        source: 'openstreetmap',
        type: 'raster',
      },
    ],
  };
}
