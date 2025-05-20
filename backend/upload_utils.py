import json
import uuid
import psycopg2
from fastapi import HTTPException, UploadFile
from shapely.geometry import shape
from shapely.wkb import dumps as wkb_dumps
from backend_constants import DB_CONFIG

def create_table_for_geojson(cur, layer_name: str, features: list) -> None:
    """Create a new table for the GeoJSON data with dynamic columns based on properties."""
    # Get all unique property keys from all features
    all_properties = set()
    for feature in features:
        if "properties" in feature:
            all_properties.update(feature["properties"].keys())
    
    # Create the table with dynamic columns
    columns = [
        "id SERIAL PRIMARY KEY",
        "geom GEOMETRY(GEOMETRY, 4326)"
    ]
    
    # Add columns for each property
    for prop in all_properties:
        # Determine column type based on property value
        sample_value = next(
            (f["properties"][prop] for f in features if prop in f.get("properties", {})),
            None
        )
        
        if isinstance(sample_value, bool):
            col_type = "BOOLEAN"
        elif isinstance(sample_value, int):
            col_type = "INTEGER"
        elif isinstance(sample_value, float):
            col_type = "DOUBLE PRECISION"
        else:
            col_type = "TEXT"
            
        columns.append(f'"{prop}" {col_type}')
    
    # Create the table
    create_table_sql = f"""
    CREATE TABLE IF NOT EXISTS layers.{layer_name} (
        {', '.join(columns)}
    );
    """
    cur.execute(create_table_sql)
    
    # Create spatial index
    cur.execute(f"""
    CREATE INDEX IF NOT EXISTS idx_{layer_name}_geom 
    ON layers.{layer_name} USING GIST(geom);
    """)

def insert_feature(cur, layer_name: str, feature: dict) -> None:
    """Insert a feature into the dynamically created table."""
    if "properties" not in feature:
        feature["properties"] = {}
    
    # Convert geometry to WKB
    shapely_geom = shape(feature["geometry"])
    wkb_geom = wkb_dumps(shapely_geom, hex=True)
    
    # Get all columns from the table
    cur.execute(f"""
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'layers' 
    AND table_name = '{layer_name}'
    ORDER BY ordinal_position;
    """)
    columns = [row[0] for row in cur.fetchall()]
    
    # Prepare the insert statement
    placeholders = []
    values = []
    for col in columns:
        if col == 'id':
            continue
        elif col == 'geom':
            placeholders.append("ST_GeomFromWKB(%s::geometry, 4326)")
            values.append(wkb_geom)
        else:
            placeholders.append("%s")
            values.append(feature["properties"].get(col))
    
    # Execute the insert
    insert_sql = f"""
    INSERT INTO layers.{layer_name} 
    ({', '.join(f'"{col}"' for col in columns if col != 'id')})
    VALUES ({', '.join(placeholders)})
    """
    cur.execute(insert_sql, values)

async def process_geojson_upload(file: UploadFile) -> dict:
    """Process a GeoJSON file upload and save to database."""
    try:
        # Read the file content
        content = await file.read()
        geojson_data = json.loads(content)
        
        # Validate that it's a valid GeoJSON
        if not isinstance(geojson_data, dict):
            raise HTTPException(status_code=400, detail="Invalid GeoJSON format")
            
        if geojson_data.get("type") != "FeatureCollection":
            raise HTTPException(status_code=400, detail="Only FeatureCollection type is supported")
            
        if not isinstance(geojson_data.get("features"), list):
            raise HTTPException(status_code=400, detail="Invalid features array in GeoJSON")
        
        # Generate a unique layer name based on the filename and a UUID
        base_name = file.filename.split('.')[0].lower()
        layer_name = f"custom_{base_name}_{str(uuid.uuid4())[:8]}"
        
        # Connect to the database
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        try:
            # Create the table for this GeoJSON
            create_table_for_geojson(cur, layer_name, geojson_data["features"])
            
            # Insert each feature
            for feature in geojson_data["features"]:
                insert_feature(cur, layer_name, feature)
            
            conn.commit()
            
            # Return the layer name and the original GeoJSON
            return {
                "layer_name": layer_name,
                "geojson": geojson_data
            }
            
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        finally:
            cur.close()
            conn.close()
            
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 