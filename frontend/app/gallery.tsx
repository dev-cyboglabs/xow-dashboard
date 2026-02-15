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
  expo_name: string;
  booth_name: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  status: string;
  has_video: boolean;
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
    if (deviceId) {
      fetchRecordings();
    }
  }, [deviceId]);

  const loadDevice = async () => {
    try {
      const savedDevice = await AsyncStorage.getItem('xow_device');
      if (savedDevice) {
        const device = JSON.parse(savedDevice);
        setDeviceId(device.device_id);
      }
    } catch (error) {
      console.error('Load device error:', error);
    }
  };

  const fetchRecordings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/recordings`, {
        params: { device_id: deviceId },
      });
      setRecordings(response.data);
    } catch (error) {
      console.error('Fetch recordings error:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecordings();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'recording':
        return { color: '#EF4444', icon: 'radio-button-on', label: 'RECORDING' };
      case 'completed':
        return { color: '#F59E0B', icon: 'checkmark-circle', label: 'COMPLETED' };
      case 'uploaded':
        return { color: '#10B981', icon: 'cloud-done', label: 'UPLOADED' };
      case 'processed':
        return { color: '#7C3AED', icon: 'sparkles', label: 'PROCESSED' };
      default:
        return { color: '#6B7280', icon: 'help-circle', label: 'UNKNOWN' };
    }
  };

  const renderRecording = ({ item, index }: { item: Recording; index: number }) => {
    const statusInfo = getStatusInfo(item.status);
    
    return (
      <View style={styles.recordingCard}>
        <View style={styles.cardIndex}>
          <Text style={styles.indexText}>{(index + 1).toString().padStart(3, '0')}</Text>
        </View>
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.recordingDate}>{formatDate(item.start_time)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}20` }]}>
              <Ionicons name={statusInfo.icon as any} size={12} color={statusInfo.color} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          </View>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text style={styles.statValue}>{formatDuration(item.duration)}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="people-outline" size={16} color="#6B7280" />
              <Text style={styles.statValue}>{item.barcode_scans?.length || 0} visitors</Text>
            </View>
            <View style={styles.mediaIcons}>
              <Ionicons name="mic" size={16} color={item.has_audio ? '#10B981' : '#3F3F46'} />
              <Ionicons name="document-text" size={16} color={item.transcript ? '#7C3AED' : '#3F3F46'} />
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Left Sidebar */}
      <View style={styles.sidebar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.sidebarContent}>
          <Ionicons name="folder-open" size={32} color="#7C3AED" />
          <Text style={styles.sidebarTitle}>Gallery</Text>
          <Text style={styles.recordingCount}>{recordings.length}</Text>
          <Text style={styles.recordingLabel}>Recordings</Text>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loadingText}>Loading recordings...</Text>
          </View>
        ) : recordings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="videocam-off" size={48} color="#3F3F46" />
            <Text style={styles.emptyTitle}>No Recordings</Text>
            <Text style={styles.emptyText}>Start recording to see your sessions here</Text>
          </View>
        ) : (
          <FlatList
            data={recordings}
            renderItem={renderRecording}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
            }
            showsVerticalScrollIndicator={false}
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
    backgroundColor: '#0A0A0A',
  },
  sidebar: {
    width: 120,
    backgroundColor: '#111111',
    borderRightWidth: 1,
    borderRightColor: '#1F1F1F',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarContent: {
    alignItems: 'center',
  },
  sidebarTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  recordingCount: {
    color: '#7C3AED',
    fontSize: 36,
    fontWeight: '800',
    marginTop: 20,
  },
  recordingLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  refreshButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    marginTop: 16,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  recordingCard: {
    flexDirection: 'row',
    backgroundColor: '#111111',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    overflow: 'hidden',
  },
  cardIndex: {
    width: 60,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2D2D2D',
  },
  indexText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recordingDate: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  mediaIcons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
});
