from flask import Flask, render_template, request, jsonify
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

def get_db_connection():
    return psycopg2.connect(
        host = os.getenv('DB_HOST'),
        database = os.getenv('DB_NAME'),
        user = os.getenv('DB_USER'),
        password = os.getenv('DB_PASSWORD')
    )

@app.route('/')
def index():
    sort_param = request.args.get('sort', 'newest')
    order_sql = "DESC" if sort_param == "newest" else "ASC"
    
    search_query = request.args.get('search', '').strip()
    requested_tab = request.args.get('active_tab')
    page = request.args.get('page', 1, type=int)
    offset = (page - 1) * QUOTES_PER_PAGE

    video_results, quote_results, highlight_terms = [], [], []
    total_quotes, total_pages = 0, 1

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if search_query:
        # 2. Parsing Logic
        id_match = re.search(r'(?:id:\s*)?([a-zA-Z0-9_-]{11})', search_query, re.IGNORECASE)
        t_match = re.search(r'title:\s*([^;]+)', search_query, re.IGNORECASE)
        w_match = re.search(r'word:\s*([^;]+)', search_query, re.IGNORECASE)
        
        id_filter = id_match.group(1) if id_match else None
        t_filter = t_match.group(1).strip() if t_match else ""
        w_filter = w_match.group(1).strip() if w_match else ""
        
        is_implicit_list = ',' in search_query and not (t_match or w_match or id_match)
        if is_implicit_list:
            w_filter = search_query.strip()

        is_tagged_search = bool(t_match or w_match or id_match) or is_implicit_list

        # 3. Secure Regex Preparation
        # Note: PostgreSQL ~* is powerful; consider ILIKE if regex isn't strictly needed
        w_list = [w.strip() for w in w_filter.split(',') if w.strip()]
        w_regexes = [f"\\y{re.escape(w)}\\y" for w in w_list]
        t_regex = f"\\y{re.escape(t_filter)}\\y" if t_filter else None

        # 4. Build Video Results
        v_conditions, v_params = [], []
        if is_tagged_search:
            if id_filter:
                v_conditions.append("v.vod_id = %s")
                v_params.append(id_filter)
            if t_regex:
                v_conditions.append("v.title ~* %s")
                v_params.append(t_regex)
            
            if w_list:
                for regex in w_regexes:
                    v_conditions.append("q.content ~* %s")
                    v_params.append(regex)
                
                where_str = " WHERE " + " AND ".join(v_conditions)
                # DISTINCT prevents duplicate videos when multiple quotes match
                video_sql = f"""
                    SELECT DISTINCT v.* FROM video_catalog v
                    JOIN quotes q ON v.vod_id = q.vod_id
                    {where_str} ORDER BY v.upload_date {order_sql}
                """
            else:
                where_str = (" WHERE " + " AND ".join(v_conditions)) if v_conditions else ""
                video_sql = f"SELECT * FROM video_catalog v {where_str} ORDER BY v.upload_date {order_sql}"
            
            cur.execute(video_sql, v_params)
        else:
            # Simple title search
            cur.execute(f"SELECT * FROM video_catalog WHERE title ~* %s ORDER BY upload_date {order_sql}", 
                        (f"\\y{re.escape(search_query)}\\y",))
        
        video_results = cur.fetchall()

        # 5. Build Quote Results (Pagination)
        q_conditions, q_params = [], []
        if is_tagged_search:
            if id_filter:
                q_conditions.append("v.vod_id = %s")
                q_params.append(id_filter)
            if t_regex:
                q_conditions.append("v.title ~* %s")
                q_params.append(t_regex)
            if w_list:
                for regex in w_regexes:
                    q_conditions.append("q.content ~* %s")
                    q_params.append(regex)
            highlight_terms = w_list
        else:
            q_conditions.append("q.content ~* %s")
            q_params.append(f"\\y{re.escape(search_query)}\\y")
            highlight_terms = [search_query]

        where_q_str = " WHERE " + " AND ".join(q_conditions)
        
        # Count total
        cur.execute(f"SELECT COUNT(*) FROM quotes q JOIN video_catalog v ON q.vod_id = v.vod_id {where_q_str}", q_params)
        total_quotes = cur.fetchone()['count']
        
        # Paginated fetch
        quote_sql = f"""
            SELECT v.*, q.content, q.start_time as time
            FROM video_catalog v
            JOIN quotes q ON v.vod_id = q.vod_id
            {where_q_str}
            ORDER BY v.upload_date {order_sql}
            LIMIT %s OFFSET %s
        """
        cur.execute(quote_sql, q_params + [QUOTES_PER_PAGE, offset])
        quote_results = cur.fetchall()

        # 6. Formatting
        for row in quote_results:
            row['time'] = format_timestamp(row['time'])
            # 1. Escape the content first to prevent XSS
            safe_content = html.escape(row['content'])
            
            for term in highlight_terms:
                # 2. Highlight the escaped content
                pattern = re.compile(rf'(\b{re.escape(term)}\b)', re.IGNORECASE)
                safe_content = pattern.sub(r'<span class="highlight">\1</span>', safe_content)
            
            row['content'] = safe_content
            
        total_pages = math.ceil(total_quotes / (QUOTES_PER_PAGE or 1))

    else:
        # Standard load
        cur.execute(f'SELECT * FROM video_catalog ORDER BY upload_date {order_sql}')
        video_results = cur.fetchall()

    cur.close()
    conn.close()

    # 7. Final Tab Logic
    if requested_tab in ['Videos', 'Quotes']:
        active_tab = requested_tab
        # Fallback if the requested tab is empty but the other isn't
        if requested_tab == 'Quotes' and total_quotes == 0 and video_results:
            active_tab = 'Videos'
        elif requested_tab == 'Videos' and not video_results and total_quotes > 0:
            active_tab = 'Quotes'
    else:
        active_tab = 'Videos' if (video_results or not total_quotes) else 'Quotes'
    
    return render_template('index.html', 
                           video_results=video_results, 
                           quote_results=quote_results, 
                           total_quotes=total_quotes, 
                           query=search_query, 
                           current_sort=sort_param, 
                           active_tab=active_tab, 
                           current_page=page, 
                           total_pages=total_pages)

@app.route('/random-quotes')
def random_quotes():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Fetch 10 random quotes with their associated video data
    cur.execute("""
        SELECT v.*, q.content, q.start_time as time
        FROM quotes q
        JOIN video_catalog v ON q.vod_id = v.vod_id
        ORDER BY RANDOM()
        LIMIT 10;
    """)
    random_quotes = cur.fetchall()
    
    for quote in random_quotes:
        quote['time'] = format_timestamp(quote['time'])
        
    cur.close()
    conn.close()

    return render_template('index.html', 
                           quote_results=random_quotes,
                           total_quotes=len(random_quotes),
                           )

@app.route('/video/<vod_id>')
def video_detail(vod_id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Fetch video metadata for the title
    cur.execute('SELECT * FROM video_catalog WHERE vod_id = %s', (vod_id,))
    video = cur.fetchone()
    
    # Fetch all quotes for this specific video
    cur.execute('SELECT * FROM quotes WHERE vod_id = %s ORDER BY start_time ASC', (vod_id,))
    quotes = cur.fetchall()
    
    cur.close()
    conn.close()
    
    # If the video ID doesn't exist in our catalog, return to home
    if not video:
        return "Video not found", 404
        
    return render_template('details.html', video=video, quotes=quotes)

@app.route('/api/videos')
def get_videos_api():
    page = request.args.get('page', 1, type=int)
    limit = 24
    offset = (page - 1) * limit
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    query = "SELECT * FROM video_catalog ORDER BY upload_date DESC LIMIT %s OFFSET %s"
    cur.execute(query, (limit, offset))
    
    videos = cur.fetchall()
    cur.close()
    conn.close()
    return {"videos": videos}

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

@app.template_filter('format_timestamp')
def format_timestamp(seconds):
    if seconds is None:
        return "0:00"
        
    seconds = int(seconds)
    hrs = seconds // 3600
    mins = (seconds % 3600) // 60
    secs = seconds % 60

    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}"
    else:
        return f"{mins}:{secs:02d}"
    
if __name__ == '__main__':
    app.run()