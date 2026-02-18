"""
Backend API Tests for XoW Dashboard
Tests dashboard endpoints, recordings, visitors, and video upload functionality
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://visitor-playback-dev.preview.emergentagent.com').rstrip('/')


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        print(f"PASS: Health check returned status={data['status']}")


class TestDashboardInsights:
    """Dashboard insights endpoint tests"""
    
    def test_insights_returns_data(self):
        """Test /api/dashboard/insights returns stats data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/insights", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "total_recordings" in data
        assert "total_visitors" in data
        assert "total_duration_hours" in data
        assert "top_topics" in data
        assert "top_questions" in data
        assert "recent_activity" in data
        
        # Data type validation
        assert isinstance(data["total_recordings"], int)
        assert isinstance(data["total_visitors"], int)
        assert isinstance(data["total_duration_hours"], (int, float))
        assert isinstance(data["top_topics"], list)
        assert isinstance(data["recent_activity"], list)
        
        print(f"PASS: Dashboard insights returned {data['total_recordings']} recordings, {data['total_visitors']} visitors")


class TestDashboardRecordings:
    """Dashboard recordings endpoint tests"""
    
    def test_recordings_list(self):
        """Test /api/dashboard/recordings returns recordings list"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"PASS: Dashboard recordings returned {len(data)} recordings")
        
        # If recordings exist, validate structure
        if len(data) > 0:
            recording = data[0]
            assert "id" in recording
            assert "booth_name" in recording
            assert "start_time" in recording
            assert "status" in recording
            assert "has_video" in recording
            assert "has_audio" in recording
            print(f"PASS: Recording structure validated - booth: {recording.get('booth_name')}")


class TestDashboardVisitors:
    """Dashboard visitors endpoint tests"""
    
    def test_visitors_list(self):
        """Test /api/dashboard/visitors returns visitors list"""
        response = requests.get(f"{BASE_URL}/api/dashboard/visitors", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"PASS: Dashboard visitors returned {len(data)} visitors")


class TestRecordingsAPI:
    """Recordings CRUD endpoints tests"""
    
    def test_get_recordings(self):
        """Test GET /api/recordings returns list"""
        response = requests.get(f"{BASE_URL}/api/recordings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/recordings returned {len(data)} recordings")
    
    def test_create_recording(self):
        """Test POST /api/recordings creates new recording"""
        payload = {
            "device_id": "TEST_device_123",
            "expo_name": "TEST Expo 2026",
            "booth_name": "TEST Booth"
        }
        response = requests.post(f"{BASE_URL}/api/recordings", json=payload, timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["device_id"] == payload["device_id"]
        assert data["expo_name"] == payload["expo_name"]
        assert data["booth_name"] == payload["booth_name"]
        assert data["status"] == "recording"
        
        recording_id = data["id"]
        print(f"PASS: Created recording with id={recording_id}")
        
        # Cleanup - complete and delete the recording
        try:
            requests.put(f"{BASE_URL}/api/recordings/{recording_id}/complete")
            requests.delete(f"{BASE_URL}/api/recordings/{recording_id}")
            print(f"PASS: Cleaned up test recording {recording_id}")
        except Exception as e:
            print(f"WARN: Cleanup failed: {e}")
    
    def test_get_single_recording(self):
        """Test GET /api/recordings/:id returns specific recording"""
        # First create a test recording
        payload = {
            "device_id": "TEST_get_single",
            "expo_name": "TEST Expo",
            "booth_name": "TEST Booth Single"
        }
        create_response = requests.post(f"{BASE_URL}/api/recordings", json=payload)
        recording_id = create_response.json()["id"]
        
        # Get the recording
        response = requests.get(f"{BASE_URL}/api/recordings/{recording_id}", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == recording_id
        assert data["booth_name"] == payload["booth_name"]
        print(f"PASS: GET /api/recordings/{recording_id} returned correct data")
        
        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/recordings/{recording_id}")
        except:
            pass


class TestDashboardAuth:
    """Dashboard authentication endpoint tests"""
    
    def test_signup_and_login(self):
        """Test signup and login flow"""
        import uuid
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.com"
        
        # Signup
        signup_payload = {
            "email": unique_email,
            "password": "testpassword123",
            "name": "Test User"
        }
        signup_response = requests.post(
            f"{BASE_URL}/api/dashboard/auth/signup",
            json=signup_payload,
            timeout=10
        )
        assert signup_response.status_code == 200
        signup_data = signup_response.json()
        assert signup_data["success"] == True
        assert "user" in signup_data
        print(f"PASS: Signup successful for {unique_email}")
        
        # Login
        login_payload = {
            "email": unique_email,
            "password": "testpassword123"
        }
        login_response = requests.post(
            f"{BASE_URL}/api/dashboard/auth/login",
            json=login_payload,
            timeout=10
        )
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert login_data["success"] == True
        print(f"PASS: Login successful for {unique_email}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        login_payload = {
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        }
        response = requests.post(
            f"{BASE_URL}/api/dashboard/auth/login",
            json=login_payload,
            timeout=10
        )
        assert response.status_code == 401
        print("PASS: Invalid login returns 401")


class TestVisitorsAPI:
    """Visitors endpoint tests"""
    
    def test_get_all_visitors(self):
        """Test GET /api/visitors returns visitor list"""
        response = requests.get(f"{BASE_URL}/api/visitors", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/visitors returned {len(data)} visitors")


class TestBarcodesAPI:
    """Barcodes endpoint tests"""
    
    def test_create_barcode_scan(self):
        """Test POST /api/barcodes creates barcode scan"""
        # First create a test recording
        recording_payload = {
            "device_id": "TEST_barcode_device",
            "expo_name": "TEST Expo",
            "booth_name": "TEST Barcode Booth"
        }
        recording_response = requests.post(f"{BASE_URL}/api/recordings", json=recording_payload)
        recording_id = recording_response.json()["id"]
        
        # Create barcode scan
        barcode_payload = {
            "recording_id": recording_id,
            "barcode_data": "TEST_VISITOR_001",
            "video_timestamp": 10.5,
            "frame_code": 315
        }
        response = requests.post(f"{BASE_URL}/api/barcodes", json=barcode_payload, timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        assert data["barcode_data"] == barcode_payload["barcode_data"]
        assert data["video_timestamp"] == barcode_payload["video_timestamp"]
        print(f"PASS: Created barcode scan for recording {recording_id}")
        
        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/recordings/{recording_id}")
        except:
            pass


class TestVideoUploadEndpoint:
    """Video upload endpoint tests"""
    
    def test_upload_video_endpoint_exists(self):
        """Test that video upload endpoint exists and accepts POST"""
        # Create a test recording first
        recording_payload = {
            "device_id": "TEST_video_upload",
            "expo_name": "TEST Expo",
            "booth_name": "TEST Video Booth"
        }
        recording_response = requests.post(f"{BASE_URL}/api/recordings", json=recording_payload)
        recording_id = recording_response.json()["id"]
        
        # Try uploading a minimal valid video file
        # Create a minimal MP4 file header (not a full valid video, just to test endpoint)
        video_data = b'\x00\x00\x00\x1c\x66\x74\x79\x70\x69\x73\x6f\x6d'  # Minimal ftyp box
        
        files = {
            'video': ('test.mp4', io.BytesIO(video_data), 'video/mp4')
        }
        data = {
            'chunk_index': '0',
            'total_chunks': '1'
        }
        
        # The endpoint should accept the request (may fail processing, but should not 404)
        response = requests.post(
            f"{BASE_URL}/api/recordings/{recording_id}/upload-video",
            files=files,
            data=data,
            timeout=30
        )
        
        # Endpoint should exist and accept request (200 or 400, not 404)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        print(f"PASS: Video upload endpoint accepts POST requests, status={response.status_code}")
        
        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/recordings/{recording_id}")
        except:
            pass


class TestMobileDeviceAPI:
    """Mobile device registration endpoint tests"""
    
    def test_register_mobile_device(self):
        """Test /api/mobile/register-device generates 6-digit code"""
        response = requests.post(
            f"{BASE_URL}/api/mobile/register-device",
            params={"device_name": "TEST Mobile Device"},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "device_code" in data
        assert len(data["device_code"]) == 6
        assert data["device_code"].isdigit()
        
        print(f"PASS: Mobile device registered with code {data['device_code']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
