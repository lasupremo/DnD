import { Tabs } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { Image } from 'react-native'

export default function AppLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: styles.tabBar,
      tabBarActiveTintColor: '#e8a020',
      tabBarInactiveTintColor: '#555',
      tabBarShowLabel: true,
      tabBarLabelStyle: styles.label,
    }}>
      <Tabs.Screen
        name="collections"
        options={{
          title: 'Cases',
          tabBarIcon: ({ color }) => (
            <View style={[styles.iconWrapper, { borderBottomColor: color }]}>
              <View style={[styles.triangle, { borderBottomColor: color }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color }) => (
            <View style={[styles.iconWrapper]}>
              <View style={[styles.triangle, { borderBottomColor: color }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <View style={[styles.iconWrapper]}>
              <View style={[styles.triangle, { borderBottomColor: color }]} />
            </View>
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: '#0f0f0f', borderTopColor: '#1a1a1a', height: 60 },
  label: { fontSize: 11, marginBottom: 4 },
  iconWrapper: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  triangle: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 14, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
})