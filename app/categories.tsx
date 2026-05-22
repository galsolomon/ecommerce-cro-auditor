import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { CATEGORIES } from '../constants/categories';
import { COLORS } from '../constants/colors';
import { Category } from '../types';

const { width } = Dimensions.get('window');
const COLS = 2;
const CARD_W = (width - 48) / COLS;

export default function CategoriesScreen() {
  const { dispatch } = useGame();

  function pick(cat: Category) {
    dispatch({ type: 'SETUP', payload: { categoryId: cat.id, categoryName: cat.name } });
    router.push('/mode');
  }

  return (
    <LinearGradient colors={['#0F0E17', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Choose Category</Text>
          <View style={{ width: 60 }} />
        </View>

        <FlatList
          data={CATEGORIES}
          numColumns={COLS}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { width: CARD_W }]}
              onPress={() => pick(item)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={item.gradientColors}
                style={styles.cardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.icon}>{item.icon}</Text>
                <Text style={styles.catName}>{item.name}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        />
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
  back: { width: 60 },
  backText: { color: COLORS.primaryLight, fontSize: 16, fontWeight: '600' },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  grid: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  row: { gap: 12 },
  card: { borderRadius: 18, overflow: 'hidden', elevation: 6 },
  cardGradient: { padding: 24, alignItems: 'center', gap: 8, minHeight: 110 },
  icon: { fontSize: 40 },
  catName: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
});
