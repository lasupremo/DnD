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
  ScrollView 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer } from 'expo-audio'
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
        weight_percent: 0.26,     
        color_hex: '#E4AE39', 
        // 🟢 Change this from 1 to 9999 so it is always the highest number and sorts last!
        sort_order: 9999 
      }
    };
  }

// 🟢 The Weighted Random Picker
function getWeightedRandomVideo(videos: Video[]) {
  // Add up the total weight pool
  const totalWeight = videos.reduce((sum, v) => sum + (v.rarity_tiers?.weight_percent || 10), 0);
  let random = Math.random() * totalWeight;

  // Pick an item based on where the random number landed
  for (const video of videos) {
    const weight = video.rarity_tiers?.weight_percent || 10;
    if (random < weight) {
      return video;
    }
    random -= weight;
  }
  return videos[0]; // Fallback
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

  // State for the Pity Tracker UI
  const [pityVisible, setPityVisible] = useState(false)
  const [currentPity, setCurrentPity] = useState(0)

  // Audio refs
  const openingSound = useAudioPlayer(require('../../../assets/opening.mp3'))
  const revealSound = useAudioPlayer(require('../../../assets/reveal.mp3'))

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

  // Load opening and reveal sounds
  useEffect(() => {
    setSoundsReady(true)
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
    async function initUserAndData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        // 🟢 Fetch the user's current pity count
        const { data: userData } = await supabase
          .from('users')
          .select('image_pity') // Change this to 'card_pity' if you renamed it!
          .eq('id', user.id)
          .single()
        
        if (userData) {
          setCurrentPity(userData.image_pity || 0)
        }
      }

      const colData = await fetchCollection()
      if (colData) {
        fetchDecoys(colData)
      }
    }
    
    initUserAndData()
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
      .select('id, name, description, cover_image_url, mystery_title, mystery_thumbnail_url, type, videos(count)')
      .eq('id', id).single()
      
    if (data) {
      setCollection(data as unknown as Collection)
      return data as unknown as Collection // 🟢 Return it so fetchDecoys can use it
    }
    return null
  }

  async function fetchDecoys(currentCollection: Collection) {
    // 🟢 1. Dynamically select the table based on the collection type
    const tableName = currentCollection?.type === 'card' ? 'cards' : 'videos'

    const { data } = await supabase
      .from(tableName)
      .select('id, title, thumbnail_url, rarity_tiers(id, name, color_hex, sort_order, weight_percent)')
      .eq('collection_id', id)
      .eq('is_active', true)
      .limit(30)

    if (data) {
      // (We can safely keep casting it as Video[] because Cards and Videos share the exact same UI structure here!)
      const fetchedItems = data as unknown as Video[] 

      // 2. Hide all the real Contraband items from the wheel (so they only appear when actually won)
      const standardItems = fetchedItems.filter(
        v => v.rarity_tiers?.name.toLowerCase() !== 'contraband'
      )

      if (standardItems.length === 0) return

      // 3. Shuffle the items to make the wheel look random
      for (let i = standardItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [standardItems[i], standardItems[j]] = [standardItems[j], standardItems[i]]
      }

      // 4. Fill the array up to exactly 30 items
      const filledDecoys: Video[] = []
      while (filledDecoys.length < 30) {
        filledDecoys.push(...standardItems)
      }
      const finalDecoys = filledDecoys.slice(0, 30)
      
      setDecoys(finalDecoys)
      
      // 5. Inject the Mystery Contraband tile right before the winning tile!
      const mysteryTile: Video = {
        id: 'mystery-contraband',
        title: currentCollection?.mystery_title || '★ RARE SPECIAL ITEM',
        thumbnail_url: currentCollection?.mystery_thumbnail_url || 'https://via.placeholder.com/150/FFD700/000000?text=?',
        cdn_url: '',
        rarity_tiers: { id: '0', name: 'Contraband', color_hex: '#e8a020', sort_order: 0, weight_percent: 0 }
      }
      
      const sequence = [...finalDecoys]
      sequence[28] = mysteryTile 
      
      setPaddedTiles(sequence)
    }
  }

  async function handleOpen() {
    if (phase !== 'idle' || !userId || !soundsReady) return

    openingSound.seekTo(0)
    openingSound.play()

    // 🟢 1.5 Second Tension Animation
    Animated.parallel([
      // Fade out only at the very end
      Animated.sequence([
        Animated.delay(1200), // Wait 1.2 seconds before fading
        Animated.timing(caseOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
      ]),
      // Scale up slowly to build suspense, then pop
      Animated.sequence([
        Animated.timing(caseScale, { 
          toValue: 1.3,           // Swell up larger 
          duration: 1200,         // Do it slowly over 1.2s
          easing: Easing.out(Easing.quad), 
          useNativeDriver: true 
        }),
        Animated.timing(caseScale, { 
          toValue: 0, 
          duration: 300,          // Snap to 0 in the last 0.3s
          easing: Easing.in(Easing.back(2)), 
          useNativeDriver: true 
        })
      ])
    ]).start()

    const initialStrip = Array.from({ length: TILE_COUNT }).map(() =>
      getWeightedRandomVideo(decoys)
    )

    try {
      const dropPromise = openCase(id, userId)
      const delayPromise = new Promise(resolve => setTimeout(resolve, 1640))
      const [drop] = await Promise.all([dropPromise, delayPromise])

      if (drop.pity_count !== undefined) {
        setCurrentPity(drop.pity_count)
      }

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
    if (collection?.type === 'card') return; // 🟢 Do nothing if it's an image card!
    
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

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.pressLabel}>Press to Open</Text>
      <Text style={styles.subLabel}>
        Open <Text style={styles.subLabelBold}>{collection?.name}</Text> pack
      </Text>

      {phase === 'idle' ? (
        <>

         {/* 🟢 THE SPINNING COLLECTION ICON BUTTON */}
          <Animated.View style={[styles.caseIconWrapper, {
            opacity: caseOpacity,
            transform: [{ rotate: spin }, { scale: caseScale }]
          }]}>
            <TouchableOpacity 
              onPress={handleOpen} 
              activeOpacity={0.85} 
              disabled={!soundsReady || phase !== 'idle'}
            >
              {collection?.cover_image_url ? (
                <Image
                  source={{ uri: collection.cover_image_url }}
                  style={[
                    styles.caseIcon, 
                    { 
                      opacity: (soundsReady && phase === 'idle') ? 1 : 0.4,
                      borderRadius: 999, // 🟢 Forces a perfect circular crop!
                      overflow: 'hidden'
                    }
                  ]}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                // Fallback just in case a collection is missing an image
                <View style={[styles.caseIcon, { backgroundColor: '#333', borderRadius: 999 }]} />
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* 🟢 PITY TRACKER BUTTON */}
          <View style={styles.pityButtonWrapper}>
            <TouchableOpacity 
              style={styles.pityButton} 
              onPress={() => setPityVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.pityButtonText}>Pity Progress: {currentPity} / 50</Text>
            </TouchableOpacity>
          </View>

          {/* 🟢 1. The Thin Separator Line */}
          <View style={styles.dropPoolLine} />
          
          {/* 🟢 2. The Scrollable Drop Pool */}
          <ScrollView 
            style={styles.dropPoolScroll} 
            contentContainerStyle={styles.videoGrid}
            showsVerticalScrollIndicator={false} // Hides the ugly scrollbar
          >
            {/* 🟢 3. Removed .slice(0, 8) so the entire pool is mapped! */}
            {decoys.map((v, i) => (
              <View key={i} style={styles.gridThumbWrapper}>
                <Image
                  source={{ uri: v.thumbnail_url }}
                  style={styles.gridThumb}
                  contentFit="cover"
                  transition={200}
                />
                <View style={[styles.gridRarityBar, { backgroundColor: v.rarity_tiers?.color_hex ?? '#6496C8' }]} />
                <Text 
                  style={styles.gridThumbLabel} 
                  numberOfLines={2}               
                  adjustsFontSizeToFit={true}     
                  minimumFontScale={0.7}          
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
                  <Image
                    source={{ uri: v?.thumbnail_url }}
                    style={styles.rollThumb}
                    contentFit="cover"
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
            contentFit="cover"
            transition={300}
          />
          <View style={styles.revealInfo}>
            <Text style={[styles.revealRarity, { color: result.rarity.color_hex }]}>
              {result.rarity.name.toUpperCase()}
            </Text>
            <Text style={styles.revealTitle} numberOfLines={1}>{result.title}</Text>
          </View>
          <View style={styles.revealButtons}>
            <TouchableOpacity style={[styles.playBtn, { backgroundColor: result.rarity.color_hex }]} onPress={handlePlay}>
              {/* 🟢 DYNAMIC BUTTON TEXT */}
              <Text style={styles.playBtnText}>
                {collection?.type === 'card' ? 'Open' : 'Play'}
              </Text>
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
              
              {/* 🟢 IF CARD: Show bordered image. IF TAPE: Show video player */}
              {collection?.type === 'card' ? (
                <Image 
                  source={{ uri: result?.cdn_url || result?.thumbnail_url }} 
                  style={[styles.video, { borderWidth: 4, borderColor: result?.rarity.color_hex }]} 
                  contentFit="contain" 
                />
              ) : (
                <>
                  <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
                  {!isPlaying && (
                    <View style={styles.pauseOverlay}>
                      <Text style={styles.pauseIcon}>▐▐</Text>
                    </View>
                  )}
                </>
              )}

            </TouchableOpacity>

            <View style={styles.videoMeta}>
              <Text style={styles.videoTitle}>{result?.title}</Text>
              <Text style={[styles.videoRarity, { color: result?.rarity.color_hex }]}>
                {result?.rarity.name.toUpperCase()}
              </Text>
            </View>

            {/* 🟢 HIDE PROGRESS BAR FOR CARDS */}
            {collection?.type !== 'card' && (
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
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${progress * 100}%`, backgroundColor: result?.rarity.color_hex }
                    ]} 
                    pointerEvents="none" 
                  />
                </View>
                <Text style={styles.progressTime}>{formatTime(duration)}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.videoClose} onPress={handleCloseVideo}>
              <Text style={styles.videoCloseText}>✕</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={pityVisible} transparent animationType="fade" onRequestClose={() => setPityVisible(false)}>
        <TouchableOpacity style={styles.pityModalBg} activeOpacity={1} onPress={() => setPityVisible(false)}>
          <View style={styles.pityCard} onStartShouldSetResponder={() => true}>
            
            <Text style={styles.pityTitle}>Contraband Guarantee</Text>
            <Text style={styles.pityDesc}>
              Every pack you open without pulling a Contraband increases your pity. At 50 packs, your next Contraband is guaranteed.
            </Text>

            <View style={styles.pityProgressRow}>
              <Text style={styles.pityCountText}>{currentPity}</Text>
              
              {/* The Progress Bar */}
              <View style={styles.pityTrack}>
                <View 
                  style={[
                    styles.pityFill, 
                    { 
                      width: `${Math.min(100, (currentPity / 50) * 100)}%`,
                      backgroundColor: currentPity >= 35 ? '#E4AE39' : '#e8a020' 
                    }
                  ]} 
                />
              </View>
              
              <Text style={styles.pityCountText}>50</Text>
            </View>

            {currentPity >= 35 && (
              <Text style={styles.softPityWarning}>🔥 Soft Pity Active: Drop rates are highly increased!</Text>
            )}

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
  dropPoolLine: {
    height: 1,
    backgroundColor: '#333', // A subtle, thin gray line
    width: '85%',            // Leaves a nice margin on the left and right edges
    alignSelf: 'center',
    marginBottom: 0,
  },
  dropPoolScroll: {
    flex: 1,         // Tells the scroll view to take up all the remaining screen space
    width: '100%',
  },

  // --- OPEN BUTTON STYLES ---
  openButton: { 
    flexDirection: 'row', // Aligns the icon and text horizontally
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8a020', // Or whatever your primary button color is
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 12, // Creates perfect spacing between the image and text
    marginTop: 20,
  },
  openButtonIcon: {
    width: 28,
    height: 28,
    borderRadius: 6, // Gives the mini-icon a sleek, rounded look
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)', // Optional: adds a subtle border to make it pop
  },
  openButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // --- PITY TRACKER STYLES ---
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
})