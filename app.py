from flask import Flask, render_template, request
import psycopg2
from psycopg2.extras import RealDictCursor
import re
import math

# Parameters
VIDEOS_PER_PAGE = 24
QUOTES_PER_PAGE = 10
GREM_WORDS = ["Grem", "Grems"]
CECE_WORDS = ["Cecilia", "Cece"]
YAOI_WORDS = ["Yaoi"]
YIPPEE_WORDS = ["Yippee"]
LEAGUE_WORDS = ["League of Legends"]
SIXSEVEN_WORDS = ["6 7", "Six Seven"]

app = Flask(__name__)

def get_db_connection():
    return psycopg2.connect(
        host="127.0.0.1",
        database="gigi_quotes_db",
        user="postgres",
        password="0000"
    )

@app.route('/')
def index():
    sort_order = request.args.get('sort', 'newest')
    order_sql = "DESC" if sort_order == "newest" else "ASC"

    search_query = request.args.get('search', '').strip()
    requested_tab = request.args.get('active_tab')
    page = request.args.get('page', 1, type=int)
    offset = (page - 1) * QUOTES_PER_PAGE

    video_results = []
    quote_results = []
    highlight_terms = []
    total_quotes = 0
    total_pages = 1

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if search_query:
        id_match = re.search(r'(?:id:\s*)?([a-zA-Z0-9_-]{11})', search_query, re.IGNORECASE)
        t_match = re.search(r'title:\s*([^;]+)', search_query, re.IGNORECASE)
        w_match = re.search(r'word:\s*([^;]+)', search_query, re.IGNORECASE)
        
        id_filter = id_match.group(1) if id_match else None
        t_filter = t_match.group(1).strip() if t_match else ""
        w_filter = w_match.group(1).strip() if w_match else ""
        
        # Check for comma-separated list without tags
        is_implicit_list = ',' in search_query and not (t_match or w_match or id_match)
        if is_implicit_list:
            w_filter = search_query.strip()

        is_tagged_search = bool(t_match or w_match or id_match) or is_implicit_list

        # 3. Sanitize Inputs for Regex
        # We escape everything to prevent ReDoS and SQL injection via special characters
        w_list = [w.strip() for w in w_filter.split(',') if w.strip()]
        w_regexes = [f"\\y{re.escape(w)}\\y" for w in w_list]
        t_regex = f"\\y{re.escape(t_filter)}\\y" if t_filter else ".*"

        conditions = []
        params = []

        # 4. Build Secure Condition Logic
        if id_filter:
            conditions.append("v.vod_id = %s")
            params.append(id_filter)
        if t_filter:
            conditions.append("v.title ~* %s")
            params.append(t_regex)
        
        # 5. Handle Video Tab Results
        if is_tagged_search:
            # Clone current conditions for the video query
            v_conditions = list(conditions)
            v_params = list(params)
            
            # Words affect which videos are returned only if words are specified
            if w_list:
                for regex in w_regexes:
                    v_conditions.append("q.content ~* %s")
                    v_params.append(regex)
                
                where_clause = " WHERE " + " AND ".join(v_conditions)
                video_sql = f"""
                    SELECT DISTINCT v.* FROM video_catalog v
                    JOIN quotes q ON v.vod_id = q.vod_id
                    {where_clause}
                    ORDER BY v.upload_date {order_sql};
                """
                cur.execute(video_sql, v_params)
            else:
                where_clause = (" WHERE " + " AND ".join(v_conditions)) if v_conditions else ""
                video_sql = f"SELECT * FROM video_catalog v {where_clause} ORDER BY v.upload_date {order_sql};"
                cur.execute(video_sql, v_params)
        else:
            # Simple title search
            v_regex = f"\\y{re.escape(search_query)}\\y"
            cur.execute(f"SELECT * FROM video_catalog WHERE title ~* %s ORDER BY upload_date {order_sql};", (v_regex,))
        
        video_results = cur.fetchall()

        # 6. Handle Quote Tab Results
        q_conditions = list(conditions)
        q_params = list(params)

        if is_tagged_search:
            if w_list:
                for regex in w_regexes:
                    q_conditions.append("q.content ~* %s")
                    q_params.append(regex)
            highlight_terms = w_list
        else:
            q_regex = f"\\y{re.escape(search_query)}\\y"
            q_conditions.append("q.content ~* %s")
            q_params.append(q_regex)
            highlight_terms = [search_query]

        where_clause = " WHERE " + " AND ".join(q_conditions)
        
        # Count total matches for pagination
        count_sql = f"SELECT COUNT(*) FROM quotes q JOIN video_catalog v ON q.vod_id = v.vod_id {where_clause};"
        cur.execute(count_sql, q_params)
        total_quotes = cur.fetchone()['count']
        
        # Fetch paginated results
        quote_sql = f"""
            SELECT v.*, q.content, q.start_time as time
            FROM video_catalog v
            JOIN quotes q ON v.vod_id = q.vod_id
            {where_clause}
            ORDER BY v.upload_date {order_sql}
            LIMIT %s OFFSET %s;
        """
        cur.execute(quote_sql, q_params + [QUOTES_PER_PAGE, offset])
        quote_results = cur.fetchall()

        # 7. Format and Highlight
        for row in quote_results:
            row['time'] = format_timestamp(row['time'])
            for term in highlight_terms:
                pattern = re.compile(rf'(\b{re.escape(term)}\b)', re.IGNORECASE)
                row['content'] = pattern.sub(r'<span class="highlight">\1</span>', row['content'])
            
        total_pages = math.ceil(total_quotes / (QUOTES_PER_PAGE or 1))
        active_tab = requested_tab if requested_tab in ['Videos', 'Quotes'] else ('Quotes' if not video_results and quote_results else 'Videos')
    
    else:
        # Standard load for empty search
        cur.execute(f'SELECT * FROM video_catalog ORDER BY upload_date {order_sql};')
        video_results = cur.fetchall()
        active_tab = 'Videos'

    cur.close()
    conn.close()

    # Final tab logic for empty result states
    if requested_tab == 'Quotes':
        active_tab = 'Quotes' if (total_quotes > 0 or not video_results) else 'Videos'
    else:
        active_tab = 'Videos' if (video_results or not total_quotes > 0) else 'Quotes'
    
    return render_template('index.html', 
                           video_results=video_results, 
                           quote_results=quote_results, 
                           total_quotes=total_quotes, 
                           query=search_query, 
                           current_sort=sort_order, 
                           active_tab=active_tab, 
                           current_page=page, 
                           total_pages=total_pages,
                           )

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
    search_query = request.args.get('search', '').strip()
    sort_order = request.args.get('sort', 'newest')
    page = request.args.get('page', 1, type=int)
    offset = (page - 1) * VIDEOS_PER_PAGE
    order_sql = "DESC" if sort_order == "newest" else "ASC"

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if search_query:
        clean_query = re.escape(search_query)
        v_regex = f"\\y{clean_query}\\y"
        
        sql = f"""SELECT * FROM video_catalog 
                  WHERE title ~* %s 
                  ORDER BY upload_date {order_sql} 
                  LIMIT %s OFFSET %s;"""
        
        cur.execute(sql, (v_regex, VIDEOS_PER_PAGE, offset))
    else:
        sql = f"SELECT * FROM video_catalog ORDER BY upload_date {order_sql} LIMIT %s OFFSET %s;"
        cur.execute(sql, (VIDEOS_PER_PAGE, offset))

    videos = cur.fetchall()
    cur.close()
    conn.close()
    return {"videos": videos}

def find_occurance(words_list):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            pattern = '|'.join([re.escape(w) for w in words_list])
            regex = f'\\y({pattern})\\y'
            
            query = """
                SELECT COUNT(*) as total 
                FROM (
                    SELECT regexp_matches(content, %s, 'gi') 
                    FROM quotes
                ) as matches;
            """
            
            cur.execute(query, (regex,))
            result = cur.fetchone()
            return result['total'] if result else 0
    finally:
        conn.close()

@app.route('/api/stats')
def get_stats():
    return {
        "grem": find_occurance(GREM_WORDS),
        "cece": find_occurance(CECE_WORDS),
        "yaoi": find_occurance(YAOI_WORDS),
        "yippee": find_occurance(YIPPEE_WORDS),
        "league": find_occurance(LEAGUE_WORDS),
        "sixseven": find_occurance(SIXSEVEN_WORDS)
    }

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
    app.run(debug=True)