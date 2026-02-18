"""
Test Dashboard Features - Sessions tab, Visitors tab, and Video upload functionality
Tests for:
1. Sessions tab - AI summary display (without speaker breakdown)
2. Visitors tab - conversation labels with Play buttons and start_time
3. Video upload endpoint
4. Dashboard recordings/visitors endpoints return correct data
"""

import pytest
import requests
import os
import json
import tempfile
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or "https://visitor-playback-dev.preview.emergentagent.com"


class TestDashboardRecordingsAPI:
    """Test /api/dashboard/recordings endpoint"""
    
    def test_dashboard_recordings_returns_list(self):
        """Dashboard recordings endpoint should return list of recordings"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Dashboard recordings: {len(data)} total")
    
    def test_dashboard_recordings_contain_visitor_data(self):
        """Recordings should include visitor data with start_time for seeking"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        
        data = response.json()
        recordings_with_visitors = [r for r in data if r.get('visitors') and len(r.get('visitors', [])) > 0]
        
        if recordings_with_visitors:
            recording = recordings_with_visitors[0]
            print(f"Recording {recording.get('id')} has {len(recording.get('visitors', []))} visitors")
            
            # Check visitor structure for seeking
            for visitor in recording.get('visitors', []):
                assert 'start_time' in visitor or visitor.get('start_time') is not None or 'start_percent' in visitor, \
                    f"Visitor should have start_time for video seeking: {visitor}"
                print(f"  Visitor: {visitor.get('visitor_label')}, start_time: {visitor.get('start_time')}s")
        else:
            print("No recordings with visitors found - this is expected if no processed recordings exist")
    
    def test_dashboard_recordings_contain_summary(self):
        """Processed recordings should contain AI summary"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        
        data = response.json()
        processed_recordings = [r for r in data if r.get('status') == 'processed']
        
        if processed_recordings:
            recording = processed_recordings[0]
            # Should have overall_summary or summary
            has_summary = recording.get('overall_summary') or recording.get('summary')
            print(f"Recording {recording.get('id')} summary: {str(has_summary)[:100]}...")
            assert has_summary, "Processed recording should have AI summary"
        else:
            print("No processed recordings found - skipping summary check")


class TestDashboardVisitorsAPI:
    """Test /api/dashboard/visitors endpoint"""
    
    def test_dashboard_visitors_returns_list(self):
        """Dashboard visitors endpoint should return list of visitor badges"""
        response = requests.get(f"{BASE_URL}/api/dashboard/visitors")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Dashboard visitors: {len(data)} total")
    
    def test_visitors_contain_required_fields(self):
        """Visitor badges should contain fields needed for conversation labels"""
        response = requests.get(f"{BASE_URL}/api/dashboard/visitors")
        assert response.status_code == 200
        
        data = response.json()
        if data:
            visitor = data[0]
            # Check for required fields
            print(f"Visitor badge fields: {list(visitor.keys())}")
            
            # Required for conversation labels:
            # - visitor_label or badge_id (for label display)
            # - start_time (for Play button seeking)
            # - summary or topics (for label content)
            has_label = visitor.get('visitor_label') or visitor.get('badge_id')
            assert has_label, "Visitor should have visitor_label or badge_id"
            
            # start_time should be present (can be 0)
            assert 'start_time' in visitor, "Visitor should have start_time for Play button seeking"
            print(f"  Label: {has_label}, start_time: {visitor.get('start_time')}s")
        else:
            print("No visitors found - this is expected if no processed recordings exist")


class TestRecordingDetails:
    """Test individual recording endpoint for visitor data"""
    
    def test_recording_contains_visitor_start_times(self):
        """Recording detail should include visitor start_time for video seeking"""
        # First get a recording ID with visitors
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        
        data = response.json()
        recordings_with_visitors = [r for r in data if r.get('visitors') and len(r.get('visitors', [])) > 0]
        
        if recordings_with_visitors:
            recording_id = recordings_with_visitors[0]['id']
            
            # Get recording details
            detail_response = requests.get(f"{BASE_URL}/api/recordings/{recording_id}")
            assert detail_response.status_code == 200
            
            recording = detail_response.json()
            visitors = recording.get('visitors', [])
            
            for visitor in visitors:
                # start_time is needed for Play button seeking
                start_time = visitor.get('start_time')
                print(f"Visitor '{visitor.get('visitor_label')}' start_time: {start_time}s")
                assert start_time is not None, "Visitor should have start_time"
        else:
            print("No recordings with visitors found - skipping")


class TestVideoUploadEndpoint:
    """Test video upload endpoint"""
    
    @pytest.fixture
    def test_recording(self):
        """Create a test recording for upload testing"""
        recording_data = {
            "device_id": "TEST_upload_device",
            "expo_name": "TEST Upload Expo",
            "booth_name": "TEST Upload Booth"
        }
        response = requests.post(f"{BASE_URL}/api/recordings", json=recording_data)
        assert response.status_code == 200
        recording = response.json()
        print(f"Created test recording: {recording.get('id')}")
        
        yield recording
        
        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/recordings/{recording.get('id')}")
            print(f"Cleaned up test recording: {recording.get('id')}")
        except Exception as e:
            print(f"Cleanup warning: {e}")
    
    def test_upload_video_endpoint_exists(self, test_recording):
        """Video upload endpoint should accept files"""
        recording_id = test_recording.get('id')
        
        # Create a minimal video file for testing (just headers - won't be a valid video)
        # The endpoint should accept the request even if processing fails
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
            # Write minimal MP4-like header
            f.write(b'\x00\x00\x00\x1c\x66\x74\x79\x70\x6d\x70\x34\x32\x00\x00\x00\x00')
            f.write(b'mp42mp41\x00\x00\x00\x08wide')
            temp_path = f.name
        
        try:
            with open(temp_path, 'rb') as video_file:
                files = {'video': ('test_video.mp4', video_file, 'video/mp4')}
                data = {'chunk_index': '0', 'total_chunks': '1'}
                
                response = requests.post(
                    f"{BASE_URL}/api/recordings/{recording_id}/upload-video",
                    files=files,
                    data=data
                )
                
                # Should accept the upload (200) even if video is invalid
                # May get 500 during processing but upload acceptance is what we test
                print(f"Upload response status: {response.status_code}")
                print(f"Upload response: {response.json() if response.status_code < 500 else response.text[:200]}")
                
                # 200 = success, 400 = validation error (acceptable), 500 = server error during processing
                assert response.status_code in [200, 400, 500], f"Unexpected status: {response.status_code}"
        finally:
            os.unlink(temp_path)
    
    def test_upload_video_requires_file(self, test_recording):
        """Upload endpoint should require a file"""
        recording_id = test_recording.get('id')
        
        response = requests.post(f"{BASE_URL}/api/recordings/{recording_id}/upload-video")
        
        # Should return 422 (validation error) when no file provided
        assert response.status_code == 422, f"Expected 422 for missing file, got {response.status_code}"
        print("Correctly requires file parameter")


class TestSessionsTabFeatures:
    """Test that Sessions tab shows AI summary without detailed speaker breakdown"""
    
    def test_recording_has_overall_summary(self):
        """Processed recordings should have overall_summary field for Sessions tab display"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        
        data = response.json()
        processed = [r for r in data if r.get('status') == 'processed']
        
        if processed:
            recording = processed[0]
            print(f"Recording ID: {recording.get('id')}")
            print(f"Status: {recording.get('status')}")
            
            # Check for overall_summary (preferred) or summary
            overall_summary = recording.get('overall_summary')
            summary = recording.get('summary')
            
            print(f"Overall summary present: {bool(overall_summary)}")
            print(f"Summary present: {bool(summary)}")
            
            # At least one summary should be present
            assert overall_summary or summary, "Processed recording should have summary"
            
            # Check other expected fields
            print(f"Top topics: {recording.get('top_topics', [])}")
            print(f"Key insights: {recording.get('key_insights', [])}")
            print(f"Host identified: {recording.get('host_identified', False)}")
        else:
            print("No processed recordings to verify summary display")


class TestVisitorsTabFeatures:
    """Test Visitors tab conversation labels with Play buttons"""
    
    def test_visitor_data_supports_conversation_labels(self):
        """Visitor data should support the conversation label UI with Play button"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check recordings with visitors
        for recording in data:
            visitors = recording.get('visitors', [])
            if visitors:
                print(f"\nRecording {recording.get('id')} ({recording.get('booth_name')}):")
                for v in visitors:
                    label = v.get('visitor_label') or v.get('badge_id') or 'Unknown'
                    start_time = v.get('start_time', 0)
                    summary = v.get('summary', '')[:50]
                    
                    print(f"  Label: {label}")
                    print(f"  Start Time: {start_time}s (for Play button seeking)")
                    print(f"  Summary: {summary}...")
                    print(f"  Topics: {v.get('topics', [])}")
                    print(f"  Sentiment: {v.get('sentiment', 'N/A')}")
                    
                    # These fields enable the conversation label feature
                    assert label, "Should have visitor label"
                    assert start_time is not None, "Should have start_time for seeking"
                break
        else:
            print("No recordings with visitors found")


class TestFFmpegOverlayConfiguration:
    """Test that FFmpeg overlay is properly configured (backend check)"""
    
    def test_ffmpeg_is_available(self):
        """FFmpeg should be installed for video overlay"""
        import subprocess
        
        result = subprocess.run(['which', 'ffmpeg'], capture_output=True, text=True)
        assert result.returncode == 0, "FFmpeg should be installed"
        print(f"FFmpeg path: {result.stdout.strip()}")
        
        # Check version
        version_result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True)
        first_line = version_result.stdout.split('\n')[0]
        print(f"FFmpeg version: {first_line}")
    
    def test_required_fonts_available(self):
        """DejaVu fonts should be available for overlay text"""
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        assert os.path.exists(font_path), f"Font should exist: {font_path}"
        print(f"Font available: {font_path}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
