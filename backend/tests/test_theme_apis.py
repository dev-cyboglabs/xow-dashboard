"""
Backend API tests for XoW Expo Recording System - Theme Update Testing
Tests: /api/health, /api/dashboard/insights, /api/dashboard/recordings, /api/dashboard/visitors
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://visitor-playback-dev.preview.emergentagent.com').rstrip('/')


class TestHealthAndDashboard:
    """Tests for health check and dashboard endpoints"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'
        assert 'timestamp' in data
        print(f"PASS: Health check returned status: {data.get('status')}")

    def test_dashboard_insights(self):
        """Test /api/dashboard/insights returns proper data structure"""
        response = requests.get(f"{BASE_URL}/api/dashboard/insights")
        assert response.status_code == 200
        data = response.json()
        
        # Verify data structure
        assert 'total_recordings' in data
        assert 'total_visitors' in data
        assert 'total_duration_hours' in data
        assert 'top_topics' in data
        assert 'top_questions' in data
        assert 'recent_activity' in data
        
        # Verify types
        assert isinstance(data['total_recordings'], int)
        assert isinstance(data['total_visitors'], int)
        assert isinstance(data['total_duration_hours'], (int, float))
        assert isinstance(data['top_topics'], list)
        assert isinstance(data['recent_activity'], list)
        
        print(f"PASS: Dashboard insights - {data['total_recordings']} recordings, {data['total_visitors']} visitors")

    def test_dashboard_recordings(self):
        """Test /api/dashboard/recordings returns list of recordings"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        
        if len(data) > 0:
            recording = data[0]
            # Verify recording has required fields
            assert 'id' in recording
            assert 'booth_name' in recording
            assert 'status' in recording
            assert 'has_video' in recording
            assert 'has_audio' in recording
            print(f"PASS: Dashboard recordings - Found {len(data)} recordings, first: {recording.get('booth_name')}")
        else:
            print("PASS: Dashboard recordings - No recordings found (empty list)")

    def test_dashboard_visitors(self):
        """Test /api/dashboard/visitors returns visitor list"""
        response = requests.get(f"{BASE_URL}/api/dashboard/visitors")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"PASS: Dashboard visitors - Found {len(data)} visitors")


class TestStaticPages:
    """Tests for static page serving"""
    
    def test_home_page(self):
        """Test /api/home serves homepage HTML"""
        response = requests.get(f"{BASE_URL}/api/home")
        assert response.status_code == 200
        assert 'text/html' in response.headers.get('content-type', '')
        
        # Check for orange theme color in HTML
        html_content = response.text
        assert '#E54B2A' in html_content, "Orange theme color #E54B2A not found in homepage"
        assert 'XoW' in html_content, "XoW branding not found in homepage"
        print("PASS: Homepage serves HTML with orange theme (#E54B2A)")

    def test_dashboard_page(self):
        """Test /api/dashboard serves dashboard HTML"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        assert 'text/html' in response.headers.get('content-type', '')
        
        # Check for orange theme color in HTML
        html_content = response.text
        assert '#E54B2A' in html_content, "Orange theme color #E54B2A not found in dashboard"
        
        # Check that no violet/purple colors remain in the main theme elements
        # Note: Some tailwind class names may contain 'purple' as a color option
        assert '#8B5CF6' not in html_content, "Purple color #8B5CF6 found in dashboard - should be replaced"
        assert '#7C3AED' not in html_content, "Purple color #7C3AED found in dashboard - should be replaced"
        
        print("PASS: Dashboard serves HTML with orange theme, no purple theme colors")


class TestRecordingFeatures:
    """Tests for recording-related features"""
    
    def test_get_all_recordings(self):
        """Test /api/recordings endpoint"""
        response = requests.get(f"{BASE_URL}/api/recordings")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: All recordings endpoint - Found {len(data)} recordings")
    
    def test_get_all_visitors(self):
        """Test /api/visitors endpoint"""
        response = requests.get(f"{BASE_URL}/api/visitors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: All visitors endpoint - Found {len(data)} visitors")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
