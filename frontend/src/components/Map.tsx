import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import '../styles/Map.css';
import { ApiCalls } from '../utils/apiCalls';
import { handleClusterAction } from '../utils/clusterUtils';
import { handleHeatMapAction } from '../utils/heatmapUtils';
import {
  addSourceAndLayer,
  addPopupToLayer,
  updateMapLayers,
} from '../utils/layerUtils';

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
        addSourceAndLayer(mapRef.current!, layerName, geoJsonData[layerName]);
        addPopupToLayer(
          mapRef.current!,
          layerName,
          ApiCalls.getLayerPopupProperties,
        );
      });
    });
  };

  // Function to handle map actions
  const handleMapAction = (response: any) => {
    if (response && response.action && mapRef.current) {
      const { intent, parameters, restore_original } = response.action;
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
          result = handleHeatMapAction(mapRef.current, parameters, geoJsonData);
          break;
        case 'CLUSTER':
          result = handleClusterAction(mapRef.current, parameters, geoJsonData);
          // If there's a restore_original field, add the original layer back
          if (restore_original) {
            const { layer } = restore_original;
            if (geoJsonData && geoJsonData[layer]) {
              addSourceAndLayer(mapRef.current, layer, geoJsonData[layer]);
              addPopupToLayer(
                mapRef.current,
                layer,
                ApiCalls.getLayerPopupProperties,
              );
            }
          }
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
    if (mapRef.current) {
      updateMapLayers(
        mapRef.current,
        geoJsonData,
        activeLayers,
        ApiCalls.getLayerPopupProperties,
      );
    }
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
