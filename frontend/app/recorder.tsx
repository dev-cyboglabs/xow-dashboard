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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
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
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  
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
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    const connInterval = setInterval(checkConnection, 10000);
    return () => {
      clearInterval(connInterval);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1500),
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
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  };

  const checkConnection = async () => {
    try {
      await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
      setIsOnline(true);
    } catch { setIsOnline(false); }
  };

  const formatTC = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const f = frameCount % 30;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}:${f.toString().padStart(2,'0')}`;
  };

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const startRecording = async () => {
    if (!device) return;
    try {
      const res = await axios.post(`${API_URL}/api/recordings`, {
        device_id: device.device_id, expo_name: 'Expo 2025', booth_name: device.name,
      });
      setCurrentRecording(res.data);
      setIsRecording(true);
      setFrameCount(0);
      setBarcodeCount(0);
      setRecordingTime(0);
      recordingStartTime.current = Date.now();
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
      frameTimerRef.current = setInterval(() => setFrameCount(p => p + 1), 33.33);
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      audioRecording.current = rec;
      showToast('Recording started');
    } catch (e) {
      showToast('Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!currentRecording) return;
    setIsUploading(true);
    try {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      let uri = null;
      if (audioRecording.current) {
        await audioRecording.current.stopAndUnloadAsync();
        uri = audioRecording.current.getURI();
        audioRecording.current = null;
      }
      if (uri) {
        const fd = new FormData();
        fd.append('audio', { uri, type: 'audio/m4a', name: 'rec.m4a' } as any);
        try { await axios.post(`${API_URL}/api/recordings/${currentRecording.id}/upload-audio`, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }); } catch {}
      }
      await axios.put(`${API_URL}/api/recordings/${currentRecording.id}/complete`);
      try { axios.post(`${API_URL}/api/recordings/${currentRecording.id}/transcribe`); } catch {}
      showToast(`Saved! ${barcodeCount} visitors logged`);
      setCurrentRecording(null);
      setRecordingTime(0);
      setFrameCount(0);
      setBarcodeCount(0);
    } catch { showToast('Save failed'); }
    finally { setIsUploading(false); }
  };

  const handleBarcode = async () => {
    if (!barcodeInput.trim() || !currentRecording || !isRecording) return;
    const bc = barcodeInput.trim();
    const ts = (Date.now() - recordingStartTime.current) / 1000;
    try { await axios.post(`${API_URL}/api/barcodes`, { recording_id: currentRecording.id, barcode_data: bc, video_timestamp: ts, frame_code: frameCount }); } catch {}
    setBarcodeCount(p => p + 1);
    setBarcodeInput('');
    showToast(`✓ ${bc}`);
    barcodeInputRef.current?.focus();
  };

  const handleLogout = async () => {
    if (isRecording) { showToast('Stop recording first'); return; }
    await AsyncStorage.removeItem('xow_device');
    router.replace('/');
  };

  if (!cameraPermission?.granted) {
    return (
      <View style={[styles.container, { width, height, justifyContent: 'center', alignItems: 'center' }]}> 
        <Ionicons name="videocam-off" size={40} color="#8B5CF6" />
        <Text style={{ color: '#fff', marginTop: 12, fontSize: 16 }}>Camera Required</Text>
        <TouchableOpacity onPress={requestCameraPermission} style={{ marginTop: 16, backgroundColor: '#8B5CF6', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
          <Text style={{ color: '#fff' }}>Enable</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const panelWidth = Math.min(130, width * 0.14);

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={[styles.cameraArea, { width: width - panelWidth }]}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        
        {/* Top Bar */}
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
            </View>
          )}
          <View style={[styles.statusBadge, isOnline ? styles.online : styles.offline]}>
            <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.statusText}>{isOnline ? 'CLOUD' : 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Timecode */}
        <View style={styles.tcBox}>
          <Text style={styles.tcLabel}>DATE</Text>
          <Text style={styles.tcVal}>{formatDate(currentTime)}</Text>
          <Text style={styles.tcLabel}>TIME</Text>
          <Text style={styles.tcVal}>{formatTime(currentTime)}</Text>
          {isRecording && (
            <>
              <View style={styles.tcDiv} />
              <Text style={styles.tcLabel}>TC</Text>
              <Text style={[styles.tcVal, { color: '#EF4444' }]}>{formatTC(recordingTime)}</Text>
              <Text style={styles.tcLabel}>FRAME</Text>
              <Text style={[styles.tcVal, { color: '#8B5CF6', fontSize: 9 }]}>{frameCount.toString().padStart(6, '0')}</Text>
            </>
          )}
        </View>

        {/* Watermark */}
        <View style={styles.watermark}>
          <View style={styles.wmIcon}>
            <Ionicons name="videocam" size={10} color="#fff" />
          </View>
          <Text style={styles.wmText}>XoW</Text>
        </View>

        {/* Visitor Count */}
        {isRecording && (
          <View style={styles.visitorBox}>
            <Ionicons name="people" size={14} color="#8B5CF6" />
            <Text style={styles.visitorNum}>{barcodeCount}</Text>
            <Text style={styles.visitorLabel}>visitors</Text>
          </View>
        )}

        {/* Toast */}
        {toastVisible && (
          <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}
      </View>

      {/* Control Panel */}
      <View style={[styles.panel, { width: panelWidth }]}>
        <Text style={styles.boothName} numberOfLines={1}>{device?.name || 'Booth'}</Text>
        
        <View style={styles.section}>
          <Text style={styles.secLabel}>VISITOR SCAN</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={barcodeInputRef}
              style={styles.input}
              placeholder="Badge"
              placeholderTextColor="#444"
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              onSubmitEditing={handleBarcode}
              autoCapitalize="characters"
              editable={isRecording}
            />
            <TouchableOpacity style={[styles.addBtn, !isRecording && { backgroundColor: '#333' }]} onPress={handleBarcode} disabled={!isRecording}>
              <Ionicons name="add" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={[styles.recBtn, isRecording && styles.recBtnActive]} onPress={isRecording ? stopRecording : startRecording} disabled={isUploading}>
          <View style={[styles.recBtnInner, isRecording && styles.recBtnInnerActive]}>
            {isUploading ? <Ionicons name="cloud-upload" size={18} color="#fff" /> : isRecording ? <View style={styles.stopIcon} /> : <View style={styles.recordIcon} />}
          </View>
        </TouchableOpacity>
        <Text style={styles.recLabel}>{isUploading ? 'UPLOADING' : isRecording ? 'STOP' : 'RECORD'}</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actBtn} onPress={() => router.push('/gallery')}>
            <Ionicons name="folder" size={16} color="#fff" />
            <Text style={styles.actLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={handleLogout}>
            <Ionicons name="power" size={16} color="#EF4444" />
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
  topBar: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  deviceSection: { gap: 4 },
  idBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, gap: 3 },
  idText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  brandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.3)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, gap: 3 },
  brandText: { color: '#8B5CF6', fontSize: 8, fontWeight: '800' },
  recBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 4 },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  recText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, gap: 3 },
  online: { backgroundColor: 'rgba(16,185,129,0.3)' },
  offline: { backgroundColor: 'rgba(239,68,68,0.3)' },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  onlineDot: { backgroundColor: '#10B981' },
  offlineDot: { backgroundColor: '#EF4444' },
  statusText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  tcBox: { position: 'absolute', top: 50, left: 8, backgroundColor: 'rgba(0,0,0,0.85)', padding: 6, borderRadius: 4, borderLeftWidth: 2, borderLeftColor: '#8B5CF6' },
  tcLabel: { color: '#666', fontSize: 7, fontWeight: '600' },
  tcVal: { color: '#fff', fontSize: 10, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 1 },
  tcDiv: { height: 1, backgroundColor: '#333', marginVertical: 3 },
  watermark: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 4 },
  wmIcon: { width: 16, height: 16, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  wmText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  visitorBox: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  visitorNum: { color: '#fff', fontSize: 18, fontWeight: '800' },
  visitorLabel: { color: '#666', fontSize: 8 },
  toast: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.9)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#10B981' },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  panel: { backgroundColor: '#0a0a0a', borderLeftWidth: 1, borderLeftColor: '#1a1a1a', padding: 10, justifyContent: 'space-between' },
  boothName: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center', marginBottom: 8, backgroundColor: '#111', paddingVertical: 4, borderRadius: 4 },
  section: { marginBottom: 10 },
  secLabel: { color: '#555', fontSize: 7, fontWeight: '700', marginBottom: 4 },
  inputRow: { flexDirection: 'row', gap: 3 },
  input: { flex: 1, backgroundColor: '#111', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 6, color: '#fff', fontSize: 10, borderWidth: 1, borderColor: '#222' },
  addBtn: { width: 26, height: 26, borderRadius: 4, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
  recBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(139,92,246,0.2)', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', borderWidth: 2, borderColor: '#8B5CF6' },
  recBtnActive: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#EF4444' },
  recBtnInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
  recBtnInnerActive: { backgroundColor: '#EF4444', borderRadius: 6, width: 28, height: 28 },
  recordIcon: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  stopIcon: { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
  recLabel: { color: '#888', fontSize: 8, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  actBtn: { alignItems: 'center', padding: 6 },
  actLabel: { color: '#888', fontSize: 8, marginTop: 2 },
});
