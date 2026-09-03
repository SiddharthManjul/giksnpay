import { spawnSync } from "node:child_process";

const gatewayOrigin = requireHttpsOrigin("MINDPAY_GATEWAY_ORIGIN");
const webOrigin = requireHttpsOrigin("MINDPAY_WEB_ORIGIN");
const passkeyRpId = requirePublicRpId("MINDPAY_PASSKEY_RP_ID");

for (const [name, origin] of [
  ["MINDPAY_GATEWAY_ORIGIN", gatewayOrigin],
  ["MINDPAY_WEB_ORIGIN", webOrigin],
]) {
  const hostname = new URL(origin).hostname.toLowerCase();
  if (hostname !== passkeyRpId && !hostname.endsWith(`.${passkeyRpId}`)) {
    fail(`${name} must be hosted within MINDPAY_PASSKEY_RP_ID`);
  }
}

if (process.argv.includes("--check")) {
  console.log("Production deployment configuration is valid.");
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "deploy",
    "--config",
    "wrangler.production.jsonc",
    "--var",
    `BETTER_AUTH_URL:${gatewayOrigin}`,
    "--var",
    `TRUSTED_ORIGINS:${webOrigin}`,
    "--var",
    `PASSKEY_RP_ID:${passkeyRpId}`,
    "--var",
    `MINDPAY_API_AUDIENCE:${gatewayOrigin}/`,
  ],
  {
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: "inherit",
  },
);

if (result.error !== undefined) fail("Could not start Wrangler");
process.exit(result.status ?? 1);

function requireHttpsOrigin(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") fail(`${name} is required`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} must be an absolute HTTPS origin`);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    isReservedHostname(url.hostname)
  ) {
    fail(
      `${name} must be a public absolute HTTPS origin without credentials, path, query, or hash`,
    );
  }
  return url.origin;
}

function requirePublicRpId(name) {
  const value = process.env[name]?.trim().toLowerCase();
  if (
    value === undefined ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
      value,
    ) ||
    isReservedHostname(value)
  ) {
    fail(`${name} must be a public canonical DNS suffix`);
  }
  return value;
}

function isReservedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return (
    normalized === "localhost" ||
    [".example", ".invalid", ".localhost", ".test"].some(
      (suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix),
    )
  );
}

function fail(message) {
  console.error(`Production deployment blocked: ${message}`);
  process.exit(1);
}
