-- Create a table for custom GeoJSON layers
CREATE TABLE IF NOT EXISTS layers.custom_layers (
    id SERIAL PRIMARY KEY,
    layer_name TEXT NOT NULL UNIQUE,
    name TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(GEOMETRY, 4326)
);

-- Create an index on the layer_name
CREATE INDEX IF NOT EXISTS idx_custom_layers_name ON layers.custom_layers(layer_name);

-- Create a spatial index on the geometry
CREATE INDEX IF NOT EXISTS idx_custom_layers_geom ON layers.custom_layers USING GIST(geom); 