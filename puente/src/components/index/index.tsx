import { StatusBarHiddenComponent } from '@/utils/statusbar';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { STANDARD_HORIZONTAL_PADDING } from '@/constants/ui';

export default function IndexComponent() {
  const router = useRouter();
  const [status, setStatus] = useState<boolean>(false);

  useEffect(() => {
    setTimeout(() => {
      setStatus(true);
    }, 1500);
  }, []);

  useEffect(() => {
    if (status) router.replace('/traductor');
  }, [status, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <View style={styles.content}>
        <LottieView
          style={styles.lottie}
          speed={0.8}
          loop
          source={require('@/assets/lottie/loader.json')}
        />
        <Text style={styles.title}>
          Loading
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "white",
  },
  content: {
    flex: 1,

    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignContent: "center",

    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
  },
  lottie: {
    width: (Dimensions.get("screen").width - 72) / 3,
    height: (Dimensions.get("screen").width - 72) / 3,

    alignSelf: "center",
  },
  title: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 24,
    color: "black",
    alignSelf: "center",
    textAlign: "center",
  },
});
