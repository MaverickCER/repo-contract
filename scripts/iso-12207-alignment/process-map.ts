/**
 * The four top-level process categories ISO/IEC/IEEE 12207:2017 organizes
 * its software life cycle processes into, and the named processes within
 * each -- corroborated against two independent, freely available secondary
 * summaries (not the standard's own purchasable text, which this file never
 * quotes or reproduces): Wikipedia's ISO/IEC 12207 article, and
 * https://quality.arc42.org/standards/iso12207. Where the two summaries
 * named a process slightly differently, the more granular (Wikipedia)
 * naming was kept. This is a factual list of process NAMES (a table-of-
 * contents-level fact, not the standard's protected expression describing
 * what each process entails) -- see this directory's own README for the
 * full reasoning on why that distinction matters here.
 */
export interface ProcessDefinition {
  readonly name: string
}
export interface ProcessCategory {
  readonly name: string
  readonly processes: readonly ProcessDefinition[]
}

export const PROCESS_CATEGORIES: readonly ProcessCategory[] = [
  {
    name: "Agreement Processes",
    processes: [{ name: "Acquisition" }, { name: "Supply" }],
  },
  {
    name: "Organizational Project-Enabling Processes",
    processes: [
      { name: "Life Cycle Model Management" },
      { name: "Infrastructure Management" },
      { name: "Portfolio Management" },
      { name: "Human Resource Management" },
      { name: "Quality Management" },
      { name: "Knowledge Management" },
    ],
  },
  {
    name: "Technical Management Processes",
    processes: [
      { name: "Project Planning" },
      { name: "Project Assessment and Control" },
      { name: "Decision Management" },
      { name: "Risk Management" },
      { name: "Configuration Management" },
      { name: "Information Management" },
      { name: "Quality Assurance" },
    ],
  },
  {
    name: "Technical Processes",
    processes: [
      { name: "Business/Mission Analysis" },
      { name: "Stakeholder Needs and Requirements Definition" },
      { name: "System/Software Requirements Definition" },
      { name: "Architecture Definition" },
      { name: "Design Definition" },
      { name: "System Analysis" },
      { name: "Implementation" },
      { name: "Integration" },
      { name: "Verification" },
      { name: "Transition" },
      { name: "Validation" },
      { name: "Operation" },
      { name: "Maintenance" },
      { name: "Disposal" },
    ],
  },
]
