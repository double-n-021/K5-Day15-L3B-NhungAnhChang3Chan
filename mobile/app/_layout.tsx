import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts as useVnFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import {
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts as useNumFonts,
} from '@expo-google-fonts/inter';
import { HackathonDemoOverlay } from '@/components/shared/HackathonDemoOverlay';
import { COLORS } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [vnLoaded] = useVnFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });

  const [numLoaded] = useNumFonts({
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const fontsReady = vnLoaded && numLoaded;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.energyGreen} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="recommendation"
            options={{ headerShown: false, presentation: 'card' }}
          />
          <Stack.Screen
            name="station-detail"
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="simulation"
            options={{ headerShown: false, presentation: 'card' }}
          />
          <Stack.Screen
            name="navigation"
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
          />
        </Stack>
        <HackathonDemoOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
