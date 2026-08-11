const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// JSON stays in sourceExts (Metro parses small configs). Large tokenizer uses .jsondata raw asset.
config.resolver.assetExts.push("onnx", "jsondata");

module.exports = config;
