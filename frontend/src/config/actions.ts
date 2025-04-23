export const AVAILABLE_ACTIONS = {
  ZOOM_IN: 'Zoom in one level',
  ZOOM_OUT: 'Zoom out one level',
  SET_ZOOM: 'Set specific zoom level (0-20)',
  PAN: 'Move in a direction (x,y pixels)',
  FLY_TO: 'Animate to location (lng,lat)',
  JUMP_TO: 'Instantly move to location (lng,lat)',
  ROTATE: 'Rotate map view (0-360 degrees)',
  PITCH: 'Tilt map view (0-60 degrees)',
  RESET_VIEW: 'Reset to default view',
  HEAT_MAP: 'Add/remove heat map layer for point data',
  CLUSTER: 'Add/remove cluster layer for point data',
  HELP: 'Get help and information about available actions',
} as const;
