import { Redirect } from 'expo-router';

export default function AppIndex() {
  // Automatically forward the user to the collections tab when they log in
  return <Redirect href="/(app)/packs" />;
}