# XoW - Expo Stall Recording System

## Original Problem Statement
Build a system named "XoW" for expo stalls. The core functionality involves recording video/audio via a mobile app and analyzing it on a web dashboard.

## User Requirements (Latest - Feb 18, 2026)

### Mobile App Requirements
1. **Local Storage First**: Don't auto-upload to cloud after recording
2. **Manual Upload**: Add "Upload to Cloud" button with manual control
3. **Storage Settings**: Option to choose storage location (internal/external/documents)
4. **Barcode Integration**: Upload barcode data along with recordings, correlate in cloud

### Dashboard Requirements
1. **Video Timestamp Seeking**: Click on speaker/topic segments to jump to that timestamp - IMPLEMENTED
2. **Visitor Conversation Labels**: Show conversation labels with summary and Play button - IMPLEMENTED
3. **Session Summary Only**: Show overall AI summary, hide speaker-by-speaker details - IMPLEMENTED
4. **Video Overlay**: Burn timecode, watermark, booth name into uploaded videos - IMPLEMENTED

## What's Been Implemented

### Backend (FastAPI + MongoDB)
- User authentication (login/signup)
- Device management with OTP verification
- Recording CRUD operations
- Video/Audio file upload with GridFS storage
- **Video remuxing** with `+faststart` flag for web seeking
- **Video overlay** with ffmpeg (timecode, booth name, XoW watermark, frame counter)
- Audio extraction from video using FFmpeg
- OpenAI Whisper transcription
- GPT-4 conversation analysis (speakers, topics, summaries)
- Barcode scanning data storage
- Dashboard data APIs (insights, recordings, visitors)
- MongoDB ObjectId serialization (recursive serialize_value function)
- None duration handling in insights aggregation

### Frontend - Mobile App (React Native/Expo)
- Device registration and OTP verification
- Video/audio recording with camera
- Local storage with manual cloud upload (recorder.tsx, gallery.tsx)
- Storage location settings (settings.tsx)
- Barcode scanning during recording
- Gallery view with local/cloud recordings
- Upload progress tracking

### Frontend - Web Dashboard
- Landing page with product info
- Login/signup authentication
- **Overview** with stats (sessions, visitors, duration, AI processed)
- **Sessions** list with AI summaries only (no speaker breakdown) - UPDATED
- **Visitors** with conversation labels, Play button, and start time - NEW
- Audio/video playback modal with timestamp seeking
- Transcript display with translation
- Device management panel

## API Endpoints

### Authentication
- `POST /api/dashboard/auth/signup` - Create account
- `POST /api/dashboard/auth/login` - Login

### Dashboard Data
- `GET /api/dashboard/insights` - Aggregated stats
- `GET /api/dashboard/recordings` - All recordings with details including visitors
- `GET /api/dashboard/visitors` - Visitor badges

### Recordings
- `POST /api/recordings` - Create recording
- `GET /api/recordings` - List recordings
- `POST /api/recordings/{id}/upload-video` - Upload video (overlay + remux)
- `POST /api/recordings/{id}/upload-audio` - Upload audio
- `GET /api/recordings/{id}/video` - Stream video with range support
- `GET /api/recordings/{id}/audio` - Stream audio with range support

### Device Management
- `POST /api/mobile/register-device` - Register mobile device
- `POST /api/mobile/verify-otp` - Verify OTP

## Test Results (Feb 18, 2026)
- **Backend**: 100% (12/12 tests passed)
- **Frontend**: 100% pass rate
- Sessions tab showing AI summary only (verified)
- Visitors tab showing conversation labels with Play buttons (verified)
- Video seeking working correctly (verified)

## Files Structure
```
/app
├── backend/
│   ├── static/
│   │   ├── dashboard.html (main dashboard with embedded JS)
│   │   └── index.html (home/landing page)
│   ├── tests/
│   │   └── test_dashboard_features.py
│   ├── .env (MONGO_URL, OPENAI_API_KEY)
│   ├── requirements.txt
│   └── server.py
├── frontend/
│   ├── app/
│   │   ├── index.tsx (device registration)
│   │   ├── recorder.tsx (camera + local save)
│   │   ├── gallery.tsx (recordings + cloud upload)
│   │   └── settings.tsx (storage preferences)
│   ├── .env (EXPO_PUBLIC_BACKEND_URL)
│   └── package.json
├── test_reports/
│   └── iteration_6.json
└── memory/
    └── PRD.md
```

## Completed Features (This Session)

### P0 - Critical (DONE)
1. **Video Overlay Fixed**: FFmpeg installed, font paths configured, proper logging added
2. **Visitor Conversation Labels**: New UI showing labels with summary, start time, and Play button
3. **Session Summary Only**: Simplified Sessions UI to show only AI summary, not speaker details

### P1 - Important
4. Android recording notice (development build required for video) - NOT IMPLEMENTED
5. Verify transcription saves to DB correctly - WORKING

## Upcoming Tasks

### P1 - Next Priority
1. Add Android Expo Go limitation message in mobile app
2. Fix intermittent "Text string must be in string component" error in mobile app

### P2 - Features
3. Integrate barcode scanning to associate scans with visitor conversations
4. Full dashboard redesign (more colorful/professional)

### P3 - Refactoring
5. Modularize server.py (split into routers)
6. Break down mobile app components

## Known Limitations
- Video recording requires Expo development build on Android (Expo Go doesn't support)
- Audio playback fallback to Download button in some browsers
- FFmpeg overlay may fail on corrupted input videos (falls back to original)
