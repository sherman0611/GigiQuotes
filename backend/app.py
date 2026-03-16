from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import re
import math
import html
import os
from dotenv import load_dotenv
load_dotenv()

# Parameters
VIDEOS_PER_PAGE = 24
QUOTES_PER_PAGE = 10
GREM_WORDS = ["Grem", "Grems"]
CECE_WORDS = ["Cecilia", "Cece"]
YAOI_WORDS = ["Yaoi"]
YIPPEE_WORDS = ["Yippee"]
SIXSEVEN_WORDS = ["6 7", "Six Seven"]

app = Flask(__name__)
CORS(app)

def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))

def serialize_row(row):
    result = dict(row)
    for key, val in result.items():
        if hasattr(val, 'isoformat'):
            result[key] = val.isoformat()
    return result

def phrases_to_tsquery(input_str, operator='&'):
    # Split by comma and clean
    segments = [s.strip() for s in input_str.split(',') if s.strip()]
    phrase_queries = []
    
    for seg in segments:
        # Tokenize the individual words in the phrase
        words = [re.sub(r'[^\w]', '', w) for w in seg.split() if w.strip()]
        if words:
            # Join words with <-> for strict phrase matching
            phrase_queries.append(f"({' <-> '.join(words)})")
    
    if not phrase_queries:
        return None
        
    return f" {operator} ".join(phrase_queries)

@app.route('/api/search')
def search_api():
    search_query = request.args.get('search', '').strip()
    sort_param = request.args.get('sort', 'newest')
    order_sql = "DESC" if sort_param == "newest" else "ASC"
    page = request.args.get('page', 1, type=int)
    offset = (page - 1) * QUOTES_PER_PAGE
    # When true, skip the video query entirely (pagination page changes)
    quotes_only = request.args.get('quotes_only', 'false').lower() == 'true'
 
    # 1. Parse VOD ID vs Text
    id_match = re.search(r'([a-zA-Z0-9_-]{11})', search_query)
    id_filter = id_match.group(1) if id_match else None
    
    # Remove the VOD ID from the string to get just the search phrases
    phrase_input = re.sub(r'([a-zA-Z0-9_-]{11})', '', search_query).strip().strip(',')
    
    # Generate the TSQuery
    # We use '|' (OR) so we find quotes containing ANY of the phrases
    # then rank them so those containing BOTH phrases appear first.
    ts_query_phrases = phrases_to_tsquery(phrase_input, '|')
 
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
 
    # --- 2. VIDEO TAB ---
    # Skipped on pagination page changes — the frontend caches these results.
    video_results = []
    if not quotes_only:
        v_conditions, v_params = [], []
        if id_filter:
            v_conditions.append("v.vod_id = %s")
            v_params.append(id_filter)
        elif ts_query_phrases:
            v_conditions.append("v.title_tsv @@ websearch_to_tsquery('simple', %s)")
            v_params.append(ts_query_phrases)
 
        v_where = " WHERE " + (" OR " if not id_filter else " AND ").join(v_conditions) if v_conditions else ""
        cur.execute(f"SELECT * FROM video_catalog v {v_where} ORDER BY upload_date {order_sql}", v_params)
        video_results = cur.fetchall()
 
    # --- 3. QUOTES TAB ---
    q_conditions, q_params = [], []
    if id_filter:
        q_conditions.append("v.vod_id = %s")
        q_params.append(id_filter)
    
    rank_alias = "1"
    if ts_query_phrases:
        q_conditions.append("q.content_tsv @@ websearch_to_tsquery('simple', %s)")
        q_params.append(ts_query_phrases)
        # Calculate rank based on the OR query
        rank_alias = "ts_rank(q.content_tsv, websearch_to_tsquery('simple', %s))"
        q_params.insert(0, ts_query_phrases)
 
    # If user searched "VOD_ID, phrase", use AND to filter quotes within that video
    q_where = " WHERE " + " AND ".join(q_conditions) if q_conditions else ""
 
    # Count Total
    cur.execute(f"SELECT COUNT(*) FROM quotes q JOIN video_catalog v ON q.vod_id = v.vod_id {q_where}", 
                q_params[1:] if ts_query_phrases else q_params)
    total_quotes = cur.fetchone()['count']
 
    # Fetch Ranked Quotes
    quote_sql = f"""
        SELECT v.*, q.content, q.start_time as time, {rank_alias} as relevance
        FROM video_catalog v
        JOIN quotes q ON v.vod_id = q.vod_id
        {q_where}
        ORDER BY relevance DESC, v.upload_date {order_sql}
        LIMIT %s OFFSET %s
    """
    cur.execute(quote_sql, q_params + [QUOTES_PER_PAGE, offset])
    quote_results = cur.fetchall()
 
    # --- 4. HIGHLIGHTING ---
    # Extract original segments for highlighting
    highlight_terms = [s.strip() for s in phrase_input.split(',') if s.strip()]
    for row in quote_results:
        safe_content = html.escape(row['content'])
        for term in highlight_terms:
            pattern = re.compile(rf'({re.escape(term)})', re.IGNORECASE)
            safe_content = pattern.sub(r'<span class="highlight">\1</span>', safe_content)
        row['content'] = safe_content
 
    return jsonify({
        'video_results': [serialize_row(r) for r in video_results],
        'quote_results': [serialize_row(r) for r in quote_results],
        'total_quotes': total_quotes,
        'total_pages': math.ceil(total_quotes / QUOTES_PER_PAGE)
    })

@app.route('/api/random-quotes')
def random_quotes_api():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    cur.execute("""
        SELECT v.*, q.content, q.start_time as time
        FROM quotes q
        JOIN video_catalog v ON q.vod_id = v.vod_id
        ORDER BY RANDOM()
        LIMIT 10;
    """)
    random_quotes = cur.fetchall()

    cur.close()
    conn.close()

    return jsonify({'quotes': [serialize_row(q) for q in random_quotes]})

@app.route('/api/video/<vod_id>')
def video_detail_api(vod_id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    cur.execute('SELECT * FROM video_catalog WHERE vod_id = %s', (vod_id,))
    video = cur.fetchone()

    if not video:
        cur.close()
        conn.close()
        return jsonify({'error': 'Video not found'}), 404
    
    cur.execute('SELECT * FROM quotes WHERE vod_id = %s ORDER BY start_time ASC', (vod_id,))
    quotes = cur.fetchall()
    
    cur.close()
    conn.close()
        
    return jsonify({
        'video': serialize_row(video),
        'quotes': [serialize_row(q) for q in quotes]
    })

@app.route('/api/videos')
def get_videos_api():
    page = request.args.get('page', 1, type=int)
    sort_param = request.args.get('sort', 'newest')
    order_sql = "DESC" if sort_param == "newest" else "ASC"
    limit = 24
    offset = (page - 1) * limit

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        f"SELECT * FROM video_catalog ORDER BY upload_date {order_sql} LIMIT %s OFFSET %s",
        (limit, offset)
    )
    videos = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({'videos': [serialize_row(v) for v in videos]})

@app.route('/api/stats')
def get_stats():
    # Define categories clearly
    categories = {
        "grem": GREM_WORDS,
        "cece": CECE_WORDS,
        "yaoi": YAOI_WORDS,
        "yippee": YIPPEE_WORDS,
        "sixseven": SIXSEVEN_WORDS
    }

    sql_parts = []
    params = []

    for key, words in categories.items():
        # 1. Sanitize and escape each word to prevent injection into the regex engine
        # 2. Use \y (PostgreSQL word boundary) instead of \b to ensure native support
        # 3. Create a non-capturing group (?:...) for better performance
        pattern = '|'.join([re.escape(w.lower()) for w in words])
        regex_pattern = f'\\y(?:{pattern})\\y'
        
        # We use ARRAY_LENGTH + REGEXP_SPLIT_TO_ARRAY as it is often faster and 
        # more widely supported than REGEXP_COUNT in older Postgres versions.
        # It calculates: (number of segments - 1) = count of matches.
        sql_parts.append(
            f"SUM(COALESCE(ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(LOWER(content), %s), 1) - 1, 0)) AS {key}"
        )
        params.append(regex_pattern)

    # Construct the final query string
    # We use a whitelist for keys (the dictionary keys) so the f-string part is safe.
    full_query = f"SELECT {', '.join(sql_parts)} FROM quotes;"

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Execute with parameterized regex patterns to prevent ReDoS/Injection
            cur.execute(full_query, params)
            row = cur.fetchone()
            
            # Ensure we return 0 if the database returns None for a sum
            response = {key: int(val or 0) for key, val in row.items()}
            return jsonify(response)
    except Exception as e:
        app.logger.error(f"Stats calculation error: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)