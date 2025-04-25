import maplibregl from 'maplibre-gl';

// Function to add a point layer (circle layer)
export const addPointLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  map.addLayer({
    id: layerId,
    type: 'circle',
    source: layerId,
    paint: {
      'circle-radius': 6,
      'circle-color': '#FF0000', // Red color for points
      'circle-stroke-width': 1,
      'circle-stroke-color': '#FFFFFF', // White border
    },
  });
};

// Function to add a polygon layer (fill layer)
export const addPolygonLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  map.addLayer({
    id: layerId,
    type: 'fill',
    source: layerId,
    paint: {
      'fill-color': '#0000FF', // Blue color for polygons
      'fill-opacity': 0.4,
    },
  });
};

// Function to add a line layer
export const addLineLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  map.addLayer({
    id: layerId,
    type: 'line',
    source: layerId,
    paint: {
      'line-color': '#eb09eb', // Green color for the line
      'line-width': 3, // Line width
      'line-opacity': 0.8, // Line opacity
    },
  });
};

// Mapping of geometry types to their corresponding layer functions
export const geometryTypeToLayerFunction: Record<
  string,
  (map: maplibregl.Map, layerId: string) => void
> = {
  Point: addPointLayer,
  Polygon: addPolygonLayer,
  MultiPolygon: addPolygonLayer,
  LineString: addLineLayer,
  MultiLineString: addLineLayer,
};

// Function to add a source and layer dynamically
export const addSourceAndLayer = (
  map: maplibregl.Map,
  layerId: string,
  data: any,
) => {
  if (!map) return;

  // Add the GeoJSON source
  if (!map.getSource(layerId)) {
    map.addSource(layerId, {
      type: 'geojson',
      data: data,
    });
  }

  // Determine the layer type dynamically based on the first feature's geometry type
  const firstFeature = data.features?.[0];
  const geometryType = firstFeature?.geometry?.type;

  // Add the layer with appropriate styling if it doesn't exist
  if (!map.getLayer(layerId) && geometryType) {
    const layerFunction = geometryTypeToLayerFunction[geometryType];
    if (layerFunction) {
      layerFunction(map, layerId);
    } else {
      console.warn(`Unsupported geometry type: ${geometryType}`);
    }
  }
};

// Function to add a popup to a layer
export const addPopupToLayer = (
  map: maplibregl.Map,
  layerId: string,
  getPopupProperties: (layerId: string, featureId: number) => Promise<any>,
) => {
  if (!map) return;

  map.on('click', layerId, async (e) => {
    const features = e.features;
    if (features && features.length > 0) {
      const properties = await getPopupProperties(
        layerId,
        features[0].properties.id,
      );
      const coordinates = e.lngLat;

      // Create popup content from properties
      const popupContent = Object.entries(properties)
        .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
        .join('<br>');

      // Display the popup
      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(popupContent)
        .addTo(map);
    }
  });

  // Change cursor to pointer on hover
  map.on('mouseenter', layerId, () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
  });
};

// Function to update the GeoJSON layers dynamically
export const updateMapLayers = (
  map: maplibregl.Map,
  geoJsonData: Record<string, any>,
  activeLayers: Record<string, boolean>,
  getPopupProperties: (layerId: string, featureId: number) => Promise<any>,
) => {
  if (!map) return;

  Object.keys(geoJsonData).forEach((layerName) => {
    if (map.getSource(layerName)) {
      // Update the layer visibility based on activeLayers
      const layer = map.getLayer(layerName);
      if (layer) {
        map.setLayoutProperty(
          layerName,
          'visibility',
          activeLayers[layerName] ? 'visible' : 'none',
        );
      }
      // Update the data
      (map.getSource(layerName) as maplibregl.GeoJSONSource).setData(
        geoJsonData[layerName],
      );
    } else {
      addSourceAndLayer(map, layerName, geoJsonData[layerName]);
      addPopupToLayer(map, layerName, getPopupProperties);
      // Set initial visibility
      if (map.getLayer(layerName)) {
        map.setLayoutProperty(
          layerName,
          'visibility',
          activeLayers[layerName] ? 'visible' : 'none',
        );
      }
    }
  });
};
