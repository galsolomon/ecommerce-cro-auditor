import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Dimensions, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGame } from '../context/GameContext';
import { CATEGORIES } from '../constants/categories';
import { COLORS } from '../constants/colors';
import { Category } from '../types';

const { width } = Dimensions.get('window');
const COLS   = 2;
const GAP    = 12;
const PAD    = 16;
const CARD_W = (width - PAD * 2 - GAP) / COLS;

function CategoryCard({ item, onPress, index }: { item: Category; onPress: () => void; index: number }) {
  const slideY  = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY,  { toValue: 0, duration: 320, delay: index * 45, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 45, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, delay: index * 45, useNativeDriver: true, tension: 70, friction: 9 }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ width: CARD_W }, { opacity, transform: [{ translateY: slideY }, { scale }] }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={styles.cardTouch}>
        <LinearGradient
          colors={item.gradientColors}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {item.id === 0 && (
            <View style={styles.popularBadge}>
              <Text style={styles.popularText}>NEW</Text>
            </View>
          )}
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.catName}>{item.name}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function CategoriesScreen() {
  const { dispatch } = useGame();

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY       = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(headerY,       { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  function pick(cat: Category) {
    dispatch({ type: 'SETUP', payload: { categoryId: cat.id, categoryName: cat.name } });
    router.push('/mode');
  }

  return (
    <LinearGradient colors={['#0A0914', '#12112A']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <Animated.View
          style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerY }] }]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <View style={styles.backBtn}>
              <Text style={styles.backArrow}>←</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.titleArea}>
            <Text style={styles.title}>Categories</Text>
            <Text style={styles.subtitle}>Pick a topic to quiz on</Text>
          </View>
          <View style={{ width: 44 }} />
        </Animated.View>

        <FlatList
          data={CATEGORIES}
          numColumns={COLS}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <CategoryCard item={item} index={index} onPress={() => pick(item)} />
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
    paddingHorizontal: PAD,
    paddingTop: 8,
    paddingBottom: 16,
  },
  back: {},
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: { color: COLORS.text, fontSize: 20, fontWeight: '600' },
  titleArea: { flex: 1, alignItems: 'center' },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  grid: { paddingHorizontal: PAD, paddingBottom: 32, gap: GAP },
  row: { gap: GAP },
  cardTouch: { borderRadius: 20, overflow: 'hidden', elevation: 8 },
  card: {
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 118,
    position: 'relative',
  },
  popularBadge: {
    position: 'absolute',
    top: 10, right: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  icon: { fontSize: 42 },
  catName: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
});
