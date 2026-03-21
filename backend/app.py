from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import psycopg2
from psycopg2.extras import RealDictCursor
import re
import math
import os
import json
import random
from queue import Queue
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

CORS(app, origins=[
    "https://gigiquotes.com", 
    "https://www.gigiquotes.com",
    "http://localhost:5173"
])

socketio = SocketIO(app, cors_allowed_origins="*")
active_stat_users = set()

# CORS(app, resources={r"/api/*": {"origins": "*"}}, allow_headers=["Content-Type"])

def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))

def serialize_row(row):
    result = dict(row)
    for key, val in result.items():
        if hasattr(val, 'isoformat'):
            result[key] = val.isoformat()
    return result

def strip_punctuation(text):
    """Remove punctuation from text, preserving spaces and commas (used as phrase separators)."""
    return re.sub(r"[^\w\s,]", "", text)

def phrases_to_tsquery(input_str, operator='&'):
    # Strip punctuation before processing
    input_str = strip_punctuation(input_str)
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
    # Strip punctuation so queries like "hello!" or "it's" match correctly
    phrase_input = strip_punctuation(phrase_input)
    
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

# A simple list of queues to broadcast updates to all connected SSE clients
subscribers = []

@app.route('/api/user/init', methods=['POST'])
def init_user():
    data = request.get_json()
    user_uuid = data.get('uuid')
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    cur.execute("SELECT * FROM users WHERE uuid = %s", (user_uuid,))
    user = cur.fetchone()
    
    if not user:
        default_name = f"grem-{user_uuid[:4]}"
        cur.execute(
            "INSERT INTO users (uuid, username, clicks, coins, inventory) VALUES (%s, %s, 0, 0, '[]') RETURNING *",
            (user_uuid, default_name)
        )
        user = cur.fetchone()
        conn.commit()
    
    conn.close()
    return jsonify(serialize_row(user))

@app.route('/api/user/update-username', methods=['POST'])
def update_username():
    data = request.get_json()
    user_uuid = data.get('uuid')
    new_username = data.get('username').strip()

    if not new_username or len(new_username) > 15:
        return jsonify({"error": "Choose another name!"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET username = %s WHERE uuid = %s", (new_username, user_uuid))
        conn.commit()
        return jsonify({"success": True, "username": new_username})
    except psycopg2.IntegrityError:
        return jsonify({"error": "Username already taken!"}), 400
    finally:
        conn.close()

@app.route('/api/clicker/increment', methods=['POST'])
def increment_bites():
    data = request.get_json()
    amount = data.get('amount', 1) 
    user_uuid = data.get('uuid')
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # 1. Get current data to calculate milestone
    cur.execute("SELECT clicks, coins, gacha_pulls, inventory FROM users WHERE uuid = %s", (user_uuid,))
    user = cur.fetchone()
    
    if not user:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    old_clicks = user['clicks']
    new_clicks = old_clicks + amount
    pulls_to_add = (new_clicks // 1000) - (old_clicks // 1000)

    # 2. Update with RETURNING to get fresh state
    if pulls_to_add > 0:
        cur.execute("""
            UPDATE users 
            SET clicks = %s, coins = coins + %s, gacha_pulls = gacha_pulls + %s 
            WHERE uuid = %s 
            RETURNING clicks, coins, gacha_pulls, inventory
        """, (new_clicks, amount, pulls_to_add, user_uuid))
    else:
        cur.execute("""
            UPDATE users 
            SET clicks = %s, coins = coins + %s 
            WHERE uuid = %s 
            RETURNING clicks, coins, gacha_pulls, inventory
        """, (new_clicks, amount, user_uuid))
    
    updated_user = cur.fetchone()
    conn.commit()
    conn.close()
    
    broadcast_update()

    # 3. Return the actual values saved in the DB
    return jsonify({ 
        'user_total': updated_user['clicks'], 
        'coins': updated_user['coins'], 
        'gacha_pulls_total': updated_user['gacha_pulls'], 
        'inventory': updated_user['inventory']
    })

def get_live_data():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get total and top 10 in one trip
    cur.execute("SELECT value FROM global_stats WHERE stat_name = 'total_clicks'")
    total = cur.fetchone()['value']
    
    cur.execute("SELECT username, clicks FROM users ORDER BY clicks DESC LIMIT 10")
    leaders = cur.fetchall()
    conn.close()

    return {
        'total_clicks': total,
        'leaderboard': leaders,
    }

def broadcast_update():
    """Notify all connected clients with the latest global state."""
    data = get_live_data()
    # Use a copy of the list to avoid 'size changed during iteration' errors
    for q in list(subscribers):
        try:
            q.put(data)
        except Exception:
            if q in subscribers:
                subscribers.remove(q)

@app.route('/api/clicker/stream/<user_uuid>')
def stream(user_uuid):
    def event_stream():
        q = Queue()
        
        # 1. Fetch username and add to global active dict
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE uuid = %s", (user_uuid,))
        row = cur.fetchone()
        conn.close()
        
        subscribers.append(q)
        
        # TRIGGER: Tell everyone a new player is here!
        broadcast_update() 

        try:
            while True:
                data = q.get() # Wait for a broadcast
                yield f"data: {json.dumps(data)}\n\n"
        finally:
            # CLEANUP: Remove them when they disconnect
            if q in subscribers:
                subscribers.remove(q)
            broadcast_update() # Notify others of the departure
            
    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/api/clicker/stats', methods=['GET'])
def get_clicker_stats():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT value FROM global_stats WHERE stat_name = 'total_clicks'")
    row = cur.fetchone()
    conn.close()
    return jsonify({'total_clicks': row['value'] if row else 0})

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT username, clicks FROM users ORDER BY clicks DESC LIMIT 10")
    leaders = cur.fetchall()
    conn.close()
    return jsonify(leaders)

@app.route('/api/shop/buy', methods=['POST'])
def buy_item():
    data = request.get_json()
    user_uuid = data.get('uuid')
    item_id = data.get('id')
    price = data.get('price')

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # 1. Fetch current coins and inventory
    cur.execute("SELECT coins, inventory FROM users WHERE uuid = %s", (user_uuid,))
    user = cur.fetchone()

    if not user:
        conn.close()
        return jsonify({"success": False, "error": "User not found"}), 404

    if user['coins'] < price:
        conn.close()
        return jsonify({"success": False, "error": "Not enough coins!"}), 400

    # 2. Update the inventory list
    # Ensure inventory is a list, then append the new item if not already owned
    current_inventory = list(user['inventory']) if user['inventory'] else []
    if item_id not in current_inventory:
        current_inventory.append(item_id)

    # 3. Save both the new balance and the updated inventory
    cur.execute(
        "UPDATE users SET coins = coins - %s, inventory = %s WHERE uuid = %s",
        (price, json.dumps(current_inventory), user_uuid)
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "inventory": current_inventory})

COSMETIC_POOL = [
    {"id": "hat_01", "name": "Party Hat", "rarity": "Common"},
    {"id": "aura_01", "name": "Glowing Aura", "rarity": "Rare"},
    {"id": "skin_01", "name": "Silver Grem", "rarity": "Epic"},
    {"id": "trail_01", "name": "Rainbow Trail", "rarity": "Legendary"}
]

@app.route('/api/gacha/roll', methods=['POST'])
def roll_gacha():
    data = request.get_json()
    user_uuid = data.get('uuid')
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    cur.execute("SELECT gacha_pulls, inventory FROM users WHERE uuid = %s", (user_uuid,))
    user = cur.fetchone()
    
    if not user or user['gacha_pulls'] < 1:
        conn.close()
        return jsonify({"success": False, "error": "No pulls available!"}), 400
        
    # Pick a random reward
    reward = random.choice(COSMETIC_POOL)
    new_inventory = list(user['inventory']) if user['inventory'] else []
    if reward['id'] not in new_inventory:
        new_inventory.append(reward['id'])
        
    cur.execute(
        "UPDATE users SET gacha_pulls = gacha_pulls - 1, inventory = %s WHERE uuid = %s",
        (json.dumps(new_inventory), user_uuid)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "reward": reward})

@socketio.on('send_message')
def handle_message(data):
    emit('chat_message', data, broadcast=True)

def emit_active_count():
    """Broadcast only the count of connected sockets."""
    socketio.emit('active_count_update', {'count': len(active_stat_users)})

@socketio.on('connect')
def handle_connect():
    active_stat_users.add(request.sid)
    emit_active_count()

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in active_stat_users:
        active_stat_users.remove(request.sid)
    emit_active_count()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
    socketio.run(app, port=5000)