from fastapi import FastAPI, Query, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from backend_constants import LAYER_COLUMNS, DB_CONFIG
import psycopg2
import json
import requests
from requests.auth import HTTPBasicAuth
from geojson import Feature, FeatureCollection
import re
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, Literal
import os
import time
import openai
from shapely.geometry import shape
from shapely.wkb import dumps as wkb_dumps
from upload_utils import process_geojson_upload
from psycopg2.extras import RealDictCursor
from prompts import get_sql_prompt, get_action_prompt, get_intent_prompt, get_help_text

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

# LLM Configuration
LLM_PROVIDER = os.environ.get('LLM_PROVIDER', 'ollama')  # Default to ollama if not specified

OLLAMA_CONFIG = {
    "url": f"{os.environ.get('OLLAMA_HOST')}",
    "auth": HTTPBasicAuth(os.environ.get('OLLAMA_USERNAME'), os.environ.get('OLLAMA_PASSWORD')),
    "model": os.environ.get('LLM_MODEL'),
}

AZURE_CONFIG = {
    "api_key": os.environ.get('AZURE_OPENAI_API_KEY'),
    "api_version": os.environ.get('AZURE_OPENAI_API_VERSION', '2024-02-15-preview'),
    "endpoint": os.environ.get('AZURE_OPENAI_ENDPOINT'),
    "deployment_name": os.environ.get('AZURE_OPENAI_DEPLOYMENT_NAME'),
}

class LLMService:
    def __init__(self, provider: Literal['ollama', 'azure'] = 'ollama'):
        self.provider = provider
        if provider == 'azure':
            openai.api_type = "azure"
            openai.api_base = AZURE_CONFIG['endpoint']
            openai.api_version = AZURE_CONFIG['api_version']
            openai.api_key = AZURE_CONFIG['api_key']
    
    def generate_response(self, prompt: str) -> str:
        if self.provider == 'ollama':
            return self._generate_ollama_response(prompt)
        else:
            return self._generate_azure_response(prompt)
    
    def _generate_ollama_response(self, prompt: str) -> str:
        ollama_url = f"{OLLAMA_CONFIG['url']}/api/generate"
        response = requests.post(
            ollama_url,
            auth=OLLAMA_CONFIG["auth"],
            json={"model": OLLAMA_CONFIG['model'], "prompt": prompt, "stream": False}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to get response from Ollama")
        
        return response.json()["response"]
    
    def _generate_azure_response(self, prompt: str) -> str:
        try:
            response = openai.ChatCompletion.create(
                engine=AZURE_CONFIG['deployment_name'],
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=800
            )
            return response.choices[0].message.content
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get response from Azure OpenAI: {str(e)}")

# Initialize LLM service
llm_service = LLMService(provider=LLM_PROVIDER)

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

def natural_language_to_sql(nl_query):
    """Convert NL query to SQL using a local Ollama LLM."""
    prompt = get_sql_prompt(nl_query)
    response = llm_service.generate_response(prompt)
    
    if response:
        # Clean up the response by removing markdown formatting
        sql_query = response.strip()
        # Remove markdown code block if present
        sql_query = re.sub(r'^```sql\s*', '', sql_query)
        sql_query = re.sub(r'\s*```$', '', sql_query)
        print('the sql response is:', sql_query)
        
        # Extract the primary layer from the SQL comment
        primary_layer_match = re.search(r"-- primary_layer: (\w+)", sql_query)
        primary_layer = primary_layer_match.group(1) if primary_layer_match else None
        
        if "id" not in sql_query.lower():
            sql_query = sql_query.replace("SELECT", "SELECT id, ", 1)
        sql_query = f"SELECT id FROM ({sql_query[:-1]}) AS subquery;"
        return sql_query, primary_layer
    else:
        return "ERROR: SQL query not found in the response.", None

def parse_azure_response(response: str) -> dict:
    """Parse response from Azure OpenAI."""
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse Azure OpenAI response as JSON")

def parse_ollama_response(response: str) -> dict:
    """Parse response from Ollama."""
    try:
        # Clean up markdown formatting if present
        cleaned_response = response.strip()
        if cleaned_response.startswith('```'):
            cleaned_response = re.sub(r'^```json\s*', '', cleaned_response)
            cleaned_response = re.sub(r'\s*```$', '', cleaned_response)
        
        # Try to parse as direct JSON first
        try:
            return json.loads(cleaned_response)
        except json.JSONDecodeError:
            # Try the old Ollama format with response field
            response_data = json.loads(cleaned_response)
            if "response" not in response_data:
                raise HTTPException(status_code=500, detail="No 'response' field in Ollama response")
            
            response_text = response_data["response"]
            # Find the first occurrence of a JSON object
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start == -1 or json_end == -1:
                raise HTTPException(status_code=500, detail="No valid JSON found in Ollama response")
            
            return json.loads(response_text[json_start:json_end])
    except (json.JSONDecodeError, KeyError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse Ollama response: {str(e)}")

def handle_cluster_action(action_json: dict) -> dict:
    """Handle cluster-related actions and update cluster state."""
    if action_json.get("intent") != "CLUSTER":
        return action_json
        
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
    
    return action_json

def handle_map_action(nl_query: str) -> dict:
    """Process a map action using the LLM."""
    start_time = time.time()
    prompt = get_action_prompt(nl_query)
    response = llm_service.generate_response(prompt)

    if not response:
        raise HTTPException(status_code=500, detail="Failed to get response from LLM")

    print(f"Raw LLM response: {response}")
    
    # Parse response based on provider
    try:
        if LLM_PROVIDER == 'azure':
            action_json = parse_azure_response(response)
        else:
            action_json = parse_ollama_response(response)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {str(e)}")

    if not action_json:
        raise HTTPException(status_code=500, detail="Failed to parse response in any format")
    
    print(f"Final parsed action JSON: {action_json}")
    
    # Handle cluster actions if present
    action_json = handle_cluster_action(action_json)
    
    end_time = time.time()
    print(f"Map action processing took {end_time - start_time:.2f} seconds")
    
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

@app.post("/upload-geojson")
async def upload_geojson(file: UploadFile = File(...)):
    """Handle GeoJSON file upload and save to database."""
    # Add a 5-second delay to test the frontend spinner
    return await process_geojson_upload(file)

@app.get("/get-layer-geojson")
def get_layer_geojson(layer: str):
    # Check if it's a custom layer
    if layer.startswith("custom_"):
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            # Get all columns except id and geom
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'layers' 
                AND table_name = %s
                AND column_name NOT IN ('id', 'geom')
                ORDER BY ordinal_position;
            """, (layer,))
            property_columns = [row[0] for row in cur.fetchall()]
            
            # Query the custom layer
            cur.execute(f"""
                SELECT 
                    id,
                    {', '.join(f'"{col}"' for col in property_columns)},
                    ST_AsGeoJSON(geom)::json as geometry
                FROM layers.{layer}
            """)
            
            rows = cur.fetchall()
            cur.close()
            conn.close()
            
            # Convert rows to GeoJSON features
            features = []
            for row in rows:
                properties = {
                    "id": row[0]
                }
                # Add all other properties
                for i, col in enumerate(property_columns, start=1):
                    properties[col] = row[i]
                
                feature = Feature(
                    geometry=row[-1],  # Last column is the geometry
                    properties=properties
                )
                features.append(feature)
            
            # Create a GeoJSON FeatureCollection
            collection = FeatureCollection(features)
            return JSONResponse(content=collection)
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error fetching custom layer: {str(e)}")
    
    # Handle regular layers as before
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

@app.get("/help")
async def get_help():
    """Return a friendly formatted string of available actions."""
    return {"response": get_help_text()}

def route_by_intent(nl_query: str) -> str:
    """Use a lightweight LLM call to determine the intent of a query."""
    try:
        start_time = time.time()
        prompt = get_intent_prompt(nl_query)
        response = llm_service.generate_response(prompt)
        
        if response:
            print('the response is:', response)
            print('the response is not none')
            
            # Try to parse as JSON first (Ollama case)
            try:
                response_data = json.loads(response)
                intent_text = response_data["response"].strip()
            except (json.JSONDecodeError, KeyError):
                # If not JSON or no response field, use the string directly (Azure case)
                intent_text = response.strip()
            
            print('the intent text is:', intent_text)
            
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
            
        else:
            raise HTTPException(status_code=500, detail="Failed to determine intent with LLM")
            
    except Exception as e:
        print(f"Error determining intent: {str(e)}")
        # Default to ACTION on error
        return "ACTION"

@app.post("/api/query")
async def query_database(query: str):
    """Query the database using natural language."""
    try:
        # Get the SQL prompt
        prompt = get_sql_prompt(query)
        
        # Get the SQL query from the LLM
        sql_query = get_llm_response(prompt)
        
        # Execute the query
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql_query)
                results = cur.fetchall()
                
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/action")
async def handle_action(action: str):
    """Handle map actions using natural language."""
    try:
        # Get the action prompt
        prompt = get_action_prompt(action)
        
        # Get the action from the LLM
        response = get_llm_response(prompt)
        
        # Parse the response as JSON
        try:
            action_data = json.loads(response)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Invalid response from LLM")
            
        return action_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/intent")
async def get_intent(query: str):
    """Get the intent of a query."""
    try:
        # Get the intent prompt
        prompt = get_intent_prompt(query)
        
        # Get the intent from the LLM
        intent = get_llm_response(prompt)
        
        return {"intent": intent.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/help")
async def get_help():
    """Get help text for available actions."""
    return {"help_text": get_help_text()}