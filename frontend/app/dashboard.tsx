import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Dimensions,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Video, ResizeMode } from 'expo-av';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface DashboardInsights {
  total_recordings: number;
  total_visitors: number;
  total_duration_hours: number;
  top_topics: string[];
  recent_activity: any[];
}

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
  translated_transcript?: string;
  summary?: string;
  highlights: string[];
  barcode_scans: any[];
  scans_count?: number;
}

interface Visitor {
  id: string;
  recording_id: string;
  barcode_data: string;
  visitor_name?: string;
  scan_time: string;
  video_timestamp?: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'recordings' | 'visitors'>('overview');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoTimestamp, setVideoTimestamp] = useState(0);
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [insightsRes, recordingsRes, visitorsRes] = await Promise.all([
        axios.get(`${API_URL}/api/dashboard/insights`),
        axios.get(`${API_URL}/api/dashboard/recordings`),
        axios.get(`${API_URL}/api/dashboard/visitors`),
      ]);
      setInsights(insightsRes.data);
      setRecordings(recordingsRes.data);
      setVisitors(visitorsRes.data);
    } catch (error) {
      console.error('Fetch data error:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const translateRecording = async (recordingId: string, language: string) => {
    setIsTranslating(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/recordings/${recordingId}/translate`,
        null,
        { params: { target_language: language } }
      );
      // Update the recording with translated transcript
      setRecordings((prev) =>
        prev.map((r) =>
          r.id === recordingId
            ? { ...r, translated_transcript: response.data.translated_transcript }
            : r
        )
      );
      if (selectedRecording?.id === recordingId) {
        setSelectedRecording((prev) =>
          prev ? { ...prev, translated_transcript: response.data.translated_transcript } : null
        );
      }
    } catch (error) {
      console.error('Translation error:', error);
    } finally {
      setIsTranslating(false);
    }
  };

  const playVideoAtTimestamp = async (recording: Recording, timestamp: number) => {
    setSelectedRecording(recording);
    setVideoTimestamp(timestamp * 1000); // Convert to milliseconds
    setShowVideoModal(true);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
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

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'hi', name: 'Hindi' },
  ];

  const renderOverview = () => (
    <View style={styles.overviewContainer}>
      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <LinearGradient colors={['#e94560', '#ff6b6b']} style={styles.statGradient}>
            <Ionicons name="videocam" size={28} color="#fff" />
            <Text style={styles.statValue}>{insights?.total_recordings || 0}</Text>
            <Text style={styles.statLabel}>Recordings</Text>
          </LinearGradient>
        </View>
        <View style={styles.statCard}>
          <LinearGradient colors={['#4caf50', '#8bc34a']} style={styles.statGradient}>
            <Ionicons name="people" size={28} color="#fff" />
            <Text style={styles.statValue}>{insights?.total_visitors || 0}</Text>
            <Text style={styles.statLabel}>Visitors</Text>
          </LinearGradient>
        </View>
        <View style={styles.statCard}>
          <LinearGradient colors={['#2196f3', '#03a9f4']} style={styles.statGradient}>
            <Ionicons name="time" size={28} color="#fff" />
            <Text style={styles.statValue}>{insights?.total_duration_hours?.toFixed(1) || 0}h</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </LinearGradient>
        </View>
      </View>

      {/* Top Topics */}
      {insights?.top_topics && insights.top_topics.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Topics</Text>
          <View style={styles.topicsContainer}>
            {insights.top_topics.map((topic, index) => (
              <View key={index} style={styles.topicBadge}>
                <Text style={styles.topicText}>{topic}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {insights?.recent_activity?.map((activity, index) => (
          <View key={index} style={styles.activityItem}>
            <View style={styles.activityIcon}>
              <Ionicons name="videocam" size={20} color="#e94560" />
            </View>
            <View style={styles.activityContent}>
              <Text style={styles.activityTitle}>{activity.booth_name}</Text>
              <Text style={styles.activityTime}>{formatDate(activity.start_time)}</Text>
            </View>
            <View style={[styles.activityStatus, { backgroundColor: activity.status === 'processed' ? '#4caf50' : '#ffc107' }]}>
              <Text style={styles.activityStatusText}>{activity.status}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderRecordings = () => (
    <View style={styles.recordingsContainer}>
      {recordings.map((recording) => (
        <TouchableOpacity
          key={recording.id}
          style={styles.recordingCard}
          onPress={() => setSelectedRecording(selectedRecording?.id === recording.id ? null : recording)}
        >
          <View style={styles.recordingHeader}>
            <View style={styles.recordingInfo}>
              <Text style={styles.recordingTitle}>{recording.booth_name}</Text>
              <Text style={styles.recordingDate}>{formatDate(recording.start_time)}</Text>
            </View>
            <View style={styles.recordingMeta}>
              <Text style={styles.recordingDuration}>{formatDuration(recording.duration)}</Text>
              <Text style={styles.recordingScans}>{recording.scans_count || 0} visitors</Text>
            </View>
          </View>

          {selectedRecording?.id === recording.id && (
            <View style={styles.recordingDetails}>
              {/* Video Player Button */}
              {recording.has_video && (
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => playVideoAtTimestamp(recording, 0)}
                >
                  <Ionicons name="play-circle" size={24} color="#fff" />
                  <Text style={styles.playButtonText}>Play Video</Text>
                </TouchableOpacity>
              )}

              {/* Transcript */}
              {recording.transcript && (
                <View style={styles.transcriptSection}>
                  <View style={styles.transcriptHeader}>
                    <Text style={styles.transcriptTitle}>Transcript</Text>
                    <View style={styles.languageSelector}>
                      {languages.slice(0, 4).map((lang) => (
                        <TouchableOpacity
                          key={lang.code}
                          style={[
                            styles.langButton,
                            targetLanguage === lang.code && styles.langButtonActive,
                          ]}
                          onPress={() => {
                            setTargetLanguage(lang.code);
                            if (lang.code !== 'en') {
                              translateRecording(recording.id, lang.code);
                            }
                          }}
                        >
                          <Text
                            style={[
                              styles.langButtonText,
                              targetLanguage === lang.code && styles.langButtonTextActive,
                            ]}
                          >
                            {lang.code.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {isTranslating ? (
                    <ActivityIndicator size="small" color="#e94560" />
                  ) : (
                    <Text style={styles.transcriptText}>
                      {targetLanguage === 'en'
                        ? recording.transcript
                        : recording.translated_transcript || recording.transcript}
                    </Text>
                  )}
                </View>
              )}

              {/* Summary */}
              {recording.summary && (
                <View style={styles.summarySection}>
                  <Text style={styles.summaryTitle}>AI Summary</Text>
                  <Text style={styles.summaryText}>{recording.summary}</Text>
                </View>
              )}

              {/* Highlights */}
              {recording.highlights && recording.highlights.length > 0 && (
                <View style={styles.highlightsSection}>
                  <Text style={styles.highlightsTitle}>Key Highlights</Text>
                  {recording.highlights.map((highlight, index) => (
                    <View key={index} style={styles.highlightItem}>
                      <Ionicons name="star" size={16} color="#ffc107" />
                      <Text style={styles.highlightText}>{highlight}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Barcode Scans Timeline */}
              {recording.barcode_scans && recording.barcode_scans.length > 0 && (
                <View style={styles.scansSection}>
                  <Text style={styles.scansTitle}>Visitor Timeline</Text>
                  {recording.barcode_scans.map((scan: any, index: number) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.scanItem}
                      onPress={() =>
                        scan.video_timestamp && playVideoAtTimestamp(recording, scan.video_timestamp)
                      }
                    >
                      <View style={styles.scanTimestamp}>
                        <Text style={styles.scanTime}>
                          {scan.video_timestamp ? formatDuration(scan.video_timestamp) : '--:--'}
                        </Text>
                      </View>
                      <View style={styles.scanInfo}>
                        <Text style={styles.scanBarcode}>{scan.barcode_data}</Text>
                        {scan.visitor_name && (
                          <Text style={styles.scanName}>{scan.visitor_name}</Text>
                        )}
                      </View>
                      {scan.video_timestamp && recording.has_video && (
                        <Ionicons name="play" size={20} color="#e94560" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderVisitors = () => (
    <View style={styles.visitorsContainer}>
      {visitors.length === 0 ? (
        <View style={styles.emptyVisitors}>
          <Ionicons name="people-outline" size={60} color="#444" />
          <Text style={styles.emptyText}>No visitors recorded yet</Text>
        </View>
      ) : (
        visitors.map((visitor) => {
          const recording = recordings.find((r) => r.id === visitor.recording_id);
          return (
            <TouchableOpacity
              key={visitor.id}
              style={styles.visitorCard}
              onPress={() =>
                recording &&
                visitor.video_timestamp &&
                playVideoAtTimestamp(recording, visitor.video_timestamp)
              }
            >
              <View style={styles.visitorIcon}>
                <Ionicons name="person-circle" size={40} color="#e94560" />
              </View>
              <View style={styles.visitorInfo}>
                <Text style={styles.visitorBarcode}>{visitor.barcode_data}</Text>
                {visitor.visitor_name && (
                  <Text style={styles.visitorName}>{visitor.visitor_name}</Text>
                )}
                <Text style={styles.visitorTime}>{formatDate(visitor.scan_time)}</Text>
                {recording && <Text style={styles.visitorBooth}>Booth: {recording.booth_name}</Text>}
              </View>
              {visitor.video_timestamp && recording?.has_video && (
                <View style={styles.visitorPlayButton}>
                  <Ionicons name="play-circle" size={32} color="#e94560" />
                  <Text style={styles.visitorPlayText}>{formatDuration(visitor.video_timestamp)}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  if (isLoading) {
    return (
      <LinearGradient colors={['#0a0a0f', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0a0a0f', '#1a1a2e', '#16213e']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>XoW Dashboard</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#e94560" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['overview', 'recordings', 'visitors'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Ionicons
              name={
                tab === 'overview'
                  ? 'analytics'
                  : tab === 'recordings'
                  ? 'videocam'
                  : 'people'
              }
              size={20}
              color={activeTab === tab ? '#e94560' : '#666'}
            />
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e94560" />
        }
      >
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'recordings' && renderRecordings()}
        {activeTab === 'visitors' && renderVisitors()}
      </ScrollView>

      {/* Video Modal */}
      <Modal
        visible={showVideoModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowVideoModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedRecording?.booth_name}</Text>
              <TouchableOpacity onPress={() => setShowVideoModal(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            {selectedRecording?.has_video && (
              <Video
                ref={videoRef}
                source={{ uri: `${API_URL}/api/recordings/${selectedRecording.id}/video` }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                positionMillis={videoTimestamp}
                shouldPlay
              />
            )}
            <Text style={styles.modalInfo}>
              Starting at: {formatDuration(videoTimestamp / 1000)}
            </Text>
          </View>
        </View>
      </Modal>
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#e94560',
  },
  tabText: {
    color: '#666',
    fontSize: 14,
  },
  activeTabText: {
    color: '#e94560',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  overviewContainer: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  statGradient: {
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  topicsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicBadge: {
    backgroundColor: 'rgba(233,69,96,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.5)',
  },
  topicText: {
    color: '#e94560',
    fontSize: 13,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(233,69,96,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
    marginLeft: 12,
  },
  activityTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  activityTime: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  activityStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activityStatusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  recordingsContainer: {
    padding: 16,
  },
  recordingCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.2)',
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingDate: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  recordingMeta: {
    alignItems: 'flex-end',
  },
  recordingDuration: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
  },
  recordingScans: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  recordingDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e94560',
    padding: 12,
    borderRadius: 12,
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptSection: {
    marginBottom: 16,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transcriptTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  languageSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  langButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  langButtonActive: {
    backgroundColor: '#e94560',
  },
  langButtonText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
  },
  langButtonTextActive: {
    color: '#fff',
  },
  transcriptText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 8,
  },
  summarySection: {
    marginBottom: 16,
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 20,
  },
  highlightsSection: {
    marginBottom: 16,
  },
  highlightsTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  highlightText: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },
  scansSection: {
    marginTop: 8,
  },
  scansTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  scanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  scanTimestamp: {
    backgroundColor: 'rgba(233,69,96,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  scanTime: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '600',
  },
  scanInfo: {
    flex: 1,
  },
  scanBarcode: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  scanName: {
    color: '#888',
    fontSize: 12,
  },
  visitorsContainer: {
    padding: 16,
  },
  emptyVisitors: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 16,
  },
  visitorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  visitorIcon: {
    marginRight: 12,
  },
  visitorInfo: {
    flex: 1,
  },
  visitorBarcode: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  visitorName: {
    color: '#e94560',
    fontSize: 14,
    marginTop: 2,
  },
  visitorTime: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  visitorBooth: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  visitorPlayButton: {
    alignItems: 'center',
  },
  visitorPlayText: {
    color: '#e94560',
    fontSize: 10,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
  },
  modalContent: {
    margin: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  video: {
    width: '100%',
    height: 250,
    backgroundColor: '#000',
  },
  modalInfo: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    padding: 12,
  },
});
