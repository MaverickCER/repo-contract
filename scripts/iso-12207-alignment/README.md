# ISO/IEC/IEEE 12207:2017 alignment generator

Generates `docs/ISO-IEC-IEEE-12207-2017.md` — a non-normative report mapping this repository's own, already-gathered evidence (from `repo-contract`'s own contract/evidence mechanism) against ISO/IEC/IEEE 12207:2017's published process structure. See that document's own generated disclaimer for the reader-facing framing; this file covers the legal reasoning behind how it was built.

## What this is, and isn't

- **Is**: a mapping of this repository's own technical evidence (checks that already run on every `npm run contract`, plus a few directly-computed facts like the ADR count) against the standard's process CATEGORIES and NAMED PROCESSES — a table-of-contents-level structural fact about the standard, not its protected expression.
- **Isn't**: a certification, a conformity assessment, a claim of compliance with any clause of the standard, or a reproduction of the standard's own copyrighted text (which describes, in detail, what each process entails — this generator never quotes or paraphrases that text).

## Why the process list is safe to use

ISO/IEC/IEEE 12207:2017's full text is proprietary and purchasable through ISO/IEC/IEEE. This generator never reads, quotes, or reproduces that text. What it does use — the standard's four top-level process category names (Agreement Processes, Organizational Project-Enabling Processes, Technical Management Processes, Technical Processes) and the named processes within each — was sourced from two independent, freely available secondary summaries, not the standard itself:

- Wikipedia's ISO/IEC 12207 article
- <https://quality.arc42.org/standards/iso12207>

Both describe the standard's structure (its process names, akin to a table of contents) without reproducing its substantive clause text. Where the two sources differed slightly in naming, the more granular naming was kept — see [`process-map.ts`](process-map.ts)'s own sourcing comment for the exact list. A list of short, functional category/process names is generally understood as a fact about the standard's organization, not the kind of original expression copyright protects; this generator treats that distinction as load-bearing and stays strictly on the "structure" side of it.

## The evidentiary-traceability rule

Every `"Evidence found"` entry in the generated document must trace to a specific, named source: a `repo-contract` check's own result, a directly computed number (an ADR count, a coverage percentage), or a committed file's presence. Every `"No evidence"` entry states, honestly, why this repository's own technical contract has nothing to say about that process — most commonly because the process is an organizational or business-management concern (staffing, acquisition agreements, portfolio management) that a single source-controlled repository's evidence cannot speak to, not because the generator forgot to check.

No claim is ever made without a traceable evidence source, and no process is silently omitted from the document — every process the standard's structure names gets an explicit row, evidence-found or not.

## Architecture

```text
repo-contract's own checks (openssf-scorecard's evaluators, coverage, mutation, ADR count)
  -> gather-evidence.ts (maps each fact to a 12207 process, or records "no evidence" honestly)
  -> render-markdown.ts (renders the disclaimer-carrying document)
  -> run.ts (the spawned entrypoint; writes docs/ISO-IEC-IEEE-12207-2017.md)
```

This check's own PASS/FAIL (`checks/iso-12207-alignment.ts`) is about whether the evidence was successfully gathered and the document successfully regenerated — never about how many processes have evidence. A repository with fewer evidence-backed processes is not "failing" anything; it's information for a human reader, exactly the same non-judgmental framing `openssf-scorecard`'s own check uses.
