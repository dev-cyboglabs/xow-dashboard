# XoW - Expo Stall Recording System

## Original Problem Statement
Build a system named "XoW" for expo stalls. The core functionality involves recording video/audio via a mobile app and analyzing it on a web dashboard.

## Latest Session Updates (Feb 18, 2026)

### Fixed Issues
1. **Video Overlay** - Now matches mobile app style with:
   - DATE label and value (top-left)
   - TIME label and value (top-left)
   - TIMECODE running counter in red (top-left)
   - FRAME counter in purple (top-right)
   - REC indicator (top-right)
   - XoW logo with purple background (bottom-right)
   - Booth name centered at top

2. **Visitor Label Play Button** - Working correctly:
   - Shows Play button when recording has video/audio
   - Clicking opens video modal at the conversation's start timestamp
   - Video modal has "Jump to Segment" sidebar with Speakers and Conversations
   - Clicking segments seeks video to that timestamp

3. **Sessions Tab** - Shows only AI summary (no speaker breakdown)

## What's Been Implemented

### Backend (FastAPI + MongoDB)
- User authentication (login/signup)
- Device management with OTP verification
- Recording CRUD operations
- Video/Audio file upload with GridFS storage
- **Video overlay with FFmpeg** - mobile app style (DATE, TIME, TIMECODE, FRAME, XoW logo)
- **Video remuxing** with `+faststart` flag for web seeking
- Audio extraction from video
- OpenAI Whisper transcription
- GPT-4 conversation analysis (speakers, topics, summaries)
- Barcode scanning data storage
- Dashboard data APIs

### Frontend - Mobile App (React Native/Expo)
- Device registration and OTP verification
- Video/audio recording with camera
- Local storage with manual cloud upload
- Storage location settings
- Barcode scanning during recording
- Gallery view with local/cloud recordings
- Upload progress tracking
- **Live overlay display** (DATE, TIME, TIMECODE, FRAME, XoW logo)

### Frontend - Web Dashboard
- Overview with stats
- **Sessions** list with AI summaries only (no speaker breakdown)
- **Visitors** with conversation labels + Play button + Start Time
- **Video modal** with Jump to Segment sidebar (Speakers + Conversations)
- Audio/video playback with timestamp seeking
- Transcript display with translation
- Device management panel

## Test Results (Feb 18, 2026 - Iteration 7)
- **Backend**: 100% (12/12 tests passed)
- **Frontend**: 100% pass rate
- All features verified working:
  - Video overlay function ✅
  - Visitor label Play buttons ✅
  - Jump to Segment sidebar ✅
  - Sessions tab AI summary ✅
  - Video seeking ✅

## Files Structure
```
/app
├── backend/
│   ├── static/
│   │   ├── dashboard.html
│   │   └── index.html
│   ├── tests/
│   ├── .env
│   ├── requirements.txt
│   └── server.py
├── frontend/
│   ├── app/
│   │   ├── index.tsx
│   │   ├── recorder.tsx
│   │   ├── gallery.tsx
│   │   └── settings.tsx
│   ├── .env
│   └── package.json
└── test_reports/
    └── iteration_7.json
```

## Upcoming Tasks

### P1 - Next Priority
1. Add Android Expo Go limitation message
2. Fix "Text string must be in string component" error

### P2 - Features
3. Barcode scanning integration
4. Full dashboard redesign

### P3 - Refactoring
5. Modularize server.py
6. Break down mobile app components
