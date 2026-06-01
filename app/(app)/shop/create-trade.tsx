import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function CreateTradeScreen() {
  const router = useRouter();
  const { targetUserId, targetUsername } = useLocalSearchParams();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // --- 🛒 THE TRADE CARTS ---
  const [offeredBits, setOfferedBits] = useState('');
  const [requestedBits, setRequestedBits] = useState('');
  const [offeredItems, setOfferedItems] = useState<any[]>([]);
  const [requestedItems, setRequestedItems] = useState<any[]>([]);

  // --- 🔽 CASCADING DROPDOWN STATES ---
  const [tradeSide, setTradeSide] = useState<'offering' | 'requesting'>('offering');
  const [selectedCategory, setSelectedCategory] = useState<'card' | 'video' | null>(null);
  
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  
  const [items, setItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // 🟢 FIXED: Fetch the profile data so we have the actual username!
      const { data: profile } = await supabase.from('users').select('username').eq('id', user.id).single();
      setCurrentUser({ ...user, username: profile?.username });
    }
  };

  const fetchCollections = async (category: 'card' | 'video') => {
    const { data, error } = await supabase
      .from('collection')
      .select('id, name')
      .eq('is_active', true)
      .eq('type', category);
      
    if (!error && data) setCollections(data);
  };

  const fetchItems = async (cat: 'card' | 'video', colId: string, side: 'offering' | 'requesting') => {
    setIsLoading(true);
    setSelectedItem(null);
    setQuantity(1);

    if (side === 'requesting') {
      if (cat === 'card') {
        const { data } = await supabase.from('cards').select('id, title, image_url, rarity_tiers(color_hex)').eq('collection_id', colId).eq('is_active', true);
        if (data) setItems(data.map((item: any) => {
          // 🟢 Bulletproof check for both TS and runtime arrays
          const rarity = Array.isArray(item.rarity_tiers) ? item.rarity_tiers[0] : item.rarity_tiers;
          return { ...item, rarity_color: rarity?.color_hex || '#333', maxQuantity: 99 };
        }));
      } else {
        const { data } = await supabase.from('videos').select('id, title, thumbnail_url, rarity_tiers(color_hex)').eq('collection_id', colId).eq('is_active', true);
        if (data) setItems(data.map((item: any) => {
          // 🟢 Bulletproof check for both TS and runtime arrays
          const rarity = Array.isArray(item.rarity_tiers) ? item.rarity_tiers[0] : item.rarity_tiers;
          return { ...item, image_url: item.thumbnail_url, rarity_color: rarity?.color_hex || '#333', maxQuantity: 99 };
        }));
      }
    } else {
      if (cat === 'card') {
        const { data } = await supabase
          .from('user_inventory')
          .select(`quantity, cards!inner(id, title, image_url, collection_id, rarity_tiers(color_hex))`)
          .eq('user_id', currentUser.id)
          .eq('cards.collection_id', colId)
          .gt('quantity', 0);
          
        if (data) {
          setItems(data.map((d: any) => {
            const cardData = Array.isArray(d.cards) ? d.cards[0] : d.cards;
            return { ...cardData, rarity_color: cardData.rarity_tiers?.color_hex || '#333', maxQuantity: d.quantity };
          }));
        }
      } else {
        const { data } = await supabase
          .from('user_inventory')
          .select(`quantity, videos!inner(id, title, thumbnail_url, collection_id, rarity_tiers(color_hex))`)
          .eq('user_id', currentUser.id)
          .eq('videos.collection_id', colId)
          .gt('quantity', 0);
          
        if (data) {
          setItems(data.map((d: any) => {
            const videoData = Array.isArray(d.videos) ? d.videos[0] : d.videos;
            return { ...videoData, image_url: videoData.thumbnail_url, rarity_color: videoData.rarity_tiers?.color_hex || '#333', maxQuantity: d.quantity };
          }));
        }
      }
    }
    setIsLoading(false);
  };

  const handleTradeSideToggle = (side: 'offering' | 'requesting') => {
    setTradeSide(side);
    setSelectedCategory(null);
    setSelectedCollection(null);
    setSelectedItem(null);
    setCollections([]);
    setItems([]);
  };

  // 🟢 FIX 1: Clear items when category changes
  const handleSelectCategory = (cat: 'card' | 'video') => {
    setSelectedCategory(cat);
    setSelectedCollection(null);
    setSelectedItem(null);
    setItems([]); 
    fetchCollections(cat);
  };

  const handleSelectCollection = (colId: string) => {
    setSelectedCollection(colId);
    if (selectedCategory) {
      fetchItems(selectedCategory, colId, tradeSide);
    }
  };

  // 🟢 FIX 2: Consolidate duplicates in the cart
  const handleAddItem = () => {
    if (!selectedItem || !selectedCategory) return;

    if (tradeSide === 'offering') {
      setOfferedItems((prev) => {
        const existingIndex = prev.findIndex(i => i.id === selectedItem.id);
        if (existingIndex >= 0) {
          const newArray = [...prev];
          newArray[existingIndex].trade_quantity += quantity;
          return newArray;
        }
        return [...prev, { ...selectedItem, item_type: selectedCategory, trade_quantity: quantity }];
      });
    } else {
      setRequestedItems((prev) => {
        const existingIndex = prev.findIndex(i => i.id === selectedItem.id);
        if (existingIndex >= 0) {
          const newArray = [...prev];
          newArray[existingIndex].trade_quantity += quantity;
          return newArray;
        }
        return [...prev, { ...selectedItem, item_type: selectedCategory, trade_quantity: quantity }];
      });
    }

    setSelectedItem(null);
    setQuantity(1);
  };

  const handleRemoveItem = (index: number, side: 'offering' | 'requesting') => {
    if (side === 'offering') {
      setOfferedItems(prev => prev.filter((_, i) => i !== index));
    } else {
      setRequestedItems(prev => prev.filter((_, i) => i !== index));
    }
    setSelectedItem(null); 
  };

  // 🟢 NEW FEATURE: Inline editing from the Trade Summary
  const handleUpdateCartQuantity = (index: number, side: 'offering' | 'requesting', delta: number) => {
    const updateCart = (prev: any[]) => {
      const newArray = [...prev];
      const newQuantity = newArray[index].trade_quantity + delta;
      
      if (newQuantity > 0 && newQuantity <= newArray[index].maxQuantity) {
        newArray[index].trade_quantity = newQuantity;
      }
      return newArray;
    };

    if (side === 'offering') {
      setOfferedItems(updateCart);
    } else {
      setRequestedItems(updateCart);
    }
    setSelectedItem(null); // Resets selection to cleanly recalculate available UI limits
  };

  const getRemainingQuantity = (item: any, side: 'offering' | 'requesting') => {
    if (side === 'requesting') return 99;
    const cartItems = offeredItems.filter(cartItem => cartItem.id === item.id);
    const totalInCart = cartItems.reduce((sum, cartItem) => sum + cartItem.trade_quantity, 0);
    return item.maxQuantity - totalInCart;
  };

  const availableItems = items.filter(item => getRemainingQuantity(item, tradeSide) > 0);
  const currentRemaining = selectedItem ? getRemainingQuantity(selectedItem, tradeSide) : 0;

  // 🟢 NEW: Submit the Trade to Supabase
  const handleSubmitTrade = async () => {
    // 1. Validation check
    if (!offeredBits && offeredItems.length === 0 && !requestedBits && requestedItems.length === 0) {
      Alert.alert("Error", "You cannot post an entirely empty trade!");
      return;
    }

    setIsSubmitting(true);

    try {
      // 2. Insert Parent Record (The Trade Post)
      const { data: listingData, error: listingError } = await supabase
        .from('market_listings')
        .insert({
          creator_id: currentUser.id,
          target_user_id: targetUserId || null, // 🟢 NEW: Links trade to friend if Direct Trade
          offered_bits: parseInt(offeredBits) || 0,
          requested_bits: parseInt(requestedBits) || 0,
          status: 'open'
        })
        .select()
        .single();

      if (listingError) throw listingError;

      // 🟢 NEW: Send notification to the friend instantly!
      if (targetUserId) {
        await supabase.from('notifications').insert({
          user_id: targetUserId as string,
          type: 'trade_received',
          message: `@${currentUser.username} sent you a Direct Trade offer!`,
          reference_id: listingData.id
        });
      }

      const listingId = listingData.id;

      // 3. Prepare Child Records (The Items)
      const allItemsToInsert: any[] = [];

      offeredItems.forEach(item => {
        allItemsToInsert.push({
          listing_id: listingId,
          item_type: item.item_type,
          card_id: item.item_type === 'card' ? item.id : null,
          video_id: item.item_type === 'video' ? item.id : null,
          side: 'offering',
          quantity: item.trade_quantity
        });
      });

      requestedItems.forEach(item => {
        allItemsToInsert.push({
          listing_id: listingId,
          item_type: item.item_type,
          card_id: item.item_type === 'card' ? item.id : null,
          video_id: item.item_type === 'video' ? item.id : null,
          side: 'requesting',
          quantity: item.trade_quantity
        });
      });

      // 4. Bulk Insert Items (if there are any)
      if (allItemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from('listing_items')
          .insert(allItemsToInsert);

        if (itemsError) {
          await supabase.from('market_listings').delete().eq('id', listingId);
          throw itemsError;
        }
      }

      // 🟢 5. ESCROW: Deduct Offered Bits
      const bitsToEscrow = parseInt(offeredBits) || 0;
      if (bitsToEscrow > 0) {
        const { data: uData } = await supabase.from('users').select('balance').eq('id', currentUser.id).single();
        const newBalance = (uData?.balance || 0) - bitsToEscrow;
        await supabase.from('users').update({ balance: newBalance }).eq('id', currentUser.id);
        
        DeviceEventEmitter.emit('balanceUpdated', newBalance); // Instantly update top header!
      }

      // 🟢 6. ESCROW: Deduct Offered Items (With Auto-Delete)
      for (const item of offeredItems) {
        const colName = item.item_type === 'card' ? 'card_id' : 'video_id';
        const { data: invData } = await supabase.from('user_inventory')
          .select('id, quantity').eq('user_id', currentUser.id).eq(colName, item.id).single();
          
        if (invData) {
          const newQuantity = invData.quantity - item.trade_quantity;
          
          if (newQuantity <= 0) {
            // If they escrowed their last copy, completely remove it from their vault!
            await supabase.from('user_inventory').delete().eq('id', invData.id);
          } else {
            await supabase.from('user_inventory').update({ quantity: newQuantity }).eq('id', invData.id);
          }
        }
      }

      // 7. Success!
      Alert.alert("Success!", "Your trade has been posted and your items are securely in escrow.");
      router.back(); // Send the player back to the shop

    } catch (error: any) {
      Alert.alert("Error posting trade", error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        {/* 🟢 NEW: Dynamic Title */}
        <Text style={styles.headerTitle}>
          {targetUsername ? `Direct Trade: @${targetUsername}` : 'Create Global Trade'}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bits</Text>
        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>I am Offering:</Text>
            <TextInput style={styles.input} keyboardType="numeric" placeholder="0" placeholderTextColor="#666" value={offeredBits} onChangeText={setOfferedBits} />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>I am Requesting:</Text>
            <TextInput style={styles.input} keyboardType="numeric" placeholder="0" placeholderTextColor="#666" value={requestedBits} onChangeText={setRequestedBits} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Items to Trade</Text>
        
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.toggleBtn, tradeSide === 'offering' && styles.toggleActive]} onPress={() => handleTradeSideToggle('offering')}>
            <Text style={styles.toggleText}>I am Offering</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, tradeSide === 'requesting' && styles.toggleActive]} onPress={() => handleTradeSideToggle('requesting')}>
            <Text style={styles.toggleText}>I am Requesting</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>1. Select Type</Text>
        <View style={styles.pillContainer}>
          <TouchableOpacity style={[styles.pill, selectedCategory === 'card' && styles.pillActive]} onPress={() => handleSelectCategory('card')}>
            <Text style={styles.pillText}>Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pill, selectedCategory === 'video' && styles.pillActive]} onPress={() => handleSelectCategory('video')}>
            <Text style={styles.pillText}>Tapes</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>2. Select Collection</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
          {collections.map((col) => (
            <TouchableOpacity key={col.id} style={[styles.pill, selectedCollection === col.id && styles.pillActive]} onPress={() => handleSelectCollection(col.id)}>
              <Text style={styles.pillText}>{col.name}</Text>
            </TouchableOpacity>
          ))}
          {collections.length === 0 && selectedCategory && !isLoading && (
            <Text style={styles.helperText}>No collections found.</Text>
          )}
        </ScrollView>

        <Text style={styles.label}>3. Select Specific Item</Text>
        {isLoading ? (
          <ActivityIndicator color="#4877FF" style={{ marginVertical: 20 }} />
        ) : availableItems.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {availableItems.map((item) => (
              <TouchableOpacity 
                key={item.id} 
                style={[
                  styles.pill, 
                  { borderColor: item.rarity_color }, 
                  selectedItem?.id === item.id && { backgroundColor: item.rarity_color + '40', borderWidth: 2 }
                ]} 
                onPress={() => { setSelectedItem(item); setQuantity(1); }}
              >
                <Text style={styles.pillText}>{item.title} {tradeSide === 'offering' && `(Avail: ${getRemainingQuantity(item, tradeSide)})`}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.helperText}>
            {selectedCollection 
              ? (items.length > 0 ? 'You have added all your copies of these items to the trade.' : 'No items found.') 
              : 'Select a Type and Collection first.'}
          </Text>
        )}

        {selectedItem && (
          <View style={styles.quantityContainer}>
            <TouchableOpacity 
              style={styles.quantityBtn}
              onPress={() => setQuantity(q => Math.max(1, q - 1))}
            >
              <Ionicons name="remove-circle" size={36} color={quantity > 1 ? "#FF4A58" : "#333"} />
            </TouchableOpacity>
            
            <View style={{ alignItems: 'center', marginHorizontal: 20 }}>
              <Text style={styles.quantityLabel}>Quantity</Text>
              <Text style={styles.quantityText}>{quantity}</Text>
            </View>

            <TouchableOpacity 
              style={styles.quantityBtn}
              onPress={() => setQuantity(q => Math.min(currentRemaining, q + 1))}
            >
              <Ionicons name="add-circle" size={36} color={quantity < currentRemaining ? "#538D4E" : "#333"} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.addBtn, !selectedItem && { opacity: 0.5 }]} 
          disabled={!selectedItem}
          onPress={handleAddItem}
        >
          <Text style={styles.addBtnText}>Add to {tradeSide === 'offering' ? 'Offer' : 'Request'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trade Summary</Text>
        
        <Text style={styles.subTitle}>You are Offering:</Text>
        {offeredBits ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryText}>• {offeredBits} Bits</Text>
            <TouchableOpacity onPress={() => setOfferedBits('')}>
              <Ionicons name="close-circle" size={24} color="#FF4A58" />
            </TouchableOpacity>
          </View>
        ) : null}
        
        {offeredItems.map((item, idx) => (
          <View key={idx} style={[styles.summaryItem, { borderWidth: 2, borderColor: item.rarity_color }]}>
            <Text style={[styles.summaryText, {flex: 1, marginRight: 8}]} numberOfLines={1} ellipsizeMode="tail">
              • {item.title} x{item.trade_quantity} ({item.item_type === 'video' ? 'Tape' : 'Card'})
            </Text>
            <View style={styles.summaryActions}>
              {/* 🟢 Inline Edit UI - Only visible if max quantity > 1 */}
              {item.maxQuantity > 1 && (
                <View style={styles.inlineEditBox}>
                  <TouchableOpacity onPress={() => handleUpdateCartQuantity(idx, 'offering', -1)} disabled={item.trade_quantity <= 1}>
                    <Ionicons name="remove" size={18} color={item.trade_quantity > 1 ? "#fff" : "#555"} />
                  </TouchableOpacity>
                  <Text style={styles.inlineEditText}>{item.trade_quantity}</Text>
                  <TouchableOpacity onPress={() => handleUpdateCartQuantity(idx, 'offering', 1)} disabled={item.trade_quantity >= item.maxQuantity}>
                    <Ionicons name="add" size={18} color={item.trade_quantity < item.maxQuantity ? "#fff" : "#555"} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={() => handleRemoveItem(idx, 'offering')}>
                <Ionicons name="close-circle" size={24} color="#FF4A58" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {!offeredBits && offeredItems.length === 0 && <Text style={styles.helperText}>Nothing offered yet.</Text>}

        <Text style={[styles.subTitle, { marginTop: 24 }]}>You are Requesting:</Text>
        {requestedBits ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryText}>• {requestedBits} Bits</Text>
            <TouchableOpacity onPress={() => setRequestedBits('')}>
              <Ionicons name="close-circle" size={24} color="#FF4A58" />
            </TouchableOpacity>
          </View>
        ) : null}

        {requestedItems.map((item, idx) => (
          <View key={idx} style={[styles.summaryItem, { borderWidth: 2, borderColor: item.rarity_color }]}>
            <Text style={[styles.summaryText, {flex: 1, marginRight: 8}]} numberOfLines={1} ellipsizeMode="tail">
              • {item.title} x{item.trade_quantity} ({item.item_type === 'video' ? 'Tape' : 'Card'})
            </Text>
            <View style={styles.summaryActions}>
              {/* 🟢 Inline Edit UI for requested items (always > 1 max limit) */}
              {item.maxQuantity > 1 && (
                <View style={styles.inlineEditBox}>
                  <TouchableOpacity onPress={() => handleUpdateCartQuantity(idx, 'requesting', -1)} disabled={item.trade_quantity <= 1}>
                    <Ionicons name="remove" size={18} color={item.trade_quantity > 1 ? "#fff" : "#555"} />
                  </TouchableOpacity>
                  <Text style={styles.inlineEditText}>{item.trade_quantity}</Text>
                  <TouchableOpacity onPress={() => handleUpdateCartQuantity(idx, 'requesting', 1)} disabled={item.trade_quantity >= item.maxQuantity}>
                    <Ionicons name="add" size={18} color={item.trade_quantity < item.maxQuantity ? "#fff" : "#555"} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={() => handleRemoveItem(idx, 'requesting')}>
                <Ionicons name="close-circle" size={24} color="#FF4A58" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {!requestedBits && requestedItems.length === 0 && <Text style={styles.helperText}>Nothing requested yet.</Text>}
      </View>

      <TouchableOpacity 
        style={[styles.submitTradeBtn, isSubmitting && { opacity: 0.7 }]} 
        onPress={handleSubmitTrade}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitTradeText}>POST TRADE</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#1A1A1A' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  section: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 16 },
  inputGroup: { flex: 1 },
  label: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#1A1A1A', color: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  toggleRow: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 8, padding: 4, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  toggleActive: { backgroundColor: '#4877FF' },
  toggleText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  pillContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  horizontalScroll: { flexDirection: 'row', marginBottom: 8 },
  pill: { backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#333', marginRight: 8 },
  pillActive: { backgroundColor: '#4877FF', borderColor: '#4877FF' },
  pillText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  helperText: { color: '#666', fontSize: 12, fontStyle: 'italic' },
  
  quantityContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, backgroundColor: '#1A1A1A', padding: 12, borderRadius: 16, alignSelf: 'center', borderWidth: 1, borderColor: '#333' },
  quantityBtn: { padding: 8 },
  quantityLabel: { color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
  quantityText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  
  addBtn: { backgroundColor: '#fff', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  addBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
  
  subTitle: { color: '#888', fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 12, borderRadius: 8, marginBottom: 8 },
  summaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  summaryActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inlineEditBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#222', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  inlineEditText: { color: '#fff', fontSize: 14, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  
  submitTradeBtn: { backgroundColor: '#538D4E', padding: 16, borderRadius: 8, alignItems: 'center', margin: 20 },
  submitTradeText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 }
});