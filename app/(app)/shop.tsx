import { useState, useCallback } from 'react'
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator 
} from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Collection } from '../../types'

type ShopCollection = Collection & { price: number }

// We keep this to style the pack prices!
function getBitsStyle(amount: number) {
  if (amount >= 100000) return { color: '#FFBB23', icon: require('../../assets/bits/tier06.png') }
  if (amount >= 10000) return { color: '#FF4A58', icon: require('../../assets/bits/tier05.png') }
  if (amount >= 5000) return { color: '#4877FF', icon: require('../../assets/bits/tier04.png') }
  if (amount >= 1000) return { color: '#01F7D9', icon: require('../../assets/bits/tier03.png') }
  if (amount >= 100) return { color: '#BD63FF', icon: require('../../assets/bits/tier02.png') }
  return { color: '#A1A1A1', icon: require('../../assets/bits/tier01.png') }
}

export default function ShopScreen() {
  const router = useRouter()
  const [collections, setCollections] = useState<ShopCollection[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchShopData()
    }, [])
  )

  async function fetchShopData() {
    setLoading(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('balance')
        .eq('id', user.id)
        .single()
      
      if (userData) setBalance(userData.balance || 0)
    }

    const { data: colData, error } = await supabase
      .from('collection')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (colData && !error) {
      setCollections(colData as ShopCollection[])
    }
    
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      {/* 🟢 HEADER REMOVED - Handled globally now! */}

      <Text style={styles.title}>Shop</Text>
      <Text style={styles.subtitle}>Spend your Bits to acquire new packs.</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#e8a020" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.grid}>
          {collections.map((pack) => {
            const packPrice = pack.price || 500
            const canAfford = balance >= packPrice
            
            const packBitsStyle = getBitsStyle(packPrice)
            
            return (
              <TouchableOpacity 
                key={pack.id} 
                style={[styles.packCard, !canAfford && { opacity: 0.5 }]} 
                activeOpacity={0.8}
                onPress={() => router.push(`/packs/${pack.id}`)}
              >
                <View style={styles.imageContainer}>
                  {pack.cover_image_url ? (
                    <Image source={{ uri: pack.cover_image_url }} style={styles.coverImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.coverImage, { backgroundColor: '#222' }]} />
                  )}
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{pack.type === 'card' ? 'CARDS' : 'TAPES'}</Text>
                  </View>
                </View>

                <View style={styles.packInfo}>
                  <View>
                    <Text style={styles.packName} numberOfLines={1}>{pack.name}</Text>
                    <Text style={styles.packDesc} numberOfLines={2}>
                      {pack.description || 'A mysterious collection.'}
                    </Text>
                  </View>
                  
                  <View style={styles.priceRow}>
                    <Image source={packBitsStyle.icon} style={styles.packBitsIcon} contentFit="contain" />
                    <Text style={[styles.priceText, { color: packBitsStyle.color }]}>
                      {packPrice.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 16 }, // Adjusted padding for global header
  
  title: { fontSize: 32, fontWeight: '800', color: '#fff', paddingHorizontal: 20, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', paddingHorizontal: 20, marginBottom: 24 },

  scrollArea: { flex: 1 },
  grid: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  
  packCard: { 
    backgroundColor: '#111', 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#222',
    overflow: 'hidden',
    flexDirection: 'row',
    height: 140
  },
  imageContainer: {
    width: 140,
    height: '100%',
    backgroundColor: '#1a1a1a'
  },
  coverImage: {
    width: '100%',
    height: '100%'
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444'
  },
  typeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1
  },
  
  packInfo: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between'
  },
  packName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800'
  },
  packDesc: {
    color: '#888',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4
  },
  
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6
  },
  packBitsIcon: {
    width: 14,
    height: 14
  },
  priceText: {
    fontWeight: '800',
    fontSize: 14
  }
})