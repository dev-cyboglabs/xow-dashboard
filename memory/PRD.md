# XoW - Expo Stall Recording & Analysis System

## Product Overview
XoW is a system for expo booths that records conversations and uses AI to analyze them. It consists of:
- **Android App**: For recording video/audio at expo booths
- **Web Dashboard**: For analyzing recordings with AI-powered insights

## Core Features Implemented

### 1. Dashboard Authentication (Completed Feb 17, 2026)
- **Home Page** at `/api/home` with landing page design
- **Login/Signup** modals with email/password authentication
- User session stored in localStorage for persistence
- Redirect to dashboard after successful login

### 2. Device Management with OTP (Completed Feb 17, 2026)
- **6-digit static device code** generated for each mobile app
- **8-digit OTP** generated when dashboard user adds a device
- OTP expires in 10 minutes
- **Maximum 10 devices** per dashboard account
- Device association flow:
  1. Mobile app shows 6-digit code
  2. Dashboard user enters code, gets 8-digit OTP
  3. User enters OTP in mobile app to complete association
- Devices can be removed from dashboard

### 3. Bright Theme Dashboard (Completed Feb 17, 2026)
- Clean white/slate background (rgb(248, 250, 252))
- Violet/purple accent colors
- Glass-morphism effects on cards
- Modern, PLAUD-inspired design
- Sidebar navigation with Overview, Sessions, Visitors, Devices tabs

### 4. Video Playback Fixed (Completed Feb 17, 2026)
- Videos now properly upload and play in dashboard
- Video streaming with correct MIME types (MP4, WebM, MOV)
- Range request support for seeking
- "Play Video" button shown for video recordings
- "Play Audio" button for audio-only recordings
- Video modal with player controls

### 4. Automatic Transcription (Completed Dec 15, 2025)
- Audio files uploaded to backend are automatically transcribed using OpenAI Whisper API
- Transcription triggers automatically when audio is uploaded via `/api/recordings/{id}/upload-audio`
- Falls back to manual transcript entry if needed

### 5. AI Speaker Diarization (Completed Dec 15, 2025)
Using OpenAI Whisper + GPT-4o for accurate speaker separation:

**Features:**
- Separates conversations by speaker
- Identifies recurring "host" voice (booth staff) vs guests
- Labels speakers with:
  - Their actual name if mentioned in conversation
  - Barcode ID if scanned during their speaking segment
  - Auto-generated labels (Guest 1, Guest 2) as fallback
- Extracts per-speaker data:
  - Company/organization
  - Role
  - Topics discussed
  - Key points
  - Questions asked
  - Sentiment (positive, interested, neutral, skeptical)
  - Dialogue segments with timestamps

### 6. PLAUD-Style Dashboard UI (Completed Dec 15, 2025)
**Overall Summary Section:**
- High-level conversation summary
- Main topics as pills/tags
- Host identified badge
- Follow-up actions list

**Detailed Insights Button:**
- Expands to show speaker boxes
- Each speaker box contains:
  - Avatar with HOST badge if applicable
  - Name/label with source indicator (Name, Barcode)
  - Company and role
  - Sentiment badge
  - Topics discussed
  - Key points extracted
  - Questions asked
  - Play button to jump to their speaking segment
  - Expandable full dialogue view

### 7. Video/Audio Playback with Timestamp Jumping
- Click any speaker's Play button to jump to their segment
- Click conversation cards to play from that timestamp
- Works with both video and audio-only recordings
- Download fallback for unsupported audio codecs

## Tech Stack
- **Frontend**: React Native (Expo) for mobile, HTML/JS/Tailwind for web dashboard
- **Backend**: FastAPI with Python
- **Database**: MongoDB with GridFS for file storage
- **AI**: OpenAI API (Whisper for transcription, GPT for analysis)

## API Endpoints

### Dashboard Auth
- `POST /api/dashboard/auth/signup` - Create new dashboard user
- `POST /api/dashboard/auth/login` - Login dashboard user
- `GET /api/dashboard/auth/user/{user_id}` - Get user details

### Device Management
- `POST /api/mobile/register-device` - Register mobile device, get 6-digit code
- `POST /api/dashboard/devices/add` - Add device to dashboard, get 8-digit OTP
- `POST /api/mobile/verify-otp` - Verify OTP from mobile app
- `GET /api/dashboard/devices/{user_id}` - Get user's devices
- `DELETE /api/dashboard/devices/{user_id}/{device_code}` - Remove device

### Recordings
- `GET /api/dashboard` - Serve dashboard HTML
- `GET /api/home` - Serve home/landing page HTML
- `GET /api/dashboard/recordings` - Get all recordings
- `GET /api/dashboard/insights` - Get dashboard stats
- `GET /api/recordings/{id}/audio` - Stream audio
- `GET /api/recordings/{id}/video` - Stream video
- `POST /api/recordings/{id}/translate` - Translate transcript

## Database Schema

### dashboard_users
```json
{
  "email": "string",
  "password_hash": "string",
  "name": "string",
  "created_at": "datetime",
  "devices": ["string"], // array of device codes
  "is_active": true
}
```

### mobile_devices
```json
{
  "device_code": "string", // 6-digit
  "device_name": "string",
  "created_at": "datetime",
  "dashboard_user_id": "string", // null if not associated
  "associated_at": "datetime",
  "pending_otp": "string", // 8-digit, cleared after verification
  "otp_expiry": "datetime"
}
```

### recordings
```json
{
  "device_id": "string",
  "booth_name": "string",
  "start_time": "datetime",
  "duration": "number",
  "has_video": true,
  "has_audio": true,
  "video_url": "string",
  "audio_url": "string",
  "status": "uploaded|processing|processed|error",
  "transcript": "string",
  "summary": "string",
  "speakers": [{ ... }],
  "conversations": [{ ... }]
}
```

## Environment Variables

### Backend (.env)
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name
- `OPENAI_API_KEY` - OpenAI API key for Whisper and GPT

## Test Credentials
- **Dashboard User**: test@example.com / password123
- **User ID**: 69946b3d5920418d9da30fc7
- **Test Device Code**: 416100

## Upcoming Tasks (P2)
1. Update mobile app to show device code and OTP entry screen
2. Re-enable automatic transcription on file upload
3. Video overlays (timestamp, watermark, branding)

## Future Tasks (P3)
1. Refactor server.py into separate modules
2. Break down frontend/app/index.tsx into components
3. Add email verification for signup
4. Add password reset flow
