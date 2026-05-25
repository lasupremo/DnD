import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, Image } from 'react-native'
import { supabase } from '../../lib/supabase'
import { DropHistory } from '../../types'

export default function HistoryScreen() {
  const [drops, setDrops] = useState<DropHistory[]>([])

  useEffect(() => {
    async function fetchHistory() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('drop_history')
        .select(`
          id, dropped_at,
          collection ( name ),
          videos ( title, thumbnail_url, rarity_tiers ( name, color_hex ) )
        `)
        .eq('user_id', user.id)
        .order('dropped_at', { ascending: false })
        .limit(50)

      if (data) setDrops(data as unknown as DropHistory[])
    }
    fetchHistory()
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Your Drops</Text>
      <FlatList
        data={drops}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderLeftColor: item.videos[0]?.rarity_tiers[0]?.color_hex ?? '#333' }]}>
            <Image source={{ uri: item.videos[0]?.thumbnail_url }} style={styles.thumb} />
            <View style={styles.info}>
              <Text style={styles.videoTitle}>{item.videos[0]?.title}</Text>
              <Text style={styles.collectionName}>{item.collection[0]?.name}</Text>
              <Text style={[styles.rarity, { color: item.videos[0]?.rarity_tiers[0]?.color_hex ?? '#fff' }]}>
                {item.videos[0]?.rarity_tiers[0]?.name}
              </Text>
            </View>
            <Text style={styles.date}>
              {new Date(item.dropped_at).toLocaleDateString()}
            </Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', paddingTop: 60, paddingHorizontal: 16 },
  header: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 3 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#2a2a2a' },
  info: { flex: 1, marginLeft: 12 },
  videoTitle: { color: '#fff', fontWeight: '600', fontSize: 14 },
  collectionName: { color: '#555', fontSize: 12, marginTop: 2 },
  rarity: { fontSize: 11, fontWeight: '700', marginTop: 4, letterSpacing: 1 },
  date: { color: '#444', fontSize: 11 },
})