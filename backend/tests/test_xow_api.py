"""
XoW Expo Recording System API Tests
Testing: Auth, Recordings, Barcodes, Dashboard endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://visitor-playback-dev.preview.emergentagent.com').rstrip('/')

# Test Device credentials
TEST_DEVICE_ID = f"TEST-DEVICE-{int(time.time())}"
TEST_PASSWORD = "test123"
TEST_BOOTH_NAME = "Test Booth A1"

# Demo device credentials from requirements
DEMO_DEVICE_ID = "DEMO-DEVICE-001"
DEMO_PASSWORD = "demo123"

class TestHealthEndpoints:
    """Health check endpoint tests"""
    
    def test_health_check(self):
        """Test /api/health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        print("✓ Health check passed")
    
    def test_root_endpoint(self):
        """Test /api/ root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "XoW Expo Recording System API"
        assert data["status"] == "online"
        print("✓ Root endpoint passed")


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_register_device(self):
        """Test device registration - POST /api/auth/register"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "device_id": TEST_DEVICE_ID,
            "password": TEST_PASSWORD,
            "name": TEST_BOOTH_NAME
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["device_id"] == TEST_DEVICE_ID
        assert data["name"] == TEST_BOOTH_NAME
        assert data["is_active"] == True
        print(f"✓ Device registration passed - ID: {data['id']}")
        return data
    
    def test_register_duplicate_device(self):
        """Test duplicate device registration should fail"""
        # First, ensure the device exists
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "device_id": TEST_DEVICE_ID,
            "password": TEST_PASSWORD,
            "name": TEST_BOOTH_NAME
        })
        
        # Try to register again - should fail
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "device_id": TEST_DEVICE_ID,
            "password": TEST_PASSWORD,
            "name": "Another Name"
        })
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"]
        print("✓ Duplicate device registration correctly rejected")
    
    def test_login_success(self):
        """Test successful device login - POST /api/auth/login"""
        # First ensure device exists
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "device_id": TEST_DEVICE_ID,
            "password": TEST_PASSWORD,
            "name": TEST_BOOTH_NAME
        })
        
        # Now login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "device_id": TEST_DEVICE_ID,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "device" in data
        assert data["device"]["device_id"] == TEST_DEVICE_ID
        assert data["message"] == "Login successful"
        print("✓ Device login passed")
        return data["device"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "device_id": "NONEXISTENT-DEVICE",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        assert "Invalid device ID or password" in response.json()["detail"]
        print("✓ Invalid login correctly rejected")
    
    def test_demo_device_login(self):
        """Test demo device login - DEMO-DEVICE-001 / demo123"""
        # First register demo device if not exists
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "device_id": DEMO_DEVICE_ID,
            "password": DEMO_PASSWORD,
            "name": "Demo Booth"
        })
        
        # Try to login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "device_id": DEMO_DEVICE_ID,
            "password": DEMO_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        print("✓ Demo device login passed")


class TestRecordingEndpoints:
    """Recording CRUD endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - ensure device exists"""
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "device_id": TEST_DEVICE_ID,
            "password": TEST_PASSWORD,
            "name": TEST_BOOTH_NAME
        })
    
    def test_create_recording(self):
        """Test create recording - POST /api/recordings"""
        response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Test Expo 2025",
            "booth_name": TEST_BOOTH_NAME
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["device_id"] == TEST_DEVICE_ID
        assert data["expo_name"] == "Test Expo 2025"
        assert data["booth_name"] == TEST_BOOTH_NAME
        assert data["status"] == "recording"
        assert data["has_video"] == False
        assert data["has_audio"] == False
        print(f"✓ Recording created - ID: {data['id']}")
        return data["id"]
    
    def test_get_recordings_list(self):
        """Test get all recordings - GET /api/recordings"""
        response = requests.get(f"{BASE_URL}/api/recordings")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got recordings list - count: {len(data)}")
    
    def test_get_recordings_by_device(self):
        """Test get recordings filtered by device - GET /api/recordings?device_id=..."""
        response = requests.get(f"{BASE_URL}/api/recordings", params={"device_id": TEST_DEVICE_ID})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All recordings should belong to the test device
        for rec in data:
            assert rec["device_id"] == TEST_DEVICE_ID
        print(f"✓ Got recordings by device - count: {len(data)}")
    
    def test_get_recording_by_id(self):
        """Test get specific recording - GET /api/recordings/{id}"""
        # First create a recording
        create_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Test Expo",
            "booth_name": "Test Booth"
        })
        recording_id = create_response.json()["id"]
        
        # Now get it
        response = requests.get(f"{BASE_URL}/api/recordings/{recording_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == recording_id
        print(f"✓ Got recording by ID: {recording_id}")
    
    def test_get_nonexistent_recording(self):
        """Test getting a nonexistent recording returns 404"""
        response = requests.get(f"{BASE_URL}/api/recordings/000000000000000000000000")
        assert response.status_code == 404
        print("✓ Nonexistent recording returns 404")
    
    def test_complete_recording(self):
        """Test complete recording - PUT /api/recordings/{id}/complete"""
        # Create a recording
        create_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Test Expo",
            "booth_name": "Test Booth"
        })
        recording_id = create_response.json()["id"]
        
        # Wait a bit to get some duration
        time.sleep(1)
        
        # Complete it
        response = requests.put(f"{BASE_URL}/api/recordings/{recording_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["duration"] is not None
        assert data["end_time"] is not None
        print(f"✓ Recording completed - duration: {data['duration']}s")
    
    def test_delete_recording(self):
        """Test delete recording - DELETE /api/recordings/{id}"""
        # Create a recording
        create_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "To Delete",
            "booth_name": "Test Booth"
        })
        recording_id = create_response.json()["id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/recordings/{recording_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        # Verify it's deleted
        get_response = requests.get(f"{BASE_URL}/api/recordings/{recording_id}")
        assert get_response.status_code == 404
        print(f"✓ Recording deleted and verified")
    
    def test_recording_status_endpoint(self):
        """Test get recording status - GET /api/recordings/{id}/status"""
        # Create a recording
        create_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Status Test",
            "booth_name": "Test Booth"
        })
        recording_id = create_response.json()["id"]
        
        # Get status
        response = requests.get(f"{BASE_URL}/api/recordings/{recording_id}/status")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == recording_id
        assert "status" in data
        assert "has_audio" in data
        assert "has_video" in data
        assert "has_transcript" in data
        print(f"✓ Recording status retrieved")


class TestBarcodeEndpoints:
    """Barcode scan endpoint tests"""
    
    def test_create_barcode_scan(self):
        """Test create barcode scan - POST /api/barcodes"""
        # First create a recording
        rec_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Barcode Test",
            "booth_name": "Test Booth"
        })
        recording_id = rec_response.json()["id"]
        
        # Create barcode scan
        response = requests.post(f"{BASE_URL}/api/barcodes", json={
            "recording_id": recording_id,
            "barcode_data": "VISITOR-12345",
            "visitor_name": "Test Visitor",
            "video_timestamp": 10.5,
            "frame_code": 315
        })
        assert response.status_code == 200
        data = response.json()
        assert data["barcode_data"] == "VISITOR-12345"
        assert data["recording_id"] == recording_id
        assert data["video_timestamp"] == 10.5
        print(f"✓ Barcode scan created")
    
    def test_get_barcodes_for_recording(self):
        """Test get barcodes for recording - GET /api/barcodes/{recording_id}"""
        # Create a recording
        rec_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Barcode List Test",
            "booth_name": "Test Booth"
        })
        recording_id = rec_response.json()["id"]
        
        # Create some barcodes
        for i in range(3):
            requests.post(f"{BASE_URL}/api/barcodes", json={
                "recording_id": recording_id,
                "barcode_data": f"VISITOR-{i}",
                "video_timestamp": i * 10
            })
        
        # Get barcodes
        response = requests.get(f"{BASE_URL}/api/barcodes/{recording_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3
        print(f"✓ Got barcodes for recording - count: {len(data)}")


class TestDashboardEndpoints:
    """Dashboard endpoint tests"""
    
    def test_dashboard_insights(self):
        """Test dashboard insights - GET /api/dashboard/insights"""
        response = requests.get(f"{BASE_URL}/api/dashboard/insights")
        assert response.status_code == 200
        data = response.json()
        assert "total_recordings" in data
        assert "total_visitors" in data
        assert "total_duration_hours" in data
        assert "top_topics" in data
        assert "recent_activity" in data
        print(f"✓ Dashboard insights retrieved - {data['total_recordings']} recordings")
    
    def test_dashboard_recordings(self):
        """Test dashboard recordings - GET /api/dashboard/recordings"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Dashboard recordings retrieved - count: {len(data)}")
    
    def test_dashboard_recordings_with_filter(self):
        """Test dashboard recordings with status filter"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings", params={"status": "processed"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned recordings should have processed status
        for rec in data:
            assert rec["status"] == "processed"
        print(f"✓ Dashboard filtered recordings - processed count: {len(data)}")
    
    def test_dashboard_visitors(self):
        """Test dashboard visitors - GET /api/dashboard/visitors"""
        response = requests.get(f"{BASE_URL}/api/dashboard/visitors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Dashboard visitors retrieved - count: {len(data)}")
    
    def test_dashboard_html(self):
        """Test dashboard HTML page - GET /api/dashboard"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "XoW" in response.text or "Dashboard" in response.text
        print("✓ Dashboard HTML page served")


class TestUploadEndpoints:
    """Upload endpoint tests (without actual file uploads)"""
    
    def test_upload_audio_no_file(self):
        """Test upload audio without file returns error"""
        rec_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Upload Test",
            "booth_name": "Test Booth"
        })
        recording_id = rec_response.json()["id"]
        
        # Try to upload without file - should fail with 422
        response = requests.post(f"{BASE_URL}/api/recordings/{recording_id}/upload-audio")
        assert response.status_code == 422  # Unprocessable Entity - missing file
        print("✓ Upload audio without file correctly returns 422")
    
    def test_upload_video_no_file(self):
        """Test upload video without file returns error"""
        rec_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Upload Test",
            "booth_name": "Test Booth"
        })
        recording_id = rec_response.json()["id"]
        
        # Try to upload without file - should fail with 422
        response = requests.post(f"{BASE_URL}/api/recordings/{recording_id}/upload-video")
        assert response.status_code == 422  # Unprocessable Entity - missing file
        print("✓ Upload video without file correctly returns 422")


class TestReprocessEndpoint:
    """Reprocess endpoint tests"""
    
    def test_reprocess_no_audio(self):
        """Test reprocess recording without audio returns error"""
        rec_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Reprocess Test",
            "booth_name": "Test Booth"
        })
        recording_id = rec_response.json()["id"]
        
        # Try to reprocess without audio
        response = requests.post(f"{BASE_URL}/api/recordings/{recording_id}/reprocess")
        assert response.status_code == 400
        assert "No audio file found" in response.json()["detail"]
        print("✓ Reprocess without audio correctly returns 400")


class TestManualTranscriptEndpoint:
    """Manual transcript endpoint tests"""
    
    def test_add_manual_transcript(self):
        """Test adding manual transcript - POST /api/recordings/{id}/manual-transcript"""
        rec_response = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": TEST_DEVICE_ID,
            "expo_name": "Manual Transcript Test",
            "booth_name": "Test Booth"
        })
        recording_id = rec_response.json()["id"]
        
        # Add manual transcript
        response = requests.post(f"{BASE_URL}/api/recordings/{recording_id}/manual-transcript", json={
            "transcript": "Hello, welcome to our booth. How can I help you today?"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        print("✓ Manual transcript added successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
