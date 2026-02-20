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

def check_and_process_from_db():
    """
    Fetches videos already saved in the database and 
    processes audio/transcription if they are missing.
    """
    conn = db.connect()
    cur = conn.cursor()

    # 1. Fetch metadata directly from your video_catalog table
    # Based on your image, columns are: vod_id, title, thumbnail, upload_date
    cur.execute("SELECT vod_id, title FROM video_catalog ORDER BY upload_date DESC")
    videos = cur.fetchall()

    for video_id, title in videos:
        print(f"--- PROCESSING: {title} ({video_id}) ---")

        cur.execute("SELECT 1 FROM quotes WHERE vod_id = %s LIMIT 1", (video_id,))
        # Skip video if transcriptions exists in database
        if cur.fetchone():
            print(f"[!] Transcription already exists in database. Skipping.")
            continue

        # Handle Audio Cache
        file_name = f"{title}.wav"
        file_path = os.path.join("audio_cache", file_name)

        if os.path.exists(file_path):
            print(f"[!] Audio already exists in cache: {title}")
            audio_path = file_path
        else:
            audio_path = tc.download_audio(video_id)

        # Process transcriptions
        print(f"[→] Transcribing...")
        try:
            quotes = tc.transcribe_with_whisper_s2t(audio_path)
            db.save_transcriptions(quotes, video_id)
            print(f"  [+] Successfully saved quotes for: {title}")
        except Exception as e:
            print(f"  [X] Failed to transcribe {video_id}: {e}")
            

    cur.close()
    conn.close()

if __name__ == "__main__":
    # Fetch all video metadata and save to database (for initial sync or testing)
    # extracted_data = get_all_video_metadata(limit=20)
    # db.save_vod_metadata(extracted_data)

    check_and_process_from_db()