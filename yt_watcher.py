import os
from googleapiclient.discovery import build
import backend.database as db
import transcribe as tc
import yt_dlp

CHANNEL_ID = 'UCDHABijvPBnJm7F-KlNME3w'
CHANNEL_URL = 'https://www.youtube.com/@holoen_gigimurin/streams'

def get_all_video_metadata(limit=None):
    """
    Returns a list of videos (id, title, thumbnail, upload_date).
    :param limit: Integer for 'n' most recent videos, or None for all videos.
    """
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'ignoreerrors': True,  # Skip member-only videos instead of crashing
    }

    # If a limit is provided, set the playlist_items range
    if limit:
        ydl_opts['playlist_items'] = f'1-{limit}'

    if limit:
        print(f"Extracting most recent {limit} videos from channel...")
    else:
        print("Extracting all videos from channel...")

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info_dict = ydl.extract_info(CHANNEL_URL, download=False)
            
            video_list = []
            for entry in info_dict.get('entries', []):
                if not entry:
                    continue
                
                # --- LIVE STREAM FILTER ---
                # 'is_live' is often a boolean; 'live_status' can be 'is_live'
                if entry.get('is_live') is True or entry.get('live_status') == 'is_live':
                    print(f"[!] SKIPPED Currently live stream: {entry.get('title')}")
                    continue

                video_data = {
                    'id': entry.get('id'),
                    'title': entry.get('title'),
                    'thumbnail': entry.get('thumbnail'),
                    'upload_date': entry.get('upload_date'),
                }

                video_list.append(video_data)

            print(f"Extracted metadata for {len(video_list)} most recent videos.")
            return video_list

        except Exception as e:
            return f"An error occurred: {e}"

def check_and_process(limit=None):
    videos = get_all_video_metadata(limit=limit)

    conn = db.connect()
    cur = conn.cursor()

    for video in videos:
        print(f"NOW CHECKING: {video['title']}")
        video_id = video['id']

        # Check if we already have this Video ID in our database
        cur.execute("SELECT 1 FROM video_catalog WHERE vod_id = %s LIMIT 1", (video_id,))
        if cur.fetchone():
            print(f"[!] Video already exists in database")
        else:
            db.save_vod_metadata([video])

        # Check if video .wav file exists in cache before downloading
        file_name = f"{video_id}.wav"
        file_path = os.path.join("audio_cache", file_name)

        if os.path.exists(file_path):
            print(f"[!] Audio already exists in audio_cache: {file_name}")
            audio_path = file_path
        else:
            audio_path = tc.download_audio(video_id)

        # Proceed to Transcription
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'quotes'
            );
        """)
        table_exists = cur.fetchone()[0]

        transcription_exists = False
        if table_exists:
            cur.execute("SELECT 1 FROM quotes WHERE vod_id = %s LIMIT 1", (video_id,))
            if cur.fetchone():
                transcription_exists = True

        if transcription_exists:
            print(f"[!] Transcription already exists in database")
        else:
            quotes = tc.transcribe_with_whisper_s2t(audio_path)
            db.save_transcriptions(quotes, video_id)

    cur.close()
    conn.close()

if __name__ == "__main__":
    check_and_process(limit=5)
    # check_and_process(limit=20)
    
    # Fetch all video metadata and save to database (for initial sync or testing)
    # extracted_data = get_all_video_metadata()
    # db.save_vod_metadata(extracted_data)