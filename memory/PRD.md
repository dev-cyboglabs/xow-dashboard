# XoW - Expo Stall Recording System

## Original Problem Statement
Build a system named "XoW" for expo stalls. The core functionality involves recording video/audio via a mobile app and analyzing it on a web dashboard.

## User Requirements (Latest - Feb 17, 2026)

### Mobile App Requirements
1. **Local Storage First**: Don't auto-upload to cloud after recording
2. **Manual Upload**: Add "Upload to Cloud" button with manual control
3. **Storage Settings**: Option to choose storage location (internal/external/documents)
4. **Barcode Integration**: Upload barcode data along with recordings, correlate in cloud

### Dashboard Requirements
1. **Video Timestamp Seeking**: Click on speaker/topic segments to jump to that timestamp
2. **Colorful Professional Design**: More vibrant than purple theme (currently implementing)
3. **Visitor Badges**: Display conversation summaries with visitor info
4. **Session Summaries**: Overview of video with key topics and customer questions

## What's Been Implemented

### Backend (FastAPI + MongoDB)
- ✅ User authentication (login/signup)
- ✅ Device management with OTP verification
- ✅ Recording CRUD operations
- ✅ Video/Audio file upload with GridFS storage
- ✅ **NEW**: Video remuxing with `+faststart` flag for web seeking
- ✅ Audio extraction from video using FFmpeg
- ✅ OpenAI Whisper transcription
- ✅ GPT-4 conversation analysis (speakers, topics, summaries)
- ✅ Barcode scanning data storage
- ✅ Dashboard data APIs (insights, recordings, visitors)
- ✅ **FIXED**: MongoDB ObjectId serialization (recursive serialize_value function)
- ✅ **FIXED**: None duration handling in insights aggregation

### Frontend - Mobile App (React Native/Expo)
- ✅ Device registration and OTP verification
- ✅ Video/audio recording with camera
- ✅ **NEW**: Local storage with manual cloud upload (recorder.tsx, gallery.tsx)
- ✅ **NEW**: Storage location settings (settings.tsx)
- ✅ Barcode scanning during recording
- ✅ Gallery view with local/cloud recordings
- ✅ Upload progress tracking

### Frontend - Web Dashboard
- ✅ Landing page with product info
- ✅ Login/signup authentication
- ✅ Overview with stats (sessions, visitors, duration, AI processed)
- ✅ Sessions list with AI summaries
- ✅ Audio/video playback modal
- ✅ Transcript display with translation
- ✅ Device management panel
- ✅ Visitors listing

## API Endpoints

### Authentication
- `POST /api/dashboard/auth/signup` - Create account
- `POST /api/dashboard/auth/login` - Login

### Dashboard Data
- `GET /api/dashboard/insights` - Aggregated stats
- `GET /api/dashboard/recordings` - All recordings with details
- `GET /api/dashboard/visitors` - Visitor badges

### Recordings
- `POST /api/recordings` - Create recording
- `GET /api/recordings` - List recordings
- `POST /api/recordings/{id}/upload-video` - Upload video (remuxed with faststart)
- `POST /api/recordings/{id}/upload-audio` - Upload audio
- `GET /api/recordings/{id}/video` - Stream video
- `GET /api/recordings/{id}/audio` - Stream audio

### Device Management
- `POST /api/mobile/register-device` - Register mobile device
- `POST /api/mobile/verify-otp` - Verify OTP

## Test Results (Feb 17, 2026)
- **Backend**: 100% (13/13 tests passed)
- **Frontend**: 100% pass rate
- All dashboard APIs working correctly
- Login/signup flow verified
- Video upload accepting files

## Files Structure
```
/app
├── backend/
│   ├── static/
│   │   ├── dashboard.html, dashboard.css (main dashboard)
│   │   ├── auth.html (login/signup)
│   │   └── home.html (landing page)
│   ├── tests/
│   │   └── test_dashboard_api.py
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
│   ├── iteration_3.json
│   └── iteration_4.json
└── memory/
    └── PRD.md
```

## Upcoming Tasks (Prioritized)

### P0 - Critical
1. ~~Fix iOS video uploads~~ ✅ Refactored with expo-file-system/next
2. ~~Fix backend serialization~~ ✅ serialize_value handles nested objects
3. Test video timestamp seeking on dashboard with uploaded video

### P1 - Important  
4. Android recording notice (development build required for video)
5. Verify transcription saves to DB correctly
6. Colorful dashboard redesign

### P2 - Features
7. Visitor badge UI on dashboard
8. Session summaries with key topics
9. Barcode-to-visitor correlation

## Known Limitations
- Video recording requires Expo development build on Android (Expo Go doesn't support)
- Audio playback fallback to Download button in some browsers
