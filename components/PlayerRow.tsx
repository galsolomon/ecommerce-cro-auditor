import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { Player } from '../types';

interface Props {
  player: Player;
  rank: number;
  score: number;
  isLocal?: boolean;
  pointsEarned?: number;
}

const RANK_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze];
const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

export default function PlayerRow({ player, rank, score, isLocal, pointsEarned }: Props) {
  const rankColor = rank <= 3 ? RANK_COLORS[rank - 1] : COLORS.textMuted;
  const rankLabel = rank <= 3 ? RANK_EMOJIS[rank - 1] : `#${rank}`;

  return (
    <View style={[styles.row, isLocal && styles.localRow]}>
      <Text style={[styles.rank, { color: rankColor }]}>{rankLabel}</Text>
      <Text style={styles.avatar}>{player.avatar}</Text>
      <Text style={styles.name} numberOfLines={1}>{player.name}{isLocal ? ' (You)' : ''}</Text>
      <View style={styles.right}>
        {pointsEarned !== undefined && pointsEarned > 0 && (
          <Text style={styles.earned}>+{pointsEarned}</Text>
        )}
        <Text style={styles.score}>{score.toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 10,
  },
  localRow: {
    borderColor: COLORS.primaryLight,
    backgroundColor: COLORS.primary + '22',
  },
  rank: { fontSize: 18, width: 36, textAlign: 'center' },
  avatar: { fontSize: 22 },
  name: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '600' },
  right: { alignItems: 'flex-end', gap: 2 },
  score: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  earned: { color: COLORS.correct, fontSize: 12, fontWeight: '700' },
});
