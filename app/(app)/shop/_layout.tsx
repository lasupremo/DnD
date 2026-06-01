import { Stack } from 'expo-router';

export default function ShopLayout() {
  return (
    <Stack 
      screenOptions={{
        headerShown: false, 
        contentStyle: { backgroundColor: '#0F0F0F' } 
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="create-trade" options={{ presentation: 'modal' }} />
      {/* 🟢 NEW: Add the View Trade modal */}
      <Stack.Screen name="view-trade" options={{ presentation: 'modal' }} /> 
    </Stack>
  );
}