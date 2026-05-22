import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';
import { generateLiveBots } from '../utils/bots';
import { Player } from '../types';

export default function JoinScreen() {
  const { state, dispatch } = useGame();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function joinGame() {
    if (code.length < 4) {
      setError('Enter at least 4 characters');
      shake();
      return;
    }

    setJoining(true);
    setError('');

    // Simulate network lookup
    await new Promise(r => setTimeout(r, 1000));

    const local: Player = {
      id: 'local',
      name: 'You',
      avatar: '😎',
      score: 0,
      isBot: false,
      isLocal: true,
    };

    const bots = generateLiveBots(3 + Math.floor(Math.random() * 5));

    dispatch({
      type: 'SETUP',
      payload: {
        categoryId: 9,
        categoryName: 'General Knowledge',
        mode: 'live',
        gameCode: code.toUpperCase(),
        isHost: false,
        localPlayerId: 'local',
      },
    });
    dispatch({ type: 'SET_PLAYERS', payload: [local, ...bots] });

    setJoining(false);
    router.replace('/lobby');
  }

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Join Game</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.emoji}>🔗</Text>
          <Text style={styles.heading}>Enter Game Code</Text>
          <Text style={styles.hint}>Ask the host for the 6-character code</Text>

          <Animated.View style={[styles.inputWrap, { transform: [{ translateX: shakeAnim }] }]}>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={v => { setCode(v.toUpperCase()); setError(''); }}
              placeholder="e.g. AB12CD"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
              maxLength={8}
              autoCorrect={false}
              autoFocus
            />
          </Animated.View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.joinBtn, (joining || code.length < 4) && styles.joinDisabled]}
            onPress={joinGame}
            disabled={joining || code.length < 4}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={joining || code.length < 4 ? [COLORS.textMuted, COLORS.textMuted] : ['#7C3AED', '#A855F7']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.joinGrad}
            >
              <Text style={styles.joinText}>{joining ? '⏳ Joining…' : '🚀  JOIN NOW'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {},
  backText: { color: COLORS.primaryLight, fontSize: 16, fontWeight: '600' },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  emoji: { fontSize: 64 },
  heading: { color: COLORS.text, fontSize: 26, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  hint: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', marginBottom: 8 },
  inputWrap: { width: '100%' },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 8,
  },
  error: { color: COLORS.wrong, fontSize: 14, fontWeight: '600' },
  joinBtn: { width: '100%', borderRadius: 18, overflow: 'hidden', marginTop: 8 },
  joinDisabled: { opacity: 0.5 },
  joinGrad: { paddingVertical: 18, alignItems: 'center', borderRadius: 18 },
  joinText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
});
