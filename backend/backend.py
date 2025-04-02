from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from backend_constants import LAYER_COLUMNS
import psycopg2
import json
import requests
from shapely.geometry import shape
from geojson import Feature, FeatureCollection
import re
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
model = "deepseek-coder-v2:16b"

# Allow CORS for your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:9001"],  # Adjust this to your frontend's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
DB_CONFIG = {
    "dbname": "llmmap",
    "user": "postgres",
    "password": "postgres",
    "host": "db",
    "port": "5432"
}

def query_postgis(sql_query):
    """Execute SQL query and return GeoJSON."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute(sql_query)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    print('the count of rows are:', len(rows))
    ids = []
    for row in rows:
        ids.append(row[0])
    
    return ids

def get_prompt(nl_query):
    """Return the prompt for the parks, fountains, and cycle_path tables."""
    prompt = f"""
    Convert the following natural language query into a valid SQL statement for a PostGIS database.
    
    ### Database Schema
    The database contains the following tables:

    1. `layers.parks`:
       - `id` (INT4, NOT NULL)
       - `osm_id` (TEXT, NULL)
       - `name` (TEXT, NULL)
       - `operator` (TEXT, NULL)
       - `note` (TEXT, NULL)
       - `geom` (GEOMETRY, NULL)

    2. `layers.fountains`:
       - `id` (INT4, NOT NULL)
       - `osm_id` (TEXT, NULL)
       - `name` (TEXT, NULL)
       - `note` (TEXT, NULL)
       - `geom` (GEOMETRY, NULL)

    3. `layers.cycle_paths`:
       - `id` (INT4, NOT NULL)
       - `osm_id` (TEXT, NULL)
       - `name` (TEXT, NULL)
       - `cycleway` (TEXT, NULL)
       - `highway` (TEXT, NULL)
       - `surface` (TEXT, NULL)
       - `geom` (GEOMETRY, NULL)

    ### Query Requirements
    - Ensure **all string comparisons are case-insensitive**.
    - If the query involves spatial relationships (e.g., "inside," "within," "near"), use appropriate PostGIS functions like `ST_Within` or `ST_Intersects`.
    - If spatial transformations are required (i.e., geometries are in different SRIDs), use `ST_Transform(geometry, target_srid)` and specify the SRID explicitly (e.g., 4326 for WGS 84).
    - If the query involves checking for null values, use `IS NOT NULL` or `IS NULL` as appropriate.
    - Ensure **all string comparisons are case-insensitive**.
    - Always qualify the `id` column with the table name (e.g., `fountains.id` or `parks.id`).
    - If the query involves spatial relationships (e.g., "inside," "within," "near"), use appropriate PostGIS functions like `ST_Within` or `ST_Intersects`.
    - Use `JOIN` instead of subqueries when checking spatial relationships to avoid errors with multiple rows.
    - Do not treat the string `'null'` as a literal value unless explicitly stated in the query.
    - If all geometries are already in the same SRID, do not use `ST_Transform`.
    - If the query has the words empty or null, check for null values and empty strings in the column.
    - Always include the `id` column in the SELECT statement.
    - If the query is a general request for all rows in a table (e.g., "show me all parks"), return all rows without additional filtering.
    - Include a comment in the SQL query specifying the primary layer to filter on. For example:
      ```sql
      -- primary_layer: fountains
      ```

    ### Example Queries
    - Show all parks:
      ```sql
      -- primary_layer: parks
      SELECT id FROM layers.parks;
      ```
    - Find all fountains inside parks (if geometries are in the same SRID): 
      ```sql
      -- primary_layer: fountains
      SELECT fountains.id
      FROM layers.fountains
      JOIN layers.parks
      ON ST_Within(fountains.geom, parks.geom);
      ```
    - Find all fountains inside parks: 
      ```sql
      -- primary_layer: fountains
      SELECT fountains.id
      FROM layers.fountains
      JOIN layers.parks
      ON ST_Within(
          fountains.geom,
          parks.geom
      );
      ```

    - Find all cycle paths that intersect parks:
      ```sql
      SELECT DISTINCT cycle_paths.id
      FROM layers.cycle_paths
      JOIN layers.parks
      ON ST_Intersects(cycle_paths.geom, parks.geom);

    - Find all fountains inside parks with a specific name:
      ```sql
      SELECT fountains.id
      FROM layers.fountains
      JOIN layers.parks
      ON ST_Intersects(
          fountains.geom,
          parks.geom
      )
      WHERE parks.name = 'Kensington Gardens';
      ```

    ### Input
    Natural Language Query: "{nl_query}"

    ### Output
    Return only the valid SQL query.

    SQL:
    """
    return prompt

def natural_language_to_sql(nl_query):
    """Convert NL query to SQL using a local Ollama LLM."""
    prompt = get_prompt(nl_query)
    ollama_url = "http://ollama:11434/api/generate"  # Ollama runs locally
    response = requests.post(ollama_url, json={"model": model, "prompt": prompt, "stream": False})
    
    if response.status_code == 200:
        match = re.search(r"SELECT.*?;", response.text, re.DOTALL)
        if match:
            sql_query = match.group(0).strip()
            sql_query = sql_query.replace('\\n', ' ').replace('\\u003e', '>').replace('\\u003c', '<')
            print('the response is:', sql_query)
            
            # Extract the primary layer from the SQL comment
            primary_layer_match = re.search(r"-- primary_layer: (\w+)", response.text)
            primary_layer = primary_layer_match.group(1) if primary_layer_match else None
            
            if "id" not in sql_query.lower():
                sql_query = sql_query.replace("SELECT", "SELECT id, ", 1)
            sql_query = f"SELECT id FROM ({sql_query[:-1]}) AS subquery;"
            return sql_query, primary_layer
        else:
            return "ERROR: SQL query not found in the response.", None
    else:
        return "ERROR: Failed to get a valid response from the API.", None

@app.get("/query")
def query_map(nl_query: str = Query(..., description="Natural language query")):
    sql_query, primary_layer = natural_language_to_sql(nl_query)
    print('-----------------------------------------------------------------------')
    ids = query_postgis(sql_query)
    return JSONResponse(content={"ids": ids, "primary_layer": primary_layer, "sql_query": sql_query})

@app.get("/get-layer-popup-properties")
def get_park_popup_properties(layer: str, park_id: int):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    column_names = LAYER_COLUMNS[layer]
    columns_sql = ", ".join(column_names)
    cur.execute(f"SELECT {columns_sql} FROM layers.{layer} WHERE id = {park_id}")
    row = cur.fetchone()
    cur.close()
    conn.close()

    if row:
        properties = {column_names[i]: row[i] for i in range(len(column_names))}
        return JSONResponse(content=properties)
    else:
        return JSONResponse(content={"error": "Park not found."})

@app.get("/get-layer-geojson")
def get_layer_geojson(layer: str):
    # Validate the requested layer
    if layer not in LAYER_COLUMNS:
        return JSONResponse(content={"error": f"Layer '{layer}' not found."}, status_code=400)

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # Query the database for the layer's geometry and ID
        cur.execute(f"SELECT id, ST_AsGeoJSON(geom) FROM layers.{layer}")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        # Convert rows to GeoJSON features
        features = []
        for row in rows:
            geom = json.loads(row[1])  # Parse the GeoJSON geometry
            feature = Feature(geometry=geom, properties={"id": row[0]})
            features.append(feature)

        # Create a GeoJSON FeatureCollection
        collection = FeatureCollection(features)
        return JSONResponse(content=collection)

    except Exception as e:
        print(f"Error fetching GeoJSON for layer '{layer}': {e}")
        return JSONResponse(content={"error": "An error occurred while fetching the layer data."}, status_code=500)

@app.get("/test-ollama")
def test_ollama():
    print('This is a test prompt for {}'.format(model))
    ollama_url = "http://ollama:11434/api/generate"  # Use the service name defined in docker-compose.yml
    prompt = "tell me a short story about a boy name Sue"
    response = requests.post(ollama_url, json={"model": model, "prompt": prompt, "stream": False})
    
    if response.status_code == 200:
        return response.json()
    else:
        raise HTTPException(status_code=response.status_code, detail="Failed to connect to Ollama service")
    
@app.post("/save-query")
def save_query(nl_query: str, sql_query: str):
    """Save the natural language and SQL queries to the database."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Insert the queries into the saved_queries table
    insert_sql = "INSERT INTO main.saved_queries (nl_query, sql_query) VALUES (%s, %s)"
    cur.execute(insert_sql, (nl_query, sql_query))
    
    conn.commit()
    cur.close()
    conn.close()
    
    return JSONResponse(content={"message": "Query saved successfully."})

@app.delete("/delete-saved-query")
def delete_saved_query(query_id: int):
    """Delete a saved query from the database."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Delete the query from the saved_queries table
    delete_sql = "DELETE FROM main.saved_queries WHERE id = %s"
    cur.execute(delete_sql, (query_id,))
    
    conn.commit()
    cur.close()
    conn.close()
    
    return JSONResponse(content={"message": "Query deleted successfully."})

@app.get("/get-saved-queries")
def get_saved_queries():
    """Retrieve all saved queries from the database."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Fetch all saved queries
    cur.execute("SELECT nl_query, sql_query FROM main.saved_queries")
    rows = cur.fetchall()
    
    cur.close()
    conn.close()

    # Convert rows to a list of dictionaries
    saved_queries = [{"nl_query": row[0], "sql_query": row[1]} for row in rows]
    
    return JSONResponse(content=saved_queries)