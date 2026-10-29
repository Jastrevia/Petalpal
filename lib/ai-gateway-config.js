// Reviewed standard USD rates, 2026-10-13. No cache discounts or premium tiers.
// See MODEL_SELECTION.md. Integer nanodollars avoid floating-point accounting.
export const GATEWAY_MODELS = Object.freeze({
  "claude-haiku-5-5": Object.freeze({ provider: "ANTHROPIC", actions: Object.freeze(["EVENT_EMOTION", "FAIRY_MOMENT"]), inputRate: 100, outputRate: 500 }),
  "claude-sonnet-5-5": Object.freeze({ provider: "ANTHROPIC", actions: Object.freeze(["WEEKLY_REPORT"]), inputRate: 2000, outputRate: 10000 }),
  "claude-opus-5-5": Object.freeze({ provider: "ANTHROPIC", actions: Object.freeze(["MONTHLY_REPORT", "PETAL_READING"]), inputRate: 4000, outputRate: 20000 }),
  "gpt-6-sol": Object.freeze({ provider: "OPENAI", actions: Object.freeze(["WEEKLY_REPORT", "MONTHLY_REPORT"]), inputRate: 2000, outputRate: 10000 })
});
export const GATEWAY_TASK_LIMITS = Object.freeze({
  EVENT_EMOTION: Object.freeze({ input: 4096, output: 512, timeoutMs: 3000 }),
  FAIRY_MOMENT: Object.freeze({ input: 4096, output: 256, timeoutMs: 8000 }),
  // Opus thinks before writing (effort low); its thinking counts toward the output cap.
  PETAL_READING: Object.freeze({ input: 6144, output: 2048, timeoutMs: 30000 }),
  WEEKLY_REPORT: Object.freeze({ input: 8192, output: 4096, timeoutMs: 20000 }),
  MONTHLY_REPORT: Object.freeze({ input: 16384, output: 8192, timeoutMs: 20000 })
});
const CODES = new Set(["AI_GATEWAY_DISABLED", "AI_GATEWAY_CONFIG_INVALID", "AI_GATEWAY_INVALID_INPUT", "AI_GATEWAY_FORBIDDEN",
  "AI_GATEWAY_REPLAY_BLOCKED", "AI_GATEWAY_TIMEOUT", "AI_GATEWAY_TRANSPORT_FAILED", "AI_GATEWAY_RATE_LIMITED",
  "AI_GATEWAY_PROVIDER_AUTH_FAILED", "AI_GATEWAY_PROVIDER_FAILED", "AI_GATEWAY_INVALID_OUTPUT", "AI_GATEWAY_GROUNDING_FAILED"]);
export function gatewayError(code, outcome = "NOT_DISPATCHED") {
  const error = new Error("AI Gateway request unavailable");
  error.code = CODES.has(code) ? code : "AI_GATEWAY_PROVIDER_FAILED";
  error.outcome = outcome;
  error.retryable = false; // Even explicit upstream errors do not authorize replay.
  return error;
}
function flag(env, name) {
  if (env[name] === undefined || env[name] === "false") return false;
  if (env[name] !== "true") throw gatewayError("AI_GATEWAY_CONFIG_INVALID");
  return true;
}
export function gatewayModel(model, action) {
  const spec = Object.hasOwn(GATEWAY_MODELS, model) ? GATEWAY_MODELS[model] : null;
  if (!spec || !spec.actions.includes(action)) throw gatewayError("AI_GATEWAY_INVALID_INPUT");
  return spec;
}
export function gatewayQuote({ model, action, inputTokens, maxOutputTokens }) {
  const spec = gatewayModel(model, action), limits = GATEWAY_TASK_LIMITS[action];
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 1 || inputTokens > limits.input ||
      !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > limits.output) {
    throw gatewayError("AI_GATEWAY_INVALID_INPUT");
  }
  return Object.freeze({ provider: spec.provider, model, inputTokens, maxOutputTokens,
    reservedNanoUsd: Math.ceil(inputTokens * spec.inputRate * 1.25) + maxOutputTokens * spec.outputRate });
}
export function usdLimitNano(env, name) {
  const value = env[name];
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,5})(\.\d{1,9})?$/.test(value)) throw gatewayError("AI_GATEWAY_CONFIG_INVALID");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 1e9 + Number(fraction.padEnd(9, "0"));
}
export function gatewayBudgetLimits(env, provider) {
  return Object.freeze({
    userDay: usdLimitNano(env, "AI_USER_DAILY_USD_LIMIT"),
    userMonth: usdLimitNano(env, "AI_USER_MONTHLY_USD_LIMIT"),
    globalDay: usdLimitNano(env, "AI_GLOBAL_DAILY_USD_LIMIT"),
    globalMonth: usdLimitNano(env, "AI_GLOBAL_MONTHLY_USD_LIMIT"),
    providerMonth: usdLimitNano(env, `AI_${provider}_MONTHLY_USD_LIMIT`)
  });
}
export function readGatewayConfig(env, provider) {
  if (!flag(env, "AI_GATEWAY_ENABLED") || !flag(env, `AI_GATEWAY_${provider}_ENABLED`)) throw gatewayError("AI_GATEWAY_DISABLED");
  const account = env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID, gateway = env.CLOUDFLARE_AI_GATEWAY_ID;
  if (typeof account !== "string" || !/^[a-f0-9]{32}$/.test(account) ||
      typeof gateway !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(gateway)) throw gatewayError("AI_GATEWAY_CONFIG_INVALID");
  const token = env.CLOUDFLARE_AI_GATEWAY_TOKEN, key = env[`${provider}_API_KEY`];
  if (![token, key].every(v => typeof v === "string" && /^[\x21-\x7e]{1,4096}$/.test(v))) throw gatewayError("AI_GATEWAY_CONFIG_INVALID");
  gatewayBudgetLimits(env, provider); // Unset/invalid budgets fail closed, zero is a kill switch.
  return { baseUrl: `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}`, token, key };
}
