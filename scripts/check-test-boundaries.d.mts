export interface TestBoundariesResult {
  readonly ok: true
  readonly filesScanned: number
  readonly violations: readonly string[]
}

export interface TestBoundariesFailure {
  readonly ok: false
  readonly error: string
}

export declare function checkTestBoundaries(
  root?: string,
): TestBoundariesResult | TestBoundariesFailure
