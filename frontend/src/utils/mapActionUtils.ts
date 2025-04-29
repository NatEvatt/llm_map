import maplibregl from 'maplibre-gl';
import { handleClusterAction } from './clusterUtils';
import { handleHeatMapAction } from './heatmapUtils';
import {
  addSourceAndLayer,
  addPopupToLayer,
  setLayerColor,
  setCircleRadius,
  setStrokeWidth,
  setFillOpacity,
} from './layerUtils';
import { handleSymbologyChange } from './symbologyUtils';

interface MapActionResult {
  error?: string;
  success?: string;
}

interface MapActionParameters {
  levels?: number;
  level?: number;
  x?: number;
  y?: number;
  lng?: number;
  lat?: number;
  degrees?: number;
  center?: [number, number];
  zoom?: number;
  action?: string;
  layer?: string;
  color?: string;
  radius?: number;
  strokeWidth?: number;
  fillOpacity?: number;
  ids?: number[];
}

interface MapAction {
  intent: string;
  parameters: MapActionParameters;
  restore_original?: {
    layer: string;
  };
}

export const handleMapAction = (
  map: maplibregl.Map,
  response: { action: MapAction },
  geoJsonData: Record<string, any>,
  getPopupProperties: (layerId: string, featureId: number) => Promise<any>,
): MapActionResult => {
  if (!response?.action || !map) {
    return { error: 'Invalid response format' };
  }

  const { intent, parameters, restore_original } = response.action;
  let result: MapActionResult = {};

  switch (intent) {
    case 'ZOOM_IN':
      map.zoomIn({ duration: parameters.levels || 1 });
      result = { success: `Zoomed in ${parameters.levels || 1} level(s)` };
      break;
    case 'ZOOM_OUT':
      map.zoomOut({ duration: parameters.levels || 1 });
      result = { success: `Zoomed out ${parameters.levels || 1} level(s)` };
      break;
    case 'SET_ZOOM':
      map.setZoom(parameters.level!);
      result = { success: `Set zoom to level ${parameters.level}` };
      break;
    case 'PAN':
      map.panBy([parameters.x!, parameters.y!]);
      result = {
        success: `Panned map by [${parameters.x}, ${parameters.y}]`,
      };
      break;
    case 'FLY_TO':
      map.flyTo({ center: [parameters.lng!, parameters.lat!] });
      result = {
        success: `Flew to [${parameters.lng}, ${parameters.lat}]`,
      };
      break;
    case 'JUMP_TO':
      map.jumpTo({ center: [parameters.lng!, parameters.lat!] });
      result = {
        success: `Jumped to [${parameters.lng}, ${parameters.lat}]`,
      };
      break;
    case 'ROTATE':
      map.rotateTo(parameters.degrees!);
      result = { success: `Rotated to ${parameters.degrees} degrees` };
      break;
    case 'PITCH':
      map.setPitch(parameters.degrees!);
      result = { success: `Set pitch to ${parameters.degrees} degrees` };
      break;
    case 'RESET_VIEW':
      map.jumpTo({
        center: parameters.center!,
        zoom: parameters.zoom!,
      });
      result = { success: 'Reset view to default' };
      break;
    case 'HEAT_MAP':
      if (parameters.action && parameters.layer) {
        result = handleHeatMapAction(
          map,
          { action: parameters.action, layer: parameters.layer },
          geoJsonData,
        );
      } else {
        result = { error: 'Missing required parameters for heat map action' };
      }
      break;
    case 'CLUSTER':
      if (parameters.action && parameters.layer) {
        result = handleClusterAction(
          map,
          { action: parameters.action, layer: parameters.layer },
          geoJsonData,
        );
        // If there's a restore_original field, add the original layer back
        if (restore_original) {
          const { layer } = restore_original;
          if (geoJsonData && geoJsonData[layer]) {
            addSourceAndLayer(map, layer, geoJsonData[layer]);
            addPopupToLayer(map, layer, getPopupProperties);
          }
        }
      } else {
        result = { error: 'Missing required parameters for cluster action' };
      }
      break;
    case 'CHANGE_SYMBOLOGY':
      if (parameters.layer) {
        const symbologyResult = handleSymbologyChange(map, parameters.layer, {
          color: parameters.color,
          radius: parameters.radius,
          strokeWidth: parameters.strokeWidth,
          fillOpacity: parameters.fillOpacity,
        });

        result = symbologyResult.success
          ? { success: symbologyResult.message }
          : { error: symbologyResult.message };
      } else {
        result = {
          error: 'Missing required layer parameter for symbology change action',
        };
      }
      break;
    case 'FILTER':
      if (parameters.layer && parameters.ids) {
        // Filter the features based on the provided IDs
        const filteredFeatures =
          geoJsonData[parameters.layer]?.features?.filter((feature: any) =>
            parameters.ids?.includes(feature.properties.id),
          ) || [];

        // Update the layer with filtered features
        if (map.getSource(parameters.layer)) {
          (map.getSource(parameters.layer) as maplibregl.GeoJSONSource).setData(
            {
              type: 'FeatureCollection',
              features: filteredFeatures,
            },
          );
          result = {
            success: `Filtered ${parameters.layer} to show ${filteredFeatures.length} features`,
          };
        } else {
          result = { error: `Layer ${parameters.layer} not found` };
        }
      } else {
        result = { error: 'Missing required parameters for filter action' };
      }
      break;
    default:
      result = { error: `Unknown action intent: ${intent}` };
  }

  return result;
};
