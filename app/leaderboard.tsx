import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';
import { Player } from '../types';

const { width } = Dimensions.get('window');
const AUTO_ADVANCE = 5;

const RANK_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze];
const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

interface RankedPlayer extends Player {
  currentScore: number;
  rank: number;
}

function LeaderRow({ player, rank, score, isLocal, maxScore, delay }: {
  player: Player;
  rank: number;
  score: number;
  isLocal: boolean;
  maxScore: number;
  delay: number;
}) {
  const slideX  = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;

  const barPercent = maxScore > 0 ? score / maxScore : 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideX,  { toValue: 0, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(barWidth, { toValue: barPercent, duration: 600, delay: delay + 100, useNativeDriver: false }),
    ]).start();
  }, []);

  const rankColor = rank <= 3 ? RANK_COLORS[rank - 1] : COLORS.textMuted;
  const rankLabel = rank <= 3 ? RANK_EMOJIS[rank - 1] : `#${rank}`;

  return (
    <Animated.View style={[styles.row, isLocal && styles.localRow, { opacity, transform: [{ translateX: slideX }] }]}>
      {/* Rank */}
      <Text style={[styles.rankLabel, { color: rankColor }]}>{rankLabel}</Text>

      {/* Avatar + name */}
      <Text style={styles.avatar}>{player.avatar}</Text>
      <View style={styles.nameCol}>
        <Text style={styles.playerName} numberOfLines={1}>
          {player.name}{isLocal ? ' (You)' : ''}
        </Text>
        {/* Score bar */}
        <Animated.View
          style={[
            styles.scoreBar,
            {
              width: barWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: isLocal ? COLORS.primaryLight : COLORS.textMuted,
            },
          ]}
        />
      </View>

      {/* Score */}
      <Text style={[styles.scoreText, isLocal && { color: COLORS.primaryLight }]}>
        {score.toLocaleString()}
      </Text>
    </Animated.View>
  );
}

export default function LeaderboardScreen() {
  const { state, dispatch } = useGame();
  const { players, scores, localPlayerId, questions, currentQuestionIndex } = state;

  const [countdown, setCountdown] = useState(AUTO_ADVANCE);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLastQ = currentQuestionIndex >= questions.length - 1;

  const ranked: RankedPlayer[] = [...players]
    .map(p => ({ ...p, currentScore: scores[p.id] ?? 0 }))
    .sort((a, b) => b.currentScore - a.currentScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const maxScore = ranked[0]?.currentScore ?? 1;

  const headerAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();

    // Countdown progress bar
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: AUTO_ADVANCE * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          advance();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function advance() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isLastQ) {
      dispatch({ type: 'SET_PHASE', payload: 'finished' });
      router.replace('/results');
    } else {
      dispatch({ type: 'NEXT_QUESTION' });
      router.replace('/game');
    }
  }

  const localRank  = ranked.findIndex(p => p.id === localPlayerId) + 1;
  const localScore = scores[localPlayerId] ?? 0;

  return (
    <LinearGradient colors={['#0A0914', '#12112A']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerAnim }]}>
          <View>
            <Text style={styles.title}>🏆 Leaderboard</Text>
            <Text style={styles.subtitle}>
              Q {currentQuestionIndex + 1} of {questions.length}
            </Text>
          </View>
          {localRank > 0 && (
            <View style={styles.yourRankBadge}>
              <Text style={styles.yourRankLabel}>YOU</Text>
              <Text style={styles.yourRankNum}>#{localRank}</Text>
            </View>
          )}
        </Animated.View>

        {/* Auto-advance progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Your score highlight */}
        <View style={styles.youCard}>
          <Text style={styles.youCardLabel}>Your Score</Text>
          <Text style={styles.youCardScore}>{localScore.toLocaleString()}</Text>
          <View style={styles.youRankPill}>
            <Text style={styles.youRankPillText}>Rank #{localRank}</Text>
          </View>
        </View>

        {/* Rankings */}
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {ranked.map((player, i) => (
            <LeaderRow
              key={player.id}
              player={player}
              rank={player.rank}
              score={player.currentScore}
              isLocal={player.id === localPlayerId}
              maxScore={maxScore}
              delay={i * 60}
            />
          ))}
        </ScrollView>

        {/* Next button */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.nextBtn} onPress={advance} activeOpacity={0.85}>
            <LinearGradient
              colors={['#9333EA', '#7C3AED']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextGrad}
            >
              <Text style={styles.nextText}>
                {isLastQ ? '🏆  See Final Results' : `▶  Next Question  (${countdown}s)`}
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title:    { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  yourRankBadge: {
    backgroundColor: COLORS.primary + '33',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  yourRankLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  yourRankNum:   { color: COLORS.primaryLight, fontSize: 20, fontWeight: '900' },

  progressTrack: { height: 3, backgroundColor: COLORS.cardBorder, marginHorizontal: 20, borderRadius: 2, marginBottom: 12 },
  progressFill:  { height: 3, backgroundColor: COLORS.primaryLight, borderRadius: 2 },

  youCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primaryLight + '55',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  youCardLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', flex: 1 },
  youCardScore: { color: COLORS.gold, fontSize: 22, fontWeight: '900' },
  youRankPill: {
    backgroundColor: COLORS.primary + '33',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  youRankPillText: { color: COLORS.primaryLight, fontSize: 12, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  localRow: {
    borderColor: COLORS.primaryLight + '66',
    backgroundColor: COLORS.primary + '18',
  },
  rankLabel:  { fontSize: 18, width: 34, textAlign: 'center' },
  avatar:     { fontSize: 22 },
  nameCol:    { flex: 1, gap: 5 },
  playerName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  scoreBar:   { height: 3, borderRadius: 2, opacity: 0.6 },
  scoreText:  { color: COLORS.text, fontSize: 16, fontWeight: '800', minWidth: 60, textAlign: 'right' },

  bottomBar: { padding: 16 },
  nextBtn:   { borderRadius: 18, overflow: 'hidden' },
  nextGrad:  { paddingVertical: 18, alignItems: 'center', borderRadius: 18 },
  nextText:  { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
});
