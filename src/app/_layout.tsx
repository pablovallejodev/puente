import { Stack } from 'expo-router';
import { Mulish_500Medium, Mulish_800ExtraBold, Mulish_900Black } from '@expo-google-fonts/mulish';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

import { ModelCatalogProvider } from '@/contexts/model-catalog-context';
import { TraductorSessionProvider } from '@/contexts/traductor-session-context';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Mulish_500Medium,
    Mulish_800ExtraBold,
    Mulish_900Black,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();

    if (!loaded && !!error) return console.log(`TEXT FONT ERROR ${loaded} ${error}`);
  }, [loaded, error]);

  if (!loaded) return null;

  const pageOptions = {
    headerShown: false,
    headerLeft: () => null,
    unmountOnBlur: true,
  };

  return (
    <ModelCatalogProvider>
      <TraductorSessionProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'fade',
            animationDuration: 300,
          }}
        >
          <Stack.Screen name="index" options={pageOptions} />
          <Stack.Screen name="traductor" options={pageOptions} />
          <Stack.Screen name="languages" options={pageOptions} />
          <Stack.Screen name="modelos" options={pageOptions} />
        </Stack>
      </TraductorSessionProvider>
    </ModelCatalogProvider>
  );
}

/*

NO BORRES ESTO QUE ME SIRVE DE REFERENCIA

rm -r ./android && rm -r ./ios


npx expo install --check
npx expo install --fix
npx expo-doctor --verbose


npx expo prebuild --clean
pnpm start --reset-cache
pnpm start --reset-cache --tunnel

eas build -p android --profile development
eas build -p android --profile preview
eas build -p android --profile preview --local
*/
