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
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase'; // Ensure this path matches your structure

type SocialTab = 'FRIENDS' | 'ADD_FRIEND';

export default function ProfileScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SocialTab>('FRIENDS');
  const [searchQuery, setSearchQuery] = useState('');

  // 🟢 Real Data States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user data when screen loads
  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      // 1. Get the authenticated user ID
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Authentication error. Please log in again.');
      }

      // 2. Fetch their corresponding row from the public.users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('username, avatar_url, balance')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      setCurrentUser(profile);
    } catch (error: any) {
      Alert.alert('Error loading profile', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.settingsButton} onPress={() => alert('Settings Modal coming soon!')}>
          <Ionicons name="settings-outline" size={28} color="#888" />
        </TouchableOpacity>
      </View>

      {/* 🟢 DYNAMIC IDENTITY SECTION */}
      <View style={styles.identityContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#4877FF" style={{ marginTop: 20 }} />
        ) : (
          <>
            <TouchableOpacity style={styles.avatarWrapper} onPress={() => alert('Image Upload coming soon!')}>
              {currentUser?.avatar_url ? (
                <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={60} color="#333" />
              )}
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            
            {/* 🟢 FIX: Redundant bits balance removed, leaving a clean username display */}
            <Text style={styles.usernameText}>{currentUser?.username || 'Unknown User'}</Text>
          </>
        )}
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'FRIENDS' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('FRIENDS')}
        >
          <Text style={[styles.tabText, activeTab === 'FRIENDS' && styles.tabTextActive]}>My Friends</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'ADD_FRIEND' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('ADD_FRIEND')}
        >
          <Text style={[styles.tabText, activeTab === 'ADD_FRIEND' && styles.tabTextActive]}>Add Friend</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {activeTab === 'FRIENDS' && (
          <View>
            <Text style={styles.sectionTitle}>Incoming Requests (0)</Text>
            <Text style={styles.helperText}>No pending requests.</Text>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>My Friends</Text>
            <Text style={styles.helperText}>Your friends list is empty.</Text>
          </View>
        )}

        {activeTab === 'ADD_FRIEND' && (
          <View>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color="#666" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search exact username..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity style={styles.searchExecuteBtn} onPress={() => alert('Search logic coming next!')}>
                  <Text style={styles.searchExecuteText}>FIND</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.helperText}>Friend requests are sent securely. You will be notified when they accept.</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// Keep the exact same styles as before!
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121213' },
  topHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10 },
  settingsButton: { padding: 8 },
  identityContainer: { alignItems: 'center', marginBottom: 30, minHeight: 160 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#333', position: 'relative' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 50 },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#4877FF', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#121213' },
  usernameText: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 16, letterSpacing: 1 },
  bitsText: { fontSize: 16, fontWeight: 'bold', color: '#01F7D9', marginTop: 4 },
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
  helperText: { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 16, paddingHorizontal: 20 }
});