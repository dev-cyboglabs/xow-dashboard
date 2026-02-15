import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function RootLayout() {
  React.useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
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
