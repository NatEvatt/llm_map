LAYER_COLUMNS = {
    "parks": ['id', 'osm_id', 'name', 'operator', 'note'],
    "fountains": ['id', 'osm_id', 'fountain', 'name'],
    "cycle_paths": ['id', 'osm_id', 'name', 'cycleway', 'highway', 'surface']
}

import os

# Database connection
DB_CONFIG = {
    "dbname": os.environ.get('POSTGRES_DB'),
    "user": os.environ.get('POSTGRES_USER'),
    "password": os.environ.get('POSTGRES_PASSWORD'),
    "host": os.environ.get('POSTGRES_HOST'),
    "port": os.environ.get('POSTGRES_PORT')
}