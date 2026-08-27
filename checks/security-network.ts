import type { NetworkScanEvidence } from "../scripts/security-network/evidence-types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface EvaluateSecurityNetworkPolicyInput {
  readonly evidence: NetworkScanEvidence
}

/**
 * Fails whenever scripts/security-network/scan.ts found any prohibited (or unverifiable) network
 * capability in src/**\/*.ts -- passes only when the whole scanned surface is clean. See
 * specs/decisions/0013-no-network-surface.md.
 * @param root0 - the policy input.
 * @param root0.evidence - the security-network check's evidence to evaluate.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateSecurityNetworkPolicy({
  evidence,
}: EvaluateSecurityNetworkPolicyInput): PolicyResult {
  if (evidence.findings.length === 0) {
    return {
      outcome: "pass",
      rationale: `No prohibited network capability found across ${String(evidence.filesScanned)} file(s) under src/.`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `${String(evidence.findings.length)} prohibited or unverifiable network capability finding(s) ` +
        `across ${String(evidence.filesScanned)} file(s) scanned under src/:`,
      ...evidence.findings.map(
        (finding) =>
          `- ${finding.file}:${String(finding.line)}:${String(finding.column)} [${finding.capability}] ${finding.detail}`,
      ),
      "src/ must never perform network I/O directly -- see SECURITY.md's network-free surface " +
        "guarantee. If this is a genuine, reviewed exception, it requires a fully justified " +
        'disable-comments.json entry (scripts/suppression-governance/policy-config.ts\'s "eslint" ' +
        "default policy already governs an eslint-disable of the underlying rule); a new preset " +
        "command needs adding to scripts/security-network/network-surface.mjs's ALLOWED_PRESET_COMMANDS.",
    ].join("\n"),
  }
}

// Second, independent layer of the "no network calls" invariant -- see eslint.config.js's own doc
// comment on the first (ESLint) layer, and specs/decisions/0013-no-network-surface.md for the full
// threat model. This check's own script (scripts/security-network/scan.ts) never invokes ESLint,
// so a silently weakened/removed ESLint rule or a suppressed violation still fails here.
export const securityNetwork: CheckDefinitionConfig = {
  run: ["tsx", "scripts/security-network/scan.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<NetworkScanEvidence>(
      result.output,
      "security-network check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateSecurityNetworkPolicy({ evidence: parsed.value })
  },
}
