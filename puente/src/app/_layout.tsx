import { Stack } from 'expo-router';

export default function RootLayout() {
  const pageOptions = {
    headerShown: false,
    headerLeft: () => null,
    unmountOnBlur: true,
  };

  return (
    <Stack screenOptions={{
      headerShown: false,
      gestureEnabled: false,
      animation: "fade",
      animationDuration: 300
    }}>
      <Stack.Screen name="index" options={pageOptions} />
      <Stack.Screen name="home" options={pageOptions} />
      <Stack.Screen name="languages" options={pageOptions} />
    </Stack>
  );
}

/*
rm -r ./android && rm -r ./ios


npx expo install --check
npx expo install --fix
npx expo-doctor --verbose


npx expo prebuild --clean
pnpm start --reset-cache

eas build -p android --profile preview
eas build -p android --profile preview --local
*/
