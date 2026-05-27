import { useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Alert, Dimensions, Modal, Image } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { Audio } from 'expo-av'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../../lib/supabase'
import { openCase } from '../../../lib/roll'
import { Collection, DropResult, Video } from '../../../types'

type Phase = 'idle' | 'rolling' | 'reveal'

const TILE_COUNT = 70
const TILE_WIDTH = 80
const TILE_GAP = 12
const TILE_STEP = TILE_WIDTH + TILE_GAP
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const stripInitialOffset = (SCREEN_WIDTH / 2) - (TILE_WIDTH / 2) - (TILE_GAP / 2) - (TILE_STEP * 4)

function getMysteryTile(col: Collection | null): Video {
    return {
      id: 'dummy-contraband-placeholder',
      title: col?.mystery_title || '★ Rare Special Item',
      thumbnail_url: col?.mystery_thumbnail_url || 'https://via.placeholder.com/150/E4AE39/000000?text=?',
      cdn_url: '',
      rarity_tiers: { 
        id: 'dummy-rarity-id', 
        name: 'Contraband', 
        weight_percent: 0,     
        color_hex: '#E4AE39', 
        // 🟢 Change this from 1 to 9999 so it is always the highest number and sorts last!
        sort_order: 9999 
      }
    };
  }

export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [decoys, setDecoys] = useState<Video[]>([])
  const [result, setResult] = useState<DropResult | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [userId, setUserId] = useState<string>('')
  const [paddedTiles, setPaddedTiles] = useState<Video[]>([])
  const [videoVisible, setVideoVisible] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [soundsReady, setSoundsReady] = useState(false)
  const [trackWidth, setTrackWidth] = useState(0)

  // Audio refs
  const revealSound = useRef<Audio.Sound | null>(null)
  const openingSound = useRef<Audio.Sound | null>(null)

  // Tick interval refs
  const rollDistance = useRef<number>(0)

  // Animated values
  const scrollX = useRef(new Animated.Value(0)).current
  const caseOpacity = useRef(new Animated.Value(1)).current
  const caseScale = useRef(new Animated.Value(1)).current
  const revealAnim = useRef(new Animated.Value(0)).current
  const videoScale = useRef(new Animated.Value(0.8)).current
  const videoOpacity = useRef(new Animated.Value(0)).current
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const spinAnim = useRef(new Animated.Value(0)).current

  const player = useVideoPlayer(result?.cdn_url ?? '', (p) => { p.loop = false })

  // Load ONLY opening and reveal sounds
  useEffect(() => {
    async function loadSounds() {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
      })

      const { sound: reveal } = await Audio.Sound.createAsync(
        require('../../../assets/reveal.mp3'),
        { shouldPlay: false, volume: 1.0 }
      )
      revealSound.current = reveal

      const { sound: opening } = await Audio.Sound.createAsync(
        require('../../../assets/opening.mp3'),
        { shouldPlay: false, volume: 1.0 }
      )
      openingSound.current = opening

      setSoundsReady(true)
    }
    loadSounds()

    return () => {
      revealSound.current?.unloadAsync().catch(() => {})
      openingSound.current?.unloadAsync().catch(() => {})
    }
  }, [])

  // Spin animation when idle
  useEffect(() => {
    let animation: Animated.CompositeAnimation
    if (phase === 'idle') {
      spinAnim.setValue(0)
      animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 4000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
      animation.start()
    } else {
      spinAnim.stopAnimation()
    }
    return () => { if (animation) animation.stop() }
  }, [phase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
    
    // 🟢 Chain the fetches together
    async function loadData() {
      const colData = await fetchCollection()
      if (colData) {
        fetchDecoys(colData)
      }
    }
    loadData()
  }, [id])

  // Video progress tracking
  useEffect(() => {
    if (videoVisible) {
      progressInterval.current = setInterval(() => {
        const current = player.currentTime ?? 0
        const dur = player.duration ?? 0
        
        if (dur > 0) { 
          setProgress(current / dur)
          setDuration(dur)
          
          // 🟢 ADD THIS: If the video reaches the very end, pause the UI
          // We use 0.99 (99%) because sometimes the interval fires right before the exact final millisecond
          if (current / dur >= 0.99 && isPlaying) {
            setIsPlaying(false)
          }
        }
      }, 300)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
      setProgress(0)
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [videoVisible, isPlaying]) // 🟢 Note: add isPlaying to the dependency array here so the state doesn't get stale

  // 🟢 THE SPATIAL HAPTIC LISTENER
  useEffect(() => {
    if (phase !== 'rolling') return;

    let lastTriggeredTile = -1;
    let lastHapticTime = 0;

    const listener = scrollX.addListener(({ value }) => {
      const currentPos = Math.abs(value);
      const currentTile = Math.floor((currentPos + (TILE_STEP / 2)) / TILE_STEP);

      if (currentTile > lastTriggeredTile) {
        lastTriggeredTile = currentTile;
        const now = Date.now();

        // HAPTIC SPEED LIMITER (Max ~12 vibrations per second)
        // Protects the UI thread from freezing while still feeling like a continuous rumble
        if (now - lastHapticTime > 80) {
          lastHapticTime = now;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
    });

    return () => scrollX.removeListener(listener);
  }, [phase, scrollX]);

  async function fetchCollection() {
    const { data } = await supabase
      .from('collection')
      // 🟢 Added mystery_title and mystery_thumbnail_url to the select
      .select('id, name, description, cover_image_url, mystery_title, mystery_thumbnail_url, videos(count)')
      .eq('id', id).single()
      
    if (data) {
      setCollection(data as unknown as Collection)
      return data as unknown as Collection // 🟢 Return it so fetchDecoys can use it
    }
    return null
  }

  async function fetchDecoys(currentCollection: Collection) {
    const { data } = await supabase
      .from('videos')
      .select('id, title, thumbnail_url, rarity_tiers(name, color_hex, sort_order)')
      .eq('collection_id', id)
      .eq('is_active', true)
      .limit(30)

    if (data) {
      const fetchedVideos = data as unknown as Video[]
      
      // 🟢 1. Hide all the real Contraband videos from the wheel
      const standardVideos = fetchedVideos.filter(
        v => v.rarity_tiers?.name.toLowerCase() !== 'contraband'
      )
      
      // 🟢 2. Generate the custom dummy tile and put it in the list
      const dynamicDummy = getMysteryTile(currentCollection);
      const displayVideos = [...standardVideos, dynamicDummy]

      // 🟢 3. Sort them exactly as before
      const sortedVideos = displayVideos.sort((a, b) => {
        const orderA = a.rarity_tiers?.sort_order ?? 999
        const orderB = b.rarity_tiers?.sort_order ?? 999
        return orderA - orderB
      })

      setDecoys(sortedVideos)
      const filledStrip = Array.from({ length: TILE_COUNT }).map((_, index) =>
        sortedVideos[index % sortedVideos.length]
      )
      setPaddedTiles(filledStrip)
    }
  }

  async function handleOpen() {
    if (phase !== 'idle' || !userId || !soundsReady) return

    if (openingSound.current) {
      await openingSound.current.setPositionAsync(0)
      openingSound.current.playAsync().catch(() => {})
    }

    Animated.parallel([
      Animated.timing(caseOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(caseScale, { toValue: 1.15, duration: 150, useNativeDriver: true }),
        Animated.timing(caseScale, { toValue: 0, duration: 350, easing: Easing.in(Easing.back(2)), useNativeDriver: true })
      ])
    ]).start()

    const shuffledDecoys = [...decoys]
    for (let i = shuffledDecoys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDecoys[i], shuffledDecoys[j]] = [shuffledDecoys[j], shuffledDecoys[i]]
    }

    const initialStrip = Array.from({ length: TILE_COUNT }).map((_, index) =>
      shuffledDecoys[index % shuffledDecoys.length]
    )

    try {
      const dropPromise = openCase(id, userId)
      const delayPromise = new Promise(resolve => setTimeout(resolve, 1640))
      const [drop] = await Promise.all([dropPromise, delayPromise])

      setPaddedTiles(initialStrip)
      setPhase('rolling')
      scrollX.setValue(0)
      revealAnim.setValue(0)

      const minTiles = 45
      const maxTiles = 60
      const tilesToScroll = Math.floor(Math.random() * (maxTiles - minTiles + 1)) + minTiles
      const winningIndex = tilesToScroll + 4

      const finalStrip = [...initialStrip]
      
      // 🟢 THE ILLUSION: Put the fake tile on the wheel if they won a Contraband
      if (drop.rarity.name.toLowerCase() === 'contraband') {
        finalStrip[winningIndex] = getMysteryTile(collection);
      } else {
        finalStrip[winningIndex] = {
          ...drop,
          rarity_tiers: drop.rarity
        } as unknown as Video
      }

      setPaddedTiles(finalStrip)

      const rollDuration = 7000
      const randomOffset = (Math.random() * 60) - 30
      const finalScroll = (tilesToScroll * TILE_STEP) + randomOffset   

      setTimeout(() => {
        Animated.timing(scrollX, {
          toValue: -finalScroll,
          duration: rollDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(async () => {

          if (revealSound.current) {
            await revealSound.current.setPositionAsync(0)
            revealSound.current.playAsync().catch(() => {})
          }

          setResult(drop)
          setPhase('reveal')

          Animated.parallel([
            Animated.timing(caseOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.spring(revealAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
          ]).start()
        })
      }, 150)

    } catch {
      Alert.alert('Error', 'Something went wrong. Try again.')
      setPhase('idle')
      scrollX.setValue(0)
      Animated.timing(caseOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
      Animated.spring(caseScale, { toValue: 1, useNativeDriver: true }).start()
    }
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
    caseScale.setValue(1)
    revealAnim.setValue(0)
  }

  function handleSeek(e: any) {
    if (trackWidth === 0 || duration === 0) return;
    
    // Get the exact X coordinate of the user's finger on the track
    const touchX = e.nativeEvent.locationX;
    
    // Clamp the percentage between 0 and 1 so it doesn't break if they drag outside the lines
    const percentage = Math.max(0, Math.min(1, touchX / trackWidth));
    
    // Command the expo-video player to jump to the new time
    player.currentTime = percentage * duration;
    
    // Update the UI instantly so it feels responsive
    setProgress(percentage);
  }

  function togglePlayPause() {
    if (isPlaying) { 
      player.pause(); 
      setIsPlaying(false);
    } else { 
      // 🟢 ADD THIS: If they are at the end of the video, rewind back to 0 before playing
      if (progress >= 0.99) {
        player.currentTime = 0;
      }
      player.play(); 
      setIsPlaying(true);
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const revealTranslateY = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] })
  const revealOpacity = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.pressLabel}>Press to Open</Text>
      <Text style={styles.subLabel}>
        Open <Text style={styles.subLabelBold}>{collection?.name}</Text> videos
      </Text>

      {phase === 'idle' ? (
        <>
          <Animated.View style={[styles.caseIconWrapper, {
            opacity: caseOpacity,
            transform: [{ rotate: spin }, { scale: caseScale }]
          }]}>
            <TouchableOpacity onPress={handleOpen} activeOpacity={0.85} disabled={!soundsReady}>
              <Image
                source={require('../../../assets/smiley.png')}
                style={[styles.caseIcon, { opacity: soundsReady ? 1 : 0.4 }]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.videoGrid}>
            {decoys.slice(0, 8).map((v, i) => (
              <View key={i} style={styles.gridThumbWrapper}>
                <Image
                  source={{ uri: v.thumbnail_url }}
                  style={styles.gridThumb}
                  resizeMode="cover"
                />
                <View style={[styles.gridRarityBar, { backgroundColor: v.rarity_tiers?.color_hex ?? '#6496C8' }]} />
                
                {/* 🟢 Update this Text component: */}
                <Text 
                  style={styles.gridThumbLabel} 
                  numberOfLines={2}               // Allows it to drop to the next line
                  adjustsFontSizeToFit={true}     // Automatically shrinks the text if it's too long
                  minimumFontScale={0.7}          // Prevents it from shrinking so small it becomes unreadable
                >
                  {v.title}
                </Text>

              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.caseContainer}>
          <View style={styles.stripClip}>
            <Animated.View
              collapsable={false}
              style={[
                styles.strip,
                {
                  width: TILE_COUNT * TILE_STEP,
                  transform: [{ translateX: Animated.add(new Animated.Value(stripInitialOffset), scrollX) }]
                }
              ]}
            >
              {paddedTiles.map((v, i) => (
                <View key={i} style={[styles.tile, { flexShrink: 0 }]}>
                  <Image
                    source={{ uri: v?.thumbnail_url }}
                    style={styles.rollThumb}
                    resizeMode="cover"
                  />
                  <View style={[styles.rollRarityBar, { backgroundColor: v?.rarity_tiers?.color_hex ?? '#333' }]} />
                </View>
              ))}
            </Animated.View>
          </View>

          <View style={styles.fadeLeft} pointerEvents="none" />
          <View style={styles.fadeRight} pointerEvents="none" />
          <View style={styles.indicatorTop} pointerEvents="none" />
          <View style={styles.indicatorBottom} pointerEvents="none" />
        </View>
      )}

      {phase === 'reveal' && result && (
        <Animated.View style={[styles.revealCard, {
          opacity: revealOpacity,
          transform: [{ translateY: revealTranslateY }],
          borderColor: result.rarity.color_hex,
        }]}>
          <Image
            source={{ uri: result.thumbnail_url }}
            style={styles.revealThumb}
            resizeMode="cover"
          />
          <View style={styles.revealInfo}>
            <Text style={[styles.revealRarity, { color: result.rarity.color_hex }]}>
              {result.rarity.name.toUpperCase()}
            </Text>
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

      <Modal visible={videoVisible} transparent animationType="none" onRequestClose={handleCloseVideo}>
        <View style={styles.modalBg}>
          <Animated.View style={[styles.videoCard, { transform: [{ scale: videoScale }], opacity: videoOpacity }]}>
            <TouchableOpacity activeOpacity={1} onPress={togglePlayPause} style={styles.videoTouch}>
              <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
              {!isPlaying && (
                <View style={styles.pauseOverlay}>
                  <Text style={styles.pauseIcon}>▐▐</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.videoMeta}>
              <Text style={styles.videoTitle}>{result?.title}</Text>
              <Text style={[styles.videoRarity, { color: result?.rarity.color_hex }]}>
                {result?.rarity.name.toUpperCase()}
              </Text>
            </View>

            <View style={styles.progressRow}>
              <Text style={styles.progressTime}>{formatTime(progress * duration)}</Text>
              <View 
                style={styles.progressTrack}
                onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onResponderGrant={handleSeek} // Triggers when they first tap
                onResponderMove={handleSeek}  // Triggers when they drag/scrub
                hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }} // 🟢 Makes the thin 3px bar much easier to tap!
              >
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${progress * 100}%`, backgroundColor: result?.rarity.color_hex }
                  ]} 
                  pointerEvents="none" // 🟢 IMPORTANT: This stops the inner fill bar from stealing the touch event and breaking the math!
                />
              </View>
              <Text style={styles.progressTime}>{formatTime(duration)}</Text>
            </View>

            <TouchableOpacity style={styles.videoClose} onPress={handleCloseVideo}>
              <Text style={styles.videoCloseText}>✕</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 56 },
  backBtn: { paddingHorizontal: 20, marginBottom: 40 },
  backText: { color: '#888', fontSize: 14 },
  pressLabel: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subLabel: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', marginTop: 4, marginBottom: 0 },
  subLabelBold: { color: '#fff', fontWeight: '600' },
  caseIconWrapper: { alignSelf: 'center', width: 231, height: 231, marginTop: 40, marginBottom: 40, zIndex: 20 },
  caseIcon: { width: '100%', height: '100%' },
  caseContainer: { width: '100%', height: 140, backgroundColor: '#141414', borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center', marginVertical: 40, overflow: 'hidden' },
  stripClip: { width: '100%', height: 100, justifyContent: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center', position: 'absolute', width: TILE_COUNT * TILE_STEP },
  tile: { width: TILE_WIDTH, marginHorizontal: TILE_GAP / 2 },
  rollThumb: { width: TILE_WIDTH, height: 80, borderRadius: 4, backgroundColor: '#1a1a1a' },
  rollRarityBar: { width: TILE_WIDTH, height: 4, marginTop: -4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  fadeLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, backgroundColor: 'rgba(15,15,15,0.7)' },
  fadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, backgroundColor: 'rgba(15,15,15,0.7)' },
  indicatorTop: { position: 'absolute', top: 0, left: '50%', marginLeft: -12, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderTopWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#e8a020', zIndex: 10 },
  indicatorBottom: { position: 'absolute', bottom: 0, left: '50%', marginLeft: -12, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#e8a020', zIndex: 10 },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 32, gap: 29, justifyContent: 'center', marginTop: 20 },
  gridThumbWrapper: { width: 60 },
  gridThumb: { width: 60, height: 70, borderRadius: 4, backgroundColor: '#1a1a1a' },
  gridRarityBar: { width: 60, height: 5, marginTop: -5, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  gridThumbLabel: { color: '#fff', fontSize: 9, marginTop: 6, textAlign: 'left', fontWeight: 'bold' },
  revealCard: { position: 'absolute', bottom: 80, left: 16, right: 16, backgroundColor: '#1a1a1a', borderRadius: 16, borderWidth: 1.5, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  revealThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#1a1a1a' },
  revealInfo: { flex: 1 },
  revealRarity: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  revealTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  revealButtons: { flexDirection: 'row', gap: 8 },
  playBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  playBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  closeBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#444' },
  closeBtnText: { color: '#fff', fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  videoCard: { width: SCREEN_WIDTH - 32, borderRadius: 20, backgroundColor: '#111', overflow: 'hidden' },
  videoTouch: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000' },
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