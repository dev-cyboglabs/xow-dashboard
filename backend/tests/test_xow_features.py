"""
XoW - Expo Stall Recording System - Feature Tests
Tests for: Dashboard login/signup, Add device flow, Recordings, Upload, Mobile registration
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://xow-expo-stalls.preview.emergentagent.com').rstrip('/')

class TestHealthCheck:
    """Health check endpoint test"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("PASS: Health endpoint returns healthy status")


class TestDashboardAuth:
    """Dashboard authentication tests - signup and login"""
    
    def test_signup_success(self):
        """Test dashboard user signup"""
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User"
        }
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json=payload, timeout=10)
        assert response.status_code == 200, f"Signup failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert "user" in data
        assert data["user"]["email"] == unique_email.lower()
        print(f"PASS: Signup successful for {unique_email}")
        return data["user"]
    
    def test_signup_duplicate_email(self):
        """Test signup with existing email fails"""
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User"
        }
        # First signup
        requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json=payload, timeout=10)
        # Second signup with same email should fail
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json=payload, timeout=10)
        assert response.status_code == 400
        print("PASS: Duplicate email signup correctly rejected")
    
    def test_login_success(self):
        """Test dashboard user login"""
        # First create a user
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User"
        }
        signup_resp = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json=payload, timeout=10)
        assert signup_resp.status_code == 200
        
        # Now login
        login_payload = {
            "email": unique_email,
            "password": "testpass123"
        }
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/login", json=login_payload, timeout=10)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert "user" in data
        assert data["user"]["email"] == unique_email.lower()
        print(f"PASS: Login successful for {unique_email}")
        return data["user"]
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password fails"""
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        }, timeout=10)
        assert response.status_code == 401
        print("PASS: Invalid credentials correctly rejected")


class TestMobileDeviceRegistration:
    """Mobile device registration tests"""
    
    def test_register_mobile_device(self):
        """Test mobile device registration returns 6-digit code"""
        response = requests.post(f"{BASE_URL}/api/mobile/register-device?device_name=Test%20Device", timeout=10)
        assert response.status_code == 200, f"Device registration failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert "device_code" in data
        assert len(data["device_code"]) == 6
        assert data["device_code"].isdigit()
        print(f"PASS: Mobile device registered with code {data['device_code']}")
        return data["device_code"]
    
    def test_register_multiple_devices(self):
        """Test multiple devices get unique codes"""
        codes = set()
        for i in range(3):
            response = requests.post(f"{BASE_URL}/api/mobile/register-device?device_name=Device_{i}", timeout=10)
            assert response.status_code == 200
            data = response.json()
            codes.add(data["device_code"])
        assert len(codes) == 3, "Device codes should be unique"
        print("PASS: Multiple devices get unique codes")


class TestDashboardAddDevice:
    """Dashboard add device flow tests - THIS IS THE CRITICAL FLOW TO TEST"""
    
    def test_add_device_flow(self):
        """Test the complete add device flow: signup -> register device -> add device with OTP"""
        # Step 1: Create a dashboard user
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        signup_resp = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User"
        }, timeout=10)
        assert signup_resp.status_code == 200, f"Signup failed: {signup_resp.text}"
        user_id = signup_resp.json()["user"]["id"]
        print(f"Step 1 PASS: Created user with ID {user_id}")
        
        # Step 2: Register a mobile device (this is done on mobile app)
        device_resp = requests.post(f"{BASE_URL}/api/mobile/register-device?device_name=Test%20Mobile", timeout=10)
        assert device_resp.status_code == 200, f"Device registration failed: {device_resp.text}"
        device_code = device_resp.json()["device_code"]
        print(f"Step 2 PASS: Mobile device registered with code {device_code}")
        
        # Step 3: Add device to dashboard account (this is done on dashboard)
        add_device_resp = requests.post(
            f"{BASE_URL}/api/dashboard/devices/add?user_id={user_id}",
            json={"device_code": device_code},
            timeout=10
        )
        assert add_device_resp.status_code == 200, f"Add device failed: {add_device_resp.text}"
        add_result = add_device_resp.json()
        assert add_result["success"] == True
        assert "otp" in add_result
        assert len(add_result["otp"]) == 8
        assert add_result["otp"].isdigit()
        print(f"Step 3 PASS: OTP generated: {add_result['otp']}")
        
        return {
            "user_id": user_id,
            "device_code": device_code,
            "otp": add_result["otp"]
        }
    
    def test_add_device_invalid_code(self):
        """Test adding device with invalid code fails"""
        # Create user
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        signup_resp = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User"
        }, timeout=10)
        user_id = signup_resp.json()["user"]["id"]
        
        # Try to add device with non-existent code
        response = requests.post(
            f"{BASE_URL}/api/dashboard/devices/add?user_id={user_id}",
            json={"device_code": "999999"},
            timeout=10
        )
        assert response.status_code == 404
        print("PASS: Invalid device code correctly rejected")
    
    def test_add_device_invalid_user(self):
        """Test adding device with invalid user ID fails"""
        # Register a device first
        device_resp = requests.post(f"{BASE_URL}/api/mobile/register-device", timeout=10)
        device_code = device_resp.json()["device_code"]
        
        # Try to add with invalid user ID
        response = requests.post(
            f"{BASE_URL}/api/dashboard/devices/add?user_id=invalid_user_id",
            json={"device_code": device_code},
            timeout=10
        )
        assert response.status_code in [400, 404]
        print("PASS: Invalid user ID correctly rejected")
    
    def test_verify_otp_flow(self):
        """Test complete OTP verification flow"""
        # Create the add device flow first
        result = self.test_add_device_flow()
        
        # Now verify the OTP
        verify_resp = requests.post(
            f"{BASE_URL}/api/mobile/verify-otp?device_code={result['device_code']}&otp={result['otp']}",
            timeout=10
        )
        assert verify_resp.status_code == 200, f"OTP verification failed: {verify_resp.text}"
        verify_result = verify_resp.json()
        assert verify_result["success"] == True
        print("PASS: OTP verification successful")
        
        # Verify device is now associated with user
        devices_resp = requests.get(f"{BASE_URL}/api/dashboard/devices/{result['user_id']}", timeout=10)
        assert devices_resp.status_code == 200
        devices_data = devices_resp.json()
        device_codes = [d["device_code"] for d in devices_data["devices"]]
        assert result["device_code"] in device_codes, "Device should be in user's device list"
        print("PASS: Device correctly associated with user after OTP verification")
    
    def test_verify_otp_invalid(self):
        """Test OTP verification with wrong OTP fails"""
        # Create user and register device
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        signup_resp = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User"
        }, timeout=10)
        user_id = signup_resp.json()["user"]["id"]
        
        device_resp = requests.post(f"{BASE_URL}/api/mobile/register-device", timeout=10)
        device_code = device_resp.json()["device_code"]
        
        # Add device to get OTP
        requests.post(
            f"{BASE_URL}/api/dashboard/devices/add?user_id={user_id}",
            json={"device_code": device_code},
            timeout=10
        )
        
        # Try wrong OTP
        response = requests.post(
            f"{BASE_URL}/api/mobile/verify-otp?device_code={device_code}&otp=00000000",
            timeout=10
        )
        assert response.status_code == 401
        print("PASS: Invalid OTP correctly rejected")


class TestRecordingsCRUD:
    """Recordings CRUD operations tests"""
    
    def test_create_recording(self):
        """Test creating a new recording"""
        payload = {
            "device_id": f"test_device_{uuid.uuid4().hex[:8]}",
            "expo_name": "Test Expo 2025",
            "booth_name": "Test Booth"
        }
        response = requests.post(f"{BASE_URL}/api/recordings", json=payload, timeout=10)
        assert response.status_code == 200, f"Create recording failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["status"] == "recording"
        assert data["booth_name"] == "Test Booth"
        print(f"PASS: Recording created with ID {data['id']}")
        return data["id"]
    
    def test_get_recording(self):
        """Test retrieving a recording by ID"""
        # Create first
        rec_id = self.test_create_recording()
        
        # Get it
        response = requests.get(f"{BASE_URL}/api/recordings/{rec_id}", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == rec_id
        print(f"PASS: Recording {rec_id} retrieved successfully")
    
    def test_list_recordings(self):
        """Test listing recordings"""
        response = requests.get(f"{BASE_URL}/api/recordings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: Listed {len(data)} recordings")
    
    def test_complete_recording(self):
        """Test marking recording as complete"""
        rec_id = self.test_create_recording()
        
        response = requests.put(f"{BASE_URL}/api/recordings/{rec_id}/complete", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        print(f"PASS: Recording {rec_id} marked as completed")
    
    def test_delete_recording(self):
        """Test deleting a recording"""
        rec_id = self.test_create_recording()
        
        response = requests.delete(f"{BASE_URL}/api/recordings/{rec_id}", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        # Verify it's deleted
        get_resp = requests.get(f"{BASE_URL}/api/recordings/{rec_id}", timeout=10)
        assert get_resp.status_code == 404
        print(f"PASS: Recording {rec_id} deleted successfully")


class TestUploadEndpoints:
    """Video and audio upload endpoint tests"""
    
    def test_video_upload_endpoint_exists(self):
        """Test video upload endpoint accepts POST requests"""
        # Create a recording first
        rec_resp = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": "test_device",
            "expo_name": "Test Expo",
            "booth_name": "Test Booth"
        }, timeout=10)
        rec_id = rec_resp.json()["id"]
        
        # Try uploading without file (should get error about missing file, not 404)
        response = requests.post(f"{BASE_URL}/api/recordings/{rec_id}/upload-video", timeout=10)
        # 422 = Unprocessable Entity (missing required file) - this means endpoint exists
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: Video upload endpoint exists and requires file")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/recordings/{rec_id}")
    
    def test_audio_upload_endpoint_exists(self):
        """Test audio upload endpoint accepts POST requests"""
        rec_resp = requests.post(f"{BASE_URL}/api/recordings", json={
            "device_id": "test_device",
            "expo_name": "Test Expo",
            "booth_name": "Test Booth"
        }, timeout=10)
        rec_id = rec_resp.json()["id"]
        
        # Try uploading without file
        response = requests.post(f"{BASE_URL}/api/recordings/{rec_id}/upload-audio", timeout=10)
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: Audio upload endpoint exists and requires file")
        
        requests.delete(f"{BASE_URL}/api/recordings/{rec_id}")


class TestDashboardDataEndpoints:
    """Dashboard data API tests"""
    
    def test_dashboard_insights(self):
        """Test dashboard insights endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/insights", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert "total_recordings" in data
        assert "total_visitors" in data
        assert "total_duration_hours" in data
        print(f"PASS: Dashboard insights - {data['total_recordings']} recordings, {data['total_visitors']} visitors")
    
    def test_dashboard_recordings(self):
        """Test dashboard recordings endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: Dashboard recordings returns {len(data)} items")
    
    def test_dashboard_visitors(self):
        """Test dashboard visitors endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/visitors", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: Dashboard visitors returns {len(data)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
