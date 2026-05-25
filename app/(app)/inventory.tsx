import { View, Text, StyleSheet } from 'react-native'

export default function InventoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Inventory</Text>
      <Text style={styles.sub}>Coming soon</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 24, fontWeight: '700', color: '#fff' },
  sub: { fontSize: 14, color: '#555', marginTop: 8 },
})