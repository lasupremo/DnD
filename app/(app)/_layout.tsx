import { Tabs } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { Image } from 'react-native'

export default function AppLayout() {
  return (
    <Tabs 
      screenOptions={{
        headerShown: false, // Hides the top header if you are doing custom headers
        tabBarActiveTintColor: '#e8a020', // Your active yellow color
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { 
          backgroundColor: '#0F0F0F', 
          borderTopColor: '#2a2a2a',
        },
      }}
    >
      {/* 1. Cases (Mapped to collections.tsx) */}
      <Tabs.Screen 
        name="collections" 
        options={{ 
          title: 'Cases', 
          tabBarLabel: 'Cases',
          // tabBarIcon: ({ color }) => <YourIcon name="box" color={color} />
        }} 
      />

      {/* 2. Inventory */}
      <Tabs.Screen 
        name="inventory" 
        options={{ 
          title: 'Inventory', 
          tabBarLabel: 'Inventory',
        }} 
      />

      {/* 3. Settings */}
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: 'Settings', 
          tabBarLabel: 'Settings',
        }} 
      />
    {/* 🔴 HIDDEN SCREENS (Still navigable, but no tab icon) */}
      
      <Tabs.Screen 
        name="case/[id]" 
        options={{ href: null }} // This completely hides it from the bottom bar
      />
      
      <Tabs.Screen 
        name="history" 
        options={{ href: null }} // Hides the history page from the bar
      />
      
      <Tabs.Screen 
        name="index" 
        options={{ href: null }} // Hides the default index route
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: '#0f0f0f', borderTopColor: '#1a1a1a', height: 60 },
  label: { fontSize: 11, marginBottom: 4 },
  iconWrapper: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  triangle: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 14, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
})