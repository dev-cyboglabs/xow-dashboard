import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, AppState } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';

export default function RootLayout() {
  React.useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    NavigationBar.setVisibilityAsync('hidden');
    NavigationBar.setBehaviorAsync('overlay-swipe');

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        NavigationBar.setVisibilityAsync('hidden');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
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
