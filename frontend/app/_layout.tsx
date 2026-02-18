import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, AppState, Platform, StatusBar as RNStatusBar } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';

export default function RootLayout() {
  // Hide status bar immediately before component mounts
  React.useLayoutEffect(() => {
    if (Platform.OS === 'android') {
      RNStatusBar.setHidden(true, 'none');
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent', true);
    } else if (Platform.OS === 'ios') {
      RNStatusBar.setHidden(true, 'none');
    }
  }, []);

  React.useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

    const hideSystemUI = () => {
      if (Platform.OS === 'android') {
        RNStatusBar.setHidden(true, 'none');
        RNStatusBar.setTranslucent(true);
        RNStatusBar.setBackgroundColor('transparent', true);
        NavigationBar.setVisibilityAsync('hidden');
      } else if (Platform.OS === 'ios') {
        RNStatusBar.setHidden(true, 'none');
      }
    };

    hideSystemUI();
    
    // Keep trying to hide it
    const interval = setInterval(hideSystemUI, 100);
    setTimeout(() => clearInterval(interval), 2000);

    // Re-hide nav bar whenever it becomes visible (e.g. user swipes)
    const navSub = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility === 'visible') {
        setTimeout(hideSystemUI, 1500);
      }
    });

    // Re-hide when app comes back to foreground
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') hideSystemUI();
    });

    return () => {
      navSub.remove();
      appSub.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
          animation: 'none',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="recorder" />
        <Stack.Screen name="gallery" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
