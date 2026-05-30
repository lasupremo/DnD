import { useEffect, useState, useRef } from 'react'
import { Image } from 'expo-image'
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  Dimensions, 
  Easing, 
  Alert, 
  Modal,
  ScrollView,
  ActivityIndicator 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer } from 'expo-audio'
import { supabase } from '../../../lib/supabase'
import { openCase } from '../../../lib/roll'
import { Collection, DropResult, Video } from '../../../types'
import FigmaCard from '../../../components/card'

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
      weight_percent: 0.26,     
      color_hex: '#E4AE39', 
      sort_order: 9999 
    }
  };
}

function getWeightedRandomVideo(videos: Video[]) {
  const totalWeight = videos.reduce((sum, v) => sum + (v.rarity_tiers?.weight_percent || 10), 0);
  let random = Math.random() * totalWeight;

  for (const video of videos) {
    const weight = video.rarity_tiers?.weight_percent || 10;
    if (random < weight) {
      return video;
    }
    random -= weight;
  }
  return videos[0]; 
}

function getBitsStyle(amount: number) {
  if (amount >= 100000) return { color: '#FFBB23', icon: require('../../../assets/bits/tier06.png') }
  if (amount >= 10000) return { color: '#FF4A58', icon: require('../../../assets/bits/tier05.png') }
  if (amount >= 5000) return { color: '#4877FF', icon: require('../../../assets/bits/tier04.png') }
  if (amount >= 1000) return { color: '#01F7D9', icon: require('../../../assets/bits/tier03.png') }
  if (amount >= 100) return { color: '#BD63FF', icon: require('../../../assets/bits/tier02.png') }
  return { color: '#A1A1A1', icon: require('../../../assets/bits/tier01.png') }
}

export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)

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

  const [balance, setBalance] = useState<number>(0)

  const [pityVisible, setPityVisible] = useState(false)
  const [currentPity, setCurrentPity] = useState(0)

  // 🟢 Audio Refs
  const openingSound = useAudioPlayer(require('../../../assets/opening.mp3'))
  const revealSound = useAudioPlayer(require('../../../assets/reveal.mp3'))
  const rollInitialSound = useAudioPlayer(require('../../../assets/roll-initial.mp3'))
  
  // 🟢 THE AUDIO POOL: 3 separate players for flawless overlapping ticks
  const tickSound1 = useAudioPlayer(require('../../../assets/roll-tick.mp3'))
  const tickSound2 = useAudioPlayer(require('../../../assets/roll-tick.mp3'))
  const tickSound3 = useAudioPlayer(require('../../../assets/roll-tick.mp3'))

  // 🟢 State Refs
  const tickIndex = useRef(0) // Remembers which tick sound is next in line
  const isInitialRollComplete = useRef(false)
  const rollDistance = useRef<number>(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const caseOpacity = useRef(new Animated.Value(1)).current
  const caseScale = useRef(new Animated.Value(1)).current
  const revealAnim = useRef(new Animated.Value(0)).current
  const videoScale = useRef(new Animated.Value(0.8)).current
  const videoOpacity = useRef(new Animated.Value(0)).current
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const spinAnim = useRef(new Animated.Value(0)).current

  const player = useVideoPlayer(result?.cdn_url ?? '', (p) => { p.loop = false })

  useEffect(() => {
    setSoundsReady(true)
  }, [])

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
    // Prevent state bleeding between packs
    setCollection(null)
    setDecoys([])
    setPaddedTiles([])

    async function initUserAndData() {
      setLoading(true) // 🟢 Start loading
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        // 🟢 Fetch their current Bits
        const { data: uData } = await supabase.from('users').select('balance').eq('id', user.id).single()
        if (uData) setBalance(uData.balance || 0)
      }

      const colData = await fetchCollection()
      
      if (colData) {
        // 🟢 Fetch the pity specifically for THIS user on THIS collection
        if (user) {
          const { data: pityData, error } = await supabase
            .from('user_collection_pity')
            .select('pity_count') 
            .eq('user_id', user.id)
            .eq('collection_id', id)
            .single()
          
          if (pityData && !error) {
            setCurrentPity(pityData.pity_count)
          } else {
            // If they have never opened this specific pack before, it defaults to 0!
            setCurrentPity(0)
          }
        }

        fetchDecoys(colData)
      }

      setLoading(false) // 🟢 Everything is ready, stop loading!
    }
    
    initUserAndData()
  }, [id])

  useEffect(() => {
    if (videoVisible) {
      progressInterval.current = setInterval(() => {
        const current = player.currentTime ?? 0
        const dur = player.duration ?? 0
        
        if (dur > 0) { 
          setProgress(current / dur)
          setDuration(dur)
          
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
  }, [videoVisible, isPlaying]) 

  // 🟢 THE PRO-AUDIO SPATIAL LISTENER (Audio Pooling)
  useEffect(() => {
    if (phase !== 'rolling') return;

    let lastTriggeredTile = -1;
    let lastAudioTime = 0;
    
    // Group our pool into an array so we can rotate through them
    const tickSounds = [tickSound1, tickSound2, tickSound3];

    const listener = scrollX.addListener(({ value }) => {
      const currentPos = Math.abs(value);
      const currentTile = Math.floor((currentPos + (TILE_STEP / 2)) / TILE_STEP);

      if (currentTile > lastTriggeredTile) {
        lastTriggeredTile = currentTile;
        const now = Date.now();

        // 🟢 SPEED LIMITER: Tightened to 85ms for rapid tracking without UI lag
        if (now - lastAudioTime > 85) {
          lastAudioTime = now;
          
          if (isInitialRollComplete.current) {
            // 1. Grab the next available audio player in the pool
            const currentTick = tickSounds[tickIndex.current];
            
            // 2. Play it!
            currentTick.seekTo(0);
            currentTick.play();
            
            // 3. Move the index forward for the next tile (0 -> 1 -> 2 -> 0)
            tickIndex.current = (tickIndex.current + 1) % 3;
          }
        }
      }
    });

    return () => scrollX.removeListener(listener);
  }, [phase, scrollX]);

  async function fetchCollection() {
    const { data } = await supabase
      .from('collection')
      .select('id, name, description, cover_image_url, mystery_title, mystery_thumbnail_url, type, price, videos(count)')
      .eq('id', id).single()
      
    if (data) {
      setCollection(data as unknown as Collection)
      return data as unknown as Collection 
    }
    return null
  }

  async function fetchDecoys(currentCollection: Collection) {
    const typeStr = currentCollection?.type?.toLowerCase()?.trim()
    const tableName = typeStr === 'card' ? 'cards' : 'videos'

    const { data, error } = await supabase
      .from(tableName)
      .select('id, title, thumbnail_url, rarity_tiers(id, name, color_hex, sort_order, weight_percent)')
      .eq('collection_id', id)
      .eq('is_active', true)
      .limit(100) 

    if (error) {
      console.error(`Error fetching from ${tableName}:`, error.message)
      return
    }

    if (data) {
      const fetchedItems = data as unknown as Video[]
      
      const standardItems = fetchedItems.filter(
        v => v.rarity_tiers?.name?.toLowerCase() !== 'contraband'
      )
      
      if (standardItems.length === 0) return

      const dynamicDummy = getMysteryTile(currentCollection);
      const displayItems = [...standardItems, dynamicDummy]

      const sortedItems = displayItems.sort((a, b) => {
        const orderA = a.rarity_tiers?.sort_order ?? 999
        const orderB = b.rarity_tiers?.sort_order ?? 999
        return orderA - orderB
      })

      setDecoys(sortedItems)

      const filledStrip = Array.from({ length: TILE_COUNT }).map(() =>
        getWeightedRandomVideo(displayItems)
      )
      setPaddedTiles(filledStrip)
    }
  }

  async function handleOpen() {
    if (phase !== 'idle' || !userId || !soundsReady) return

    openingSound.seekTo(0)
    openingSound.play()

    Animated.parallel([
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(caseOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
      ]),
      Animated.sequence([
        Animated.timing(caseScale, { toValue: 1.3, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(caseScale, { toValue: 0, duration: 300, easing: Easing.in(Easing.back(2)), useNativeDriver: true })
      ])
    ]).start()

    const initialStrip = Array.from({ length: TILE_COUNT }).map(() =>
      getWeightedRandomVideo(decoys)
    )

    try {
      const dropPromise = openCase(id, userId)
      
      // 🟢 Waits precisely 1.651 seconds for opening.mp3
      const delayPromise = new Promise(resolve => setTimeout(resolve, 1651))
      const [drop] = await Promise.all([dropPromise, delayPromise])

      if (drop.pity_count !== undefined) {
        setCurrentPity(drop.pity_count)
      }

      setPaddedTiles(initialStrip)
      setPhase('rolling')
      scrollX.setValue(0)
      revealAnim.setValue(0)

      // 🟢 Start initial audio and timer
      isInitialRollComplete.current = false 
      rollInitialSound.seekTo(0)
      rollInitialSound.play()

      setTimeout(() => {
        isInitialRollComplete.current = true
      }, 3578)

      const minTiles = 45
      const maxTiles = 60
      const tilesToScroll = Math.floor(Math.random() * (maxTiles - minTiles + 1)) + minTiles
      const winningIndex = tilesToScroll + 4

      const finalStrip = [...initialStrip]
      
      if (drop.rarity.name.toLowerCase() === 'contraband') {
        finalStrip[winningIndex] = getMysteryTile(collection);
      } else {
        finalStrip[winningIndex] = { ...drop, rarity_tiers: drop.rarity } as unknown as Video
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

          revealSound.seekTo(0)
          revealSound.play()

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
    if (collection?.type !== 'card') {
      setIsPlaying(true)
      player.play()
    }
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
      if (collection?.type !== 'card') {
        player.pause()
      }
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
    const touchX = e.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, touchX / trackWidth));
    player.currentTime = percentage * duration;
    setProgress(percentage);
  }

  function togglePlayPause() {
    if (collection?.type === 'card') return; 
    
    if (isPlaying) { 
      player.pause(); 
      setIsPlaying(false);
    } else { 
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

  const packPrice = collection?.price || 500;
  const packBitsStyle = getBitsStyle(packPrice);
  const canAfford = balance >= packPrice;

  // 🟢 NEW: Show a centered loading spinner if data isn't ready yet
  if (loading || !collection) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#e8a020" />
      </View>
    )
  }

  return (
    <View style={styles.container}>

      <Text style={styles.pressLabel}>Press to Open</Text>
      <Text style={styles.subLabel}>
        Open <Text style={styles.subLabelBold}>{collection?.name}</Text> pack
      </Text>

      <View style={styles.costContainer}>
        <Text style={styles.costLabel}>Cost: </Text>
        <Image source={packBitsStyle.icon} style={styles.costIcon} contentFit="contain" />
        <Text style={[
          styles.costValue, 
          { color: packBitsStyle.color },
          !canAfford && { opacity: 0.5 }
        ]}>
          {packPrice.toLocaleString()}
        </Text>
      </View>

      {phase === 'idle' ? (
        <>
          <Animated.View style={[styles.caseIconWrapper, { opacity: caseOpacity, transform: [{ rotate: spin }, { scale: caseScale }] }]}>
            <TouchableOpacity 
              onPress={handleOpen} 
              activeOpacity={0.85} 
              disabled={!soundsReady || phase !== 'idle' || balance < (collection?.price || 500)}
            >
              {collection?.cover_image_url ? (
                <Image
                  source={{ uri: collection.cover_image_url }}
                  style={[styles.caseIcon, { opacity: (soundsReady && phase === 'idle') ? 1 : 0.4, borderRadius: 999, overflow: 'hidden' }]}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.caseIcon, { backgroundColor: '#333', borderRadius: 999 }]} />
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.pityButtonWrapper}>
            <TouchableOpacity style={styles.pityButton} onPress={() => setPityVisible(true)} activeOpacity={0.7}>
              <Text style={styles.pityButtonText}>Pity Progress: {currentPity} / 50</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dropPoolLine} />
          
          <ScrollView style={styles.dropPoolScroll} contentContainerStyle={styles.videoGrid} showsVerticalScrollIndicator={false}>
            {decoys.map((v, i) => (
              <View key={i} style={styles.gridThumbWrapper}>
                <Image source={{ uri: v.thumbnail_url }} style={styles.gridThumb} contentFit="cover" transition={200} />
                <View style={[styles.gridRarityBar, { backgroundColor: v.rarity_tiers?.color_hex ?? '#6496C8' }]} />
                
                <Text 
                style={styles.gridThumbLabel} 
                numberOfLines={1} 
                adjustsFontSizeToFit={true} 
                minimumFontScale={0.4}
                >
                  {v.title}
                </Text>

              </View>
            ))}
          </ScrollView>
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
                  <Image source={{ uri: v?.thumbnail_url }} style={styles.rollThumb} contentFit="cover" />
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
        <Animated.View style={[styles.revealCard, { opacity: revealOpacity, transform: [{ translateY: revealTranslateY }], borderColor: result.rarity.color_hex }]}>
          <Image source={{ uri: result.thumbnail_url }} style={styles.revealThumb} contentFit="cover" transition={300} />
          <View style={styles.revealInfo}>
            <Text style={[styles.revealRarity, { color: result.rarity.color_hex }]}>{result.rarity.name.toUpperCase()}</Text>
            <Text style={styles.revealTitle} numberOfLines={1}>{result.title}</Text>
          </View>
          <View style={styles.revealButtons}>
            <TouchableOpacity style={[styles.playBtn, { backgroundColor: result.rarity.color_hex }]} onPress={handlePlay}>
              <Text style={styles.playBtnText}>{collection?.type === 'card' ? 'Open' : 'Play'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* 🟢 THE DUAL-LAYOUT MODAL */}
      <Modal visible={videoVisible} transparent animationType="fade" onRequestClose={handleCloseVideo}>
        <View style={[styles.modalBg, collection?.type === 'card' && { backgroundColor: 'rgba(2,2,2,0.95)' }]}>
          
          {collection?.type === 'card' ? (
            /* 🟢 THE FIGMA CARD LAYOUT via COMPONENT */
            <Animated.View style={[{ transform: [{ scale: videoScale }], opacity: videoOpacity }]}>
              <FigmaCard 
                title={result?.title || ''}
                mediaUrl={result?.cdn_url || result?.thumbnail_url || ''}
                rarityName={result?.rarity?.name || ''}
                rarityColor={result?.rarity?.color_hex || '#FFFFFF'}
                onClose={handleCloseVideo}
              />
            </Animated.View>
          ) : (
            /* 🟢 THE TAPE PLAYER LAYOUT */
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
                <Text style={[styles.videoRarity, { color: result?.rarity.color_hex }]}>{result?.rarity.name.toUpperCase()}</Text>
              </View>

              <View style={styles.progressRow}>
                <Text style={styles.progressTime}>{formatTime(progress * duration)}</Text>
                <View 
                  style={styles.progressTrack}
                  onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={handleSeek} 
                  onResponderMove={handleSeek}  
                  hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }} 
                >
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: result?.rarity.color_hex }]} pointerEvents="none" />
                </View>
                <Text style={styles.progressTime}>{formatTime(duration)}</Text>
              </View>

              <TouchableOpacity style={styles.videoClose} onPress={handleCloseVideo}>
                <Text style={styles.videoCloseText}>✕</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

        </View>
      </Modal>

      <Modal visible={pityVisible} transparent animationType="fade" onRequestClose={() => setPityVisible(false)}>
        <TouchableOpacity style={styles.pityModalBg} activeOpacity={1} onPress={() => setPityVisible(false)}>
          <View style={styles.pityCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.pityTitle}>Contraband Guarantee</Text>
            <Text style={styles.pityDesc}>Every pack you open without pulling a Contraband increases your pity. At 50 packs, your next Contraband is guaranteed.</Text>
            <View style={styles.pityProgressRow}>
              <Text style={styles.pityCountText}>{currentPity}</Text>
              <View style={styles.pityTrack}>
                <View style={[styles.pityFill, { width: `${Math.min(100, (currentPity / 50) * 100)}%`, backgroundColor: currentPity >= 35 ? '#E4AE39' : '#e8a020' }]} />
              </View>
              <Text style={styles.pityCountText}>50</Text>
            </View>
            {currentPity >= 35 && <Text style={styles.softPityWarning}>🔥 Soft Pity Active: Drop rates are highly increased!</Text>}
            <TouchableOpacity style={styles.pityCloseBtn} onPress={() => setPityVisible(false)}>
              <Text style={styles.pityCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 16 },
  backBtn: { paddingHorizontal: 20, marginBottom: 40 },
  backText: { color: '#888', fontSize: 14 },
  pressLabel: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subLabel: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', marginTop: 4, marginBottom: 0 },
  subLabelBold: { color: '#fff', fontWeight: '600' },

  costContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 6 },
  costLabel: { fontSize: 13, color: '#A0A0A0', fontWeight: '600' },
  costIcon: { width: 14, height: 14 },
  costValue: { fontSize: 14, fontWeight: '800' },

  caseIconWrapper: { alignSelf: 'center', width: 231, height: 231, marginTop: 40, marginBottom: 40, zIndex: 20 },
  caseIcon: { width: '100%', height: '100%' },
  caseContainer: { width: '100%', height: 140, backgroundColor: '#141414', borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center', marginVertical: 40, overflow: 'hidden' },
  stripClip: { width: '100%', height: 100, justifyContent: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center', position: 'absolute', width: TILE_COUNT * TILE_STEP },
  tile: { width: TILE_WIDTH, marginHorizontal: TILE_GAP / 2 },
  rollThumb: { width: TILE_WIDTH, height: 80, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: '#1a1a1a' },
  rollRarityBar: { width: TILE_WIDTH, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  fadeLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, backgroundColor: 'rgba(15,15,15,0.7)' },
  fadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, backgroundColor: 'rgba(15,15,15,0.7)' },
  indicatorTop: { position: 'absolute', top: 0, left: '50%', marginLeft: -12, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderTopWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#e8a020', zIndex: 10 },
  indicatorBottom: { position: 'absolute', bottom: 0, left: '50%', marginLeft: -12, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#e8a020', zIndex: 10 },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 32, gap: 29, justifyContent: 'center', marginTop: 20 },
  gridThumbWrapper: { width: 60 },
  gridThumb: { width: 60, height: 60, backgroundColor: '#1a1a1a' },
  gridRarityBar: { width: 60, height: 5 },
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
  dropPoolLine: { height: 1, backgroundColor: '#333', width: '85%', alignSelf: 'center', marginBottom: 0 },
  dropPoolScroll: { flex: 1, width: '100%' },
  pityButtonWrapper: { alignItems: 'center', marginBottom: 16 },
  pityButton: { backgroundColor: '#1a1a1a', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  pityButtonText: { color: '#e8a020', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  pityModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pityCard: { width: '100%', backgroundColor: '#111', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  pityTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  pityDesc: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  pityProgressRow: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12, marginBottom: 16 },
  pityCountText: { color: '#fff', fontSize: 14, fontWeight: '700', width: 24, textAlign: 'center' },
  pityTrack: { flex: 1, height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden' },
  pityFill: { height: '100%', borderRadius: 4 },
  softPityWarning: { color: '#E4AE39', fontSize: 12, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  pityCloseBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 32, backgroundColor: '#222', borderRadius: 8 },
  pityCloseText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // --- FIGMA CARD STYLES ---
  figmaCardContainer: {
    width: 348,     
    height: 528,    
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  figmaImage: {
    position: 'absolute',
    top: 9,         
    left: 6,        
    width: 336,
    height: 470,
    borderRadius: 18,
    backgroundColor: '#111',
  },
  figmaFooter: {
    position: 'absolute',
    bottom: 9,      
    left: 6,
    width: 336,
    height: 50,
    backgroundColor: '#111111',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    justifyContent: 'center',
    paddingHorizontal: 21,
  },
  figmaFooterTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  figmaFooterRarity: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  figmaCloseBtn: {
    position: 'absolute',
    top: -44,       
    left: 12,       
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  figmaCloseX: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    marginTop: -2,  
  },
})