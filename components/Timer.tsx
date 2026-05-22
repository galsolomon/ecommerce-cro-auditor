import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS } from '../constants/colors';

interface Props {
  timeLeft: number;
  totalTime?: number;
}

export default function Timer({ timeLeft, totalTime = 15 }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const color =
    timeLeft > 9 ? COLORS.timerGreen :
    timeLeft > 4 ? COLORS.timerYellow :
    COLORS.timerRed;

  useEffect(() => {
    if (timeLeft <= 5 && timeLeft > 0) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 180, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [timeLeft]);

  return (
    <Animated.View style={[styles.outer, { borderColor: color, transform: [{ scale: pulseAnim }] }]}>
      <View style={[styles.inner, { backgroundColor: color + '22' }]}>
        <Text style={[styles.number, { color }]}>{timeLeft}</Text>
      </View>
    </Animated.View>
  );
}

const SIZE = 90;

const styles = StyleSheet.create({
  outer: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: SIZE - 16,
    height: SIZE - 16,
    borderRadius: (SIZE - 16) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    fontSize: 32,
    fontWeight: '800',
  },
});
