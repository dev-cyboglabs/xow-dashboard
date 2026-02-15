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
  summary?: string;
  barcode_scans: any[];
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
    } catch {}
    finally { setIsLoading(false); setRefreshing(false); }
  };

  const handleDelete = (item: Recording) => {
    Alert.alert(
      'Delete Recording',
      `Are you sure you want to delete this recording from ${fmtDate(item.start_time)}?\n\nThis action cannot be undone.`,
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

  const fmtDur = (s?: number) => {
    if (!s) return '--:--';
    return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const statusColor = (s: string) => ({ recording: '#EF4444', completed: '#F59E0B', uploaded: '#10B981', processed: '#8B5CF6', error: '#EF4444' }[s] || '#666');

  const sidebarWidth = Math.min(80, width * 0.1);

  const renderItem = ({ item }: { item: Recording }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.cardDate}>{fmtDate(item.start_time)}</Text>
        <View style={styles.cardActions}>
          <View style={[styles.dot, { backgroundColor: statusColor(item.status) }]} />
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
      <View style={styles.statsRow}>
        <View style={styles.stat}><Ionicons name="time" size={12} color="#666" /><Text style={styles.statText}>{fmtDur(item.duration)}</Text></View>
        <View style={styles.stat}><Ionicons name="people" size={12} color="#666" /><Text style={styles.statText}>{item.barcode_scans?.length || 0}</Text></View>
        <Ionicons name={item.has_audio ? 'mic' : 'mic-off'} size={12} color={item.has_audio ? '#10B981' : '#444'} />
        <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
      </View>
      {item.summary && <Text style={styles.summary} numberOfLines={1}>{item.summary}</Text>}
    </View>
  );

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={[styles.sidebar, { width: sidebarWidth }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={styles.sideInfo}>
          <Ionicons name="folder" size={20} color="#8B5CF6" />
          <Text style={styles.count}>{recordings.length}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); fetchRecordings(); }}>
          <Ionicons name="refresh" size={16} color="#8B5CF6" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color="#8B5CF6" /></View>
        ) : recordings.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="videocam-off" size={32} color="#333" />
            <Text style={styles.emptyText}>No recordings</Text>
          </View>
        ) : (
          <FlatList
            data={recordings}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRecordings(); }} tintColor="#8B5CF6" />}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#000' },
  sidebar: { backgroundColor: '#0a0a0a', borderRightWidth: 1, borderRightColor: '#1a1a1a', padding: 8, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  sideInfo: { alignItems: 'center' },
  count: { color: '#8B5CF6', fontSize: 24, fontWeight: '800', marginTop: 4 },
  refreshBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: 'rgba(139,92,246,0.1)', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#444', fontSize: 11, marginTop: 6 },
  list: { padding: 8 },
  card: { backgroundColor: '#0a0a0a', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#1a1a1a' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardDate: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  deleteBtn: { padding: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { color: '#888', fontSize: 10 },
  statusText: { fontSize: 8, fontWeight: '600', textTransform: 'uppercase' },
  summary: { color: '#666', fontSize: 9, marginTop: 6 },
});
