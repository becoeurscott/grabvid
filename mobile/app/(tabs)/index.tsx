/**
 * Download Screen — Main screen for URL input, platform detection,
 * format selection, download progress, and completion.
 */
import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
// import { BannerAd, BannerAdSize, InterstitialAd, AdEventType } from 'react-native-google-mobile-ads';
import { useShareIntent } from 'expo-share-intent';

// const REAL_INTERSTITIAL_ID = 'ca-app-pub-3132858571697197/6813815813';
// const REAL_BANNER_ID = 'ca-app-pub-3132858571697197/6840991115';
// const interstitial = InterstitialAd.createForAdRequest(REAL_INTERSTITIAL_ID, {
//   requestNonPersonalizedAdsOnly: true,
// });

import {
  Colors,
  PLATFORMS,
  PlatformInfo,
  FormatInfo,
  AnalyzeResponse,
  AppState,
  detectPlatform,
} from '../../constants';
import { analyzeURL, downloadMedia } from '../../services/api';
import { saveToDevice } from '../../services/fileSaver';
import { addDownloadRecord } from '../../services/storage';

// ─── Responsive Helpers ─────────────────────────────────────
type Breakpoint = 'phone' | 'phoneLg' | 'tablet' | 'tabletLg';

function useResponsive() {
  const { width, height } = useWindowDimensions();
  const bp: Breakpoint = width >= 1024 ? 'tabletLg' : width >= 768 ? 'tablet' : width >= 414 ? 'phoneLg' : 'phone';
  const isTablet = width >= 768;
  const contentMaxWidth = isTablet ? 600 : width;
  const contentPadding = isTablet ? 32 : 20;
  const gridColumns = width >= 1024 ? 5 : width >= 768 ? 5 : width >= 414 ? 5 : 4;
  const platformCardSize = Math.floor((contentMaxWidth - contentPadding * 2 - (gridColumns - 1) * 10) / gridColumns);
  const thumbnailHeight = isTablet ? 280 : Math.min(200, width * 0.48);
  const formatColumns = isTablet ? 2 : 1;
  return { width, height, bp, isTablet, contentMaxWidth, contentPadding, gridColumns, platformCardSize, thumbnailHeight, formatColumns };
}

export default function DownloadScreen() {
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const router = useRouter();

  // ─── State ────────────────────────────────────────────────
  const [urlText, setUrlText] = useState('');
  const [appState, setAppState] = useState<AppState>('idle');
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformInfo | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<FormatInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadWritten, setDownloadWritten] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Reset to idle when user comes back to this tab
  useFocusEffect(
    useCallback(() => {
      if (appState === 'completed') {
        handleReset();
      }
    }, [appState])
  );

  // Handle incoming shared links
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  React.useEffect(() => {
    if (hasShareIntent && shareIntent.value) {
      // The shared value might be text containing a URL or just the URL
      const text = shareIntent.value;
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/g);
      const extractedUrl = urlMatch ? urlMatch[0] : text;
      
      setUrlText(extractedUrl);
      
      // We manually invoke the platform detector so the UI updates
      const platform = detectPlatform(extractedUrl);
      setDetectedPlatform(platform);
      
      resetShareIntent();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  // ─── Animations ───────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // ─── Handlers ─────────────────────────────────────────────
  const accentColor = detectedPlatform?.color || Colors.textPrimary;

  const handleUrlChange = (text: string) => {
    setUrlText(text);
    const platform = detectPlatform(text);
    setDetectedPlatform(platform);
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setUrlText(text.trim());
        const platform = detectPlatform(text.trim());
        setDetectedPlatform(platform);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Clipboard access denied
    }
  };

  const isValidUrl = urlText.trim().length > 5 && urlText.includes('.');

  React.useEffect(() => {
    // Load the interstitial ad when the screen mounts
    // interstitial.load();
    // 
    // const unsubscribe = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    //   interstitial.load(); // Reload for the next time
    // });
    // return unsubscribe;
  }, []);

  const handleFetch = async () => {
    if (!isValidUrl) return;
    setAppState('analyzing');
    setAnalyzeResult(null);
    setSelectedFormat(null);
    setDownloadProgress(0);
    setDownloadWritten(0);
    setDownloadTotal(0);
    setErrorMessage('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await analyzeURL(urlText);
      setAnalyzeResult(result);
      const platform = PLATFORMS.find((p) => p.id === result.platform) || null;
      setDetectedPlatform(platform);
      setAppState('analyzed');
      animateIn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to analyze URL');
      setAppState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSelectFormat = (format: FormatInfo) => {
    setSelectedFormat(format);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDownload = async () => {
    if (!selectedFormat) return;
    setAppState('downloading');
    setDownloadProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Step 1: Download the file via expo-file-system
      const filePath = await downloadMedia(urlText, selectedFormat.format_id, (progress, written, total) => {
        setDownloadProgress(progress);
        setDownloadWritten(written);
        setDownloadTotal(total);
      });

      // Step 2: Save to history FIRST (this should always work)
      try {
        await addDownloadRecord({
          id: Date.now().toString(),
          url: urlText,
          title: analyzeResult?.title || 'Download',
          platform: analyzeResult?.platform || 'unknown',
          platform_color: analyzeResult?.platform_color || '#636366',
          format_label: selectedFormat.label,
          format_type: selectedFormat.type,
          file_size: selectedFormat.estimated_size,
          download_date: Date.now(),
          local_path: filePath,
        });
      } catch (historyErr) {
        console.warn('Failed to save to history:', historyErr);
      }

      // Step 3: Try to save to gallery/share
      try {
        await saveToDevice(filePath, selectedFormat.type);
      } catch (saveErr) {
        console.warn('Gallery save failed:', saveErr);
        // Don't block — file is still downloaded and in history
      }

      setAppState('completed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show interstitial ad if it's loaded
      // if (interstitial.loaded) {
      //   interstitial.show();
      // }

      // Auto-navigate to History tab after a brief moment
      setTimeout(() => {
        router.push('/(tabs)/history');
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Download failed');
      setAppState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleReset = () => {
    setUrlText('');
    setAppState('idle');
    setAnalyzeResult(null);
    setSelectedFormat(null);
    setDownloadProgress(0);
    setDownloadWritten(0);
    setDownloadTotal(0);
    setDetectedPlatform(null);
    setErrorMessage('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Render ───────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Platform gradient overlay */}
      {detectedPlatform && (
        <LinearGradient
          colors={[detectedPlatform.color + '25', 'transparent']}
          style={styles.gradientOverlay}
        />
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: responsive.contentPadding,
            maxWidth: responsive.contentMaxWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons
            name="arrow-down-circle"
            size={responsive.isTablet ? 44 : 36}
            color={accentColor}
          />
          <Text style={[styles.headerTitle, responsive.isTablet && { fontSize: 36 }]}>GrabVid</Text>
          <Text style={[styles.headerSubtitle, responsive.isTablet && { fontSize: 16 }]}>
            Paste a link, pick a format, download.
          </Text>
        </View>

        {/* URL Input Section */}
        <View style={styles.inputRow}>
          <View style={[styles.inputContainer, { flex: 1, borderColor: detectedPlatform ? accentColor + '80' : Colors.border }]}>
            <Ionicons name="link" size={18} color={Colors.textTertiary} />
            <TextInput
              style={[styles.input, responsive.isTablet && { fontSize: 17 }]}
              placeholder="Paste URL here..."
              placeholderTextColor={Colors.textTertiary}
              value={urlText}
              onChangeText={handleUrlChange}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleFetch}
              selectionColor={accentColor}
            />
            {urlText.length > 0 ? (
              <TouchableOpacity onPress={() => { setUrlText(''); setDetectedPlatform(null); }}>
                <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handlePaste}>
                <Ionicons name="clipboard" size={20} color={accentColor} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.grabVidButtonCompact,
              { backgroundColor: isValidUrl ? accentColor : Colors.surfaceTertiary },
            ]}
            onPress={handleFetch}
            disabled={!isValidUrl}
            activeOpacity={0.7}
          >
            <Text style={[styles.fetchButtonText, { color: isValidUrl ? Colors.black : Colors.textTertiary }]}>
              GrabVid
            </Text>
          </TouchableOpacity>
        </View>

        {/* Platform Badge */}
        {detectedPlatform && (
          <View style={styles.platformBadge}>
            <View style={[styles.platformDot, { backgroundColor: detectedPlatform.color }]} />
            <Ionicons name={detectedPlatform.icon as any} size={20} color={detectedPlatform.color} />
            <Text style={styles.platformBadgeText}>{detectedPlatform.name}</Text>
            <Text style={styles.platformBadgeLabel}>detected</Text>
          </View>
        )}

        {/* State-based content */}
        {appState === 'idle' && <PlatformsGrid responsive={responsive} />}
        {appState === 'analyzing' && <AnalyzingView accentColor={accentColor} />}
        {appState === 'analyzed' && analyzeResult && (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <MediaInfoCard result={analyzeResult} thumbnailHeight={responsive.thumbnailHeight} />
            <FormatSelectionList
              formats={analyzeResult.formats}
              selectedFormat={selectedFormat}
              accentColor={accentColor}
              onSelect={handleSelectFormat}
              columns={responsive.formatColumns}
            />
            {selectedFormat && (
              <TouchableOpacity
                style={[styles.downloadButton, { backgroundColor: accentColor }]}
                onPress={handleDownload}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={20} color={Colors.black} />
                <Text style={styles.downloadButtonText}>Download</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
        {appState === 'downloading' && (
          <DownloadProgressView progress={downloadProgress} written={downloadWritten} total={downloadTotal} accentColor={accentColor} />
        )}
        {appState === 'completed' && <CompletedView onReset={handleReset} />}
        {appState === 'error' && <ErrorView message={errorMessage} onRetry={handleFetch} />}

        {/* <View style={{ alignItems: 'center', marginTop: 30, marginBottom: 10 }}>
          <BannerAd
            unitId={REAL_BANNER_ID}
            size={BannerAdSize.BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: true,
            }}
          />
        </View> */}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function PlatformsGrid({ responsive }: { responsive: ReturnType<typeof useResponsive> }) {
  const { gridColumns, platformCardSize } = responsive;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Supported Platforms</Text>
      <View style={styles.platformsWrap}>
        {PLATFORMS.map((p) => (
          <View
            key={p.id}
            style={[
              styles.platformCard,
              { width: platformCardSize, minWidth: 64, maxWidth: 90 },
            ]}
          >
            <View style={[styles.platformIconBg, { backgroundColor: p.color + '20' }]}>
              <Ionicons name={p.icon as any} size={22} color={p.color} />
            </View>
            <Text style={styles.platformName} numberOfLines={1}>{p.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AnalyzingView({ accentColor }: { accentColor: string }) {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator size="large" color={accentColor} />
      <Text style={styles.stateTitle}>Analyzing URL...</Text>
      <Text style={styles.stateSubtitle}>Fetching available formats</Text>
    </View>
  );
}

function MediaInfoCard({ result, thumbnailHeight }: { result: AnalyzeResponse; thumbnailHeight: number }) {
  return (
    <View style={styles.mediaCard}>
      {result.thumbnail && (
        <Image
          source={{ uri: result.thumbnail }}
          style={[styles.thumbnail, { height: thumbnailHeight }]}
          resizeMode="cover"
        />
      )}
      <Text style={styles.mediaTitle} numberOfLines={2}>{result.title}</Text>
      <View style={styles.metaRow}>
        {result.author && (
          <View style={styles.metaItem}>
            <Ionicons name="person" size={13} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{result.author}</Text>
          </View>
        )}
        {result.duration_formatted && (
          <View style={styles.metaItem}>
            <Ionicons name="time" size={13} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{result.duration_formatted}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function FormatSelectionList({
  formats,
  selectedFormat,
  accentColor,
  onSelect,
  columns = 1,
}: {
  formats: FormatInfo[];
  selectedFormat: FormatInfo | null;
  accentColor: string;
  onSelect: (f: FormatInfo) => void;
  columns?: number;
}) {
  const getIcon = (type: string): string => {
    switch (type) {
      case 'video': return 'videocam';
      case 'audio': return 'musical-note';
      case 'image': return 'image';
      default: return 'document';
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Select Format</Text>
      <View style={columns > 1 ? styles.formatGrid : undefined}>
        {formats.map((format) => {
          const isSelected = selectedFormat?.format_id === format.format_id;
          return (
            <TouchableOpacity
              key={format.format_id}
              style={[
                styles.formatCard,
                isSelected && { backgroundColor: accentColor + '14', borderColor: accentColor + '60' },
                columns > 1 && { width: '48.5%' },
              ]}
              onPress={() => onSelect(format)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={getIcon(format.type) as any}
                size={22}
                color={isSelected ? accentColor : Colors.textSecondary}
              />
              <View style={styles.formatInfo}>
                <Text style={styles.formatLabel}>{format.label}</Text>
                <Text style={styles.formatSize}>{format.estimated_size}</Text>
              </View>

              {format.has_watermark !== null && format.has_watermark !== undefined && (
                <View style={[
                  styles.watermarkBadge,
                  { backgroundColor: format.has_watermark ? Colors.warning + '25' : Colors.success + '25' },
                ]}>
                  <Text style={[
                    styles.watermarkText,
                    { color: format.has_watermark ? Colors.warning : Colors.success },
                  ]}>
                    {format.has_watermark ? 'Watermark' : 'Clean'}
                  </Text>
                </View>
              )}

              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={isSelected ? accentColor : Colors.textTertiary}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function DownloadProgressView({ progress, written, total, accentColor }: { progress: number; written: number; total: number; accentColor: string }) {
  const formatSize = (bytes: number) => {
    if (!bytes) return '0 mo';
    return (bytes / (1024 * 1024)).toFixed(1) + ' mo';
  };
  return (
    <View style={styles.progressCard}>
      <Text style={styles.stateTitle}>Downloading...</Text>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: accentColor }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
        <Text style={{ color: '#888', fontSize: 16, marginTop: 12, fontVariant: ['tabular-nums'] }}>
          {formatSize(written)} / {formatSize(total)}
        </Text>
      </View>
    </View>
  );
}

function CompletedView({ onReset }: { onReset: () => void }) {
  return (
    <View style={styles.centeredState}>
      <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
      <Text style={styles.stateTitle}>Download Complete!</Text>
      <Text style={styles.stateSubtitle}>File saved to your device</Text>
      <TouchableOpacity style={styles.resetButton} onPress={onReset} activeOpacity={0.8}>
        <Ionicons name="refresh" size={18} color={Colors.black} />
        <Text style={styles.resetButtonText}>Download Another</Text>
      </TouchableOpacity>
    </View>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centeredState}>
      <Ionicons name="warning" size={56} color={Colors.error} />
      <Text style={styles.stateTitle}>Something went wrong</Text>
      <Text style={styles.stateSubtitle}>{message}</Text>
      <TouchableOpacity
        style={[styles.resetButton, { backgroundColor: Colors.error }]}
        onPress={onRetry}
        activeOpacity={0.8}
      >
        <Text style={styles.resetButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20, // overridden by responsive inline styles
  },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 8,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 2,
    gap: 10,
  },
  grabVidButtonCompact: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 90,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 14,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceTertiary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pasteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  fetchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  fetchButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Platform badge
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfacePrimary + 'CC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  platformBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  platformBadgeLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
  },

  // Platforms grid
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  platformsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  platformCard: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: Colors.surfacePrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  platformIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 6,
  },

  // Media card
  mediaCard: {
    marginTop: 24,
    backgroundColor: Colors.surfacePrimary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    // height is set dynamically via responsive.thumbnailHeight
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: Colors.surfaceTertiary,
  },
  mediaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Format selection
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surfacePrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 8,
  },
  formatInfo: {
    flex: 1,
  },
  formatLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  formatSize: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  watermarkBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
  },
  watermarkText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Download button
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 20,
  },
  downloadButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.black,
  },

  // Progress
  progressCard: {
    marginTop: 24,
    backgroundColor: Colors.surfacePrimary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    alignItems: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.surfaceTertiary,
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressPercent: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 12,
    fontVariant: ['tabular-nums'],
  },

  // Centered states
  centeredState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  stateSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Reset / action buttons
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
  },
});
