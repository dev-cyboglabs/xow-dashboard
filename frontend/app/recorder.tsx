import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  useWindowDimensions,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions, CameraRecordingOptions } from 'expo-camera';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { File } from 'expo-file-system/next';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Device {
  id: string;
  device_id: string;
  name: string;
}

export default function RecorderScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [device, setDevice] = useState<Device | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<any>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeCount, setBarcodeCount] = useState(0);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [videoRecordingActive, setVideoRecordingActive] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const frameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clockRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTime = useRef<number>(0);
  const barcodeInputRef = useRef<TextInput>(null);
  const videoUriRef = useRef<string | null>(null);
  
  // Use the new expo-audio recorder hook
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    loadDevice();
    checkPermissions();
    checkConnection();
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    const connInterval = setInterval(checkConnection, 10000);
    return () => {
      clearInterval(connInterval);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, []);

  const showToast = (msg: string, isError: boolean = false) => {
    setToastMessage(msg);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const loadDevice = async () => {
    const saved = await AsyncStorage.getItem('xow_device');
    if (saved) setDevice(JSON.parse(saved));
    else router.replace('/');
  };

  const checkPermissions = async () => {
    if (!cameraPermission?.granted) await requestCameraPermission();
    // Request audio permissions using new expo-audio
    const audioStatus = await AudioModule.requestRecordingPermissionsAsync();
    if (!audioStatus.granted) {
      Alert.alert('Permission Required', 'Microphone access is needed for recording.');
    }
  };

  const checkConnection = async () => {
    try {
      await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  };

  const formatTC = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const f = frameCount % 30;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const startRecording = async () => {
    if (!device) return;
    
    try {
      // Create recording entry in backend first
      const res = await axios.post(`${API_URL}/api/recordings`, {
        device_id: device.device_id,
        expo_name: 'Expo 2025',
        booth_name: device.name,
      });
      setCurrentRecording(res.data);
      setIsRecording(true);
      setFrameCount(0);
      setBarcodeCount(0);
      setRecordingTime(0);
      recordingStartTime.current = Date.now();
      videoUriRef.current = null;
      
      // Start timers for UI
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
      frameTimerRef.current = setInterval(() => setFrameCount(p => p + 1), 33.33);

      // Start video recording on camera
      if (cameraRef.current && Platform.OS !== 'web') {
        console.log('Starting video recording on', Platform.OS);
        setVideoRecordingActive(true);
        
        try {
          // Start recording - the promise resolves when stopRecording is called
          cameraRef.current.recordAsync({
            maxDuration: 3600,
          }).then((result) => {
            console.log('Video recording result:', result);
            if (result?.uri) {
              videoUriRef.current = result.uri;
              console.log('Video URI saved:', result.uri);
            }
            setVideoRecordingActive(false);
          }).catch((err: any) => {
            console.log('Video recording error:', err?.message || err);
            setVideoRecordingActive(false);
          });
        } catch (e: any) {
          console.log('recordAsync failed:', e?.message || e);
          setVideoRecordingActive(false);
        }
      }

      // Start audio recording using new expo-audio
      try {
        audioRecorder.record();
        console.log('Audio recording started');
      } catch (audioErr: any) {
        console.log('Audio recording error:', audioErr?.message || audioErr);
      }

      showToast('Recording started');
    } catch (e: any) {
      console.error('Start recording error:', e?.message || e);
      showToast('Failed to start recording', true);
    }
  };

  const stopRecording = async () => {
    if (!currentRecording) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);

      let audioUri: string | null = null;
      let videoUri: string | null = null;

      // Stop video recording first
      if (cameraRef.current && videoRecordingActive) {
        try {
          console.log('Stopping video recording...');
          cameraRef.current.stopRecording();
          
          // Wait for video to be saved (up to 10 seconds)
          for (let i = 0; i < 100; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (videoUriRef.current) {
              console.log('Video saved at:', videoUriRef.current);
              break;
            }
          }
          videoUri = videoUriRef.current;
        } catch (e: any) {
          console.log('Stop video error:', e?.message || e);
        }
      }
      setVideoRecordingActive(false);

      // Stop audio recording
      try {
        await audioRecorder.stop();
        audioUri = audioRecorder.uri;
        console.log('Audio saved at:', audioUri);
      } catch (e: any) {
        console.log('Stop audio error:', e?.message || e);
      }

      // Upload video if available
      if (videoUri) {
        setUploadProgress(10);
        showToast('Uploading video...');
        try {
          console.log('Uploading video from:', videoUri);
          await uploadVideo(currentRecording.id, videoUri);
          setUploadProgress(50);
          console.log('Video upload complete');
        } catch (e: any) {
          console.log('Video upload failed:', e?.message || e);
          showToast('Video upload failed - continuing with audio', true);
        }
      } else {
        console.log('No video to upload - video recording may not be supported on this device');
        setUploadProgress(30);
      }

      // Upload audio (this triggers automatic transcription)
      if (audioUri) {
        setUploadProgress(60);
        showToast('Uploading audio...');
        try {
          await uploadAudio(currentRecording.id, audioUri);
          setUploadProgress(90);
          console.log('Audio upload complete');
        } catch (e: any) {
          console.log('Audio upload failed:', e?.message || e);
        }
      }

      // Mark recording as complete
      await axios.put(`${API_URL}/api/recordings/${currentRecording.id}/complete`);
      setUploadProgress(100);
      
      const hasVideo = !!videoUri;
      showToast(`Saved! ${barcodeCount} visitors${hasVideo ? ' • Video + Audio' : ' • Audio only'}`);
      
      // Clean up local files
      if (videoUri) {
        try { 
          const videoFile = new File(videoUri);
          if (videoFile.exists) await videoFile.delete();
        } catch {}
      }
      if (audioUri) {
        try { 
          const audioFile = new File(audioUri);
          if (audioFile.exists) await audioFile.delete();
        } catch {}
      }

      setCurrentRecording(null);
      setRecordingTime(0);
      setFrameCount(0);
      setBarcodeCount(0);
      videoUriRef.current = null;
    } catch (e: any) {
      console.error('Stop recording error:', e?.message || e);
      showToast('Save failed', true);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const uploadVideo = async (recordingId: string, uri: string) => {
    try {
      // Use new File API
      const file = new File(uri);
      const exists = file.exists;
      
      if (!exists) {
        console.log('Video file does not exist:', uri);
        throw new Error('Video file not found');
      }
      
      const fileSize = file.size || 0;
      console.log('Video file size:', fileSize);
      
      // Determine file type based on URI
      const isMovFile = uri.toLowerCase().endsWith('.mov');
      const mimeType = isMovFile ? 'video/quicktime' : 'video/mp4';
      const fileName = isMovFile ? 'recording.mov' : 'recording.mp4';

      const formData = new FormData();
      formData.append('video', {
        uri,
        type: mimeType,
        name: fileName,
      } as any);
      formData.append('chunk_index', '0');
      formData.append('total_chunks', '1');

      console.log('Uploading video:', { recordingId, uri, mimeType, fileName, fileSize });
      
      const response = await axios.post(
        `${API_URL}/api/recordings/${recordingId}/upload-video`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 min timeout
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.loaded / (progressEvent.total || 1) * 100;
            console.log('Video upload progress:', progress.toFixed(1) + '%');
          }
        }
      );
      
      console.log('Video upload response:', response.data);
      return response.data;
    } catch (e: any) {
      console.log('Video upload error:', e?.message || e);
      throw e;
    }
  };

  const uploadAudio = async (recordingId: string, uri: string) => {
    try {
      // Use new File API
      const file = new File(uri);
      const exists = file.exists;
      
      if (!exists) {
        console.log('Audio file does not exist:', uri);
        throw new Error('Audio file not found');
      }
      
      const fileSize = file.size || 0;
      console.log('Audio file size:', fileSize);

      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any);

      console.log('Uploading audio:', { recordingId, uri, fileSize });
      
      const response = await axios.post(
        `${API_URL}/api/recordings/${recordingId}/upload-audio`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.loaded / (progressEvent.total || 1) * 100;
            console.log('Audio upload progress:', progress.toFixed(1) + '%');
          }
        }
      );
      
      console.log('Audio upload response:', response.data);
      return response.data;
    } catch (e: any) {
      console.log('Audio upload error:', e?.message || e);
      throw e;
    }
  };

  const handleBarcode = async () => {
    if (!barcodeInput.trim() || !currentRecording || !isRecording) return;
    const bc = barcodeInput.trim();
    const ts = (Date.now() - recordingStartTime.current) / 1000;
    try {
      await axios.post(`${API_URL}/api/barcodes`, {
        recording_id: currentRecording.id,
        barcode_data: bc,
        video_timestamp: ts,
        frame_code: frameCount,
      });
    } catch {}
    setBarcodeCount(p => p + 1);
    setBarcodeInput('');
    showToast(`Visitor: ${bc}`);
    barcodeInputRef.current?.focus();
  };

  const handleLogout = async () => {
    if (isRecording) {
      Alert.alert('Recording Active', 'Please stop recording before exiting.');
      return;
    }
    await AsyncStorage.removeItem('xow_device');
    router.replace('/');
  };

  if (!cameraPermission?.granted) {
    return (
      <View style={[styles.container, { width, height, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="videocam-off" size={40} color="#8B5CF6" />
        <Text style={{ color: '#fff', marginTop: 12, fontSize: 16 }}>Camera Permission Required</Text>
        <TouchableOpacity onPress={requestCameraPermission} style={{ marginTop: 16, backgroundColor: '#8B5CF6', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Enable Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const panelWidth = Math.min(140, width * 0.15);

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Camera View with Overlays */}
      <View style={[styles.cameraArea, { width: width - panelWidth }]}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="video"
        />

        {/* Top Bar - Device Info, Recording Status, Connection */}
        <View style={styles.topBar}>
          <View style={styles.deviceSection}>
            <View style={styles.idBadge}>
              <Ionicons name="hardware-chip" size={10} color="#8B5CF6" />
              <Text style={styles.idText}>{device?.device_id || '---'}</Text>
            </View>
            <View style={styles.brandBadge}>
              <Ionicons name="videocam" size={8} color="#8B5CF6" />
              <Text style={styles.brandText}>XoW</Text>
            </View>
          </View>
          {isRecording && (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>REC</Text>
              {videoRecordingActive && <Text style={styles.videoIndicator}>VIDEO</Text>}
            </View>
          )}
          <View style={[styles.statusBadge, isOnline ? styles.online : styles.offline]}>
            <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.statusText}>{isOnline ? 'CLOUD' : 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Timecode Overlay - Top Left */}
        <View style={styles.tcBox}>
          <Text style={styles.tcLabel}>DATE</Text>
          <Text style={styles.tcVal}>{formatDate(currentTime)}</Text>
          <Text style={styles.tcLabel}>TIME</Text>
          <Text style={styles.tcVal}>{formatTime(currentTime)}</Text>
          {isRecording && (
            <>
              <View style={styles.tcDiv} />
              <Text style={styles.tcLabel}>TIMECODE</Text>
              <Text style={[styles.tcVal, { color: '#EF4444' }]}>{formatTC(recordingTime)}</Text>
              <Text style={styles.tcLabel}>FRAME</Text>
              <Text style={[styles.tcVal, { color: '#8B5CF6', fontSize: 9 }]}>{frameCount.toString().padStart(6, '0')}</Text>
            </>
          )}
        </View>

        {/* XoW Watermark - Bottom Right */}
        <View style={styles.watermark}>
          <View style={styles.wmIcon}>
            <Ionicons name="videocam" size={12} color="#fff" />
          </View>
          <Text style={styles.wmText}>XoW</Text>
          {isRecording && <Text style={styles.wmLive}>LIVE</Text>}
        </View>

        {/* Visitor Count - Bottom Left */}
        {isRecording && (
          <View style={styles.visitorBox}>
            <Ionicons name="people" size={16} color="#8B5CF6" />
            <Text style={styles.visitorNum}>{barcodeCount}</Text>
            <Text style={styles.visitorLabel}>visitors</Text>
          </View>
        )}

        {/* Recording Duration - Center Bottom */}
        {isRecording && (
          <View style={styles.durationBox}>
            <Text style={styles.durationText}>{formatTC(recordingTime).slice(0, 8)}</Text>
          </View>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <View style={styles.uploadOverlay}>
            <View style={styles.uploadBox}>
              <Ionicons name="cloud-upload" size={32} color="#8B5CF6" />
              <Text style={styles.uploadTitle}>Uploading & Processing</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.uploadPercent}>{uploadProgress}%</Text>
            </View>
          </View>
        )}

        {/* Toast Notification */}
        {toastVisible && (
          <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}
      </View>

      {/* Control Panel - Right Side */}
      <View style={[styles.panel, { width: panelWidth }]}>
        <View>
          <Text style={styles.boothName} numberOfLines={1}>{device?.name || 'Booth'}</Text>
          <Text style={styles.boothSub}>Expo Recording</Text>
        </View>

        {/* Visitor Scan Input */}
        <View style={styles.section}>
          <Text style={styles.secLabel}>VISITOR BADGE</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={barcodeInputRef}
              style={styles.input}
              placeholder="Scan/Enter"
              placeholderTextColor="#444"
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              onSubmitEditing={handleBarcode}
              autoCapitalize="characters"
              editable={isRecording}
            />
            <TouchableOpacity
              style={[styles.addBtn, !isRecording && { backgroundColor: '#333' }]}
              onPress={handleBarcode}
              disabled={!isRecording}
            >
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          {isRecording && barcodeCount > 0 && (
            <Text style={styles.scanCount}>{barcodeCount} scanned</Text>
          )}
        </View>

        {/* Record/Stop Button */}
        <View style={styles.recSection}>
          <TouchableOpacity
            style={[styles.recBtn, isRecording && styles.recBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isUploading}
          >
            <View style={[styles.recBtnInner, isRecording && styles.recBtnInnerActive]}>
              {isUploading ? (
                <Ionicons name="cloud-upload" size={20} color="#fff" />
              ) : isRecording ? (
                <View style={styles.stopIcon} />
              ) : (
                <View style={styles.recordIcon} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.recLabel}>
            {isUploading ? 'UPLOADING' : isRecording ? 'STOP' : 'RECORD'}
          </Text>
          {isRecording && (
            <Text style={styles.recHint}>Tap to stop & upload</Text>
          )}
        </View>

        {/* Bottom Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actBtn} onPress={() => router.push('/gallery')}>
            <Ionicons name="folder" size={18} color="#fff" />
            <Text style={styles.actLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={handleLogout}>
            <Ionicons name="power" size={18} color="#EF4444" />
            <Text style={[styles.actLabel, { color: '#EF4444' }]}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#000' },
  cameraArea: { flex: 1, position: 'relative' },
  
  // Top Bar
  topBar: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  deviceSection: { gap: 4 },
  idBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 4 },
  idText: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  brandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.4)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, gap: 3 },
  brandText: { color: '#8B5CF6', fontSize: 9, fontWeight: '800' },
  recBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, gap: 5 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  recText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  videoIndicator: { color: '#fff', fontSize: 8, fontWeight: '600', backgroundColor: '#7C3AED', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginLeft: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 4 },
  online: { backgroundColor: 'rgba(16,185,129,0.3)' },
  offline: { backgroundColor: 'rgba(239,68,68,0.3)' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  onlineDot: { backgroundColor: '#10B981' },
  offlineDot: { backgroundColor: '#EF4444' },
  statusText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  
  // Timecode Box
  tcBox: { position: 'absolute', top: 55, left: 10, backgroundColor: 'rgba(0,0,0,0.9)', padding: 8, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#8B5CF6' },
  tcLabel: { color: '#666', fontSize: 8, fontWeight: '600', marginTop: 2 },
  tcVal: { color: '#fff', fontSize: 12, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tcDiv: { height: 1, backgroundColor: '#333', marginVertical: 4 },
  
  // Watermark
  watermark: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.95)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, gap: 6 },
  wmIcon: { width: 20, height: 20, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  wmText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  wmLive: { color: '#fff', fontSize: 8, fontWeight: '700', backgroundColor: '#EF4444', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginLeft: 2 },
  
  // Visitor Box
  visitorBox: { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.9)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitorNum: { color: '#fff', fontSize: 22, fontWeight: '800' },
  visitorLabel: { color: '#666', fontSize: 10 },
  
  // Duration Box
  durationBox: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#EF4444' },
  durationText: { color: '#EF4444', fontSize: 18, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  
  // Upload Overlay
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  uploadBox: { backgroundColor: '#0a0a0a', padding: 30, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a' },
  uploadTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 20 },
  progressBar: { width: 200, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#8B5CF6', borderRadius: 3 },
  uploadPercent: { color: '#8B5CF6', fontSize: 14, fontWeight: '700', marginTop: 8 },
  
  // Toast
  toast: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.95)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#10B981' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  
  // Control Panel
  panel: { backgroundColor: '#0a0a0a', borderLeftWidth: 1, borderLeftColor: '#1a1a1a', padding: 12, justifyContent: 'space-between' },
  boothName: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  boothSub: { color: '#666', fontSize: 9, textAlign: 'center', marginTop: 2 },
  
  section: { marginTop: 16 },
  secLabel: { color: '#555', fontSize: 8, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', gap: 4 },
  input: { flex: 1, backgroundColor: '#111', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, color: '#fff', fontSize: 11, borderWidth: 1, borderColor: '#222' },
  addBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
  scanCount: { color: '#8B5CF6', fontSize: 9, marginTop: 4, textAlign: 'center' },
  
  recSection: { alignItems: 'center' },
  recBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(139,92,246,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#8B5CF6' },
  recBtnActive: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#EF4444' },
  recBtnInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
  recBtnInnerActive: { backgroundColor: '#EF4444', borderRadius: 8, width: 32, height: 32 },
  recordIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  stopIcon: { width: 14, height: 14, borderRadius: 2, backgroundColor: '#fff' },
  recLabel: { color: '#888', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 6, letterSpacing: 0.5 },
  recHint: { color: '#555', fontSize: 8, marginTop: 2 },
  
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  actBtn: { alignItems: 'center', padding: 8 },
  actLabel: { color: '#888', fontSize: 9, marginTop: 3 },
});
