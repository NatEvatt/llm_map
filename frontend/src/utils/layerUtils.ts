import maplibregl from 'maplibre-gl';

// Add these new utility functions right here
const generateRandomColor = (): string => {
  const hue = Math.random() * 360;
  const saturation = 70 + Math.random() * 30; // 70-100% saturation
  const lightness = 45 + Math.random() * 10; // 45-55% lightness
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// Cache for storing layer colors
const layerColors: Record<string, { main: string; stroke: string }> = {};

// Function to get or generate colors for a layer
const getLayerColors = (layerId: string) => {
  if (!layerColors[layerId]) {
    const mainColor = generateRandomColor();
    layerColors[layerId] = { main: mainColor, stroke: '#FFFFFF' };
  }
  return layerColors[layerId];
};

// Function to add a point layer (circle layer)
export const addPointLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  const colors = getLayerColors(layerId);
  map.addLayer({
    id: layerId,
    type: 'circle',
    source: layerId,
    paint: {
      'circle-radius': 6,
      'circle-color': colors.main,
      'circle-stroke-width': 1,
      'circle-stroke-color': colors.stroke,
    },
  });
};

// Function to add a polygon layer (fill layer)
export const addPolygonLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  const colors = getLayerColors(layerId);
  map.addLayer({
    id: layerId,
    type: 'fill',
    source: layerId,
    paint: {
      'fill-color': colors.main,
      'fill-opacity': 0.4,
    },
  });
};

// Function to add a line layer
export const addLineLayer = (map: maplibregl.Map, layerId: string) => {
  if (!map) return;

  const colors = getLayerColors(layerId);
  map.addLayer({
    id: layerId,
    type: 'line',
    source: layerId,
    paint: {
      'line-color': colors.main,
      'line-width': 3,
      'line-opacity': 0.8,
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

// Add this to the existing color utilities at the top of layerUtils.ts
export const setLayerColor = (
  map: maplibregl.Map,
  layerId: string,
  color: string,
) => {
  if (!map || !map.getLayer(layerId)) return false;

  const layer = map.getLayer(layerId);
  if (!layer) return false;

  // Update the layer colors based on its type
  switch (layer.type) {
    case 'circle':
      map.setPaintProperty(layerId, 'circle-color', color);
      break;
    case 'fill':
      map.setPaintProperty(layerId, 'fill-color', color);
      break;
    case 'line':
      map.setPaintProperty(layerId, 'line-color', color);
      break;
    default:
      return false;
  }

  // Update the cached color
  layerColors[layerId] = { main: color, stroke: '#FFFFFF' };
  return true;
};

// Add a new function to set the circle radius for point layers
export const setCircleRadius = (
  map: maplibregl.Map,
  layerId: string,
  radius: number,
) => {
  if (!map || !map.getLayer(layerId)) return false;

  const layer = map.getLayer(layerId);
  if (!layer || layer.type !== 'circle') return false;

  // Update the circle radius
  map.setPaintProperty(layerId, 'circle-radius', radius);
  return true;
};

// Add a new function to set the stroke width for line layers
export const setStrokeWidth = (
  map: maplibregl.Map,
  layerId: string,
  width: number,
) => {
  if (!map || !map.getLayer(layerId)) return false;

  const layer = map.getLayer(layerId);
  if (!layer || layer.type !== 'line') return false;

  // Update the line width
  map.setPaintProperty(layerId, 'line-width', width);
  return true;
};

// Add a new function to set the fill opacity for polygon layers
export const setFillOpacity = (
  map: maplibregl.Map,
  layerId: string,
  opacity: number,
) => {
  if (!map || !map.getLayer(layerId)) return false;

  const layer = map.getLayer(layerId);
  if (!layer || layer.type !== 'fill') return false;

  // Update the fill opacity
  map.setPaintProperty(layerId, 'fill-opacity', opacity);
  return true;
};
