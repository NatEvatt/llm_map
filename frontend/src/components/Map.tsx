import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import '../styles/Map.css';
import { ApiCalls } from '../utils/apiCalls';
import {
  addSourceAndLayer,
  addPopupToLayer,
  updateMapLayers,
} from '../utils/layerUtils';
import { handleMapAction } from '../utils/mapActionUtils';

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
  console.log('Map component rendering with actionResponse:', actionResponse);
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
    if (actionResponse && mapRef.current) {
      console.log('Map received actionResponse:', actionResponse);
      let result: { error?: string; success?: string } = {};
      // Handle both 'action' and 'query' types
      if (actionResponse.type === 'action' || actionResponse.type === 'query') {
        console.log('Processing action response with handleMapAction');
        result = handleMapAction(
          mapRef.current,
          actionResponse,
          geoJsonData,
          ApiCalls.getLayerPopupProperties,
        );
        console.log('handleMapAction result:', result);
      } else {
        console.log(
          'Action response type not recognized:',
          actionResponse.type,
        );
      }
      onActionResult(result);
    } else {
      console.log('No actionResponse or map not ready:', {
        hasActionResponse: !!actionResponse,
        hasMap: !!mapRef.current,
      });
    }
  }, [actionResponse]);

  return <div ref={mapContainerRef} className="map-container" />;
};

export default Map;
