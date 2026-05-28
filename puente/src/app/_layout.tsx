import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AppProvider } from '@/context/app-context';
import '@/lib/transformers-native-setup';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="home" />
          <Stack.Screen name="languages" options={{ presentation: 'modal' }} />
        </Stack>
      </AppProvider>
    </ThemeProvider>
  );
}

/*
npx expo prebuild --clean
pnpm start --reset-cache
eas build -p android --profile preview --local
*/
