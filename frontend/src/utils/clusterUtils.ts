import maplibregl from 'maplibre-gl';

export const addClusterLayer = (
  map: maplibregl.Map,
  layerId: string,
  data: any,
) => {
  if (!map) return;

  // Remove any existing layers and source for this layerId
  const layers = [
    layerId,
    `${layerId}-clusters`,
    `${layerId}-cluster-count`,
    `${layerId}-unclustered-point`,
  ];

  layers.forEach((layer) => {
    if (map.getLayer(layer)) {
      map.removeLayer(layer);
    }
  });

  if (map.getSource(layerId)) {
    map.removeSource(layerId);
  }

  // Add the GeoJSON source with cluster properties
  map.addSource(layerId, {
    type: 'geojson',
    data: data,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  });

  // Add the cluster layer
  map.addLayer({
    id: `${layerId}-clusters`,
    type: 'circle',
    source: layerId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#51bbd6',
        100,
        '#f1f075',
        750,
        '#f28cb1',
      ],
      'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
    },
  });

  // Add the cluster count layer
  map.addLayer({
    id: `${layerId}-cluster-count`,
    type: 'symbol',
    source: layerId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12,
    },
  });

  // Add the unclustered point layer
  map.addLayer({
    id: `${layerId}-unclustered-point`,
    type: 'circle',
    source: layerId,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#11b4da',
      'circle-radius': 8,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff',
    },
  });

  // Add click handler for clusters
  map.on('click', `${layerId}-clusters`, (e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: [`${layerId}-clusters`],
    });
    if (features?.[0]) {
      map.easeTo({
        center: (features[0].geometry as any).coordinates,
        zoom: map.getZoom() + 1,
      });
    }
  });

  // Change cursor to pointer on hover
  map.on('mouseenter', `${layerId}-clusters`, () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', `${layerId}-clusters`, () => {
    map.getCanvas().style.cursor = '';
  });
};

export const removeClusterLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  const layers = [
    `${layerId}-clusters`,
    `${layerId}-cluster-count`,
    `${layerId}-unclustered-point`,
  ];

  layers.forEach((layer) => {
    if (map.getLayer(layer)) {
      map.removeLayer(layer);
    }
  });

  if (map.getSource(layerId)) {
    map.removeSource(layerId);
  }
};

export const handleClusterAction = (
  map: maplibregl.Map,
  parameters: { action: string; layer: string },
  geoJsonData: Record<string, any>,
) => {
  if (!map) return { error: 'Map not initialized' };

  if (!geoJsonData[parameters.layer]) {
    const pointLayers = Object.entries(geoJsonData)
      .filter(([_, layerData]) => {
        const firstFeature = layerData.features?.[0];
        return firstFeature?.geometry?.type === 'Point';
      })
      .map(([name]) => name);

    return {
      error: `Layer "${parameters.layer}" does not exist. Available point layers: ${pointLayers.join(', ')}`,
    };
  }

  if (parameters.action === 'ADD') {
    addClusterLayer(map, parameters.layer, geoJsonData[parameters.layer]);
    return { success: 'Cluster layer added successfully' };
  } else if (parameters.action === 'REMOVE') {
    removeClusterLayer(map, parameters.layer);
    return { success: 'Cluster layer removed successfully' };
  }

  return { error: `Invalid action: ${parameters.action}` };
};
