const { getDefaultConfig } = require('expo/metro-config');
const { withTransformersReactNativeMetro } = require('@automatalabs/react-native-transformers/metro');

const baseConfig = withTransformersReactNativeMetro(getDefaultConfig(__dirname));

module.exports = baseConfig;
