/**
 * Root layout — wraps the entire app with providers and status bar
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
// import mobileAds from 'react-native-google-mobile-ads';
import { Colors } from '../constants';

export default function RootLayout() {
  useEffect(() => {
    // mobileAds()
    //   .initialize()
    //   .then(adapterStatuses => {
    //     // Initialization complete!
    //   });
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor={Colors.background} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
