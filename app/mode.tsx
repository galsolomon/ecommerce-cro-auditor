import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { COLORS } from '../constants/colors';
import { GameMode } from '../types';

const MODES: {
  mode: GameMode;
  label: string;
  icon: string;
  desc: string;
  gradient: [string, string];
  badge?: string;
}[] = [
  { mode: 'solo',     label: 'SOLO',       icon: '🧍', desc: 'Play alone & beat your best',      gradient: ['#7C3AED', '#6D28D9'], badge: 'Classic' },
  { mode: '1v1',      label: '1 vs 1',     icon: '⚔️', desc: 'Head-to-head duel',                gradient: ['#3B82F6', '#1D4ED8'] },
  { mode: '3v3',      label: '3 vs 3',     icon: '👥', desc: 'Team battle – 3 a side',            gradient: ['#10B981', '#059669'] },
  { mode: '4v4',      label: '4 vs 4',     icon: '🏆', desc: 'Grand team clash',                 gradient: ['#F59E0B', '#D97706'] },
  { mode: 'allvsall', label: 'All vs All', icon: '💥', desc: 'Free for all – every player alone', gradient: ['#EF4444', '#DC2626'] },
  { mode: 'live',     label: 'LIVE',       icon: '🌐', desc: 'Up to 50 players — share the code', gradient: ['#EC4899', '#DB2777'], badge: 'Hot' },
];

export default function ModeScreen() {
  const { state, dispatch } = useGame();

  function pick(mode: GameMode) {
    let code: string | null = null;
    if (mode === 'live') {
      code = Math.random().toString(36).slice(2, 8).toUpperCase();
    }
    dispatch({ type: 'SETUP', payload: { ...state, mode, gameCode: code, isHost: true } });
    router.push('/lobby');
  }

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Game Mode</Text>
          <View style={[styles.chip, { backgroundColor: state.categoryId === 0 ? COLORS.primary : '#2D2D5E' }]}>
            <Text style={styles.chipText}>{state.categoryName}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {MODES.map(m => (
            <TouchableOpacity key={m.mode} onPress={() => pick(m.mode)} activeOpacity={0.82}>
              <LinearGradient
                colors={m.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.card}
              >
                <Text style={styles.modeIcon}>{m.icon}</Text>
                <View style={styles.modeInfo}>
                  <View style={styles.modeTopRow}>
                    <Text style={styles.modeLabel}>{m.label}</Text>
                    {m.badge && <View style={styles.badge}><Text style={styles.badgeText}>{m.badge}</Text></View>}
                  </View>
                  <Text style={styles.modeDesc}>{m.desc}</Text>
                </View>
                <Text style={styles.arrow}>›</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 18,
    gap: 14,
    elevation: 6,
  },
  modeIcon: { fontSize: 36 },
  modeInfo: { flex: 1 },
  modeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  modeLabel: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  modeDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  badge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  arrow: { color: 'rgba(255,255,255,0.6)', fontSize: 28, fontWeight: '300' },
});
