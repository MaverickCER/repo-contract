export interface PatchContractScriptResult {
  readonly text: string
  readonly status: "created" | "unchanged" | "conflict"
}

export declare function patchContractScript(
  text: string,
  scriptValue: string,
): PatchContractScriptResult
