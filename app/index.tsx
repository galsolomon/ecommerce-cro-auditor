import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';

const { width, height } = Dimensions.get('window');

// Floating orb background blobs
const ORBS = [
  { x: -60,         y: height * 0.1,  size: 240, color: '#7C3AED', opacity: 0.18 },
  { x: width - 100, y: height * 0.35, size: 200, color: '#3B82F6', opacity: 0.14 },
  { x: width * 0.2, y: height * 0.65, size: 260, color: '#EC4899', opacity: 0.12 },
  { x: width * 0.5, y: height * 0.08, size: 160, color: '#A855F7', opacity: 0.10 },
];

function FloatingOrb({ x, y, size, color, opacity, i }: typeof ORBS[0] & { i: number }) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 5000 + i * 700, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 5000 + i * 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x, top: y,
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

// Tiny sparkles
const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  size: 2 + Math.random() * 5,
  speed: 3500 + Math.random() * 4000,
  delay: Math.random() * 4000,
  opacity: 0.15 + Math.random() * 0.45,
}));

function Spark({ x, size, speed, delay, opacity }: typeof SPARKS[0]) {
  const y    = useRef(new Animated.Value(height + 20)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = () => {
      y.setValue(height + 20);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(y,    { toValue: -30, duration: speed, delay, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(fade, { toValue: opacity, duration: 500, delay, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0, duration: 400, delay: speed - 400, useNativeDriver: true }),
        ]),
      ]).start(loop);
    };
    loop();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x,
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: COLORS.primaryLight,
        opacity: fade,
        transform: [{ translateY: y }],
      }}
    />
  );
}

export default function HomeScreen() {
  const { dispatch } = useGame();

  const logoY       = useRef(new Animated.Value(-40)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const btnsY       = useRef(new Animated.Value(50)).current;
  const btnsOpacity = useRef(new Animated.Value(0)).current;
  const statsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    dispatch({ type: 'RESET' });
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoY,      { toValue: 0, useNativeDriver: true, tension: 60, friction: 9 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(btnsOpacity,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(btnsY,        { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(statsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <LinearGradient colors={['#0A0914', '#12112A', '#0A0914']} style={styles.container}>
      {/* Background orbs */}
      {ORBS.map((o, i) => <FloatingOrb key={i} {...o} i={i} />)}
      {/* Sparkles */}
      {SPARKS.map(s => <Spark key={s.id} {...s} />)}

      <SafeAreaView style={styles.safe}>
        {/* Hero logo */}
        <Animated.View style={[styles.hero, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
          <View style={styles.iconWrap}>
            <LinearGradient colors={['#A855F7', '#7C3AED']} style={styles.iconBg}>
              <Text style={styles.lightning}>⚡</Text>
            </LinearGradient>
          </View>
          <Text style={styles.trivia}>TRIVIA</Text>
          <Text style={styles.blitz}>BLITZ</Text>
          <Text style={styles.tagline}>Challenge your brain. Beat the clock.</Text>
        </Animated.View>

        {/* Stats row */}
        <Animated.View style={[styles.statsRow, { opacity: statsOpacity }]}>
          {[
            { label: '12', desc: 'Categories' },
            { label: '6',  desc: 'Game Modes' },
            { label: '50', desc: 'Max Players' },
          ].map(s => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statNum}>{s.label}</Text>
              <Text style={styles.statDesc}>{s.desc}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Buttons */}
        <Animated.View style={[styles.buttons, { opacity: btnsOpacity, transform: [{ translateY: btnsY }] }]}>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={() => router.push('/categories')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#9333EA', '#7C3AED', '#6D28D9']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.playGrad}
            >
              <Text style={styles.playIcon}>🎮</Text>
              <Text style={styles.playText}>PLAY NOW</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => router.push('/join')}
            activeOpacity={0.82}
          >
            <Text style={styles.joinText}>🔗  JOIN GAME</Text>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.footer}>Powered by Open Trivia DB</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 12,
  },
  hero: { alignItems: 'center', paddingTop: 20 },
  iconWrap: {
    marginBottom: 20,
    borderRadius: 28,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  iconBg: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
  },
  lightning: { fontSize: 48 },
  trivia: {
    fontSize: 54,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 8,
    lineHeight: 56,
    textShadowColor: 'rgba(168,85,247,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  blitz: {
    fontSize: 54,
    fontWeight: '900',
    color: COLORS.primaryLight,
    letterSpacing: 14,
    lineHeight: 58,
    textShadowColor: 'rgba(167,139,250,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  tagline: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.5,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 0,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginHorizontal: 32,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: COLORS.cardBorder,
  },
  statNum:  { color: COLORS.primaryLight, fontSize: 22, fontWeight: '900' },
  statDesc: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },

  buttons: { width: '100%', paddingHorizontal: 28, gap: 12 },
  playBtn: {
    borderRadius: 22,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  playGrad: {
    flexDirection: 'row',
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 22,
  },
  playIcon: { fontSize: 22 },
  playText: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 3 },

  joinBtn: {
    paddingVertical: 17,
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight + '88',
    backgroundColor: COLORS.primaryLight + '0D',
  },
  joinText: { color: COLORS.primaryLight, fontSize: 16, fontWeight: '700', letterSpacing: 1 },

  footer: { color: COLORS.textMuted, fontSize: 11, marginBottom: 4 },
});
