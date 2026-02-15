from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from bson import ObjectId
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import base64
import io
import json
from openai import OpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# GridFS for video storage
fs_bucket = AsyncIOMotorGridFSBucket(db)

# OpenAI client - use direct OpenAI API key
openai_api_key = os.environ.get('OPENAI_API_KEY', '')
openai_client = OpenAI(api_key=openai_api_key) if openai_api_key else None

# Whisper client is same as main client now
whisper_client = openai_client

# Create the main app
app = FastAPI(title="XoW Expo Recording System")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class DeviceLogin(BaseModel):
    device_id: str
    password: str

class DeviceCreate(BaseModel):
    device_id: str
    password: str
    name: str

class Device(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class RecordingCreate(BaseModel):
    device_id: str
    expo_name: Optional[str] = "Default Expo"
    booth_name: Optional[str] = "Default Booth"

class Recording(BaseModel):
    id: str
    device_id: str
    expo_name: str
    booth_name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: Optional[float] = None
    status: str = "recording"  # recording, completed, uploaded, processed
    has_video: bool = False
    has_audio: bool = False
    transcript: Optional[str] = None
    translated_transcript: Optional[str] = None
    summary: Optional[str] = None
    highlights: List[Dict[str, Any]] = []
    barcode_scans: List[Dict[str, Any]] = []

class BarcodeScan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    recording_id: str
    barcode_data: str
    visitor_name: Optional[str] = None
    scan_time: datetime = Field(default_factory=datetime.utcnow)
    video_timestamp: Optional[float] = None  # seconds from start of recording

class BarcodeScanCreate(BaseModel):
    recording_id: str
    barcode_data: str
    visitor_name: Optional[str] = None
    video_timestamp: Optional[float] = None
    frame_code: Optional[int] = None

class TranscriptRequest(BaseModel):
    recording_id: str
    target_language: str = "en"

class DashboardInsight(BaseModel):
    total_recordings: int
    total_visitors: int
    total_duration_hours: float
    top_topics: List[str]
    recent_activity: List[Dict[str, Any]]

# ==================== HELPER FUNCTIONS ====================

def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    doc['id'] = str(doc.pop('_id'))
    # Handle nested ObjectIds
    if 'barcode_scans' in doc and doc['barcode_scans']:
        doc['barcode_scans'] = [
            {k: str(v) if isinstance(v, ObjectId) else v for k, v in scan.items()}
            for scan in doc['barcode_scans']
        ]
    return doc

async def transcribe_audio(audio_data: bytes) -> str:
    """Transcribe audio using OpenAI Whisper"""
    # Check if Whisper client is available
    if not whisper_client:
        logger.warning("Whisper API not configured - OPENAI_API_KEY not set. Audio transcription unavailable.")
        return ""
    
    try:
        # Create a temporary file-like object
        audio_file = io.BytesIO(audio_data)
        audio_file.name = "audio.webm"
        
        response = whisper_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text"
        )
        return response
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return ""

async def translate_text(text: str, target_language: str = "en") -> str:
    """Translate text using GPT"""
    if not text or target_language == "en":
        return text
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": f"You are a translator. Translate the following text to {target_language}. Only return the translation, nothing else."},
                {"role": "user", "content": text}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text

async def summarize_text(text: str) -> Dict[str, Any]:
    """Summarize conversation text using GPT and extract highlights"""
    if not text:
        return {"summary": "", "highlights": []}
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": """You are an AI assistant analyzing expo booth conversations. 
                Analyze the transcript and provide:
                1. A concise summary (2-3 sentences)
                2. Key highlights/topics discussed (as a list)
                3. Notable visitor interests or questions
                
                Return as JSON format:
                {
                    "summary": "...",
                    "highlights": ["highlight1", "highlight2", ...],
                    "visitor_interests": ["interest1", "interest2", ...],
                    "key_questions": ["question1", "question2", ...]
                }"""},
                {"role": "user", "content": f"Transcript:\n{text}"}
            ],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"Summarization error: {e}")
        return {"summary": "", "highlights": []}

async def detect_conversations(text: str, total_duration: float = 0) -> List[Dict[str, Any]]:
    """Detect and segment individual conversations from transcript using GPT"""
    if not text:
        return []
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": f"""You are an AI analyzing expo booth recordings. The total recording duration is approximately {total_duration} seconds.
                
Your task is to identify SEPARATE conversations/interactions between booth staff and visitors.

For each conversation segment, provide:
1. A brief title/topic of the conversation
2. Who the speakers appear to be (e.g., "Staff", "Visitor 1", "Visitor 2")
3. Estimated start time as a percentage of the recording (0-100)
4. A 1-2 sentence summary of what was discussed
5. Key points or interests expressed
6. Sentiment (positive, neutral, interested, skeptical)

Return as JSON:
{{
    "conversations": [
        {{
            "id": 1,
            "title": "Product Demo Discussion",
            "speakers": ["Staff", "Visitor"],
            "start_percent": 0,
            "end_percent": 25,
            "summary": "...",
            "key_points": ["point1", "point2"],
            "sentiment": "interested",
            "excerpt": "brief quote from conversation"
        }}
    ],
    "total_interactions": 3,
    "main_topics": ["topic1", "topic2"]
}}

If you cannot clearly distinguish separate conversations, create logical segments based on topic changes."""},
                {"role": "user", "content": f"Transcript:\n{text}"}
            ],
            response_format={"type": "json_object"}
        )
        result = json.loads(response.choices[0].message.content)
        
        # Convert percentages to actual timestamps
        conversations = result.get('conversations', [])
        for conv in conversations:
            conv['start_time'] = (conv.get('start_percent', 0) / 100) * total_duration
            conv['end_time'] = (conv.get('end_percent', 100) / 100) * total_duration
        
        return {
            "conversations": conversations,
            "total_interactions": result.get('total_interactions', len(conversations)),
            "main_topics": result.get('main_topics', [])
        }
    except Exception as e:
        logger.error(f"Conversation detection error: {e}")
        return {"conversations": [], "total_interactions": 0, "main_topics": []}

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register_device(device: DeviceCreate):
    """Register a new device"""
    # Check if device already exists
    existing = await db.devices.find_one({"device_id": device.device_id})
    if existing:
        raise HTTPException(status_code=400, detail="Device ID already registered")
    
    device_doc = {
        "device_id": device.device_id,
        "password": device.password,  # In production, hash this
        "name": device.name,
        "created_at": datetime.utcnow(),
        "is_active": True
    }
    result = await db.devices.insert_one(device_doc)
    device_doc['_id'] = result.inserted_id
    return serialize_doc(device_doc)

@api_router.post("/auth/login")
async def login_device(login: DeviceLogin):
    """Login a device"""
    device = await db.devices.find_one({
        "device_id": login.device_id,
        "password": login.password
    })
    
    if not device:
        raise HTTPException(status_code=401, detail="Invalid device ID or password")
    
    return {
        "success": True,
        "device": serialize_doc(device),
        "message": "Login successful"
    }

# ==================== RECORDING ENDPOINTS ====================

@api_router.post("/recordings")
async def create_recording(recording: RecordingCreate):
    """Start a new recording session"""
    recording_doc = {
        "device_id": recording.device_id,
        "expo_name": recording.expo_name,
        "booth_name": recording.booth_name,
        "start_time": datetime.utcnow(),
        "end_time": None,
        "duration": None,
        "status": "recording",
        "has_video": False,
        "has_audio": False,
        "video_file_id": None,
        "audio_file_id": None,
        "transcript": None,
        "translated_transcript": None,
        "summary": None,
        "highlights": [],
        "barcode_scans": []
    }
    result = await db.recordings.insert_one(recording_doc)
    recording_doc['_id'] = result.inserted_id
    return serialize_doc(recording_doc)

@api_router.get("/recordings")
async def get_recordings(device_id: Optional[str] = None, limit: int = 50):
    """Get all recordings, optionally filtered by device"""
    query = {}
    if device_id:
        query["device_id"] = device_id
    
    recordings = await db.recordings.find(query).sort("start_time", -1).limit(limit).to_list(limit)
    return [serialize_doc(r) for r in recordings]

@api_router.get("/recordings/{recording_id}")
async def get_recording(recording_id: str):
    """Get a specific recording"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        return serialize_doc(recording)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/recordings/{recording_id}/complete")
async def complete_recording(recording_id: str):
    """Mark a recording as completed"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        end_time = datetime.utcnow()
        duration = (end_time - recording['start_time']).total_seconds()
        
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "end_time": end_time,
                "duration": duration,
                "status": "completed"
            }}
        )
        
        updated = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        return serialize_doc(updated)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/recordings/{recording_id}")
async def delete_recording(recording_id: str):
    """Delete a recording and its associated files"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        # Delete video file from GridFS if exists
        if recording.get('video_file_id'):
            try:
                await fs_bucket.delete(ObjectId(recording['video_file_id']))
            except Exception as e:
                logger.warning(f"Failed to delete video file: {e}")
        
        # Delete audio file from GridFS if exists
        if recording.get('audio_file_id'):
            try:
                await fs_bucket.delete(ObjectId(recording['audio_file_id']))
            except Exception as e:
                logger.warning(f"Failed to delete audio file: {e}")
        
        # Delete associated barcode scans
        await db.barcode_scans.delete_many({"recording_id": recording_id})
        
        # Delete video chunks if any
        await db.video_chunks.delete_many({"recording_id": recording_id})
        
        # Delete the recording document
        await db.recordings.delete_one({"_id": ObjectId(recording_id)})
        
        return {"success": True, "message": "Recording deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/recordings/{recording_id}/reprocess")
async def reprocess_recording(recording_id: str, background_tasks: BackgroundTasks):
    """Re-process a recording that had errors"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        if not recording.get('audio_file_id'):
            raise HTTPException(status_code=400, detail="No audio file found for this recording")
        
        # Reset status to processing
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "processing"}}
        )
        
        # Start background processing
        background_tasks.add_task(process_transcription, recording_id)
        
        return {"success": True, "message": "Reprocessing started", "status": "processing"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class ManualTranscriptRequest(BaseModel):
    transcript: str

@api_router.post("/recordings/{recording_id}/manual-transcript")
async def add_manual_transcript(recording_id: str, request: ManualTranscriptRequest, background_tasks: BackgroundTasks):
    """Add a manual transcript and trigger AI analysis"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        # Update with manual transcript
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"transcript": request.transcript, "status": "processing"}}
        )
        
        # Trigger AI analysis in background
        background_tasks.add_task(process_transcript_analysis, recording_id, request.transcript)
        
        return {"success": True, "message": "Transcript added, AI analysis started"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

async def process_transcript_analysis(recording_id: str, transcript: str):
    """Process transcript with AI for summarization and conversation detection"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            return
        
        duration = recording.get('duration', 0) or 0
        
        # Summarize
        analysis = await summarize_text(transcript)
        
        # Detect and segment conversations
        conversation_data = await detect_conversations(transcript, duration)
        
        # Match barcode scans to conversations
        barcode_scans = recording.get('barcode_scans', []) or []
        conversations = conversation_data.get('conversations', []) if isinstance(conversation_data, dict) else []
        
        for conv in conversations:
            if isinstance(conv, dict):
                conv_start = conv.get('start_time', 0) or 0
                conv_end = conv.get('end_time', duration) or duration
                matching_barcodes = []
                for scan in barcode_scans:
                    if isinstance(scan, dict):
                        scan_ts = scan.get('video_timestamp', 0) or 0
                        if conv_start - 5 <= scan_ts <= conv_end + 5:
                            matching_barcodes.append(scan.get('barcode_data', ''))
                conv['associated_barcodes'] = matching_barcodes
        
        # Update recording
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "summary": analysis.get('summary', '') if isinstance(analysis, dict) else '',
                "highlights": analysis.get('highlights', []) if isinstance(analysis, dict) else [],
                "visitor_interests": analysis.get('visitor_interests', []) if isinstance(analysis, dict) else [],
                "key_questions": analysis.get('key_questions', []) if isinstance(analysis, dict) else [],
                "conversations": conversations,
                "total_interactions": conversation_data.get('total_interactions', 0) if isinstance(conversation_data, dict) else 0,
                "main_topics": conversation_data.get('main_topics', []) if isinstance(conversation_data, dict) else [],
                "status": "processed"
            }}
        )
        
        logger.info(f"Manual transcript analysis completed for recording {recording_id}")
    except Exception as e:
        logger.error(f"Manual transcript analysis error: {e}")
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "error", "error_message": str(e)}}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/recordings/{recording_id}/upload-video")
async def upload_video(
    recording_id: str,
    video: UploadFile = File(...),
    chunk_index: int = Form(0),
    total_chunks: int = Form(1)
):
    """Upload video file for a recording (supports chunked uploads)"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        video_data = await video.read()
        
        if total_chunks == 1:
            # Single upload - store directly
            video_id = await fs_bucket.upload_from_stream(
                f"video_{recording_id}.webm",
                io.BytesIO(video_data),
                metadata={"recording_id": recording_id, "type": "video"}
            )
            
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {
                    "video_file_id": str(video_id),
                    "has_video": True,
                    "status": "uploaded"
                }}
            )
        else:
            # Chunked upload - store chunk
            await db.video_chunks.insert_one({
                "recording_id": recording_id,
                "chunk_index": chunk_index,
                "total_chunks": total_chunks,
                "data": base64.b64encode(video_data).decode('utf-8'),
                "uploaded_at": datetime.utcnow()
            })
            
            # Check if all chunks uploaded
            chunks_count = await db.video_chunks.count_documents({"recording_id": recording_id})
            if chunks_count == total_chunks:
                # Combine chunks
                chunks = await db.video_chunks.find(
                    {"recording_id": recording_id}
                ).sort("chunk_index", 1).to_list(total_chunks)
                
                combined_data = b''.join([
                    base64.b64decode(c['data']) for c in chunks
                ])
                
                video_id = await fs_bucket.upload_from_stream(
                    f"video_{recording_id}.webm",
                    io.BytesIO(combined_data),
                    metadata={"recording_id": recording_id, "type": "video"}
                )
                
                await db.recordings.update_one(
                    {"_id": ObjectId(recording_id)},
                    {"$set": {
                        "video_file_id": str(video_id),
                        "has_video": True,
                        "status": "uploaded"
                    }}
                )
                
                # Clean up chunks
                await db.video_chunks.delete_many({"recording_id": recording_id})
        
        return {"success": True, "message": f"Chunk {chunk_index + 1}/{total_chunks} uploaded"}
    except Exception as e:
        logger.error(f"Video upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/recordings/{recording_id}/upload-audio")
async def upload_audio(recording_id: str, audio: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    """Upload audio file for a recording and automatically trigger transcription"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        audio_data = await audio.read()
        
        audio_id = await fs_bucket.upload_from_stream(
            f"audio_{recording_id}.webm",
            io.BytesIO(audio_data),
            metadata={"recording_id": recording_id, "type": "audio"}
        )
        
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "audio_file_id": str(audio_id),
                "has_audio": True,
                "status": "processing"
            }}
        )
        
        # Automatically trigger transcription and AI analysis
        if background_tasks:
            background_tasks.add_task(process_transcription_with_diarization, recording_id)
        
        return {"success": True, "audio_id": str(audio_id), "message": "Audio uploaded, transcription started automatically"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/recordings/{recording_id}/video")
async def get_video(recording_id: str):
    """Stream video file"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording or not recording.get('video_file_id'):
            raise HTTPException(status_code=404, detail="Video not found")
        
        grid_out = await fs_bucket.open_download_stream(ObjectId(recording['video_file_id']))
        
        async def stream_video():
            while True:
                chunk = await grid_out.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                yield chunk
        
        return StreamingResponse(
            stream_video(),
            media_type="video/webm",
            headers={"Content-Disposition": f"inline; filename=video_{recording_id}.webm"}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/recordings/{recording_id}/audio")
async def get_audio(recording_id: str):
    """Stream audio file"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording or not recording.get('audio_file_id'):
            raise HTTPException(status_code=404, detail="Audio not found")
        
        grid_out = await fs_bucket.open_download_stream(ObjectId(recording['audio_file_id']))
        
        async def stream_audio():
            while True:
                chunk = await grid_out.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                yield chunk
        
        return StreamingResponse(
            stream_audio(),
            media_type="audio/webm",
            headers={"Content-Disposition": f"inline; filename=audio_{recording_id}.webm"}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/recordings/{recording_id}/status")
async def get_recording_status(recording_id: str):
    """Get recording processing status"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        return {
            "id": recording_id,
            "status": recording.get('status', 'unknown'),
            "has_audio": recording.get('has_audio', False),
            "has_video": recording.get('has_video', False),
            "has_transcript": bool(recording.get('transcript')),
            "has_summary": bool(recording.get('summary')),
            "total_conversations": len(recording.get('conversations', []))
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== BARCODE ENDPOINTS ====================

@api_router.post("/barcodes")
async def create_barcode_scan(scan: BarcodeScanCreate):
    """Log a barcode scan"""
    scan_doc = {
        "recording_id": scan.recording_id,
        "barcode_data": scan.barcode_data,
        "visitor_name": scan.visitor_name,
        "scan_time": datetime.utcnow(),
        "video_timestamp": scan.video_timestamp,
        "frame_code": scan.frame_code
    }
    result = await db.barcode_scans.insert_one(scan_doc)
    
    # Also update the recording's barcode_scans array
    await db.recordings.update_one(
        {"_id": ObjectId(scan.recording_id)},
        {"$push": {"barcode_scans": scan_doc}}
    )
    
    scan_doc['_id'] = result.inserted_id
    return serialize_doc(scan_doc)

@api_router.get("/barcodes/{recording_id}")
async def get_barcode_scans(recording_id: str):
    """Get all barcode scans for a recording"""
    scans = await db.barcode_scans.find({"recording_id": recording_id}).to_list(1000)
    return [serialize_doc(s) for s in scans]

# ==================== TRANSCRIPTION ENDPOINTS ====================

@api_router.post("/recordings/{recording_id}/transcribe")
async def transcribe_recording(recording_id: str, background_tasks: BackgroundTasks):
    """Transcribe and analyze a recording"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        if not recording.get('audio_file_id'):
            raise HTTPException(status_code=400, detail="No audio file found for this recording")
        
        # Start background processing
        background_tasks.add_task(process_transcription, recording_id)
        
        return {"success": True, "message": "Transcription started", "status": "processing"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

async def process_transcription(recording_id: str):
    """Background task to process transcription"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            logger.error(f"Recording not found: {recording_id}")
            return
        
        # Download audio
        try:
            grid_out = await fs_bucket.open_download_stream(ObjectId(recording['audio_file_id']))
            audio_data = await grid_out.read()
        except Exception as e:
            logger.error(f"Failed to download audio: {e}")
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {"status": "error", "error_message": "Failed to download audio file"}}
            )
            return
        
        # Transcribe
        transcript = await transcribe_audio(audio_data)
        
        # Get duration for conversation detection
        duration = recording.get('duration', 0) or 0
        
        # If transcript is empty, still mark as processed but skip AI analysis
        if not transcript or transcript.strip() == "":
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {
                    "transcript": "",
                    "summary": "No speech detected in audio",
                    "highlights": [],
                    "conversations": [],
                    "status": "processed"
                }}
            )
            logger.info(f"No speech detected for recording {recording_id}")
            return
        
        # Summarize
        analysis = await summarize_text(transcript)
        
        # Detect and segment conversations
        conversation_data = await detect_conversations(transcript, duration)
        
        # Match barcode scans to conversations
        barcode_scans = recording.get('barcode_scans', [])
        if barcode_scans is None:
            barcode_scans = []
        
        conversations = []
        if isinstance(conversation_data, dict):
            conversations = conversation_data.get('conversations', [])
        
        for conv in conversations:
            if isinstance(conv, dict):
                conv_start = conv.get('start_time', 0) or 0
                conv_end = conv.get('end_time', duration) or duration
                # Find barcodes scanned during this conversation
                matching_barcodes = []
                for scan in barcode_scans:
                    if isinstance(scan, dict):
                        scan_ts = scan.get('video_timestamp', 0) or 0
                        if conv_start - 5 <= scan_ts <= conv_end + 5:
                            matching_barcodes.append(scan.get('barcode_data', ''))
                conv['associated_barcodes'] = matching_barcodes
        
        # Update recording
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "transcript": transcript,
                "summary": analysis.get('summary', '') if isinstance(analysis, dict) else '',
                "highlights": analysis.get('highlights', []) if isinstance(analysis, dict) else [],
                "visitor_interests": analysis.get('visitor_interests', []) if isinstance(analysis, dict) else [],
                "key_questions": analysis.get('key_questions', []) if isinstance(analysis, dict) else [],
                "conversations": conversations,
                "total_interactions": conversation_data.get('total_interactions', 0) if isinstance(conversation_data, dict) else 0,
                "main_topics": conversation_data.get('main_topics', []) if isinstance(conversation_data, dict) else [],
                "status": "processed"
            }}
        )
        
        logger.info(f"Transcription completed for recording {recording_id}")
    except Exception as e:
        logger.error(f"Transcription processing error: {e}")
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "error", "error_message": str(e)}}
        )

@api_router.post("/recordings/{recording_id}/translate")
async def translate_recording(recording_id: str, target_language: str = "en"):
    """Translate a recording's transcript"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        if not recording.get('transcript'):
            raise HTTPException(status_code=400, detail="No transcript found")
        
        translated = await translate_text(recording['transcript'], target_language)
        
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"translated_transcript": translated}}
        )
        
        return {"success": True, "translated_transcript": translated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== DASHBOARD ENDPOINTS ====================

@api_router.get("/dashboard/insights")
async def get_dashboard_insights():
    """Get overall dashboard insights"""
    try:
        # Total recordings
        total_recordings = await db.recordings.count_documents({})
        
        # Total visitors (unique barcode scans)
        pipeline = [
            {"$group": {"_id": "$barcode_data"}},
            {"$count": "total"}
        ]
        visitor_result = await db.barcode_scans.aggregate(pipeline).to_list(1)
        total_visitors = visitor_result[0]['total'] if visitor_result else 0
        
        # Total duration
        pipeline = [
            {"$match": {"duration": {"$ne": None}}},
            {"$group": {"_id": None, "total_duration": {"$sum": "$duration"}}}
        ]
        duration_result = await db.recordings.aggregate(pipeline).to_list(1)
        total_duration_hours = (duration_result[0]['total_duration'] / 3600) if duration_result else 0
        
        # Get top topics from highlights
        pipeline = [
            {"$unwind": "$highlights"},
            {"$group": {"_id": "$highlights", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        topics_result = await db.recordings.aggregate(pipeline).to_list(10)
        top_topics = [t['_id'] for t in topics_result]
        
        # Recent activity
        recent = await db.recordings.find().sort("start_time", -1).limit(5).to_list(5)
        recent_activity = [serialize_doc(r) for r in recent]
        
        return {
            "total_recordings": total_recordings,
            "total_visitors": total_visitors,
            "total_duration_hours": round(total_duration_hours, 2),
            "top_topics": top_topics,
            "recent_activity": recent_activity
        }
    except Exception as e:
        logger.error(f"Dashboard insights error: {e}")
        return {
            "total_recordings": 0,
            "total_visitors": 0,
            "total_duration_hours": 0,
            "top_topics": [],
            "recent_activity": []
        }

@api_router.get("/dashboard/recordings")
async def get_dashboard_recordings(
    expo_name: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50
):
    """Get recordings for dashboard with filters"""
    query = {}
    if expo_name:
        query["expo_name"] = expo_name
    if status:
        query["status"] = status
    
    recordings = await db.recordings.find(query).sort("start_time", -1).limit(limit).to_list(limit)
    
    result = []
    for r in recordings:
        rec = serialize_doc(r)
        # Get barcode scans count
        scans_count = await db.barcode_scans.count_documents({"recording_id": rec['id']})
        rec['scans_count'] = scans_count
        result.append(rec)
    
    return result

@api_router.get("/dashboard/visitors")
async def get_visitors(recording_id: Optional[str] = None):
    """Get visitors with their scan times"""
    query = {}
    if recording_id:
        query["recording_id"] = recording_id
    
    scans = await db.barcode_scans.find(query).sort("scan_time", -1).to_list(1000)
    return [serialize_doc(s) for s in scans]

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "XoW Expo Recording System API", "status": "online"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router in the main app
app.include_router(api_router)

# Serve dashboard
@app.get("/api/dashboard")
async def serve_dashboard():
    return FileResponse(ROOT_DIR / "static" / "dashboard.html")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
