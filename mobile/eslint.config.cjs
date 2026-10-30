const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  {
    ignores: [
      "dist/**",
      ".expo/**",
      ".build-evidence/**",
      ".simulator-evidence/**",
      ".ios-quality-evidence/**",
      ".ios-quality-raw/**",
      ".ios-quality-tools/**",
    ],
  },
]);
