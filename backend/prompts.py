import psycopg2
from backend_constants import DB_CONFIG
import re

def extract_relevant_tables(nl_query: str) -> list:
    """Use a simple pattern matching to identify potential table names from the query."""
    # Common table names and their variations
    table_patterns = {
        'parks': r'\b(?:park|parks)\b',
        'fountains': r'\b(?:fountain|fountains)\b',
        'cycle_paths': r'\b(?:cycle\s*path|cycle\s*paths|bike\s*path|bike\s*paths)\b'
    }
    
    # Find all mentioned tables
    mentioned_tables = []
    for table, pattern in table_patterns.items():
        if re.search(pattern, nl_query.lower()):
            mentioned_tables.append(table)
    
    # If no tables are explicitly mentioned, return all tables
    # This handles queries like "show me everything" or "what's available"
    if not mentioned_tables:
        return list(table_patterns.keys())
    
    return mentioned_tables

def get_table_schema(tables: list = None):
    """Get schema information for specified tables in the layers schema."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    if tables is None:
        # If no tables specified, get all tables in layers schema
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'layers'
            ORDER BY table_name;
        """)
        tables = [row[0] for row in cur.fetchall()]
    
    # Get column information for each table
    schema_info = {}
    for table in tables:
        cur.execute("""
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns 
            WHERE table_schema = 'layers' 
            AND table_name = %s
            ORDER BY ordinal_position;
        """, (table,))
        
        columns = []
        for col in cur.fetchall():
            col_name, data_type, is_nullable, default = col
            nullable = "NULL" if is_nullable == "YES" else "NOT NULL"
            columns.append(f"`{col_name}` ({data_type}, {nullable})")
        
        schema_info[table] = columns
    
    cur.close()
    conn.close()
    print('schema_info:', schema_info)
    return schema_info

def get_sql_prompt(nl_query: str) -> str:
    """Return the prompt for the parks, fountains, and cycle_path tables."""
    # Extract relevant tables from the query
    relevant_tables = extract_relevant_tables(nl_query)
    schema_info = get_table_schema(relevant_tables)
    
    # Build the schema section of the prompt
    schema_section = "### Database Schema\nThe database contains the following tables:\n\n"
    for table_name, columns in schema_info.items():
        schema_section += f"1. `layers.{table_name}`:\n"
        for column in columns:
            schema_section += f"   - {column}\n"
        schema_section += "\n"
    
    prompt = f"""
    Convert the following natural language query into a valid SQL statement for a PostGIS database.
    
    {schema_section}
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

def get_action_prompt(action: str) -> str:
    """Return the prompt for the action."""
    return f"""
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

def get_intent_prompt(query: str) -> str:
    """Return a simple prompt for determining the intent of a query."""
    return f"""
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

def get_help_text() -> str:
    """Return a friendly formatted string of available actions."""
    return """
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