import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, View } from 'react-native';
import { COLORS } from '../constants/colors';

interface Props {
  label: string;
  text: string;
  color: string;
  onPress: () => void;
  state: 'idle' | 'selected' | 'correct' | 'wrong' | 'disabled';
}

export default function AnswerButton({ label, text, color, onPress, state }: Props) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, delay: 50 }).start();
  }, []);

  useEffect(() => {
    if (state === 'wrong') {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 6,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [state]);

  const bgColor =
    state === 'correct'  ? COLORS.correct :
    state === 'wrong'    ? COLORS.wrong :
    state === 'selected' ? color :
    state === 'disabled' ? COLORS.card :
    COLORS.card;

  const borderColor =
    state === 'correct'  ? COLORS.correct :
    state === 'wrong'    ? COLORS.wrong :
    state === 'selected' ? color :
    color;

  const opacity = state === 'disabled' ? 0.4 : 1;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity,
          transform: [
            { scale: scaleAnim },
            { translateX: shakeAnim },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.button, { backgroundColor: bgColor, borderColor }]}
        onPress={onPress}
        activeOpacity={0.8}
        disabled={state !== 'idle'}
      >
        <View style={[styles.badge, { backgroundColor: borderColor }]}>
          <Text style={styles.badgeText}>{label}</Text>
        </View>
        <Text style={styles.answerText} numberOfLines={2}>{text}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginVertical: 5 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    gap: 12,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  answerText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
});
