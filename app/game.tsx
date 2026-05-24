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

const REVEAL_DELAY  = 2300;
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
  const [scoreAnim]                   = useState(() => new Animated.Value(0));

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimers   = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timeLeftRef = useRef(QUESTION_TIME);
  const revealedRef = useRef(false);
  const doRevealRef = useRef<((ans: string | null, t: number) => void) | null>(null);

  const questionOpacity  = useRef(new Animated.Value(0)).current;
  const questionScale    = useRef(new Animated.Value(0.96)).current;
  const feedbackOpacity  = useRef(new Animated.Value(0)).current;
  const feedbackScale    = useRef(new Animated.Value(0.8)).current;
  const scorePopAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    questionOpacity.setValue(0);
    questionScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(questionOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(questionScale,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
    ]).start();
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
    feedbackOpacity.setValue(0);
    scorePopAnim.setValue(0);

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
        Animated.sequence([
          Animated.spring(scorePopAnim, { toValue: 1, useNativeDriver: true, tension: 100 }),
          Animated.timing(scorePopAnim, { toValue: 0, duration: 400, delay: 1200, useNativeDriver: true }),
        ]).start();
      }

      Animated.parallel([
        Animated.timing(feedbackOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(feedbackScale,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 7 }),
      ]).start();

      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      ).catch(() => {});

      setTimeout(() => {
        dispatch({ type: 'SET_PHASE', payload: 'leaderboard' });
        router.replace('/leaderboard');
      }, REVEAL_DELAY);
    }

    doRevealRef.current = doReveal;

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
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const totalQ     = questions.length;
  const qNum       = currentQuestionIndex + 1;
  const localScore = scores[localPlayerId] ?? 0;
  const totalBots  = players.filter(p => p.isBot).length;

  const scorePopScale = scorePopAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const scorePopOpacity = scorePopAnim.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });

  return (
    <LinearGradient colors={['#0A0914', '#12112A', '#0A0914']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {/* Top bar */}
        <View style={styles.topBar}>
          {/* Q progress dots */}
          <View style={styles.dotRow}>
            {Array.from({ length: totalQ }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < qNum  && styles.dotDone,
                  i === qNum - 1 && styles.dotCurrent,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Timer + score row */}
        <View style={styles.timerRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>{localScore.toLocaleString()}</Text>
            {/* Score pop animation */}
            <Animated.Text
              style={[
                styles.scorePop,
                { opacity: scorePopOpacity, transform: [{ scale: scorePopScale }] },
              ]}
            >
              +{earnedPts}
            </Animated.Text>
          </View>

          <Timer timeLeft={timeLeft} totalTime={QUESTION_TIME} />

          <View style={styles.questionBadge}>
            <Text style={styles.questionNum}>Q</Text>
            <Text style={styles.questionNumBig}>{qNum}</Text>
            <Text style={styles.questionNumSub}>/{totalQ}</Text>
          </View>
        </View>

        {/* Category chip */}
        <View style={styles.categoryChip}>
          <Text style={styles.categoryText}>{question.category}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Question card */}
          <Animated.View style={[styles.questionCard, { opacity: questionOpacity, transform: [{ scale: questionScale }] }]}>
            <View style={styles.qDifficultyDot} />
            <Text style={styles.questionText}>{question.question}</Text>
          </Animated.View>

          {/* Answer buttons */}
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
                  index={idx}
                  onPress={() => handleAnswer(ans)}
                />
              );
            })}
          </View>

          {/* Feedback */}
          {revealed && (
            <Animated.View
              style={[
                styles.feedbackBox,
                { opacity: feedbackOpacity, transform: [{ scale: feedbackScale }] },
              ]}
            >
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
                  <Text style={styles.feedbackCorrectAns}>✅ {question.correctAnswer}</Text>
                </>
              )}
            </Animated.View>
          )}

          {/* Bot activity */}
          {!revealed && totalBots > 0 && (
            <View style={styles.botBanner}>
              <View style={[styles.botDot, { backgroundColor: botCount > 0 ? COLORS.correct : COLORS.textMuted }]} />
              <Text style={styles.botText}>
                {botCount === 0 ? 'Opponents thinking…' : `${botCount}/${totalBots} answered`}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.text, fontSize: 18 },

  topBar: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4 },
  dotRow: { flexDirection: 'row', gap: 4, justifyContent: 'center', flexWrap: 'wrap' },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.cardBorder,
  },
  dotDone: { backgroundColor: COLORS.primaryLight + '88' },
  dotCurrent: { backgroundColor: COLORS.primaryLight, width: 20 },

  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  scoreBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 16,
    padding: 10,
    minWidth: 90,
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  scoreLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  scoreValue: { color: COLORS.primaryLight, fontSize: 18, fontWeight: '900' },
  scorePop: {
    position: 'absolute',
    top: -22,
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '900',
  },

  questionBadge: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 16,
    padding: 10,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 1,
  },
  questionNum:    { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  questionNumBig: { color: COLORS.primaryLight, fontSize: 22, fontWeight: '900' },
  questionNumSub: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },

  categoryChip: {
    alignSelf: 'center',
    backgroundColor: COLORS.primary + '22',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.primary + '55',
    marginBottom: 8,
  },
  categoryText: {
    color: COLORS.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  content: { paddingHorizontal: 16, paddingBottom: 32 },
  questionCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  qDifficultyDot: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  questionText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 27,
    textAlign: 'center',
    marginTop: 6,
  },
  answers: { gap: 2 },

  feedbackBox: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 6,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginTop: 8,
  },
  feedbackCorrect:    { color: COLORS.correct, fontSize: 20, fontWeight: '800' },
  feedbackWrong:      { color: COLORS.wrong,   fontSize: 20, fontWeight: '800' },
  feedbackTimeout:    { color: COLORS.timeout, fontSize: 20, fontWeight: '800' },
  feedbackPts:        { color: COLORS.gold,    fontSize: 32, fontWeight: '900' },
  feedbackCorrectAns: { color: COLORS.correct, fontSize: 14, fontWeight: '600' },

  botBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 10,
    marginTop: 8,
  },
  botDot: { width: 8, height: 8, borderRadius: 4 },
  botText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
});
