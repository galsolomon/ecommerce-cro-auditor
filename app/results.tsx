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

// Confetti
const CONFETTI_COLORS = ['#FFD700', '#A855F7', '#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#EC4899', '#fff'];
const PIECES = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 5 + Math.random() * 9,
  speed: 2000 + Math.random() * 2500,
  delay: Math.random() * 1200,
  spin: Math.random() > 0.5 ? 720 : -720,
}));

function Confetti({ x, color, size, speed, delay, spin }: typeof PIECES[0]) {
  const y    = useRef(new Animated.Value(-30)).current;
  const rot  = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y,    { toValue: 900, duration: speed, delay, useNativeDriver: true }),
      Animated.timing(rot,  { toValue: spin, duration: speed, delay, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 400, delay: delay + speed - 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const rotate = rot.interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x, top: 0,
        width: size, height: size * 0.6,
        borderRadius: 2,
        backgroundColor: color,
        opacity: fade,
        transform: [{ translateY: y }, { rotate }],
      }}
    />
  );
}

interface RankedPlayer extends Player { finalScore: number; rank: number }

const PODIUM_GRADIENT: [string, string][] = [
  [COLORS.gold   + 'CC', COLORS.gold   + '55'],
  [COLORS.silver + 'CC', COLORS.silver + '55'],
  [COLORS.bronze + 'CC', COLORS.bronze + '55'],
];
const PODIUM_HEIGHTS = [140, 100, 80];
const PODIUM_EMOJIS  = ['🥇', '🥈', '🥉'];

export default function ResultsScreen() {
  const { state, dispatch } = useGame();
  const { players, scores, localPlayerId } = state;

  const ranked: RankedPlayer[] = [...players]
    .map(p => ({ ...p, finalScore: scores[p.id] ?? 0 }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const top3  = ranked.slice(0, 3);
  const rest  = ranked.slice(3);
  const local = ranked.find(p => p.id === localPlayerId);

  // Animations
  const titleScale    = useRef(new Animated.Value(0.5)).current;
  const titleOpacity  = useRef(new Animated.Value(0)).current;
  const podiumOpacity = useRef(new Animated.Value(0)).current;
  const podiumY       = useRef(new Animated.Value(60)).current;
  const restOpacity   = useRef(new Animated.Value(0)).current;
  const btnOpacity    = useRef(new Animated.Value(0)).current;

  // Per-podium column animations
  const podiumScales = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    Animated.sequence([
      // Title bounces in
      Animated.parallel([
        Animated.spring(titleScale,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 7 }),
        Animated.timing(titleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
      // Podium rises
      Animated.parallel([
        Animated.timing(podiumOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(podiumY, { toValue: 0, duration: 400, useNativeDriver: true }),
        // Stagger the podium blocks (center first, then sides)
        Animated.stagger(80, [
          Animated.spring(podiumScales[1], { toValue: 1, useNativeDriver: true, tension: 70 }),
          Animated.spring(podiumScales[0], { toValue: 1, useNativeDriver: true, tension: 70 }),
          Animated.spring(podiumScales[2], { toValue: 1, useNativeDriver: true, tension: 70 }),
        ]),
      ]),
      // Rest list fades in
      Animated.parallel([
        Animated.timing(restOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(btnOpacity,  { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  // Podium order: 2nd | 1st | 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]];
  const podiumIndexMap = [1, 0, 2]; // maps display position → rank-1 index

  function playAgain() {
    dispatch({ type: 'RESET' });
    router.replace('/');
  }

  return (
    <LinearGradient colors={['#0A0914', '#12112A', '#0A0914']} style={styles.container}>
      {PIECES.map(p => <Confetti key={p.id} {...p} />)}
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Title */}
          <Animated.View
            style={[styles.titleArea, { opacity: titleOpacity, transform: [{ scale: titleScale }] }]}
          >
            <Text style={styles.gameOver}>GAME OVER</Text>
            {ranked[0] && (
              <View style={styles.winnerRow}>
                <Text style={styles.crown}>👑</Text>
                <Text style={styles.winnerName}>{ranked[0].name} wins!</Text>
              </View>
            )}
          </Animated.View>

          {/* Your result */}
          {local && (
            <Animated.View style={[styles.yourCard, { opacity: titleOpacity }]}>
              <Text style={styles.yourLabel}>Your result</Text>
              <View style={styles.yourStats}>
                <View style={styles.yourStat}>
                  <Text style={styles.yourStatNum}>#{local.rank}</Text>
                  <Text style={styles.yourStatLabel}>Rank</Text>
                </View>
                <View style={styles.yourDivider} />
                <View style={styles.yourStat}>
                  <Text style={styles.yourStatScore}>{local.finalScore.toLocaleString()}</Text>
                  <Text style={styles.yourStatLabel}>Points</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Podium */}
          <Animated.View style={[styles.podiumWrap, { opacity: podiumOpacity, transform: [{ translateY: podiumY }] }]}>
            {podiumOrder.map((player, displayIdx) => {
              if (!player) return <View key={displayIdx} style={{ flex: 1 }} />;
              const rankIdx = podiumIndexMap[displayIdx]; // 0,1,2 → gold, silver, bronze
              const h = PODIUM_HEIGHTS[rankIdx];
              return (
                <Animated.View
                  key={player.id}
                  style={[styles.podiumCol, { transform: [{ scale: podiumScales[rankIdx] }] }]}
                >
                  <Text style={styles.podiumAvatar}>{player.avatar}</Text>
                  <Text style={styles.podiumPlayerName} numberOfLines={1}>{player.name}</Text>
                  <Text style={[styles.podiumScore, { color: PODIUM_GRADIENT[rankIdx][0] }]}>
                    {player.finalScore.toLocaleString()}
                  </Text>
                  <LinearGradient
                    colors={PODIUM_GRADIENT[rankIdx]}
                    start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                    style={[styles.podiumBlock, { height: h }]}
                  >
                    <Text style={styles.podiumEmoji}>{PODIUM_EMOJIS[rankIdx]}</Text>
                    <Text style={styles.podiumRankNum}>{rankIdx + 1}</Text>
                  </LinearGradient>
                </Animated.View>
              );
            })}
          </Animated.View>

          {/* Rest of leaderboard */}
          {rest.length > 0 && (
            <Animated.View style={[styles.restSection, { opacity: restOpacity }]}>
              <Text style={styles.restHeader}>Full Rankings</Text>
              {rest.map(player => (
                <View
                  key={player.id}
                  style={[styles.restRow, player.id === localPlayerId && styles.restRowLocal]}
                >
                  <Text style={styles.restRank}>#{player.rank}</Text>
                  <Text style={styles.restAvatar}>{player.avatar}</Text>
                  <Text style={styles.restName} numberOfLines={1}>{player.name}</Text>
                  <Text style={styles.restScore}>{player.finalScore.toLocaleString()}</Text>
                </View>
              ))}
            </Animated.View>
          )}

          {/* Actions */}
          <Animated.View style={[styles.actions, { opacity: btnOpacity }]}>
            <TouchableOpacity style={styles.playAgainBtn} onPress={playAgain} activeOpacity={0.85}>
              <LinearGradient
                colors={['#9333EA', '#7C3AED', '#6D28D9']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.playAgainGrad}
              >
                <Text style={styles.playAgainText}>🔄  PLAY AGAIN</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.homeBtn}
              onPress={() => { dispatch({ type: 'RESET' }); router.replace('/'); }}
              activeOpacity={0.8}
            >
              <Text style={styles.homeBtnText}>🏠  Back to Home</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  safe:          { flex: 1 },
  scrollContent: { paddingBottom: 40, alignItems: 'center' },

  titleArea: { alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  gameOver: {
    color: COLORS.text,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 6,
    textShadowColor: 'rgba(167,139,250,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  crown:      { fontSize: 24 },
  winnerName: { color: COLORS.gold, fontSize: 18, fontWeight: '800' },

  yourCard: {
    width: width - 32,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primaryLight + '55',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  yourLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  yourStats: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  yourStat:  { alignItems: 'center' },
  yourStatNum:   { color: COLORS.primaryLight, fontSize: 28, fontWeight: '900' },
  yourStatScore: { color: COLORS.gold, fontSize: 28, fontWeight: '900' },
  yourStatLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  yourDivider:   { width: 1, height: 40, backgroundColor: COLORS.cardBorder },

  podiumWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    width,
    marginBottom: 24,
  },
  podiumCol:  { flex: 1, alignItems: 'center', gap: 4 },
  podiumAvatar: { fontSize: 28 },
  podiumPlayerName: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 90,
  },
  podiumScore: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  podiumBlock: {
    width: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    alignItems: 'center',
    paddingTop: 10,
    gap: 4,
  },
  podiumEmoji:   { fontSize: 24 },
  podiumRankNum: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '900' },

  restSection: { width: width - 32, marginBottom: 20 },
  restHeader:  { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 10,
    marginBottom: 6,
    gap: 10,
  },
  restRowLocal: { borderColor: COLORS.primaryLight + '55', backgroundColor: COLORS.primary + '18' },
  restRank:    { color: COLORS.textMuted, width: 30, fontWeight: '700', textAlign: 'center', fontSize: 13 },
  restAvatar:  { fontSize: 20 },
  restName:    { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  restScore:   { color: COLORS.textSecondary, fontWeight: '800', fontSize: 14 },

  actions: { width: width - 32, gap: 12 },
  playAgainBtn: {
    borderRadius: 22,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  playAgainGrad: { paddingVertical: 20, alignItems: 'center', borderRadius: 22 },
  playAgainText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  homeBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.card,
  },
  homeBtnText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
});
