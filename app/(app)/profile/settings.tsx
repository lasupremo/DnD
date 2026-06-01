import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Switch, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

export default function SettingsScreen() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // 🟢 FIXED: Using Display Name instead of Username
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Game Settings States
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) {
        setUser(data);
        setDisplayName(data.display_name || data.username || '');
        setAvatarUrl(data.avatar_url || '');
      }
    }
    setLoading(false);
  };

  // 🟢 FIXED: Direct Avatar Upload + Storage Cleanup
  const handleAvatarUpload = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setSaving(true);
        const fileExt = result.assets[0].uri.split('.').pop();
        
        // 1. Delete the old avatar from storage if it exists to prevent orphaned files
        if (avatarUrl) {
          const oldPath = avatarUrl.split('/').pop(); // Extracts filename from the public URL
          if (oldPath) {
            await supabase.storage.from('avatars').remove([oldPath]);
          }
        }

        // 2. Upload the new image (Appending Date.now() prevents caching issues where the old image still shows!)
        const filePath = `${user.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, decode(result.assets[0].base64), { 
            upsert: true,
            contentType: `image/${fileExt}` 
          });

        if (uploadError) throw uploadError;

        // 3. Get new URL and update Database
        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
        const newAvatarUrl = publicUrlData.publicUrl;

        const { error: updateError } = await supabase.from('users')
          .update({ avatar_url: newAvatarUrl })
          .eq('id', user.id);

        if (updateError) throw updateError;

        // 4. Update local UI and broadcast the change!
        setAvatarUrl(newAvatarUrl);
        DeviceEventEmitter.emit('profileUpdated'); // Signals the main Profile tab to reload
        
        Alert.alert("Success", "Avatar updated successfully!");
      }
    } catch (error: any) {
      Alert.alert("Upload Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // 🟢 FIXED: Save Display Name + Broadcast Changes
  const handleSaveProfile = async () => {
    if (!displayName.trim()) return Alert.alert("Error", "Display name cannot be empty.");
    
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      Alert.alert("Update Failed", error.message);
    } else {
      DeviceEventEmitter.emit('profileUpdated'); // Signals the main Profile tab to reload instantly!
      Alert.alert("Success", "Your profile has been updated!");
      router.back();
    }
  };

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Log Out", style: "destructive", onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        } 
      }
    ]);
  };

  if (loading) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color="#e8a020" />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSaveProfile} disabled={saving}>
          {saving ? <ActivityIndicator color="#e8a020" /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          
          {/* 🟢 FIXED: Clickable Avatar Upload */}
          <View style={styles.avatarContainer}>
            <TouchableOpacity onPress={handleAvatarUpload} disabled={saving} style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} contentFit="cover" />
              ) : (
                <View style={[styles.avatarPreview, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="person" size={40} color="#666" />
                </View>
              )}
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.usernameText}>@{user?.username}</Text>
          </View>

          {/* 🟢 FIXED: Display Name Input (Removed URL input) */}
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter display name"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Experience</Text>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingText}>Sound Effects</Text>
              <Text style={styles.settingSubtext}>Pack opening sounds, button clicks</Text>
            </View>
            <Switch value={sfxEnabled} onValueChange={setSfxEnabled} trackColor={{ false: '#333', true: '#e8a020' }} thumbColor={'#fff'} />
          </View>
          <View style={styles.settingDivider} />
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingText}>Music</Text>
              <Text style={styles.settingSubtext}>Background tracks and case spinning audio</Text>
            </View>
            <Switch value={musicEnabled} onValueChange={setMusicEnabled} trackColor={{ false: '#333', true: '#e8a020' }} thumbColor={'#fff'} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#FF4A58" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => alert('Account deletion coming soon!')}>
            <Ionicons name="warning-outline" size={20} color="#666" />
            <Text style={styles.deleteText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#1A1A1A' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  saveText: { color: '#e8a020', fontSize: 16, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  section: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#222' },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 16, letterSpacing: 1 },
  
  avatarContainer: { alignItems: 'center', marginBottom: 24 },
  avatarWrapper: { position: 'relative' },
  avatarPreview: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#333' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#4877FF', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A1A1A' },
  usernameText: { color: '#888', fontSize: 14, marginTop: 12, fontWeight: 'bold' },
  
  label: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16, marginBottom: 16 },
  
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  settingText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingSubtext: { color: '#888', fontSize: 12, marginTop: 4 },
  settingDivider: { height: 1, backgroundColor: '#333', marginVertical: 8 },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF4A5820', padding: 16, borderRadius: 12, marginBottom: 12 },
  logoutText: { color: '#FF4A58', fontSize: 16, fontWeight: 'bold', marginLeft: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  deleteText: { color: '#666', fontSize: 16, fontWeight: 'bold', marginLeft: 12 },
});