from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from backend_constants import LAYER_COLUMNS
import psycopg2
import json
import requests
from requests.auth import HTTPBasicAuth
from geojson import Feature, FeatureCollection
import re
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import time

app = FastAPI()

# Allow CORS for your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"{os.environ.get('FRONTEND_URL')}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
DB_CONFIG = {
    "dbname": os.environ.get('POSTGRES_DB'),
    "user": os.environ.get('POSTGRES_USER'),
    "password": os.environ.get('POSTGRES_PASSWORD'),
    "host": os.environ.get('POSTGRES_HOST'),
    "port": os.environ.get('POSTGRES_PORT')
}

OLLAMA_CONFIG = {
    "url": f"{os.environ.get('OLLAMA_HOST')}",
    "auth": HTTPBasicAuth(os.environ.get('OLLAMA_USERNAME'), os.environ.get('OLLAMA_PASSWORD')),
    "model": os.environ.get('LLM_MODEL'),
}

CLUSTER_STATE = {}  # Track which layers have cluster versions

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

def get_sql_prompt(nl_query):
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

    ### Important Notes
    - There are NO foreign key relationships between tables (no park_id, fountain_id, etc.)
    - To find relationships between features (e.g., fountains inside parks), use spatial functions like ST_Within
    - For counting features inside other features, use subqueries with spatial joins
    - When counting features inside other features, use GROUP BY on the containing feature's ID

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
    - ALWAYS use fully qualified table names (e.g., `layers.fountains`, `layers.parks`, `layers.cycle_paths`)
    - ALWAYS use table aliases in JOINs and WHERE clauses (e.g., `FROM layers.fountains AS f`)
    - ALWAYS qualify column names with table aliases (e.g., `f.id`, `p.name`)
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
      SELECT f.id
      FROM layers.fountains AS f
      JOIN layers.parks AS p
      ON ST_Within(f.geom, p.geom);
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
      -- primary_layer: cycle_paths
      SELECT DISTINCT c.id
      FROM layers.cycle_paths AS c
      JOIN layers.parks AS p
      ON ST_Intersects(c.geom, p.geom);
      ```
    - Find all fountains inside parks with a specific name:
      ```sql
      -- primary_layer: fountains
      SELECT f.id
      FROM layers.fountains AS f
      JOIN layers.parks AS p
      ON ST_Within(f.geom, p.geom)
      WHERE p.name ILIKE 'Kensington Gardens';
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
    prompt = get_sql_prompt(nl_query)
    ollama_url = f"{OLLAMA_CONFIG['url']}/api/generate"  
    response = requests.post(ollama_url, auth=OLLAMA_CONFIG["auth"] ,json={"model": OLLAMA_CONFIG['model'], "prompt": prompt, "stream": False})
    
    if response.status_code == 200:
        match = re.search(r"SELECT.*?;", response.text, re.DOTALL)
        if match:
            sql_query = match.group(0).strip()
            sql_query = sql_query.replace('\\n', ' ').replace('\\u003e', '>').replace('\\u003c', '<')
            print('the sql response is:', sql_query)
            
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

def handle_map_action(nl_query: str) -> dict:
    """Process a map action using the LLM."""
    start_time = time.time()
    prompt = get_action_prompt(nl_query)
    ollama_url = f"{OLLAMA_CONFIG['url']}/api/generate"
    model = OLLAMA_CONFIG['actions_model']
    response = requests.post(
        ollama_url,
        auth=OLLAMA_CONFIG["auth"],
        json={"model": model, "prompt": prompt, "stream": False}
    )

    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to process action with Ollama")

    # Parse the response
    response_data = response.json()
    
    # Extract JSON object from the response
    response_text = response_data["response"]
    # Find the first occurrence of a JSON object
    json_start = response_text.find('{')
    json_end = response_text.rfind('}') + 1
    if json_start != -1 and json_end != -1:
        cleaned_response = response_text[json_start:json_end]
    else:
        raise HTTPException(status_code=500, detail="No valid JSON found in response")
    
    action_json = json.loads(cleaned_response)
    
    # Handle cluster layer state
    if action_json.get("intent") == "CLUSTER":
        layer = action_json.get("parameters", {}).get("layer")
        cluster_action = action_json.get("parameters", {}).get("action")
        
        if cluster_action == "ADD":
            CLUSTER_STATE[layer] = True
        elif cluster_action == "REMOVE":
            CLUSTER_STATE[layer] = False
            action_json["restore_original"] = {
                "layer": layer,
                "action": "ADD"
            }
    end_time = time.time()
    print(f"Map action processing took {end_time - start_time:.2f} seconds")
    
    # Use the type from the LLM response
    return {
        "type": action_json.get("type", "action"),  # Default to "action" if not specified
        "action": action_json
    }

def handle_data_query(nl_query: str) -> dict:
    """Process a data query using the LLM and PostGIS."""
    start_time = time.time()
    sql_query, primary_layer = natural_language_to_sql(nl_query)
    sql_end_time = time.time()
    print(f"SQL generation took {sql_end_time - start_time:.2f} seconds")
    
    ids = query_postgis(sql_query)
    end_time = time.time()
    print(f"PostGIS query took {end_time - sql_end_time:.2f} seconds")
    print(f"Total data query processing took {end_time - start_time:.2f} seconds")
    
    return {
        "type": "query",  # Changed from "action" to "query"
        "action": {
            "intent": "FILTER",
            "parameters": {
                "layer": primary_layer,
                "ids": ids,
                "sql_query": sql_query,
                "primary_layer": primary_layer
            }
        }
    }

def get_action_prompt(action):
    """Return the prompt for the action."""
    prompt = f"""
    IMPORTANT: Respond with ONLY a JSON object. Do not include any explanations, markdown formatting, or additional text.

    Convert the following natural language input into a structured JSON format.
    First, determine if this is a map action or a data query.

    If it's a map action, respond with:
    {{
        "type": "action",
        "intent": "ACTION_TYPE",
        "parameters": {{
            // action-specific parameters
        }}
    }}
    
Available actions and their parameters:
    1. ZOOM_IN - Zoom in one level
    2. ZOOM_OUT - Zoom out one level
    3. SET_ZOOM - Set specific zoom level (requires "level" parameter: number 0-20)
    4. PAN - Move in a direction (requires "x" and "y" parameters: numbers in pixels)
    5. FLY_TO - Animate to location (requires "lng" and "lat" parameters: numbers)
    6. JUMP_TO - Instantly move to location (requires "lng" and "lat" parameters: numbers)
    7. ROTATE - Rotate map view (requires "degrees" parameter: number 0-360)
    8. PITCH - Tilt map view (requires "degrees" parameter: number 0-60)
    9. RESET_VIEW - Reset to default view
    10. HEAT_MAP - Add, update or remove the heat map layer (requires "action" and "layer" parameters: "action": "ADD" or "REMOVE", "layer": "fountains")
    11. CLUSTER - Add or remove cluster layer for point data (requires "action" and "layer" parameters: "action": "ADD" or "REMOVE", "layer": "fountains")
    12. CHANGE_SYMBOLOGY - Change the appearance of a layer (requires "layer" parameter, and optionally "color", "radius", "strokeWidth", and/or "fillOpacity" parameters)
       - "layer": name of the layer to change
       - "color": color in any valid CSS format (hex, rgb, hsl, named colors)
       - "radius": number representing the new radius in pixels (e.g., 10, 15, 20)
       - "strokeWidth": number representing the new stroke width in pixels (e.g., 2, 3, 5)
       - "fillOpacity": number between 0 and 1 representing the fill opacity (e.g., 0.2, 0.5, 0.8)
       Note: You can provide any combination of these parameters depending on what the user wants to change

    The response must be a JSON object with:
    - "type": either "action" or "query"
    - "intent": One of the action types in CAPS or "HELP"
    - "parameters": Object containing required parameters for the action

    Examples:
    - "zoom in 2 levels" -> {{"intent": "ZOOM_IN", "parameters": {{"levels": 2}}}}
    - "move left" -> {{"intent": "PAN", "parameters": {{"x": -100, "y": 0}}}}
    - "go to London" -> {{"intent": "FLY_TO", "parameters": {{"lng": -0.1276, "lat": 51.5074}}}}
    - "rotate 90 degrees" -> {{"intent": "ROTATE", "parameters": {{"degrees": 90}}}}
    - "add heat map" -> {{"intent": "HEAT_MAP", "parameters": {{"action": "ADD", "layer": "fountains"}}}}
    - "add cluster layer" -> {{"intent": "CLUSTER", "parameters": {{"action": "ADD", "layer": "fountains"}}}}
    - "remove cluster layer" -> {{"intent": "CLUSTER", "parameters": {{"action": "REMOVE", "layer": "fountains"}}}}
    - "what can I do?" -> {{"intent": "HELP", "parameters": {{"type": "actions"}}}}
    - "show me available actions" -> {{"intent": "HELP", "parameters": {{"type": "actions"}}}}
    - "change fountains to red" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "color": "#FF0000"}}}}
    - "make parks green" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "parks", "color": "#00FF00"}}}}
    - "set cycle paths color to blue" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "cycle_paths", "color": "#0000FF"}}}}
    - "change the color of fountains to rgb(255, 0, 0)" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "color": "rgb(255, 0, 0)"}}}}
    - "make fountains bigger" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "radius": 10}}}}
    - "increase the size of fountains" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "radius": 12}}}}
    - "make fountains smaller" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "radius": 4}}}}
    - "set fountains radius to 15" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "radius": 15}}}}
    - "make fountains red and bigger" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "color": "#FF0000", "radius": 10}}}}
    - "change fountains to blue and set size to 12" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "fountains", "color": "#0000FF", "radius": 12}}}}
    - "make parks green and larger" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "parks", "color": "#00FF00", "radius": 15}}}}
    - "make cycle paths thicker" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "cycle_paths", "strokeWidth": 5}}}}
    - "set cycle paths to red and make them thicker" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "cycle_paths", "color": "#FF0000", "strokeWidth": 5}}}}
    - "make cycle paths blue and set width to 3" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "cycle_paths", "color": "#0000FF", "strokeWidth": 3}}}}
    - "make parks more transparent" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "parks", "fillOpacity": 0.3}}}}
    - "set parks to green and make them more transparent" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "parks", "color": "#00FF00", "fillOpacity": 0.3}}}}
    - "make parks more opaque" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "parks", "fillOpacity": 0.8}}}}
    - "set parks to blue and make them more opaque" -> {{"intent": "CHANGE_SYMBOLOGY", "parameters": {{"layer": "parks", "color": "#0000FF", "fillOpacity": 0.8}}}}

    The color parameter can be:
    - Hex color (e.g., "#FF0000")
    - RGB color (e.g., "rgb(255, 0, 0)")
    - HSL color (e.g., "hsl(0, 100%, 50%)")
    - Named color (e.g., "red", "blue", "green")

    Input: {action}

    REMEMBER: Respond with ONLY the JSON object, no other text or formatting.
    """
    return prompt

@app.get("/query")
def query(nl_query: str = Query(..., description="Natural language query")):
    """Process a natural language input using intent-based routing."""
    try:
        intent = route_by_intent(nl_query)
        print(f"Intent: {intent}")
        # Route to appropriate handler based on intent
        if intent == "FILTER":
            return JSONResponse(content=handle_data_query(nl_query))
        elif intent == "HELP":
            return JSONResponse(content={"type": "action", "action": {
                "intent": "HELP",
                "parameters": {"type": "actions"}
            }})
        else:  # ACTION
            return JSONResponse(content=handle_map_action(nl_query))
            
    except Exception as e:
        print(f"Error processing query: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
    print('This is a test prompt for {}'.format(OLLAMA_CONFIG['model']))
    ollama_url = f"{OLLAMA_CONFIG['url']}/api/generate"  # Use the service name defined in docker-compose.yml
    prompt = "tell me a short story about a boy name Sue"
    response = requests.post(ollama_url, auth=OLLAMA_CONFIG["auth"], json={"model": OLLAMA_CONFIG['model'], "prompt": prompt, "stream": False})
    
    if response.status_code == 200:
        return response.json()
    else:
        raise HTTPException(status_code=response.status_code, detail="Failed to connect to Ollama service")
    
@app.post("/save-query")
def save_query(nl_query: str, sql_query: str, primary_layer: str):
    """Save the natural language and SQL queries to the database."""
    # Validate that none of the required fields are empty
    if not nl_query or not sql_query or not primary_layer:
        return JSONResponse(
            status_code=400,
            content={"error": "All fields (nl_query, sql_query, primary_layer) must be non-empty"}
        )

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Insert the queries into the saved_queries table
    insert_sql = "INSERT INTO main.saved_queries (nl_query, sql_query, primary_layer) VALUES (%s, %s, %s)"
    cur.execute(insert_sql, (nl_query, sql_query, primary_layer))
    
    conn.commit()
    cur.close()
    conn.close()
    
    return JSONResponse(content={"message": "Query saved successfully."})

@app.delete("/delete-saved-query/{query_id}")
def delete_saved_query(query_id: int):
    """Delete a saved query from the database."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    try:
        # Delete the query from the saved_queries table
        delete_sql = "DELETE FROM main.saved_queries WHERE id = %s"
        cur.execute(delete_sql, (query_id,))
        
        conn.commit()
        return JSONResponse(content={"message": "Query deleted successfully."})
    except Exception as e:
        print(f"Error deleting query: {e}")
        return JSONResponse(content={"error": "Failed to delete query"}, status_code=500)
    finally:
        cur.close()
        conn.close()

@app.get("/get-saved-queries")
def get_saved_queries():
    """Retrieve all saved queries from the database."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Fetch all saved queries
    cur.execute("SELECT id, nl_query FROM main.saved_queries")
    rows = cur.fetchall()
    
    cur.close()
    conn.close()

    # Convert rows to a list of dictionaries
    saved_queries = [{"id": row[0], "nl_query": row[1]} for row in rows]
    
    return JSONResponse(content=saved_queries)

@app.get("/load-saved-query/{query_id}")
def load_saved_query(query_id: int):
    """Load and execute a saved query from the database."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    try:
        # Get the saved query from the database
        cur.execute("SELECT sql_query, primary_layer FROM main.saved_queries WHERE id = %s", (query_id,))
        result = cur.fetchone()
        
        if not result:
            return JSONResponse(content={"error": "Query not found"}, status_code=404)
        
        sql_query, primary_layer = result
        
        # Execute the query using query_postgis
        ids = query_postgis(sql_query)
        
        return JSONResponse(content={
            "ids": ids,
            "primary_layer": primary_layer,
            "sql_query": sql_query
        })
        
    except Exception as e:
        print(f"Error loading saved query: {e}")
        return JSONResponse(content={"error": "Failed to load query"}, status_code=500)
    finally:
        cur.close()
        conn.close()

class MapActionRequest(BaseModel):
    action: str

class MapActionResponse(BaseModel):
    response: str
    action: Optional[Dict[str, Any]] = None

def get_help_text():
    """Return a friendly formatted string of available actions."""
    help_text = """
    Here's what you can do with the map:

    🗺️ Basic Map Controls:
    - Zoom in or out ("zoom in a bit", "zoom out 2 levels")
    - Set a specific zoom level ("zoom to level 12")
    - Move around ("pan left", "move right", "go up")
    - Fly to places ("fly to London", "take me to Paris")
    - Jump to locations ("jump to New York", "show me Tokyo")
    - Rotate the view ("rotate 45 degrees", "turn right")
    - Tilt the view ("tilt up 30 degrees", "pitch down")
    - Reset everything ("reset view", "start over")

    🎨 Visual Effects:
    - Change layer appearance:
      * Change colors ("make parks green", "change fountains to blue")
      * Change sizes ("make fountains bigger", "increase the size of fountains")
      * Change line thickness ("make cycle paths thicker", "set cycle paths width to 3")
      * Change fill opacity ("make parks more transparent", "set parks to be more opaque")
      * Change multiple properties at once ("make parks green and more transparent", "set cycle paths to blue and make them thicker")
    - Add heat maps ("show heat map", "add heat map for fountains")
    - Remove heat maps ("remove heat map", "hide heat map")
    - Cluster points ("cluster the fountains", "group points together")
    - Remove clusters ("uncluster points", "remove grouping")

    💡 Help:
    - Ask what's possible ("what can I do?", "show me available actions")
    - Get help with specific features ("how do I zoom?", "what colors can I use?")

    For colors, you can use:
    - Simple color names ("red", "blue", "green")
    - Descriptive colors ("dark blue", "light green", "bright red")
    - Specific codes if you want ("#FF0000", "rgb(255,0,0)")
    """
    return help_text.strip()

@app.get("/help")
async def get_help():
    """Return a friendly formatted string of available actions."""
    return {"response": get_help_text()}

def get_intent_prompt(query: str) -> str:
    """Return a simple prompt for determining the intent of a query."""
    prompt = f"""
    Classify this query into exactly one word: ACTION, FILTER, or HELP.

    Important: only respond with one word, no other text or punctuation.

    Query: {query}

    Examples:
    "zoom in" -> ACTION
    "show me all parks" -> FILTER
    "what can I do" -> HELP
    "make fountains red" -> ACTION
    "find cycle paths near parks" -> FILTER
    "help" -> HELP
    "make parks green" -> ACTION
    "show me the cycle paths layer" -> FILTER
    "what can i do with this map?" -> HELP

    Your response (one word only):"""
    return prompt

def route_by_intent(nl_query: str) -> str:
    """Use a lightweight LLM call to determine the intent of a query."""
    try:
        start_time = time.time()
        prompt = get_intent_prompt(nl_query)
        ollama_url = f"{OLLAMA_CONFIG['url']}/api/generate"
        model = OLLAMA_CONFIG['model']
        response = requests.post(
            ollama_url,
            auth=OLLAMA_CONFIG["auth"],
            json={"model": model, "prompt": prompt, "stream": False}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to determine intent with Ollama")

        # Parse the response
        response_data = response.json()
        
        # Extract the intent from the response
        intent_text = response_data["response"].strip()
        print('Intent text:', intent_text)
        # Try to extract word from quotes if the response contains "then the output would be"
        if "then the output would be" in intent_text.lower():
            import re
            match = re.search(r"'([A-Z]+)'", intent_text)
            if match:
                intent = match.group(1)
            else:
                # Fallback to original logic if no match found
                intent = intent_text.split()[0].upper() if intent_text else "ACTION"
        else:
            # Use original logic for other cases
            intent = intent_text.split()[0].upper() if intent_text else "ACTION"
        
        # Remove any non-alphabetic characters
        intent = ''.join(c for c in intent if c.isalpha())
        
        # Validate the intent
        if intent not in ["ACTION", "FILTER", "HELP"]:
            print(f"Unexpected intent response: {intent}, defaulting to ACTION")
            intent = "ACTION"
        
        end_time = time.time()
        print(f"Intent determination took {end_time - start_time:.2f} seconds")
            
        return intent
            
    except Exception as e:
        print(f"Error determining intent: {str(e)}")
        # Default to ACTION on error
        return "ACTION"