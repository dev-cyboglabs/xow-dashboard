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
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
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

  // Add video overlay using FFmpeg (burns watermarks into the video file)
  const addVideoOverlay = async (
    inputPath: string,
    boothName: string,
    duration: number,
    timestamp: string
  ): Promise<string | null> => {
    try {
      // Remove file:// prefix for FFmpeg
      const inputFile = inputPath.replace('file://', '');
      const outputFile = inputFile.replace('.mp4', '_overlay.mp4').replace('.mov', '_overlay.mp4');
      
      // Escape special characters in booth name for FFmpeg
      const safeBoothName = boothName.replace(/'/g, "\\'").replace(/:/g, "\\:");
      const safeTimestamp = timestamp.replace(/'/g, "\\'").replace(/:/g, "\\:");
      
      // Build FFmpeg filter for overlays:
      // Top-left: Booth name + timestamp
      // Top-right: Frame counter  
      // Bottom-right: XoW watermark
      // Bottom-left: Running timecode
      const filterComplex = [
        // Top-left: Booth name
        `drawtext=text='${safeBoothName}':fontsize=24:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.7:boxborderw=8`,
        // Top-left below: Timestamp
        `drawtext=text='${safeTimestamp}':fontsize=16:fontcolor=white:x=20:y=55:box=1:boxcolor=black@0.7:boxborderw=5`,
        // Top-right: Frame counter
        `drawtext=text='FRAME\\: %{frame_num}':start_number=1:fontsize=14:fontcolor=cyan:x=w-tw-20:y=20:box=1:boxcolor=black@0.7:boxborderw=5`,
        // Bottom-right: XoW watermark (purple background)
        `drawtext=text='XoW':fontsize=32:fontcolor=white:x=w-tw-20:y=h-th-20:box=1:boxcolor=0x8B5CF6@0.9:boxborderw=12`,
        // Bottom-left: Running timecode
        `drawtext=text='%{pts\\:hms}':fontsize=20:fontcolor=red:x=20:y=h-th-20:box=1:boxcolor=black@0.85:boxborderw=8`
      ].join(',');
      
      const ffmpegCommand = `-i "${inputFile}" -vf "${filterComplex}" -c:v mpeg4 -q:v 5 -c:a copy -y "${outputFile}"`;
      
      console.log('Running FFmpeg overlay command...');
      
      const session = await FFmpegKit.execute(ffmpegCommand);
      const returnCode = await session.getReturnCode();
      
      if (ReturnCode.isSuccess(returnCode)) {
        console.log('FFmpeg overlay succeeded');
        // Return with file:// prefix
        return 'file://' + outputFile;
      } else {
        const logs = await session.getAllLogsAsString();
        console.log('FFmpeg overlay failed:', logs?.substring(0, 500));
        return null;
      }
    } catch (e: any) {
      console.log('FFmpeg error:', e?.message || e);
      return null;
    }
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
      
      // Generate a local ID for the recording
      const localId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentRecording({ localId });
      
      // Start timers for UI
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
      frameTimerRef.current = setInterval(() => setFrameCount(p => p + 1), 33.33);

      // Start video recording on camera
      if (cameraRef.current && Platform.OS !== 'web') {
        console.log('Starting video recording on', Platform.OS);
        setVideoRecordingActive(true);
        
        try {
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

      // Start audio recording
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
      showToast('Failed to start recording', true);
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

      setSaveProgress(20);

      // Process video with overlay (add watermarks, timecode, etc.)
      let savedVideoPath = videoUri;
      let savedAudioPath = audioUri;
      
      if (videoUri) {
        console.log('Processing video with overlay...');
        setSaveProgress(30);
        
        try {
          const processedVideoPath = await addVideoOverlay(
            videoUri,
            device?.name || 'XoW Booth',
            recordingTime,
            new Date().toLocaleString()
          );
          
          if (processedVideoPath) {
            savedVideoPath = processedVideoPath;
            console.log('Video processed with overlay:', savedVideoPath);
          } else {
            console.log('Overlay processing failed, using original video');
          }
        } catch (e: any) {
          console.log('Video overlay error:', e?.message || e);
          // Continue with original video if processing fails
        }
      }
      
      console.log('Final video path:', savedVideoPath);
      console.log('Audio path:', savedAudioPath);

      setSaveProgress(60);

      // Save recording metadata locally
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

      // Get existing local recordings and add new one
      const existingRecordings = await getLocalRecordings();
      existingRecordings.unshift(localRecording);
      await AsyncStorage.setItem('xow_local_recordings', JSON.stringify(existingRecordings));
      
      setSaveProgress(80);

      // Auto upload if enabled and online
      if (autoUpload && isOnline && (savedVideoPath || savedAudioPath)) {
        showToast('Uploading to cloud...');
        try {
          await uploadRecordingToCloud(localRecording);
          showToast(`Uploaded! ${barcodeCount} visitors${savedVideoPath ? ' • Video + Audio' : ' • Audio only'}`);
        } catch (e: any) {
          console.log('Auto upload failed:', e?.message || e);
          showToast('Saved locally. Upload later from Gallery.', true);
        }
      } else {
        const hasMedia = savedVideoPath || savedAudioPath;
        if (hasMedia) {
          showToast(`Saved locally! ${barcodeCount} visitors${savedVideoPath ? ' • Video + Audio' : ' • Audio only'}`);
        } else {
          showToast('Recording saved (no media captured)', true);
        }
      }

      setSaveProgress(100);

      // Reset state
      setCurrentRecording(null);
      setRecordingTime(0);
      setFrameCount(0);
      setBarcodeCount(0);
      setBarcodeScans([]);
      videoUriRef.current = null;
    } catch (e: any) {
      console.error('Stop recording error:', e?.message || e);
      showToast('Save failed: ' + (e?.message || 'Unknown error'), true);
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
    console.log('Video path:', recording.videoPath);
    console.log('Audio path:', recording.audioPath);
    
    // Create recording entry in backend
    let recordingId: string;
    try {
      const res = await axios.post(`${API_URL}/api/recordings`, {
        device_id: device.device_id,
        expo_name: 'Expo 2025',
        booth_name: recording.boothName,
      });
      recordingId = res.data.id;
      console.log('Created recording in backend:', recordingId);
    } catch (e: any) {
      console.error('Failed to create recording:', e?.message || e);
      throw new Error('Failed to create recording entry');
    }

    // Upload video if available
    if (recording.videoPath) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(recording.videoPath);
        console.log('Video file info:', fileInfo);
        
        if (fileInfo.exists) {
          const isMovFile = recording.videoPath.toLowerCase().endsWith('.mov');
          const uploadUrl = `${API_URL}/api/recordings/${recordingId}/upload-video`;
          
          console.log('Uploading video to:', uploadUrl);
          
          const uploadResult = await FileSystem.uploadAsync(
            uploadUrl,
            recording.videoPath,
            {
              fieldName: 'video',
              httpMethod: 'POST',
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              mimeType: isMovFile ? 'video/quicktime' : 'video/mp4',
              parameters: {
                chunk_index: '0',
                total_chunks: '1',
              },
            }
          );
          console.log('Video upload result:', uploadResult.status, uploadResult.body?.substring(0, 200));
          
          if (uploadResult.status < 200 || uploadResult.status >= 300) {
            console.error('Video upload failed:', uploadResult.body);
            throw new Error(`Video upload failed: ${uploadResult.status}`);
          }
        } else {
          console.log('Video file does not exist:', recording.videoPath);
        }
      } catch (e: any) {
        console.error('Video upload error:', e?.message || e);
        // Don't throw - continue with audio upload
      }
    }

    // Upload audio if available
    if (recording.audioPath) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(recording.audioPath);
        console.log('Audio file info:', fileInfo);
        
        if (fileInfo.exists) {
          const uploadUrl = `${API_URL}/api/recordings/${recordingId}/upload-audio`;
          
          console.log('Uploading audio to:', uploadUrl);
          
          const uploadResult = await FileSystem.uploadAsync(
            uploadUrl,
            recording.audioPath,
            {
              fieldName: 'audio',
              httpMethod: 'POST',
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              mimeType: 'audio/m4a',
            }
          );
          console.log('Audio upload result:', uploadResult.status, uploadResult.body?.substring(0, 200));
          
          if (uploadResult.status < 200 || uploadResult.status >= 300) {
            console.error('Audio upload failed:', uploadResult.body);
            throw new Error(`Audio upload failed: ${uploadResult.status}`);
          }
        } else {
          console.log('Audio file does not exist:', recording.audioPath);
        }
      } catch (e: any) {
        console.error('Audio upload error:', e?.message || e);
        throw new Error('Audio upload failed: ' + (e?.message || 'Unknown error'));
      }
    }

    // Upload barcode scans
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

    // Mark recording complete
    await axios.put(`${API_URL}/api/recordings/${recordingId}/complete`);

    // Update local recording with server ID
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
    
    // Store barcode locally
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

        {/* Watermark - Bottom Right */}
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

        {/* Save Progress */}
        {isSaving && (
          <View style={styles.uploadOverlay}>
            <View style={styles.uploadBox}>
              <Ionicons name="save" size={32} color="#8B5CF6" />
              <Text style={styles.uploadTitle}>Saving Recording</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${saveProgress}%` }]} />
              </View>
              <Text style={styles.uploadPercent}>{saveProgress}%</Text>
              <Text style={styles.uploadHint}>
                {autoUpload ? 'Saving & uploading...' : 'Saving locally...'}
              </Text>
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
          <View style={styles.uploadModeBadge}>
            <Ionicons name={autoUpload ? 'cloud' : 'save'} size={10} color={autoUpload ? '#10B981' : '#F59E0B'} />
            <Text style={[styles.uploadModeText, { color: autoUpload ? '#10B981' : '#F59E0B' }]}>
              {autoUpload ? 'Auto Upload' : 'Local Save'}
            </Text>
          </View>
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
          {isRecording && (
            <Text style={styles.recHint}>Tap to stop & save</Text>
          )}
        </View>

        {/* Bottom Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actBtn} onPress={() => router.push('/gallery')}>
            <Ionicons name="folder" size={18} color="#fff" />
            <Text style={styles.actLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings" size={18} color="#8B5CF6" />
            <Text style={[styles.actLabel, { color: '#8B5CF6' }]}>Settings</Text>
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
  
  // Save Overlay
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  uploadBox: { backgroundColor: '#0a0a0a', padding: 30, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a' },
  uploadTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 20 },
  progressBar: { width: 200, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#8B5CF6', borderRadius: 3 },
  uploadPercent: { color: '#8B5CF6', fontSize: 14, fontWeight: '700', marginTop: 8 },
  uploadHint: { color: '#666', fontSize: 11, marginTop: 8 },
  
  // Toast
  toast: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.95)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#10B981' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  
  // Control Panel
  panel: { backgroundColor: '#0a0a0a', borderLeftWidth: 1, borderLeftColor: '#1a1a1a', padding: 12, justifyContent: 'space-between' },
  boothName: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  boothSub: { color: '#666', fontSize: 9, textAlign: 'center', marginTop: 2 },
  uploadModeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 },
  uploadModeText: { fontSize: 9, fontWeight: '600' },
  
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
  actBtn: { alignItems: 'center', padding: 6 },
  actLabel: { color: '#888', fontSize: 8, marginTop: 3 },
});
