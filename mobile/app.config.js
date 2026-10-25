const variants = {
  production: { name: "Iron Strength", suffix: "", scheme: "iron-strength" },
  preview: { name: "Iron Strength Preview", suffix: ".preview", scheme: "iron-strength-preview" },
  development: { name: "Iron Strength Dev", suffix: ".dev", scheme: "iron-strength-dev" },
  quality: { name: "Iron Strength Pruebas", suffix: ".quality", scheme: "iron-strength-quality" },
};

// Identificadores propuestos localmente; se verifican antes de registrarlos en tiendas.
module.exports = ({ config }) => {
  const variantName = process.env.APP_VARIANT ?? "production";
  if (!Object.hasOwn(variants, variantName)) throw new Error("APP_VARIANT no reconocida");
  if (variantName === "quality") {
    if (process.env.EAS_BUILD === "true") throw new Error("La variante de pruebas es solo local");
    let origin;
    try {
      origin = new URL(process.env.EXPO_PUBLIC_API_URL);
    } catch {
      throw new Error("Falta el origen HTTPS de pruebas");
    }
    if (
      origin.protocol !== "https:" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(origin.hostname) ||
      origin.username ||
      origin.password ||
      origin.port ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("El origen de pruebas debe ser un túnel HTTPS sin ruta ni credenciales");
  }
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
      ...(variantName === "development"
        ? {}
        : {
            blockedPermissions: [
              ...new Set([
                ...(config.android?.blockedPermissions ?? []),
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
                "android.permission.SYSTEM_ALERT_WINDOW",
              ]),
            ],
          }),
    },
  };
};
