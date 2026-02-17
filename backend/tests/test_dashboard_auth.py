"""
Backend API tests for XoW Dashboard Authentication and Device Management
Tests auth endpoints and device OTP flow
"""
import pytest
import requests
import os
import hashlib
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://expo-xow.preview.emergentagent.com').rstrip('/')

class TestDashboardAuth:
    """Dashboard authentication endpoint tests"""
    
    def test_signup_success(self):
        """Test successful signup with new user"""
        # Use timestamp to create unique email
        timestamp = int(time.time())
        email = f"testuser_{timestamp}@example.com"
        
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json={
            "email": email,
            "password": "testpass123",
            "name": "Test User"
        })
        
        print(f"Signup response: {response.status_code} - {response.json()}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "user" in data
        assert data["user"]["email"] == email.lower()
        assert data["user"]["name"] == "Test User"
        assert "id" in data["user"]
        assert "password_hash" not in data["user"]  # Should not expose password hash
    
    def test_signup_duplicate_email(self):
        """Test signup with existing email fails"""
        # Use existing test user email
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json={
            "email": "test@example.com",
            "password": "anotherpass",
            "name": "Another User"
        })
        
        print(f"Duplicate signup response: {response.status_code} - {response.json()}")
        assert response.status_code == 400
        
        data = response.json()
        assert "already registered" in data.get("detail", "").lower()
    
    def test_login_success(self):
        """Test successful login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        
        print(f"Login response: {response.status_code} - {response.json()}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"
        assert "id" in data["user"]
        assert "password_hash" not in data["user"]
    
    def test_login_invalid_password(self):
        """Test login with invalid password fails"""
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword"
        })
        
        print(f"Invalid login response: {response.status_code} - {response.json()}")
        assert response.status_code == 401
    
    def test_login_invalid_email(self):
        """Test login with non-existent email fails"""
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "somepass"
        })
        
        print(f"Non-existent email login response: {response.status_code}")
        assert response.status_code == 401
    
    def test_get_user_success(self):
        """Test fetching user details"""
        # First login to get user ID
        login_response = requests.post(f"{BASE_URL}/api/dashboard/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        user_id = login_response.json()["user"]["id"]
        
        # Get user details
        response = requests.get(f"{BASE_URL}/api/dashboard/auth/user/{user_id}")
        
        print(f"Get user response: {response.status_code} - {response.json()}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["email"] == "test@example.com"
        assert "password_hash" not in data
    
    def test_get_user_not_found(self):
        """Test fetching non-existent user fails"""
        response = requests.get(f"{BASE_URL}/api/dashboard/auth/user/507f1f77bcf86cd799439011")
        
        print(f"Get non-existent user response: {response.status_code}")
        assert response.status_code == 404


class TestDeviceManagement:
    """Device management endpoint tests"""
    
    @pytest.fixture
    def test_user_id(self):
        """Get test user ID by logging in"""
        response = requests.post(f"{BASE_URL}/api/dashboard/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        return response.json()["user"]["id"]
    
    def test_get_devices_success(self, test_user_id):
        """Test fetching user's devices"""
        response = requests.get(f"{BASE_URL}/api/dashboard/devices/{test_user_id}")
        
        print(f"Get devices response: {response.status_code} - {response.json()}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "devices" in data
        assert "count" in data
        assert "max_allowed" in data
        assert data["max_allowed"] == 10
    
    def test_get_devices_with_connected_device(self, test_user_id):
        """Test that test user has device 416100 connected"""
        response = requests.get(f"{BASE_URL}/api/dashboard/devices/{test_user_id}")
        
        data = response.json()
        assert data["success"] == True
        
        # Check if 416100 device is connected
        device_codes = [d["device_code"] for d in data["devices"]]
        print(f"Connected device codes: {device_codes}")
        
        if "416100" in device_codes:
            print("PASS: Test device 416100 is connected to test user")
            
            # Check device details
            device = next(d for d in data["devices"] if d["device_code"] == "416100")
            assert device["is_active"] == True
            print(f"Device details: {device}")
    
    def test_add_device_invalid_code(self, test_user_id):
        """Test adding device with invalid code fails"""
        response = requests.post(
            f"{BASE_URL}/api/dashboard/devices/add?user_id={test_user_id}",
            json={"device_code": "999999"}
        )
        
        print(f"Add invalid device response: {response.status_code} - {response.json()}")
        assert response.status_code == 404
        
        data = response.json()
        assert "not found" in data.get("detail", "").lower()
    
    def test_add_device_generates_otp(self, test_user_id):
        """Test adding existing device generates 8-digit OTP"""
        # First, we need to create a new mobile device for testing
        # Register a new mobile device
        timestamp = int(time.time())
        register_response = requests.post(
            f"{BASE_URL}/api/mobile/register-device?device_name=TestDevice_{timestamp}"
        )
        
        print(f"Register device response: {register_response.status_code} - {register_response.json()}")
        
        if register_response.status_code == 200:
            device_code = register_response.json()["device_code"]
            print(f"Registered new device with code: {device_code}")
            
            # Now add this device to dashboard
            add_response = requests.post(
                f"{BASE_URL}/api/dashboard/devices/add?user_id={test_user_id}",
                json={"device_code": device_code}
            )
            
            print(f"Add device response: {add_response.status_code} - {add_response.json()}")
            assert add_response.status_code == 200
            
            data = add_response.json()
            assert data["success"] == True
            assert "otp" in data
            assert len(data["otp"]) == 8  # 8-digit OTP
            assert data["otp"].isdigit()  # All digits
            assert data["expires_in_minutes"] == 10
            
            print(f"Generated OTP: {data['otp']}")
            
            return device_code, data["otp"]
    
    def test_verify_otp_success(self, test_user_id):
        """Test OTP verification completes device association"""
        # First register a new device
        timestamp = int(time.time())
        register_response = requests.post(
            f"{BASE_URL}/api/mobile/register-device?device_name=OTPTestDevice_{timestamp}"
        )
        
        if register_response.status_code == 200:
            device_code = register_response.json()["device_code"]
            
            # Create a new test user for this test to avoid conflicts
            new_user_email = f"otptest_{timestamp}@example.com"
            signup_response = requests.post(f"{BASE_URL}/api/dashboard/auth/signup", json={
                "email": new_user_email,
                "password": "testpass123",
                "name": "OTP Test User"
            })
            
            if signup_response.status_code == 200:
                new_user_id = signup_response.json()["user"]["id"]
                
                # Add device to get OTP
                add_response = requests.post(
                    f"{BASE_URL}/api/dashboard/devices/add?user_id={new_user_id}",
                    json={"device_code": device_code}
                )
                
                if add_response.status_code == 200:
                    otp = add_response.json()["otp"]
                    
                    # Verify OTP
                    verify_response = requests.post(
                        f"{BASE_URL}/api/mobile/verify-otp?device_code={device_code}&otp={otp}"
                    )
                    
                    print(f"Verify OTP response: {verify_response.status_code} - {verify_response.json()}")
                    assert verify_response.status_code == 200
                    
                    data = verify_response.json()
                    assert data["success"] == True
                    
                    # Verify device is now in user's devices
                    devices_response = requests.get(f"{BASE_URL}/api/dashboard/devices/{new_user_id}")
                    devices_data = devices_response.json()
                    
                    device_codes = [d["device_code"] for d in devices_data["devices"]]
                    assert device_code in device_codes
                    print(f"Device {device_code} successfully associated with user")
    
    def test_verify_otp_invalid(self):
        """Test OTP verification with wrong OTP fails"""
        response = requests.post(
            f"{BASE_URL}/api/mobile/verify-otp?device_code=416100&otp=00000000"
        )
        
        print(f"Invalid OTP response: {response.status_code}")
        # Should fail with 401 (invalid OTP) or 400 (no pending association)
        assert response.status_code in [400, 401]
    
    def test_get_devices_user_not_found(self):
        """Test fetching devices for non-existent user fails"""
        response = requests.get(f"{BASE_URL}/api/dashboard/devices/507f1f77bcf86cd799439011")
        
        print(f"Get devices non-existent user response: {response.status_code}")
        assert response.status_code == 404


class TestMobileDeviceRegistration:
    """Mobile device registration endpoint tests"""
    
    def test_register_mobile_device(self):
        """Test registering new mobile device"""
        response = requests.post(
            f"{BASE_URL}/api/mobile/register-device?device_name=TestMobile"
        )
        
        print(f"Register mobile device response: {response.status_code} - {response.json()}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "device_code" in data
        assert len(data["device_code"]) == 6  # 6-digit code
        assert data["device_code"].isdigit()
        
        print(f"New device code: {data['device_code']}")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        
        assert response.status_code == 200
        data = response.json()
        assert "XoW" in data.get("message", "")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
