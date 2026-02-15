import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Recording {
  id: string;
  device_id: string;
  booth_name: string;
  start_time: string;
  duration?: number;
  status: string;
  has_audio: boolean;
  transcript?: string;
  summary?: string;
  barcode_scans: any[];
}

export default function GalleryScreen() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    loadDevice();
  }, []);

  useEffect(() => {
    if (deviceId) fetchRecordings();
  }, [deviceId]);

  const loadDevice = async () => {
    const savedDevice = await AsyncStorage.getItem('xow_device');
    if (savedDevice) {
      setDeviceId(JSON.parse(savedDevice).device_id);
    }
  };

  const fetchRecordings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/recordings`, {
        params: { device_id: deviceId },
      });
      setRecordings(response.data);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const formatDuration = (s?: number) => {
    if (!s) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const getStatusColor = (s: string) => {
    const colors: any = {
      recording: '#EF4444',
      completed: '#F59E0B',
      uploaded: '#10B981',
      processed: '#8B5CF6'
    };
    return colors[s] || '#666';
  };

  const renderItem = ({ item }: { item: Recording }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{formatDate(item.start_time)}</Text>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
      </View>
      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Ionicons name="time" size={14} color="#666" />
          <Text style={styles.statText}>{formatDuration(item.duration)}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="people" size={14} color="#666" />
          <Text style={styles.statText}>{item.barcode_scans?.length || 0}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name={item.has_audio ? 'mic' : 'mic-off'} size={14} color={item.has_audio ? '#10B981' : '#444'} />
        </View>
      </View>
      {item.summary && (
        <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.sidebarInfo}>
          <Ionicons name="folder" size={24} color="#8B5CF6" />
          <Text style={styles.sidebarTitle}>Gallery</Text>
          <Text style={styles.countNum}>{recordings.length}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); fetchRecordings(); }}>
          <Ionicons name="refresh" size={18} color="#8B5CF6" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#8B5CF6" />
          </View>
        ) : recordings.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="videocam-off" size={36} color="#333" />
            <Text style={styles.emptyText}>No recordings yet</Text>
          </View>
        ) : (
          <FlatList
            data={recordings}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRecordings(); }} tintColor="#8B5CF6" />
            }
          />
        )}
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
  sidebar: {
    width: 100,
    backgroundColor: '#0A0A0A',
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarInfo: {
    alignItems: 'center',
  },
  sidebarTitle: {
    color: '#fff',
    fontSize: 11,
    marginTop: 8,
  },
  countNum: {
    color: '#8B5CF6',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#444',
    fontSize: 12,
    marginTop: 8,
  },
  list: {
    padding: 12,
  },
  card: {
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardDate: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardStats: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: '#888',
    fontSize: 11,
  },
  summary: {
    color: '#666',
    fontSize: 10,
    marginTop: 8,
    lineHeight: 14,
  },
});
