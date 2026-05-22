import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';
import { fetchQuestions } from '../services/triviaApi';
import { generateBots, generateLiveBots } from '../utils/bots';
import { Player } from '../types';

const LOCAL_NAMES = ['You', 'Player'];

function getLocalPlayer(): Player {
  return {
    id: 'local',
    name: 'You',
    avatar: '😎',
    score: 0,
    isBot: false,
    isLocal: true,
  };
}

function getBotCount(mode: string): number {
  if (mode === '1v1')      return 1;
  if (mode === '3v3')      return 5;
  if (mode === '4v4')      return 7;
  if (mode === 'allvsall') return 5;
  return 0;
}

export default function LobbyScreen() {
  const { state, dispatch } = useGame();
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const isLive = state.mode === 'live';
  const isSolo = state.mode === 'solo';

  useEffect(() => {
    const local = getLocalPlayer();
    const bots = isLive
      ? generateLiveBots(0)
      : isSolo
      ? []
      : generateBots(getBotCount(state.mode));

    dispatch({ type: 'SET_PLAYERS', payload: [local, ...bots] });

    // In live mode, simulate players joining gradually
    if (isLive) {
      let count = 0;
      const target = 3 + Math.floor(Math.random() * 8);
      const timer = setInterval(() => {
        if (count >= target) { clearInterval(timer); setLoading(false); return; }
        const [bot] = generateLiveBots(1);
        bot.id = `live-${Date.now()}-${count}`;
        dispatch({ type: 'ADD_PLAYER', payload: bot });
        count++;
      }, 900);
      return () => clearInterval(timer);
    }

    // For bot modes, show a brief "finding opponents" delay
    if (!isSolo) {
      setTimeout(() => setLoading(false), 1800);
    } else {
      setLoading(false);
    }
  }, []);

  // Animated pulse for the code display
  useEffect(() => {
    if (!isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  async function startGame() {
    setLoading(true);
    const questions = await fetchQuestions(state.categoryId, 10);
    dispatch({ type: 'SET_QUESTIONS', payload: questions });
    dispatch({ type: 'SET_PHASE', payload: 'question' });
    setLoading(false);
    router.replace('/game');
  }

  const canStart = !loading && (isSolo || state.players.length > 1);

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { dispatch({ type: 'RESET' }); router.replace('/'); }} style={styles.back}>
            <Text style={styles.backText}>✕ Leave</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{isSolo ? 'Ready?' : 'Lobby'}</Text>
          <View style={{ width: 70 }} />
        </View>

        {/* Category + Mode chips */}
        <View style={styles.chips}>
          <View style={styles.chip}><Text style={styles.chipText}>{state.categoryName}</Text></View>
          <View style={[styles.chip, { backgroundColor: COLORS.accent + '33' }]}>
            <Text style={[styles.chipText, { color: COLORS.accent }]}>{state.mode.toUpperCase()}</Text>
          </View>
        </View>

        {/* Live game code */}
        {isLive && state.gameCode && (
          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>Share this code</Text>
            <Animated.View style={[styles.codeBox, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.codeText}>{state.gameCode}</Text>
            </Animated.View>
            <Text style={styles.codeHint}>Players enter this code to join</Text>
          </View>
        )}

        {/* Player list */}
        <Text style={styles.sectionLabel}>
          {loading && !isSolo ? '🔍 Finding players…' : `Players (${state.players.length})`}
        </Text>
        <FlatList
          data={state.players}
          keyExtractor={p => p.id}
          style={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.playerRow, item.isLocal && styles.localRow]}>
              <Text style={styles.avatar}>{item.avatar}</Text>
              <Text style={styles.playerName}>{item.name}{item.isLocal ? ' (You)' : ''}</Text>
              {item.isLocal && <View style={styles.hostBadge}><Text style={styles.hostText}>HOST</Text></View>}
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.startBtn, !canStart && styles.startDisabled]}
            onPress={startGame}
            disabled={!canStart}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canStart ? ['#7C3AED', '#A855F7'] : [COLORS.textMuted, COLORS.textMuted]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.startGrad}
            >
              <Text style={styles.startText}>
                {loading ? '⏳ Loading…' : '▶  START GAME'}
              </Text>
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
  backText: { color: COLORS.wrong, fontSize: 15, fontWeight: '600' },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  chip: {
    backgroundColor: COLORS.primary + '33',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  chipText: { color: COLORS.primaryLight, fontSize: 13, fontWeight: '700' },
  codeSection: { alignItems: 'center', marginBottom: 20, paddingHorizontal: 32 },
  codeLabel: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 10, fontWeight: '600', letterSpacing: 1 },
  codeBox: {
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 8,
  },
  codeText: {
    color: COLORS.primaryLight,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 12,
  },
  codeHint: { color: COLORS.textMuted, fontSize: 13 },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: { flex: 1 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 12,
  },
  localRow: { borderColor: COLORS.primaryLight, backgroundColor: COLORS.primary + '22' },
  avatar: { fontSize: 26 },
  playerName: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '600' },
  hostBadge: {
    backgroundColor: COLORS.primaryLight + '33',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hostText: { color: COLORS.primaryLight, fontSize: 11, fontWeight: '800' },
  bottomBar: { padding: 16 },
  startBtn: { borderRadius: 18, overflow: 'hidden' },
  startDisabled: { opacity: 0.5 },
  startGrad: { paddingVertical: 18, alignItems: 'center', borderRadius: 18 },
  startText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 2 },
});
