import { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert, DeviceEventEmitter } from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { supabase } from '../../lib/supabase'
import Slider from '@react-native-community/slider'
import FigmaCard from '../../components/card'

type InventoryItem = {
  inventory_id: string;
  item_id: string;
  type: 'card' | 'video';
  title: string;
  thumbnail_url: string;
  media_url: string;
  quantity: number;
  rarity: { name: string; color_hex: string; sell_value: number };
}

type FilterType = 'all' | 'cards' | 'tapes'

function getBitsStyle(amount: number) {
  if (amount >= 100000) return { color: '#FFBB23', icon: require('../../assets/bits/tier06.png') }
  if (amount >= 10000) return { color: '#FF4A58', icon: require('../../assets/bits/tier05.png') }
  if (amount >= 5000) return { color: '#4877FF', icon: require('../../assets/bits/tier04.png') }
  if (amount >= 1000) return { color: '#01F7D9', icon: require('../../assets/bits/tier03.png') }
  if (amount >= 100) return { color: '#BD63FF', icon: require('../../assets/bits/tier02.png') }
  return { color: '#A1A1A1', icon: require('../../assets/bits/tier01.png') }
}

export default function VaultScreen() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>('')
  
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [isSelling, setIsSelling] = useState(false)
  const [isViewingFullscreen, setIsViewingFullscreen] = useState(false)

  const [sellQuantity, setSellQuantity] = useState(1)

  const [isZoomedCard, setIsZoomedCard] = useState(false)
  const lastTapRef = useRef<number>(0)

  function handleCardTap() {
    const now = Date.now()
    const DOUBLE_PRESS_DELAY = 300 // 300ms window for a double tap
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      setIsZoomedCard(true)
    }
    lastTapRef.current = now
  }

  // Initialize the player. It safely defaults to an empty string if nothing is selected.
  const player = useVideoPlayer(selectedItem?.media_url ?? '', (p) => { p.loop = false })

  // --- PLAYER LOGIC ---
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [trackWidth, setTrackWidth] = useState(0)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isViewingFullscreen && selectedItem?.type === 'video') {
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
  }, [isViewingFullscreen, isPlaying, selectedItem])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  function handleSeek(e: any) {
    if (trackWidth === 0 || duration === 0) return;
    const touchX = e.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, touchX / trackWidth));
    player.currentTime = percentage * duration;
    setProgress(percentage);
  }

  function togglePlayPause() {
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

  useFocusEffect(
    useCallback(() => {
      fetchInventory()
    }, [])
  )

  async function fetchInventory() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data, error } = await supabase
      .from('user_inventory')
      .select(`
        id, quantity, video_id, card_id,
        videos ( id, title, thumbnail_url, cdn_url, rarity_tiers ( name, color_hex, sell_value ) ),
        cards ( id, title, thumbnail_url, image_url, rarity_tiers ( name, color_hex, sell_value ) )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error("Inventory fetch error:", error)
      setLoading(false)
      return
    }

    if (data) {
      const formattedItems: InventoryItem[] = data.map((row: any) => {
        const isCard = !!row.cards;
        const itemData = isCard ? row.cards : row.videos;
        
        return {
          inventory_id: row.id,
          item_id: itemData.id,
          type: isCard ? 'card' : 'video',
          title: itemData.title,
          thumbnail_url: itemData.thumbnail_url,
          media_url: isCard ? itemData.image_url : itemData.cdn_url,
          quantity: row.quantity,
          rarity: itemData.rarity_tiers
        }
      })
      setItems(formattedItems)
    }
    setLoading(false)
  }

  async function handleSellItem() {
    if (!selectedItem || isSelling) return
    setIsSelling(true)

    const { data, error } = await supabase.functions.invoke('sell_item', {
      body: { 
        user_id: userId, 
        item_id: selectedItem.item_id, 
        item_type: selectedItem.type,
        sell_amount: sellQuantity // 🟢 NEW: Tell the backend how many to sell
      }
    })

    if (error || !data?.success) {
      Alert.alert("Error", "Could not sell item. Please try again.")
      setIsSelling(false)
      return
    }

    // 🟢 NEW: Tell the global header to update instantly!
    DeviceEventEmitter.emit('balanceUpdated', data.new_balance)
    
    setItems(prevItems => 
      prevItems.map(item => 
        item.inventory_id === selectedItem.inventory_id 
          ? { ...item, quantity: data.remaining_quantity } 
          : item
      ).filter(item => item.quantity > 0)
    )

    if (data.remaining_quantity === 0) {
      closeEverything()
    } else {
      setSelectedItem({ ...selectedItem, quantity: data.remaining_quantity })
    }
    
    setIsSelling(false)
  }

  // 🟢 NEW: A single function to safely shut down the player and close all states
  function closeEverything() {
    if (selectedItem?.type === 'video') player.pause();
    setIsViewingFullscreen(false);
    setSelectedItem(null);
    setIsPlaying(false); 
    setProgress(0);      
    setSellQuantity(1); 
    setIsZoomedCard(false); // 🟢 Reset card zoom state
  }

  const displayedItems = items.filter(item => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'cards' && item.type === 'card') return true;
    if (activeFilter === 'tapes' && item.type === 'video') return true;
    return false;
  });

  const baseValue = selectedItem?.rarity?.sell_value || 0;
  const sellValue = baseValue * sellQuantity; // 🟢 Multiply by the slider's value
  const sellBitsStyle = getBitsStyle(sellValue);

  return (
    <View style={styles.container}>
      
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Vault</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeFilter === 'all' && styles.activeTab]} onPress={() => setActiveFilter('all')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeFilter === 'all' && styles.activeTabText]}>ALL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeFilter === 'cards' && styles.activeTab]} onPress={() => setActiveFilter('cards')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeFilter === 'cards' && styles.activeTabText]}>CARDS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeFilter === 'tapes' && styles.activeTab]} onPress={() => setActiveFilter('tapes')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeFilter === 'tapes' && styles.activeTabText]}>TAPES</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#e8a020" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.grid}>
          {displayedItems.length === 0 ? (
            <Text style={styles.emptyText}>Nothing here yet.</Text>
          ) : (
            displayedItems.map((item) => (
              <TouchableOpacity 
                key={item.inventory_id} 
                style={styles.itemWrapper} 
                onPress={() => {
                  setSelectedItem(item);
                  setSellQuantity(1); // 🟢 Reset slider when opening a new item
                }} 
                activeOpacity={0.7}
              >
                <Image source={{ uri: item.thumbnail_url }} style={styles.itemThumb} contentFit="cover" />
                <View style={[styles.itemRarityBar, { backgroundColor: item.rarity.color_hex }]} />
                <View style={styles.itemMetaRow}>
                  <Text style={styles.itemName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.title}</Text>
                  <View style={styles.quantityPill}>
                    <Text style={styles.quantityText}>x{item.quantity}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* 🟢 THE UNIFIED MODAL */}
      {/* We use ONE modal. If isViewingFullscreen is true, it shows the media. If false, it shows the pop-up card! */}
      <Modal visible={!!selectedItem} transparent animationType="fade" onRequestClose={closeEverything}>
        
        {isViewingFullscreen ? (
          // --- FULLSCREEN VIEWER STATE ---
          <View style={styles.fullscreenContainer}>
            {selectedItem?.type === 'card' ? (
              <FigmaCard 
                title={selectedItem?.title || ''}
                mediaUrl={selectedItem?.media_url || ''}
                rarityName={selectedItem?.rarity?.name || ''}
                rarityColor={selectedItem?.rarity?.color_hex || '#FFFFFF'}
                onClose={() => setIsViewingFullscreen(false)} 
              />
            ) : (
              // 🟢 THE TAPE PLAYER LAYOUT 
              <View style={styles.videoCard}>
                <TouchableOpacity activeOpacity={1} onPress={togglePlayPause} style={styles.videoTouch}>
                  <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
                  {!isPlaying && (
                    <View style={styles.pauseOverlay}>
                      <Text style={styles.pauseIcon}>▐▐</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.videoMeta}>
                  <Text style={styles.videoTitle}>{selectedItem?.title}</Text>
                  <Text style={[styles.videoRarity, { color: selectedItem?.rarity?.color_hex }]}>
                    {selectedItem?.rarity?.name?.toUpperCase()}
                  </Text>
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
                    <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: selectedItem?.rarity?.color_hex }]} pointerEvents="none" />
                  </View>
                  <Text style={styles.progressTime}>{formatTime(duration)}</Text>
                </View>

                <TouchableOpacity 
                  style={styles.videoClose} 
                  onPress={() => {
                    setIsViewingFullscreen(false);
                    player.pause();
                    setIsPlaying(false); // 🟢 Reset play state
                    setProgress(0);      // 🟢 Reset progress bar
                  }}
                >
                  <Text style={styles.videoCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

        ) : (

          // --- NORMAL POP-UP CARD STATE ---
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeEverything}>
            <TouchableOpacity activeOpacity={1} style={styles.popupCard} onPress={(e) => e.stopPropagation()}>
              
              <View style={styles.popupHeader}>
                <Text style={styles.popupHeaderTitle}>ITEM DETAILS</Text>
                <TouchableOpacity onPress={closeEverything} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                  <Text style={styles.closeX}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.popupThumbWrapper}>
                <Image source={{ uri: selectedItem?.thumbnail_url }} style={styles.popupThumbImage} contentFit="cover" />
              </View>

              <View style={styles.popupInfo}>
                <Text style={styles.popupItemTitle}>{selectedItem?.title}</Text>
                <Text style={[styles.popupItemRarity, { color: selectedItem?.rarity.color_hex }]}>
                  {selectedItem?.rarity.name.toUpperCase()}
                </Text>
                <Text style={styles.popupItemQuantity}>Owned: {selectedItem?.quantity}</Text>
              </View>

              {/* 🟢 NEW: Quantity Slider (Only shows if owned > 1) */}
              {selectedItem && selectedItem.quantity > 1 && (
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.sliderLabel}>Quantity to Sell:</Text>
                    <Text style={styles.sliderValue}>{sellQuantity}</Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={selectedItem.quantity}
                    step={1}
                    value={sellQuantity}
                    onValueChange={setSellQuantity}
                    minimumTrackTintColor={sellBitsStyle.color}
                    maximumTrackTintColor="#333"
                    thumbTintColor={sellBitsStyle.color}
                  />
                </View>
              )}

              <View style={styles.popupActions}>
                <TouchableOpacity 
                  style={styles.viewBtn} 
                  activeOpacity={0.7} 
                  onPress={() => { 
                    setIsViewingFullscreen(true);
                    if (selectedItem?.type === 'video' && selectedItem.media_url) {
                      player.replaceAsync(selectedItem.media_url);
                      setIsPlaying(true);
                      player.play(); 
                    }
                  }}
                >
                  <Text style={styles.viewBtnText}>View</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[ styles.sellBtn, { borderColor: sellBitsStyle.color }, isSelling && { opacity: 0.5 } ]} 
                  onPress={handleSellItem}
                  disabled={isSelling}
                  activeOpacity={0.7}
                >
                  {isSelling ? (
                    <Text style={styles.sellBtnText}>Selling...</Text>
                  ) : (
                    <View style={styles.sellBtnInner}>
                      <Text style={[styles.sellBtnText, { color: sellBitsStyle.color }]}>Sell</Text>
                      <Image source={sellBitsStyle.icon} style={styles.buttonBitsIcon} contentFit="contain" />
                      <Text style={[styles.sellBtnValue, { color: sellBitsStyle.color }]}>
                        {sellValue.toLocaleString()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

            </TouchableOpacity>
          </TouchableOpacity>
        )}
      </Modal>

    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' }, 
  headerBlock: { backgroundColor: '#0F0F0F', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#0F0F0F' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3B3B3B' },
  activeTab: { backgroundColor: '#2E2E2E' },
  tabText: { color: '#888', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  activeTabText: { color: '#fff' },

  scrollArea: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, paddingTop: 24, gap: 16, paddingBottom: 40 },
  itemWrapper: { width: '30%', marginBottom: 8 },
  itemThumb: { width: '100%', aspectRatio: 1, backgroundColor: '#1a1a1a', borderWidth: 5, borderColor: '#1E1E1E' },
  itemRarityBar: { width: '100%', height: 4 },
  itemMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  itemName: { flex: 1, color: '#fff', fontSize: 11, fontWeight: '700', marginRight: 4 },
  quantityPill: { backgroundColor: '#333', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  quantityText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  emptyText: { color: '#666', textAlign: 'center', width: '100%', marginTop: 40, fontSize: 15 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  popupCard: { width: '100%', backgroundColor: '#111', borderRadius: 24, borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  popupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  popupHeaderTitle: { color: '#A0A0A0', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  closeX: { color: '#666', fontSize: 18, fontWeight: '900' },
  
  popupThumbWrapper: { width: '100%', aspectRatio: 1 },
  popupThumbImage: { width: '100%', height: '100%', backgroundColor: '#1A1A1A' },
  
  popupInfo: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, alignItems: 'flex-start' },
  popupItemTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 4 },
  popupItemRarity: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  popupItemQuantity: { color: '#A0A0A0', fontSize: 13, fontWeight: '700' },
  
  popupActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 20 },
  viewBtn: { flex: 1, backgroundColor: '#222', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  viewBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sellBtn: { flex: 1, backgroundColor: '#222', borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  sellBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buttonBitsIcon: { width: 14, height: 14 },
  sellBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sellBtnValue: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // 🟢 FULLSCREEN VIEWER STYLES
  fullscreenContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullscreenCloseBtn: { position: 'absolute', top: 60, right: 24, zIndex: 10, backgroundColor: 'rgba(30,30,30,0.8)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  fullscreenCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fullscreenMedia: { width: '100%', height: '100%' },

  // --- 🟢 NEW: Custom Tape Player Styles ---
  videoCard: { width: '90%', maxWidth: 400, borderRadius: 20, backgroundColor: '#111', overflow: 'hidden' },
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

  // --- 🟢 NEW: Slider Styles ---
  sliderContainer: { paddingHorizontal: 20, paddingBottom: 16 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sliderLabel: { color: '#A0A0A0', fontSize: 13, fontWeight: '600' },
  sliderValue: { color: '#fff', fontSize: 14, fontWeight: '800' },
  slider: { width: '100%', height: 40 },

  // --- 🟢 NEW: Figma Card Layout Styles ---
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
  figmaImageTouch: {
    position: 'absolute',
    top: 9,         
    left: 6,        
    width: 336,
    height: 470,
    borderRadius: 18,
    overflow: 'hidden',
  },
  figmaImageInner: {
    width: '100%',
    height: '100%',
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