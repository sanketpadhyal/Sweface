const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = Array.from(new Set([...config.resolver.assetExts, "onnx"]));
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== "onnx");
config.serializer = {
  ...config.serializer,
  sourceMapUrl: undefined
};

module.exports = config;
