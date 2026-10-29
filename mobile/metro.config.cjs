const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// Router transforms include this project's route root. Separate local copies that
// share node_modules so a cached entry cannot resolve a previous copy's screens.
config.cacheVersion = `${config.cacheVersion}:${__dirname}`;
// Solo los contratos y reglas puros compartidos; la app web no se empaqueta en el móvil.
config.watchFolders = [path.resolve(__dirname, "../src")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
