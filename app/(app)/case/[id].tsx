import { useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Alert, Dimensions, Modal, Image } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { supabase } from '../../../lib/supabase'
import { openCase } from '../../../lib/roll'
import { Collection, DropResult, Video } from '../../../types'
import { useAudioPlayer } from 'expo-audio'
import * as Haptics from 'expo-haptics'

type Phase = 'idle' | 'rolling' | 'reveal'

const RARITY_COLORS = ['#6496C8', '#8847FF', '#D32CE6', '#EB4B4B', '#E4AE39']
const TILE_COUNT = 70 
const TILE_WIDTH = 80
const TILE_GAP = 12
const TILE_STEP = TILE_WIDTH + TILE_GAP
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const stripInitialOffset = (SCREEN_WIDTH / 2) - (TILE_WIDTH / 2) - (TILE_GAP / 2) - (TILE_STEP * 4)
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
  
  // 🟢 ADDED: The missing state variable!
  const [paddedTiles, setPaddedTiles] = useState<Video[]>([])
  
  const [videoVisible, setVideoVisible] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  
  const tickPlayer = useAudioPlayer(require('../../../assets/CS - Case rolling tick.mp3'))
  const revealPlayer = useAudioPlayer(require('../../../assets/CS - Case result.mp3'))
  const openingPlayer = useAudioPlayer(require('../../../assets/CS - Case opening.mp3'))
  
  const lastTickTile = useRef(0)

  const scrollX = useRef(new Animated.Value(0)).current
  const caseOpacity = useRef(new Animated.Value(1)).current
  const revealAnim = useRef(new Animated.Value(0)).current
  const videoScale = useRef(new Animated.Value(0.8)).current
  const videoOpacity = useRef(new Animated.Value(0)).current
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let animation: Animated.CompositeAnimation;
    
    if (phase === 'idle') {
      spinAnim.setValue(0);
      animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 4000, 
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
    } else {
      spinAnim.stopAnimation();
    }
    
    return () => {
      if (animation) animation.stop();
    };
  }, [phase]);

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
  
  // 🟢 Listen to the physical scroll distance to play the tick and vibrate
  // 🟢 Listen to the physical scroll distance to play the tick and vibrate
  useEffect(() => {
    const listener = scrollX.addListener(({ value }) => {
      const currentTile = Math.floor(Math.abs(value) / TILE_STEP)

      // Removed the delay check! Now it ticks instantly when crossing a tile.
      if (currentTile > lastTickTile.current) {
        lastTickTile.current = currentTile
        
        tickPlayer.seekTo(0)
        tickPlayer.play()
        
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
    })

    return () => scrollX.removeListener(listener)
  }, [scrollX, tickPlayer])

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
      .select('id, title, thumbnail_url, rarity_tiers(name, color_hex, sort_order)')
      .eq('collection_id', id)
      .eq('is_active', true)
      .limit(30)
      
    if (data) { 
      const fetchedVideos = data as unknown as Video[];

      const sortedVideos = fetchedVideos.sort((a, b) => {
        const orderA = a.rarity_tiers?.sort_order ?? 999; 
        const orderB = b.rarity_tiers?.sort_order ?? 999;
        
        return orderA - orderB;
      });

      setDecoys(sortedVideos);

      const filledStrip = Array.from({ length: TILE_COUNT }).map((_, index) => {
        return sortedVideos[index % sortedVideos.length];
      });

      setPaddedTiles(filledStrip);
      setTilesReady(true);
    }
  }

  // 🔴 DELETED: The old `const paddedTiles = ...` block that was breaking TypeScript used to be right here!

  async function handleOpen() {
    if (phase !== 'idle' || !userId) return

    // 🟢 AUDIO SEQUENCE 1: Play opening sound
    openingPlayer.seekTo(0)
    openingPlayer.play()
    
    lastTickTile.current = 0

    // A true Fisher-Yates Shuffle!
    const shuffledDecoys = [...decoys];
    for (let i = shuffledDecoys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDecoys[i], shuffledDecoys[j]] = [shuffledDecoys[j], shuffledDecoys[i]];
    }
    
    const initialStrip = Array.from({ length: TILE_COUNT }).map((_, index) => {
      return shuffledDecoys[index % shuffledDecoys.length];
    });
    
    setPaddedTiles(initialStrip);
    setPhase('rolling')
    scrollX.setValue(0)
    revealAnim.setValue(0)

    Animated.timing(caseOpacity, {
      toValue: 0.25,
      duration: 300,
      useNativeDriver: true,
    }).start()

    try {
      const drop = await openCase(id, userId)

      const minTiles = 45;
      const maxTiles = 60;
      const tilesToScroll = Math.floor(Math.random() * (maxTiles - minTiles + 1)) + minTiles;
      const winningIndex = tilesToScroll + 4; 

      const finalStrip = [...initialStrip];
      finalStrip[winningIndex] = {
        ...drop,
        rarity_tiers: drop.rarity
      } as unknown as Video;
      
      setPaddedTiles(finalStrip);

      const minDuration = 4500;
      const maxDuration = 7000;
      const rollDuration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;

      const randomOffset = (Math.random() * 60) - 30; 
      const finalScroll = (tilesToScroll * TILE_STEP) + randomOffset;

      Animated.timing(scrollX, {
        toValue: -finalScroll,
        duration: rollDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        
        // 🟢 AUDIO SEQUENCE 3: Play the 5-second reveal sound!
        revealPlayer.seekTo(0)
        revealPlayer.play()

        setResult(drop)
        setPhase('reveal')

        Animated.parallel([
          Animated.timing(caseOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(revealAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
        ]).start()
      })

    } catch {
      Alert.alert('Error', 'Something went wrong. Try again.')
      setPhase('idle')
      scrollX.setValue(0)
      Animated.timing(caseOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
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
    revealAnim.setValue(0)
  }

  function togglePlayPause() {
    if (isPlaying) { player.pause(); setIsPlaying(false) }
    else { player.play(); setIsPlaying(true) }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  const revealTranslateY = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] })
  const revealOpacity = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

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

      {/* Dynamic Layout based on Phase */}
      {phase === 'idle' ? (
        <>
          {/* IDLE: Large Rotating Smiley */}
          <Animated.View style={[styles.caseIconWrapper, { transform: [{ rotate: spin }] }]}>
            <TouchableOpacity onPress={handleOpen} activeOpacity={0.85}>
              <Image source={require('../../../assets/smiley.png')} style={styles.caseIcon} resizeMode="contain" />
            </TouchableOpacity>
          </Animated.View>

          {/* IDLE: Exact Figma Video Grid */}
          <View style={styles.videoGrid}>
            {decoys.slice(0, 8).map((v, i) => (
              <View key={i} style={styles.gridThumbWrapper}>
                {/* Replaced the placeholder View with an Image component */}
                <Image 
                  source={{ uri: v.thumbnail_url }} 
                  style={styles.gridThumb} 
                  resizeMode="cover" 
                />
                <View style={[styles.gridRarityBar, { backgroundColor: v.rarity_tiers?.color_hex ?? '#6496C8' }]} />
                <Text style={styles.gridThumbLabel} numberOfLines={1}>{v.title}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          {/* ROLLING/REVEAL: CS:GO Style Horizontal Strip */}
          <View style={styles.caseContainer}>
            <View style={styles.stripClip}>
              <Animated.View 
                collapsable={false} 
                style={[
                  styles.strip, 
                  { 
                    // 🟢 THE FIX 1: Force the engine to allocate space for all 70 tiles (~6400 pixels)
                    width: TILE_COUNT * TILE_STEP, 
                    transform: [{ translateX: Animated.add(new Animated.Value(stripInitialOffset), scrollX) }] 
                  }
                ]}
              >
                {paddedTiles.map((v, i) => (
                  <View 
                    key={i} 
                    style={[styles.tile, { flexShrink: 0 }]} 
                  >
                    {/* The Thumbnail Image */}
                    <Image 
                      source={{ uri: v?.thumbnail_url }} 
                      style={styles.rollThumb} 
                      resizeMode="cover" 
                    />
                    
                    {/* The Rarity Color Bar */}
                    <View style={[styles.rollRarityBar, { backgroundColor: v?.rarity_tiers?.color_hex ?? '#333' }]} />
                  </View>
                ))}
              </Animated.View>
            </View>

            {/* Dark gradient fades on edges */}
            <View style={styles.fadeLeft} pointerEvents="none" />
            <View style={styles.fadeRight} pointerEvents="none" />

            {/* Top and Bottom Indicator Triangles */}
            <View style={styles.indicatorTop} pointerEvents="none" />
            <View style={styles.indicatorBottom} pointerEvents="none" />
          </View>
        </>
      )}

      {/* Reveal card */}
      {phase === 'reveal' && result && (
        <Animated.View style={[styles.revealCard, {
          opacity: revealOpacity,
          transform: [{ translateY: revealTranslateY }],
          borderColor: result.rarity.color_hex,
        }]}>
          {/* 🟢 THE FIX: Replaced the solid color dot with the actual thumbnail */}
          <Image 
            source={{ uri: result.thumbnail_url }} 
            style={styles.revealThumb} 
            resizeMode="cover" 
          />
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
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 56 },
  backBtn: { paddingHorizontal: 20, marginBottom: 16 },
  backText: { color: '#888', fontSize: 14 },
  pressLabel: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subLabel: { fontSize: 13, color: '#555', textAlign: 'center', marginTop: 4, marginBottom: 28 },
  subLabelBold: { color: '#fff', fontWeight: '600' },

  // --- Smiley / Case Icon ---
  caseIconWrapper: { 
    alignSelf: 'center',
    width: 231, // Exact size from your SVG
    height: 231, 
    marginVertical: 40,
    zIndex: 20, 
  },
  caseIcon: { width: '100%', height: '100%' },

  // CS:GO Case Container
  caseContainer: { 
    width: '100%', 
    height: 140, 
    backgroundColor: '#141414', 
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#2a2a2a',
    justifyContent: 'center', 
    alignItems: 'center', 
    marginVertical: 40,
    overflow: 'hidden'
  },
  stripClip: { width: '100%', height: 100, justifyContent: 'center' }, 
  strip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    position: 'absolute',
    width: TILE_COUNT * TILE_STEP 
  },
  
  tile: { width: TILE_WIDTH, marginHorizontal: TILE_GAP / 2 }, 
  
  rollThumb: { width: TILE_WIDTH, height: 80, borderRadius: 4, backgroundColor: '#1a1a1a' },
  rollRarityBar: { width: TILE_WIDTH, height: 4, marginTop: -4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  fadeLeft: { 
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, backgroundColor: 'rgba(15,15,15,0.7)' 
  },
  fadeRight: { 
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, backgroundColor: 'rgba(15,15,15,0.7)' 
  },
  indicatorTop: { 
    position: 'absolute', 
    top: 0, 
    left: '50%', 
    marginLeft: -12, // Centers the 24px wide triangle
    width: 0, 
    height: 0, 
    borderLeftWidth: 12, 
    borderRightWidth: 12, 
    borderTopWidth: 16, 
    borderLeftColor: 'transparent', 
    borderRightColor: 'transparent', 
    borderTopColor: '#e8a020', // Yellow tip pointing down
    zIndex: 10 
  },
  indicatorBottom: { 
    position: 'absolute', 
    bottom: 0, 
    left: '50%', 
    marginLeft: -12, 
    width: 0, 
    height: 0, 
    borderLeftWidth: 12, 
    borderRightWidth: 12, 
    borderBottomWidth: 16, 
    borderLeftColor: 'transparent', 
    borderRightColor: 'transparent', 
    borderBottomColor: '#e8a020', // Yellow tip pointing up
    zIndex: 10 
  },

  // Video grid
  videoGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    paddingHorizontal: 32, // Based on x="32" from SVG
    gap: 29, // Based on the 121 - 32 - 60 math from SVG
    justifyContent: 'center',
    marginTop: 20,
  },
  // Removed 'alignItems: center' so the text left-alignment works properly
  gridThumbWrapper: { width: 60 }, 
  
  // Added a dark background fallback while the image loads
  gridThumb: { width: 60, height: 70, borderRadius: 4, backgroundColor: '#1a1a1a' }, 
  
  gridRarityBar: { width: 60, height: 4, marginTop: -4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  
  // Updated text to white, bold, and left-aligned
  gridThumbLabel: { color: '#fff', fontSize: 9, marginTop: 6, textAlign: 'left', fontWeight: 'bold' },

  // Reveal card
  revealCard: { position: 'absolute', bottom: 80, left: 16, right: 16, backgroundColor: '#1a1a1a', borderRadius: 16, borderWidth: 1.5, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Swapped the dot for the thumbnail image style
  revealThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#1a1a1a' },
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