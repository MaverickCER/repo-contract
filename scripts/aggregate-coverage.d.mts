export interface AggregateCoverageResult {
  readonly outDir: string
  readonly summaryPath: string
  readonly finalPath: string
}

export declare function aggregateCoverage(root?: string): AggregateCoverageResult
