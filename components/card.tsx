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

// 🟣 CLASSIFIED: The 5 rune shapes, each described as a series of SVG-like draw instructions
// We draw them purely with View/border tricks so there's no SVG dependency
const RUNE_CONFIGS = [
  { key: 'circle-cross' },   // ⊕ Circle with cross inside
  { key: 'triangle' },       // △ Triangle outline
  { key: 'square-split' },   // ⊟ Square with horizontal split
  { key: 'circle-x' },       // ⊗ Circle with X inside
  { key: 'triangle-dot' },   // ▲ Triangle with vertical line
]

// 🟣 CLASSIFIED: 8 rune spawn positions spread across the card face (x%, y% of 336x470)
const RUNE_POSITIONS = [
  { left: 12,  top: 18  },
  { left: 82,  top: 14  },
  { left: 8,   top: 55  },
  { left: 85,  top: 58  },
  { left: 45,  top: 30  },
  { left: 22,  top: 80  },
  { left: 70,  top: 82  },
  { left: 50,  top: 68  },
]

// 🟣 CLASSIFIED: Renders a single rune symbol using pure React Native views
function RuneSymbol({ type, color }: { type: string; color: string }) {
  const s = StyleSheet.create({
    // Wrapper is now 36×36 (was 18×18) — doubles the visual footprint on the card
    wrap: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    // Circle scaled from 14→28px, border thickened from 1.2→2px
    circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: color, justifyContent: 'center', alignItems: 'center' },
    // Internal lines scaled proportionally, height 1→2px for visibility
    hLine: { position: 'absolute', width: 20, height: 2, backgroundColor: color },
    vLine: { position: 'absolute', width: 2, height: 20, backgroundColor: color },
    diagLine1: { position: 'absolute', width: 20, height: 2, backgroundColor: color, transform: [{ rotate: '45deg' }] },
    diagLine2: { position: 'absolute', width: 20, height: 2, backgroundColor: color, transform: [{ rotate: '-45deg' }] },
    // Square scaled from 12→24px, border thickened from 1.2→2px
    square: { width: 24, height: 24, borderWidth: 2, borderColor: color, borderRadius: 3, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    squareLine: { width: 24, height: 2, backgroundColor: color },
  })

  if (type === 'circle-cross') {
    return (
      <View style={s.wrap}>
        <View style={s.circle}>
          <View style={s.hLine} />
          <View style={s.vLine} />
        </View>
      </View>
    )
  }

  if (type === 'triangle') {
    return (
      <View style={s.wrap}>
        <View style={{
          width: 0, height: 0,
          // Scaled from 7/7/13 → 14/14/26
          borderLeftWidth: 14, borderRightWidth: 14, borderBottomWidth: 26,
          borderLeftColor: 'transparent', borderRightColor: 'transparent',
          borderBottomColor: color,
          opacity: 0.85,
        }} />
      </View>
    )
  }

  if (type === 'square-split') {
    return (
      <View style={s.wrap}>
        <View style={s.square}>
          <View style={s.squareLine} />
        </View>
      </View>
    )
  }

  if (type === 'circle-x') {
    return (
      <View style={s.wrap}>
        <View style={s.circle}>
          <View style={s.diagLine1} />
          <View style={s.diagLine2} />
        </View>
      </View>
    )
  }

  if (type === 'triangle-dot') {
    return (
      <View style={s.wrap}>
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 0, height: 0,
            // Scaled from 7/7/12 → 14/14/24
            borderLeftWidth: 14, borderRightWidth: 14, borderBottomWidth: 24,
            borderLeftColor: 'transparent', borderRightColor: 'transparent',
            borderBottomColor: color,
            opacity: 0.85,
          }} />
          {/* Dot scaled from 2.5→5px */}
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color, marginTop: 4 }} />
        </View>
      </View>
    )
  }

  return null
}

export default function FigmaCard({ title, mediaUrl, rarityName, rarityColor, onClose }: FigmaCardProps) {
  const [isZoomedCard, setIsZoomedCard] = useState(false);
  const lastTapRef = useRef<number>(0);

  const [isGlitching, setIsGlitching] = useState(false);

  // --- CONTRABAND Refs ---
  const shineAnim = useRef(new Animated.Value(0)).current;
  const levitateAnim = useRef(new Animated.Value(0)).current;

  // --- CONTRABAND Particles ---
  const particles = useRef(
    Array.from({ length: 70 }).map(() => {
      const edge = Math.floor(Math.random() * 4);
      let startX, startY, driftX, driftY;
      if (edge === 0) {
        startX = Math.random() * 348; startY = Math.random() * 15;
        driftX = (Math.random() - 0.5) * 40; driftY = -(Math.random() * 50 + 20);
      } else if (edge === 1) {
        startX = 333 + Math.random() * 15; startY = Math.random() * 528;
        driftX = Math.random() * 50 + 20; driftY = (Math.random() - 0.5) * 40;
      } else if (edge === 2) {
        startX = Math.random() * 348; startY = 513 + Math.random() * 15;
        driftX = (Math.random() - 0.5) * 40; driftY = Math.random() * 50 + 20;
      } else {
        startX = Math.random() * 15; startY = Math.random() * 528;
        driftX = -(Math.random() * 50 + 20); driftY = (Math.random() - 0.5) * 40;
      }
      return {
        progress: new Animated.Value(0),
        startX, startY, driftX, driftY,
        size: Math.random() * 5 + 2,
        delay: Math.random() * 4000,
        duration: Math.random() * 2000 + 2000,
      };
    })
  ).current;

  // --- COVERT Refs ---
  const scanAnim = useRef(new Animated.Value(0)).current;
  const alarmFlickerAnim = useRef(new Animated.Value(1)).current;
  const colorPhase = useRef(new Animated.Value(0)).current;
  const glitchLayerOpacity = useRef(new Animated.Value(1)).current;
  const laserOpacityAnim = useRef(new Animated.Value(0)).current;

  // 🟣 CLASSIFIED: 8 independent Animated.Values — one per rune position
  const runeAnims = useRef(
    RUNE_POSITIONS.map(() => new Animated.Value(0))
  ).current;

  // 🟣 CLASSIFIED: Slow border pulse (opacity of a highlight overlay)
  const classifiedBorderAnim = useRef(new Animated.Value(0)).current;

  // 🔵 RESTRICTED: Pulsing glow only
  const restrictedGlowAnim = useRef(new Animated.Value(0)).current;

  function handleCardTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) setIsZoomedCard(true);
    lastTapRef.current = now;
  }

  useEffect(() => {
    // Stop everything first
    shineAnim.stopAnimation();
    levitateAnim.stopAnimation();
    scanAnim.stopAnimation();
    alarmFlickerAnim.stopAnimation();
    colorPhase.stopAnimation();
    glitchLayerOpacity.stopAnimation();
    laserOpacityAnim.stopAnimation();
    particles.forEach(p => p.progress.stopAnimation());
    runeAnims.forEach(a => a.stopAnimation());
    classifiedBorderAnim.stopAnimation();
    restrictedGlowAnim.stopAnimation();

    const rarity = rarityName.toLowerCase();

    if (rarity === 'contraband') {
      setIsGlitching(false);

      Animated.parallel([
        Animated.loop(Animated.sequence([
          Animated.timing(shineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.delay(1200),
        ])),
        Animated.loop(Animated.sequence([
          Animated.timing(levitateAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
          Animated.timing(levitateAnim, { toValue: 0, duration: 2500, useNativeDriver: true }),
        ]))
      ]).start();

      particles.forEach(p => {
        p.progress.setValue(0);
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.loop(
            Animated.timing(p.progress, { toValue: 1, duration: p.duration, useNativeDriver: true })
          )
        ]).start();
      });

    } else if (rarity === 'covert') {
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

        Animated.sequence([
          Animated.timing(laserOpacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
          Animated.timing(laserOpacityAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]).start();

        Animated.loop(Animated.sequence([
          Animated.timing(alarmFlickerAnim, { toValue: 0.3, duration: 50, useNativeDriver: true }),
          Animated.timing(alarmFlickerAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(alarmFlickerAnim, { toValue: 0.5, duration: 50, useNativeDriver: true }),
          Animated.timing(alarmFlickerAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
        ])).start();
      }, 2000);

      return () => clearTimeout(timer);

    } else if (rarity === 'classified') {
      // 🟣 CLASSIFIED: Stagger each rune's fade-in/out loop with a different base delay
      // Each rune fades in, holds briefly, then fades out — on its own personal rhythm
      setIsGlitching(false);

      runeAnims.forEach((anim, i) => {
        anim.setValue(0);

        // Each rune gets a slightly different cycle duration so they never all peak together
        const fadeDuration = 700 + i * 80;       // 700ms–1260ms fade
        const holdDuration = 900 + i * 120;      // 900ms–1740ms fully visible
        const pauseDuration = 1200 + i * 200;    // 1200ms–2600ms dark between cycles
        const initialDelay = i * 430;            // Stagger startup so they cascade in

        Animated.sequence([
          Animated.delay(initialDelay),
          Animated.loop(
            Animated.sequence([
              // Fade IN
              Animated.timing(anim, { toValue: 1, duration: fadeDuration, useNativeDriver: true }),
              // Hold
              Animated.delay(holdDuration),
              // Fade OUT
              Animated.timing(anim, { toValue: 0, duration: fadeDuration, useNativeDriver: true }),
              // Dark pause before next cycle
              Animated.delay(pauseDuration),
            ])
          )
        ]).start();
      });

      // 🟣 CLASSIFIED: Border glow pulses slowly on a 3s loop, independent of runes
      Animated.loop(
        Animated.sequence([
          Animated.timing(classifiedBorderAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(classifiedBorderAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      ).start();



    } else if (rarity === 'restricted') {
      // 🔵 RESTRICTED: Simple breathing glow — same pulse mechanic as Classified, no extras
      setIsGlitching(false);
      restrictedGlowAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(restrictedGlowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(restrictedGlowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      ).start();

    } else {
      // Idle for all other rarities
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
    outputRange: ['#FF0000', '#00FFFF', '#FFFFFF', '#000000', '#FF00FF', '#FF0000'],
  });

  const cardTranslateY = rarityName.toLowerCase() === 'contraband'
    ? levitateAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] })
    : 0;

  const shadowOpacity = levitateAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });

  // 🟣 CLASSIFIED: Border overlay opacity — soft purple glow that breathes
  const classifiedBorderOpacity = classifiedBorderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.0, 0.75],
  });

  // 🔵 RESTRICTED: Glow opacity — breathes between invisible and 0.75 on a 3s loop
  const restrictedGlowOpacity = restrictedGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.0, 0.75],
  });

  return (
    <>
      <Modal visible={isZoomedCard} transparent={true} animationType="fade">
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity style={styles.fullscreenCloseBtn} onPress={() => setIsZoomedCard(false)}>
            <Text style={styles.fullscreenCloseText}>Done</Text>
          </TouchableOpacity>
          <Image source={{ uri: mediaUrl }} style={styles.fullscreenMedia} contentFit="contain" />
        </View>
      </Modal>

      <View style={styles.wrapper}>
        <Animated.View style={[styles.figmaCardContainer, { transform: [{ translateY: cardTranslateY }] }]}>

          {/* CONTRABAND Divine Shadow */}
          {rarityName.toLowerCase() === 'contraband' && !isGlitching && (
            <Animated.View style={[
              styles.glowBackground,
              { backgroundColor: rarityColor, shadowColor: rarityColor, opacity: shadowOpacity }
            ]} />
          )}

          {/* COVERT Flickering Alarm Glow */}
          {rarityName.toLowerCase() === 'covert' && !isGlitching && (
            <Animated.View style={[
              styles.glowBackground,
              { backgroundColor: rarityColor, shadowColor: rarityColor, shadowRadius: 30, opacity: alarmFlickerAnim }
            ]} />
          )}

          {/* 🟣 CLASSIFIED: Soft pulsing glow behind the border */}
          {rarityName.toLowerCase() === 'classified' && (
            <Animated.View style={[
              styles.glowBackground,
              {
                backgroundColor: rarityColor,
                shadowColor: rarityColor,
                opacity: classifiedBorderOpacity,
              }
            ]} />
          )}

          {/* 🔵 RESTRICTED: Pulsing glow — same spread as Classified, no other effects */}
          {rarityName.toLowerCase() === 'restricted' && (
            <Animated.View style={[
              styles.glowBackground,
              {
                backgroundColor: rarityColor,
                shadowColor: rarityColor,
                opacity: restrictedGlowOpacity,
              }
            ]} />
          )}

          {/* Base Border */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: rarityColor, borderRadius: 24, overflow: 'hidden' }]} />

          {/* COVERT Glitch Border Overlay */}
          {rarityName.toLowerCase() === 'covert' && (
            <Animated.View
              style={[StyleSheet.absoluteFill, {
                backgroundColor: glitchBorderColor,
                opacity: glitchLayerOpacity,
                borderRadius: 24,
                overflow: 'hidden',
              }]}
            />
          )}

          {/* Card Artwork */}
          <TouchableOpacity activeOpacity={0.9} onPress={handleCardTap} style={styles.figmaImageTouch}>
            <Image source={{ uri: mediaUrl }} style={styles.figmaImageInner} contentFit="cover" />
          </TouchableOpacity>

          {/* CONTRABAND Ethereal Particles */}
          {rarityName.toLowerCase() === 'contraband' && !isGlitching && particles.map((p, index) => (
            <Animated.View
              key={index}
              pointerEvents="none"
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
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    { translateX: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.driftX] }) },
                    { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.driftY] }) },
                    { scale: p.progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1.2, 0.5] }) },
                  ],
                }
              ]}
            />
          ))}

          {/* CONTRABAND Holographic Foil Overlay */}
          {rarityName.toLowerCase() === 'contraband' && !isGlitching && (
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}
            >
              <Animated.View
                style={[
                  styles.holoWrapper,
                  {
                    transform: [
                      { rotate: '25deg' },
                      { translateX: shineAnim.interpolate({ inputRange: [0, 1], outputRange: [-500, 700] }) },
                    ],
                  }
                ]}
              >
                <View style={styles.holoGold} />
                <View style={styles.holoWhite} />
                <View style={styles.holoSilver} />
              </Animated.View>
            </Animated.View>
          )}

          {/* 🟣 CLASSIFIED: Arcane Sigils — 8 runes scattered across the card face */}
          {rarityName.toLowerCase() === 'classified' && RUNE_POSITIONS.map((pos, i) => (
            <Animated.View
              key={`rune-${i}`}
              pointerEvents="none"
              style={[
                styles.runeWrapper,
                {
                  // Convert percentage positions to absolute pixel positions within the art area
                  left: 6 + (pos.left / 100) * 336,
                  top: 9 + (pos.top / 100) * 470,
                  opacity: runeAnims[i],
                  transform: [
                    // 🟣 Each rune gently scales up as it appears, adding a materialization feel
                    {
                      scale: runeAnims[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
                      }),
                    },
                  ],
                }
              ]}
            >
              <RuneSymbol
                type={RUNE_CONFIGS[i % RUNE_CONFIGS.length].key}
                color={rarityColor}
              />
            </Animated.View>
          ))}

          {/* Card Footer */}
          <View style={styles.figmaFooter}>
            <Text style={styles.figmaFooterTitle} numberOfLines={1}>{title}</Text>
            <Text style={[styles.figmaFooterRarity, { color: rarityColor }]}>{rarityName.toUpperCase()}</Text>
          </View>

          <TouchableOpacity style={styles.figmaCloseBtn} onPress={onClose}>
            <Text style={styles.figmaCloseX}>✕</Text>
          </TouchableOpacity>

          {/* COVERT Laser Scan */}
          {rarityName.toLowerCase() === 'covert' && !isGlitching && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.laserScanner,
                {
                  opacity: laserOpacityAnim,
                  transform: [{
                    translateY: scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 528] }),
                  }],
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
  fullscreenContainer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.95)', justifyContent: 'center', alignItems: 'center' },

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

  holoWrapper: { position: 'absolute', top: -250, bottom: -250, width: 200, flexDirection: 'row' },
  holoGold: { flex: 1.5, backgroundColor: 'rgba(255, 215, 0, 0.25)' },
  holoWhite: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.45)' },
  holoSilver: { flex: 2, backgroundColor: 'rgba(255, 255, 255, 0.15)' },

  particle: { position: 'absolute', top: 0, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8, elevation: 5 },

  // 🟣 CLASSIFIED: Rune wrapper — absolutely positioned over the card art
  runeWrapper: {
    position: 'absolute',
    zIndex: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },

  laserScanner: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#fff', shadowColor: '#FF0000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 5, zIndex: 10 },
});