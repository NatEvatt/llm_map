import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import '../styles/Map.css';
import { ApiCalls } from '../utils/apiCalls';

interface MapProps {
  lat: number;
  lon: number;
  zoom: number;
  apiKey: string;
  geoJsonData: Record<string, any>; // A map of layer names to GeoJSON data
  actionResponse: any;
  onActionResult: (result: { error?: string; success?: string }) => void;
  activeLayers: Record<string, boolean>; // Add activeLayers prop
}

const Map: React.FC<MapProps> = ({
  lat,
  lon,
  zoom,
  apiKey,
  geoJsonData,
  actionResponse,
  onActionResult,
  activeLayers,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Function to initialize the map
  const initializeMap = () => {
    if (!mapContainerRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: `https://api.maptiler.com/maps/basic/style.json?key=${apiKey}`,
      center: [lon, lat],
      zoom: zoom,
    });

    mapRef.current.on('load', () => {
      // Add all layers dynamically
      Object.keys(geoJsonData).forEach((layerName) => {
        addSourceAndLayer(layerName, geoJsonData[layerName]);
        addPopupToLayer(layerName);
      });
    });
  };

  // Function to add a point layer (circle layer)
  const addPointLayer = (layerId: string) => {
    if (!mapRef.current) return;

    mapRef.current.addLayer({
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
  const addPolygonLayer = (layerId: string) => {
    if (!mapRef.current) return;

    mapRef.current.addLayer({
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
  const addLineLayer = (layerId: string) => {
    if (!mapRef.current) return;

    mapRef.current.addLayer({
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

  const addHeatMapLayer = (layerId: string) => {
    if (!mapRef.current) return;

    mapRef.current.addLayer({
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

  const getPointLayers = (data: Record<string, any>): string[] => {
    return Object.entries(data)
      .filter(([_, layerData]) => {
        const firstFeature = layerData.features?.[0];
        return firstFeature?.geometry?.type === 'Point';
      })
      .map(([name]) => name);
  };

  // Define action handlers for heat map operations
  const heatMapActionHandlers: Record<
    string,
    (
      map: maplibregl.Map,
      layerExists: boolean,
      sourceExists: boolean,
      layerData: any,
    ) => { error?: string; success?: string }
  > = {
    REMOVE: (map, layerExists, sourceExists) => {
      if (layerExists) map.removeLayer('heatmap');
      if (sourceExists) map.removeSource('heatmap');
      return { success: 'Heat map removed successfully' };
    },
    ADD: (map, _, sourceExists, layerData) => {
      if (sourceExists) {
        (map.getSource('heatmap') as maplibregl.GeoJSONSource).setData(
          layerData,
        );
      } else {
        map.addSource('heatmap', {
          type: 'geojson',
          data: layerData,
        });
        addHeatMapLayer('heatmap');
      }
      return { success: 'Heat map added successfully' };
    },
    UPDATE: (map, _, sourceExists, layerData) => {
      if (sourceExists) {
        (map.getSource('heatmap') as maplibregl.GeoJSONSource).setData(
          layerData,
        );
        return { success: 'Heat map updated successfully' };
      }
      return { error: 'Cannot update heat map: source does not exist' };
    },
  };

  const handleHeatMapAction = (parameters: {
    action: string;
    layer: string;
  }) => {
    if (!mapRef.current) return { error: 'Map not initialized' };

    const { current: map } = mapRef;
    const sourceExists = !!map.getSource('heatmap');
    const layerExists = !!map.getLayer('heatmap');

    if (!geoJsonData[parameters.layer]) {
      const pointLayers = getPointLayers(geoJsonData);
      return {
        error: `Layer "${parameters.layer}" does not exist. Available point layers: ${pointLayers.join(', ')}`,
      };
    }

    const handler = heatMapActionHandlers[parameters.action];
    if (!handler) {
      return { error: `Invalid action: ${parameters.action}` };
    }

    return handler(
      map,
      layerExists,
      sourceExists,
      geoJsonData[parameters.layer],
    );
  };

  // Mapping of geometry types to their corresponding layer functions
  const geometryTypeToLayerFunction: Record<string, (layerId: string) => void> =
    {
      Point: addPointLayer,
      Polygon: addPolygonLayer,
      MultiPolygon: addPolygonLayer,
      LineString: addLineLayer,
      MultiLineString: addLineLayer,
    };

  // Function to add a source and layer dynamically
  const addSourceAndLayer = (layerId: string, data: any) => {
    if (!mapRef.current) return;

    // Add the GeoJSON source
    if (!mapRef.current.getSource(layerId)) {
      mapRef.current.addSource(layerId, {
        type: 'geojson',
        data: data,
      });
    }

    // Determine the layer type dynamically based on the first feature's geometry type
    const firstFeature = data.features?.[0];
    const geometryType = firstFeature?.geometry?.type;

    // Add the layer with appropriate styling if it doesn't exist
    if (!mapRef.current.getLayer(layerId) && geometryType) {
      const layerFunction = geometryTypeToLayerFunction[geometryType];
      if (layerFunction) {
        layerFunction(layerId);
      } else {
        console.warn(`Unsupported geometry type: ${geometryType}`);
      }
    }
  };

  // Function to add a popup to a layer
  const addPopupToLayer = (layerId: string) => {
    if (!mapRef.current) return;

    mapRef.current.on('click', layerId, async (e) => {
      const features = e.features;
      if (features && features.length > 0) {
        const properties = await ApiCalls.getLayerPopupProperties(
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
          .addTo(mapRef.current!);
      }
    });

    // Change cursor to pointer on hover
    mapRef.current.on('mouseenter', layerId, () => {
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = 'pointer';
      }
    });

    mapRef.current.on('mouseleave', layerId, () => {
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = '';
      }
    });
  };

  // Function to update the GeoJSON layers dynamically
  const updateMapLayers = () => {
    if (!mapRef.current) return;

    Object.keys(geoJsonData).forEach((layerName) => {
      if (mapRef.current && mapRef.current.getSource(layerName)) {
        // Update the layer visibility based on activeLayers
        const layer = mapRef.current.getLayer(layerName);
        if (layer && mapRef.current) {
          mapRef.current.setLayoutProperty(
            layerName,
            'visibility',
            activeLayers[layerName] ? 'visible' : 'none',
          );
        }
        // Update the data
        (
          mapRef.current.getSource(layerName) as maplibregl.GeoJSONSource
        ).setData(geoJsonData[layerName]);
      } else {
        addSourceAndLayer(layerName, geoJsonData[layerName]);
        addPopupToLayer(layerName);
        // Set initial visibility
        if (mapRef.current && mapRef.current.getLayer(layerName)) {
          mapRef.current.setLayoutProperty(
            layerName,
            'visibility',
            activeLayers[layerName] ? 'visible' : 'none',
          );
        }
      }
    });
  };

  // Add cluster layer to the map
  const addClusterLayer = (layerId: string, data: any) => {
    if (!mapRef.current) return;

    // Remove any existing layers and source for this layerId
    const layers = [
      layerId,
      `${layerId}-clusters`,
      `${layerId}-cluster-count`,
      `${layerId}-unclustered-point`,
    ];

    layers.forEach((layer) => {
      if (mapRef.current?.getLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });

    if (mapRef.current.getSource(layerId)) {
      mapRef.current.removeSource(layerId);
    }

    // Add the GeoJSON source with cluster properties
    mapRef.current.addSource(layerId, {
      type: 'geojson',
      data: data,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    // Add the cluster layer
    mapRef.current.addLayer({
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
    mapRef.current.addLayer({
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
    mapRef.current.addLayer({
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
    mapRef.current.on('click', `${layerId}-clusters`, (e) => {
      const features = mapRef.current?.queryRenderedFeatures(e.point, {
        layers: [`${layerId}-clusters`],
      });
      if (features?.[0] && mapRef.current) {
        mapRef.current.easeTo({
          center: (features[0].geometry as any).coordinates,
          zoom: mapRef.current.getZoom() + 1,
        });
      }
    });

    // Change cursor to pointer on hover
    mapRef.current.on('mouseenter', `${layerId}-clusters`, () => {
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = 'pointer';
      }
    });

    mapRef.current.on('mouseleave', `${layerId}-clusters`, () => {
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = '';
      }
    });
  };

  // Remove cluster layer from the map
  const removeClusterLayer = (layerId: string) => {
    if (!mapRef.current) return;

    const layers = [
      `${layerId}-clusters`,
      `${layerId}-cluster-count`,
      `${layerId}-unclustered-point`,
    ];

    layers.forEach((layer) => {
      if (mapRef.current?.getLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });

    if (mapRef.current.getSource(layerId)) {
      mapRef.current.removeSource(layerId);
    }
  };

  // Define action handlers for cluster operations
  const clusterActionHandlers: Record<
    string,
    (
      map: maplibregl.Map,
      layerId: string,
      layerData: any,
    ) => { error?: string; success?: string }
  > = {
    ADD: (map, layerId, layerData) => {
      addClusterLayer(layerId, layerData);
      return { success: 'Cluster layer added successfully' };
    },
    REMOVE: (map, layerId) => {
      removeClusterLayer(layerId);
      return { success: 'Cluster layer removed successfully' };
    },
  };

  const handleClusterAction = (parameters: {
    action: string;
    layer: string;
  }) => {
    if (!mapRef.current) return { error: 'Map not initialized' };

    if (!geoJsonData[parameters.layer]) {
      const pointLayers = getPointLayers(geoJsonData);
      return {
        error: `Layer "${parameters.layer}" does not exist. Available point layers: ${pointLayers.join(', ')}`,
      };
    }

    const handler = clusterActionHandlers[parameters.action];
    if (!handler) {
      return { error: `Invalid action: ${parameters.action}` };
    }

    return handler(
      mapRef.current,
      parameters.layer,
      geoJsonData[parameters.layer],
    );
  };

  // Function to handle map actions
  const handleMapAction = (response: any) => {
    if (response && response.action && mapRef.current) {
      const { intent, parameters } = response.action;
      let result = {};

      switch (intent) {
        case 'ZOOM_IN':
          mapRef.current.zoomIn(parameters.levels || 1);
          result = { success: `Zoomed in ${parameters.levels || 1} level(s)` };
          break;
        case 'ZOOM_OUT':
          mapRef.current.zoomOut(parameters.levels || 1);
          result = { success: `Zoomed out ${parameters.levels || 1} level(s)` };
          break;
        case 'SET_ZOOM':
          mapRef.current.setZoom(parameters.level);
          result = { success: `Set zoom to level ${parameters.level}` };
          break;
        case 'PAN':
          mapRef.current.panBy([parameters.x, parameters.y]);
          result = {
            success: `Panned map by [${parameters.x}, ${parameters.y}]`,
          };
          break;
        case 'FLY_TO':
          mapRef.current.flyTo({ center: [parameters.lng, parameters.lat] });
          result = {
            success: `Flew to [${parameters.lng}, ${parameters.lat}]`,
          };
          break;
        case 'JUMP_TO':
          mapRef.current.jumpTo({ center: [parameters.lng, parameters.lat] });
          result = {
            success: `Jumped to [${parameters.lng}, ${parameters.lat}]`,
          };
          break;
        case 'ROTATE':
          mapRef.current.rotateTo(parameters.degrees);
          result = { success: `Rotated to ${parameters.degrees} degrees` };
          break;
        case 'PITCH':
          mapRef.current.setPitch(parameters.degrees);
          result = { success: `Set pitch to ${parameters.degrees} degrees` };
          break;
        case 'RESET_VIEW':
          mapRef.current.jumpTo({
            center: parameters.center,
            zoom: parameters.zoom,
          });
          result = { success: 'Reset view to default' };
          break;
        case 'HEAT_MAP':
          result = handleHeatMapAction(parameters);
          break;
        case 'CLUSTER':
          result = handleClusterAction(parameters);
          break;
        default:
          result = { error: `Unknown action intent: ${intent}` };
      }

      return result;
    }
    return { error: 'Invalid response format' };
  };

  useEffect(() => {
    initializeMap();

    return () => {
      mapRef.current?.remove();
    };
  }, [apiKey, lat, lon, zoom]);

  useEffect(() => {
    updateMapLayers();
  }, [geoJsonData, activeLayers]);

  useEffect(() => {
    if (actionResponse) {
      const result = handleMapAction(actionResponse);
      onActionResult(result);
    }
  }, [actionResponse]);

  return <div ref={mapContainerRef} className="map-container" />;
};

export default Map;
