const {
  AndroidConfig,
  withAndroidManifest,
  createRunOncePlugin,
} = require("expo/config-plugins");

function withLargeHeap(config) {
  return withAndroidManifest(config, (modConfig) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      modConfig.modResults,
    );
    app.$["android:largeHeap"] = "true";
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withLargeHeap, "with-large-heap", "1.0.0");
