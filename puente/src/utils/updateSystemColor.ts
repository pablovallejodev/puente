import * as SecureStore from "expo-secure-store";
import { ColorSchemeName, useColorScheme } from "react-native";

const UpdateSystemColor = async (type: ColorSchemeName) => {
  const systemColorSaved = (await SecureStore.getItemAsync(
    "systemColor",
  )) as ColorSchemeName;

  if (systemColorSaved !== type) {
    await SecureStore.setItemAsync("systemColor", type);
  }
};

export default UpdateSystemColor;
