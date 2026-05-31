import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack 
      screenOptions={{ 
        headerShown: false,
        // 🟢 FIX: This applies the dark background to every screen in the Profile stack!
        contentStyle: { backgroundColor: '#0F0F0F' } 
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}