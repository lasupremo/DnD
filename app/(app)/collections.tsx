import { useEffect, useState, useRef } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Animated, Dimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Collection } from '../../types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const ITEM_SIZE = (SCREEN_WIDTH - 48) / 2

function CollectionItem({ item, onPress }: { item: Collection, onPress: () => void }) {
  const rotation = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      })
    ).start()
  }, [])

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.85}>
      <Animated.Image
        source={{ uri: item.cover_image_url }}
        style={[styles.icon, { transform: [{ rotate }] }]}
        resizeMode="cover"
      />
      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  )
}

export default function CollectionsScreen() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function fetchCollections() {
      const { data, error } = await supabase
        .from('collection')
        .select('id, name, description, cover_image_url, videos(count)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (!error) setCollections(data as unknown as Collection[])
      setLoading(false)
    }
    fetchCollections()
  }, [])

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator color="#e8a020" />
    </View>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Cases</Text>
      <FlatList
        data={collections}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => (
          <CollectionItem
            item={item}
            onPress={() => router.push(`/(app)/case/${item.id}`)}
          />
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 16, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' },
  header: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 24 },
  row: { justifyContent: 'space-between', marginBottom: 24 },
  item: { width: ITEM_SIZE, alignItems: 'center' },
  icon: { width: ITEM_SIZE * 0.75, height: ITEM_SIZE * 0.75, borderRadius: (ITEM_SIZE * 0.75) / 2 },
  itemName: { color: '#fff', fontSize: 13, marginTop: 10, textAlign: 'center', fontWeight: '500' },
})