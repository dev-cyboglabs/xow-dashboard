import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Recording {
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

export default function GalleryScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadDevice(); }, []);
  useEffect(() => { if (deviceId) fetchRecordings(); }, [deviceId]);

  const loadDevice = async () => {
    const saved = await AsyncStorage.getItem('xow_device');
    if (saved) setDeviceId(JSON.parse(saved).device_id);
  };

  const fetchRecordings = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/recordings`, { params: { device_id: deviceId } });
      setRecordings(res.data);
    } catch (e) {
      console.error('Fetch recordings error:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleDelete = (item: Recording) => {
    Alert.alert(
      'Delete Recording',
      `Delete recording from ${fmtDate(item.start_time)}?\n\nThis will remove all data including AI analysis.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              await axios.delete(`${API_URL}/api/recordings/${item.id}`);
              setRecordings(prev => prev.filter(r => r.id !== item.id));
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

  const handleReprocess = async (item: Recording) => {
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
    recording: { color: '#EF4444', icon: 'radio-button-on', label: 'Recording' },
    completed: { color: '#F59E0B', icon: 'checkmark-circle', label: 'Completed' },
    uploaded: { color: '#3B82F6', icon: 'cloud-done', label: 'Uploaded' },
    processing: { color: '#8B5CF6', icon: 'hourglass', label: 'Processing' },
    processed: { color: '#10B981', icon: 'sparkles', label: 'AI Ready' },
    error: { color: '#EF4444', icon: 'alert-circle', label: 'Error' },
  };

  const getStatusConfig = (status: string) => statusConfig[status] || { color: '#666', icon: 'help-circle', label: status };

  const sidebarWidth = Math.min(90, width * 0.12);

  const renderItem = ({ item }: { item: Recording }) => {
    const config = getStatusConfig(item.status);
    const summaryText = item.overall_summary || item.summary;

    return (
      <View style={styles.card}>
        {/* Header Row */}
        <View style={styles.cardHeader}>
          <View style={styles.dateSection}>
            <Text style={styles.cardDate}>{fmtDate(item.start_time)}</Text>
            <Text style={styles.cardDuration}>{fmtDur(item.duration)}</Text>
          </View>
          <View style={styles.cardActions}>
            {item.status === 'error' && (
              <TouchableOpacity style={styles.reprocessBtn} onPress={() => handleReprocess(item)}>
                <Ionicons name="refresh" size={12} color="#F59E0B" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(item)}
              disabled={deletingId === item.id}
            >
              {deletingId === item.id ? (
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
            <View style={[styles.mediaBadge, item.has_video && styles.mediaBadgeActive]}>
              <Ionicons name="videocam" size={10} color={item.has_video ? '#10B981' : '#444'} />
            </View>
            <View style={[styles.mediaBadge, item.has_audio && styles.mediaBadgeActive]}>
              <Ionicons name="mic" size={10} color={item.has_audio ? '#10B981' : '#444'} />
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
            <Text style={styles.statText}>{item.barcode_scans?.length || 0} visitors</Text>
          </View>
          {item.total_speakers && item.total_speakers > 0 && (
            <View style={styles.stat}>
              <Ionicons name="chatbubbles" size={12} color="#10B981" />
              <Text style={styles.statText}>{item.total_speakers} speakers</Text>
            </View>
          )}
          {item.host_identified && (
            <View style={styles.hostBadge}>
              <Text style={styles.hostText}>HOST ID</Text>
            </View>
          )}
        </View>

        {/* Summary */}
        {summaryText && (
          <View style={styles.summarySection}>
            <Ionicons name="sparkles" size={10} color="#8B5CF6" />
            <Text style={styles.summary} numberOfLines={2}>{summaryText}</Text>
          </View>
        )}
      </View>
    );
  };

  const processedCount = recordings.filter(r => r.status === 'processed').length;
  const totalDuration = recordings.reduce((acc, r) => acc + (r.duration || 0), 0);

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
            <Text style={[styles.sideStatNum, { color: '#10B981' }]}>{processedCount}</Text>
            <Text style={styles.sideStatLabel}>AI Ready</Text>
          </View>
          <View style={styles.sideStat}>
            <Text style={[styles.sideStatNum, { color: '#F59E0B', fontSize: 14 }]}>{fmtDur(totalDuration)}</Text>
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
          <Text style={styles.headerSub}>View and manage your booth recordings</Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#8B5CF6" size="large" />
            <Text style={styles.loadingText}>Loading recordings...</Text>
          </View>
        ) : recordings.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="videocam-off" size={40} color="#333" />
            </View>
            <Text style={styles.emptyTitle}>No Recordings Yet</Text>
            <Text style={styles.emptyText}>Start recording to capture booth conversations</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.back()}>
              <Ionicons name="videocam" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Start Recording</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={recordings}
            renderItem={renderItem}
            keyExtractor={item => item.id}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#000' },

  // Sidebar
  sidebar: { backgroundColor: '#0a0a0a', borderRightWidth: 1, borderRightColor: '#1a1a1a', padding: 10, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  sideStats: { alignItems: 'center', gap: 16 },
  sideStat: { alignItems: 'center' },
  sideStatNum: { color: '#8B5CF6', fontSize: 20, fontWeight: '800' },
  sideStatLabel: { color: '#555', fontSize: 8, marginTop: 2 },
  refreshBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },

  // Content
  content: { flex: 1 },
  header: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#555', fontSize: 10, marginTop: 2 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#555', fontSize: 12, marginTop: 12 },

  // Empty State
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: '#555', fontSize: 12, marginTop: 4, textAlign: 'center' },
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
  reprocessBtn: { padding: 6, backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 4 },
  deleteBtn: { padding: 6 },

  // Media Row
  mediaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mediaIcons: { flexDirection: 'row', gap: 6 },
  mediaBadge: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  mediaBadgeActive: { backgroundColor: 'rgba(16,185,129,0.15)' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { fontSize: 9, fontWeight: '600' },

  // Stats Row
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { color: '#888', fontSize: 10 },
  hostBadge: { backgroundColor: 'rgba(16,185,129,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  hostText: { color: '#10B981', fontSize: 8, fontWeight: '700' },

  // Summary
  summarySection: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  summary: { flex: 1, color: '#888', fontSize: 10, lineHeight: 14 },
});
