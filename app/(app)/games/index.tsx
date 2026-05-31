import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function GamesScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>Arcade</Text>
      <Text style={styles.subTitle}>Play games to earn Bits.</Text>

      <View style={styles.grid}>
        <TouchableOpacity 
          style={styles.gameCard} 
          activeOpacity={0.8}
          // 🟢 Updated path for the new folder structure
          onPress={() => router.push('/games/wordle')}
        >
          <Ionicons name="lock-open-outline" size={40} color="#538D4E" style={styles.gameIcon} />
          <View style={styles.gameInfo}>
            <Text style={styles.gameTitle}>Decrypt</Text>
            <Text style={styles.gameDesc}>Crack the 5-letter password. The faster you solve it, the more Bits you earn.</Text>
          </View>
        </TouchableOpacity>

        {/* 🟢 NEW: BitFlip Game Card */}
        <TouchableOpacity style={styles.gameCard} onPress={() => router.push('/games/bitflip')}>
          <Ionicons name="hardware-chip-outline" size={40} color="#FF4A58" style={styles.gameIcon} />
          <View style={styles.gameInfo}>
            <Text style={styles.gameTitle}>BitFlip</Text>
            <Text style={styles.gameDesc}>High stakes. Binary choices. Double your wager.</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // 🟢 Matched background color and top padding to Shop
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 16 }, 
  
  // 🟢 Removed the massive paddingTop: 60, just kept the horizontal padding
  content: { paddingHorizontal: 20 }, 
  
  // 🟢 Matched font weights and spacing to Shop
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 4 }, 
  subTitle: { fontSize: 14, color: '#888', marginBottom: 24 }, 
  
  grid: { gap: 16 },
  gameCard: { flexDirection: 'row', backgroundColor: '#111', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#222' }, // Matched card colors to Shop packs
  gameIcon: { marginRight: 16 },
  gameInfo: { flex: 1 },
  gameTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  gameDesc: { color: '#888', fontSize: 12, lineHeight: 16 }
});