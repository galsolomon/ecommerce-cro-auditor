import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS } from '../constants/colors';

const SIZE      = 96;
const THICKNESS = 7;
const INNER     = SIZE - (THICKNESS + 2) * 2;
const GLOW_SIZE = SIZE + 24;

interface Props {
  timeLeft: number;
  totalTime?: number;
}

export default function Timer({ timeLeft, totalTime = 15 }: Props) {
  const progress = Math.max(0, Math.min(1, timeLeft / totalTime));

  const color =
    progress > 0.6 ? COLORS.timerGreen :
    progress > 0.3 ? COLORS.timerYellow :
    COLORS.timerRed;

  // Two-semicircle clockwise-drain technique
  // At progress=1: both halves show → full ring
  // At progress=0: both halves hidden → empty ring
  const leftRotation  = progress >= 0.5 ? -(1 - progress) * 360 : -180;
  const rightRotation = progress <= 0.5 ? -(0.5 - progress) * 360 : 0;

  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const glowAnim    = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    if (timeLeft <= 5 && timeLeft > 0) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 1.14, duration: 120, useNativeDriver: true }),
          Animated.timing(glowAnim,  { toValue: 0.55, duration: 120, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(glowAnim,  { toValue: 0.2, duration: 200, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [timeLeft]);

  return (
    <Animated.View style={[styles.outer, { transform: [{ scale: scaleAnim }] }]}>
      {/* Glow halo */}
      <Animated.View
        style={[styles.glow, { backgroundColor: color, opacity: glowAnim }]}
        pointerEvents="none"
      />

      {/* Grey track ring */}
      <View style={styles.track} />

      {/* Right half (3 o'clock region) */}
      <View style={[styles.halfWrap, { right: 0 }]}>
        <View style={[
          styles.ring,
          { left: -SIZE / 2, borderColor: color },
          { transform: [{ rotate: `${rightRotation}deg` }] },
        ]} />
      </View>

      {/* Left half (9 o'clock region) */}
      <View style={[styles.halfWrap, { left: 0 }]}>
        <View style={[
          styles.ring,
          { left: 0, borderColor: color },
          { transform: [{ rotate: `${leftRotation}deg` }] },
        ]} />
      </View>

      {/* Inner background + number */}
      <View style={[styles.center, { backgroundColor: COLORS.background }]}>
        <Text style={[styles.number, { color }]}>{timeLeft}</Text>
        <Text style={[styles.secs, { color }]}>sec</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: SIZE,
    height: SIZE,
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    top: -(GLOW_SIZE - SIZE) / 2,
    left: -(GLOW_SIZE - SIZE) / 2,
  },
  track: {
    position: 'absolute',
    top: 0, left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: THICKNESS,
    borderColor: COLORS.cardBorder,
  },
  halfWrap: {
    position: 'absolute',
    top: 0,
    width: SIZE / 2,
    height: SIZE,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: THICKNESS,
  },
  center: {
    position: 'absolute',
    top: THICKNESS + 2,
    left: THICKNESS + 2,
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 28,
    letterSpacing: -1,
  },
  secs: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    opacity: 0.7,
  },
});
