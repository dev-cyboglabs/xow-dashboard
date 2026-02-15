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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
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
  const [isUploading, setIsUploading] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const audioRecording = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const frameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clockRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTime = useRef<number>(0);
  const barcodeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadDevice();
    checkPermissions();
    checkConnection();
    
    clockRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const connectionInterval = setInterval(checkConnection, 10000);
    
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
    await Audio.requestPermissionsAsync();
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
      year: 'numeric',
      month: '2-digit',
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
      setRecordingTime(0);
      recordingStartTime.current = Date.now();

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      frameTimerRef.current = setInterval(() => {
        setFrameCount((prev) => prev + 1);
      }, 33.33);

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      audioRecording.current = recording;

    } catch (error) {
      console.error('Start recording error:', error);
      Alert.alert('Error', 'Failed to start recording. Check connection.');
    }
  };

  const stopRecording = async () => {
    if (!currentRecording) return;

    setIsUploading(true);
    try {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);

      let audioUri = null;
      if (audioRecording.current) {
        await audioRecording.current.stopAndUnloadAsync();
        audioUri = audioRecording.current.getURI();
        audioRecording.current = null;
      }

      // Upload audio
      if (audioUri) {
        const formData = new FormData();
        formData.append('audio', {
          uri: audioUri,
          type: 'audio/m4a',
          name: 'recording.m4a',
        } as any);

        try {
          await axios.post(
            `${API_URL}/api/recordings/${currentRecording.id}/upload-audio`,
            formData,
            { 
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 60000
            }
          );
        } catch (uploadError) {
          console.log('Audio upload failed, saving for later');
          await AsyncStorage.setItem(
            `pending_upload_${currentRecording.id}`,
            JSON.stringify({ audioUri, recordingId: currentRecording.id })
          );
        }
      }

      // Complete recording
      await axios.put(`${API_URL}/api/recordings/${currentRecording.id}/complete`);

      // Trigger transcription in background
      try {
        axios.post(`${API_URL}/api/recordings/${currentRecording.id}/transcribe`);
      } catch (e) {
        console.log('Transcription queued');
      }

      const duration = recordingTime;
      const visitors = barcodeCount;
      
      setCurrentRecording(null);
      setRecordingTime(0);
      setFrameCount(0);
      setBarcodeCount(0);
      setLastBarcode(null);

      Alert.alert(
        'Recording Complete',
        `Duration: ${Math.floor(duration/60)}m ${duration%60}s\nVisitors: ${visitors}\nUploading to cloud...`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Stop recording error:', error);
      Alert.alert('Error', 'Failed to save recording');
    } finally {
      setIsUploading(false);
    }
  };

  const handleBarcodeSubmit = async () => {
    if (!barcodeInput.trim() || !currentRecording || !isRecording) return;

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
    } catch (error) {
      // Save offline
      const pendingScans = await AsyncStorage.getItem('pending_scans') || '[]';
      const scans = JSON.parse(pendingScans);
      scans.push({
        recording_id: currentRecording.id,
        barcode_data: barcode,
        video_timestamp: videoTimestamp,
        frame_code: currentFrame,
      });
      await AsyncStorage.setItem('pending_scans', JSON.stringify(scans));
    }

    setLastBarcode(barcode);
    setBarcodeCount((prev) => prev + 1);
    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  const handleLogout = async () => {
    if (isRecording) {
      Alert.alert('Warning', 'Stop recording before signing out');
      return;
    }
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
          <Ionicons name="videocam-off" size={48} color="#8B5CF6" />
          <Text style={styles.permissionTitle}>Camera Required</Text>
          <Text style={styles.permissionText}>Enable camera to record</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
            <Text style={styles.permissionButtonText}>Enable</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera Area */}
      <View style={styles.cameraArea}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        
        {/* Top Overlay */}
        <View style={styles.topOverlay}>
          <View style={styles.deviceBadge}>
            <Ionicons name="hardware-chip" size={12} color="#8B5CF6" />
            <Text style={styles.deviceId}>{device?.device_id || '---'}</Text>
          </View>
          
          {isRecording && (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>REC</Text>
            </View>
          )}
          
          <View style={[styles.statusBadge, isOnline ? styles.online : styles.offline]}>
            <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.statusText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Timecode Box */}
        <View style={styles.timecodeBox}>
          <Text style={styles.tcLabel}>DATE</Text>
          <Text style={styles.tcValue}>{formatDate(currentTime)}</Text>
          <Text style={styles.tcLabel}>TIME</Text>
          <Text style={styles.tcValue}>{formatTime(currentTime)}</Text>
          {isRecording && (
            <>
              <View style={styles.tcDivider} />
              <Text style={styles.tcLabel}>TIMECODE</Text>
              <Text style={[styles.tcValue, styles.tcRec]}>{formatTimecode(recordingTime)}</Text>
              <Text style={styles.tcLabel}>FRAME</Text>
              <Text style={[styles.tcValue, styles.tcFrame]}>{frameCount.toString().padStart(6, '0')}</Text>
            </>
          )}
        </View>

        {/* Watermark */}
        <View style={styles.watermark}>
          <Ionicons name="videocam" size={14} color="#8B5CF6" />
          <Text style={styles.watermarkText}>XoW</Text>
        </View>

        {/* Visitor Count */}
        {isRecording && (
          <View style={styles.visitorBox}>
            <Ionicons name="people" size={16} color="#8B5CF6" />
            <Text style={styles.visitorCount}>{barcodeCount}</Text>
            {lastBarcode && <Text style={styles.lastScan}>{lastBarcode}</Text>}
          </View>
        )}
      </View>

      {/* Control Panel */}
      <View style={styles.controlPanel}>
        <Text style={styles.boothName}>{device?.name || 'Booth'}</Text>
        
        {/* Barcode Input */}
        <View style={styles.barcodeSection}>
          <Text style={styles.sectionLabel}>SCAN VISITOR</Text>
          <View style={styles.barcodeInputRow}>
            <TextInput
              ref={barcodeInputRef}
              style={styles.barcodeInput}
              placeholder="Badge ID"
              placeholderTextColor="#555"
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              onSubmitEditing={handleBarcodeSubmit}
              autoCapitalize="characters"
              editable={isRecording}
            />
            <TouchableOpacity
              style={[styles.scanBtn, !isRecording && styles.disabledBtn]}
              onPress={handleBarcodeSubmit}
              disabled={!isRecording}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Record Button */}
        <TouchableOpacity
          style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isUploading}
        >
          <View style={[styles.recordBtnInner, isRecording && styles.recordBtnInnerActive]}>
            {isUploading ? (
              <Ionicons name="cloud-upload" size={28} color="#fff" />
            ) : isRecording ? (
              <View style={styles.stopIcon} />
            ) : (
              <View style={styles.recordIcon} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.recordLabel}>
          {isUploading ? 'UPLOADING...' : isRecording ? 'STOP' : 'RECORD'}
        </Text>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/gallery')}>
            <Ionicons name="folder" size={20} color="#fff" />
            <Text style={styles.actionLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleLogout}>
            <Ionicons name="power" size={20} color="#EF4444" />
            <Text style={[styles.actionLabel, {color: '#EF4444'}]}>Exit</Text>
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
    backgroundColor: '#000',
  },
  cameraArea: {
    flex: 1,
    position: 'relative',
  },
  topOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  deviceId: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    gap: 6,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  recText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  online: { backgroundColor: 'rgba(16,185,129,0.3)' },
  offline: { backgroundColor: 'rgba(239,68,68,0.3)' },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineDot: { backgroundColor: '#10B981' },
  offlineDot: { backgroundColor: '#EF4444' },
  statusText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  timecodeBox: {
    position: 'absolute',
    top: 50,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#8B5CF6',
  },
  tcLabel: {
    color: '#666',
    fontSize: 8,
    fontWeight: '600',
  },
  tcValue: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  tcDivider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 4,
  },
  tcRec: { color: '#EF4444' },
  tcFrame: { color: '#8B5CF6', fontSize: 10 },
  watermark: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '800',
  },
  visitorBox: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  visitorCount: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  lastScan: {
    color: '#8B5CF6',
    fontSize: 10,
    marginLeft: 4,
  },
  controlPanel: {
    width: 160,
    backgroundColor: '#0A0A0A',
    borderLeftWidth: 1,
    borderLeftColor: '#1a1a1a',
    padding: 12,
    justifyContent: 'space-between',
  },
  boothName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    color: '#555',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 6,
  },
  barcodeSection: {
    marginBottom: 16,
  },
  barcodeInputRow: {
    flexDirection: 'row',
    gap: 4,
  },
  barcodeInput: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  scanBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    backgroundColor: '#333',
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139,92,246,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  recordBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: '#EF4444',
  },
  recordBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordBtnInnerActive: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    width: 40,
    height: 40,
  },
  recordIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  stopIcon: {
    width: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  recordLabel: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  actionBtn: {
    alignItems: 'center',
    padding: 8,
  },
  actionLabel: {
    color: '#888',
    fontSize: 9,
    marginTop: 2,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  permissionText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
