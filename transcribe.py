import os
import sys
import yt_dlp
from faster_whisper import WhisperModel
import whisper_s2t

# Cuda target path fix
target_path = "/home/sherm/GigiQuotes/.venv/lib/python3.12/site-packages/nvidia/cudnn/lib"
if target_path not in os.environ.get("LD_LIBRARY_PATH", ""):
    os.environ["LD_LIBRARY_PATH"] = target_path + ":" + os.environ.get("LD_LIBRARY_PATH", "")
    os.execv(sys.executable, [sys.executable] + sys.argv)

# Set paths
AUDIO_DIR = "../audio_cache"

# def transcribe_with_faster_whisper():
#     print("--- Starting Faster-Whisper ---")
#     # Model: "base", "small", "medium", or "large-v3"
#     # Device: Use "cuda" if you have an NVIDIA GPU, else "cpu"
#     model = WhisperModel("small", device="cuda", compute_type="float16")
    
#     # vad_filter=True helps ignore background noise/music
#     segments, info = model.transcribe(AUDIO_PATH, beam_size=5, vad_filter=True)
    
#     results = []
#     for s in segments:
#         results.append({
#             "start": round(s.start, 2),
#             "end": round(s.end, 2),
#             "text": s.text.strip()
#         })
#         print(f"[{s.start:.2f}s] {s.text}")
#     return results

def download_audio(video_id):
    """Downloads audio from YouTube URL and saves as WAV and returns (path, success_boolean)."""
    url = f"https://www.youtube.com/watch?v={video_id}"

    print(f"[→] Downloading audio...")
    
    os.makedirs(AUDIO_DIR, exist_ok=True)
    audio_path = os.path.join(AUDIO_DIR, f"{video_id}.wav")

    #Clear old file if it exists to avoid confusion
    if os.path.exists(audio_path):
        os.remove(audio_path)

    # Filter function to skip live/upcoming content
    def live_filter(info_dict, *, incomplete):
        status = info_dict.get('live_status')
        if status in ['is_live', 'is_upcoming']:
            return f"Skipping: Video is currently {status}"
        return None

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(AUDIO_DIR, video_id),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
        }],
        'postprocessor_args': [
            '-ar', '16000', # sample rate for better transcription accuracy
            '-ac', '1' # mono channel for better transcription accuracy
        ],
        'match_filter': live_filter,
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # ydl.download returns 0 on success
            exit_code = ydl.download([url])
            
            if exit_code == 0 and os.path.exists(audio_path):
                print(f"Download Success: {audio_path}")
                return audio_path
            else:
                print(f"Download Failed: yt-dlp returned code {exit_code}")
                return None

    except Exception as e:
        return None

def transcribe_with_whisper_s2t(audio_path):
    print("\n--- Starting Whisper-S2T (Optimized Pipeline) ---")
    model = whisper_s2t.load_model(model_identifier="small", device="cuda", compute_type="float16")
    
    # Use the downloaded audio path
    out = model.transcribe_with_vad(
        [audio_path], 
        lang_codes=['en'], 
        tasks=['transcribe'], 
        batch_size=16
    )
    
    results = []
    for segment in out[0]:
        results.append({
            "start": float(segment['start_time']),
            "end": float(segment['end_time']),
            "text": str(segment['text']).strip()
        })
    return results