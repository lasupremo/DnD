import { Stack } from 'expo-router';

export default function GamesLayout() {
  return (
    <Stack 
      screenOptions={{ 
        headerShown: false,
        contentStyle: { backgroundColor: '#0F0F0F' } // 🟢 Make sure this is #0F0F0F!
      }} 
    />
  );
}