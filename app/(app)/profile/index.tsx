import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';
// 🟢 NEW: Import Swipeable from Gesture Handler
import { Swipeable } from 'react-native-gesture-handler'; 

type SocialTab = 'FRIENDS' | 'ADD_FRIEND';

export default function ProfileScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SocialTab>('FRIENDS');
  const [searchQuery, setSearchQuery] = useState('');

  const [searchedUser, setSearchedUser] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);

  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [friendsList, setFriendsList] = useState<any[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  // 🟢 NEW: Instantly refresh the Profile UI when settings are saved!
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('profileUpdated', () => {
      fetchUserData(); 
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Real-Time Listener for Friendships
  useEffect(() => {
    if (!currentUser?.id) return;

    const friendshipChannel = supabase
      // 🟢 FIXED: Appending Date.now() ensures a unique channel connection every render
      .channel(`custom-friendship-channel-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          fetchSocialData(currentUser.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(friendshipChannel);
    };
  }, [currentUser?.id]);

  const fetchUserData = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Authentication error. Please log in again.');

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, balance')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      setCurrentUser(profile);
      fetchSocialData(user.id);
    } catch (error: any) {
      Alert.alert('Error loading profile', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSocialData = async (userId: string) => {
    try {
      const { data: pendingData, error: pendingError } = await supabase
        .from('friendships')
        .select(`
          id,
          requester:users!friendships_requester_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      if (pendingError) throw pendingError;
      setIncomingRequests(pendingData || []);

      const { data: friendsData, error: friendsError } = await supabase
        .from('friendships')
        .select(`
          id,
          requester:users!friendships_requester_id_fkey(id, username, display_name, avatar_url),
          addressee:users!friendships_addressee_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (friendsError) throw friendsError;

      const formattedFriends = (friendsData || []).map((row: any) => {
        const isRequester = row.requester.id === userId;
        return isRequester ? row.addressee : row.requester;
      });

      setFriendsList(formattedFriends);
    } catch (error: any) {
      console.log("Error fetching social data:", error.message);
    }
  };

  const handleAcceptRequest = async (req: any) => {
    try {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', req.id);
      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: req.requester.id,
        type: 'friend_accept',
        message: `@${currentUser.username} accepted your friend request!`,
        reference_id: req.id
      });

      if (currentUser?.id) fetchSocialData(currentUser.id);
    } catch (error: any) {
      Alert.alert("Error accepting request", error.message);
    }
  };

  const handleRejectRequest = async (req: any) => {
    try {
      const { error } = await supabase.from('friendships').delete().eq('id', req.id);
      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: req.requester.id,
        type: 'friend_reject',
        message: `@${currentUser.username} declined your friend request.`,
        reference_id: null 
      });

      if (currentUser?.id) fetchSocialData(currentUser.id);
    } catch (error: any) {
      Alert.alert("Error rejecting request", error.message);
    }
  };

  // 🟢 NEW: Delete friendship regardless of who sent the original request
  const handleUnfriend = async (friendId: string, friendUsername: string) => {
    Alert.alert(
      "Unfriend",
      `Are you sure you want to remove @${friendUsername} from your friends list?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Unfriend", 
          style: "destructive", 
          onPress: async () => {
            try {
              // This OR query checks both combinations to find the correct friendship row
              const { error } = await supabase
                .from('friendships')
                .delete()
                .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${currentUser.id})`);

              if (error) throw error;

              // Refresh the list!
              if (currentUser?.id) fetchSocialData(currentUser.id);
            } catch (error: any) {
              Alert.alert("Error unfriending", error.message);
            }
          }
        }
      ]
    );
  };

  // 🟢 NEW: The red background and trash icon that reveals on swipe
  const renderHiddenUnfriendButton = (friendId: string, friendUsername: string) => {
    return (
      <TouchableOpacity 
        style={styles.hiddenDeleteBtn} 
        onPress={() => handleUnfriend(friendId, friendUsername)}
      >
        <Ionicons name="trash-outline" size={24} color="#fff" />
        <Text style={styles.hiddenDeleteText}>Remove</Text>
      </TouchableOpacity>
    );
  };

  const handleSearch = async () => {
    const rawQuery = searchQuery.trim();
    const cleanQuery = rawQuery.startsWith('@') ? rawQuery.substring(1) : rawQuery;

    if (!cleanQuery) return;
    setIsSearching(true);
    setSearchedUser(null);
    setRequestStatus(null);

    try {
      if (cleanQuery.toLowerCase() === currentUser?.username?.toLowerCase()) {
        Alert.alert("Oops", "You cannot add yourself!");
        setIsSearching(false);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .ilike('username', cleanQuery)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          Alert.alert("Not Found", "No player found with that exact username.");
        } else {
          throw error;
        }
      } else {
        setSearchedUser(data);
      }
    } catch (error: any) {
      Alert.alert("Search Error", error.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!currentUser?.id || !searchedUser?.id) return;

    try {
      const { data: newFriendship, error } = await supabase
        .from('friendships')
        .insert({
          requester_id: currentUser.id,
          addressee_id: searchedUser.id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          Alert.alert("Notice", "A friend request already exists between you two.");
        } else {
          throw error;
        }
      } else {
        await supabase.from('notifications').insert({
          user_id: searchedUser.id,
          type: 'friend_request',
          message: `@${currentUser.username} sent you a friend request!`,
          reference_id: newFriendship.id
        });

        setRequestStatus("Request Sent!");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.identityContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#4877FF" style={{ marginTop: 20 }} />
        ) : (
          <>
            <View style={styles.avatarWrapper}>
              {currentUser?.avatar_url ? (
                <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={60} color="#333" />
              )}
            </View>
            
            <View style={styles.nameBlock}>
              <Text style={styles.displayNameText}>{currentUser?.display_name || currentUser?.username || 'Unknown User'}</Text>
              <Text style={styles.friendCodeText}>@{currentUser?.username || 'unknown'}</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'FRIENDS' && styles.tabBtnActive]} onPress={() => setActiveTab('FRIENDS')}>
          <Text style={[styles.tabText, activeTab === 'FRIENDS' && styles.tabTextActive]}>My Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'ADD_FRIEND' && styles.tabBtnActive]} onPress={() => setActiveTab('ADD_FRIEND')}>
          <Text style={[styles.tabText, activeTab === 'ADD_FRIEND' && styles.tabTextActive]}>Add Friend</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {activeTab === 'FRIENDS' && (
          <View>
            <Text style={styles.sectionTitle}>Incoming Requests ({incomingRequests.length})</Text>
            {incomingRequests.length === 0 ? (
              <Text style={styles.helperText}>No pending requests.</Text>
            ) : (
              incomingRequests.map((req) => (
                <View key={req.id} style={styles.friendCard}>
                  <View style={styles.friendInfo}>
                    {req.requester.avatar_url ? (
                      <Image source={{ uri: req.requester.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <Ionicons name="person-circle-outline" size={40} color="#888" />
                    )}
                    <View style={{ marginLeft: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{req.requester.display_name || req.requester.username}</Text>
                      <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>@{req.requester.username}</Text>
                    </View>
                  </View>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAcceptRequest(req)}>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectRequest(req)}>
                      <Ionicons name="close" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 30 }]}>My Friends ({friendsList.length})</Text>
            {friendsList.length === 0 ? (
              <Text style={styles.helperText}>Your friends list is empty.</Text>
            ) : (
              friendsList.map((friend) => (
                // 🟢 FIXED: Wrapped the friend card in a Swipeable component and moved key here
                <Swipeable 
                  key={friend.id} 
                  renderRightActions={() => renderHiddenUnfriendButton(friend.id, friend.username)}
                  overshootRight={false}
                >
                  <View style={styles.friendCard}>
                    <View style={styles.friendInfo}>
                      {friend.avatar_url ? (
                        <Image source={{ uri: friend.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      ) : (
                        <Ionicons name="person-circle-outline" size={40} color="#4877FF" />
                      )}
                      <View style={{ marginLeft: 12 }}>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{friend.display_name || friend.username}</Text>
                        <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>@{friend.username}</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={styles.tradeBtn} 
                      onPress={() => router.push({ 
                        pathname: '/shop/create-trade', 
                        params: { targetUserId: friend.id, targetUsername: friend.username } 
                      })}
                    >
                      <Text style={styles.tradeText}>TRADE</Text>
                    </TouchableOpacity>
                  </View>
                </Swipeable>
              ))
            )}
          </View>
        )}

        {activeTab === 'ADD_FRIEND' && (
          <View>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color="#666" style={{ marginRight: 10 }} />
              <TextInput style={styles.searchInput} placeholder="Search unique @username..." placeholderTextColor="#666" value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" autoCorrect={false} />
              {searchQuery.length > 0 && (
                <TouchableOpacity style={styles.searchExecuteBtn} onPress={handleSearch} disabled={isSearching}>
                  {isSearching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.searchExecuteText}>FIND</Text>}
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.helperText}>To add a friend, ask them for their unique @username code shown on their profile.</Text>

            {searchedUser && (
              <View style={[styles.friendCard, { marginTop: 24 }]}>
                <View style={styles.friendInfo}>
                  {searchedUser.avatar_url ? (
                    <Image source={{ uri: searchedUser.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <Ionicons name="person-circle-outline" size={40} color="#4877FF" />
                  )}
                  <View style={{ marginLeft: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{searchedUser.display_name || searchedUser.username}</Text>
                    <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>@{searchedUser.username}</Text>
                  </View>
                </View>
                {requestStatus ? (
                  <Text style={{ color: '#538D4E', fontWeight: 'bold', fontSize: 12 }}>{requestStatus}</Text>
                ) : (
                  <TouchableOpacity style={styles.tradeBtn} onPress={handleSendRequest}>
                    <Text style={styles.tradeText}>ADD</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: 30 },
  identityContainer: { alignItems: 'center', marginBottom: 30, minHeight: 160 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#333', position: 'relative' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 50 },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#4877FF', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#121213', zIndex: 10 },
  nameBlock: { alignItems: 'center', marginTop: 16 },
  displayNameText: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  friendCodeText: { fontSize: 14, fontWeight: 'bold', color: '#888', marginTop: 4, backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  tabContainer: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#1A1A1A', borderRadius: 8, padding: 4, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabBtnActive: { backgroundColor: '#333' },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  tabTextActive: { color: '#fff' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  friendCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, marginBottom: 12 },
  friendInfo: { flexDirection: 'row', alignItems: 'center' },
  friendName: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 12 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  acceptBtn: { backgroundColor: '#538D4E', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { backgroundColor: '#FF4A58', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tradeBtn: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  tradeText: { color: '#000', fontWeight: '900', fontSize: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#333' },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
  searchExecuteBtn: { backgroundColor: '#4877FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  searchExecuteText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  helperText: { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 16, paddingHorizontal: 20 },
  
  // 🟢 NEW: Swipe-to-delete styles
  hiddenDeleteBtn: {
    backgroundColor: '#FF4A58',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    marginBottom: 12, // Matches friendCard bottom margin
    height: 'auto'
  },
  hiddenDeleteText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4
  }
});