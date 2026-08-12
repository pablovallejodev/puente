import { Stack } from 'expo-router';

export default function ModelosLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="transcriptores" />
      <Stack.Screen name="traductores" />
    </Stack>
  );
}
