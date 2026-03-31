/**
 * Interactive Doctrine Advocacy — Shareable Scenario Links
 *
 * Encode a ScenarioConfig into a base64url string suitable for embedding
 * in a URL query parameter, and decode it back to a ScenarioConfig.
 *
 * Format: base64url( JSON.stringify(ScenarioConfig) )
 * URL usage: ?scenario=<encoded>
 */

import type { ScenarioConfig, SharedScenarioLink } from "./types.js";
import { makeScenarioId } from "./types.js";

// ── Encoding ─────────────────────────────────────────────────────────────────

/**
 * Encode a ScenarioConfig into a shareable base64url string.
 *
 * The resulting `encoded` field can be appended to any URL as a query
 * parameter and later decoded to reproduce the exact scenario run.
 */
export function encodeScenarioLink(config: ScenarioConfig): SharedScenarioLink {
  const json = JSON.stringify({ scenarioId: config.scenarioId, parameters: config.parameters });
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  return { encoded, decoded: config };
}

// ── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Decode a base64url-encoded string back to a ScenarioConfig.
 *
 * Throws a descriptive Error if the encoded value is malformed or
 * missing required fields.
 */
export function decodeScenarioLink(encoded: string): ScenarioConfig {
  let json: string;
  try {
    json = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    throw new Error(`decodeScenarioLink: invalid base64url encoding`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`decodeScenarioLink: payload is not valid JSON`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)["scenarioId"] !== "string" ||
    typeof (parsed as Record<string, unknown>)["parameters"] !== "object" ||
    (parsed as Record<string, unknown>)["parameters"] === null
  ) {
    throw new Error(
      `decodeScenarioLink: payload must have string scenarioId and object parameters`,
    );
  }

  const raw = parsed as { scenarioId: string; parameters: Record<string, unknown> };

  // Validate each parameter value is a primitive we support
  for (const [key, value] of Object.entries(raw.parameters)) {
    if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") {
      throw new Error(
        `decodeScenarioLink: parameter "${key}" has unsupported type "${typeof value}"`,
      );
    }
  }

  return {
    scenarioId: makeScenarioId(raw.scenarioId),
    parameters: raw.parameters as Record<string, number | string | boolean>,
  };
}
