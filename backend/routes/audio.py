from flask import Blueprint, request, jsonify
import whisper
import os
import uuid
import subprocess
import logging

audio_bp = Blueprint("audio", __name__)
logger = logging.getLogger(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Load Whisper ONCE
logger.info("Loading Whisper model...")
model = whisper.load_model("base")
logger.info("Whisper model loaded")

@audio_bp.route("/upload", methods=["POST", "OPTIONS"])
def upload_audio():
    if request.method == "OPTIONS":
        return "", 200
    
    if "audio" not in request.files:
        return jsonify({"success": False, "error": "No audio file provided"}), 400

    audio_file = request.files["audio"]

    # Save raw file
    raw_name = f"{uuid.uuid4().hex}.webm"
    raw_path = os.path.join(UPLOAD_FOLDER, raw_name)
    audio_file.save(raw_path)

    logger.info(f"Audio saved: {raw_path}")

    # Convert to WAV
    wav_path = raw_path.replace(".webm", ".wav")

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", raw_path, "-ar", "16000", "-ac", "1", wav_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception:
        return jsonify({"success": False, "error": "FFmpeg conversion failed"}), 500

    # Whisper transcription
    try:
        logger.info(f"Starting transcription for {wav_path}")
        result = model.transcribe(
            wav_path,
            task="translate",   # ANY language → English
            language="en",
            fp16=False
        )

        transcript = result["text"].strip()
        logger.info(f"Transcription complete. Length: {len(transcript)} characters")
        
        if not transcript or len(transcript) == 0:
            logger.warning("Empty transcript received from Whisper")
            return jsonify({
                "success": False,
                "error": "No speech detected in the audio file. Please ensure the audio contains speech.",
                "transcript": ""
            }), 400
        
        if len(transcript) < 10:
            logger.warning(f"Very short transcript: {transcript}")

    except Exception as e:
        logger.error(f"Transcription error: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": f"Transcription failed: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "language": "English",
        "transcript": transcript,
        "summary": transcript,
        "transcript_length": len(transcript)
    }), 200
