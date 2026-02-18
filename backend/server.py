from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse, Response
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
from datetime import datetime, timedelta
import base64
import io
import json
import subprocess
import tempfile
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

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class DeviceCreate(BaseModel):
    device_id: str
    password: str
    name: str

class DeviceLogin(BaseModel):
    device_id: str
    password: str

class RecordingCreate(BaseModel):
    device_id: str
    expo_name: str
    booth_name: str

class BarcodeCreate(BaseModel):
    recording_id: str
    barcode_data: str
    video_timestamp: Optional[float] = None
    frame_code: Optional[int] = None

# Visitor Badge Model
class VisitorBadge(BaseModel):
    badge_id: str
    recording_id: str
    visitor_label: str  # Barcode or auto-generated
    start_time: float  # Seconds from start
    end_time: float
    summary: str  # AI-generated summary of conversation
    topics: List[str]
    questions_asked: List[str]
    sentiment: str
    key_points: List[str]
    is_barcode_linked: bool = False

# Helper function to serialize MongoDB documents
def serialize_value(value):
    """Recursively serialize MongoDB types to JSON-compatible types"""
    if isinstance(value, ObjectId):
        return str(value)
    elif isinstance(value, datetime):
        return value.isoformat()
    elif isinstance(value, dict):
        return {k: serialize_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [serialize_value(item) for item in value]
    return value

def serialize_doc(doc):
    if doc is None:
        return None
    result = {}
    for key, value in doc.items():
        if key == '_id':
            result['id'] = str(value)
        else:
            result[key] = serialize_value(value)
    return result

# Extract audio from video using ffmpeg
async def extract_audio_from_video(video_data: bytes, video_format: str = "mp4") -> bytes:
    """Extract audio track from video file using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(suffix=f'.{video_format}', delete=False) as video_file:
            video_file.write(video_data)
            video_path = video_file.name
        
        audio_path = video_path.replace(f'.{video_format}', '.m4a')
        
        # Use ffmpeg to extract audio
        cmd = [
            'ffmpeg', '-i', video_path,
            '-vn',  # No video
            '-acodec', 'aac',  # AAC audio codec
            '-b:a', '128k',  # Audio bitrate
            '-y',  # Overwrite output
            audio_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr.decode()}")
            return None
        
        with open(audio_path, 'rb') as f:
            audio_data = f.read()
        
        # Cleanup temp files
        os.unlink(video_path)
        os.unlink(audio_path)
        
        logger.info(f"Successfully extracted audio from video ({len(audio_data)} bytes)")
        return audio_data
    except Exception as e:
        logger.error(f"Audio extraction failed: {e}")
        return None

async def remux_video_for_streaming(video_data: bytes, video_format: str = "mp4") -> bytes:
    """Re-mux video with faststart flag for web streaming (enables seeking)"""
    try:
        with tempfile.NamedTemporaryFile(suffix=f'.{video_format}', delete=False) as input_file:
            input_file.write(video_data)
            input_path = input_file.name
        
        output_path = input_path.replace(f'.{video_format}', f'_remux.{video_format}')
        
        # Re-mux with faststart flag for web streaming compatibility
        cmd = [
            'ffmpeg', '-i', input_path,
            '-c', 'copy',  # Copy streams without re-encoding (fast)
            '-movflags', '+faststart',  # Enable seeking in web browsers
            '-y',  # Overwrite output
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        
        if result.returncode != 0:
            logger.warning(f"FFmpeg remux warning: {result.stderr.decode()}")
            # Return original data if remuxing fails
            os.unlink(input_path)
            return video_data
        
        with open(output_path, 'rb') as f:
            remuxed_data = f.read()
        
        # Cleanup temp files
        os.unlink(input_path)
        os.unlink(output_path)
        
        logger.info(f"Successfully remuxed video for streaming ({len(remuxed_data)} bytes)")
        return remuxed_data
    except Exception as e:
        logger.error(f"Video remux failed: {e}")
        return video_data  # Return original on error

async def add_video_overlay(video_data: bytes, video_format: str = "mp4", 
                           booth_name: str = "XoW Booth", 
                           recording_time: str = None) -> bytes:
    """Add clean, non-overlapping watermark overlay to video"""
    try:
        with tempfile.NamedTemporaryFile(suffix=f'.{video_format}', delete=False) as input_file:
            input_file.write(video_data)
            input_path = input_file.name
        
        output_path = input_path.replace(f'.{video_format}', f'_overlay.{video_format}')
        
        # Get recording timestamp
        if not recording_time:
            recording_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Parse date and time
        try:
            dt = datetime.strptime(recording_time, "%Y-%m-%d %H:%M:%S")
            date_str = dt.strftime("%Y-%m-%d")
            time_str = dt.strftime("%H\\:%M\\:%S")
        except:
            date_str = recording_time[:10] if len(recording_time) >= 10 else recording_time
            time_str = recording_time[11:19].replace(":", "\\:") if len(recording_time) >= 19 else "00\\:00\\:00"
        
        # Escape special characters for FFmpeg drawtext
        safe_booth = booth_name.replace("'", "").replace(":", " ").replace("\\", "").replace('"', "")
        # Truncate long booth names
        if len(safe_booth) > 25:
            safe_booth = safe_booth[:22] + "..."
        
        # Use DejaVu Sans font
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if not os.path.exists(font_path):
            font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        if not os.path.exists(font_path):
            font_path = ""
        
        font_opt = f":fontfile={font_path}" if font_path else ""
        
        # Clean, minimal overlay design - corners only, no overlap
        filter_parts = [
            # === TOP-LEFT: Timestamp Info (compact) ===
            f"drawbox=x=15:y=15:w=180:h=70:color=black@0.6:t=fill",
            f"drawtext=text='{date_str}':fontsize=14:fontcolor=white:x=25:y=25{font_opt}",
            f"drawtext=text='{time_str}':fontsize=14:fontcolor=0x10B981:x=25:y=45{font_opt}",
            f"drawtext=text='%{{pts\\:hms}}':fontsize=14:fontcolor=0xEF4444:x=115:y=45{font_opt}",
            f"drawtext=text='REC':fontsize=12:fontcolor=0xEF4444:x=145:y=25:box=1:boxcolor=0xEF4444@0.3:boxborderw=3{font_opt}",
            
            # === TOP-RIGHT: Frame Counter (compact) ===
            f"drawbox=x=w-115:y=15:w=100:h=35:color=black@0.6:t=fill",
            f"drawtext=text='F\\:':fontsize=14:fontcolor=0x9CA3AF:x=w-105:y=25{font_opt}",
            f"drawtext=text='%{{frame_num}}':start_number=1:fontsize=14:fontcolor=0x8B5CF6:x=w-85:y=25{font_opt}",
            
            # === BOTTOM-LEFT: Booth Name (compact) ===
            f"drawtext=text='{safe_booth}':fontsize=16:fontcolor=white:x=20:y=h-40:box=1:boxcolor=black@0.6:boxborderw=8{font_opt}",
            
            # === BOTTOM-RIGHT: XoW Logo (clean) ===
            f"drawbox=x=w-75:y=h-45:w=60:h=30:color=0x8B5CF6@0.9:t=fill",
            f"drawtext=text='XoW':fontsize=18:fontcolor=white:x=w-68:y=h-40{font_opt}",
        ]
        filter_complex = ','.join(filter_parts)
        
        cmd = [
            'ffmpeg', '-i', input_path,
            '-vf', filter_complex,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            output_path
        ]
        
        logger.info(f"Running FFmpeg overlay command: booth={safe_booth}, font={font_path}")
        logger.info(f"FFmpeg command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, timeout=600)
        
        if result.returncode != 0:
            error_msg = result.stderr.decode()[:2000]
            logger.error(f"FFmpeg overlay failed (exit code {result.returncode}): {error_msg}")
            # Clean up input file
            try:
                os.unlink(input_path)
            except:
                pass
            return video_data
        
        # Check if output file exists and has content
        if not os.path.exists(output_path):
            logger.error("FFmpeg overlay: output file not created")
            try:
                os.unlink(input_path)
            except:
                pass
            return video_data
            
        output_size = os.path.getsize(output_path)
        if output_size == 0:
            logger.error("FFmpeg overlay: output file is empty")
            try:
                os.unlink(input_path)
                os.unlink(output_path)
            except:
                pass
            return video_data
        
        with open(output_path, 'rb') as f:
            overlay_data = f.read()
        
        # Clean up temp files
        try:
            os.unlink(input_path)
            os.unlink(output_path)
        except:
            pass
        
        logger.info(f"Video overlay applied successfully: input={len(video_data)} bytes, output={len(overlay_data)} bytes")
        return overlay_data
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg overlay timed out after 600 seconds")
        return video_data
    except Exception as e:
        logger.error(f"Video overlay exception: {type(e).__name__}: {e}")
        return video_data

# ==================== HEALTH CHECK ====================

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ==================== DASHBOARD AUTH MODELS ====================

class DashboardUserCreate(BaseModel):
    email: str
    password: str
    name: str

class DashboardUserLogin(BaseModel):
    email: str
    password: str

class DeviceAssociationRequest(BaseModel):
    device_code: str

# ==================== AUTH ENDPOINTS (Mobile App) ====================

@api_router.post("/auth/register")
async def register_device(device: DeviceCreate):
    """Register a new device"""
    existing = await db.devices.find_one({"device_id": device.device_id})
    if existing:
        raise HTTPException(status_code=400, detail="Device ID already registered")
    
    device_doc = {
        "device_id": device.device_id,
        "password": device.password,
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

# ==================== DASHBOARD AUTH ENDPOINTS ====================

@api_router.post("/dashboard/auth/signup")
async def dashboard_signup(user: DashboardUserCreate):
    """Sign up a new dashboard user"""
    import hashlib
    
    existing = await db.dashboard_users.find_one({"email": user.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    password_hash = hashlib.sha256(user.password.encode()).hexdigest()
    
    user_doc = {
        "email": user.email.lower(),
        "password_hash": password_hash,
        "name": user.name,
        "created_at": datetime.utcnow(),
        "devices": [],
        "is_active": True
    }
    result = await db.dashboard_users.insert_one(user_doc)
    user_doc['_id'] = result.inserted_id
    
    response = serialize_doc(user_doc)
    del response['password_hash']
    return {"success": True, "user": response, "message": "Account created successfully"}

@api_router.post("/dashboard/auth/login")
async def dashboard_login(login: DashboardUserLogin):
    """Login a dashboard user"""
    import hashlib
    
    password_hash = hashlib.sha256(login.password.encode()).hexdigest()
    
    user = await db.dashboard_users.find_one({
        "email": login.email.lower(),
        "password_hash": password_hash
    })
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    response = serialize_doc(user)
    del response['password_hash']
    return {"success": True, "user": response, "message": "Login successful"}

@api_router.get("/dashboard/auth/user/{user_id}")
async def get_dashboard_user(user_id: str):
    """Get dashboard user details"""
    try:
        user = await db.dashboard_users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        response = serialize_doc(user)
        del response['password_hash']
        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== DEVICE MANAGEMENT ENDPOINTS ====================

@api_router.post("/dashboard/devices/add")
async def add_device_to_dashboard(request: DeviceAssociationRequest, user_id: str):
    """Add a device to dashboard account by generating an OTP"""
    import random
    
    user = await db.dashboard_users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if len(user.get('devices', [])) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 devices allowed per account")
    
    device = await db.mobile_devices.find_one({"device_code": request.device_code})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found. Please check the 6-digit code on your app.")
    
    if device.get('dashboard_user_id'):
        raise HTTPException(status_code=400, detail="This device is already associated with another account")
    
    otp = ''.join([str(random.randint(0, 9)) for _ in range(8)])
    otp_expiry = datetime.utcnow() + timedelta(minutes=10)
    
    await db.mobile_devices.update_one(
        {"device_code": request.device_code},
        {"$set": {
            "pending_otp": otp,
            "otp_expiry": otp_expiry,
            "pending_user_id": str(user['_id'])
        }}
    )
    
    return {
        "success": True,
        "otp": otp,
        "device_code": request.device_code,
        "expires_in_minutes": 10,
        "message": "Enter this OTP on your mobile app to complete association"
    }

@api_router.post("/mobile/verify-otp")
async def verify_device_otp(device_code: str, otp: str):
    """Verify OTP from mobile app to complete device association"""
    
    device = await db.mobile_devices.find_one({"device_code": device_code})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if device.get('pending_otp') != otp:
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    if device.get('otp_expiry') and device['otp_expiry'] < datetime.utcnow():
        raise HTTPException(status_code=401, detail="OTP has expired. Please request a new one.")
    
    pending_user_id = device.get('pending_user_id')
    if not pending_user_id:
        raise HTTPException(status_code=400, detail="No pending association found")
    
    await db.mobile_devices.update_one(
        {"device_code": device_code},
        {
            "$set": {
                "dashboard_user_id": pending_user_id,
                "associated_at": datetime.utcnow()
            },
            "$unset": {
                "pending_otp": "",
                "otp_expiry": "",
                "pending_user_id": ""
            }
        }
    )
    
    await db.dashboard_users.update_one(
        {"_id": ObjectId(pending_user_id)},
        {"$addToSet": {"devices": device_code}}
    )
    
    return {
        "success": True,
        "message": "Device successfully associated with dashboard account"
    }

@api_router.post("/mobile/register-device")
async def register_mobile_device(device_name: str = "Mobile Device"):
    """Register a new mobile device and get a 6-digit static code"""
    import random
    
    while True:
        device_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        existing = await db.mobile_devices.find_one({"device_code": device_code})
        if not existing:
            break
    
    device_doc = {
        "device_code": device_code,
        "device_name": device_name,
        "created_at": datetime.utcnow(),
        "dashboard_user_id": None,
        "is_active": True
    }
    result = await db.mobile_devices.insert_one(device_doc)
    device_doc['_id'] = result.inserted_id
    
    return {
        "success": True,
        "device_code": device_code,
        "message": "Device registered. Use this code to connect to your dashboard account."
    }

@api_router.get("/dashboard/devices/{user_id}")
async def get_user_devices(user_id: str):
    """Get all devices associated with a dashboard user"""
    try:
        user = await db.dashboard_users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        device_codes = user.get('devices', [])
        devices = await db.mobile_devices.find({"device_code": {"$in": device_codes}}).to_list(10)
        
        return {
            "success": True,
            "devices": [
                {
                    "device_code": d['device_code'],
                    "device_name": d.get('device_name', 'Unknown'),
                    "associated_at": d.get('associated_at'),
                    "is_active": d.get('is_active', True)
                }
                for d in devices
            ],
            "count": len(devices),
            "max_allowed": 10
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/dashboard/devices/{user_id}/{device_code}")
async def remove_device_from_dashboard(user_id: str, device_code: str):
    """Remove a device from dashboard account"""
    try:
        await db.dashboard_users.update_one(
            {"_id": ObjectId(user_id)},
            {"$pull": {"devices": device_code}}
        )
        
        await db.mobile_devices.update_one(
            {"device_code": device_code},
            {"$set": {"dashboard_user_id": None, "associated_at": None}}
        )
        
        return {"success": True, "message": "Device removed successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
        "duration": 0,
        "status": "recording",
        "has_video": False,
        "has_audio": False,
        "video_file_id": None,
        "audio_file_id": None,
        "transcript": None,
        "summary": None,
        "highlights": [],
        "barcode_scans": [],
        "visitors": [],  # List of visitor badges
        "top_questions": [],
        "top_topics": [],
        "overall_sentiment": "neutral"
    }
    result = await db.recordings.insert_one(recording_doc)
    recording_doc['_id'] = result.inserted_id
    return serialize_doc(recording_doc)

@api_router.get("/recordings")
async def get_recordings(device_id: Optional[str] = None):
    """Get all recordings, optionally filtered by device"""
    query = {"device_id": device_id} if device_id else {}
    recordings = await db.recordings.find(query).sort("start_time", -1).to_list(100)
    return [serialize_doc(r) for r in recordings]

@api_router.get("/recordings/{recording_id}")
async def get_recording(recording_id: str):
    """Get a specific recording by ID"""
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
        
        if recording.get('video_file_id'):
            try:
                await fs_bucket.delete(ObjectId(recording['video_file_id']))
            except Exception as e:
                logger.warning(f"Failed to delete video file: {e}")
        
        if recording.get('audio_file_id'):
            try:
                await fs_bucket.delete(ObjectId(recording['audio_file_id']))
            except Exception as e:
                logger.warning(f"Failed to delete audio file: {e}")
        
        await db.barcode_scans.delete_many({"recording_id": recording_id})
        await db.video_chunks.delete_many({"recording_id": recording_id})
        await db.visitor_badges.delete_many({"recording_id": recording_id})
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
        
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "processing"}}
        )
        
        background_tasks.add_task(process_transcription_with_diarization, recording_id)
        
        return {"success": True, "message": "Reprocessing started with speaker diarization", "status": "processing"}
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
        
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "transcript": request.transcript,
                "status": "processing"
            }}
        )
        
        background_tasks.add_task(process_diarization_only, recording_id, request.transcript)
        
        return {"success": True, "message": "Transcript added, analysis started"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== VIDEO/AUDIO UPLOAD ====================

@api_router.post("/recordings/{recording_id}/upload-video")
async def upload_video(
    recording_id: str,
    video: UploadFile = File(...),
    chunk_index: int = Form(0),
    total_chunks: int = Form(1),
    background_tasks: BackgroundTasks = None
):
    """Upload video file for a recording - remuxes for streaming and extracts audio for transcription"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        video_data = await video.read()
        
        filename = video.filename or "recording.mp4"
        content_type = video.content_type or "video/mp4"
        
        if "mp4" in content_type or filename.endswith(".mp4"):
            ext = "mp4"
            mime = "video/mp4"
        elif "webm" in content_type or filename.endswith(".webm"):
            ext = "webm"
            mime = "video/webm"
        elif "mov" in content_type or filename.endswith(".mov"):
            ext = "mov"
            mime = "video/quicktime"
        else:
            ext = "mp4"
            mime = "video/mp4"
        
        if total_chunks == 1:
            # Get booth name from recording for overlay
            booth_name = recording.get('booth_name', 'XoW Booth')
            recording_time = recording.get('start_time', datetime.now()).strftime("%Y-%m-%d %H:%M:%S") if isinstance(recording.get('start_time'), datetime) else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # Add video overlay with timestamp, booth name, and XoW branding
            logger.info(f"Adding video overlay for booth: {booth_name}")
            overlay_video = await add_video_overlay(video_data, ext, booth_name, recording_time)
            
            # Remux video for web streaming (adds faststart flag for seeking)
            logger.info(f"Remuxing video for streaming support...")
            remuxed_video = await remux_video_for_streaming(overlay_video, ext)
            
            # Single upload - store video
            video_id = await fs_bucket.upload_from_stream(
                f"video_{recording_id}.{ext}",
                io.BytesIO(remuxed_video),
                metadata={"recording_id": recording_id, "type": "video", "mime_type": mime}
            )
            
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {
                    "video_file_id": str(video_id),
                    "has_video": True,
                    "video_mime_type": mime,
                    "status": "processing"
                }}
            )
            
            # Extract audio from video and process (use original data for audio extraction)
            if background_tasks:
                background_tasks.add_task(process_video_audio, recording_id, video_data, ext)
            
        else:
            # Chunked upload
            await db.video_chunks.insert_one({
                "recording_id": recording_id,
                "chunk_index": chunk_index,
                "total_chunks": total_chunks,
                "data": base64.b64encode(video_data).decode('utf-8'),
                "uploaded_at": datetime.utcnow(),
                "mime_type": mime,
                "extension": ext
            })
            
            chunks_count = await db.video_chunks.count_documents({"recording_id": recording_id})
            if chunks_count == total_chunks:
                chunks = await db.video_chunks.find(
                    {"recording_id": recording_id}
                ).sort("chunk_index", 1).to_list(total_chunks)
                
                combined_data = b''.join([
                    base64.b64decode(c['data']) for c in chunks
                ])
                
                first_chunk = chunks[0] if chunks else {}
                mime = first_chunk.get('mime_type', 'video/mp4')
                ext = first_chunk.get('extension', 'mp4')
                
                video_id = await fs_bucket.upload_from_stream(
                    f"video_{recording_id}.{ext}",
                    io.BytesIO(combined_data),
                    metadata={"recording_id": recording_id, "type": "video", "mime_type": mime}
                )
                
                await db.recordings.update_one(
                    {"_id": ObjectId(recording_id)},
                    {"$set": {
                        "video_file_id": str(video_id),
                        "has_video": True,
                        "video_mime_type": mime,
                        "status": "processing"
                    }}
                )
                
                await db.video_chunks.delete_many({"recording_id": recording_id})
                
                # Extract audio and process
                if background_tasks:
                    background_tasks.add_task(process_video_audio, recording_id, combined_data, ext)
        
        logger.info(f"Video uploaded for recording {recording_id}: {ext} ({mime})")
        return {"success": True, "message": f"Video uploaded, extracting audio for analysis", "format": mime}
    except Exception as e:
        logger.error(f"Video upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

async def process_video_audio(recording_id: str, video_data: bytes, video_format: str):
    """Extract audio from video and process transcription"""
    try:
        logger.info(f"Extracting audio from video for recording {recording_id}")
        
        audio_data = await extract_audio_from_video(video_data, video_format)
        
        if audio_data:
            # Store extracted audio
            audio_id = await fs_bucket.upload_from_stream(
                f"audio_{recording_id}.m4a",
                io.BytesIO(audio_data),
                metadata={"recording_id": recording_id, "type": "audio", "extracted_from_video": True}
            )
            
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {
                    "audio_file_id": str(audio_id),
                    "has_audio": True
                }}
            )
            
            # Process transcription
            await process_transcription_with_diarization(recording_id)
        else:
            logger.error(f"Failed to extract audio from video for recording {recording_id}")
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {"status": "uploaded", "error": "Audio extraction failed"}}
            )
    except Exception as e:
        logger.error(f"Error processing video audio: {e}")
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "error", "error": str(e)}}
        )

@api_router.post("/recordings/{recording_id}/upload-audio")
async def upload_audio(recording_id: str, audio: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    """Upload audio file for a recording and automatically trigger transcription"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        audio_data = await audio.read()
        
        audio_id = await fs_bucket.upload_from_stream(
            f"audio_{recording_id}.m4a",
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
        
        if background_tasks:
            background_tasks.add_task(process_transcription_with_diarization, recording_id)
        
        return {"success": True, "message": "Audio uploaded, transcription started"}
    except Exception as e:
        logger.error(f"Audio upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== TRANSCRIPTION & ANALYSIS ====================

async def process_transcription_with_diarization(recording_id: str):
    """Process audio with Whisper transcription and GPT-powered speaker diarization"""
    try:
        logger.info(f"Starting transcription for recording {recording_id}")
        
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording or not recording.get('audio_file_id'):
            logger.error(f"Recording or audio file not found: {recording_id}")
            return
        
        # Get audio data from GridFS
        grid_out = await fs_bucket.open_download_stream(ObjectId(recording['audio_file_id']))
        audio_data = await grid_out.read()
        
        # Transcribe with Whisper
        transcript = ""
        if whisper_client:
            try:
                audio_file = io.BytesIO(audio_data)
                audio_file.name = "audio.m4a"
                
                response = whisper_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text"
                )
                transcript = response if isinstance(response, str) else str(response)
                logger.info(f"Transcription completed: {len(transcript)} characters")
            except Exception as e:
                logger.error(f"Whisper transcription error: {e}")
                transcript = ""
        
        if transcript:
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {"transcript": transcript}}
            )
            
            # Process with GPT for diarization and visitor extraction
            logger.info(f"Performing speaker diarization for recording {recording_id}")
            await perform_advanced_diarization(recording_id, transcript, recording.get('duration', 0))
        else:
            await db.recordings.update_one(
                {"_id": ObjectId(recording_id)},
                {"$set": {
                    "status": "completed",
                    "summary": "No speech detected in audio",
                    "overall_summary": "No speech detected in audio"
                }}
            )
            
    except Exception as e:
        logger.error(f"Transcription processing error: {e}")
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "error", "error": str(e)}}
        )

async def process_diarization_only(recording_id: str, transcript: str):
    """Process only the diarization step for manual transcripts"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        duration = recording.get('duration', 0) if recording else 0
        await perform_advanced_diarization(recording_id, transcript, duration)
    except Exception as e:
        logger.error(f"Diarization error: {e}")
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"status": "error", "error": str(e)}}
        )

async def perform_advanced_diarization(recording_id: str, transcript: str, duration: float):
    """Use GPT to perform advanced speaker diarization and create visitor badges"""
    if not openai_client:
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "status": "completed",
                "summary": transcript[:500] if transcript else "No transcript available"
            }}
        )
        return
    
    try:
        # Get any barcode scans for this recording
        barcode_scans = await db.barcode_scans.find({"recording_id": recording_id}).to_list(100)
        barcode_info = ""
        if barcode_scans:
            barcode_list = [f"- {b['barcode_data']} at {b.get('video_timestamp', 0):.1f}s" for b in barcode_scans]
            barcode_info = f"\n\nBarcode scans during recording:\n" + "\n".join(barcode_list)
        
        # Step 1: Get overall analysis
        analysis_prompt = f"""Analyze this expo booth conversation transcript and provide:

TRANSCRIPT:
{transcript}
{barcode_info}

Provide a JSON response with:
{{
    "overall_summary": "2-3 sentence summary of the entire conversation",
    "top_questions": ["list of most important questions asked by visitors"],
    "top_topics": ["list of main topics discussed"],
    "overall_sentiment": "positive/neutral/negative",
    "key_insights": ["important insights for follow-up"],
    "visitor_count_estimate": number
}}"""

        analysis_response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": analysis_prompt}],
            response_format={"type": "json_object"}
        )
        
        analysis = json.loads(analysis_response.choices[0].message.content)
        
        # Step 2: Get speaker segments and visitor badges
        diarization_prompt = f"""Analyze this expo booth conversation and identify distinct speakers/visitors.
For each visitor interaction, create a visitor badge.

TRANSCRIPT:
{transcript}
{barcode_info}

Recording duration: {duration:.1f} seconds

Create a JSON response:
{{
    "speakers": [
        {{
            "speaker_id": "unique_id",
            "is_host": true/false,
            "label": "Host" or visitor name if mentioned or barcode if provided,
            "company": "company name if mentioned",
            "role": "role if mentioned",
            "sentiment": "positive/interested/neutral/skeptical/negative",
            "topics_discussed": ["topic1", "topic2"],
            "key_points": ["main point 1", "main point 2"],
            "questions_asked": ["question 1", "question 2"],
            "start_percent": 0-100,
            "end_percent": 0-100,
            "dialogue_segments": [
                {{"content": "what they said", "start_percent": 0-100, "end_percent": 0-100}}
            ]
        }}
    ],
    "conversations": [
        {{
            "title": "Topic discussed",
            "start_percent": 0-100,
            "summary": "Brief summary"
        }}
    ]
}}

Rules:
- First speaker is usually the HOST (booth staff)
- Each visitor is a separate speaker
- Link barcodes to speakers if scanned during their segment
- Estimate time percentages based on transcript position"""

        diarization_response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": diarization_prompt}],
            response_format={"type": "json_object"}
        )
        
        diarization = json.loads(diarization_response.choices[0].message.content)
        
        # Step 3: Create visitor badges from non-host speakers
        visitors = []
        visitor_badges = []
        
        for speaker in diarization.get('speakers', []):
            if not speaker.get('is_host', False):
                # Create visitor badge
                badge_id = speaker.get('label', f"Visitor_{len(visitors)+1}")
                
                # Check if barcode was scanned for this visitor
                is_barcode = any(b['barcode_data'] == badge_id for b in barcode_scans)
                
                start_time = (speaker.get('start_percent', 0) / 100) * duration
                end_time = (speaker.get('end_percent', 100) / 100) * duration
                
                visitor_badge = {
                    "badge_id": badge_id,
                    "recording_id": recording_id,
                    "visitor_label": badge_id,
                    "start_time": start_time,
                    "end_time": end_time,
                    "summary": f"Discussed: {', '.join(speaker.get('topics_discussed', [])[:2])}",
                    "topics": speaker.get('topics_discussed', []),
                    "questions_asked": speaker.get('questions_asked', []),
                    "sentiment": speaker.get('sentiment', 'neutral'),
                    "key_points": speaker.get('key_points', []),
                    "is_barcode_linked": is_barcode,
                    "company": speaker.get('company'),
                    "role": speaker.get('role'),
                    "created_at": datetime.utcnow()
                }
                
                visitor_badges.append(visitor_badge)
                visitors.append(visitor_badge)
        
        # Store visitor badges in separate collection
        if visitor_badges:
            await db.visitor_badges.insert_many(visitor_badges)
        
        # Add timestamp information to speakers
        for speaker in diarization.get('speakers', []):
            start_pct = speaker.get('start_percent', 0)
            end_pct = speaker.get('end_percent', 100)
            speaker['start_time'] = (start_pct / 100) * duration
            speaker['end_time'] = (end_pct / 100) * duration
            
            for seg in speaker.get('dialogue_segments', []):
                seg_start = seg.get('start_percent', 0)
                seg_end = seg.get('end_percent', 100)
                seg['start_time'] = (seg_start / 100) * duration
                seg['end_time'] = (seg_end / 100) * duration
                seg['timestamp_label'] = f"{int(seg['start_time']//60)}:{int(seg['start_time']%60):02d}"
        
        # Add timestamp info to conversations
        for conv in diarization.get('conversations', []):
            start_pct = conv.get('start_percent', 0)
            conv['start_time'] = (start_pct / 100) * duration
        
        # Update recording with all data
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "status": "processed",
                "overall_summary": analysis.get('overall_summary', ''),
                "summary": analysis.get('overall_summary', ''),
                "top_questions": analysis.get('top_questions', []),
                "top_topics": analysis.get('top_topics', []),
                "overall_sentiment": analysis.get('overall_sentiment', 'neutral'),
                "key_insights": analysis.get('key_insights', []),
                "visitor_count": len(visitors),
                "visitors": visitors,
                "speakers": diarization.get('speakers', []),
                "conversations": diarization.get('conversations', []),
                "total_speakers": len(diarization.get('speakers', [])),
                "host_identified": any(s.get('is_host') for s in diarization.get('speakers', []))
            }}
        )
        
        logger.info(f"Transcription with diarization completed for recording {recording_id}")
        
    except Exception as e:
        logger.error(f"Diarization error: {e}")
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "status": "processed",
                "summary": transcript[:500] if transcript else "Analysis failed",
                "error": str(e)
            }}
        )

# ==================== VISITOR BADGE ENDPOINTS ====================

@api_router.get("/visitors")
async def get_all_visitors():
    """Get all visitor badges across all recordings"""
    visitors = await db.visitor_badges.find({}).sort("created_at", -1).to_list(500)
    return [serialize_doc(v) for v in visitors]

@api_router.get("/visitors/recording/{recording_id}")
async def get_recording_visitors(recording_id: str):
    """Get all visitor badges for a specific recording"""
    visitors = await db.visitor_badges.find({"recording_id": recording_id}).to_list(100)
    return [serialize_doc(v) for v in visitors]

@api_router.get("/visitors/{visitor_id}")
async def get_visitor(visitor_id: str):
    """Get a specific visitor badge"""
    try:
        visitor = await db.visitor_badges.find_one({"_id": ObjectId(visitor_id)})
        if not visitor:
            raise HTTPException(status_code=404, detail="Visitor not found")
        return serialize_doc(visitor)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== BARCODE ENDPOINTS ====================

@api_router.post("/barcodes")
async def create_barcode_scan(barcode: BarcodeCreate):
    """Record a barcode scan during recording"""
    barcode_doc = {
        "recording_id": barcode.recording_id,
        "barcode_data": barcode.barcode_data,
        "video_timestamp": barcode.video_timestamp,
        "frame_code": barcode.frame_code,
        "scan_time": datetime.utcnow()
    }
    result = await db.barcode_scans.insert_one(barcode_doc)
    
    # Also update the recording document
    await db.recordings.update_one(
        {"_id": ObjectId(barcode.recording_id)},
        {"$push": {"barcode_scans": barcode_doc}}
    )
    
    barcode_doc['_id'] = result.inserted_id
    return serialize_doc(barcode_doc)

# ==================== DASHBOARD DATA ENDPOINTS ====================

@api_router.get("/dashboard/insights")
async def get_dashboard_insights():
    """Get aggregated insights for the dashboard"""
    recordings = await db.recordings.find({}).to_list(1000)
    visitors = await db.visitor_badges.find({}).to_list(1000)
    
    total_recordings = len(recordings)
    total_visitors = len(visitors)
    total_duration = sum(r.get('duration', 0) or 0 for r in recordings)
    
    # Aggregate top topics across all recordings
    all_topics = []
    all_questions = []
    for r in recordings:
        all_topics.extend(r.get('top_topics', []))
        all_questions.extend(r.get('top_questions', []))
    
    # Count topic frequency
    topic_counts = {}
    for topic in all_topics:
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
    top_topics = sorted(topic_counts.keys(), key=lambda x: topic_counts[x], reverse=True)[:10]
    
    # Count question frequency
    question_counts = {}
    for q in all_questions:
        question_counts[q] = question_counts.get(q, 0) + 1
    top_questions = sorted(question_counts.keys(), key=lambda x: question_counts[x], reverse=True)[:5]
    
    recent_activity = []
    for r in sorted(recordings, key=lambda x: x.get('start_time', datetime.min), reverse=True)[:5]:
        recent_activity.append({
            "id": str(r['_id']),
            "booth_name": r.get('booth_name', 'Unknown'),
            "start_time": r.get('start_time'),
            "duration": r.get('duration', 0),
            "status": r.get('status', 'unknown'),
            "total_interactions": r.get('visitor_count', len(r.get('visitors', [])))
        })
    
    return {
        "total_recordings": total_recordings,
        "total_visitors": total_visitors,
        "total_duration_hours": total_duration / 3600,
        "top_topics": top_topics,
        "top_questions": top_questions,
        "recent_activity": recent_activity
    }

@api_router.get("/dashboard/recordings")
async def get_dashboard_recordings():
    """Get all recordings for the dashboard with full details"""
    recordings = await db.recordings.find({}).sort("start_time", -1).to_list(100)
    result = []
    
    for r in recordings:
        # Get the recording ID before serializing
        recording_id = str(r['_id'])
        rec_data = serialize_doc(r)
        
        # Get visitor badges for this recording
        visitors = await db.visitor_badges.find({"recording_id": recording_id}).to_list(50)
        rec_data['visitor_badges'] = [serialize_doc(v) for v in visitors]
        
        result.append(rec_data)
    
    return result

@api_router.get("/dashboard/visitors")
async def get_dashboard_visitors():
    """Get all visitors with their recording info"""
    visitors = await db.visitor_badges.find({}).sort("created_at", -1).to_list(500)
    result = []
    
    for v in visitors:
        visitor_data = serialize_doc(v)
        
        # Get recording info
        if v.get('recording_id'):
            recording = await db.recordings.find_one({"_id": ObjectId(v['recording_id'])})
            if recording:
                visitor_data['booth_name'] = recording.get('booth_name')
                visitor_data['recording_date'] = recording.get('start_time')
        
        result.append(visitor_data)
    
    return result

# ==================== MEDIA STREAMING ====================

@api_router.get("/recordings/{recording_id}/video")
async def get_video(recording_id: str, request: Request):
    """Stream video file with range support"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording or not recording.get('video_file_id'):
            raise HTTPException(status_code=404, detail="Video not found")
        
        file_info = await db.fs.files.find_one({"_id": ObjectId(recording['video_file_id'])})
        file_size = file_info.get('length', 0) if file_info else 0
        
        mime_type = recording.get('video_mime_type')
        if not mime_type and file_info:
            mime_type = file_info.get('metadata', {}).get('mime_type', 'video/mp4')
        if not mime_type:
            mime_type = 'video/mp4'
        
        grid_out = await fs_bucket.open_download_stream(ObjectId(recording['video_file_id']))
        
        range_header = request.headers.get('range')
        
        if range_header and file_size > 0:
            range_match = range_header.replace('bytes=', '').split('-')
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
            
            start = max(0, min(start, file_size - 1))
            end = max(start, min(end, file_size - 1))
            
            grid_out.seek(start)
            content_length = end - start + 1
            content = await grid_out.read(content_length)
            
            return Response(
                content=content,
                status_code=206,
                media_type=mime_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(content_length)
                }
            )
        else:
            content = await grid_out.read()
            return Response(
                content=content,
                media_type=mime_type,
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(file_size)
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video streaming error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/recordings/{recording_id}/audio")
async def get_audio(recording_id: str, request: Request):
    """Stream audio file with range support"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording or not recording.get('audio_file_id'):
            raise HTTPException(status_code=404, detail="Audio not found")
        
        file_info = await db.fs.files.find_one({"_id": ObjectId(recording['audio_file_id'])})
        file_size = file_info.get('length', 0) if file_info else 0
        
        grid_out = await fs_bucket.open_download_stream(ObjectId(recording['audio_file_id']))
        
        range_header = request.headers.get('range')
        
        if range_header and file_size > 0:
            range_match = range_header.replace('bytes=', '').split('-')
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
            
            start = max(0, min(start, file_size - 1))
            end = max(start, min(end, file_size - 1))
            
            grid_out.seek(start)
            content_length = end - start + 1
            content = await grid_out.read(content_length)
            
            return Response(
                content=content,
                status_code=206,
                media_type="audio/mp4",
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(content_length)
                }
            )
        else:
            content = await grid_out.read()
            return Response(
                content=content,
                media_type="audio/mp4",
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(file_size)
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio streaming error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/recordings/{recording_id}/status")
async def get_recording_status(recording_id: str):
    """Get the current status of a recording"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        return {"status": recording.get('status', 'unknown')}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/recordings/{recording_id}/translate")
async def translate_transcript(recording_id: str, target_language: str = "en"):
    """Translate a recording's transcript to another language"""
    try:
        recording = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        transcript = recording.get('transcript')
        if not transcript:
            raise HTTPException(status_code=400, detail="No transcript available")
        
        if not openai_client:
            raise HTTPException(status_code=500, detail="Translation service not available")
        
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": f"Translate the following text to {target_language}. Only return the translation, no explanations:\n\n{transcript}"
            }]
        )
        
        translated = response.choices[0].message.content
        
        return {
            "success": True,
            "original_transcript": transcript,
            "translated_transcript": translated,
            "target_language": target_language
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== STATIC FILES & ROUTES ====================

# Include the router in the main app
app.include_router(api_router)

# Serve home page
@app.get("/api/home")
async def serve_home():
    return FileResponse(ROOT_DIR / "static" / "index.html")

# Serve dashboard
@app.get("/api/dashboard")
async def serve_dashboard():
    return FileResponse(ROOT_DIR / "static" / "dashboard.html")
