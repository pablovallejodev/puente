const path = require("path");

const onnxRoot = path.dirname(
  require.resolve("onnxruntime-react-native/package.json"),
);

module.exports = {
  dependencies: {
    "onnxruntime-react-native": {
      platforms: {
        android: {
          sourceDir: path.join(onnxRoot, "android"),
          packageImportPath:
            "import ai.onnxruntime.reactnative.OnnxruntimePackage;",
          packageInstance: "new OnnxruntimePackage()",
        },
      },
    },
  },
};
