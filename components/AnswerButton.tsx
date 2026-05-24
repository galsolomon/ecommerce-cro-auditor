import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';

interface Props {
  label: string;
  text: string;
  color: string;
  onPress: () => void;
  state: 'idle' | 'selected' | 'correct' | 'wrong' | 'disabled';
  index?: number;
}

const STATE_ICONS: Record<string, string> = { correct: '✓', wrong: '✗' };

export default function AnswerButton({ label, text, color, onPress, state, index = 0 }: Props) {
  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 280, delay: index * 55, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (state === 'wrong') {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8,  duration: 55, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5,  duration: 55, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,  duration: 55, useNativeDriver: true }),
      ]).start();
    }
    if (state === 'correct') {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.04, duration: 100, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1,    duration: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [state]);

  const isRevealed = state === 'correct' || state === 'wrong';
  const isActive   = state === 'selected' || state === 'correct';
  const isDisabled = state === 'disabled';

  const bgColor =
    state === 'correct'  ? COLORS.correct + '33' :
    state === 'wrong'    ? COLORS.wrong   + '22' :
    state === 'selected' ? color           + '22' :
    'transparent';

  const borderColor =
    state === 'correct'  ? COLORS.correct :
    state === 'wrong'    ? COLORS.wrong :
    state === 'selected' ? color :
    state === 'disabled' ? COLORS.cardBorder :
    color + 'BB';

  const badgeBg =
    state === 'correct'  ? COLORS.correct :
    state === 'wrong'    ? COLORS.wrong :
    state === 'selected' ? color :
    isDisabled           ? COLORS.textMuted :
    color;

  return (
    <Animated.View
      style={{
        opacity: isDisabled ? fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }) : fadeAnim,
        transform: [{ translateY: slideAnim }, { translateX: shakeAnim }, { scale: scaleAnim }],
        marginVertical: 5,
      }}
    >
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: bgColor, borderColor }]}
        onPress={onPress}
        activeOpacity={0.75}
        disabled={state !== 'idle'}
      >
        {/* Colored left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: borderColor }]} />

        {/* Letter badge */}
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={styles.badgeLabel}>
            {isRevealed ? (STATE_ICONS[state] ?? label) : label}
          </Text>
        </View>

        {/* Answer text */}
        <Text style={[styles.answerText, isDisabled && styles.disabledText]} numberOfLines={3}>
          {text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    minHeight: 58,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
    flexShrink: 0,
  },
  badgeLabel: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  answerText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    paddingRight: 14,
    paddingVertical: 10,
  },
  disabledText: {
    color: COLORS.textMuted,
  },
});
