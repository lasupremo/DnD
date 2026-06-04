import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Collection } from '../../../types';
import CustomAlert, { AlertButton } from '../../../components/CustomAlert';

type ShopCollection = Collection & { price: number; isUnlocked?: boolean };

function getBitsStyle(amount: number) {
  if (amount >= 100000) return { color: '#FFBB23', icon: require('../../../assets/bits/tier06.png') };
  if (amount >= 10000) return { color: '#FF4A58', icon: require('../../../assets/bits/tier05.png') };
  if (amount >= 5000) return { color: '#4877FF', icon: require('../../../assets/bits/tier04.png') };
  if (amount >= 1000) return { color: '#01F7D9', icon: require('../../../assets/bits/tier03.png') };
  if (amount >= 100) return { color: '#BD63FF', icon: require('../../../assets/bits/tier02.png') };
  return { color: '#A1A1A1', icon: require('../../../assets/bits/tier01.png') };
}

export default function ShopScreen() {
  const router = useRouter();
  
  // --- UI STATES ---
  const [activeTab, setActiveTab] = useState<'packs' | 'market' | 'direct'>('packs');
  const [balance, setBalance] = useState<number>(0);
  
  // --- PACK STATES ---
  const [collections, setCollections] = useState<ShopCollection[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);

  // --- MARKET STATES ---
  const [marketListings, setMarketListings] = useState<any[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);

  // --- DIRECT OFFERS STATES ---
  const [directListings, setDirectListings] = useState<any[]>([]);
  const [directLoading, setDirectLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState<{ visible: boolean, title: string, message: string, buttons?: AlertButton[] }>({
    visible: false, title: '', message: ''
  });

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ visible: true, title, message });
  };

  useFocusEffect(
    useCallback(() => {
      fetchShopData();
      fetchMarketData();
      fetchDirectData();
    }, [])
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('refreshShopFeed', () => {
      fetchMarketData(); 
      fetchDirectData();
    });

    return () => {
      subscription.remove();
    };
  }, []);

  async function fetchShopData() {
    setPacksLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase.from('users').select('balance').eq('id', user.id).single();
    if (userData) setBalance(userData.balance || 0);

    const { data: allPacks, error } = await supabase.from('collection').select('*').eq('is_active', true).order('created_at', { ascending: false });
    const { data: unlocked } = await supabase.from('user_unlocked_packs').select('collection_id').eq('user_id', user.id);
    
    const unlockedIds = unlocked?.map(u => u.collection_id) || [];

    if (allPacks && !error) {
      const processedPacks = allPacks.map(pack => ({
        ...pack,
        isUnlocked: unlockedIds.includes(pack.id)
      }));
      
      processedPacks.sort((a, b) => {
        if (a.isUnlocked === b.isUnlocked) return 0; 
        return a.isUnlocked ? 1 : -1; 
      });

      setCollections(processedPacks as ShopCollection[]);
    }
    setPacksLoading(false);
  }

  async function fetchMarketData() {
    setMarketLoading(true);
    
    const { data, error } = await supabase
      .from('market_listings')
      .select(`
        *,
        creator:users!creator_id(username, avatar_url), 
        items:listing_items(side, quantity, item_type, cards(title), videos(title))
      `)
      .eq('status', 'open')
      .is('target_user_id', null)
      .order('created_at', { ascending: false });

    if (error) console.error("Global Market Error:", error.message);

    if (data && !error) {
      setMarketListings(data);
    }
    setMarketLoading(false);
  }

  async function fetchDirectData() {
    setDirectLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      setCurrentUserId(user.id);
      
      const { data, error } = await supabase
        .from('market_listings')
        .select(`
          *,
          creator:users!creator_id(username, avatar_url), 
          items:listing_items(side, quantity, item_type, cards(title), videos(title))
        `)
        .eq('status', 'open')
        .eq('target_user_id', user.id)
        .order('created_at', { ascending: false });
        
      if (error) console.error("Direct Offers Error:", error.message);

      if (data && !error) {
        setDirectListings(data);
      }
    }
    setDirectLoading(false);
  }

  const handleUnlockPress = (pack: ShopCollection) => {
    const unlockCost = (pack as any).unlock_price || pack.price || 2000;
    
    if (balance < unlockCost) {
      // Custom Alert Error
      showAlert(
        "Insufficient Bits", 
        `You need ${unlockCost.toLocaleString()} Bits to unlock ${pack.name}. Keep saving up!`
      );
      return;
    }

    // Custom Alert Confirmation
    setAlertConfig({
      visible: true,
      title: "Unlock Pack",
      message: `Do you want to permanently unlock the ${pack.name} pack for ${unlockCost.toLocaleString()} bits?`,
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Unlock", style: "default", onPress: () => processUnlock(pack, unlockCost) }
      ]
    });
  };

  const processUnlock = async (pack: ShopCollection, unlockCost: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('unlock_pack', { body: { user_id: user.id, collection_id: pack.id } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed to unlock');

      showAlert("Success!", `${pack.name} has been unlocked!`);
      setCollections(prev => {
        const updated = prev.map(p => p.id === pack.id ? { ...p, isUnlocked: true } : p);
        return updated.sort((a, b) => (a.isUnlocked === b.isUnlocked ? 0 : (a.isUnlocked ? 1 : -1)));
      });
      setBalance(prev => prev - unlockCost);
    } catch (err: any) {
      showAlert("Error", err.message);
    }
  };

  const summarizeTrade = (listing: any, side: 'offering' | 'requesting') => {
    const bits = side === 'offering' ? listing.offered_bits : listing.requested_bits;
    const items = listing.items?.filter((i: any) => i.side === side) || [];
    
    let summary = [];
    if (bits > 0) summary.push(`${bits} Bits`);
    
    items.forEach((item: any) => {
      const title = item.item_type === 'card' ? item.cards?.title : item.videos?.title;
      summary.push(`${title || 'Unknown Item'} x${item.quantity}`);
    });

    if (summary.length === 0) return "Nothing";
    return summary.join(', ');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Shop</Text>
          <Text style={styles.subtitle}>
            {activeTab === 'packs' ? 'Spend your Bits to acquire new packs.' : 
             activeTab === 'market' ? 'Trade with players globally.' : 
             'Review private offers from friends.'}
          </Text>
        </View>
      </View>

      {/* TOP TOGGLE */}
      <View style={styles.toggleRow}>
        <TouchableOpacity style={[styles.toggleBtn, activeTab === 'packs' && styles.toggleActive]} onPress={() => setActiveTab('packs')}>
          <Text style={[styles.toggleText, activeTab === 'packs' && styles.toggleTextActive]}>System Packs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, activeTab === 'market' && styles.toggleActive]} onPress={() => setActiveTab('market')}>
          <Text style={[styles.toggleText, activeTab === 'market' && styles.toggleTextActive]}>Global Market</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, activeTab === 'direct' && styles.toggleActive]} onPress={() => setActiveTab('direct')}>
          <Text style={[styles.toggleText, activeTab === 'direct' && styles.toggleTextActive]}>Direct Offers</Text>
        </TouchableOpacity>
      </View>

      {/* CREATE TRADE BUTTON */}
      {activeTab === 'market' && (
        <TouchableOpacity style={styles.createTradeBtn} onPress={() => router.push('/shop/create-trade')}>
          <Ionicons name="add-circle-outline" size={24} color="#fff" />
          <Text style={styles.createTradeText}>Create Global Trade</Text>
        </TouchableOpacity>
      )}

      {/* TAB CONTENT RENDERING */}
      {activeTab === 'packs' ? (
        
        /* PACKS VIEW */
        packsLoading ? (
          <ActivityIndicator size="large" color="#4877FF" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.grid}>
            {collections.map((pack) => {
              const packPrice = (pack as any).unlock_price || 2000; 
              const isUnlocked = pack.isUnlocked;
              const packBitsStyle = getBitsStyle(packPrice);
              
              return (
                <TouchableOpacity 
                  key={pack.id} 
                  style={[styles.packCard, isUnlocked && { opacity: 0.5 }]} 
                  activeOpacity={isUnlocked ? 1 : 0.8}
                  disabled={isUnlocked}
                  onPress={() => { if (!isUnlocked) handleUnlockPress(pack) }}
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
                      <Text style={styles.packDesc} numberOfLines={2}>{pack.description || 'A mysterious collection.'}</Text>
                    </View>
                    
                    {isUnlocked ? (
                      <View style={styles.ownedRow}>
                        <Text style={styles.ownedText}>ALREADY OWNED</Text>
                      </View>
                    ) : (
                      <View style={styles.priceRow}>
                        <Image source={packBitsStyle.icon} style={styles.packBitsIcon} contentFit="contain" />
                        <Text style={[styles.priceText, { color: packBitsStyle.color }]}>
                          {packPrice.toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )

      ) : activeTab === 'market' ? (

        /* GLOBAL MARKET VIEW */
        marketLoading ? (
          <ActivityIndicator size="large" color="#538D4E" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.grid}>
            {marketListings.length === 0 ? (
              <Text style={styles.emptyMarketText}>No global trades are currently open.</Text>
            ) : (
              marketListings.map(listing => (
                <View key={listing.id} style={styles.tradeCard}>
                  {/* Creator Info */}
                  <View style={styles.tradeHeader}>
                    {listing.creator?.avatar_url ? (
                      <Image source={{ uri: listing.creator.avatar_url }} style={styles.creatorAvatar} />
                    ) : (
                      <View style={[styles.creatorAvatar, { backgroundColor: '#444' }]} />
                    )}
                    <Text style={styles.creatorName}>@{listing.creator?.username || 'unknown'}</Text>
                    <Text style={styles.timeAgo}>Open Trade</Text>
                  </View>

                  {/* Trade Details */}
                  <View style={styles.tradeBody}>
                    <View style={styles.tradeSide}>
                      <Text style={styles.tradeSideLabel}>Offering:</Text>
                      <Text style={styles.tradeSideValue} numberOfLines={2}>{summarizeTrade(listing, 'offering')}</Text>
                    </View>
                    
                    <View style={styles.tradeDivider} />
                    
                    <View style={styles.tradeSide}>
                      <Text style={styles.tradeSideLabel}>Requesting:</Text>
                      <Text style={styles.tradeSideValue} numberOfLines={2}>{summarizeTrade(listing, 'requesting')}</Text>
                    </View>
                  </View>

                  {/* Action Button */}
                  <TouchableOpacity 
                    style={styles.viewTradeBtn} 
                    onPress={() => router.push({ pathname: '/shop/view-trade', params: { id: listing.id } })}
                  >
                    <Text style={styles.viewTradeText}>VIEW DETAILS</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : activeTab === 'direct' ? (

        /* DIRECT OFFERS VIEW */
        directLoading ? (
          <ActivityIndicator size="large" color="#4877FF" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.grid}>
            {directListings.length === 0 ? (
              <Text style={styles.emptyMarketText}>You have no pending direct offers.</Text>
            ) : (
              directListings.map(listing => (
                <View key={listing.id} style={[styles.tradeCard, { borderColor: '#4877FF' }]}>
                  {/* Creator Info */}
                  <View style={styles.tradeHeader}>
                    {listing.creator?.avatar_url ? (
                      <Image source={{ uri: listing.creator.avatar_url }} style={styles.creatorAvatar} />
                    ) : (
                      <View style={[styles.creatorAvatar, { backgroundColor: '#444' }]} />
                    )}
                    <Text style={styles.creatorName}>@{listing.creator?.username || 'unknown'}</Text>
                    <Text style={[styles.timeAgo, { color: '#4877FF' }]}>Direct Offer</Text>
                  </View>

                  {/* Trade Details */}
                  <View style={styles.tradeBody}>
                    <View style={styles.tradeSide}>
                      <Text style={styles.tradeSideLabel}>Offering:</Text>
                      <Text style={styles.tradeSideValue} numberOfLines={2}>{summarizeTrade(listing, 'offering')}</Text>
                    </View>
                    
                    <View style={styles.tradeDivider} />
                    
                    <View style={styles.tradeSide}>
                      <Text style={styles.tradeSideLabel}>Requesting:</Text>
                      <Text style={styles.tradeSideValue} numberOfLines={2}>{summarizeTrade(listing, 'requesting')}</Text>
                    </View>
                  </View>

                  {/* Action Button */}
                  <TouchableOpacity 
                    style={[styles.viewTradeBtn, { backgroundColor: '#4877FF' }]} 
                    onPress={() => router.push({ pathname: '/shop/view-trade', params: { id: listing.id } })}
                  >
                    <Text style={[styles.viewTradeText, { color: '#fff' }]}>REVIEW OFFER</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : null}

      {/* Custom Alert Component */}
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 16 },
  
  toggleRow: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 12, marginHorizontal: 20, padding: 4, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: '#333' },
  toggleText: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  toggleTextActive: { color: '#fff' },

  createTradeBtn: { backgroundColor: '#4877FF', marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  createTradeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  scrollArea: { flex: 1 },
  grid: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  
  packCard: { backgroundColor: '#111', borderRadius: 20, borderWidth: 1, borderColor: '#222', overflow: 'hidden', flexDirection: 'row', height: 140 },
  imageContainer: { width: 140, height: '100%', backgroundColor: '#1a1a1a' },
  coverImage: { width: '100%', height: '100%' },
  typeBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  typeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  packInfo: { flex: 1, padding: 16, justifyContent: 'space-between' },
  packName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  packDesc: { color: '#888', fontSize: 12, lineHeight: 16, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  packBitsIcon: { width: 14, height: 14 },
  priceText: { fontWeight: '800', fontSize: 14 },
  ownedRow: { marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#222', borderRadius: 6, alignSelf: 'flex-start' },
  ownedText: { color: '#888', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  emptyMarketText: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 14 },
  tradeCard: { backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#222', padding: 16 },
  tradeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  creatorAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 12 },
  creatorName: { color: '#fff', fontSize: 14, fontWeight: 'bold', flex: 1 },
  timeAgo: { color: '#538D4E', fontSize: 12, fontWeight: 'bold' },
  tradeBody: { backgroundColor: '#1A1A1A', borderRadius: 8, padding: 12, marginBottom: 16 },
  tradeSide: { flex: 1 },
  tradeSideLabel: { color: '#888', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  tradeSideValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  tradeDivider: { height: 1, backgroundColor: '#333', marginVertical: 8 },
  viewTradeBtn: { backgroundColor: '#fff', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  viewTradeText: { color: '#000', fontSize: 12, fontWeight: '900', letterSpacing: 1 }
});