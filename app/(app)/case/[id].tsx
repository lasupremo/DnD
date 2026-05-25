import { useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Alert, Dimensions, Modal, Image } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { supabase } from '../../../lib/supabase'
import { openCase } from '../../../lib/roll'
import { Collection, DropResult, Video } from '../../../types'

type Phase = 'idle' | 'rolling' | 'reveal'

const RARITY_COLORS = ['#6496C8', '#8847FF', '#D32CE6', '#EB4B4B', '#E4AE39']
const TILE_COUNT = 40
const TILE_WIDTH = 72
const TILE_GAP = 8
const TILE_STEP = TILE_WIDTH + TILE_GAP
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CIRCLE_SIZE = SCREEN_WIDTH * 0.72

export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [decoys, setDecoys] = useState<Video[]>([])
  const [result, setResult] = useState<DropResult | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [userId, setUserId] = useState<string>('')
  const [tilesReady, setTilesReady] = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  const scrollX = useRef(new Animated.Value(0)).current
  const caseOpacity = useRef(new Animated.Value(1)).current
  const revealAnim = useRef(new Animated.Value(0)).current
  const videoScale = useRef(new Animated.Value(0.8)).current
  const videoOpacity = useRef(new Animated.Value(0)).current
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const player = useVideoPlayer(result?.cdn_url ?? '', (p) => { p.loop = true })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
    fetchCollection()
    fetchDecoys()
  }, [id])

  useEffect(() => {
    if (videoVisible) {
      progressInterval.current = setInterval(() => {
        const current = player.currentTime ?? 0
        const dur = player.duration ?? 0
        if (dur > 0) { setProgress(current / dur); setDuration(dur) }
      }, 300)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
      setProgress(0)
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [videoVisible])

  async function fetchCollection() {
    const { data } = await supabase
      .from('collection')
      .select('id, name, description, cover_image_url, videos(count)')
      .eq('id', id).single()
    if (data) setCollection(data as unknown as Collection)
  }

  async function fetchDecoys() {
    const { data } = await supabase
      .from('videos')
      .select('id, title, thumbnail_url, rarity_tiers(name, color_hex)')
      .eq('collection_id', id).eq('is_active', true).limit(30)
    if (data) { setDecoys(data as unknown as Video[]); setTilesReady(true) }
  }

  const paddedTiles = tilesReady
    ? [...Array(TILE_COUNT)].map((_, i) => {
        if (decoys.length > 0) return decoys[i % decoys.length]
        return {
          id: i.toString(), title: '', cdn_url: '', thumbnail_url: '',
          rarity_tiers: { id: '', name: '', weight_percent: 0, sort_order: 0, color_hex: RARITY_COLORS[i % RARITY_COLORS.length] }
        } as Video
      })
    : []

  async function handleOpen() {
    if (phase !== 'idle' || !userId) return
    setPhase('rolling')
    scrollX.setValue(0)
    revealAnim.setValue(0)

    // Fade out the case icon
    Animated.timing(caseOpacity, {
      toValue: 0.25,
      duration: 300,
      useNativeDriver: true,
    }).start()

    const rollPromise = openCase(id, userId)
    const randomOffset = Math.random() * TILE_STEP
    const finalScroll = (TILE_COUNT - 5) * TILE_STEP + randomOffset

    Animated.timing(scrollX, {
      toValue: -finalScroll,
      duration: 3500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(async () => {
      try {
        const drop = await rollPromise
        setResult(drop)
        setPhase('reveal')

        // Fade case back in, reveal card slides up
        Animated.parallel([
          Animated.timing(caseOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(revealAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
        ]).start()
      } catch {
        Alert.alert('Error', 'Something went wrong. Try again.')
        setPhase('idle')
        scrollX.setValue(0)
        Animated.timing(caseOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
      }
    })
  }

  function handlePlay() {
    setVideoVisible(true)
    setIsPlaying(true)
    player.play()
    Animated.parallel([
      Animated.spring(videoScale, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(videoOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start()
  }

  function handleCloseVideo() {
    Animated.parallel([
      Animated.timing(videoScale, { toValue: 0.8, duration: 200, useNativeDriver: true }),
      Animated.timing(videoOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      player.pause()
      setVideoVisible(false)
      videoScale.setValue(0.8)
      videoOpacity.setValue(0)
    })
  }

  function handleClose() {
    setPhase('idle')
    setResult(null)
    scrollX.setValue(0)
    caseOpacity.setValue(1)
    revealAnim.setValue(0)
  }

  function togglePlayPause() {
    if (isPlaying) { player.pause(); setIsPlaying(false) }
    else { player.play(); setIsPlaying(true) }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  const revealTranslateY = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] })
  const revealOpacity = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })

  // Strip center offset so middle tile aligns with indicator
  const stripInitialOffset = -(TILE_STEP * (TILE_COUNT / 2)) + SCREEN_WIDTH / 2 - TILE_WIDTH / 2

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* Title */}
      <Text style={styles.pressLabel}>Press to Open</Text>
      <Text style={styles.subLabel}>
        Open <Text style={styles.subLabelBold}>{collection?.name}</Text> videos
      </Text>

      {/* Circle case button */}
      <View style={styles.circleWrapper}>
        {/* Rolling strip inside circle */}
        <View style={styles.stripClip}>
          <Animated.View style={[styles.strip, { transform: [{ translateX: Animated.add(new Animated.Value(stripInitialOffset), scrollX) }] }]}>
            {paddedTiles.map((v, i) => (
              <View key={i} style={[styles.tile, { backgroundColor: v.rarity_tiers?.color_hex ?? '#333' }]} />
            ))}
          </Animated.View>
          {/* Fade edges */}
          <View style={styles.fadeLeft} pointerEvents="none" />
          <View style={styles.fadeRight} pointerEvents="none" />
          {/* Center indicator */}
          <View style={styles.indicator} pointerEvents="none" />
        </View>

        {/* Case icon button */}
        <Animated.View style={[styles.caseIconWrapper, { opacity: caseOpacity }]}>
          <TouchableOpacity onPress={handleOpen} disabled={phase !== 'idle'} activeOpacity={0.85}>
            <Image
              source={{ uri: collection?.cover_image_url }}
              style={styles.caseIcon}
              resizeMode="cover"
            />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Video grid preview */}
      <View style={styles.videoGrid}>
        {decoys.slice(0, 8).map((v, i) => (
          <View key={i} style={styles.gridThumbWrapper}>
            <View style={[styles.gridThumb, { backgroundColor: v.rarity_tiers?.color_hex ?? '#333' }]} />
            <Text style={styles.gridThumbLabel} numberOfLines={1}>{v.title}</Text>
          </View>
        ))}
      </View>

      {/* Reveal card */}
      {phase === 'reveal' && result && (
        <Animated.View style={[styles.revealCard, {
          opacity: revealOpacity,
          transform: [{ translateY: revealTranslateY }],
          borderColor: result.rarity.color_hex,
        }]}>
          <View style={[styles.revealColorDot, { backgroundColor: result.rarity.color_hex }]} />
          <View style={styles.revealInfo}>
            <Text style={[styles.revealRarity, { color: result.rarity.color_hex }]}>{result.rarity.name.toUpperCase()}</Text>
            <Text style={styles.revealTitle} numberOfLines={1}>{result.title}</Text>
          </View>
          <View style={styles.revealButtons}>
            <TouchableOpacity style={[styles.playBtn, { backgroundColor: result.rarity.color_hex }]} onPress={handlePlay}>
              <Text style={styles.playBtnText}>Play</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Video modal */}
      <Modal visible={videoVisible} transparent animationType="none" onRequestClose={handleCloseVideo}>
        <View style={styles.modalBg}>
          <Animated.View style={[styles.videoCard, { transform: [{ scale: videoScale }], opacity: videoOpacity }]}>
            <TouchableOpacity activeOpacity={1} onPress={togglePlayPause} style={styles.videoTouch}>
              <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
              {!isPlaying && (
                <View style={styles.pauseOverlay}>
                  <Text style={styles.pauseIcon}>▐▐</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Video title + rarity */}
            <View style={styles.videoMeta}>
              <Text style={styles.videoTitle}>{result?.title}</Text>
              <Text style={[styles.videoRarity, { color: result?.rarity.color_hex }]}>{result?.rarity.name.toUpperCase()}</Text>
            </View>

            {/* Progress bar */}
            <View style={styles.progressRow}>
              <Text style={styles.progressTime}>{formatTime(progress * duration)}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: result?.rarity.color_hex }]} />
              </View>
              <Text style={styles.progressTime}>{formatTime(duration)}</Text>
            </View>

            {/* Close */}
            <TouchableOpacity style={styles.videoClose} onPress={handleCloseVideo}>
              <Text style={styles.videoCloseText}>✕</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  )
}

const CIRCLE_BORDER = 3
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', paddingTop: 56 },
  backBtn: { paddingHorizontal: 20, marginBottom: 16 },
  backText: { color: '#888', fontSize: 14 },
  pressLabel: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subLabel: { fontSize: 13, color: '#555', textAlign: 'center', marginTop: 4, marginBottom: 28 },
  subLabelBold: { color: '#fff', fontWeight: '600' },

  // Circle
  circleWrapper: { alignSelf: 'center', width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, borderWidth: CIRCLE_BORDER, borderColor: '#e8a020', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginBottom: 28 },
  stripClip: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', overflow: 'hidden' },
  strip: { flexDirection: 'row', alignItems: 'center', position: 'absolute' },
  tile: { width: TILE_WIDTH, height: TILE_WIDTH, borderRadius: 8, marginHorizontal: TILE_GAP / 2 },
  fadeLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: CIRCLE_SIZE * 0.28, backgroundColor: 'transparent',
    // gradient-like fade using shadow
  },
  fadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: CIRCLE_SIZE * 0.28 },
  indicator: { position: 'absolute', top: '30%', bottom: '30%', left: '50%', width: 2, backgroundColor: '#e8a020', marginLeft: -1 },
  caseIconWrapper: { position: 'absolute', width: CIRCLE_SIZE * 0.62, height: CIRCLE_SIZE * 0.62, borderRadius: (CIRCLE_SIZE * 0.62) / 2, overflow: 'hidden' },
  caseIcon: { width: '100%', height: '100%' },

  // Video grid
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  gridThumbWrapper: { width: (SCREEN_WIDTH - 56) / 4, alignItems: 'center' },
  gridThumb: { width: '100%', aspectRatio: 1, borderRadius: 6 },
  gridThumbLabel: { color: '#888', fontSize: 9, marginTop: 3, textAlign: 'center' },

  // Reveal card
  revealCard: { position: 'absolute', bottom: 80, left: 16, right: 16, backgroundColor: '#1a1a1a', borderRadius: 16, borderWidth: 1.5, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  revealColorDot: { width: 44, height: 44, borderRadius: 10 },
  revealInfo: { flex: 1 },
  revealRarity: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  revealTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  revealButtons: { flexDirection: 'row', gap: 8 },
  playBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  playBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  closeBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#444' },
  closeBtnText: { color: '#fff', fontSize: 13 },

  // Video modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  videoCard: { width: SCREEN_WIDTH - 32, borderRadius: 20, backgroundColor: '#111', overflow: 'hidden' },
  videoTouch: { width: '100%', aspectRatio: 9 / 16 },
  video: { width: '100%', height: '100%' },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  pauseIcon: { color: '#fff', fontSize: 36, opacity: 0.9 },
  videoMeta: { paddingHorizontal: 16, paddingTop: 12 },
  videoTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  videoRarity: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  progressTrack: { flex: 1, height: 3, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressTime: { color: '#666', fontSize: 10, minWidth: 32, textAlign: 'center' },
  videoClose: { position: 'absolute', top: 12, left: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  videoCloseText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})