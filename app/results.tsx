import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated,
  TouchableOpacity, ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';
import { Player } from '../types';

const { width } = Dimensions.get('window');

const CONFETTI_COUNT = 30;
const CONFETTI_COLORS = ['#FFD700', '#A855F7', '#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#EC4899'];

function ConfettiPiece({ x, color, size, speed, delay, shape }: any) {
  const y    = useRef(new Animated.Value(-20)).current;
  const rot  = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y,    { toValue: 900, duration: speed, delay, useNativeDriver: true }),
      Animated.timing(rot,  { toValue: 720, duration: speed, delay, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0,   duration: 300,   delay: delay + speed - 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const rotate = rot.interpolate({ inputRange: [0, 720], outputRange: ['0deg', '720deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: size,
        height: size * (shape === 'rect' ? 0.5 : 1),
        borderRadius: shape === 'circle' ? size / 2 : 2,
        backgroundColor: color,
        opacity: fade,
        transform: [{ translateY: y }, { rotate }],
      }}
    />
  );
}

const confettiPieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  size: 8 + Math.random() * 10,
  speed: 2500 + Math.random() * 2000,
  delay: Math.random() * 1500,
  shape: ['circle', 'rect', 'square'][Math.floor(Math.random() * 3)],
}));

interface RankedPlayer extends Player { finalScore: number; rank: number }

const PODIUM_COLORS  = [COLORS.gold, COLORS.silver, COLORS.bronze];
const PODIUM_HEIGHTS = [130, 100, 80];
const PODIUM_EMOJIS  = ['🥇', '🥈', '🥉'];

export default function ResultsScreen() {
  const { state, dispatch } = useGame();
  const { players, scores, localPlayerId } = state;

  const ranked: RankedPlayer[] = [...players]
    .map(p => ({ ...p, finalScore: scores[p.id] ?? 0 }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const top3   = ranked.slice(0, 3);
  const rest   = ranked.slice(3);
  const winner = ranked[0];
  const local  = ranked.find(p => p.id === localPlayerId);

  const podiumAnim = useRef(new Animated.Value(0)).current;
  const listAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(podiumAnim, { toValue: 1, duration: 700, delay: 300, useNativeDriver: true }),
      Animated.timing(listAnim,   { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // Podium order: 2nd (left), 1st (center), 3rd (right)
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumHeightMap: Record<number, number> = { 1: PODIUM_HEIGHTS[0], 2: PODIUM_HEIGHTS[1], 3: PODIUM_HEIGHTS[2] };

  function playAgain() {
    dispatch({ type: 'RESET' });
    router.replace('/');
  }

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E', '#0F0E17']} style={styles.container}>
      {confettiPieces.map(p => <ConfettiPiece key={p.id} {...p} />)}

      <SafeAreaView style={styles.safe}>
        <Text style={styles.gameOver}>GAME OVER</Text>

        {winner && (
          <Text style={styles.winnerText}>👑 {winner.name} wins!</Text>
        )}

        {/* Podium */}
        <Animated.View style={[styles.podiumArea, { opacity: podiumAnim }]}>
          {podiumOrder.map(player => {
            if (!player) return null;
            const h = podiumHeightMap[player.rank] ?? 80;
            const color = PODIUM_COLORS[player.rank - 1];
            return (
              <View key={player.id} style={styles.podiumCol}>
                <Text style={styles.podiumAvatar}>{player.avatar}</Text>
                <Text style={styles.podiumName} numberOfLines={1}>{player.name}</Text>
                <Text style={[styles.podiumScore, { color }]}>
                  {player.finalScore.toLocaleString()}
                </Text>
                <LinearGradient
                  colors={[color, color + '88']}
                  style={[styles.podiumBlock, { height: h }]}
                >
                  <Text style={styles.podiumEmoji}>{PODIUM_EMOJIS[player.rank - 1]}</Text>
                </LinearGradient>
              </View>
            );
          })}
        </Animated.View>

        {/* Local player result */}
        {local && local.rank > 3 && (
          <View style={styles.yourResult}>
            <Text style={styles.yourText}>Your result: </Text>
            <Text style={styles.yourRank}>#{local.rank}</Text>
            <Text style={styles.yourScore}> — {local.finalScore.toLocaleString()} pts</Text>
          </View>
        )}

        {/* Full leaderboard */}
        {rest.length > 0 && (
          <Animated.ScrollView
            style={{ opacity: listAnim }}
            contentContainerStyle={styles.restList}
            showsVerticalScrollIndicator={false}
          >
            {rest.map(player => (
              <View key={player.id} style={[styles.restRow, player.id === localPlayerId && styles.restRowLocal]}>
                <Text style={styles.restRank}>#{player.rank}</Text>
                <Text style={styles.restAvatar}>{player.avatar}</Text>
                <Text style={styles.restName} numberOfLines={1}>{player.name}</Text>
                <Text style={styles.restScore}>{player.finalScore.toLocaleString()}</Text>
              </View>
            ))}
          </Animated.ScrollView>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.playAgain} onPress={playAgain} activeOpacity={0.85}>
            <LinearGradient
              colors={['#7C3AED', '#A855F7']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.playAgainGrad}
            >
              <Text style={styles.playAgainText}>🔄  PLAY AGAIN</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => { dispatch({ type: 'RESET' }); router.replace('/'); }}
            activeOpacity={0.85}
          >
            <Text style={styles.homeBtnText}>🏠  Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, alignItems: 'center' },
  gameOver: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 6,
    marginTop: 16,
  },
  winnerText: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 16,
  },
  podiumArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  podiumCol: { flex: 1, alignItems: 'center', gap: 4 },
  podiumAvatar: { fontSize: 30 },
  podiumName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 90,
  },
  podiumScore: { fontSize: 13, fontWeight: '800' },
  podiumBlock: {
    width: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  podiumEmoji: { fontSize: 22 },
  yourResult: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 12,
  },
  yourText:  { color: COLORS.textSecondary, fontSize: 15 },
  yourRank:  { color: COLORS.primaryLight,  fontSize: 16, fontWeight: '900' },
  yourScore: { color: COLORS.text,          fontSize: 15, fontWeight: '700' },
  restList: { paddingHorizontal: 16, gap: 6, paddingBottom: 8, width },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 10,
    gap: 10,
  },
  restRowLocal: { borderColor: COLORS.primaryLight, backgroundColor: COLORS.primary + '22' },
  restRank:    { color: COLORS.textMuted, width: 30, fontWeight: '700', textAlign: 'center' },
  restAvatar:  { fontSize: 20 },
  restName:    { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  restScore:   { color: COLORS.textSecondary, fontWeight: '700' },
  actions: { padding: 16, gap: 12, width: '100%' },
  playAgain: { borderRadius: 18, overflow: 'hidden' },
  playAgainGrad: { paddingVertical: 18, alignItems: 'center', borderRadius: 18 },
  playAgainText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  homeBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.cardBorder,
  },
  homeBtnText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '700' },
});
