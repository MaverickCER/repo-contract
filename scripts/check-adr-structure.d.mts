export interface AdrStructureResult {
  readonly ok: true
  readonly filesScanned: number
  readonly violations: readonly string[]
}

export interface AdrStructureFailure {
  readonly ok: false
  readonly error: string
}

export declare function checkAdrStructure(root?: string): AdrStructureResult | AdrStructureFailure
