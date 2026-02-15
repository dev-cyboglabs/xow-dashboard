import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';

const { width, height } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Device {
  id: string;
  device_id: string;
  name: string;
}

interface Recording {
  id: string;
  start_time: string;
  status: string;
}

export default function MainScreen() {
  const router = useRouter();
  const [device, setDevice] = useState<Device | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [recentScans, setRecentScans] = useState<string[]>([]);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [audioPermission, setAudioPermission] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const audioRecording = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTime = useRef<number>(0);

  useEffect(() => {
    loadDevice();
    checkPermissions();
    checkConnection();
    const connectionInterval = setInterval(checkConnection, 30000);
    return () => {
      clearInterval(connectionInterval);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadDevice = async () => {
    try {
      const savedDevice = await AsyncStorage.getItem('xow_device');
      if (savedDevice) {
        setDevice(JSON.parse(savedDevice));
      } else {
        router.replace('/');
      }
    } catch (error) {
      router.replace('/');
    }
  };

  const checkPermissions = async () => {
    if (!cameraPermission?.granted) {
      await requestCameraPermission();
    }
    const audioStatus = await Audio.requestPermissionsAsync();
    setAudioPermission(audioStatus.granted);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
  };

  const checkConnection = async () => {
    try {
      await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (!device) return;

    try {
      const response = await axios.post(`${API_URL}/api/recordings`, {
        device_id: device.device_id,
        expo_name: 'Expo 2025',
        booth_name: device.name,
      });

      setCurrentRecording(response.data);
      setIsRecording(true);
      recordingStartTime.current = Date.now();

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      audioRecording.current = recording;

      console.log('Recording started');
    } catch (error) {
      console.error('Start recording error:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!currentRecording) return;

    try {
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (audioRecording.current) {
        await audioRecording.current.stopAndUnloadAsync();
        const uri = audioRecording.current.getURI();
        
        if (uri) {
          const audioData = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          const formData = new FormData();
          formData.append('audio', {
            uri: uri,
            type: 'audio/m4a',
            name: 'recording.m4a',
          } as any);

          try {
            await axios.post(
              `${API_URL}/api/recordings/${currentRecording.id}/upload-audio`,
              formData,
              { headers: { 'Content-Type': 'multipart/form-data' } }
            );
          } catch (uploadError) {
            console.log('Audio upload failed, saving locally');
            await AsyncStorage.setItem(
              `pending_audio_${currentRecording.id}`,
              audioData
            );
          }
        }
        audioRecording.current = null;
      }

      await axios.put(`${API_URL}/api/recordings/${currentRecording.id}/complete`);

      setCurrentRecording(null);
      setRecordingTime(0);
      setRecentScans([]);

      Alert.alert('Success', 'Recording saved successfully!');
    } catch (error) {
      console.error('Stop recording error:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const handleBarcodeSubmit = async () => {
    if (!barcodeInput.trim() || !currentRecording) return;

    const barcode = barcodeInput.trim();
    const videoTimestamp = (Date.now() - recordingStartTime.current) / 1000;

    try {
      await axios.post(`${API_URL}/api/barcodes`, {
        recording_id: currentRecording.id,
        barcode_data: barcode,
        video_timestamp: videoTimestamp,
      });

      setRecentScans((prev) => [barcode, ...prev.slice(0, 4)]);
      setBarcodeInput('');
    } catch (error) {
      console.error('Barcode scan error:', error);
      await AsyncStorage.setItem(
        `pending_barcode_${Date.now()}`,
        JSON.stringify({
          recording_id: currentRecording.id,
          barcode_data: barcode,
          video_timestamp: videoTimestamp,
        })
      );
      setRecentScans((prev) => [barcode, ...prev.slice(0, 4)]);
      setBarcodeInput('');
    }
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('xow_device');
          router.replace('/');
        },
      },
    ]);
  };

  const getCurrentDateTime = () => {
    const now = new Date();
    return now.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (!cameraPermission?.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={48} color="#7C3AED" />
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>XoW needs camera access to record booth activity</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera Preview */}
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.deviceBadge}>
            <View style={styles.deviceIcon}>
              <Ionicons name="business" size={14} color="#fff" />
            </View>
            <Text style={styles.deviceName} numberOfLines={1}>{device?.name || 'Device'}</Text>
          </View>
          
          <View style={[styles.connectionStatus, isOnline ? styles.online : styles.offline]}>
            <View style={[styles.connectionDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.connectionText}>{isOnline ? 'Connected' : 'Offline'}</Text>
          </View>
        </View>

        {/* Recording Indicator */}
        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
          </View>
        )}

        {/* Timestamp Overlay */}
        {isRecording && (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestampText}>{getCurrentDateTime()}</Text>
          </View>
        )}

        {/* Bottom Controls */}
        <View style={styles.bottomArea}>
          {/* Barcode Input */}
          {isRecording && (
            <View style={styles.barcodeSection}>
              <View style={styles.barcodeInput}>
                <Ionicons name="scan-outline" size={20} color="#7C3AED" />
                <TextInput
                  style={styles.barcodeTextInput}
                  placeholder="Scan visitor badge..."
                  placeholderTextColor="#6B7280"
                  value={barcodeInput}
                  onChangeText={setBarcodeInput}
                  onSubmitEditing={handleBarcodeSubmit}
                  autoCapitalize="characters"
                />
                <TouchableOpacity onPress={handleBarcodeSubmit} style={styles.addButton}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              
              {recentScans.length > 0 && (
                <ScrollView horizontal style={styles.recentScans} showsHorizontalScrollIndicator={false}>
                  {recentScans.map((scan, index) => (
                    <View key={index} style={styles.scanChip}>
                      <Ionicons name="person" size={12} color="#7C3AED" />
                      <Text style={styles.scanChipText}>{scan}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/gallery')}>
              <View style={styles.actionIcon}>
                <Ionicons name="grid-outline" size={22} color="#fff" />
              </View>
              <Text style={styles.actionText}>Gallery</Text>
            </TouchableOpacity>

            {/* Record Button */}
            <TouchableOpacity
              style={styles.recordButtonOuter}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.8}
            >
              <View style={[styles.recordButtonInner, isRecording && styles.recordingActive]}>
                {isRecording ? (
                  <View style={styles.stopIcon} />
                ) : (
                  <View style={styles.recordIcon} />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
              <View style={styles.actionIcon}>
                <Ionicons name="log-out-outline" size={22} color="#fff" />
              </View>
              <Text style={styles.actionText}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.recordHint}>
            {isRecording ? 'Tap to stop recording' : 'Tap to start recording'}
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  deviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    maxWidth: 180,
  },
  deviceIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  deviceName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  online: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  offline: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: '#10B981',
  },
  offlineDot: {
    backgroundColor: '#EF4444',
  },
  connectionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  recordingBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  recordingTime: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timestampContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  timestampText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 16,
  },
  barcodeSection: {
    marginBottom: 20,
  },
  barcodeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(31, 31, 31, 0.95)',
    borderRadius: 12,
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  barcodeTextInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 15,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  recentScans: {
    marginTop: 10,
  },
  scanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  scanChipText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 6,
    fontWeight: '500',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionButton: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
  recordButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 24,
    borderWidth: 3,
    borderColor: '#fff',
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingActive: {
    backgroundColor: '#EF4444',
  },
  recordIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  recordHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
  },
  permissionText: {
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
