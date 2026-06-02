import { useEffect, useState, useRef } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import { Animated, View, Image, StyleSheet } from 'react-native'
// 🟢 NEW: Import the Gesture Handler Root View
import { GestureHandlerRootView } from 'react-native-gesture-handler'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [splashDone, setSplashDone] = useState(false)
  const router = useRouter()
  const segments = useSegments()

  const blinkAnim = useRef(new Animated.Value(0.3)).current
  const splashOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Blinking animation
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    )
    blink.start()

    const handleDeepLink = async (url: string) => {
      const parsed = Linking.parse(url)
      const params = parsed.queryParams as Record<string, string> ?? {}
      const accessToken = params['access_token']
      const refreshToken = params['refresh_token']
      if (accessToken && refreshToken) {
        const { data } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (data?.session) setSession(data.session)
      }
    }

    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url) })
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url))

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)

      // Stop blinking, go to full opacity, then fade out splash
      blink.stop()
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(500),
        Animated.timing(splashOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start(() => setSplashDone(true))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      sub.remove()
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (loading || !splashDone) return
    const inAuth = segments[0] === '(auth)'
    if (!session && !inAuth) router.replace('/(auth)/login')
    if (session && inAuth) router.replace('/(app)/packs')
  }, [session, loading, splashDone])

  if (!splashDone) {
    return (
      <View style={splash.container}>
        <Animated.Image
          source={require('../assets/smiley.png')}
          style={[splash.logo, { opacity: blinkAnim }]}
          resizeMode="contain"
        />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#0f0f0f', opacity: splashOpacity === blinkAnim ? 0 : Animated.subtract(new Animated.Value(1), splashOpacity) as any }]} />
      </View>
    )
  }

  // 🟢 FIXED: Wrapped the Slot so gesture handlers work globally!
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  )
}

const splash = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center' },
  logo: { width: 160, height: 160 },
})