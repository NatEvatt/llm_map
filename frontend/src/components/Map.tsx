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

  const handleHeatMapAction = (parameters: {
    action: string;
    layer: string;
  }) => {
    if (!mapRef.current) return { error: 'Map not initialized' };

    const { current: map } = mapRef;
    const sourceExists = map.getSource('heatmap');
    const layerExists = map.getLayer('heatmap');

    if (!geoJsonData[parameters.layer]) {
      const pointLayers = getPointLayers(geoJsonData);
      return {
        error: `Layer "${parameters.layer}" does not exist. Available point layers: ${pointLayers.join(', ')}`,
      };
    }

    if (parameters.action === 'REMOVE') {
      if (layerExists) map.removeLayer('heatmap');
      if (sourceExists) map.removeSource('heatmap');
      return { success: 'Heat map removed successfully' };
    }

    if (parameters.action !== 'ADD' && parameters.action !== 'UPDATE') {
      return { error: `Invalid action: ${parameters.action}` };
    }

    if (sourceExists) {
      (map.getSource('heatmap') as maplibregl.GeoJSONSource).setData(
        geoJsonData[parameters.layer],
      );
    } else {
      map.addSource('heatmap', {
        type: 'geojson',
        data: geoJsonData[parameters.layer],
      });
      addHeatMapLayer('heatmap');
    }
    return {
      success: `Heat map ${parameters.action.toLowerCase()}ed successfully`,
    };
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

    // Add the layer with appropriate styling
    if (!mapRef.current.getLayer(layerId)) {
      if (geometryType === 'Point') {
        addPointLayer(layerId); // Add a point layer
      } else if (
        geometryType === 'Polygon' ||
        geometryType === 'MultiPolygon'
      ) {
        addPolygonLayer(layerId); // Add a polygon layer
      } else if (
        geometryType === 'LineString' ||
        geometryType === 'MultiLineString'
      ) {
        addLineLayer(layerId); // Add a line layer
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
        default:
          result = { error: `Unknown action intent: ${intent}` };
      }

      // Return the result to be displayed in the message box
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
