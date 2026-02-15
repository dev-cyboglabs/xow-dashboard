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
import { LinearGradient } from 'expo-linear-gradient';
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'recording':
        return '#ff5252';
      case 'completed':
        return '#ffc107';
      case 'uploaded':
        return '#4caf50';
      case 'processed':
        return '#2196f3';
      default:
        return '#666';
    }
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'recording':
        return 'radio-button-on';
      case 'completed':
        return 'checkmark-circle-outline';
      case 'uploaded':
        return 'cloud-done-outline';
      case 'processed':
        return 'analytics-outline';
      default:
        return 'help-circle-outline';
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

  const renderRecording = ({ item }: { item: Recording }) => (
    <TouchableOpacity
      style={styles.recordingCard}
      onPress={() => {
        // Navigate to recording details
      }}
    >
      <LinearGradient
        colors={['rgba(233,69,96,0.1)', 'rgba(26,26,46,0.9)']}
        style={styles.cardGradient}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="videocam" size={20} color="#e94560" />
            <Text style={styles.cardTitle}>{item.booth_name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Ionicons name={getStatusIcon(item.status)} size={12} color="#fff" />
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color="#888" />
            <Text style={styles.infoText}>{formatDate(item.start_time)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color="#888" />
            <Text style={styles.infoText}>{formatDuration(item.duration)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="barcode-outline" size={16} color="#888" />
            <Text style={styles.infoText}>{item.barcode_scans?.length || 0} scans</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.mediaIcons}>
            <Ionicons
              name={item.has_video ? 'videocam' : 'videocam-outline'}
              size={20}
              color={item.has_video ? '#4caf50' : '#444'}
            />
            <Ionicons
              name={item.has_audio ? 'mic' : 'mic-outline'}
              size={20}
              color={item.has_audio ? '#4caf50' : '#444'}
            />
            <Ionicons
              name={item.transcript ? 'document-text' : 'document-text-outline'}
              size={20}
              color={item.transcript ? '#4caf50' : '#444'}
            />
          </View>

          {item.has_audio && !item.transcript && item.status === 'uploaded' && (
            <TouchableOpacity
              style={styles.transcribeButton}
              onPress={() => triggerTranscription(item.id)}
            >
              <Ionicons name="language-outline" size={16} color="#fff" />
              <Text style={styles.transcribeText}>Transcribe</Text>
            </TouchableOpacity>
          )}
        </View>

        {item.summary && (
          <View style={styles.summarySection}>
            <Text style={styles.summaryLabel}>AI Summary:</Text>
            <Text style={styles.summaryText} numberOfLines={2}>
              {item.summary}
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={['#0a0a0f', '#1a1a2e', '#16213e']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gallery</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#e94560" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.loadingText}>Loading recordings...</Text>
        </View>
      ) : recordings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-off-outline" size={60} color="#444" />
          <Text style={styles.emptyText}>No recordings yet</Text>
          <Text style={styles.emptySubtext}>Start recording to see them here</Text>
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
              tintColor="#e94560"
            />
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshButton: {
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
    color: '#888',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  recordingCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.3)',
  },
  cardGradient: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    color: '#888',
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mediaIcons: {
    flexDirection: 'row',
    gap: 12,
  },
  transcribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e94560',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  transcribeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  summarySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  summaryLabel: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 18,
  },
});
