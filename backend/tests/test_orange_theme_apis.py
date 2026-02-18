"""
Backend API tests for XoW Orange Theme Verification
Tests dashboard APIs, health endpoint, and theme colors
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://visitor-playback-dev.preview.emergentagent.com').rstrip('/')


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_endpoint_returns_200(self):
        """Verify /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'
        print(f"✓ Health check passed: {data}")


class TestDashboardAPIs:
    """Dashboard API endpoint tests"""
    
    def test_dashboard_insights(self):
        """Verify /api/dashboard/insights returns valid data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/insights", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert 'total_recordings' in data
        assert 'total_visitors' in data
        assert 'total_duration_hours' in data
        print(f"✓ Dashboard insights: {data.get('total_recordings')} recordings, {data.get('total_visitors')} visitors")
        
    def test_dashboard_recordings(self):
        """Verify /api/dashboard/recordings returns list"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recordings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Dashboard recordings: {len(data)} recordings found")
        
    def test_dashboard_visitors(self):
        """Verify /api/dashboard/visitors returns list"""
        response = requests.get(f"{BASE_URL}/api/dashboard/visitors", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Dashboard visitors: {len(data)} visitors found")


class TestStaticPages:
    """Static page endpoint tests"""
    
    def test_home_page_serves_html(self):
        """Verify /api/home serves homepage with orange theme"""
        response = requests.get(f"{BASE_URL}/api/home", timeout=10)
        assert response.status_code == 200
        content = response.text
        # Check for orange theme color
        assert '#E54B2A' in content or 'E54B2A' in content
        # Check page title
        assert 'XoW' in content
        # Verify no purple colors
        assert '#8B5CF6' not in content
        print("✓ Homepage serves correctly with orange theme")
        
    def test_dashboard_page_serves_html(self):
        """Verify /api/dashboard serves dashboard with orange theme"""
        response = requests.get(f"{BASE_URL}/api/dashboard", timeout=10)
        assert response.status_code == 200
        content = response.text
        # Check for orange theme color
        assert '#E54B2A' in content or 'E54B2A' in content
        # Check page title
        assert 'XoW Dashboard' in content
        # Verify no purple colors
        assert '#8B5CF6' not in content
        print("✓ Dashboard serves correctly with orange theme")


class TestRecordingsAPI:
    """Recordings API tests"""
    
    def test_get_recordings_list(self):
        """Verify /api/recordings returns list"""
        response = requests.get(f"{BASE_URL}/api/recordings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Recordings API: {len(data)} recordings")


class TestVisitorsAPI:
    """Visitors API tests"""
    
    def test_get_all_visitors(self):
        """Verify /api/visitors returns list"""
        response = requests.get(f"{BASE_URL}/api/visitors", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Visitors API: {len(data)} visitors")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
