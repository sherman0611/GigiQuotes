import asyncio
import json
import math
import os
import random
import re
from typing import Optional

import psycopg2
import socketio
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# Parameters
# ---------------------------------------------------------------------------
VIDEOS_PER_PAGE = 24
QUOTES_PER_PAGE = 10
GREM_WORDS = ["Grem", "Grems"]
CECE_WORDS = ["Cecilia", "Cece"]
YAOI_WORDS = ["Yaoi"]
YIPPEE_WORDS = ["Yippee"]
SIXSEVEN_WORDS = ["6 7", "Six Seven"]

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_headers=["Content-Type"],
    allow_methods=["*"],
)

# ---------------------------------------------------------------------------
# Socket.IO (ASGI) — used only for chat
# ---------------------------------------------------------------------------
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# ---------------------------------------------------------------------------
# SSE subscribers: dict keyed by user_uuid so we can push per-user payloads
# ---------------------------------------------------------------------------
# { user_uuid: [queue, queue, ...] }  (same user on multiple tabs → multiple queues)
subscribers: dict[str, list[asyncio.Queue]] = {}


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def serialize_row(row):
    result = dict(row)
    for key, val in result.items():
        if hasattr(val, "isoformat"):
            result[key] = val.isoformat()
    return result


def strip_punctuation(text: str) -> str:
    return re.sub(r"[^\w\s,]", "", text)


def phrases_to_tsquery(input_str: str, operator: str = "&") -> Optional[str]:
    input_str = strip_punctuation(input_str)
    segments = [s.strip() for s in input_str.split(",") if s.strip()]
    phrase_queries = []
    for seg in segments:
        words = [re.sub(r"[^\w]", "", w) for w in seg.split() if w.strip()]
        if words:
            phrase_queries.append(f"({' <-> '.join(words)})")
    if not phrase_queries:
        return None
    return f" {operator} ".join(phrase_queries)


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class InitUserRequest(BaseModel):
    uuid: str

class UpdateUsernameRequest(BaseModel):
    uuid: str
    username: str

class IncrementRequest(BaseModel):
    uuid: str
    amount: int = 1

class BuyItemRequest(BaseModel):
    uuid: str
    id: str
    price: int

class GachaRollRequest(BaseModel):
    uuid: str


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def get_global_data() -> dict:
    """Fetch data that is identical for every subscriber."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT value FROM global_stats WHERE stat_name = 'total_clicks'")
    total = cur.fetchone()["value"]
    cur.execute("SELECT username, clicks FROM users ORDER BY clicks DESC LIMIT 10")
    leaders = cur.fetchall()
    cur.close()
    conn.close()
    return {
        "total_clicks": total,
        "leaderboard": [dict(l) for l in leaders],
    }


def get_user_data(user_uuid: str) -> dict:
    """Fetch the personal stats for one user."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        "SELECT clicks, coins, gacha_pulls, inventory FROM users WHERE uuid = %s",
        (user_uuid,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return {}
    return {
        "user_clicks": row["clicks"],
        "user_coins": row["coins"],
        "user_gacha_pulls": row["gacha_pulls"],
        "user_inventory": row["inventory"],
    }


async def broadcast_update(target_uuid: str | None = None):
    """
    Push the latest state to SSE subscribers.

    - target_uuid=None  → global broadcast to everyone (e.g. after any click)
    - target_uuid=<id>  → also refreshes that user's personal payload
    """
    global_data = get_global_data()
    active_players = sum(len(qs) for qs in subscribers.values())

    for uuid, queues in list(subscribers.items()):
        # Build a payload: shared global data + per-user data for this uuid
        user_data = get_user_data(uuid) if uuid == target_uuid else {}
        payload = {
            **global_data,
            "active_players": active_players,
            **user_data,  # empty dict for other users — frontend ignores missing keys
        }
        for q in list(queues):
            try:
                await q.put(payload)
            except Exception:
                queues.remove(q)


# ---------------------------------------------------------------------------
# Routes — search / video / stats (unchanged)
# ---------------------------------------------------------------------------

@app.get("/api/search")
def search_api(
    search: str = Query(default=""),
    sort: str = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    quotes_only: bool = Query(default=False),
):
    search_query = search.strip()
    order_sql = "DESC" if sort == "newest" else "ASC"
    offset = (page - 1) * QUOTES_PER_PAGE

    id_match = re.search(r"([a-zA-Z0-9_-]{11})", search_query)
    id_filter = id_match.group(1) if id_match else None

    phrase_input = re.sub(r"([a-zA-Z0-9_-]{11})", "", search_query).strip().strip(",")
    phrase_input = strip_punctuation(phrase_input)
    ts_query_phrases = phrases_to_tsquery(phrase_input, "|")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    video_results = []
    if not quotes_only:
        v_conditions, v_params = [], []
        if id_filter:
            v_conditions.append("v.vod_id = %s")
            v_params.append(id_filter)
        elif ts_query_phrases:
            v_conditions.append("v.title_tsv @@ websearch_to_tsquery('simple', %s)")
            v_params.append(ts_query_phrases)

        v_where = ""
        if v_conditions:
            joiner = " AND " if id_filter else " OR "
            v_where = " WHERE " + joiner.join(v_conditions)

        cur.execute(
            f"SELECT * FROM video_catalog v {v_where} ORDER BY upload_date {order_sql}",
            v_params,
        )
        video_results = cur.fetchall()

    q_conditions, q_params = [], []
    if id_filter:
        q_conditions.append("v.vod_id = %s")
        q_params.append(id_filter)

    rank_alias = "1"
    if ts_query_phrases:
        q_conditions.append("q.content_tsv @@ websearch_to_tsquery('simple', %s)")
        q_params.append(ts_query_phrases)
        rank_alias = "ts_rank(q.content_tsv, websearch_to_tsquery('simple', %s))"
        q_params.insert(0, ts_query_phrases)

    q_where = " WHERE " + " AND ".join(q_conditions) if q_conditions else ""

    cur.execute(
        f"SELECT COUNT(*) FROM quotes q JOIN video_catalog v ON q.vod_id = v.vod_id {q_where}",
        q_params[1:] if ts_query_phrases else q_params,
    )
    total_quotes = cur.fetchone()["count"]

    quote_sql = f"""
        SELECT v.*, q.content, q.start_time as time, {rank_alias} as relevance
        FROM video_catalog v
        JOIN quotes q ON v.vod_id = q.vod_id
        {q_where}
        ORDER BY v.upload_date {order_sql}, relevance DESC
        LIMIT %s OFFSET %s
    """
    cur.execute(quote_sql, q_params + [QUOTES_PER_PAGE, offset])
    quote_results = cur.fetchall()

    cur.close()
    conn.close()

    return {
        "video_results": [serialize_row(r) for r in video_results],
        "quote_results": [serialize_row(r) for r in quote_results],
        "total_quotes": total_quotes,
        "total_pages": math.ceil(total_quotes / QUOTES_PER_PAGE),
    }


@app.get("/api/random-quotes")
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
    return {"quotes": [serialize_row(q) for q in random_quotes]}


@app.get("/api/video/{vod_id}")
def video_detail_api(vod_id: str):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM video_catalog WHERE vod_id = %s", (vod_id,))
    video = cur.fetchone()
    if not video:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Video not found")
    cur.execute("SELECT * FROM quotes WHERE vod_id = %s ORDER BY start_time ASC", (vod_id,))
    quotes = cur.fetchall()
    cur.close()
    conn.close()
    return {"video": serialize_row(video), "quotes": [serialize_row(q) for q in quotes]}


@app.get("/api/videos")
def get_videos_api(
    page: int = Query(default=1, ge=1),
    sort: str = Query(default="newest"),
):
    order_sql = "DESC" if sort == "newest" else "ASC"
    limit = 24
    offset = (page - 1) * limit
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        f"SELECT * FROM video_catalog ORDER BY upload_date {order_sql} LIMIT %s OFFSET %s",
        (limit, offset),
    )
    videos = cur.fetchall()
    cur.close()
    conn.close()
    return {"videos": [serialize_row(v) for v in videos]}


@app.get("/api/stats")
def get_stats():
    categories = {
        "grem": GREM_WORDS,
        "cece": CECE_WORDS,
        "yaoi": YAOI_WORDS,
        "yippee": YIPPEE_WORDS,
        "sixseven": SIXSEVEN_WORDS,
    }

    sql_parts, params = [], []
    for key, words in categories.items():
        pattern = "|".join([re.escape(w.lower()) for w in words])
        regex_pattern = f"\\y(?:{pattern})\\y"
        sql_parts.append(
            f"SUM(COALESCE(ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(LOWER(content), %s), 1) - 1, 0)) AS {key}"
        )
        params.append(regex_pattern)

    full_query = f"SELECT {', '.join(sql_parts)} FROM quotes;"

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(full_query, params)
            row = cur.fetchone()
            return {key: int(val or 0) for key, val in row.items()}
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# User routes
# ---------------------------------------------------------------------------

@app.post("/api/user/init")
def init_user(body: InitUserRequest):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE uuid = %s", (body.uuid,))
    user = cur.fetchone()
    if not user:
        default_name = f"grem-{body.uuid[:4]}"
        cur.execute(
            "INSERT INTO users (uuid, username, clicks, coins, inventory) VALUES (%s, %s, 0, 0, '[]') RETURNING *",
            (body.uuid, default_name),
        )
        user = cur.fetchone()
        conn.commit()
    cur.close()
    conn.close()
    return serialize_row(user)


@app.post("/api/user/update-username")
def update_username(body: UpdateUsernameRequest):
    new_username = body.username.strip()
    if not new_username or len(new_username) > 15:
        raise HTTPException(status_code=400, detail="Choose another name!")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET username = %s WHERE uuid = %s", (new_username, body.uuid))
        conn.commit()
        return {"success": True, "username": new_username}
    except psycopg2.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already taken!")
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# Clicker routes
# ---------------------------------------------------------------------------

@app.post("/api/clicker/increment")
async def increment_bites(body: IncrementRequest):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT clicks, coins, gacha_pulls, inventory FROM users WHERE uuid = %s", (body.uuid,))
    user = cur.fetchone()
    if not user:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    old_clicks = user["clicks"]
    new_clicks = old_clicks + body.amount
    pulls_to_add = (new_clicks // 1000) - (old_clicks // 1000)

    if pulls_to_add > 0:
        cur.execute(
            """
            UPDATE users
            SET clicks = %s, coins = coins + %s, gacha_pulls = gacha_pulls + %s
            WHERE uuid = %s
            RETURNING clicks, coins, gacha_pulls, inventory
            """,
            (new_clicks, body.amount, pulls_to_add, body.uuid),
        )
    else:
        cur.execute(
            """
            UPDATE users
            SET clicks = %s, coins = coins + %s
            WHERE uuid = %s
            RETURNING clicks, coins, gacha_pulls, inventory
            """,
            (new_clicks, body.amount, body.uuid),
        )

    cur.execute(
        "UPDATE global_stats SET value = value + %s WHERE stat_name = 'total_clicks'",
        (body.amount,),
    )

    conn.commit()
    cur.close()
    conn.close()

    # Broadcast global update AND push fresh personal stats to this user's stream
    await broadcast_update(target_uuid=body.uuid)

    return {"ok": True}


@app.get("/api/clicker/stream/{user_uuid}")
async def stream(user_uuid: str):
    """
    SSE stream per user. Each event carries:
      - total_clicks, leaderboard, active_players  (global — same for everyone)
      - user_clicks, user_coins, user_gacha_pulls, user_inventory  (personal)
    """
    q: asyncio.Queue = asyncio.Queue()

    # Register this queue under the user's uuid
    if user_uuid not in subscribers:
        subscribers[user_uuid] = []
    subscribers[user_uuid].append(q)

    # Send an immediate snapshot so the page doesn't wait for the first click
    global_data = get_global_data()
    user_data = get_user_data(user_uuid)
    active_players = sum(len(qs) for qs in subscribers.values())
    initial_payload = {**global_data, "active_players": active_players, **user_data}
    await q.put(initial_payload)

    # Also tell everyone else the active count just changed
    await broadcast_update()

    async def event_generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive comment — prevents proxies from closing the connection
                    yield ": keepalive\n\n"
        finally:
            # Clean up this queue on disconnect
            if user_uuid in subscribers:
                subscribers[user_uuid].remove(q)
                if not subscribers[user_uuid]:
                    del subscribers[user_uuid]
            # Notify everyone the active count dropped
            asyncio.create_task(broadcast_update())

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disables nginx buffering
        },
    )


@app.get("/api/clicker/stats")
def get_clicker_stats():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT value FROM global_stats WHERE stat_name = 'total_clicks'")
    row = cur.fetchone()
    cur.close()
    conn.close()
    return {"total_clicks": row["value"] if row else 0}


@app.get("/api/leaderboard")
def get_leaderboard():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT username, clicks FROM users ORDER BY clicks DESC LIMIT 10")
    leaders = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(l) for l in leaders]


# ---------------------------------------------------------------------------
# Shop
# ---------------------------------------------------------------------------

@app.post("/api/shop/buy")
def buy_item(body: BuyItemRequest):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT coins, inventory FROM users WHERE uuid = %s", (body.uuid,))
    user = cur.fetchone()
    if not user:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    if user["coins"] < body.price:
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Not enough coins!")

    current_inventory = list(user["inventory"]) if user["inventory"] else []
    if body.id not in current_inventory:
        current_inventory.append(body.id)

    cur.execute(
        "UPDATE users SET coins = coins - %s, inventory = %s WHERE uuid = %s",
        (body.price, json.dumps(current_inventory), body.uuid),
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"success": True, "inventory": current_inventory}


# ---------------------------------------------------------------------------
# Gacha
# ---------------------------------------------------------------------------

COSMETIC_POOL = [
    {"id": "hat_01",   "name": "Party Hat",      "rarity": "Common"},
    {"id": "aura_01",  "name": "Glowing Aura",   "rarity": "Rare"},
    {"id": "skin_01",  "name": "Silver Grem",    "rarity": "Epic"},
    {"id": "trail_01", "name": "Rainbow Trail",  "rarity": "Legendary"},
]


@app.post("/api/gacha/roll")
def roll_gacha(body: GachaRollRequest):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT gacha_pulls, inventory FROM users WHERE uuid = %s", (body.uuid,))
    user = cur.fetchone()
    if not user or user["gacha_pulls"] < 1:
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="No pulls available!")

    reward = random.choice(COSMETIC_POOL)
    new_inventory = list(user["inventory"]) if user["inventory"] else []
    if reward["id"] not in new_inventory:
        new_inventory.append(reward["id"])

    cur.execute(
        "UPDATE users SET gacha_pulls = gacha_pulls - 1, inventory = %s WHERE uuid = %s",
        (json.dumps(new_inventory), body.uuid),
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"success": True, "reward": reward}


# ---------------------------------------------------------------------------
# Socket.IO events — chat only
# ---------------------------------------------------------------------------

@sio.event
async def send_message(sid, data):
    await sio.emit("chat_message", data)