import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gauge, KeyRound, MapPin, Mic } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';
import { FONT_FAMILY } from '@/theme/typography';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: COLORS.energyGreen,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 58 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
        },
        tabBarLabelStyle: {
          fontFamily: FONT_FAMILY.vnSemiBold,
          fontSize: 11,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trang chủ',
          tabBarIcon: ({ color, size }) => <Gauge size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="journey"
        options={{
          title: 'Trợ lý AI',
          tabBarIcon: ({ color, size }) => <Mic size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Bản đồ',
          tabBarIcon: ({ color, size }) => <MapPin size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="vehicle"
        options={{
          title: 'Xe của tôi',
          tabBarIcon: ({ color, size }) => <KeyRound size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}
