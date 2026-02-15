#!/usr/bin/env python3
"""
XoW Expo Recording System Backend API Tests
Tests all endpoints including the full workflow as specified.
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://expo-stall-hub.preview.emergentagent.com/api"

class XoWAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.device_id = "BOOTH-TEST-001"
        self.device_password = "test123456"
        self.device_name = "Test Booth Device"
        self.recording_id = None
        
    def log_test(self, test_name: str, success: bool, details: str = "", response: Optional[requests.Response] = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        
        if response:
            result["status_code"] = response.status_code
            try:
                result["response"] = response.json()
            except:
                result["response"] = response.text[:200]
        
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   {details}")
        if response and not success:
            print(f"   Status: {response.status_code}, Response: {result['response']}")
        print()

    def test_health_endpoints(self):
        """Test health and root endpoints"""
        print("=== TESTING HEALTH ENDPOINTS ===")
        
        # Test root endpoint
        try:
            response = self.session.get(f"{BASE_URL}/")
            success = response.status_code == 200 and "XoW Expo Recording System API" in response.text
            self.log_test("API Root Endpoint", success, f"GET {BASE_URL}/", response)
        except Exception as e:
            self.log_test("API Root Endpoint", False, f"Connection error: {str(e)}")
        
        # Test health endpoint
        try:
            response = self.session.get(f"{BASE_URL}/health")
            success = response.status_code == 200 and response.json().get("status") == "healthy"
            self.log_test("Health Check Endpoint", success, f"GET {BASE_URL}/health", response)
        except Exception as e:
            self.log_test("Health Check Endpoint", False, f"Connection error: {str(e)}")

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("=== TESTING AUTHENTICATION ENDPOINTS ===")
        
        # Test device registration
        try:
            register_data = {
                "device_id": self.device_id,
                "password": self.device_password,
                "name": self.device_name
            }
            response = self.session.post(f"{BASE_URL}/auth/register", json=register_data)
            
            # Accept both 200 (new registration) and 400 (already exists)
            if response.status_code == 200:
                success = response.json().get("device_id") == self.device_id
                details = "New device registered successfully"
            elif response.status_code == 400 and "already registered" in response.text:
                success = True
                details = "Device already exists (expected for repeated tests)"
            else:
                success = False
                details = f"Unexpected response: {response.status_code}"
            
            self.log_test("Device Registration", success, details, response)
        except Exception as e:
            self.log_test("Device Registration", False, f"Error: {str(e)}")
        
        # Test device login
        try:
            login_data = {
                "device_id": self.device_id,
                "password": self.device_password
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            success = (response.status_code == 200 and 
                      response.json().get("success") and
                      response.json().get("device", {}).get("device_id") == self.device_id)
            
            self.log_test("Device Login", success, "Login with registered device", response)
        except Exception as e:
            self.log_test("Device Login", False, f"Error: {str(e)}")
        
        # Test invalid login
        try:
            invalid_login = {
                "device_id": "INVALID-DEVICE",
                "password": "wrong-password"
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=invalid_login)
            success = response.status_code == 401
            self.log_test("Invalid Login Rejection", success, "Should reject invalid credentials", response)
        except Exception as e:
            self.log_test("Invalid Login Rejection", False, f"Error: {str(e)}")

    def test_recording_endpoints(self):
        """Test recording management endpoints"""
        print("=== TESTING RECORDING ENDPOINTS ===")
        
        # Test create recording
        try:
            recording_data = {
                "device_id": self.device_id,
                "expo_name": "Tech Expo 2024",
                "booth_name": "Innovation Showcase"
            }
            response = self.session.post(f"{BASE_URL}/recordings", json=recording_data)
            success = response.status_code == 200
            
            if success:
                response_data = response.json()
                self.recording_id = response_data.get("id")
                success = (self.recording_id is not None and 
                          response_data.get("device_id") == self.device_id and
                          response_data.get("status") == "recording")
            
            self.log_test("Create Recording", success, f"Recording ID: {self.recording_id}", response)
        except Exception as e:
            self.log_test("Create Recording", False, f"Error: {str(e)}")
        
        if not self.recording_id:
            print("❌ Cannot continue recording tests without valid recording ID")
            return
        
        # Test get specific recording
        try:
            response = self.session.get(f"{BASE_URL}/recordings/{self.recording_id}")
            success = (response.status_code == 200 and 
                      response.json().get("id") == self.recording_id)
            self.log_test("Get Specific Recording", success, f"Retrieved recording {self.recording_id}", response)
        except Exception as e:
            self.log_test("Get Specific Recording", False, f"Error: {str(e)}")
        
        # Test get all recordings
        try:
            response = self.session.get(f"{BASE_URL}/recordings")
            success = response.status_code == 200 and isinstance(response.json(), list)
            self.log_test("Get All Recordings", success, f"Retrieved {len(response.json()) if success else 0} recordings", response)
        except Exception as e:
            self.log_test("Get All Recordings", False, f"Error: {str(e)}")
        
        # Test get recordings filtered by device
        try:
            response = self.session.get(f"{BASE_URL}/recordings?device_id={self.device_id}")
            success = response.status_code == 200
            if success:
                recordings = response.json()
                # Verify all recordings belong to our device
                success = all(r.get("device_id") == self.device_id for r in recordings)
            self.log_test("Get Recordings by Device", success, f"Filter by device_id={self.device_id}", response)
        except Exception as e:
            self.log_test("Get Recordings by Device", False, f"Error: {str(e)}")

    def test_barcode_endpoints(self):
        """Test barcode scanning endpoints"""
        print("=== TESTING BARCODE ENDPOINTS ===")
        
        if not self.recording_id:
            print("❌ Cannot test barcodes without valid recording ID")
            return
        
        # Test create first barcode scan
        try:
            barcode_data1 = {
                "recording_id": self.recording_id,
                "barcode_data": "VISITOR-001-ABC123",
                "visitor_name": "John Smith",
                "video_timestamp": 120.5
            }
            response = self.session.post(f"{BASE_URL}/barcodes", json=barcode_data1)
            success = (response.status_code == 200 and 
                      response.json().get("recording_id") == self.recording_id)
            self.log_test("Create Barcode Scan 1", success, "First visitor scan", response)
        except Exception as e:
            self.log_test("Create Barcode Scan 1", False, f"Error: {str(e)}")
        
        # Test create second barcode scan
        try:
            barcode_data2 = {
                "recording_id": self.recording_id,
                "barcode_data": "VISITOR-002-DEF456", 
                "visitor_name": "Jane Doe",
                "video_timestamp": 245.7
            }
            response = self.session.post(f"{BASE_URL}/barcodes", json=barcode_data2)
            success = (response.status_code == 200 and 
                      response.json().get("recording_id") == self.recording_id)
            self.log_test("Create Barcode Scan 2", success, "Second visitor scan", response)
        except Exception as e:
            self.log_test("Create Barcode Scan 2", False, f"Error: {str(e)}")
        
        # Test get barcode scans for recording
        try:
            response = self.session.get(f"{BASE_URL}/barcodes/{self.recording_id}")
            success = response.status_code == 200
            if success:
                scans = response.json()
                success = (isinstance(scans, list) and len(scans) >= 2)
                details = f"Retrieved {len(scans)} scans for recording"
            else:
                details = "Failed to retrieve scans"
            self.log_test("Get Barcode Scans", success, details, response)
        except Exception as e:
            self.log_test("Get Barcode Scans", False, f"Error: {str(e)}")

    def test_complete_recording(self):
        """Test completing a recording"""
        print("=== TESTING RECORDING COMPLETION ===")
        
        if not self.recording_id:
            print("❌ Cannot complete recording without valid recording ID")
            return
        
        # Wait a moment to ensure recording has some duration
        time.sleep(2)
        
        try:
            response = self.session.put(f"{BASE_URL}/recordings/{self.recording_id}/complete")
            success = response.status_code == 200
            
            if success:
                response_data = response.json()
                success = (response_data.get("status") == "completed" and
                          response_data.get("end_time") is not None and
                          response_data.get("duration") is not None)
                duration = response_data.get("duration", 0)
                details = f"Recording completed, duration: {duration:.2f} seconds"
            else:
                details = "Failed to complete recording"
            
            self.log_test("Complete Recording", success, details, response)
        except Exception as e:
            self.log_test("Complete Recording", False, f"Error: {str(e)}")

    def test_dashboard_endpoints(self):
        """Test dashboard endpoints"""
        print("=== TESTING DASHBOARD ENDPOINTS ===")
        
        # Test dashboard insights
        try:
            response = self.session.get(f"{BASE_URL}/dashboard/insights")
            success = response.status_code == 200
            
            if success:
                insights = response.json()
                required_fields = ["total_recordings", "total_visitors", "total_duration_hours", "top_topics", "recent_activity"]
                success = all(field in insights for field in required_fields)
                
                if success:
                    details = f"Recordings: {insights['total_recordings']}, Visitors: {insights['total_visitors']}, Duration: {insights['total_duration_hours']}h"
                else:
                    details = "Missing required fields in insights response"
            else:
                details = "Failed to get dashboard insights"
            
            self.log_test("Dashboard Insights", success, details, response)
        except Exception as e:
            self.log_test("Dashboard Insights", False, f"Error: {str(e)}")
        
        # Test dashboard recordings
        try:
            response = self.session.get(f"{BASE_URL}/dashboard/recordings")
            success = response.status_code == 200
            
            if success:
                recordings = response.json()
                success = isinstance(recordings, list)
                # Check if recordings have scan counts
                if recordings and success:
                    success = all("scans_count" in rec for rec in recordings)
                    details = f"Retrieved {len(recordings)} dashboard recordings with scan counts"
                else:
                    details = "Retrieved empty recordings list"
            else:
                details = "Failed to get dashboard recordings"
            
            self.log_test("Dashboard Recordings", success, details, response)
        except Exception as e:
            self.log_test("Dashboard Recordings", False, f"Error: {str(e)}")
        
        # Test visitors endpoint
        try:
            response = self.session.get(f"{BASE_URL}/dashboard/visitors")
            success = response.status_code == 200
            
            if success:
                visitors = response.json()
                success = isinstance(visitors, list)
                details = f"Retrieved {len(visitors)} visitor scans"
            else:
                details = "Failed to get visitors"
            
            self.log_test("Dashboard Visitors", success, details, response)
        except Exception as e:
            self.log_test("Dashboard Visitors", False, f"Error: {str(e)}")
        
        # Test visitors filtered by recording
        if self.recording_id:
            try:
                response = self.session.get(f"{BASE_URL}/dashboard/visitors?recording_id={self.recording_id}")
                success = response.status_code == 200
                
                if success:
                    visitors = response.json()
                    success = isinstance(visitors, list)
                    # Verify visitors belong to our recording
                    if visitors and success:
                        success = all(v.get("recording_id") == self.recording_id for v in visitors)
                        details = f"Retrieved {len(visitors)} visitors for recording {self.recording_id}"
                    else:
                        details = "No visitors found for the recording"
                else:
                    details = "Failed to get visitors for recording"
                
                self.log_test("Visitors by Recording", success, details, response)
            except Exception as e:
                self.log_test("Visitors by Recording", False, f"Error: {str(e)}")

    def run_full_workflow_test(self):
        """Run the complete workflow test as specified"""
        print("\n" + "="*60)
        print("STARTING FULL WORKFLOW TEST")
        print("="*60)
        
        # Step 1: Health checks
        self.test_health_endpoints()
        
        # Step 2: Authentication
        self.test_auth_endpoints()
        
        # Step 3: Create recording
        self.test_recording_endpoints()
        
        # Step 4: Add barcode scans
        self.test_barcode_endpoints()
        
        # Step 5: Complete recording
        self.test_complete_recording()
        
        # Step 6: Check dashboard
        self.test_dashboard_endpoints()

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "="*60)
        print("TEST RESULTS SUMMARY")
        print("="*60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\nFAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"❌ {result['test']}: {result['details']}")
                    if "status_code" in result:
                        print(f"   Status: {result['status_code']}")
                    if "response" in result:
                        print(f"   Response: {result['response']}")
        
        print("\n" + "="*60)
        return failed_tests == 0

def main():
    """Main test execution"""
    print("XoW Expo Recording System - Backend API Tests")
    print(f"Testing against: {BASE_URL}")
    print("="*60)
    
    tester = XoWAPITester()
    tester.run_full_workflow_test()
    
    success = tester.print_summary()
    
    # Save results to file
    with open("/app/test_results_backend.json", "w") as f:
        json.dump(tester.test_results, f, indent=2)
    
    print(f"\nDetailed results saved to: /app/test_results_backend.json")
    
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())