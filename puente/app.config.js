const { withMainApplication, withAndroidManifest, createRunOncePlugin } = require('expo/config-plugins');
const appJson = require('./app.json');

const PACKAGE_IMPORT = 'import ai.onnxruntime.reactnative.OnnxruntimePackage';

/**
 * Registers OnnxruntimePackage in MainApplication.
 *
 * onnxruntime-react-native uses the legacy ReactPackage pattern which Expo
 * autolinking does not pick up. Without this, NativeModules.Onnxruntime is null.
 *
 * @see https://github.com/microsoft/onnxruntime/issues/19510
 */
const withOnnxruntime = createRunOncePlugin((config) => {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes(PACKAGE_IMPORT)) {
      const lastImportIndex = contents.lastIndexOf('\nimport ');
      if (lastImportIndex !== -1) {
        const endOfLine = contents.indexOf('\n', lastImportIndex + 1);
        contents =
          contents.slice(0, endOfLine + 1) + PACKAGE_IMPORT + '\n' + contents.slice(endOfLine + 1);
      }
    }

    if (!contents.includes('OnnxruntimePackage()')) {
      const marker = '// add(MyReactNativePackage())';
      const markerIdx = contents.indexOf(marker);
      if (markerIdx !== -1) {
        const endOfMarkerLine = contents.indexOf('\n', markerIdx);
        contents =
          contents.slice(0, endOfMarkerLine) +
          '\n          add(OnnxruntimePackage())' +
          contents.slice(endOfMarkerLine);
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}, 'with-onnxruntime', '1.0.0');

const withLargeHeap = createRunOncePlugin((config) => {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:largeHeap'] = 'true';
    }
    return config;
  });
}, 'with-large-heap', '1.0.0');

const plugins = appJson.expo.plugins.filter(
  (plugin) =>
    plugin !== './plugins/with-onnxruntime.js' && plugin !== './plugins/with-onnxruntime',
);

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [
      ...plugins,
      '@kesha-antonov/react-native-background-downloader',
      withOnnxruntime,
      withLargeHeap,
    ],
  },
};
