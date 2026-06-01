import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack 
      screenOptions={{ 
        headerShown: false,
        contentStyle: { backgroundColor: '#0F0F0F' } 
      }}
    >
      <Stack.Screen name="index" />
      {/* 🟢 NEW: Register the Settings Modal */}
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
    </Stack>
  );
}