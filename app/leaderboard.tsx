import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  Animated, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';
import PlayerRow from '../components/PlayerRow';
import { Player } from '../types';

const AUTO_ADVANCE_SECONDS = 4;

interface RankedPlayer extends Player {
  currentScore: number;
  rank: number;
}

export default function LeaderboardScreen() {
  const { state, dispatch } = useGame();
  const { players, scores, localPlayerId, questions, currentQuestionIndex } = state;

  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const headerAnim = useRef(new Animated.Value(0)).current;

  const isLastQuestion = currentQuestionIndex >= questions.length - 1;

  const ranked: RankedPlayer[] = [...players]
    .map(p => ({ ...p, currentScore: scores[p.id] ?? 0 }))
    .sort((a, b) => b.currentScore - a.currentScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

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
    if (isLastQuestion) {
      dispatch({ type: 'SET_PHASE', payload: 'finished' });
      router.replace('/results');
    } else {
      dispatch({ type: 'NEXT_QUESTION' });
      router.replace('/game');
    }
  }

  const localRank = ranked.findIndex(p => p.id === localPlayerId) + 1;

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.header, { opacity: headerAnim }]}>
          <Text style={styles.title}>🏆 Leaderboard</Text>
          <View style={styles.rightArea}>
            <Text style={styles.qLabel}>Q {currentQuestionIndex + 1}/{questions.length}</Text>
          </View>
        </Animated.View>

        {/* Local player highlight */}
        {localRank > 0 && (
          <View style={styles.youBanner}>
            <Text style={styles.youText}>You are #{localRank}</Text>
            <Text style={styles.youScore}>{(scores[localPlayerId] ?? 0).toLocaleString()} pts</Text>
          </View>
        )}

        <FlatList
          data={ranked}
          keyExtractor={p => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PlayerRow
              player={item}
              rank={item.rank}
              score={item.currentScore}
              isLocal={item.id === localPlayerId}
            />
          )}
        />

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={advance}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#7C3AED', '#A855F7']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextGrad}
            >
              <Text style={styles.nextText}>
                {isLastQuestion
                  ? '🏆 See Final Results'
                  : `▶ Next Question  (${countdown}s)`}
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
    paddingVertical: 14,
  },
  title: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  rightArea: {},
  qLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  youBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '33',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
  },
  youText: { color: COLORS.primaryLight, fontSize: 15, fontWeight: '700' },
  youScore: { color: COLORS.gold, fontSize: 18, fontWeight: '900' },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  bottomBar: { padding: 16 },
  nextBtn: { borderRadius: 18, overflow: 'hidden' },
  nextGrad: { paddingVertical: 18, alignItems: 'center', borderRadius: 18 },
  nextText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
