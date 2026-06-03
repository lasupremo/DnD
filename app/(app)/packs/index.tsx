import { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import { supabase } from '../../../lib/supabase'
import { Collection } from '../../../types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const PADDING = 24
const COLUMN_GAP = 16
const ITEM_WIDTH = (SCREEN_WIDTH - (PADDING * 2) - COLUMN_GAP) / 2

export default function CollectionsScreen() {
  const router = useRouter()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchCollections()
    }, [])
  )

  async function fetchCollections() {
    setLoading(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: allPacks } = await supabase
      .from('collection')
      .select('id, name, description, cover_image_url')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    
    const { data: unlocked } = await supabase
      .from('user_unlocked_packs')
      .select('collection_id')
      .eq('user_id', user.id)
    
    const unlockedIds = unlocked?.map(u => u.collection_id) || []

    if (allPacks) {
      const myPacks = allPacks.filter(pack => unlockedIds.includes(pack.id))
      setCollections(myPacks as unknown as Collection[])
    }
    
    setLoading(false)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>Collections</Text>
      <Text style={styles.subTitle}>Select a pack to open</Text>

      {/* Grid / Empty State */}
      {loading ? (
        <ActivityIndicator size="large" color="#e8a020" style={{ marginTop: 40 }} />
      ) : collections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>You haven't unlocked any packs yet.</Text>
          <TouchableOpacity style={styles.shopBtn} onPress={() => router.push('/shop')} activeOpacity={0.8}>
            <Text style={styles.shopBtnText}>Visit the Shop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.grid}>
          {collections.map((item) => (
            <TouchableOpacity 
              key={item.id} 
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/packs/${item.id}`)}
            >
              <View style={styles.imageContainer}>
                <Image source={item.cover_image_url ? { uri: item.cover_image_url } : require('../../../assets/smiley.png')} style={styles.caseImage} contentFit="contain" />
              </View>
              <Text style={styles.caseName} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F0F0F' 
  },
  content: { 
    padding: PADDING, 
    paddingTop: 16,
    paddingBottom: 100 
  },
  headerTitle: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#fff', 
    marginBottom: 4 
  },
  subTitle: { 
    fontSize: 14, 
    color: '#888', 
    marginBottom: 32 
  },
  grid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: COLUMN_GAP, 
    justifyContent: 'flex-start' 
  },
  card: { 
    width: ITEM_WIDTH, 
    marginBottom: 24, 
    alignItems: 'center' 
  },
  imageContainer: { 
    width: ITEM_WIDTH, 
    height: ITEM_WIDTH, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 12, 
  },
  caseImage: { 
    width: '100%', 
    height: '100%' 
  },
  caseName: { 
    color: '#fff', 
    fontSize: 15, 
    fontWeight: '600', 
    textAlign: 'center' 
  },

  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#888', fontSize: 15, marginBottom: 20 },
  shopBtn: { backgroundColor: '#e8a020', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  shopBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
})