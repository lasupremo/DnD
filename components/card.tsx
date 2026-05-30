import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal } from 'react-native';
import { Image } from 'expo-image';

interface FigmaCardProps {
  title: string;
  mediaUrl: string;
  rarityName: string;
  rarityColor: string;
  onClose: () => void;
}

export default function FigmaCard({ title, mediaUrl, rarityName, rarityColor, onClose }: FigmaCardProps) {
  const [isZoomedCard, setIsZoomedCard] = useState(false);
  const lastTapRef = useRef<number>(0);
  
  // 🟢 State to track the 2-second Covert glitch phase
  const [isGlitching, setIsGlitching] = useState(false);
  
  // 🟢 CONTRABAND Animation Refs
  const shineAnim = useRef(new Animated.Value(0)).current;      
  const levitateAnim = useRef(new Animated.Value(0)).current;   
  
  // 🟢 NEW: 360-Degree Perimeter Particle Engine (70 embers bleeding from all 4 sides)
  const particles = useRef(
    Array.from({ length: 70 }).map(() => {
      // Pick a random edge (0: Top, 1: Right, 2: Bottom, 3: Left)
      const edge = Math.floor(Math.random() * 4); 
      let startX, startY, driftX, driftY;

      if (edge === 0) {
        // --- TOP EDGE ---
        startX = Math.random() * 348;                  // Anywhere across the width
        startY = Math.random() * 15;                   // Clamped to the top 15 pixels
        driftX = (Math.random() - 0.5) * 40;           // Slight horizontal sway
        driftY = -(Math.random() * 50 + 20);           // Drifts strongly UP
      } 
      else if (edge === 1) {
        // --- RIGHT EDGE ---
        startX = 333 + Math.random() * 15;             // Clamped to the right 15 pixels
        startY = Math.random() * 528;                  // Anywhere across the height
        driftX = Math.random() * 50 + 20;              // Drifts strongly RIGHT
        driftY = (Math.random() - 0.5) * 40;           // Slight vertical sway
      } 
      else if (edge === 2) {
        // --- BOTTOM EDGE ---
        startX = Math.random() * 348;                  // Anywhere across the width
        startY = 513 + Math.random() * 15;             // Clamped to the bottom 15 pixels
        driftX = (Math.random() - 0.5) * 40;           // Slight horizontal sway
        driftY = Math.random() * 50 + 20;              // Drifts strongly DOWN
      } 
      else {
        // --- LEFT EDGE ---
        startX = Math.random() * 15;                   // Clamped to the left 15 pixels
        startY = Math.random() * 528;                  // Anywhere across the height
        driftX = -(Math.random() * 50 + 20);           // Drifts strongly LEFT
        driftY = (Math.random() - 0.5) * 40;           // Slight vertical sway
      }

      return {
        progress: new Animated.Value(0),
        startX,
        startY,
        driftX,
        driftY,
        size: Math.random() * 5 + 2,          // Random size (2px to 7px)
        delay: Math.random() * 4000,          // Staggered initial spawn times (0s to 4s)
        duration: Math.random() * 2000 + 2000 // Float speed (2s to 4s)
      };
    })
  ).current;

  // 🟢 COVERT Animation Refs
  const scanAnim = useRef(new Animated.Value(0)).current; 
  const alarmFlickerAnim = useRef(new Animated.Value(1)).current; 
  const colorPhase = useRef(new Animated.Value(0)).current; 
  const glitchLayerOpacity = useRef(new Animated.Value(1)).current;
  const laserOpacityAnim = useRef(new Animated.Value(0)).current; 

  function handleCardTap() {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300; 
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      setIsZoomedCard(true);
    }
    lastTapRef.current = now;
  }

  useEffect(() => {
    // Reset everything first
    shineAnim.stopAnimation();
    levitateAnim.stopAnimation();
    scanAnim.stopAnimation();
    alarmFlickerAnim.stopAnimation();
    colorPhase.stopAnimation();
    glitchLayerOpacity.stopAnimation();
    laserOpacityAnim.stopAnimation();
    particles.forEach(p => p.progress.stopAnimation());

    if (rarityName.toLowerCase() === 'contraband') {
      setIsGlitching(false);
      
      Animated.parallel([
        // 1. Holographic Foil Sweep
        Animated.loop(Animated.sequence([
          Animated.timing(shineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.delay(1200),
        ])),
        // 2. Divine Levitation (Smooth Up and Down)
        Animated.loop(Animated.sequence([
          Animated.timing(levitateAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
          Animated.timing(levitateAnim, { toValue: 0, duration: 2500, useNativeDriver: true }),
        ]))
      ]).start();

      // 3. 🟢 Start the Floating Particles (Continuous stream fix)
      particles.forEach(p => {
        p.progress.setValue(0);
        Animated.sequence([
          Animated.delay(p.delay), // 🟢 Delay only happens ONCE at the start to stagger them
          Animated.loop(
            Animated.timing(p.progress, { 
              toValue: 1, 
              duration: p.duration, 
              useNativeDriver: true 
            }) // 🟢 The loop now runs infinitely with zero pauses!
          )
        ]).start();
      });

    } 
    else if (rarityName.toLowerCase() === 'covert') {
      setIsGlitching(true);
      glitchLayerOpacity.setValue(1); 
      colorPhase.setValue(0);

      const colorLoop = Animated.loop(
        Animated.timing(colorPhase, { toValue: 1, duration: 300, useNativeDriver: false })
      );
      colorLoop.start();

      const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
        setIsGlitching(false);
        colorLoop.stop();

        Animated.timing(glitchLayerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();

        // Tactical Laser
        Animated.sequence([
          Animated.timing(laserOpacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 1, duration: 1800, useNativeDriver: true }), 
          Animated.timing(scanAnim, { toValue: 0, duration: 1800, useNativeDriver: true }), 
          Animated.timing(scanAnim, { toValue: 1, duration: 1800, useNativeDriver: true }), 
          Animated.timing(scanAnim, { toValue: 0, duration: 1800, useNativeDriver: true }), 
          Animated.timing(laserOpacityAnim, { toValue: 0, duration: 800, useNativeDriver: true }) 
        ]).start();

        // Background Alarm Flicker
        Animated.loop(Animated.sequence([
          Animated.timing(alarmFlickerAnim, { toValue: 0.3, duration: 50, useNativeDriver: true }),
          Animated.timing(alarmFlickerAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(alarmFlickerAnim, { toValue: 0.5, duration: 50, useNativeDriver: true }),
          Animated.timing(alarmFlickerAnim, { toValue: 1, duration: 3000, useNativeDriver: true }), 
        ])).start();

      }, 2000); 

      return () => clearTimeout(timer);
    } 
    else {
      // Idle for Standard Rarities
      setIsGlitching(false);
      shineAnim.setValue(0);
      levitateAnim.setValue(0);
      scanAnim.setValue(0);
      alarmFlickerAnim.setValue(1);
      laserOpacityAnim.setValue(0);
    }
  }, [rarityName]);

  // --- Interpolations ---
  const glitchBorderColor = colorPhase.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: ['#FF0000', '#00FFFF', '#FFFFFF', '#000000', '#FF00FF', '#FF0000'] 
  });

  const cardTranslateY = rarityName.toLowerCase() === 'contraband' ? levitateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20] 
  }) : 0;

  const shadowOpacity = levitateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.5] 
  });

  return (
    <>
      {/* --- 🟢 THE FIX: Fullscreen Modal (Draws over the screen without killing the card!) --- */}
      <Modal visible={isZoomedCard} transparent={true} animationType="fade">
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity style={styles.fullscreenCloseBtn} onPress={() => setIsZoomedCard(false)}>
            <Text style={styles.fullscreenCloseText}>Done</Text>
          </TouchableOpacity>
          <Image source={{ uri: mediaUrl }} style={styles.fullscreenMedia} contentFit="contain" />
        </View>
      </Modal>

      {/* --- Main Wrapper --- */}
    <View style={styles.wrapper}>
      
      {/* --- Main Card (Levitating Wrapper) --- */}
      <Animated.View style={[styles.figmaCardContainer, { transform: [{ translateY: cardTranslateY }] }]}>
        
        {/* --- CONTRABAND Divine Shadow --- */}
        {rarityName.toLowerCase() === 'contraband' && !isGlitching && (
          <Animated.View style={[
            styles.glowBackground, 
            { backgroundColor: rarityColor, shadowColor: rarityColor, opacity: shadowOpacity }
          ]} />
        )}

        {/* --- COVERT Flickering Alarm Glow --- */}
        {rarityName.toLowerCase() === 'covert' && !isGlitching && (
          <Animated.View style={[
            styles.glowBackground, 
            { backgroundColor: rarityColor, shadowColor: rarityColor, shadowRadius: 30, opacity: alarmFlickerAnim }
          ]} />
        )}

        {/* Base Border */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: rarityColor, borderRadius: 24, overflow: 'hidden' }]} />

        {/* Covert Glitch Border Overlay */}
        {rarityName.toLowerCase() === 'covert' && (
          <Animated.View 
            style={[StyleSheet.absoluteFill, { backgroundColor: glitchBorderColor, opacity: glitchLayerOpacity, borderRadius: 24, overflow: 'hidden' }]} 
          />
        )}

        {/* Card Artwork */}
        <TouchableOpacity activeOpacity={0.9} onPress={handleCardTap} style={styles.figmaImageTouch}>
          <Image source={{ uri: mediaUrl }} style={styles.figmaImageInner} contentFit="cover" />
        </TouchableOpacity>

        {/* --- 🟢 THE FIX: Ethereal Particles MOVED HERE (On top of the artwork!) --- */}
        {rarityName.toLowerCase() === 'contraband' && !isGlitching && particles.map((p, index) => (
          <Animated.View
            key={index}
            pointerEvents="none" /* 🟢 Crucial: Ensures particles don't block user taps! */
            style={[
              styles.particle,
              {
                backgroundColor: rarityColor,
                shadowColor: rarityColor,
                left: p.startX,
                top: p.startY,
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                opacity: p.progress.interpolate({ 
                  inputRange: [0, 0.2, 0.8, 1], 
                  outputRange: [0, 1, 1, 0] 
                }),
                transform: [
                  { translateX: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.driftX] }) },
                  { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.driftY] }) },
                  { scale: p.progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1.2, 0.5] }) }
                ]
              }
            ]}
          />
        ))}

        {/* --- 🟢 NEW: CONTRABAND Full-Face Holographic Foil Overlay --- */}
        {rarityName.toLowerCase() === 'contraband' && !isGlitching && (
          <Animated.View
            pointerEvents="none" /* Crucial: Allows double taps to pass through to the image */
            style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}
          >
            <Animated.View
              style={[
                styles.holoWrapper,
                { transform: [{ rotate: '25deg' }, { translateX: shineAnim.interpolate({ inputRange: [0, 1], outputRange: [-500, 700] }) }] }
              ]}
            >
              <View style={styles.holoGold} />
              <View style={styles.holoWhite} />
              <View style={styles.holoSilver} />
            </Animated.View>
          </Animated.View>
        )}

        {/* Card Footer */}
        <View style={styles.figmaFooter}>
          <Text style={styles.figmaFooterTitle} numberOfLines={1}>{title}</Text>
          <Text style={[styles.figmaFooterRarity, { color: rarityColor }]}>{rarityName.toUpperCase()}</Text>
        </View>

        <TouchableOpacity style={styles.figmaCloseBtn} onPress={onClose}>
          <Text style={styles.figmaCloseX}>✕</Text>
        </TouchableOpacity>

        {/* --- Covert Laser Scan --- */}
        {rarityName.toLowerCase() === 'covert' && !isGlitching && (
          <Animated.View
            pointerEvents="none" 
            style={[
              styles.laserScanner, 
              { 
                opacity: laserOpacityAnim,
                transform: [{ translateY: scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 528] }) }] 
              }
            ]}
          />
        )}

      </Animated.View>
    </View> 
    </>
  );
}

const styles = StyleSheet.create({
  fullscreenCloseBtn: { position: 'absolute', top: 60, right: 24, zIndex: 10, backgroundColor: 'rgba(30,30,30,0.8)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  fullscreenCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fullscreenMedia: { width: '100%', height: '100%' },
  // 🟢 NEW: Darkens the background behind the zoomed image
  fullscreenContainer: { 
    flex: 1, 
    backgroundColor: 'rgba(0, 0, 0, 0.95)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },

  wrapper: { justifyContent: 'center', alignItems: 'center' },
  glowBackground: { ...StyleSheet.absoluteFillObject, borderRadius: 24, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 60, elevation: 40 },

  figmaCardContainer: { width: 348, height: 528, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 },
  figmaImageTouch: { position: 'absolute', top: 9, left: 6, width: 336, height: 470, borderRadius: 18, overflow: 'hidden' }, 
  figmaImageInner: { width: '100%', height: '100%', backgroundColor: '#111' },
  figmaFooter: { position: 'absolute', bottom: 9, left: 6, width: 336, height: 50, backgroundColor: '#111111', borderBottomLeftRadius: 18, borderBottomRightRadius: 18, justifyContent: 'center', paddingHorizontal: 21 },
  figmaFooterTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  figmaFooterRarity: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  figmaCloseBtn: { position: 'absolute', top: -44, left: 12, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  figmaCloseX: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: -2 },
  
  // 🟢 UPDATED: Premium Holographic Foil Overlay Styles
  holoWrapper: { position: 'absolute', top: -250, bottom: -250, width: 200, flexDirection: 'row' },
  holoGold: { flex: 1.5, backgroundColor: 'rgba(255, 215, 0, 0.25)' }, // Lowered opacity so art shows through
  holoWhite: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.45)' }, 
  holoSilver: { flex: 2, backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  
  // 🟢 NEW: Particle Styles
  particle: { position: 'absolute', top: 0, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8, elevation: 5 },

  laserScanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3, 
    backgroundColor: '#fff', 
    shadowColor: '#FF0000', 
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 10, 
  },
});