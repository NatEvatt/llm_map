import maplibregl from 'maplibre-gl';
import {
  setLayerColor,
  setCircleRadius,
  setStrokeWidth,
  setFillOpacity,
} from './layerUtils';

interface SymbologyChange {
  success: boolean;
  message?: string;
}

export const applyColorChange = (
  map: maplibregl.Map,
  layer: string,
  color: string,
): SymbologyChange => {
  const success = setLayerColor(map, layer, color);
  return {
    success,
    message: success ? `color to ${color}` : undefined,
  };
};

export const applyRadiusChange = (
  map: maplibregl.Map,
  layer: string,
  radius: number,
): SymbologyChange => {
  const success = setCircleRadius(map, layer, radius);
  return {
    success,
    message: success ? `radius to ${radius}` : undefined,
  };
};

export const applyStrokeWidthChange = (
  map: maplibregl.Map,
  layer: string,
  width: number,
): SymbologyChange => {
  const success = setStrokeWidth(map, layer, width);
  return {
    success,
    message: success ? `stroke width to ${width}` : undefined,
  };
};

export const applyFillOpacityChange = (
  map: maplibregl.Map,
  layer: string,
  opacity: number,
): SymbologyChange => {
  const success = setFillOpacity(map, layer, opacity);
  return {
    success,
    message: success ? `fill opacity to ${opacity}` : undefined,
  };
};

export const handleSymbologyChange = (
  map: maplibregl.Map,
  layer: string,
  parameters: {
    color?: string;
    radius?: number;
    strokeWidth?: number;
    fillOpacity?: number;
  },
): { success: boolean; message: string } => {
  const changes: string[] = [];

  // Apply each change and collect successful changes
  if (parameters.color) {
    const result = applyColorChange(map, layer, parameters.color);
    if (result.message) changes.push(result.message);
  }

  if (parameters.radius) {
    const result = applyRadiusChange(map, layer, parameters.radius);
    if (result.message) changes.push(result.message);
  }

  if (parameters.strokeWidth) {
    const result = applyStrokeWidthChange(map, layer, parameters.strokeWidth);
    if (result.message) changes.push(result.message);
  }

  if (parameters.fillOpacity) {
    const result = applyFillOpacityChange(map, layer, parameters.fillOpacity);
    if (result.message) changes.push(result.message);
  }

  // Generate appropriate response
  if (changes.length > 0) {
    return {
      success: true,
      message: `Changed ${changes.join(' and ')} for layer ${layer}`,
    };
  }

  return {
    success: false,
    message: `No valid changes provided for layer ${layer}`,
  };
};
