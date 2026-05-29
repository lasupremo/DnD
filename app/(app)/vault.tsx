import { useState, useCallback } from 'react'
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Modal,
  Alert
} from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { supabase } from '../../lib/supabase'

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

  // Initialize the player. It safely defaults to an empty string if nothing is selected.
  const player = useVideoPlayer(selectedItem?.media_url ?? '', (p) => { p.loop = false })

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
        item_type: selectedItem.type 
      }
    })

    if (error || !data?.success) {
      Alert.alert("Error", "Could not sell item. Please try again.")
      setIsSelling(false)
      return
    }
    
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
  }

  const displayedItems = items.filter(item => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'cards' && item.type === 'card') return true;
    if (activeFilter === 'tapes' && item.type === 'video') return true;
    return false;
  });

  const sellValue = selectedItem?.rarity.sell_value || 0;
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
              <TouchableOpacity key={item.inventory_id} style={styles.itemWrapper} onPress={() => setSelectedItem(item)} activeOpacity={0.7}>
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
            <TouchableOpacity 
              style={styles.fullscreenCloseBtn} 
              onPress={() => {
                setIsViewingFullscreen(false); // Only close fullscreen, go back to pop-up
                if (selectedItem?.type === 'video') player.pause();
              }}
            >
              <Text style={styles.fullscreenCloseText}>Done</Text>
            </TouchableOpacity>

            {selectedItem?.type === 'card' ? (
              <Image source={{ uri: selectedItem.media_url }} style={styles.fullscreenMedia} contentFit="contain" />
            ) : (
              <VideoView player={player} style={styles.fullscreenMedia} contentFit="contain" nativeControls={true} />
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

              <View style={styles.popupActions}>
                <TouchableOpacity 
                  style={styles.viewBtn} 
                  activeOpacity={0.7} 
                  onPress={() => { 
                    setIsViewingFullscreen(true);
                    if (selectedItem?.type === 'video') player.replay(); 
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
  fullscreenMedia: { width: '100%', height: '100%' }
})