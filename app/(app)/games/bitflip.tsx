import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Animated,
  DeviceEventEmitter,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

// Bit tier colors
function getTierColors(amount: number) {
  if (amount >= 100000) return { bg: '#FFBB23', text: '#000' };
  if (amount >= 10000) return { bg: '#FF4A58', text: '#fff' };
  if (amount >= 5000) return { bg: '#4877FF', text: '#fff' };
  if (amount >= 1000) return { bg: '#01F7D9', text: '#000' };
  if (amount >= 100) return { bg: '#BD63FF', text: '#fff' };
  return { bg: '#A1A1A1', text: '#000' };
}

export default function BitFlipScreen() {
  const router = useRouter();

  const [isToastVisible, setIsToastVisible] = useState(false);

  const [wager, setWager] = useState('');
  const [guess, setGuess] = useState<0 | 1 | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Scramble Animation States
  const [displayBit, setDisplayBit] = useState<'0' | '1' | '-'>('-');
  const scrambleInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Toast States
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastBg, setToastBg] = useState<string>('#fff');
  const [toastColor, setToastColor] = useState<string>('#000');

  // Clean up interval on unmount
  useEffect(() => {
    return () => stopScramble();
  }, []);

  const startScramble = () => {
    scrambleInterval.current = setInterval(() => {
      setDisplayBit(prev => prev === '0' ? '1' : '0');
    }, 50); // Rapidly flip every 50ms
  };

  const stopScramble = () => {
    if (scrambleInterval.current) {
      clearInterval(scrambleInterval.current);
      scrambleInterval.current = null;
    }
  };

  const showToast = (message: string, bgColor: string, textColor: string) => {
    setToastMessage(message);
    setToastBg(bgColor);
    setToastColor(textColor);
    
    setIsToastVisible(true);

    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => {
      setToastMessage(null);
      setIsToastVisible(false);
    });
  };

  const executeFlip = async () => {
    const numericWager = parseInt(wager);
    
    if (isNaN(numericWager) || numericWager <= 0) {
      showToast('ENTER VALID WAGER', '#FF4A58', '#fff');
      return;
    }
    if (guess === null) {
      showToast('SELECT 0 OR 1', '#FF4A58', '#fff');
      return;
    }

    setIsProcessing(true);
    startScramble();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication error');

      const { data, error } = await supabase.functions.invoke('bitflip', {
        body: { user_id: user.id, wager: numericWager, guess }
      });

      if (error || data?.error) {
        throw new Error(data?.error || 'Network error');
      }

      stopScramble();
      setDisplayBit(data.outcome.toString() as '0' | '1');

      // Update global header balance instantly
      DeviceEventEmitter.emit('balanceUpdated', data.newBalance);

      if (data.isWinner) {
        const tier = getTierColors(data.wager);
        showToast(`+${data.wager.toLocaleString()} BITS`, tier.bg, tier.text);
      } else {
        showToast(`-${data.wager.toLocaleString()} BITS`, '#3A3A3C', '#fff');
      }

    } catch (err: any) {
      stopScramble();
      setDisplayBit('-');
      showToast(err.message.toUpperCase(), '#FF4A58', '#fff');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {/* Back Button */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={32} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.headerBlock}>
          <Text style={styles.header}>BitFlip</Text>
          <Text style={styles.subheader}>High stakes. Binary choices.</Text>
        </View>

        {/* Toast Notification */}
        {toastMessage && (
          <Animated.View style={[styles.toastContainer, { opacity: toastOpacity, backgroundColor: toastBg }]}>
            <Text style={[styles.toastText, { color: toastColor }]}>{toastMessage}</Text>
          </Animated.View>
        )}

        {/* The Digital Scrambler */}
        <View style={styles.displayContainer}>
          <View style={[
            styles.displayBox, 
            displayBit === '-' ? { borderColor: '#333' } : 
            displayBit === guess?.toString() && !isProcessing ? { borderColor: '#538D4E', backgroundColor: 'rgba(83, 141, 78, 0.2)' } : 
            // 🟢 FIX: Removed the redundant displayBit check!
            !isProcessing ? { borderColor: '#FF4A58', backgroundColor: 'rgba(255, 74, 88, 0.2)' } : 
            { borderColor: '#538D4E' } 
          ]}>
            <Text style={styles.displayText}>{displayBit}</Text>
          </View>
        </View>

        {/* Controls Block */}
        <View style={styles.controlsContainer}>
          <Text style={styles.label}>1. SET WAGER</Text>
          <TextInput
            style={styles.wagerInput}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#555"
            value={wager}
            onChangeText={(text) => setWager(text.replace(/[^0-9]/g, ''))} // Strictly numbers
            editable={!isProcessing}
            maxLength={8}
          />

          <Text style={[styles.label, { marginTop: 24 }]}>2. SELECT PREDICTION</Text>
          <View style={styles.guessRow}>
            <TouchableOpacity 
              style={[styles.guessButton, guess === 0 && styles.guessButtonActive]}
              onPress={() => setGuess(0)}
              disabled={isProcessing}
            >
              <Text style={[styles.guessText, guess === 0 && styles.guessTextActive]}>0</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.guessButton, guess === 1 && styles.guessButtonActive]}
              onPress={() => setGuess(1)}
              disabled={isProcessing}
            >
              <Text style={[styles.guessText, guess === 1 && styles.guessTextActive]}>1</Text>
            </TouchableOpacity>
          </View>

          {/* Action Button */}
          <TouchableOpacity 
            style={[styles.executeButton, (isProcessing || isToastVisible || !wager || guess === null) && styles.executeButtonDisabled]}
            onPress={executeFlip}
            // 🟢 FIX: The button is now completely disabled while the Toast is animating!
            disabled={isProcessing || isToastVisible || !wager || guess === null} 
          >
            <Text style={styles.executeText}>
              {isProcessing ? 'EXECUTING...' : 'INITIATE SEQUENCE'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121213' },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  
  topBar: { width: '100%', position: 'absolute', top: 20, left: 16, zIndex: 50 },
  backButton: { padding: 8 },

  headerBlock: { alignItems: 'center', marginBottom: 20 },
  header: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  subheader: { fontSize: 14, color: '#888' },

  toastContainer: { position: 'absolute', top: 120, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, zIndex: 100 },
  toastText: { fontWeight: '900', fontSize: 16, letterSpacing: 1 },

  displayContainer: { marginVertical: 30, alignItems: 'center', justifyContent: 'center' },
  displayBox: { width: 140, height: 140, borderWidth: 4, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A1A' },
  displayText: { fontSize: 80, fontWeight: 'bold', color: '#fff' },

  controlsContainer: { width: '85%', backgroundColor: '#1A1A1A', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
  
  label: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  
  wagerInput: { backgroundColor: '#121213', borderWidth: 1, borderColor: '#333', borderRadius: 8, color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', paddingVertical: 12 },

  guessRow: { flexDirection: 'row', gap: 12 },
  guessButton: { flex: 1, height: 60, backgroundColor: '#121213', borderWidth: 2, borderColor: '#333', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  guessButtonActive: { borderColor: '#538D4E', backgroundColor: 'rgba(83, 141, 78, 0.1)' },
  guessText: { color: '#888', fontSize: 28, fontWeight: 'bold' },
  guessTextActive: { color: '#538D4E' },

  executeButton: { marginTop: 30, backgroundColor: '#fff', paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
  executeButtonDisabled: { backgroundColor: '#333' },
  executeText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 2 }
});