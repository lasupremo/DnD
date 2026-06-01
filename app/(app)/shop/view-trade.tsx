import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, DeviceEventEmitter } from 'react-native';
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
  // 🟢 FIXED: Now catches the fromInbox breadcrumb
  const { id, fromInbox } = useLocalSearchParams(); 
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [trade, setTrade] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🟢 NEW: Smart routing for the Close button
  const handleClose = () => {
    if (fromInbox === 'true') {
      router.push('/profile'); 
      setTimeout(() => DeviceEventEmitter.emit('openInbox'), 300); // Give it a split second, then pop the Inbox!
    } else {
      router.back(); 
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // 1. Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('users').select('username').eq('id', user.id).single();
      setCurrentUser({ ...user, username: profile?.username });
    }

    // 2. Fetch the fresh trade data
    const { data, error } = await supabase
      .from('market_listings')
      .select(`
        *,
        creator:users!creator_id(username, avatar_url),
        items:listing_items(
          id, side, quantity, item_type, card_id, video_id, 
          cards(title, image_url, rarity_tiers(color_hex)), 
          videos(title, thumbnail_url, rarity_tiers(color_hex))
        )
      `)
      .eq('id', id)
      .single();

    // 🟢 FIXED: Removed the BOUNCER! It now allows completed/cancelled trades to render as a receipt.
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
        <TouchableOpacity onPress={handleClose} style={{ marginTop: 20, padding: 12, backgroundColor: '#333', borderRadius: 8 }}>
          <Text style={{ color: '#fff' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = currentUser?.id === trade.creator_id;
  const offeredItems = trade.items?.filter((i: any) => i.side === 'offering') || [];
  const requestedItems = trade.items?.filter((i: any) => i.side === 'requesting') || [];

  const handleCancelTrade = async () => {
    Alert.alert(
      "Cancel Trade",
      "Are you sure you want to remove this trade from the global market?",
      [
        { text: "Keep it open", style: "cancel" },
        { 
          text: "Cancel Trade", 
          style: "destructive", 
          onPress: async () => {
            setIsLoading(true);

            if (trade.offered_bits > 0) {
              const { data: uData } = await supabase.from('users').select('balance').eq('id', currentUser.id).single();
              const newBalance = (uData?.balance || 0) + trade.offered_bits;
              await supabase.from('users').update({ balance: newBalance }).eq('id', currentUser.id);
              DeviceEventEmitter.emit('balanceUpdated', newBalance); 
            }

            for (const item of offeredItems) {
              const colName = item.item_type === 'card' ? 'card_id' : 'video_id';
              const itemId = item.item_type === 'card' ? item.card_id : item.video_id;
              
              const { data: invData } = await supabase.from('user_inventory')
                .select('id, quantity').eq('user_id', currentUser.id).eq(colName, itemId).single();
                
              if (invData) {
                await supabase.from('user_inventory')
                  .update({ quantity: invData.quantity + item.quantity })
                  .eq('id', invData.id);
              }
            }

            const { error } = await supabase
              .from('market_listings')
              .update({ status: 'cancelled' })
              .eq('id', trade.id);

            if (error) {
              Alert.alert("Error", error.message);
              setIsLoading(false);
            } else {
              Alert.alert("Trade Cancelled", "Your items and Bits have been safely refunded.");
              DeviceEventEmitter.emit('refreshShopFeed');
              handleClose(); 
            }
          }
        }
      ]
    );
  };

  const handleAcceptTrade = async () => {
    if (trade.requested_bits > 0) {
      const { data: bData } = await supabase.from('users').select('balance').eq('id', currentUser.id).single();
      if ((bData?.balance || 0) < trade.requested_bits) {
        Alert.alert("Insufficient Bits", "You do not have enough Bits to accept this trade.");
        return;
      }
    }

    for (const item of requestedItems) {
      const colName = item.item_type === 'card' ? 'card_id' : 'video_id';
      const itemId = item.item_type === 'card' ? item.card_id : item.video_id;

      const { data: invData } = await supabase.from('user_inventory')
        .select('quantity').eq('user_id', currentUser.id).eq(colName, itemId).single();

      if (!invData || invData.quantity < item.quantity) {
        Alert.alert("Missing Items", "You do not have the required items in your vault to accept this trade.");
        return;
      }
    }

    Alert.alert(
      "Confirm Trade",
      "Are you sure you want to hand over your items and complete this trade?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Accept Trade", 
          onPress: async () => {
            setIsLoading(true);

            try {
              const { data: bData } = await supabase.from('users').select('balance').eq('id', currentUser.id).single();
              const newBuyerBalance = (bData?.balance || 0) - trade.requested_bits + trade.offered_bits;
              await supabase.from('users').update({ balance: newBuyerBalance }).eq('id', currentUser.id);
              DeviceEventEmitter.emit('balanceUpdated', newBuyerBalance); 

              if (trade.requested_bits > 0) {
                const { data: cData } = await supabase.from('users').select('balance').eq('id', trade.creator_id).single();
                await supabase.from('users').update({ balance: (cData?.balance || 0) + trade.requested_bits }).eq('id', trade.creator_id);
              }

              for (const item of requestedItems) {
                const colName = item.item_type === 'card' ? 'card_id' : 'video_id';
                const itemId = item.item_type === 'card' ? item.card_id : item.video_id;

                const { data: bInv } = await supabase.from('user_inventory').select('id, quantity').eq('user_id', currentUser.id).eq(colName, itemId).single();
                if (bInv) {
                  const newQuantity = bInv.quantity - item.quantity;
                  if (newQuantity <= 0) {
                    await supabase.from('user_inventory').delete().eq('id', bInv.id);
                  } else {
                    await supabase.from('user_inventory').update({ quantity: newQuantity }).eq('id', bInv.id);
                  }
                }

                const { data: cInv } = await supabase.from('user_inventory').select('id, quantity').eq('user_id', trade.creator_id).eq(colName, itemId).single();
                if (cInv) {
                  await supabase.from('user_inventory').update({ quantity: cInv.quantity + item.quantity }).eq('id', cInv.id);
                } else {
                  await supabase.from('user_inventory').insert({ user_id: trade.creator_id, [colName]: itemId, quantity: item.quantity });
                }
              }

              for (const item of offeredItems) {
                const colName = item.item_type === 'card' ? 'card_id' : 'video_id';
                const itemId = item.item_type === 'card' ? item.card_id : item.video_id;

                const { data: bInv } = await supabase.from('user_inventory').select('id, quantity').eq('user_id', currentUser.id).eq(colName, itemId).single();
                if (bInv) {
                  await supabase.from('user_inventory').update({ quantity: bInv.quantity + item.quantity }).eq('id', bInv.id);
                } else {
                  await supabase.from('user_inventory').insert({ user_id: currentUser.id, [colName]: itemId, quantity: item.quantity });
                }
              }

              await supabase.from('market_listings').update({ status: 'completed' }).eq('id', trade.id);

              await supabase.from('notifications').insert({
                user_id: trade.creator_id,
                type: 'trade_accept',
                message: `@${currentUser.username} accepted your ${trade.target_user_id ? 'Direct Trade' : 'Global Trade'}!`,
                reference_id: trade.id
              });

              Alert.alert("Trade Successful!", "The items and Bits have been added to your vault.");
              DeviceEventEmitter.emit('refreshShopFeed');
              handleClose();

            } catch (err: any) {
              Alert.alert("Transaction Error", err.message || "Failed to process trade.");
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleRejectTrade = async () => {
    if (!trade) return;
    
    Alert.alert(
      "Decline Offer",
      "Are you sure you want to decline this trade? The items will be returned to the sender.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setIsLoading(true);

            try {
              if (trade.offered_bits > 0) {
                const { data: creatorData } = await supabase.from('users').select('balance').eq('id', trade.creator_id).single();
                const newBalance = (creatorData?.balance || 0) + trade.offered_bits;
                await supabase.from('users').update({ balance: newBalance }).eq('id', trade.creator_id);
              }

              for (const item of offeredItems) {
                const colName = item.item_type === 'card' ? 'card_id' : 'video_id';
                const itemId = item.item_type === 'card' ? item.card_id : item.video_id; 

                const { data: existingItem } = await supabase.from('user_inventory')
                  .select('id, quantity')
                  .eq('user_id', trade.creator_id)
                  .eq(colName, itemId) 
                  .maybeSingle(); 

                if (existingItem) {
                  await supabase.from('user_inventory').update({ quantity: existingItem.quantity + item.quantity }).eq('id', existingItem.id);
                } else {
                  await supabase.from('user_inventory').insert({
                    user_id: trade.creator_id,
                    item_type: item.item_type,
                    [colName]: itemId,
                    quantity: item.quantity
                  });
                }
              }

              const { error: updateError } = await supabase.from('market_listings').update({ status: 'cancelled' }).eq('id', trade.id);
              if (updateError) throw updateError;

              await supabase.from('notifications').insert({
                user_id: trade.creator_id,
                type: 'trade_reject',
                message: `@${currentUser.username} declined your Direct Trade.`,
                reference_id: trade.id // Keeps the reference ID so the creator can see the receipt!
              });

              DeviceEventEmitter.emit('refreshShopFeed');
              Alert.alert("Trade Declined", "The offer was rejected and items were returned to the sender.");
              handleClose();

            } catch (error: any) {
              Alert.alert("Error declining trade", error.message);
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* 🟢 FIXED: Calls the smart handleClose function */}
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade Details</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.creatorProfile}>
          {trade.creator?.avatar_url ? (
            <Image source={{ uri: trade.creator.avatar_url }} style={styles.avatarLarge} />
          ) : (
            <View style={[styles.avatarLarge, { backgroundColor: '#444' }]} />
          )}
          <Text style={styles.creatorUsername}>@{trade.creator?.username}</Text>
          
          {/* 🟢 FIXED: Dynamic badge that changes based on completion status */}
          <Text style={[
            styles.statusBadge, 
            trade.status === 'completed' && { backgroundColor: '#4877FF' },
            trade.status === 'cancelled' && { backgroundColor: '#FF4A58' }
          ]}>
            {trade.status.toUpperCase()}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>They are Offering:</Text>
          
          {trade.offered_bits > 0 && (
            <View style={styles.itemRow}>
              <Image source={getBitsStyle(trade.offered_bits).icon} style={styles.itemImage} contentFit="contain" />
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
                  <Image source={{ uri: imageUrl }} style={[styles.itemImage, { borderWidth: 1, borderColor: rarityColor || '#333' }]} />
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>They want in Return:</Text>
          
          {trade.requested_bits > 0 && (
            <View style={styles.itemRow}>
              <Image source={getBitsStyle(trade.requested_bits).icon} style={styles.itemImage} contentFit="contain" />
              <Text style={[styles.itemTitle, { color: getBitsStyle(trade.requested_bits).color }]}>
                {trade.requested_bits.toLocaleString()} Bits
              </Text>
            </View>
          )}

          {requestedItems.map((item: any) => {
            const isCard = item.item_type === 'card';
            const title = isCard ? item.cards?.title : item.videos?.title;
            const imageUrl = isCard ? item.cards?.image_url : item.videos?.thumbnail_url;
            
            const cardRarity = Array.isArray(item.cards?.rarity_tiers) ? item.cards?.rarity_tiers[0] : item.cards?.rarity_tiers;
            const videoRarity = Array.isArray(item.videos?.rarity_tiers) ? item.videos?.rarity_tiers[0] : item.videos?.rarity_tiers;
            const rarityColor = isCard ? cardRarity?.color_hex : videoRarity?.color_hex;

            return (
              <View key={item.id} style={[styles.itemRow, { borderWidth: 2, borderColor: rarityColor || '#333' }]}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={[styles.itemImage, { borderWidth: 1, borderColor: rarityColor || '#333' }]} />
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

      {/* 🟢 FIXED: Only renders the Action Footer if the trade is open! */}
      {trade.status === 'open' && (
        <View style={styles.footer}>
          {isCreator ? (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF4A58' }]} onPress={handleCancelTrade}>
              <Text style={styles.actionBtnText}>CANCEL TRADE</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionContainer}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#538D4E' }]} onPress={handleAcceptTrade}>
                <Text style={styles.actionBtnText}>ACCEPT OFFER</Text>
              </TouchableOpacity>

              {trade.target_user_id === currentUser?.id && (
                <TouchableOpacity style={[styles.actionBtn, styles.rejectTradeBtn]} onPress={handleRejectTrade}>
                  <Text style={styles.rejectTradeText}>DECLINE OFFER</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
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
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  actionContainer: { gap: 12 },
  rejectTradeBtn: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#FF4A58' },
  rejectTradeText: { color: '#FF4A58', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});