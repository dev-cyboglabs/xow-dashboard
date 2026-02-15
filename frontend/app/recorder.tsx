import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
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

export default function RecorderScreen() {
  const router = useRouter();
  const [device, setDevice] = useState<Device | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);
  const [barcodeCount, setBarcodeCount] = useState(0);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const cameraRef = useRef<CameraView>(null);
  const audioRecording = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const frameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clockRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTime = useRef<number>(0);

  useEffect(() => {
    loadDevice();
    checkPermissions();
    checkConnection();
    
    // Update clock every second
    clockRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const connectionInterval = setInterval(checkConnection, 30000);
    
    return () => {
      clearInterval(connectionInterval);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      if (clockRef.current) clearInterval(clockRef.current);
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

  const formatTimecode = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const frames = frameCount % 30;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
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
      setFrameCount(0);
      setBarcodeCount(0);
      setLastBarcode(null);
      recordingStartTime.current = Date.now();

      // Timer for seconds
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Frame counter (simulating 30fps)
      frameTimerRef.current = setInterval(() => {
        setFrameCount((prev) => prev + 1);
      }, 33.33);

      // Start audio recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      audioRecording.current = recording;

    } catch (error) {
      console.error('Start recording error:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!currentRecording) return;

    try {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);

      if (audioRecording.current) {
        await audioRecording.current.stopAndUnloadAsync();
        const uri = audioRecording.current.getURI();
        
        if (uri) {
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
            console.log('Audio upload pending');
          }
        }
        audioRecording.current = null;
      }

      await axios.put(`${API_URL}/api/recordings/${currentRecording.id}/complete`);

      const savedCount = barcodeCount;
      setCurrentRecording(null);
      setRecordingTime(0);
      setFrameCount(0);

      Alert.alert('Recording Saved', `Duration: ${formatTimecode(recordingTime)}\nVisitors logged: ${savedCount}`);
    } catch (error) {
      console.error('Stop recording error:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const handleBarcodeSubmit = async () => {
    if (!barcodeInput.trim() || !currentRecording) return;

    const barcode = barcodeInput.trim();
    const videoTimestamp = (Date.now() - recordingStartTime.current) / 1000;
    const currentFrame = frameCount;

    try {
      await axios.post(`${API_URL}/api/barcodes`, {
        recording_id: currentRecording.id,
        barcode_data: barcode,
        video_timestamp: videoTimestamp,
        frame_code: currentFrame,
      });

      setLastBarcode(barcode);
      setBarcodeCount((prev) => prev + 1);
      setBarcodeInput('');
    } catch (error) {
      // Save locally if offline
      setLastBarcode(barcode);
      setBarcodeCount((prev) => prev + 1);
      setBarcodeInput('');
    }
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
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

  if (!cameraPermission?.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="videocam-off" size={64} color="#7C3AED" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>Enable camera to start recording booth activity</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        
        {/* Overlay Container */}
        <View style={styles.overlay}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            {/* Left - Device Info */}
            <View style={styles.deviceInfo}>
              <View style={styles.deviceIdBadge}>
                <Ionicons name="hardware-chip" size={14} color="#7C3AED" />
                <Text style={styles.deviceIdText}>ID: {device?.device_id || '---'}</Text>
              </View>
              <Text style={styles.boothName}>{device?.name || 'Loading...'}</Text>
            </View>

            {/* Center - Recording Status */}
            <View style={styles.recordingStatus}>
              {isRecording && (
                <View style={styles.recIndicator}>
                  <View style={styles.recDot} />
                  <Text style={styles.recText}>REC</Text>
                </View>
              )}
            </View>

            {/* Right - Connection Status */}
            <View style={styles.connectionInfo}>
              <View style={[styles.connectionBadge, isOnline ? styles.online : styles.offline]}>
                <View style={[styles.connectionDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
                <Text style={styles.connectionText}>{isOnline ? 'CLOUD CONNECTED' : 'OFFLINE'}</Text>
              </View>
            </View>
          </View>

          {/* Timecode Overlay - Top Left */}
          <View style={styles.timecodeOverlay}>
            <View style={styles.timecodeRow}>
              <Text style={styles.timecodeLabel}>DATE</Text>
              <Text style={styles.timecodeValue}>{formatDate(currentTime)}</Text>
            </View>
            <View style={styles.timecodeRow}>
              <Text style={styles.timecodeLabel}>TIME</Text>
              <Text style={styles.timecodeValue}>{formatTime(currentTime)}</Text>
            </View>
            {isRecording && (
              <>
                <View style={styles.timecodeDivider} />
                <View style={styles.timecodeRow}>
                  <Text style={styles.timecodeLabel}>TC</Text>
                  <Text style={[styles.timecodeValue, styles.timecodeRec]}>{formatTimecode(recordingTime)}</Text>
                </View>
                <View style={styles.timecodeRow}>
                  <Text style={styles.timecodeLabel}>FRAME</Text>
                  <Text style={[styles.timecodeValue, styles.frameValue]}>{frameCount.toString().padStart(8, '0')}</Text>
                </View>
              </>
            )}
          </View>

          {/* XoW Watermark - Bottom Right */}
          <View style={styles.watermark}>
            <View style={styles.watermarkLogo}>
              <Ionicons name="videocam" size={16} color="rgba(124, 58, 237, 0.8)" />
            </View>
            <Text style={styles.watermarkText}>XoW</Text>
          </View>

          {/* Barcode Counter - Bottom Left */}
          {isRecording && (
            <View style={styles.barcodeStats}>
              <Ionicons name="people" size={18} color="#7C3AED" />
              <Text style={styles.barcodeCountText}>{barcodeCount}</Text>
              <Text style={styles.barcodeCountLabel}>VISITORS</Text>
              {lastBarcode && (
                <View style={styles.lastBarcodeBadge}>
                  <Text style={styles.lastBarcodeText}>Last: {lastBarcode}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Control Panel - Right Side */}
      <View style={styles.controlPanel}>
        {/* Barcode Input */}
        <View style={styles.barcodeSection}>
          <Text style={styles.sectionLabel}>VISITOR SCAN</Text>
          <View style={styles.barcodeInputWrapper}>
            <Ionicons name="barcode-outline" size={20} color="#7C3AED" />
            <TextInput
              style={styles.barcodeInput}
              placeholder={isRecording ? "Scan badge..." : "Start recording first"}
              placeholderTextColor="#4B5563"
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              onSubmitEditing={handleBarcodeSubmit}
              autoCapitalize="characters"
              editable={isRecording}
            />
            <TouchableOpacity
              style={[styles.scanButton, !isRecording && styles.scanButtonDisabled]}
              onPress={handleBarcodeSubmit}
              disabled={!isRecording}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Record Button */}
        <View style={styles.recordSection}>
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.7}
          >
            <View style={[styles.recordButtonInner, isRecording && styles.recordButtonInnerActive]}>
              {isRecording ? (
                <View style={styles.stopIcon} />
              ) : (
                <View style={styles.recordIcon} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.recordButtonLabel}>
            {isRecording ? 'STOP' : 'RECORD'}
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/gallery')}>
            <Ionicons name="folder-open" size={22} color="#fff" />
            <Text style={styles.actionLabel}>Gallery</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
            <Ionicons name="power" size={22} color="#EF4444" />
            <Text style={[styles.actionLabel, { color: '#EF4444' }]}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0A0A0A',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
  },
  deviceInfo: {
    alignItems: 'flex-start',
  },
  deviceIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
    marginBottom: 6,
  },
  deviceIdText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  boothName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recordingStatus: {
    alignItems: 'center',
  },
  recIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  recText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  connectionInfo: {
    alignItems: 'flex-end',
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
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
  },
  onlineDot: {
    backgroundColor: '#10B981',
  },
  offlineDot: {
    backgroundColor: '#EF4444',
  },
  connectionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  timecodeOverlay: {
    position: 'absolute',
    top: 80,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  timecodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  timecodeLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '600',
    width: 50,
    letterSpacing: 1,
  },
  timecodeValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  timecodeDivider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 6,
  },
  timecodeRec: {
    color: '#EF4444',
  },
  frameValue: {
    color: '#7C3AED',
    fontSize: 11,
  },
  watermark: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  watermarkLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(124, 58, 237, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  barcodeStats: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcodeCountText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  barcodeCountLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  lastBarcodeBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  lastBarcodeText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '500',
  },
  controlPanel: {
    width: 200,
    backgroundColor: '#111111',
    borderLeftWidth: 1,
    borderLeftColor: '#1F1F1F',
    padding: 16,
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  barcodeSection: {
    marginBottom: 20,
  },
  barcodeInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingLeft: 12,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  barcodeInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    color: '#fff',
    fontSize: 13,
  },
  scanButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  scanButtonDisabled: {
    backgroundColor: '#3F3F46',
  },
  recordSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#7C3AED',
  },
  recordButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444',
  },
  recordButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonInnerActive: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    width: 50,
    height: 50,
  },
  recordIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
  },
  stopIcon: {
    width: 24,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  recordButtonLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    letterSpacing: 2,
  },
  actionsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
  },
  actionButton: {
    alignItems: 'center',
    padding: 10,
  },
  actionLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
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
