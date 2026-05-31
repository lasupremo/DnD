import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  DeviceEventEmitter, 
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Animated,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase'; 
import { WORD_LIST, VALID_WORD_SET } from '../../../lib/dictionary'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🟢 NEW: For saving game state
import { Ionicons } from '@expo/vector-icons'; // 🟢 NEW: For the Back Button

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
];

const { width } = Dimensions.get('window');
const TRACKER_KEY_WIDTH = Math.min((width - 80) / 10, 32);

type LetterStatus = 'correct' | 'wrong_position' | 'dead' | 'unused';

// 🟢 NEW: Helper to determine the Toast Colors based on user's new balance
function getTierColors(amount: number) {
  if (amount >= 100000) return { bg: '#FFBB23', text: '#000' };
  if (amount >= 10000) return { bg: '#FF4A58', text: '#fff' };
  if (amount >= 5000) return { bg: '#4877FF', text: '#fff' };
  if (amount >= 1000) return { bg: '#01F7D9', text: '#000' };
  if (amount >= 100) return { bg: '#BD63FF', text: '#fff' };
  return { bg: '#A1A1A1', text: '#000' };
}

const evaluateGuess = (guess: string, target: string): LetterStatus[] => {
  const result: LetterStatus[] = Array(5).fill('dead');
  const targetLetterCounts: Record<string, number> = {};

  for (const char of target) {
    targetLetterCounts[char] = (targetLetterCounts[char] || 0) + 1;
  }

  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
      targetLetterCounts[guess[i]] -= 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] !== 'correct' && targetLetterCounts[guess[i]] > 0) {
      result[i] = 'wrong_position';
      targetLetterCounts[guess[i]] -= 1; 
    }
  }

  return result;
};

interface TileProps {
  letter: string;
  isSubmitted: boolean;
  status: LetterStatus; 
  colIndex: number;
  onRevealComplete?: () => void;
}

const Tile = ({ letter, isSubmitted, status, colIndex, onRevealComplete }: TileProps) => {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (isSubmitted && !revealed) {
      setTimeout(() => {
        Animated.timing(flipAnim, { toValue: 90, duration: 250, useNativeDriver: true }).start(() => {
          setRevealed(true); 
          Animated.timing(flipAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
            if (onRevealComplete) onRevealComplete();
          });
        });
      }, colIndex * 300);
    } else if (!isSubmitted && revealed) {
      setRevealed(false);
      flipAnim.setValue(0);
    }
  }, [isSubmitted, letter]);

  let cellColor = '#1A1A1A';
  let borderColor = letter && !isSubmitted ? '#565758' : '#3A3A3C';

  if (revealed) {
    if (status === 'correct') cellColor = '#538D4E';
    else if (status === 'wrong_position') cellColor = '#B59F3B';
    else cellColor = '#3A3A3C'; 
    borderColor = cellColor; 
  }

  return (
    <Animated.View style={[styles.cell, { 
      backgroundColor: cellColor, 
      borderColor: borderColor,
      transform: [{ rotateX: flipAnim.interpolate({ inputRange: [0, 90], outputRange: ['0deg', '90deg'] }) }]
    }]}>
      <Text style={styles.cellText}>{letter}</Text>
    </Animated.View>
  );
};

export default function WordleScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [targetWord, setTargetWord] = useState('');
  const [guesses, setGuesses] = useState<string[]>([]);
  const [revealedGuesses, setRevealedGuesses] = useState<string[]>([]); 
  const [currentGuess, setCurrentGuess] = useState('');
  
  const [isGameOver, setIsGameOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // 🟢 NEW: Toast Styling States
  const [toastBg, setToastBg] = useState<string>('#fff');
  const [toastColor, setToastColor] = useState<string>('#000');

  // 🟢 NEW: On mount, try to load a saved game first
  useEffect(() => {
    loadGameState();
  }, []);

  // 🟢 NEW: Save the game every time progress changes
  useEffect(() => {
    if (targetWord && !isGameOver) {
      AsyncStorage.setItem('@wordle_state', JSON.stringify({
        targetWord, guesses, revealedGuesses, currentGuess
      }));
    }
  }, [targetWord, guesses, revealedGuesses, currentGuess, isGameOver]);

  const loadGameState = async () => {
    try {
      const saved = await AsyncStorage.getItem('@wordle_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        setTargetWord(parsed.targetWord);
        setGuesses(parsed.guesses);
        setRevealedGuesses(parsed.revealedGuesses);
        setCurrentGuess(parsed.currentGuess || '');
        
        // If they left the app while game was over, reset on return
        if (parsed.revealedGuesses.length === 6 || parsed.revealedGuesses.includes(parsed.targetWord)) {
          resetGame();
        }
      } else {
        resetGame();
      }
    } catch (e) {
      resetGame();
    }
  };

  const resetGame = () => {
    const randomWord = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    setTargetWord(randomWord);

    setGuesses([]);
    setRevealedGuesses([]);
    setCurrentGuess('');
    setIsGameOver(false);
    setIsProcessing(false);
    setToastMessage(null);
    AsyncStorage.removeItem('@wordle_state'); 
    
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const triggerErrorUI = (message: string) => {
    setToastMessage(message);
    setToastBg('#fff');
    setToastColor('#000');

    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();

    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => setToastMessage(null));
  };

  // 🟢 NEW: Special End Game Toast (No shaking, stays longer, executes callback after fading)
  const showEndGameToast = (message: string, bgColor: string, textColor: string, onComplete: () => void) => {
    setToastMessage(message);
    setToastBg(bgColor);
    setToastColor(textColor);

    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2500), // Hold for 2.5 seconds so they can read the win/loss
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
    ]).start(() => {
      setToastMessage(null);
      onComplete(); // Triggers the board reset
    });
  };

  const handleNativeSubmit = () => {
    if (currentGuess.length === 5) {
      if (VALID_WORD_SET.has(currentGuess)) {
        submitGuess();
      } else {
        triggerErrorUI('Not in word list');
        inputRef.current?.focus(); 
      }
    } else {
      triggerErrorUI('Not enough letters');
      inputRef.current?.focus();
    }
  };

  const submitGuess = () => {
    setIsProcessing(true); 
    const newGuesses = [...guesses, currentGuess];
    setGuesses(newGuesses);
    setCurrentGuess('');
  };

  const handleRevealComplete = (guessStr: string, rowIndex: number) => {
    setRevealedGuesses(prev => [...prev, guessStr]); 

    if (guessStr === targetWord) {
      handleWin(rowIndex + 1);
    } else if (rowIndex === 5) {
      setIsGameOver(true);
      // 🟢 NEW: Loss condition uses the Toast to reveal the word, then resets
      showEndGameToast(targetWord, '#fff', '#000', () => resetGame());
    } else {
      setIsProcessing(false); 
    }
  };

  const handleWin = async (attempts: number) => {
    setIsGameOver(true);
    setIsProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const { data, error } = await supabase.functions.invoke('reward_wordle', {
        body: { user_id: user.id, attempts }
      });

      if (error || data?.error) throw new Error(data?.error || 'Failed to claim reward');

      DeviceEventEmitter.emit('balanceUpdated', data.new_balance);

      // 🟢 FIX: Now calculates the color based on the reward won, not the total balance!
      const tierStyles = getTierColors(data.reward);
      showEndGameToast(`+${data.reward.toLocaleString()} BITS`, tierStyles.bg, tierStyles.text, () => resetGame());

    } catch (err: any) {
      // Keep Alert for actual network errors so they don't lose Bits silently
      triggerErrorUI('Network Error');
      setIsProcessing(false);
    } 
  };

  const getTrackerStatus = (letter: string): LetterStatus => {
    let bestStatus: LetterStatus = 'unused'; 
    revealedGuesses.forEach(guess => {
      const statuses = evaluateGuess(guess, targetWord);
      for (let i = 0; i < 5; i++) {
        if (guess[i] === letter) {
          const currentStatus = statuses[i];
          if (currentStatus === 'correct') {
            bestStatus = 'correct';
          } else if (currentStatus === 'wrong_position' && bestStatus !== 'correct') {
            bestStatus = 'wrong_position';
          } else if (currentStatus === 'dead' && bestStatus === 'unused') {
            bestStatus = 'dead';
          }
        }
      }
    });
    return bestStatus;
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        
        {/* 🟢 NEW: Absolute Back Button mapped to Top Left */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={32} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.touchableWrapper} activeOpacity={1} onPress={() => inputRef.current?.focus()}>
          
          <View style={styles.headerBlock}>
            <Text style={styles.header}>Decrypt</Text>
            <Text style={styles.subheader}>Guess the 5-letter password.</Text>
          </View>

          {toastMessage && (
            // 🟢 Toast now applies dynamic colors
            <Animated.View style={[styles.toastContainer, { opacity: toastOpacity, backgroundColor: toastBg }]}>
              <Text style={[styles.toastText, { color: toastColor }]}>{toastMessage}</Text>
            </Animated.View>
          )}

          <TextInput
            ref={inputRef}
            value={currentGuess}
            onChangeText={(text) => {
              if (isProcessing) return; 
              const filtered = text.replace(/[^A-Za-z]/g, '').toUpperCase();
              setCurrentGuess(filtered);
            }}
            maxLength={5}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="send"
            onSubmitEditing={() => {
              if (isProcessing) return; 
              handleNativeSubmit();
            }}
            editable={!isGameOver} 
            style={styles.hiddenInput}
          />

          <View style={styles.grid}>
            {Array.from({ length: 6 }).map((_, rowIndex) => {
              const isCurrentRow = rowIndex === guesses.length;
              const guess = guesses[rowIndex] || (isCurrentRow ? currentGuess : '');
              const isSubmitted = rowIndex < guesses.length;
              const guessStatuses = isSubmitted ? evaluateGuess(guess, targetWord) : Array(5).fill('unused');
              
              return (
                <Animated.View 
                  key={rowIndex} 
                  style={[styles.row, isCurrentRow && { transform: [{ translateX: shakeAnim }] }]}
                >
                  {Array.from({ length: 5 }).map((_, colIndex) => {
                    const letter = guess[colIndex] || '';
                    return (
                      <Tile 
                        key={colIndex}
                        letter={letter}
                        isSubmitted={isSubmitted}
                        status={guessStatuses[colIndex]} 
                        colIndex={colIndex}
                        onRevealComplete={
                          colIndex === 4 && isSubmitted && rowIndex === revealedGuesses.length 
                            ? () => handleRevealComplete(guess, rowIndex) 
                            : undefined
                        }
                      />
                    );
                  })}
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.trackerContainer}>
            <Text style={styles.trackerTitle}>Letter Tracker</Text>
            <View style={styles.trackerKeyboard}>
              {KEYBOARD_ROWS.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.trackerRow}>
                  {row.map(letter => {
                    const status = getTrackerStatus(letter);
                    let bgColor = 'transparent';
                    let textColor = '#fff';
                    let textDecorationLine: 'none' | 'line-through' = 'none';
                    let opacity = 1;

                    if (status === 'correct') bgColor = '#538D4E';
                    else if (status === 'wrong_position') bgColor = '#B59F3B';
                    else if (status === 'dead') {
                      textColor = '#555';
                      textDecorationLine = 'line-through';
                      opacity = 0.4;
                    }

                    return (
                      <View key={letter} style={[styles.trackerLetterBox, { backgroundColor: bgColor, opacity }]}>
                        <Text style={[styles.trackerLetter, { color: textColor, textDecorationLine }]}>{letter}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121213' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  touchableWrapper: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  
  // 🟢 NEW: Back Button Bar
  topBar: { width: '100%', position: 'absolute', top: 20, left: 16, zIndex: 50 },
  backButton: { padding: 8 },

  headerBlock: { alignItems: 'center', marginTop: 10 },
  header: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subheader: { fontSize: 14, color: '#888', marginBottom: 20 },

  toastContainer: {
    position: 'absolute',
    top: 90, 
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    zIndex: 100, 
  },
  toastText: {
    fontWeight: '900', // Made slightly bolder to match the Bits aesthetic
    fontSize: 16,
    letterSpacing: 1
  },
  
  hiddenInput: { position: 'absolute', top: -1000, width: 1, height: 1, opacity: 0 },

  grid: { gap: 6, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 6 },
  cell: { width: 60, height: 60, borderWidth: 2, justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  cellText: { fontSize: 28, fontWeight: 'bold', color: '#fff' },

  trackerContainer: { width: '96%', padding: 12, backgroundColor: '#1E1E1E', borderRadius: 12, borderWidth: 1, borderColor: '#333', zIndex: 10 },
  trackerTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', textTransform: 'uppercase' },
  trackerKeyboard: { gap: 6, width: '100%' },
  trackerRow: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  trackerLetterBox: { width: TRACKER_KEY_WIDTH, height: TRACKER_KEY_WIDTH * 1.2, justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  trackerLetter: { fontSize: TRACKER_KEY_WIDTH * 0.5, fontWeight: 'bold' }
});