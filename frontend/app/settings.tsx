import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StorageSettings {
  autoUpload: boolean;
  storageLocation: 'internal' | 'external' | 'documents';
}

export default function SettingsScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [settings, setSettings] = useState<StorageSettings>({
    autoUpload: false,
    storageLocation: 'documents',
  });
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');

  useEffect(() => {
    loadSettings();
    loadDevice();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem('xow_settings');
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Load settings error:', e);
    }
  };

  const loadDevice = async () => {
    try {
      const saved = await AsyncStorage.getItem('xow_device');
      if (saved) {
        const device = JSON.parse(saved);
        setDeviceName(device.name || 'Unknown Device');
        setDeviceCode(device.device_id || null);
      }
    } catch (e) {
      console.error('Load device error:', e);
    }
  };

  const saveSettings = async (newSettings: StorageSettings) => {
    try {
      await AsyncStorage.setItem('xow_settings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (e) {
      console.error('Save settings error:', e);
    }
  };

  const toggleAutoUpload = () => {
    const newSettings = { ...settings, autoUpload: !settings.autoUpload };
    saveSettings(newSettings);
  };

  const setStorageLocation = (location: 'internal' | 'external' | 'documents') => {
    const newSettings = { ...settings, storageLocation: location };
    saveSettings(newSettings);
    Alert.alert('Storage Updated', `Recordings will be saved to ${getLocationName(location)}`);
  };

  const getLocationName = (location: string) => {
    switch (location) {
      case 'internal': return 'Internal Storage';
      case 'external': return 'External Storage (SD Card)';
      case 'documents': return 'App Documents';
      default: return 'Unknown';
    }
  };

  const sidebarWidth = Math.min(90, width * 0.12);

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Sidebar */}
      <View style={[styles.sidebar, { width: sidebarWidth }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.sidebarIcon}>
          <Ionicons name="settings" size={24} color="#8B5CF6" />
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>Configure storage and upload preferences</Text>
        </View>

        <View style={styles.sections}>
          {/* Device Info Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="phone-portrait" size={16} color="#8B5CF6" />
              <Text style={styles.sectionTitle}>Device Info</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Device Name</Text>
                <Text style={styles.infoValue}>{deviceName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Device Code</Text>
                <View style={styles.codeBadge}>
                  <Text style={styles.codeText}>{deviceCode || '------'}</Text>
                </View>
              </View>
              <Text style={styles.hintText}>
                Use this code to link with your dashboard account
              </Text>
            </View>
          </View>

          {/* Cloud Sync Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud" size={16} color="#3B82F6" />
              <Text style={styles.sectionTitle}>Cloud Sync</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Auto Upload</Text>
                  <Text style={styles.settingDesc}>
                    Automatically upload recordings when finished
                  </Text>
                </View>
                <Switch
                  value={settings.autoUpload}
                  onValueChange={toggleAutoUpload}
                  trackColor={{ false: '#333', true: '#8B5CF6' }}
                  thumbColor={settings.autoUpload ? '#fff' : '#666'}
                />
              </View>
              <Text style={styles.hintText}>
                {settings.autoUpload 
                  ? 'Recordings will upload automatically after recording stops'
                  : 'Recordings will be saved locally. Upload manually from Gallery.'}
              </Text>
            </View>
          </View>

          {/* Storage Location Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="folder" size={16} color="#10B981" />
              <Text style={styles.sectionTitle}>Storage Location</Text>
            </View>
            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.locationOption, settings.storageLocation === 'documents' && styles.locationActive]}
                onPress={() => setStorageLocation('documents')}
              >
                <Ionicons name="document-text" size={18} color={settings.storageLocation === 'documents' ? '#8B5CF6' : '#666'} />
                <View style={styles.locationInfo}>
                  <Text style={[styles.locationTitle, settings.storageLocation === 'documents' && styles.locationTitleActive]}>
                    App Documents
                  </Text>
                  <Text style={styles.locationDesc}>Default app storage (recommended)</Text>
                </View>
                {settings.storageLocation === 'documents' && (
                  <Ionicons name="checkmark-circle" size={20} color="#8B5CF6" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.locationOption, settings.storageLocation === 'internal' && styles.locationActive]}
                onPress={() => setStorageLocation('internal')}
              >
                <Ionicons name="phone-portrait" size={18} color={settings.storageLocation === 'internal' ? '#8B5CF6' : '#666'} />
                <View style={styles.locationInfo}>
                  <Text style={[styles.locationTitle, settings.storageLocation === 'internal' && styles.locationTitleActive]}>
                    Internal Storage
                  </Text>
                  <Text style={styles.locationDesc}>Device internal memory</Text>
                </View>
                {settings.storageLocation === 'internal' && (
                  <Ionicons name="checkmark-circle" size={20} color="#8B5CF6" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.locationOption, settings.storageLocation === 'external' && styles.locationActive]}
                onPress={() => setStorageLocation('external')}
              >
                <Ionicons name="save" size={18} color={settings.storageLocation === 'external' ? '#8B5CF6' : '#666'} />
                <View style={styles.locationInfo}>
                  <Text style={[styles.locationTitle, settings.storageLocation === 'external' && styles.locationTitleActive]}>
                    External Storage
                  </Text>
                  <Text style={styles.locationDesc}>SD Card / USB drive (if available)</Text>
                </View>
                {settings.storageLocation === 'external' && (
                  <Ionicons name="checkmark-circle" size={20} color="#8B5CF6" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Storage Info */}
          <View style={styles.section}>
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={18} color="#F59E0B" />
              <Text style={styles.infoText}>
                Recordings are saved locally and can be uploaded to the cloud from the Gallery tab. 
                When Auto Upload is off, you have full control over when and which recordings to upload.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#000' },

  // Sidebar
  sidebar: { backgroundColor: '#0a0a0a', borderRightWidth: 1, borderRightColor: '#1a1a1a', padding: 10, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  sidebarIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },

  // Content
  content: { flex: 1, padding: 16 },
  header: { marginBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: '#555', fontSize: 11, marginTop: 4 },

  sections: { gap: 20 },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  card: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },

  // Info Row
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  infoLabel: { color: '#666', fontSize: 12 },
  infoValue: { color: '#fff', fontSize: 13, fontWeight: '500' },
  codeBadge: { backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  codeText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 2 },
  hintText: { color: '#555', fontSize: 10, marginTop: 10 },

  // Setting Row
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingInfo: { flex: 1, marginRight: 16 },
  settingLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  settingDesc: { color: '#666', fontSize: 11, marginTop: 2 },

  // Location Options
  locationOption: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#222' },
  locationActive: { borderColor: '#8B5CF6', backgroundColor: 'rgba(139,92,246,0.1)' },
  locationInfo: { flex: 1, marginLeft: 12 },
  locationTitle: { color: '#888', fontSize: 13, fontWeight: '500' },
  locationTitleActive: { color: '#fff' },
  locationDesc: { color: '#555', fontSize: 10, marginTop: 2 },

  // Info Card
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8, gap: 10 },
  infoText: { flex: 1, color: '#F59E0B', fontSize: 11, lineHeight: 16 },
});
