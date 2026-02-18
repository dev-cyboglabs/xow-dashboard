import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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

interface CloudRecording {
  id: string;
  start_time: string;
  duration?: number;
  status: string;
  has_audio: boolean;
  has_video: boolean;
  summary?: string;
  overall_summary?: string;
  barcode_scans: any[];
  total_speakers?: number;
  host_identified?: boolean;
}

type CombinedRecording = (LocalRecording & { source: 'local' }) | (CloudRecording & { source: 'cloud' });

export default function GalleryScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [recordings, setRecordings] = useState<CombinedRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'local' | 'cloud'>('all');
  
  // Preview modal state
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const videoRef = useRef<Video>(null);

  useEffect(() => { loadDevice(); }, []);
  useEffect(() => { if (deviceId) fetchRecordings(); }, [deviceId]);

  const loadDevice = async () => {
    const saved = await AsyncStorage.getItem('xow_device');
    if (saved) setDeviceId(JSON.parse(saved).device_id);
  };

  const fetchRecordings = async () => {
    try {
      // Get local recordings
      const localRecordings = await getLocalRecordings();
      
      // Get cloud recordings
      let cloudRecordings: CloudRecording[] = [];
      try {
        const res = await axios.get(`${API_URL}/api/recordings`, { params: { device_id: deviceId }, timeout: 10000 });
        cloudRecordings = res.data;
      } catch (e) {
        console.log('Could not fetch cloud recordings:', e);
      }

      // Combine recordings
      const combined: CombinedRecording[] = [];
      
      // Add local recordings (not uploaded)
      for (const local of localRecordings) {
        if (!local.isUploaded) {
          combined.push({ ...local, source: 'local' as const });
        }
      }
      
      // Add cloud recordings
      for (const cloud of cloudRecordings) {
        combined.push({ ...cloud, source: 'cloud' as const });
      }

      // Sort by date (newest first)
      combined.sort((a, b) => {
        const dateA = a.source === 'local' ? new Date(a.createdAt).getTime() : new Date(a.start_time).getTime();
        const dateB = b.source === 'local' ? new Date(b.createdAt).getTime() : new Date(b.start_time).getTime();
        return dateB - dateA;
      });

      setRecordings(combined);
    } catch (e) {
      console.error('Fetch recordings error:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
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

  const openPreview = async (recording: CombinedRecording) => {
    if (recording.source === 'local') {
      const localRec = recording as LocalRecording;
      if (localRec.videoPath) {
        // Check if file exists
        const fileInfo = await FileSystem.getInfoAsync(localRec.videoPath);
        if (fileInfo.exists) {
          setPreviewUri(localRec.videoPath);
          setPreviewTitle(fmtDate(localRec.createdAt));
          setPreviewVisible(true);
        } else {
          Alert.alert('File Not Found', 'The video file could not be found.');
        }
      } else {
        Alert.alert('No Video', 'This recording does not have a video.');
      }
    } else {
      // For cloud recordings, open in dashboard or show message
      Alert.alert('Cloud Recording', 'View this recording on the web dashboard.');
    }
  };

  const closePreview = () => {
    setPreviewVisible(false);
    setPreviewUri(null);
    if (videoRef.current) {
      videoRef.current.stopAsync();
    }
  };

  const uploadToCloud = async (recording: LocalRecording) => {
    if (!deviceId) return;
    
    setUploadingId(recording.localId);
    
    try {
      // Create recording entry in backend
      const res = await axios.post(`${API_URL}/api/recordings`, {
        device_id: deviceId,
        expo_name: 'Expo 2025',
        booth_name: recording.boothName,
      });
      
      const recordingId = res.data.id;

      // Upload video if available
      if (recording.videoPath) {
        const fileInfo = await FileSystem.getInfoAsync(recording.videoPath);
        if (fileInfo.exists) {
          const isMovFile = recording.videoPath.toLowerCase().endsWith('.mov');
          
          console.log('Uploading video from:', recording.videoPath);
          const uploadResult = await FileSystem.uploadAsync(
            `${API_URL}/api/recordings/${recordingId}/upload-video`,
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
          console.log('Video upload status:', uploadResult.status);
          
          if (uploadResult.status < 200 || uploadResult.status >= 300) {
            throw new Error(`Video upload failed with status ${uploadResult.status}`);
          }
        }
      }

      // Upload audio if available
      if (recording.audioPath) {
        const fileInfo = await FileSystem.getInfoAsync(recording.audioPath);
        if (fileInfo.exists) {
          console.log('Uploading audio from:', recording.audioPath);
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
          
          if (uploadResult.status < 200 || uploadResult.status >= 300) {
            throw new Error(`Audio upload failed with status ${uploadResult.status}`);
          }
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

      // Update local recording as uploaded
      const localRecordings = await getLocalRecordings();
      const idx = localRecordings.findIndex(r => r.localId === recording.localId);
      if (idx !== -1) {
        localRecordings[idx].id = recordingId;
        localRecordings[idx].isUploaded = true;
        await AsyncStorage.setItem('xow_local_recordings', JSON.stringify(localRecordings));
      }

      Alert.alert('Upload Complete', 'Recording uploaded to cloud successfully!');
      fetchRecordings();
    } catch (e: any) {
      console.error('Upload error:', e);
      Alert.alert('Upload Failed', e?.message || 'Failed to upload recording to cloud');
    } finally {
      setUploadingId(null);
    }
  };

  const handleDelete = (item: CombinedRecording) => {
    const isLocal = item.source === 'local';
    const itemId = isLocal ? (item as LocalRecording).localId : item.id;
    const dateStr = isLocal ? fmtDate((item as LocalRecording).createdAt) : fmtDate((item as CloudRecording).start_time);
    
    Alert.alert(
      'Delete Recording',
      `Delete ${isLocal ? 'local' : 'cloud'} recording from ${dateStr}?\n\n${isLocal ? 'This will remove the local files.' : 'This will remove all data including AI analysis.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(itemId);
            try {
              if (isLocal) {
                // Delete local files
                const localRec = item as LocalRecording;
                if (localRec.videoPath) {
                  try {
                    await FileSystem.deleteAsync(localRec.videoPath, { idempotent: true });
                  } catch {}
                }
                if (localRec.audioPath) {
                  try {
                    await FileSystem.deleteAsync(localRec.audioPath, { idempotent: true });
                  } catch {}
                }
                
                // Remove from local storage
                const localRecordings = await getLocalRecordings();
                const filtered = localRecordings.filter(r => r.localId !== localRec.localId);
                await AsyncStorage.setItem('xow_local_recordings', JSON.stringify(filtered));
              } else {
                // Delete from cloud
                await axios.delete(`${API_URL}/api/recordings/${item.id}`);
              }
              
              setRecordings(prev => prev.filter(r => 
                r.source === 'local' 
                  ? (r as LocalRecording).localId !== itemId 
                  : r.id !== itemId
              ));
            } catch (e) {
              Alert.alert('Error', 'Failed to delete recording');
            } finally {
              setDeletingId(null);
            }
          }
        }
      ]
    );
  };

  const handleReprocess = async (item: CloudRecording) => {
    try {
      await axios.post(`${API_URL}/api/recordings/${item.id}/reprocess`);
      Alert.alert('Reprocessing', 'AI analysis has started. Refresh to see results.');
      fetchRecordings();
    } catch (e) {
      Alert.alert('Error', 'Failed to start reprocessing');
    }
  };

  const fmtDur = (s?: number) => {
    if (!s) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
    local: { color: '#F59E0B', icon: 'save', label: 'Local' },
    recording: { color: '#EF4444', icon: 'radio-button-on', label: 'Recording' },
    completed: { color: '#F59E0B', icon: 'checkmark-circle', label: 'Completed' },
    uploaded: { color: '#3B82F6', icon: 'cloud-done', label: 'Uploaded' },
    processing: { color: '#8B5CF6', icon: 'hourglass', label: 'Processing' },
    processed: { color: '#10B981', icon: 'sparkles', label: 'AI Ready' },
    error: { color: '#EF4444', icon: 'alert-circle', label: 'Error' },
  };

  const getStatusConfig = (item: CombinedRecording) => {
    if (item.source === 'local') return statusConfig.local;
    return statusConfig[(item as CloudRecording).status] || { color: '#666', icon: 'help-circle', label: 'Unknown' };
  };

  const filterRecordings = (items: CombinedRecording[]) => {
    if (viewMode === 'all') return items;
    if (viewMode === 'local') return items.filter(r => r.source === 'local');
    return items.filter(r => r.source === 'cloud');
  };

  const sidebarWidth = Math.min(90, width * 0.12);

  const renderItem = ({ item }: { item: CombinedRecording }) => {
    const config = getStatusConfig(item);
    const isLocal = item.source === 'local';
    const localItem = item as LocalRecording;
    const cloudItem = item as CloudRecording;
    const itemId = isLocal ? localItem.localId : item.id;
    const dateStr = isLocal ? localItem.createdAt : cloudItem.start_time;
    const duration = isLocal ? localItem.duration : cloudItem.duration;
    const hasVideo = isLocal ? !!localItem.videoPath : cloudItem.has_video;
    const hasAudio = isLocal ? !!localItem.audioPath : cloudItem.has_audio;
    const barcodeCount = isLocal ? (localItem.barcodeScansList?.length || 0) : (cloudItem.barcode_scans?.length || 0);
    const summaryText = !isLocal ? (cloudItem.overall_summary || cloudItem.summary) : null;

    return (
      <View style={styles.card}>
        {/* Header Row */}
        <View style={styles.cardHeader}>
          <View style={styles.dateSection}>
            <Text style={styles.cardDate}>{dateStr ? fmtDate(dateStr) : 'Unknown date'}</Text>
            <Text style={styles.cardDuration}>{fmtDur(duration)}</Text>
          </View>
          <View style={styles.cardActions}>
            {/* Preview Button (local only with video) */}
            {isLocal && hasVideo && (
              <TouchableOpacity
                style={styles.previewBtn}
                onPress={() => openPreview(item)}
              >
                <Ionicons name="play-circle" size={16} color="#8B5CF6" />
                <Text style={styles.previewBtnText}>Preview</Text>
              </TouchableOpacity>
            )}
            {!isLocal && cloudItem.status === 'error' && (
              <TouchableOpacity style={styles.reprocessBtn} onPress={() => handleReprocess(cloudItem)}>
                <Ionicons name="refresh" size={12} color="#F59E0B" />
              </TouchableOpacity>
            )}
            {isLocal && (
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => uploadToCloud(localItem)}
                disabled={uploadingId === localItem.localId}
              >
                {uploadingId === localItem.localId ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={14} color="#10B981" />
                    <Text style={styles.uploadBtnText}>Upload</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(item)}
              disabled={deletingId === itemId}
            >
              {deletingId === itemId ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Ionicons name="trash" size={14} color="#EF4444" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Media & Status Row */}
        <View style={styles.mediaRow}>
          <View style={styles.mediaIcons}>
            <View style={[styles.mediaBadge, hasVideo && styles.mediaBadgeActive]}>
              <Ionicons name="videocam" size={10} color={hasVideo ? '#10B981' : '#444'} />
            </View>
            <View style={[styles.mediaBadge, hasAudio && styles.mediaBadgeActive]}>
              <Ionicons name="mic" size={10} color={hasAudio ? '#10B981' : '#444'} />
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={10} color={config.color} />
            <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="people" size={12} color="#8B5CF6" />
            <Text style={styles.statText}>{String(barcodeCount || 0)} visitors</Text>
          </View>
          {!isLocal && cloudItem.total_speakers != null && cloudItem.total_speakers > 0 && (
            <View style={styles.stat}>
              <Ionicons name="chatbubbles" size={12} color="#10B981" />
              <Text style={styles.statText}>{String(cloudItem.total_speakers)} speakers</Text>
            </View>
          )}
          {!isLocal && cloudItem.host_identified === true && (
            <View style={styles.hostBadge}>
              <Text style={styles.hostText}>HOST ID</Text>
            </View>
          )}
          {isLocal && (
            <View style={styles.localBadge}>
              <Text style={styles.localBadgeText}>NOT UPLOADED</Text>
            </View>
          )}
        </View>

        {/* Summary (cloud only) */}
        {summaryText != null && summaryText !== '' && (
          <View style={styles.summarySection}>
            <Ionicons name="sparkles" size={10} color="#8B5CF6" />
            <Text style={styles.summary} numberOfLines={2}>{summaryText}</Text>
          </View>
        )}
      </View>
    );
  };

  const filteredRecordings = filterRecordings(recordings);
  const localCount = recordings.filter(r => r.source === 'local').length;
  const cloudCount = recordings.filter(r => r.source === 'cloud').length;
  const totalDuration = recordings.reduce((acc, r) => {
    const dur = r.source === 'local' ? (r as LocalRecording).duration : ((r as CloudRecording).duration || 0);
    return acc + dur;
  }, 0);

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Sidebar */}
      <View style={[styles.sidebar, { width: sidebarWidth }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.sideStats}>
          <View style={styles.sideStat}>
            <Text style={styles.sideStatNum}>{recordings.length}</Text>
            <Text style={styles.sideStatLabel}>Total</Text>
          </View>
          <View style={styles.sideStat}>
            <Text style={[styles.sideStatNum, { color: '#F59E0B' }]}>{localCount}</Text>
            <Text style={styles.sideStatLabel}>Local</Text>
          </View>
          <View style={styles.sideStat}>
            <Text style={[styles.sideStatNum, { color: '#10B981' }]}>{cloudCount}</Text>
            <Text style={styles.sideStatLabel}>Cloud</Text>
          </View>
          <View style={styles.sideStat}>
            <Text style={[styles.sideStatNum, { color: '#8B5CF6', fontSize: 14 }]}>{fmtDur(totalDuration)}</Text>
            <Text style={styles.sideStatLabel}>Duration</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); fetchRecordings(); }}>
          <Ionicons name="refresh" size={18} color="#8B5CF6" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Recordings</Text>
          <Text style={styles.headerSub}>View, preview and upload your recordings</Text>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, viewMode === 'all' && styles.filterTabActive]}
            onPress={() => setViewMode('all')}
          >
            <Text style={[styles.filterTabText, viewMode === 'all' && styles.filterTabTextActive]}>All ({recordings.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, viewMode === 'local' && styles.filterTabActive]}
            onPress={() => setViewMode('local')}
          >
            <Ionicons name="save" size={12} color={viewMode === 'local' ? '#8B5CF6' : '#666'} />
            <Text style={[styles.filterTabText, viewMode === 'local' && styles.filterTabTextActive]}>Local ({localCount})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, viewMode === 'cloud' && styles.filterTabActive]}
            onPress={() => setViewMode('cloud')}
          >
            <Ionicons name="cloud" size={12} color={viewMode === 'cloud' ? '#8B5CF6' : '#666'} />
            <Text style={[styles.filterTabText, viewMode === 'cloud' && styles.filterTabTextActive]}>Cloud ({cloudCount})</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#8B5CF6" size="large" />
            <Text style={styles.loadingText}>Loading recordings...</Text>
          </View>
        ) : filteredRecordings.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="videocam-off" size={40} color="#333" />
            </View>
            <Text style={styles.emptyTitle}>
              {viewMode === 'local' ? 'No Local Recordings' : viewMode === 'cloud' ? 'No Cloud Recordings' : 'No Recordings Yet'}
            </Text>
            <Text style={styles.emptyText}>
              {viewMode === 'local' 
                ? 'Local recordings will appear here after recording'
                : viewMode === 'cloud'
                  ? 'Upload local recordings to see them in the cloud'
                  : 'Start recording to capture booth conversations'}
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.back()}>
              <Ionicons name="videocam" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Start Recording</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredRecordings}
            renderItem={renderItem}
            keyExtractor={item => item.source === 'local' ? (item as LocalRecording).localId : item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchRecordings(); }}
                tintColor="#8B5CF6"
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Video Preview Modal */}
      <Modal
        visible={previewVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closePreview}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{previewTitle}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={closePreview}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {previewUri && (
              <Video
                ref={videoRef}
                source={{ uri: previewUri }}
                style={styles.videoPlayer}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping={false}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#000' },

  // Sidebar
  sidebar: { backgroundColor: '#0a0a0a', borderRightWidth: 1, borderRightColor: '#1a1a1a', padding: 10, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  sideStats: { alignItems: 'center', gap: 14 },
  sideStat: { alignItems: 'center' },
  sideStatNum: { color: '#8B5CF6', fontSize: 18, fontWeight: '800' },
  sideStatLabel: { color: '#555', fontSize: 8, marginTop: 2 },
  refreshBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },

  // Content
  content: { flex: 1 },
  header: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#555', fontSize: 10, marginTop: 2 },

  // Filter Tabs
  filterTabs: { flexDirection: 'row', padding: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#111' },
  filterTabActive: { backgroundColor: 'rgba(139,92,246,0.2)', borderWidth: 1, borderColor: '#8B5CF6' },
  filterTabText: { color: '#666', fontSize: 11, fontWeight: '500' },
  filterTabTextActive: { color: '#8B5CF6' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#555', fontSize: 12, marginTop: 12 },

  // Empty State
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: '#555', fontSize: 12, marginTop: 4, textAlign: 'center', maxWidth: 250 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#8B5CF6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, marginTop: 20 },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // List
  list: { padding: 10 },

  // Card
  card: { backgroundColor: '#0a0a0a', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  dateSection: { flex: 1 },
  cardDate: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardDuration: { color: '#666', fontSize: 10, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 4 },
  previewBtnText: { color: '#8B5CF6', fontSize: 10, fontWeight: '600' },
  reprocessBtn: { padding: 6, backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 4 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 4 },
  uploadBtnText: { color: '#10B981', fontSize: 10, fontWeight: '600' },
  deleteBtn: { padding: 6 },

  // Media Row
  mediaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mediaIcons: { flexDirection: 'row', gap: 6 },
  mediaBadge: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  mediaBadgeActive: { backgroundColor: 'rgba(16,185,129,0.15)' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { fontSize: 9, fontWeight: '600' },

  // Stats Row
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { color: '#888', fontSize: 10 },
  hostBadge: { backgroundColor: 'rgba(16,185,129,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  hostText: { color: '#10B981', fontSize: 8, fontWeight: '700' },
  localBadge: { backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  localBadgeText: { color: '#F59E0B', fontSize: 8, fontWeight: '700' },

  // Summary
  summarySection: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  summary: { flex: 1, color: '#888', fontSize: 10, lineHeight: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxWidth: 600, backgroundColor: '#0a0a0a', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1a1a1a' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  closeBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  videoPlayer: { width: '100%', aspectRatio: 16/9, backgroundColor: '#000' },
});
