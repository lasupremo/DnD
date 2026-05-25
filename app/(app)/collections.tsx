import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Collection } from '../../types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Figma / SVG math for a 2-column grid
const PADDING = 24
const COLUMN_GAP = 16
const ITEM_WIDTH = (SCREEN_WIDTH - (PADDING * 2) - COLUMN_GAP) / 2

export default function CollectionsScreen() {
  const router = useRouter()
  const [collections, setCollections] = useState<Collection[]>([])

  useEffect(() => {
    fetchCollections()
  }, [])

  async function fetchCollections() {
    // Dynamically fetch all active collections
    const { data } = await supabase
      .from('collection')
      .select('id, name, description, cover_image_url')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    
    if (data) {
      setCollections(data as unknown as Collection[])
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.headerTitle}>Collections</Text>
      <Text style={styles.subTitle}>Select a case to open</Text>

      {/* Grid */}
      <View style={styles.grid}>
        {collections.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => router.push(`/case/${item.id}`)}
          >
            {/* Case Image Container */}
            <View style={styles.imageContainer}>
              <Image 
                // Using smiley as a fallback if the DB doesn't have a cover_image_url yet
                source={item.cover_image_url ? { uri: item.cover_image_url } : require('../../assets/smiley.png')} 
                style={styles.caseImage} 
                resizeMode="contain" 
              />
            </View>
            
            {/* Case Name */}
            <Text style={styles.caseName} numberOfLines={1}>
              {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F0F0F' // Base background from your SVG
  },
  content: { 
    padding: PADDING, 
    paddingTop: 64, 
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
    // Removed backgroundColor, borderRadius, borderWidth, borderColor, and padding
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
})