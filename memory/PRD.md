# XoW - Expo Stall Recording System

## Original Problem Statement
Build a system named "XoW" for expo stalls with mobile app recording and web dashboard analysis.

## Latest Session Updates (Feb 18, 2026)

### Completed Tasks

1. **Orange Theme - Mobile App** ✅
   - Updated all purple (#8B5CF6) colors to orange (#E54B2A)
   - Files updated: recorder.tsx, gallery.tsx, index.tsx, settings.tsx
   - Elements: watermark, buttons, icons, brand badges, progress bars, stats

2. **Orange Theme - Web Dashboard** ✅
   - Homepage and Dashboard fully use Zoho-like orange/red theme
   - All violet/purple colors replaced

3. **FFmpeg Installation** ✅
   - FFmpeg 5.1.8 installed on server
   - Video overlay now works correctly

4. **Video Overlay Configuration** ✅
   - XoW logo uses orange color (0xE54B2A)
   - Overlay includes: date, time, timecode, REC indicator, frame count, booth name

### Video Overlay Layout (FFmpeg)
```
┌─────────────────────────────────────────────────┐
│ ┌────────────┐                    ┌──────────┐ │
│ │ 2026-02-18 │                    │ F: 1234  │ │
│ │ 03:46 REC  │                    └──────────┘ │
│ │ 00:00:02   │                                 │
│ └────────────┘                                 │
│                                                │
│                  VIDEO CONTENT                 │
│                                                │
│ ┌──────────────┐                  ┌─────────┐ │
│ │ Booth Name   │                  │  XoW    │ │ <- Orange
│ └──────────────┘                  └─────────┘ │
└─────────────────────────────────────────────────┘
```

**Note:** The video overlay is **burned into the video file** during upload via FFmpeg. It is NOT an HTML overlay in the dashboard. To see the overlay, upload a new video from the mobile app.

## Test Status (Latest)
- Backend: 100% pass (8/8 API tests)
- Frontend: 100% pass (homepage, dashboard, mobile app colors verified)
- FFmpeg: Installed and working
- Database: Currently empty (0 recordings)

## Architecture
```
/app
├── backend/
│   ├── static/
│   │   ├── index.html      # Orange theme homepage
│   │   └── dashboard.html  # Orange theme dashboard
│   ├── server.py           # FFmpeg overlay with orange XoW logo
│   └── .env
└── frontend/
    ├── app/
    │   ├── recorder.tsx    # Orange theme (#E54B2A)
    │   ├── gallery.tsx     # Orange theme (#E54B2A)
    │   ├── index.tsx       # Orange theme (#E54B2A)
    │   └── settings.tsx    # Orange theme (#E54B2A)
    └── package.json
```

## Color Scheme
- **Primary**: #E54B2A (Orange/Red - Zoho-like)
- **Replaced**: #8B5CF6 (Purple - no longer used)
- **Accent**: #EF4444 (Red for REC indicator)
- **Success**: #10B981 (Green for online status)

## URLs
- Homepage: /api/home
- Dashboard: /api/dashboard
- Preview: https://visitor-playback-dev.preview.emergentagent.com

## Upcoming Tasks
- P2: Barcode scanning integration
- P2: Enhanced Session Summary AI
- Refactor: Modularize server.py into routes/services
- Refactor: Break down dashboard.html JavaScript
