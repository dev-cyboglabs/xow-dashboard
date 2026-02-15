# XoW - Expo Stall Recording & Analysis System

## Product Overview
XoW is a system for expo booths that records conversations and uses AI to analyze them. It consists of:
- **Android App**: For recording video/audio at expo booths
- **Web Dashboard**: For analyzing recordings with AI-powered insights

## Core Features Implemented

### 1. Automatic Transcription (Completed Dec 15, 2025)
- Audio files uploaded to backend are automatically transcribed using OpenAI Whisper API
- Transcription triggers automatically when audio is uploaded via `/api/recordings/{id}/upload-audio`
- Falls back to manual transcript entry if needed

### 2. AI Speaker Diarization (Completed Dec 15, 2025)
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

### 3. PLAUD-Style Dashboard UI (Completed Dec 15, 2025)
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

### 4. Video/Audio Playback with Timestamp Jumping
- Click any speaker's Play button to jump to their segment
- Click conversation cards to play from that timestamp
- Works with both video and audio-only recordings

## Tech Stack
- **Frontend**: React Native (Expo) for mobile, HTML/JS for web dashboard
- **Backend**: FastAPI (Python)
- **Database**: MongoDB with GridFS for media storage
- **AI**: OpenAI API (GPT-4o for analysis, Whisper for transcription)

## API Endpoints

### Recordings
- `POST /api/recordings` - Create new recording
- `GET /api/recordings` - List recordings
- `GET /api/recordings/{id}` - Get recording details
- `DELETE /api/recordings/{id}` - Delete recording
- `POST /api/recordings/{id}/upload-audio` - Upload audio (triggers auto-processing)
- `POST /api/recordings/{id}/upload-video` - Upload video
- `POST /api/recordings/{id}/manual-transcript` - Add transcript manually
- `POST /api/recordings/{id}/reprocess` - Re-run AI analysis
- `POST /api/recordings/{id}/translate` - Translate transcript

### Dashboard
- `GET /api/dashboard/insights` - Overview statistics
- `GET /api/dashboard/recordings` - List recordings with filters
- `GET /api/dashboard/visitors` - List visitor scans
- `GET /api/dashboard` - Serve dashboard HTML

## Data Model (recordings collection)
```javascript
{
  device_id: String,
  booth_name: String,
  expo_name: String,
  start_time: DateTime,
  end_time: DateTime,
  duration: Float,
  status: String, // recording, completed, uploaded, processing, processed, error
  
  // Media
  has_video: Boolean,
  has_audio: Boolean,
  video_file_id: String,
  audio_file_id: String,
  
  // Transcription
  transcript: String,
  translated_transcript: String,
  
  // AI Analysis - Summary
  summary: String,
  overall_summary: String,
  highlights: [String],
  visitor_interests: [String],
  key_questions: [String],
  main_topics: [String],
  follow_up_actions: [String],
  
  // AI Analysis - Speaker Diarization
  speakers: [{
    id: String,
    label: String,
    label_source: String, // name_mentioned, barcode_scan, auto_generated
    is_host: Boolean,
    company: String,
    role: String,
    dialogue_segments: [{
      start_percent: Number,
      end_percent: Number,
      start_time: Number,
      end_time: Number,
      content: String,
      timestamp_label: String
    }],
    topics_discussed: [String],
    questions_asked: [String],
    key_points: [String],
    sentiment: String,
    total_speaking_time_percent: Number
  }],
  host_identified: Boolean,
  total_speakers: Number,
  
  // Barcode Scans
  barcode_scans: [{
    barcode_data: String,
    visitor_name: String,
    scan_time: DateTime,
    video_timestamp: Number
  }]
}
```

## Upcoming Tasks (Backlog)

### P0 - Critical
(None - core features completed)

### P1 - High Priority
1. **Mobile App Recording**: Implement actual video/audio recording in React Native
2. **Mobile App Upload**: Upload recorded files to backend
3. **Video Overlay**: Add timestamp, watermark, "XoW" branding to video

### P2 - Medium Priority
1. **Barcode Scanner Integration**: Implement barcode scanning in mobile app
2. **Real-time Recording Status**: WebSocket updates for recording status

### P3 - Low Priority
1. **Code Refactoring**: Break down `frontend/app/index.tsx` into smaller components
2. **Backend Modularization**: Move AI processing to separate service files

## Testing Status
- Backend: Linting passed
- Frontend: 100% pass rate on visual/functional testing
- Test report: `/app/test_reports/iteration_1.json`

## Known Limitations
- Emergent LLM proxy is unreachable - using direct OpenAI API
- Speaker diarization accuracy depends on audio quality and distinct speaking patterns
- Mobile app recording functionality is placeholder only

## Configuration
Required environment variables in `backend/.env`:
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name
- `OPENAI_API_KEY` - OpenAI API key for Whisper and GPT
