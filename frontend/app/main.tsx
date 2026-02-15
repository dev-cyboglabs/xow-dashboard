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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions, CameraCapturedPicture } from 'expo-camera';
import { Audio, Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
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
      // Create recording in backend
      const response = await axios.post(`${API_URL}/api/recordings`, {
        device_id: device.device_id,
        expo_name: 'Expo 2025',
        booth_name: device.name,
      });

      setCurrentRecording(response.data);
      setIsRecording(true);
      recordingStartTime.current = Date.now();

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start audio recording
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

      // Stop audio recording
      if (audioRecording.current) {
        await audioRecording.current.stopAndUnloadAsync();
        const uri = audioRecording.current.getURI();
        
        if (uri) {
          // Upload audio
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

      // Complete recording
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
      // Save locally if offline
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
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
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
      <LinearGradient colors={['#0a0a0f', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={60} color="#e94560" />
          <Text style={styles.permissionText}>Camera permission required</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera Preview */}
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent', 'transparent', 'rgba(0,0,0,0.7)']}
          style={styles.overlay}
        >
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.deviceInfo}>
              <Ionicons name="tablet-portrait" size={18} color="#fff" />
              <Text style={styles.deviceName}>{device?.name || 'Device'}</Text>
            </View>
            
            {/* Connection Status */}
            <View style={[styles.statusBadge, { backgroundColor: isOnline ? '#00c853' : '#ff5252' }]}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? '#00e676' : '#ff8a80' }]} />
              <Text style={styles.statusText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
          </View>

          {/* Timestamp Overlay */}
          {isRecording && (
            <View style={styles.timestampOverlay}>
              <Text style={styles.timestampText}>{getCurrentDateTime()}</Text>
              <Text style={styles.frameText}>REC {formatTime(recordingTime)}</Text>
            </View>
          )}

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            {/* Navigation Buttons */}
            <View style={styles.navButtons}>
              <TouchableOpacity style={styles.navButton} onPress={() => router.push('/gallery')}>
                <Ionicons name="images-outline" size={24} color="#fff" />
                <Text style={styles.navButtonText}>Gallery</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.navButton} onPress={() => router.push('/dashboard')}>
                <Ionicons name="analytics-outline" size={24} color="#fff" />
                <Text style={styles.navButtonText}>Dashboard</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.navButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={24} color="#ff5252" />
                <Text style={[styles.navButtonText, { color: '#ff5252' }]}>Logout</Text>
              </TouchableOpacity>
            </View>

            {/* Barcode Input */}
            {isRecording && (
              <View style={styles.barcodeSection}>
                <View style={styles.barcodeInputContainer}>
                  <Ionicons name="barcode-outline" size={20} color="#e94560" />
                  <TextInput
                    style={styles.barcodeInput}
                    placeholder="Scan or enter barcode..."
                    placeholderTextColor="#666"
                    value={barcodeInput}
                    onChangeText={setBarcodeInput}
                    onSubmitEditing={handleBarcodeSubmit}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity onPress={handleBarcodeSubmit}>
                    <Ionicons name="add-circle" size={28} color="#e94560" />
                  </TouchableOpacity>
                </View>
                
                {recentScans.length > 0 && (
                  <ScrollView horizontal style={styles.recentScans} showsHorizontalScrollIndicator={false}>
                    {recentScans.map((scan, index) => (
                      <View key={index} style={styles.scanBadge}>
                        <Text style={styles.scanBadgeText}>{scan}</Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Record Button */}
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordingButton]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <View style={[styles.recordButtonInner, isRecording && styles.recordingButtonInner]}>
                {isRecording ? (
                  <Ionicons name="stop" size={40} color="#fff" />
                ) : (
                  <View style={styles.recordDot} />
                )}
              </View>
            </TouchableOpacity>
            
            <Text style={styles.recordLabel}>
              {isRecording ? 'Tap to Stop Recording' : 'Tap to Start Recording'}
            </Text>
          </View>
        </LinearGradient>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  deviceName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timestampOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90,
    left: 20,
    backgroundColor: 'rgba(233,69,96,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timestampText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  frameText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  bottomControls: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    alignItems: 'center',
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 30,
    marginBottom: 20,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  barcodeSection: {
    width: '100%',
    marginBottom: 20,
  },
  barcodeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.5)',
  },
  barcodeInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 16,
  },
  recentScans: {
    marginTop: 10,
  },
  scanBadge: {
    backgroundColor: 'rgba(233,69,96,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  scanBadgeText: {
    color: '#fff',
    fontSize: 12,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  recordingButton: {
    backgroundColor: 'rgba(255,82,82,0.3)',
    borderColor: '#ff5252',
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingButtonInner: {
    backgroundColor: '#ff5252',
    borderRadius: 8,
    width: 40,
    height: 40,
  },
  recordDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
  },
  recordLabel: {
    color: '#fff',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 20,
    marginBottom: 30,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#e94560',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
