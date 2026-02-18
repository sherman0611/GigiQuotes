import psycopg2
from psycopg2.extras import execute_values, DictCursor

import numpy as np
from psycopg2.extensions import register_adapter, AsIs

# Teach Postgres how to handle NumPy floats and ints
def adapt_numpy_float64(numpy_float64):
    return AsIs(float(numpy_float64))

def adapt_numpy_int64(numpy_int64):
    return AsIs(int(numpy_int64))

register_adapter(np.float64, adapt_numpy_float64)
register_adapter(np.int64, adapt_numpy_int64)

DB_CONFIG = {
    "dbname": "gigi_quotes_db",
    "user": "postgres",
    "password": "0000",
    "host": "127.0.0.1",
    # "host": "161.35.46.239",
    "port": "5432"
}

def connect():
    """Establish and return a connection to the database."""
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("CONNECTION SUCCESSFUL")
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None
    
def save_vod_metadata(video_list):
    """
    Accepts a list of dicts from get_all_vod_metadata.
    Inserts video info into the video_catalog table.
    """
    if not video_list:
        print("No videos found to save.")
        return

    conn = connect()
    cur = conn.cursor()
    
    print(f"Saving {len(video_list)} videos to the database...")
    try:
        create_table_query = """
        CREATE TABLE IF NOT EXISTS video_catalog (
            vod_id TEXT PRIMARY KEY,
            title TEXT,
            thumbnail TEXT,
            upload_date DATE
        );
        """
        cur.execute(create_table_query)
        conn.commit()
        
        # 2. Prepare Data (mapping the dict keys to tuple)
        # Note: We use "ON CONFLICT" so if the video exists, we just update the title/thumbnail
        query = """
            INSERT INTO video_catalog (vod_id, title, thumbnail, upload_date) 
            VALUES %s 
            ON CONFLICT (vod_id) DO UPDATE SET 
                title = EXCLUDED.title,
                thumbnail = EXCLUDED.thumbnail,
                upload_date = EXCLUDED.upload_date
        """
        
        data = [
            (v['id'], v['title'], v['thumbnail'], v['upload_date']) 
            for v in video_list
        ]

        # 3. Bulk Insert
        execute_values(cur, query, data)
        conn.commit()
        print(f"Successfully synced {len(data)} videos to the database.")
        
    except Exception as e:
        conn.rollback()
        print(f"Database Error: {e}")
    finally:
        cur.close()
        conn.close()

def save_transcriptions(quotes_list, vod_id):
    """
    Accepts a list of dicts and a VOD ID string.
    Inserts everything into the database in one bulk operation.
    """
    if not quotes_list:
        print("No quotes to save.")
        return

    conn = connect()
    cur = conn.cursor()
    
    # Add the vod_id to every tuple in the list
    # Every row being sent to the DB will now look like: (0.0, 1.0, 'Hello', 'abc-123')
    try:
        create_table_query = """
        CREATE TABLE IF NOT EXISTS quotes (
            id SERIAL PRIMARY KEY,
            vod_id TEXT,
            start_time FLOAT8,
            end_time FLOAT8,
            content TEXT
        );
        """
        cur.execute(create_table_query)
        conn.commit()
        
        # 2. PREPARE DATA
        query = "INSERT INTO quotes (vod_id, start_time, end_time, content) VALUES %s"
        data = [(vod_id, q['start'], q['end'], q['text']) for q in quotes_list]

        # 3. INSERT AND COMMIT DATA
        execute_values(cur, query, data)
        conn.commit()
        print(f"Saved {len(data)} quotes for {vod_id} to database")
    except Exception as e:
        conn.rollback()
        print(f"Database Error: {e}")
    finally:
        cur.close()
        conn.close()

def fetch_all_quotes():
    """Helper function to get all transcriptions for the website."""
    conn = connect()
    if conn:
        # Using DictCursor lets us access data by column name (e.g., row['content'])
        cur = conn.cursor(cursor_factory=DictCursor) 
    
        cur.execute("SELECT id, start_time, end_time, content FROM transcriptions ORDER BY id DESC")
        rows = cur.fetchall()
        
        cur.close()
        conn.close()
        return rows
    return []