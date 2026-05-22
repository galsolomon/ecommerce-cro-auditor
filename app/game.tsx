import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS, ANSWER_COLORS, ANSWER_LABELS } from '../constants/colors';
import { calculateScore } from '../utils/scoring';
import { planBotMove } from '../utils/bots';
import Timer from '../components/Timer';
import AnswerButton from '../components/AnswerButton';

const REVEAL_DELAY  = 2200;
const QUESTION_TIME = 15;

export default function GameScreen() {
  const { state, dispatch } = useGame();
  const { questions, currentQuestionIndex, players, localPlayerId, scores } = state;
  const question = questions[currentQuestionIndex];

  const [timeLeft, setTimeLeft]       = useState(QUESTION_TIME);
  const [localAnswer, setLocalAnswer] = useState<string | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [earnedPts, setEarnedPts]     = useState(0);
  const [botCount, setBotCount]       = useState(0);

  // Refs — declared before effects that use them
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimers      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timeLeftRef    = useRef(QUESTION_TIME);
  const revealedRef    = useRef(false);
  const doRevealRef    = useRef<((ans: string | null, t: number) => void) | null>(null);
  const fadeIn         = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn.setValue(0);
    Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (!question) return;

    timeLeftRef.current = QUESTION_TIME;
    revealedRef.current = false;
    setTimeLeft(QUESTION_TIME);
    setLocalAnswer(null);
    setRevealed(false);
    setEarnedPts(0);
    setBotCount(0);

    let answeredBots = 0;

    function doReveal(pickedAnswer: string | null, tLeft: number) {
      if (revealedRef.current) return;
      revealedRef.current = true;

      if (timerRef.current) clearInterval(timerRef.current);
      botTimers.current.forEach(clearTimeout);
      botTimers.current = [];

      setRevealed(true);
      dispatch({ type: 'SET_ANSWER_REVEALED', payload: true });

      const correct = pickedAnswer === question.correctAnswer;
      const pts = correct ? calculateScore(tLeft) : 0;
      setEarnedPts(pts);
      if (pts > 0) {
        dispatch({ type: 'UPDATE_SCORE', payload: { playerId: localPlayerId, points: pts } });
      }

      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      ).catch(() => {});

      setTimeout(() => {
        dispatch({ type: 'SET_PHASE', payload: 'leaderboard' });
        router.replace('/leaderboard');
      }, REVEAL_DELAY);
    }

    doRevealRef.current = doReveal;

    // Schedule bots
    const bots = players.filter(p => p.isBot);
    bots.forEach(bot => {
      const move = planBotMove(bot, question);
      const t = setTimeout(() => {
        if (revealedRef.current) return;
        dispatch({ type: 'UPDATE_SCORE', payload: { playerId: bot.id, points: move.points } });
        answeredBots += 1;
        setBotCount(answeredBots);
      }, move.delay);
      botTimers.current.push(t);
    });

    // Countdown
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        clearInterval(timerRef.current!);
        doReveal(null, 0);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      botTimers.current.forEach(clearTimeout);
      botTimers.current = [];
      doRevealRef.current = null;
    };
  }, [currentQuestionIndex]);

  function handleAnswer(answer: string) {
    if (revealed || localAnswer || !doRevealRef.current) return;
    setLocalAnswer(answer);
    dispatch({ type: 'SELECT_ANSWER', payload: answer });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    doRevealRef.current(answer, timeLeftRef.current);
  }

  if (!question) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading questions…</Text>
      </View>
    );
  }

  const totalQ     = questions.length;
  const qNum       = currentQuestionIndex + 1;
  const localScore = scores[localPlayerId] ?? 0;
  const totalBots  = players.filter(p => p.isBot).length;

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E', '#0F0E17']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Q {qNum}/{totalQ}</Text>
          </View>
          <Timer timeLeft={timeLeft} totalTime={QUESTION_TIME} />
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Score</Text>
            <Text style={styles.chipScore}>{localScore.toLocaleString()}</Text>
          </View>
        </View>

        <Text style={styles.categoryLabel}>{question.category}</Text>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Question */}
          <Animated.View style={[styles.questionCard, { opacity: fadeIn }]}>
            <Text style={styles.questionText}>{question.question}</Text>
          </Animated.View>

          {/* Answers */}
          <View style={styles.answers}>
            {question.allAnswers.map((ans, idx) => {
              let btnState: 'idle' | 'selected' | 'correct' | 'wrong' | 'disabled' = 'idle';
              if (revealed) {
                if (ans === question.correctAnswer)  btnState = 'correct';
                else if (ans === localAnswer)        btnState = 'wrong';
                else                                btnState = 'disabled';
              } else if (localAnswer) {
                btnState = ans === localAnswer ? 'selected' : 'disabled';
              }
              return (
                <AnswerButton
                  key={ans}
                  label={ANSWER_LABELS[idx]}
                  text={ans}
                  color={ANSWER_COLORS[idx]}
                  state={btnState}
                  onPress={() => handleAnswer(ans)}
                />
              );
            })}
          </View>

          {/* Result feedback */}
          {revealed && (
            <View style={styles.feedbackBox}>
              {localAnswer === null ? (
                <Text style={styles.feedbackTimeout}>⏰ Time's up!</Text>
              ) : localAnswer === question.correctAnswer ? (
                <>
                  <Text style={styles.feedbackCorrect}>✅ Correct!</Text>
                  <Text style={styles.feedbackPts}>+{earnedPts.toLocaleString()} pts</Text>
                </>
              ) : (
                <>
                  <Text style={styles.feedbackWrong}>❌ Wrong answer</Text>
                  <Text style={styles.feedbackAnswer}>Correct: {question.correctAnswer}</Text>
                </>
              )}
            </View>
          )}

          {/* Bot activity */}
          {!revealed && totalBots > 0 && (
            <View style={styles.botBanner}>
              <Text style={styles.botText}>⚡ {botCount}/{totalBots} players answered</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe:      { flex: 1 },
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: COLORS.text, fontSize: 18 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  chipText:  { color: COLORS.primaryLight, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  chipLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  chipScore: { color: COLORS.primaryLight, fontSize: 15, fontWeight: '800' },
  categoryLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  questionCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 20,
    padding: 22,
    marginBottom: 14,
  },
  questionText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'center',
  },
  answers: { gap: 1 },
  feedbackBox: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  feedbackCorrect: { color: COLORS.correct, fontSize: 20, fontWeight: '800' },
  feedbackWrong:   { color: COLORS.wrong,   fontSize: 20, fontWeight: '800' },
  feedbackTimeout: { color: COLORS.timeout, fontSize: 20, fontWeight: '800' },
  feedbackPts:     { color: COLORS.gold,    fontSize: 30, fontWeight: '900' },
  feedbackAnswer:  { color: COLORS.correct, fontSize: 14, fontWeight: '600', marginTop: 4 },
  botBanner: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  botText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
});
