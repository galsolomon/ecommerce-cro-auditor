import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GameProvider } from '../context/GameContext';

export default function RootLayout() {
  return (
    <GameProvider>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0F0E17' },
            animation: 'slide_from_right',
          }}
        />
      </SafeAreaProvider>
    </GameProvider>
  );
}
