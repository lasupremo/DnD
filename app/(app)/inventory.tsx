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
import { useFocusEffect, useRouter } from 'expo-router'
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

export default function InventoryScreen() {
  const router = useRouter()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>('')
  
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSelling, setIsSelling] = useState(false)

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

    const { data: userData } = await supabase
      .from('users')
      .select('balance')
      .eq('id', user.id)
      .single()
      
    if (userData) setBalance(userData.balance || 0)

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

    setBalance(data.new_balance)
    
    setItems(prevItems => 
      prevItems.map(item => 
        item.inventory_id === selectedItem.inventory_id 
          ? { ...item, quantity: data.remaining_quantity } 
          : item
      ).filter(item => item.quantity > 0)
    )

    if (data.remaining_quantity === 0) {
      closeModal()
    } else {
      setSelectedItem({ ...selectedItem, quantity: data.remaining_quantity })
    }
    
    setIsSelling(false)
  }

  async function handleQuickSell() {
    const duplicates = items.filter(item => item.quantity > 1)
    if (duplicates.length === 0) {
      Alert.alert("Clean Vault", "You don't have any duplicate items to sell!")
      return
    }

    setIsSelling(true)
    let totalEarned = 0
    
    for (const dup of duplicates) {
      const amountToSell = dup.quantity - 1
      for (let i = 0; i < amountToSell; i++) {
        const { data } = await supabase.functions.invoke('sell_item', {
          body: { user_id: userId, item_id: dup.item_id, item_type: dup.type }
        })
        if (data?.success) totalEarned += data.sold_for
      }
    }

    Alert.alert("Success!", `You sold all duplicates and earned ${totalEarned} Bits!`)
    fetchInventory()
    setIsSelling(false)
  }

  function openItem(item: InventoryItem) {
    setSelectedItem(item)
    if (item.type === 'video') {
      setIsPlaying(true)
      player.play()
    }
  }

  function closeModal() {
    if (selectedItem?.type === 'video') {
      player.pause()
    }
    setSelectedItem(null)
    setIsPlaying(false)
  }

  return (
    <View style={styles.container}>
      {/* 🟢 HEADER REMOVED - Now handled by _layout.tsx! */}

      <Text style={styles.title}>Your Vault</Text>

      <TouchableOpacity 
        style={[styles.quickSellBtn, isSelling && { opacity: 0.5 }]} 
        onPress={handleQuickSell}
        disabled={isSelling}
      >
        <Text style={styles.quickSellText}>⚡ Quick Sell Duplicates</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#e8a020" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.grid}>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>Your vault is empty. Go open some packs!</Text>
          ) : (
            items.map((item) => (
              <TouchableOpacity 
                key={item.inventory_id} 
                style={styles.itemWrapper}
                onPress={() => openItem(item)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: item.thumbnail_url }} style={styles.itemThumb} contentFit="cover" />
                <View style={[styles.itemRarityBar, { backgroundColor: item.rarity.color_hex }]} />
                
                <View style={styles.quantityBadge}>
                  <Text style={styles.quantityText}>x{item.quantity}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={!!selectedItem} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            
            <View style={[styles.mediaContainer, { borderColor: selectedItem?.rarity.color_hex }]}>
              {selectedItem?.type === 'card' ? (
                <Image source={{ uri: selectedItem.media_url }} style={styles.mediaFrame} contentFit="contain" />
              ) : (
                <VideoView player={player} style={styles.mediaFrame} contentFit="contain" nativeControls={false} />
              )}
            </View>

            <View style={styles.modalInfo}>
              <Text style={styles.modalTitle}>{selectedItem?.title}</Text>
              <Text style={[styles.modalRarity, { color: selectedItem?.rarity.color_hex }]}>
                {selectedItem?.rarity.name.toUpperCase()}
              </Text>
              <Text style={styles.modalQuantity}>You own: {selectedItem?.quantity}</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.sellBtn, isSelling && { opacity: 0.5 }]} 
                onPress={handleSellItem}
                disabled={isSelling}
              >
                <Text style={styles.sellBtnText}>
                  {isSelling ? 'Selling...' : `Sell for 🪙 ${selectedItem?.rarity.sell_value}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={closeModal}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  // Adjusted paddingTop since the global header provides spacing
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 16 }, 
  
  title: { fontSize: 28, fontWeight: '800', color: '#fff', paddingHorizontal: 20, marginBottom: 16 },
  
  quickSellBtn: { backgroundColor: '#222', marginHorizontal: 20, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#444' },
  quickSellText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  scrollArea: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 16, paddingBottom: 40 },
  itemWrapper: { width: '30%', marginBottom: 16 },
  itemThumb: { width: '100%', aspectRatio: 1, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: '#1a1a1a' },
  itemRarityBar: { height: 6, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  
  quantityBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: '#e8a020', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: '#0F0F0F' },
  quantityText: { color: '#000', fontSize: 10, fontWeight: '900' },
  emptyText: { color: '#666', textAlign: 'center', width: '100%', marginTop: 40, fontSize: 15 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#111', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#222' },
  mediaContainer: { width: '100%', aspectRatio: 3/4, backgroundColor: '#000', borderRadius: 16, borderWidth: 2, overflow: 'hidden', marginBottom: 16 },
  mediaFrame: { width: '100%', height: '100%' },
  modalInfo: { alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  modalRarity: { fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  modalQuantity: { color: '#888', fontSize: 14 },
  
  modalActions: { flexDirection: 'row', gap: 12 },
  sellBtn: { flex: 1, backgroundColor: '#e8a020', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  sellBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
  closeBtn: { flex: 1, backgroundColor: 'transparent', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  closeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})