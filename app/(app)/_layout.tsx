import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

// 🟢 1. GLOBAL TIER LOGIC
function getBitsStyle(amount: number) {
  if (amount >= 100000) return { color: '#FFBB23', icon: require('../../assets/bits/tier06.png') }
  if (amount >= 10000) return { color: '#FF4A58', icon: require('../../assets/bits/tier05.png') }
  if (amount >= 5000) return { color: '#4877FF', icon: require('../../assets/bits/tier04.png') }
  if (amount >= 1000) return { color: '#01F7D9', icon: require('../../assets/bits/tier03.png') }
  if (amount >= 100) return { color: '#BD63FF', icon: require('../../assets/bits/tier02.png') }
  return { color: '#A1A1A1', icon: require('../../assets/bits/tier01.png') }
}

// 🟢 2. GLOBAL HEADER COMPONENT
// This will sit in the top right of your app and constantly track your Bits
function GlobalBalanceBadge() {
  const [balance, setBalance] = useState(0)

  useFocusEffect(
    useCallback(() => {
      async function fetchBalance() {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data } = await supabase.from('users').select('balance').eq('id', user.id).single()
          if (data) setBalance(data.balance || 0)
        }
      }
      fetchBalance()
    }, [])
  )

  const currentBitsStyle = getBitsStyle(balance)

  return (
    <View style={[styles.balanceBadge, { borderColor: currentBitsStyle.color }]}>
      <Image source={currentBitsStyle.icon} style={styles.bitsIcon} contentFit="contain" />
      <Text style={[styles.balanceText, { color: currentBitsStyle.color }]}>
        {balance.toLocaleString()} Bits
      </Text>
    </View>
  )
}

export default function AppLayout() {
  return (
    <Tabs 
      screenOptions={{
        // 🟢 3. ENABLE THE GLOBAL HEADER
        headerShown: true, 
        headerStyle: { backgroundColor: '#0F0F0F', shadowColor: 'transparent' }, // Seamless dark background
        headerTitle: '', // Hides the default title so we have a clean bar
        headerRight: () => <GlobalBalanceBadge />, // Injects your bits into the top right!
        
        tabBarActiveTintColor: '#e8a020',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { 
          backgroundColor: '#0F0F0F', 
          borderTopColor: '#2a2a2a',
        },
      }}
    >
      {/* 🟢 4. THE CORRECT TAB ORDER */}
      
      {/* Tab 1: Packs */}
      <Tabs.Screen 
        name="packs" 
        options={{ title: 'Packs', tabBarLabel: 'Packs' }} 
      />

      {/* Tab 2: Vault (Formerly Inventory) */}
      <Tabs.Screen 
        name="vault" 
        options={{ title: 'Vault', tabBarLabel: 'Vault' }} 
      />

      {/* Tab 3: Shop (Added!) */}
      <Tabs.Screen 
        name="shop" 
        options={{ title: 'Shop', tabBarLabel: 'Shop' }} 
      />

      {/* Tab 4: Settings */}
      <Tabs.Screen 
        name="settings" 
        options={{ title: 'Settings', tabBarLabel: 'Settings' }} 
      />

      {/* 🔴 HIDDEN SCREENS (Still navigable, but no tab icon) */}
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Badge Styles for the Global Header
  balanceBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#181818', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 16, 
    borderWidth: 1,
    gap: 6,
    marginRight: 16, // Adds breathing room from the edge of the screen
  },
  bitsIcon: { width: 16, height: 16 },
  balanceText: { fontWeight: '800', fontSize: 14 },

  tabBar: { backgroundColor: '#0f0f0f', borderTopColor: '#1a1a1a', height: 60 },
  label: { fontSize: 11, marginBottom: 4 },
  iconWrapper: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  triangle: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 14, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
})