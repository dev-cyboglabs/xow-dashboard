import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
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
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'recording':
        return { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)', icon: 'radio-button-on', label: 'Recording' };
      case 'completed':
        return { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)', icon: 'checkmark-circle', label: 'Completed' };
      case 'uploaded':
        return { color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)', icon: 'cloud-done', label: 'Uploaded' };
      case 'processed':
        return { color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.1)', icon: 'sparkles', label: 'Processed' };
      default:
        return { color: '#6B7280', bg: 'rgba(107, 114, 128, 0.1)', icon: 'help-circle', label: 'Unknown' };
    }
  };

  const triggerTranscription = async (recordingId: string) => {
    try {
      await axios.post(`${API_URL}/api/recordings/${recordingId}/transcribe`);
      fetchRecordings();
    } catch (error) {
      console.error('Transcription error:', error);
    }
  };

  const renderRecording = ({ item }: { item: Recording }) => {
    const statusInfo = getStatusInfo(item.status);
    
    return (
      <View style={styles.recordingCard}>
        <View style={styles.cardHeader}>
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>{formatDate(item.start_time)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Ionicons name={statusInfo.icon as any} size={12} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Duration</Text>
              <Text style={styles.infoValue}>{formatDuration(item.duration)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="people-outline" size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Visitors</Text>
              <Text style={styles.infoValue}>{item.barcode_scans?.length || 0}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="cloud-outline" size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Upload</Text>
              <Text style={[styles.infoValue, { color: item.has_audio ? '#10B981' : '#6B7280' }]}>
                {item.has_audio ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        </View>

        {/* Media Status */}
        <View style={styles.mediaRow}>
          <View style={styles.mediaIcons}>
            <View style={[styles.mediaIcon, item.has_video && styles.mediaIconActive]}>
              <Ionicons name="videocam" size={16} color={item.has_video ? '#7C3AED' : '#3F3F46'} />
            </View>
            <View style={[styles.mediaIcon, item.has_audio && styles.mediaIconActive]}>
              <Ionicons name="mic" size={16} color={item.has_audio ? '#7C3AED' : '#3F3F46'} />
            </View>
            <View style={[styles.mediaIcon, item.transcript && styles.mediaIconActive]}>
              <Ionicons name="document-text" size={16} color={item.transcript ? '#7C3AED' : '#3F3F46'} />
            </View>
          </View>

          {item.has_audio && !item.transcript && item.status === 'uploaded' && (
            <TouchableOpacity
              style={styles.transcribeBtn}
              onPress={() => triggerTranscription(item.id)}
            >
              <Ionicons name="sparkles" size={14} color="#fff" />
              <Text style={styles.transcribeBtnText}>Transcribe</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Summary Preview */}
        {item.summary && (
          <View style={styles.summaryContainer}>
            <View style={styles.summaryHeader}>
              <Ionicons name="sparkles" size={14} color="#7C3AED" />
              <Text style={styles.summaryTitle}>AI Summary</Text>
            </View>
            <Text style={styles.summaryText} numberOfLines={2}>{item.summary}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recordings</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Loading recordings...</Text>
        </View>
      ) : recordings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="videocam-off-outline" size={48} color="#4B5563" />
          </View>
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#1F1F1F',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  refreshBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1F1F1F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  recordingCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateContainer: {
    flex: 1,
  },
  dateText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardBody: {
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoItem: {
    alignItems: 'center',
    flex: 1,
  },
  infoLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 4,
  },
  infoValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
  },
  mediaIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  mediaIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1F1F1F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaIconActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
  },
  transcribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  transcribeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  summaryTitle: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryText: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
});
