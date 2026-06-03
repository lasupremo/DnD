import { Tabs, useFocusEffect, useRouter } from 'expo-router'
import { View, Text, StyleSheet, DeviceEventEmitter, TouchableOpacity, Modal, ScrollView } from 'react-native'
import { Image } from 'expo-image'
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Ionicons } from '@expo/vector-icons';

// TIER LOGIC
function getBitsStyle(amount: number) {
  if (amount >= 100000) return { color: '#FFBB23', icon: require('../../assets/bits/tier06.png') }
  if (amount >= 10000) return { color: '#FF4A58', icon: require('../../assets/bits/tier05.png') }
  if (amount >= 5000) return { color: '#4877FF', icon: require('../../assets/bits/tier04.png') }
  if (amount >= 1000) return { color: '#01F7D9', icon: require('../../assets/bits/tier03.png') }
  if (amount >= 100) return { color: '#BD63FF', icon: require('../../assets/bits/tier02.png') }
  return { color: '#A1A1A1', icon: require('../../assets/bits/tier01.png') }
}

// GLOBAL AVATAR BADGE
function GlobalAvatarBadge() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fetchAvatar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('avatar_url').eq('id', user.id).single();
      if (data) setAvatarUrl(data.avatar_url);
    }
  }

  useFocusEffect(useCallback(() => { fetchAvatar() }, []));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('profileUpdated', fetchAvatar);
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.avatarBadgeContainer}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.globalAvatar} contentFit="cover" />
      ) : (
        <View style={[styles.globalAvatar, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="person" size={20} color="#888" />
        </View>
      )}
    </View>
  );
}

// GLOBAL BITS BADGE
function GlobalBalanceBadge() {
  const [balance, setBalance] = useState(0)

  const fetchBalance = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('users').select('balance').eq('id', user.id).single()
      if (data) setBalance(data.balance || 0)
    }
  }

  useFocusEffect(useCallback(() => { fetchBalance() }, []))

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('balanceUpdated', (newBalance) => {
      if (typeof newBalance === 'number') setBalance(newBalance)
      else fetchBalance()
    })
    return () => subscription.remove()
  }, [])

  const currentBitsStyle = getBitsStyle(balance)

  return (
    <View style={[styles.balanceBadge, { borderColor: currentBitsStyle.color }]}>
      <Image source={currentBitsStyle.icon} style={styles.bitsIcon} contentFit="contain" />
      <Text style={[styles.balanceText, { color: currentBitsStyle.color }]}>
        {balance.toLocaleString()} Bits
      </Text>
    </View>
  )
}

// PROFILE INBOX ICON
function ProfileInboxIcon() {
  const router = useRouter();
  const [inboxVisible, setInboxVisible] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchInbox = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) setNotifications(data);
    }
  };

  useFocusEffect(useCallback(() => { fetchInbox() }, []));

  useEffect(() => {
    const channel = supabase.channel(`realtime-notifications-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchInbox();
        DeviceEventEmitter.emit('inboxUpdated'); 
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('openInbox', () => setInboxVisible(true));
    return () => sub.remove();
  }, []);

  const handleNotificationPress = async (notif: any) => {
    if (!notif.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
      fetchInbox(); 
      DeviceEventEmitter.emit('inboxUpdated');
    }

    if (notif.type.includes('trade') && notif.reference_id) {
      setInboxVisible(false);
      router.push({ pathname: '/shop/view-trade', params: { id: notif.reference_id, fromInbox: 'true' } });
    }
  };

  const handleDeleteMail = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    fetchInbox();
    DeviceEventEmitter.emit('inboxUpdated');
  };

  const handleClearAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('notifications').delete().eq('user_id', user.id);
      fetchInbox();
      DeviceEventEmitter.emit('inboxUpdated');
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.inboxIcon} onPress={() => setInboxVisible(true)}>
        <Ionicons name={unreadCount > 0 ? "mail" : "mail-outline"} size={28} color={unreadCount > 0 ? "#e8a020" : "#888"} />
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={inboxVisible} transparent animationType="fade" onRequestClose={() => setInboxVisible(false)}>
        <View style={styles.inboxOverlay}>
          <View style={styles.inboxContainer}>
            <View style={styles.inboxHeader}>
              <Text style={styles.inboxTitle}>Global Inbox</Text>
              
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <TouchableOpacity onPress={handleClearAll}>
                  <Text style={styles.clearAllText}>CLEAR ALL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setInboxVisible(false)}>
                  <Ionicons name="close" size={28} color="#888" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.inboxScroll} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {notifications.length === 0 ? (
                <Text style={styles.emptyInboxText}>Your inbox is empty.</Text>
              ) : (
                notifications.map((notif) => (
                  <View key={notif.id} style={{ position: 'relative' }}>
                    {!notif.is_read && <View style={styles.cardUnreadDot} />}
                    
                    <TouchableOpacity 
                      style={[styles.notifCard, !notif.is_read && styles.notifCardUnread]}
                      onPress={() => handleNotificationPress(notif)}
                    >
                      <View style={styles.notifIcon}>
                        <Ionicons name={notif.type.includes('trade') ? "swap-horizontal" : "people"} size={20} color={!notif.is_read ? "#e8a020" : "#888"} />
                      </View>
                      
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.notifMessage, !notif.is_read && { color: '#fff', fontWeight: 'bold' }]}>{notif.message}</Text>

                        {notif.type.includes('trade') && notif.reference_id ? (
                          <Text style={styles.notifTime}>Tap to view receipt</Text>
                        ) : null}
                      </View>

                      <TouchableOpacity onPress={() => handleDeleteMail(notif.id)} style={styles.trashBtn}>
                        <Ionicons name="trash-outline" size={20} color="#FF4A58" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// APP LAYOUT
export default function AppLayout() {
  const router = useRouter();
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);

  const fetchGlobalUnread = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setGlobalUnreadCount(count || 0);
    }
  };

  useFocusEffect(useCallback(() => { fetchGlobalUnread() }, []));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('inboxUpdated', fetchGlobalUnread);
    return () => sub.remove();
  }, []);

  return (
    <Tabs 
      screenOptions={{
        headerShown: true, 
        headerStyle: { backgroundColor: '#0F0F0F', shadowColor: 'transparent' },
        headerTitle: '', 
        headerLeft: () => <GlobalAvatarBadge />, 
        headerRight: () => <GlobalBalanceBadge />,
        tabBarActiveTintColor: '#e8a020',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { backgroundColor: '#0F0F0F', borderTopColor: '#2a2a2a' },
      }}
    >
      <Tabs.Screen name="packs" options={{ title: 'Packs', tabBarLabel: 'Packs' }} />
      <Tabs.Screen name="vault" options={{ title: 'Vault', tabBarLabel: 'Vault' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarLabel: 'Shop' }} />
      <Tabs.Screen name="games" options={{ title: 'Games', tabBarLabel: 'Games' }} />

      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Profile', 
          tabBarLabel: 'Profile',
          tabBarBadge: globalUnreadCount > 0 ? globalUnreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FF4A58', color: '#fff', fontSize: 10 },
          headerLeft: () => <ProfileInboxIcon />,
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/profile/settings')} style={{ marginRight: 20 }}>
              <Ionicons name="settings-outline" size={28} color="#888" />
            </TouchableOpacity>
          ),
        }} 
      />

      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  balanceBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#181818', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, gap: 6, marginRight: 16 },
  bitsIcon: { width: 16, height: 16 },
  balanceText: { fontWeight: '800', fontSize: 14 },
  
  avatarBadgeContainer: { marginLeft: 20 },
  globalAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#333' },

  inboxIcon: { position: 'relative', padding: 4, marginLeft: 16 },
  unreadBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#FF4A58', minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#0F0F0F' },
  unreadText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },

  inboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-start', alignItems: 'flex-start' },
  inboxContainer: { width: '85%', maxWidth: 400, height: '100%', backgroundColor: '#111', borderRightWidth: 1, borderColor: '#222', shadowColor: '#000', shadowOffset: { width: 10, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
  inboxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1, borderColor: '#222', backgroundColor: '#1A1A1A' },
  inboxTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  clearAllText: { color: '#FF4A58', fontSize: 12, fontWeight: 'bold' },
  inboxScroll: { flex: 1 },
  emptyInboxText: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 14 },
  
  notifCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#222', gap: 12, marginBottom: 12 },
  notifCardUnread: { backgroundColor: '#2a1d08', borderColor: '#e8a020' },
  notifIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  notifMessage: { color: '#bbb', fontSize: 14, lineHeight: 20 },
  notifTime: { color: '#666', fontSize: 11, marginTop: 4, fontWeight: 'bold', textTransform: 'uppercase' },
  
  cardUnreadDot: { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF4A58', borderWidth: 2, borderColor: '#111', zIndex: 10 },
  trashBtn: { padding: 8, marginLeft: 8 },
});