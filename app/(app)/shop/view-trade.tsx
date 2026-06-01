import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Image } from 'expo-image';

function getBitsStyle(amount: number) {
  if (amount >= 100000) return { color: '#FFBB23', icon: require('../../../assets/bits/tier06.png') };
  if (amount >= 10000) return { color: '#FF4A58', icon: require('../../../assets/bits/tier05.png') };
  if (amount >= 5000) return { color: '#4877FF', icon: require('../../../assets/bits/tier04.png') };
  if (amount >= 1000) return { color: '#01F7D9', icon: require('../../../assets/bits/tier03.png') };
  if (amount >= 100) return { color: '#BD63FF', icon: require('../../../assets/bits/tier02.png') };
  return { color: '#A1A1A1', icon: require('../../../assets/bits/tier01.png') };
}

export default function ViewTradeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); 
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [trade, setTrade] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // 1. Get current user
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    // 2. Fetch the fresh trade data
    const { data, error } = await supabase
      .from('market_listings')
      .select(`
        *,
        creator:users(username, avatar_url),
        items:listing_items(
          id, side, quantity, item_type, 
          cards(title, image_url, rarity_tiers(color_hex)), 
          videos(title, thumbnail_url, rarity_tiers(color_hex))
        )
      `)
      .eq('id', id)
      .single();

    if (data && !error) {
      setTrade(data);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4877FF" />
      </View>
    );
  }

  if (!trade) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#fff' }}>Trade not found or already completed.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, padding: 12, backgroundColor: '#333', borderRadius: 8 }}>
          <Text style={{ color: '#fff' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = currentUser?.id === trade.creator_id;
  const offeredItems = trade.items?.filter((i: any) => i.side === 'offering') || [];
  const requestedItems = trade.items?.filter((i: any) => i.side === 'requesting') || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade Details</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Creator Info */}
        <View style={styles.creatorProfile}>
          {trade.creator?.avatar_url ? (
            <Image source={{ uri: trade.creator.avatar_url }} style={styles.avatarLarge} />
          ) : (
            <View style={[styles.avatarLarge, { backgroundColor: '#444' }]} />
          )}
          <Text style={styles.creatorUsername}>@{trade.creator?.username}</Text>
          <Text style={styles.statusBadge}>OPEN</Text>
        </View>

        {/* --- OFFERING SECTION --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>They are Offering:</Text>
          
          {trade.offered_bits > 0 && (
            <View style={styles.itemRow}>
              <Image 
                source={getBitsStyle(trade.offered_bits).icon} 
                style={styles.itemImage} 
                contentFit="contain" 
              />
              <Text style={[styles.itemTitle, { color: getBitsStyle(trade.offered_bits).color }]}>
                {trade.offered_bits.toLocaleString()} Bits
              </Text>
            </View>
          )}

          {offeredItems.map((item: any) => {
            const isCard = item.item_type === 'card';
            const title = isCard ? item.cards?.title : item.videos?.title;
            const imageUrl = isCard ? item.cards?.image_url : item.videos?.thumbnail_url;
            const rarityColor = isCard ? item.cards?.rarity_tiers?.color_hex : item.videos?.rarity_tiers?.color_hex;

            return (
              <View key={item.id} style={[styles.itemRow, { borderWidth: 2, borderColor: rarityColor || '#333' }]}>
                {imageUrl ? (
                  <Image 
                    source={{ uri: imageUrl }} 
                    style={[styles.itemImage, { borderWidth: 1, borderColor: rarityColor || '#333' }]} 
                  />
                ) : (
                  <View style={[styles.itemImage, { backgroundColor: '#333', borderWidth: 1, borderColor: rarityColor || '#333' }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{title}</Text>
                  <Text style={styles.itemType}>{isCard ? 'Card' : 'Tape'}</Text>
                </View>
                <Text style={styles.itemQuantity}>x{item.quantity}</Text>
              </View>
            );
          })}
          {trade.offered_bits === 0 && offeredItems.length === 0 && <Text style={styles.helperText}>Nothing offered.</Text>}
        </View>

        {/* --- REQUESTING SECTION --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>They want in Return:</Text>
          
          {trade.requested_bits > 0 && (
            <View style={styles.itemRow}>
              <Image 
                source={getBitsStyle(trade.requested_bits).icon} 
                style={styles.itemImage} 
                contentFit="contain" 
              />
              <Text style={[styles.itemTitle, { color: getBitsStyle(trade.requested_bits).color }]}>
                {trade.requested_bits.toLocaleString()} Bits
              </Text>
            </View>
          )}

          {requestedItems.map((item: any) => {
            const isCard = item.item_type === 'card';
            const title = isCard ? item.cards?.title : item.videos?.title;
            const imageUrl = isCard ? item.cards?.image_url : item.videos?.thumbnail_url;
            
            // 🟢 Extract the rarity color (handling potential runtime arrays)
            const cardRarity = Array.isArray(item.cards?.rarity_tiers) ? item.cards?.rarity_tiers[0] : item.cards?.rarity_tiers;
            const videoRarity = Array.isArray(item.videos?.rarity_tiers) ? item.videos?.rarity_tiers[0] : item.videos?.rarity_tiers;
            const rarityColor = isCard ? cardRarity?.color_hex : videoRarity?.color_hex;

            return (
              <View key={item.id} style={[styles.itemRow, { borderWidth: 2, borderColor: rarityColor || '#333' }]}>
                {imageUrl ? (
                  <Image 
                    source={{ uri: imageUrl }} 
                    style={[styles.itemImage, { borderWidth: 1, borderColor: rarityColor || '#333' }]} 
                  />
                ) : (
                  <View style={[styles.itemImage, { backgroundColor: '#333', borderWidth: 1, borderColor: rarityColor || '#333' }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{title}</Text>
                  <Text style={styles.itemType}>{isCard ? 'Card' : 'Tape'}</Text>
                </View>
                <Text style={styles.itemQuantity}>x{item.quantity}</Text>
              </View>
            );
          })}
          {trade.requested_bits === 0 && requestedItems.length === 0 && <Text style={styles.helperText}>Nothing requested.</Text>}
        </View>

      </ScrollView>

      {/* Action Footer */}
      <View style={styles.footer}>
        {isCreator ? (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF4A58' }]} onPress={() => alert('Cancel Logic Next!')}>
            <Text style={styles.actionBtnText}>CANCEL TRADE</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#538D4E' }]} onPress={() => alert('Accept Trade Transaction Next!')}>
            <Text style={styles.actionBtnText}>ACCEPT TRADE</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#1A1A1A' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  
  creatorProfile: { alignItems: 'center', marginBottom: 32 },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, borderWidth: 2, borderColor: '#333' },
  creatorUsername: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  statusBadge: { backgroundColor: '#538D4E', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, color: '#fff', fontSize: 10, fontWeight: 'bold', overflow: 'hidden' },
  
  section: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#222' },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 16 },
  
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#222' },
  itemImage: { width: 40, height: 40, borderRadius: 8, marginRight: 12 },
  itemTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  itemType: { color: '#666', fontSize: 12, marginTop: 2 },
  itemQuantity: { color: '#fff', fontSize: 18, fontWeight: '900' },
  helperText: { color: '#666', fontStyle: 'italic', fontSize: 12 },

  footer: { padding: 20, backgroundColor: '#1A1A1A', borderTopWidth: 1, borderTopColor: '#333' },
  actionBtn: { padding: 18, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});