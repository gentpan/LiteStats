export function getWebAuthnConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID ?? "localhost";
  const rpName = process.env.WEBAUTHN_RP_NAME ?? "LiteStats";
  const originEnv = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

  return {
    rpID,
    rpName,
    expectedOrigin: originEnv.split(",").map((value) => value.trim()),
  };
}

export function userIdToBytes(userId: string) {
  return new TextEncoder().encode(userId);
}

export function getWebAuthnHealth() {
  const config = getWebAuthnConfig();
  const isProduction = process.env.NODE_ENV === "production";
  const usesHttps = config.expectedOrigin.every((origin) => origin.startsWith("https://"));
  const rpIdLooksValid = !config.rpID.includes(":") && config.rpID !== "localhost";

  return {
    rpID: config.rpID,
    origins: config.expectedOrigin,
    production: isProduction,
    httpsReady: usesHttps,
    warnings: [
      isProduction && !usesHttps ? "生产环境 WEBAUTHN_ORIGIN 应使用 https://" : null,
      isProduction && !rpIdLooksValid ? "生产环境 WEBAUTHN_RP_ID 应设为真实域名" : null,
    ].filter(Boolean),
  };
}
