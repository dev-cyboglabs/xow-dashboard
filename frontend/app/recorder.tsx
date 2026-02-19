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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Device {
  id: string;
  device_id: string;
  name: string;
}

interface LocalRecording {
  id: string;
  localId: string;
  videoPath: string | null;
  audioPath: string | null;
  barcodeScansList: BarcodeData[];
  duration: number;
  createdAt: string;
  isUploaded: boolean;
  boothName: string;
  deviceId: string;
}

interface BarcodeData {
  barcode_data: string;
  video_timestamp: number;
  frame_code: number;
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
  const [fps, setFps] = useState(0);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeCount, setBarcodeCount] = useState(0);
  const [barcodeScans, setBarcodeScans] = useState<BarcodeData[]>([]);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [videoRecordingActive, setVideoRecordingActive] = useState(false);
  const [autoUpload, setAutoUpload] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fpsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsFrameRef = useRef(0);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTime = useRef<number>(0);
  const barcodeInputRef = useRef<TextInput>(null);
  const videoUriRef = useRef<string | null>(null);
  
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    loadDevice();
    loadSettings();
    checkPermissions();
    checkConnection();
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    const connInterval = setInterval(checkConnection, 10000);
    return () => {
      clearInterval(connInterval);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
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

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem('xow_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        setAutoUpload(settings.autoUpload || false);
      }
    } catch (e) {
      console.log('Load settings error:', e);
    }
  };

  const checkPermissions = async () => {
    if (!cameraPermission?.granted) await requestCameraPermission();
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
      setIsRecording(true);
      setFrameCount(0);
      setBarcodeCount(0);
      setBarcodeScans([]);
      setRecordingTime(0);
      recordingStartTime.current = Date.now();
      videoUriRef.current = null;
      
      const localId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentRecording({ localId });
      
      frameCountRef.current = 0;
      lastFpsFrameRef.current = 0;
      setFps(0);
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
      frameTimerRef.current = setInterval(() => {
        frameCountRef.current += 1;
        setFrameCount(frameCountRef.current);
      }, 33.33);
      fpsTimerRef.current = setInterval(() => {
        const current = frameCountRef.current;
        setFps(current - lastFpsFrameRef.current);
        lastFpsFrameRef.current = current;
      }, 1000);

      // Show Android Expo Go limitation notice
      if (Platform.OS === 'android' && __DEV__) {
        console.log('Note: Video recording is limited in Expo Go on Android. For full video recording, use a development build.');
        showToast('Audio only (Expo Go)');
      }

      // Try video recording on all platforms (may fail on Android Expo Go)
      if (cameraRef.current && Platform.OS !== 'web') {
        console.log('Starting video recording on', Platform.OS);
        setVideoRecordingActive(true);
        
        // Show Android limitation warning
        if (Platform.OS === 'android') {
          console.log('Note: Video recording may be limited in Expo Go on Android. For full video recording, use a development build.');
          showToast('Video may be limited on Expo Go');
        }
        
        try {
          cameraRef.current.recordAsync({ maxDuration: 3600 }).then((result) => {
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

      try {
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        console.log('Audio recording started');
      } catch (audioErr: any) {
        console.log('Audio recording error:', audioErr?.message || audioErr);
      }

      showToast('Recording started');
    } catch (e: any) {
      console.error('Start recording error:', e?.message || e);
      showToast('Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!currentRecording) return;
    
    setIsSaving(true);
    setSaveProgress(0);
    
    try {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);

      let audioUri: string | null = null;
      let videoUri: string | null = null;

      if (cameraRef.current && videoRecordingActive) {
        try {
          console.log('Stopping video recording...');
          cameraRef.current.stopRecording();
          
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

      try {
        await audioRecorder.stop();
        audioUri = audioRecorder.uri;
        console.log('Audio saved at:', audioUri);
      } catch (e: any) {
        console.log('Stop audio error:', e?.message || e);
      }

      setSaveProgress(30);

      const savedVideoPath = videoUri;
      const savedAudioPath = audioUri;
      
      console.log('Video path:', savedVideoPath);
      console.log('Audio path:', savedAudioPath);

      setSaveProgress(50);

      const localRecording: LocalRecording = {
        id: '',
        localId: currentRecording.localId,
        videoPath: savedVideoPath,
        audioPath: savedAudioPath,
        barcodeScansList: barcodeScans,
        duration: recordingTime,
        createdAt: new Date().toISOString(),
        isUploaded: false,
        boothName: device?.name || 'Unknown Booth',
        deviceId: device?.device_id || '',
      };

      const existingRecordings = await getLocalRecordings();
      existingRecordings.unshift(localRecording);
      await AsyncStorage.setItem('xow_local_recordings', JSON.stringify(existingRecordings));
      
      setSaveProgress(70);

      if (autoUpload && isOnline && (savedVideoPath || savedAudioPath)) {
        showToast('Uploading to cloud...');
        try {
          await uploadRecordingToCloud(localRecording);
          showToast(`Uploaded! ${barcodeCount} visitors`);
        } catch (e: any) {
          console.log('Auto upload failed:', e?.message || e);
          showToast('Saved locally. Upload from Gallery.');
        }
      } else {
        const hasMedia = savedVideoPath || savedAudioPath;
        showToast(hasMedia ? `Saved! ${barcodeCount} visitors` : 'Recording saved');
      }

      setSaveProgress(100);

      setCurrentRecording(null);
      setRecordingTime(0);
      setFrameCount(0);
      setBarcodeCount(0);
      setBarcodeScans([]);
      videoUriRef.current = null;
    } catch (e: any) {
      console.error('Stop recording error:', e?.message || e);
      showToast('Save failed');
    } finally {
      setIsSaving(false);
      setSaveProgress(0);
    }
  };

  const getLocalRecordings = async (): Promise<LocalRecording[]> => {
    try {
      const saved = await AsyncStorage.getItem('xow_local_recordings');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const uploadRecordingToCloud = async (recording: LocalRecording) => {
    if (!device) throw new Error('No device');
    
    console.log('Starting upload for recording:', recording.localId);
    
    const res = await axios.post(`${API_URL}/api/recordings`, {
      device_id: device.device_id,
      expo_name: 'Expo 2025',
      booth_name: recording.boothName,
    });
    
    const recordingId = res.data.id;
    console.log('Created recording in backend:', recordingId);

    if (recording.videoPath) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(recording.videoPath);
        if (fileInfo.exists) {
          const isMovFile = recording.videoPath.toLowerCase().endsWith('.mov');
          console.log('Uploading video...');
          
          const uploadResult = await FileSystem.uploadAsync(
            `${API_URL}/api/recordings/${recordingId}/upload-video`,
            recording.videoPath,
            {
              fieldName: 'video',
              httpMethod: 'POST',
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              mimeType: isMovFile ? 'video/quicktime' : 'video/mp4',
              parameters: { chunk_index: '0', total_chunks: '1' },
            }
          );
          console.log('Video upload status:', uploadResult.status);
        }
      } catch (e: any) {
        console.log('Video upload error:', e?.message || e);
      }
    }

    if (recording.audioPath) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(recording.audioPath);
        if (fileInfo.exists) {
          console.log('Uploading audio...');
          
          const uploadResult = await FileSystem.uploadAsync(
            `${API_URL}/api/recordings/${recordingId}/upload-audio`,
            recording.audioPath,
            {
              fieldName: 'audio',
              httpMethod: 'POST',
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              mimeType: 'audio/m4a',
            }
          );
          console.log('Audio upload status:', uploadResult.status);
        }
      } catch (e: any) {
        console.log('Audio upload error:', e?.message || e);
      }
    }

    for (const scan of recording.barcodeScansList || []) {
      try {
        await axios.post(`${API_URL}/api/barcodes`, {
          recording_id: recordingId,
          barcode_data: scan.barcode_data,
          video_timestamp: scan.video_timestamp,
          frame_code: scan.frame_code,
        });
      } catch {}
    }

    await axios.put(`${API_URL}/api/recordings/${recordingId}/complete`);

    const localRecordings = await getLocalRecordings();
    const idx = localRecordings.findIndex(r => r.localId === recording.localId);
    if (idx !== -1) {
      localRecordings[idx].id = recordingId;
      localRecordings[idx].isUploaded = true;
      await AsyncStorage.setItem('xow_local_recordings', JSON.stringify(localRecordings));
    }

    return recordingId;
  };

  const handleBarcode = async () => {
    if (!barcodeInput.trim() || !isRecording) return;
    const bc = barcodeInput.trim();
    const ts = (Date.now() - recordingStartTime.current) / 1000;
    
    const newScan: BarcodeData = {
      barcode_data: bc,
      video_timestamp: ts,
      frame_code: frameCount,
    };
    setBarcodeScans(prev => [...prev, newScan]);
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
        <Ionicons name="videocam-off" size={40} color="#E54B2A" />
        <Text style={{ color: '#fff', marginTop: 12, fontSize: 16 }}>Camera Permission Required</Text>
        <TouchableOpacity onPress={requestCameraPermission} style={{ marginTop: 16, backgroundColor: '#E54B2A', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Enable Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const panelWidth = Math.min(140, width * 0.15);

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={[styles.cameraArea, { width: width - panelWidth }]}>

        {/* Preview Header — shown above the video when recording */}
        {isRecording && (
          <View style={styles.previewHeader}>
            <View style={styles.previewHeaderLeft}>
              <View style={styles.previewLogo}>
                <Ionicons name="videocam" size={14} color="#fff" />
                <Text style={styles.previewLogoText}>XoW</Text>
                <View style={styles.previewLiveDot} />
              </View>
              <View style={styles.previewDivider} />
              <View style={styles.previewTCBlock}>
                <Text style={styles.previewMetaLabel}>TIMECODE</Text>
                <Text style={styles.previewTCVal}>{formatTC(recordingTime)}</Text>
              </View>
              <View style={styles.previewDivider} />
              <View style={styles.previewTCBlock}>
                <Text style={styles.previewMetaLabel}>FPS</Text>
                <Text style={styles.previewFPSVal}>{fps}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Camera feed */}
        <View style={styles.cameraViewWrapper}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" mode="video" />

        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.deviceSection}>
            <View style={styles.idBadge}>
              <Ionicons name="hardware-chip" size={10} color="#E54B2A" />
              <Text style={styles.idText}>{device?.device_id || '---'}</Text>
            </View>
            <View style={styles.brandBadge}>
              <Ionicons name="videocam" size={8} color="#E54B2A" />
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

        {/* Timecode Box — date/time only */}
        <View style={styles.tcBox}>
          <Text style={styles.tcLabel}>DATE</Text>
          <Text style={styles.tcVal}>{formatDate(currentTime)}</Text>
          <Text style={styles.tcLabel}>TIME</Text>
          <Text style={styles.tcVal}>{formatTime(currentTime)}</Text>
        </View>

        {/* Watermark */}
        <View style={styles.watermark}>
          <View style={styles.wmIcon}>
            <Ionicons name="videocam" size={12} color="#fff" />
          </View>
          <Text style={styles.wmText}>XoW</Text>
          {isRecording && <Text style={styles.wmLive}>LIVE</Text>}
        </View>

        {/* Visitor Count */}
        {isRecording && (
          <View style={styles.visitorBox}>
            <Ionicons name="people" size={16} color="#E54B2A" />
            <Text style={styles.visitorNum}>{String(barcodeCount)}</Text>
            <Text style={styles.visitorLabel}>visitors</Text>
          </View>
        )}

        {/* Duration */}
        {isRecording && (
          <View style={styles.durationBox}>
            <Text style={styles.durationText}>{formatTC(recordingTime).slice(0, 8)}</Text>
          </View>
        )}

        {/* Save Progress */}
        {isSaving && (
          <View style={styles.uploadOverlay}>
            <View style={styles.uploadBox}>
              <Ionicons name="save" size={32} color="#E54B2A" />
              <Text style={styles.uploadTitle}>Saving Recording</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${saveProgress}%` }]} />
              </View>
              <Text style={styles.uploadPercent}>{saveProgress}%</Text>
            </View>
          </View>
        )}

        {/* Toast */}
        {toastVisible && (
          <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}
        </View>{/* end cameraViewWrapper */}
      </View>

      {/* Control Panel */}
      <View style={[styles.panel, { width: panelWidth }]}>
        <View>
          <Text style={styles.boothName} numberOfLines={1}>{device?.name || 'Booth'}</Text>
          <Text style={styles.boothSub}>Expo Recording</Text>
          <View style={styles.uploadModeBadge}>
            <Ionicons name={autoUpload ? 'cloud' : 'save'} size={10} color={autoUpload ? '#10B981' : '#F59E0B'} />
            <Text style={[styles.uploadModeText, { color: autoUpload ? '#10B981' : '#F59E0B' }]}>
              {autoUpload ? 'Auto Upload' : 'Local Save'}
            </Text>
          </View>
        </View>

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

        <View style={styles.recSection}>
          <TouchableOpacity
            style={[styles.recBtn, isRecording && styles.recBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isSaving}
          >
            <View style={[styles.recBtnInner, isRecording && styles.recBtnInnerActive]}>
              {isSaving ? (
                <Ionicons name="save" size={20} color="#fff" />
              ) : isRecording ? (
                <View style={styles.stopIcon} />
              ) : (
                <View style={styles.recordIcon} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.recLabel}>
            {isSaving ? 'SAVING' : isRecording ? 'STOP' : 'RECORD'}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actBtn} onPress={() => router.push('/gallery')}>
            <Ionicons name="folder" size={18} color="#fff" />
            <Text style={styles.actLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings" size={18} color="#E54B2A" />
            <Text style={[styles.actLabel, { color: '#E54B2A' }]}>Settings</Text>
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
  cameraArea: { flex: 1, flexDirection: 'column' },
  cameraViewWrapper: { flex: 1, position: 'relative' },

  // Preview header — above the video when recording
  previewHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderBottomWidth: 1, borderBottomColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 6 },
  previewHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewLogo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewLogoText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  previewLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' },
  previewDivider: { width: 1, height: 20, backgroundColor: '#2a2a2a' },
  previewTCBlock: { alignItems: 'flex-start', gap: 1 },
  previewMetaLabel: { color: '#555', fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
  previewTCVal: { color: '#EF4444', fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  previewFPSVal: { color: '#E54B2A', fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  
  topBar: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  deviceSection: { gap: 4 },
  idBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 4 },
  idText: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  brandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(229,75,42,0.4)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, gap: 3 },
  brandText: { color: '#E54B2A', fontSize: 9, fontWeight: '800' },
  recBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, gap: 5 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  recText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  videoIndicator: { color: '#fff', fontSize: 8, fontWeight: '600', backgroundColor: '#E54B2A', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginLeft: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 4 },
  online: { backgroundColor: 'rgba(16,185,129,0.3)' },
  offline: { backgroundColor: 'rgba(239,68,68,0.3)' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  onlineDot: { backgroundColor: '#10B981' },
  offlineDot: { backgroundColor: '#EF4444' },
  statusText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  
  tcBox: { position: 'absolute', top: 55, left: 10, backgroundColor: 'rgba(0,0,0,0.9)', padding: 8, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#E54B2A' },
  tcLabel: { color: '#666', fontSize: 8, fontWeight: '600', marginTop: 2 },
  tcVal: { color: '#fff', fontSize: 12, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tcDiv: { height: 1, backgroundColor: '#333', marginVertical: 4 },
  
  watermark: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(229,75,42,0.95)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, gap: 6 },
  wmIcon: { width: 20, height: 20, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  wmText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  wmLive: { color: '#fff', fontSize: 8, fontWeight: '700', backgroundColor: '#EF4444', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginLeft: 2 },
  
  visitorBox: { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.9)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitorNum: { color: '#fff', fontSize: 22, fontWeight: '800' },
  visitorLabel: { color: '#666', fontSize: 10 },
  
  durationBox: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#EF4444' },
  durationText: { color: '#EF4444', fontSize: 18, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  uploadBox: { backgroundColor: '#0a0a0a', padding: 30, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a' },
  uploadTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 20 },
  progressBar: { width: 200, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#E54B2A', borderRadius: 3 },
  uploadPercent: { color: '#E54B2A', fontSize: 14, fontWeight: '700', marginTop: 8 },
  
  toast: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.95)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#10B981' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  
  panel: { backgroundColor: '#0a0a0a', borderLeftWidth: 1, borderLeftColor: '#1a1a1a', padding: 12, justifyContent: 'space-between' },
  boothName: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  boothSub: { color: '#666', fontSize: 9, textAlign: 'center', marginTop: 2 },
  uploadModeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 },
  uploadModeText: { fontSize: 9, fontWeight: '600' },
  
  section: { marginTop: 16 },
  secLabel: { color: '#555', fontSize: 8, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', gap: 4 },
  input: { flex: 1, backgroundColor: '#111', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, color: '#fff', fontSize: 11, borderWidth: 1, borderColor: '#222' },
  addBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#E54B2A', justifyContent: 'center', alignItems: 'center' },
  scanCount: { color: '#E54B2A', fontSize: 9, marginTop: 4, textAlign: 'center' },
  
  recSection: { alignItems: 'center' },
  recBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(229,75,42,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#E54B2A' },
  recBtnActive: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#EF4444' },
  recBtnInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E54B2A', justifyContent: 'center', alignItems: 'center' },
  recBtnInnerActive: { backgroundColor: '#EF4444', borderRadius: 8, width: 32, height: 32 },
  recordIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  stopIcon: { width: 14, height: 14, borderRadius: 2, backgroundColor: '#fff' },
  recLabel: { color: '#888', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 6, letterSpacing: 0.5 },
  
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  actBtn: { alignItems: 'center', padding: 6 },
  actLabel: { color: '#888', fontSize: 8, marginTop: 3 },
});
