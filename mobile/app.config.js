const variants = {
  production: { name: "Iron Strength", suffix: "", scheme: "iron-strength" },
  preview: { name: "Iron Strength Preview", suffix: ".preview", scheme: "iron-strength-preview" },
  development: { name: "Iron Strength Dev", suffix: ".dev", scheme: "iron-strength-dev" },
};

// Identificadores propuestos localmente; se verifican antes de registrarlos en tiendas.
module.exports = ({ config }) => {
  const variantName = process.env.APP_VARIANT ?? "production";
  if (!Object.hasOwn(variants, variantName)) throw new Error("APP_VARIANT no reconocida");
  const variant = variants[variantName];
  const applicationId = `com.domarchis.ironstrength${variant.suffix}`;
  return {
    ...config,
    name: variant.name,
    scheme: variant.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: applicationId,
      buildNumber: config.ios?.buildNumber ?? "1",
    },
    android: {
      ...config.android,
      package: applicationId,
      versionCode: config.android?.versionCode ?? 1,
    },
  };
};
