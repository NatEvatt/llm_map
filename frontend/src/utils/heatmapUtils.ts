import maplibregl from 'maplibre-gl';

export const addHeatMapLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  map.addLayer({
    id: layerId,
    type: 'heatmap',
    source: layerId,
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': 1,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(0, 0, 255, 0)',
        0.2,
        'royalblue',
        0.4,
        'cyan',
        0.6,
        'lime',
        0.8,
        'yellow',
        1,
        'red',
      ],
      'heatmap-radius': 30,
      'heatmap-opacity': 0.8,
    },
  });
};

export const removeHeatMapLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }

  if (map.getSource(layerId)) {
    map.removeSource(layerId);
  }
};

export const getPointLayers = (data: Record<string, any>): string[] => {
  return Object.entries(data)
    .filter(([_, layerData]) => {
      const firstFeature = layerData.features?.[0];
      return firstFeature?.geometry?.type === 'Point';
    })
    .map(([name]) => name);
};

export const handleHeatMapAction = (
  map: maplibregl.Map,
  parameters: { action: string; layer: string },
  geoJsonData: Record<string, any>,
) => {
  if (!map) return { error: 'Map not initialized' };

  const sourceExists = !!map.getSource('heatmap');
  const layerExists = !!map.getLayer('heatmap');

  if (!geoJsonData[parameters.layer]) {
    const pointLayers = getPointLayers(geoJsonData);
    return {
      error: `Layer "${parameters.layer}" does not exist. Available point layers: ${pointLayers.join(', ')}`,
    };
  }

  switch (parameters.action) {
    case 'REMOVE':
      removeHeatMapLayer(map, 'heatmap');
      return { success: 'Heat map removed successfully' };
    case 'ADD':
      if (sourceExists) {
        (map.getSource('heatmap') as maplibregl.GeoJSONSource).setData(
          geoJsonData[parameters.layer],
        );
      } else {
        map.addSource('heatmap', {
          type: 'geojson',
          data: geoJsonData[parameters.layer],
        });
        addHeatMapLayer(map, 'heatmap');
      }
      return { success: 'Heat map added successfully' };
    case 'UPDATE':
      if (sourceExists) {
        (map.getSource('heatmap') as maplibregl.GeoJSONSource).setData(
          geoJsonData[parameters.layer],
        );
        return { success: 'Heat map updated successfully' };
      }
      return { error: 'Cannot update heat map: source does not exist' };
    default:
      return { error: `Invalid action: ${parameters.action}` };
  }
};
