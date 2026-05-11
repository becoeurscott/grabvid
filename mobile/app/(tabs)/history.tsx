/**
 * History Screen — Shows download history from SQLite database
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
// import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

import { Colors, DownloadRecord, PLATFORMS } from '../../constants';
import { getDownloadHistory, clearDownloadHistory, deleteDownloadRecord } from '../../services/storage';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const maxW = isTablet ? 600 : width;
  const [records, setRecords] = useState<DownloadRecord[]>([]);

  // Refresh history whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      const history = await getDownloadHistory();
      setRecords(history);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all download history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearDownloadHistory();
            setRecords([]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  };

  const handleDelete = async (id: string) => {
    await deleteDownloadRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getPlatformIcon = (platformId: string): string => {
    const platform = PLATFORMS.find((p) => p.id === platformId);
    return platform?.icon || 'help-circle';
  };

  const renderItem = ({ item }: { item: DownloadRecord }) => (
    <TouchableOpacity
      style={styles.historyRow}
      onLongPress={() => {
        Alert.alert('Delete', 'Remove this download from history?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item.id) },
        ]);
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: item.platform_color + '1F' }]}>
        <Ionicons name={getPlatformIcon(item.platform) as any} size={20} color={item.platform_color} />
      </View>

      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowMetaText}>{item.format_label}</Text>
          <Text style={styles.rowMetaDot}>•</Text>
          <Text style={styles.rowMetaText}>{item.file_size}</Text>
        </View>
      </View>

      <Text style={styles.rowTime}>{formatRelativeTime(item.download_date)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { maxWidth: maxW, alignSelf: 'center', width: '100%' }]}>
        <Text style={styles.headerTitle}>History</Text>
        {records.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearButton}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {records.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={60} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptySubtitle}>Your download history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { maxWidth: maxW, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
      
      {/* Banner Ad at bottom of history */}
      {/* <View style={{ alignItems: 'center', paddingVertical: 10 }}>
        <BannerAd
          unitId={'ca-app-pub-3132858571697197/6840991115'}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        />
      </View> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  clearButton: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfacePrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 8,
    gap: 14,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  rowMetaText: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  rowMetaDot: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  rowTime: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
