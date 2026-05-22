import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';

const { width } = Dimensions.get('window');

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  size: 4 + Math.random() * 8,
  speed: 3000 + Math.random() * 5000,
  delay: Math.random() * 3000,
  opacity: 0.1 + Math.random() * 0.4,
}));

function Particle({ x, size, speed, delay, opacity }: (typeof PARTICLES)[0]) {
  const y = useRef(new Animated.Value(800)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = () => {
      y.setValue(800);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(y,    { toValue: -50, duration: speed, delay, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(fade, { toValue: opacity, duration: 400, delay, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0, duration: 400, delay: speed - 400, useNativeDriver: true }),
        ]),
      ]).start(loop);
    };
    loop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        width: size,
        height: size,
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
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const buttonsY = useRef(new Animated.Value(40)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    dispatch({ type: 'RESET' });
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(buttonsOpacity, { toValue: 1, duration: 500, delay: 400, useNativeDriver: true }),
      Animated.timing(buttonsY, { toValue: 0, duration: 500, delay: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E', '#0F0E17']} style={styles.container}>
      {PARTICLES.map(p => <Particle key={p.id} {...p} />)}
      <SafeAreaView style={styles.safe}>
        <View style={styles.logoArea}>
          <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity }}>
            <Text style={styles.lightning}>⚡</Text>
            <Text style={styles.titleTrivia}>TRIVIA</Text>
            <Text style={styles.titleBlitz}>BLITZ</Text>
            <Text style={styles.subtitle}>Test your knowledge</Text>
          </Animated.View>
        </View>

        <Animated.View
          style={[styles.buttons, { opacity: buttonsOpacity, transform: [{ translateY: buttonsY }] }]}
        >
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => router.push('/categories')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#7C3AED', '#A855F7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.playGradient}
            >
              <Text style={styles.playText}>🎮  PLAY NOW</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => router.push('/join')}
            activeOpacity={0.85}
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
  safe: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  logoArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lightning: { fontSize: 64, textAlign: 'center', marginBottom: 8 },
  titleTrivia: {
    fontSize: 52,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 6,
    lineHeight: 54,
  },
  titleBlitz: {
    fontSize: 52,
    fontWeight: '900',
    color: COLORS.primaryLight,
    textAlign: 'center',
    letterSpacing: 12,
    lineHeight: 56,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 1,
  },
  buttons: { width: '100%', paddingHorizontal: 32, gap: 14, marginBottom: 20 },
  playButton: { borderRadius: 20, overflow: 'hidden', elevation: 8 },
  playGradient: { paddingVertical: 18, alignItems: 'center', borderRadius: 20 },
  playText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  joinButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
  },
  joinText: { color: COLORS.primaryLight, fontSize: 17, fontWeight: '700', letterSpacing: 1 },
  footer: { color: COLORS.textMuted, fontSize: 12, marginBottom: 4 },
});
