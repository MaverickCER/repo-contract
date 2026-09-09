/**
 * Turns a list of advisories plus a registry of waivers into a single `repo-contract` policy
 * decision, using `repo-contract/helpers`.
 *
 * The flow, and which helper owns each step:
 *
 *   exceptions.json ──loadExceptionRegistry──▶ validated AdvisoryException[]
 *   advisories ──reconcileExceptions──▶ matched pairs, unwaived findings, stale records
 *   per matched pair ──evaluateExceptionRecord──▶ permitted | insufficient | forbidden (+ missing fields)
 *   per unwaived finding ──resolveExceptionPolicy──▶ is a waiver even allowed for this severity?
 *
 * `repo-contract/helpers` decides nothing about what a "finding" is or how it maps to a record --
 * `deriveAdvisoryId` and the policy config below are entirely this example's own.
 */
import { fileURLToPath } from "node:url"

import type { Policy } from "repo-contract"
import {
  evaluateExceptionRecord,
  hashRequirementFields,
  loadExceptionRegistry,
  reconcileExceptions,
  resolveExceptionPolicy,
} from "repo-contract/helpers"
import type { ExceptionPolicy, ExceptionPolicyConfig } from "repo-contract/helpers"

import { advisories, deriveAdvisoryId } from "./findings.js"
import type { DependencyAdvisory } from "./findings.js"
import {
  advisoryExceptionsSchema,
  advisoryFieldValue,
  SIGNED_OFF_FIELDS,
} from "./exception-record.js"
import type { AdvisoryException } from "./exception-record.js"

const REGISTRY_PATH = fileURLToPath(new URL("./exceptions.json", import.meta.url))

const GROUP = "npm-audit"

/**
 * The organization's stance per severity. `high` / `critical` cannot be waived at all; `moderate`
 * can, but only with both a justification and a considered alternative; `low` is accepted silently.
 */
const advisoryPolicyConfig: ExceptionPolicyConfig = {
  [GROUP]: {
    rules: {
      critical: { mode: "forbidden" },
      high: { mode: "forbidden" },
      moderate: { mode: "exception", requirements: ["justification", "alternatives"] },
      low: { mode: "allowed" },
    },
  },
}

const GLOBAL_DEFAULT: ExceptionPolicy = { mode: "forbidden" }

function classificationFor(finding: DependencyAdvisory) {
  return [{ group: GROUP, category: finding.severity }] as const
}

/** One line describing what happened to one advisory, plus whether it blocks the run. */
interface AdvisoryOutcome {
  readonly blocking: boolean
  readonly line: string
}

function describePermitted(finding: DependencyAdvisory, record: AdvisoryException): AdvisoryOutcome {
  const signoff = hashRequirementFields(record, SIGNED_OFF_FIELDS, advisoryFieldValue)
  return {
    blocking: false,
    line:
      `permitted  ${deriveAdvisoryId(finding)} (${finding.severity}) -- waiver v${String(record.version)}, ` +
      `sign-off ${signoff.slice(0, 12)}. Re-approve if the justification text changes.`,
  }
}

/**
 * Builds the `policy` for the `DependencyAdvisories` check: reads the waiver registry fresh each
 * run, reconciles it against the current advisories, and returns one `PolicyResult` covering every
 * advisory.
 * @returns An async {@link Policy}.
 */
export function buildAdvisoryPolicy(): Policy {
  return async () => {
    const loaded = await loadExceptionRegistry({
      path: REGISTRY_PATH,
      schema: advisoryExceptionsSchema,
    })

    if (!loaded.ok) {
      return {
        outcome: "fail",
        rationale: ["exceptions.json failed validation:", ...loaded.errors.map((e) => `- ${e}`)].join(
          "\n",
        ),
      }
    }

    const reconciled = reconcileExceptions<DependencyAdvisory, AdvisoryException>({
      existing: loaded.records,
      findings: advisories,
      deriveId: deriveAdvisoryId,
      createStub: (finding, id) => ({
        id,
        version: 0,
        justification: "",
        alternatives: "",
      }),
    })

    if (!reconciled.ok) {
      return { outcome: "fail", rationale: `Could not reconcile exceptions.json: ${reconciled.error}` }
    }

    const { matchedPairs, newStubIds, staleRecords } = reconciled.reconciliation
    const recordFor = new Map(matchedPairs.map((pair) => [deriveAdvisoryId(pair.finding), pair.record]))
    const outcomes: AdvisoryOutcome[] = []

    for (const finding of advisories) {
      const id = deriveAdvisoryId(finding)
      const policy = resolveExceptionPolicy(classificationFor(finding)[0], advisoryPolicyConfig, GLOBAL_DEFAULT)

      if (policy.mode === "allowed") {
        outcomes.push({ blocking: false, line: `allowed    ${id} (${finding.severity}) -- accepted by policy, no waiver needed.` })
        continue
      }

      if (policy.mode === "forbidden") {
        outcomes.push({
          blocking: true,
          line: `forbidden  ${id} (${finding.severity}) -- ${finding.title}. This severity cannot be waived; upgrade the dependency.`,
        })
        continue
      }

      const record = recordFor.get(id)
      if (record === undefined) {
        outcomes.push({
          blocking: true,
          line: `unwaived   ${id} (${finding.severity}) -- ${finding.title}. Add a justified entry to exceptions.json or upgrade.`,
        })
        continue
      }

      const determinant = evaluateExceptionRecord({
        record,
        classifications: classificationFor(finding),
        config: advisoryPolicyConfig,
        globalDefault: GLOBAL_DEFAULT,
        fieldValue: advisoryFieldValue,
      })

      if (determinant.verdict === "permitted") {
        outcomes.push(describePermitted(finding, record))
      } else if (determinant.verdict === "insufficient") {
        outcomes.push({
          blocking: true,
          line: `insufficient ${id} (${finding.severity}) -- waiver is missing: ${determinant.missing.join(", ")}. Fill those fields in exceptions.json.`,
        })
      } else {
        outcomes.push({
          blocking: true,
          line: `forbidden  ${id} (${finding.severity}) -- policy forbids a waiver here.`,
        })
      }
    }

    for (const stale of staleRecords) {
      outcomes.push({
        blocking: true,
        line: `stale      ${stale.id} -- waiver matches no current advisory. Remove it from exceptions.json.`,
      })
    }

    // newStubIds is what a reconcile-and-write workflow would append to the registry as blank stubs
    // for a human to justify; here it just confirms which findings had no waiver at all.
    void newStubIds

    const blocking = outcomes.filter((outcome) => outcome.blocking)
    const rationale = [
      `${String(advisories.length)} advisory(ies), ${String(matchedPairs.length)} with a waiver:`,
      ...outcomes.map((outcome) => `- ${outcome.line}`),
    ].join("\n")

    return blocking.length === 0
      ? { outcome: "pass", rationale }
      : { outcome: "fail", rationale }
  }
}
