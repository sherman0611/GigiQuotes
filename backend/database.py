import psycopg2
from psycopg2.extras import execute_values
import numpy as np
from psycopg2.extensions import register_adapter, AsIs
import os
from dotenv import load_dotenv

load_dotenv()

# Teach Postgres how to handle NumPy floats and ints
def adapt_numpy_float64(numpy_float64):
    return AsIs(float(numpy_float64))

def adapt_numpy_int64(numpy_int64):
    return AsIs(int(numpy_int64))

register_adapter(np.float64, adapt_numpy_float64)
register_adapter(np.int64, adapt_numpy_int64)

def connect():
    """Establish and return a connection to the database."""
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(os.getenv('DATABASE_URL'))
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
            upload_date DATE,
            title_tsv tsvector  -- Added column
        );
        """
        cur.execute(create_table_query)
        conn.commit()
        
        # We use to_tsvector('english', title) to populate the tsv column
        query = """
            INSERT INTO video_catalog (vod_id, title, thumbnail, upload_date, title_tsv) 
            VALUES (%s, %s, %s, %s, to_tsvector('english', %s)) 
            ON CONFLICT (vod_id) DO UPDATE SET 
                title = EXCLUDED.title,
                thumbnail = EXCLUDED.thumbnail,
                upload_date = EXCLUDED.upload_date,
                title_tsv = to_tsvector('english', EXCLUDED.title)
        """
        
        # Note: We duplicate the title in the tuple so it fills both the 'title' and 'title_tsv' placeholders
        data = [
            (v['id'], v['title'], v['thumbnail'], v['upload_date'], v['title']) 
            for v in video_list
        ]

        # execute_values needs a slightly different approach for functional calls like to_tsvector
        # Alternatively, use a template in execute_values:
        execute_values(cur, 
            "INSERT INTO video_catalog (vod_id, title, thumbnail, upload_date, title_tsv) VALUES %s " +
            "ON CONFLICT (vod_id) DO UPDATE SET title_tsv = to_tsvector('english', EXCLUDED.title)", 
            [(v['id'], v['title'], v['thumbnail'], v['upload_date'], v['title']) for v in video_list],
            template="(%s, %s, %s, %s, to_tsvector('english', %s))"
        )
        conn.commit()
        
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
    
    try:
        create_table_query = """
        CREATE TABLE IF NOT EXISTS quotes (
            id SERIAL PRIMARY KEY,
            vod_id TEXT,
            start_time FLOAT8,
            end_time FLOAT8,
            content TEXT,
            content_tsv tsvector  -- Added column
        );
        """
        cur.execute(create_table_query)
        conn.commit()
        
        # Prepare data: (vod_id, start, end, content, content_again_for_tsv)
        data = [(vod_id, q['start'], q['end'], q['text'], q['text']) for q in quotes_list]

        # Use the template argument to wrap the last %s in to_tsvector()
        insert_query = """
            INSERT INTO quotes (vod_id, start_time, end_time, content, content_tsv) 
            VALUES %s
        """
        execute_values(
            cur, 
            insert_query, 
            data, 
            template="(%s, %s, %s, %s, to_tsvector('english', %s))"
        )
        conn.commit()

    except Exception as e:
        conn.rollback()
        print(f"Database Error: {e}")
    finally:
        cur.close()
        conn.close()