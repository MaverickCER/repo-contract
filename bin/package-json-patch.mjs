// A narrowly scoped textual patch for one property: `scripts.contract`. Deliberately not a
// `JSON.parse` -> mutate -> `JSON.stringify` round-trip, which would normalize indentation, key
// order, and newline style across the whole file -- the minimal-mutation invariant this module
// exists to satisfy is that `init` may change only the `scripts.contract` property's value text
// and, when it doesn't exist yet, the minimum surrounding punctuation needed to add it. Every
// other byte of the file is untouched.
//
// Implemented as a small span-locating scanner, not a full JSON parser: `findValueEnd` walks
// exactly one JSON value (string, object, array, or primitive) from a known start offset and
// returns where it ends; `listTopLevelProperties` and `findProperty` use it to walk an object's
// own properties one at a time without needing to understand anything nested inside a value it
// isn't looking for. This is enough to locate a specific top-level property's value span inside a
// specific object -- exactly what's needed here -- without pulling in a JSON library that would
// also reformat on write.

/**
 * Finds the end offset (exclusive) of the single JSON value starting at `start` -- a string,
 * object, array, or bare primitive (number/true/false/null). Strings are scanned respecting
 * backslash escapes so an escaped quote never ends the string early; objects/arrays are scanned
 * with their own depth counter so nested containers (including nested strings, which could
 * otherwise contain a stray `{`/`}`/`[`/`]`) never confuse the outer count.
 * @param text - Full source text.
 * @param start - Offset of the value's first character.
 * @returns Offset one past the value's last character.
 */
function findValueEnd(text, start) {
  const ch = text[start]
  if (ch === '"') {
    let i = start + 1
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") i++
      i++
    }
    return i + 1
  }
  if (ch === "{" || ch === "[") {
    const close = ch === "{" ? "}" : "]"
    let depth = 1
    let i = start + 1
    while (i < text.length && depth > 0) {
      const c = text[i]
      if (c === '"') {
        i++
        while (i < text.length && text[i] !== '"') {
          if (text[i] === "\\") i++
          i++
        }
        i++
        continue
      }
      if (c === ch) depth++
      else if (c === close) depth--
      i++
    }
    return i
  }
  // A bare primitive (number/true/false/null): ends at the next structural delimiter or newline.
  let i = start
  while (i < text.length && !",}]\r\n".includes(text[i])) i++
  return i
}

/**
 * Lists every top-level property of the object literal starting at `objectStart` (the offset of
 * its opening `{`), in source order, with each property's key text and its value's span.
 * @param text - Full source text.
 * @param objectStart - Offset of the object's opening `{`.
 * @returns Ordered property descriptors.
 */
function listTopLevelProperties(text, objectStart) {
  const properties = []
  let i = objectStart + 1
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++
    if (text[i] === "}") break
    const keyStart = i
    const keyEnd = findValueEnd(text, keyStart)
    const key = JSON.parse(text.slice(keyStart, keyEnd))
    i = keyEnd
    while (i < text.length && /\s/.test(text[i])) i++
    i++ // consume ':'
    while (i < text.length && /\s/.test(text[i])) i++
    const valueStart = i
    const valueEnd = findValueEnd(text, valueStart)
    properties.push({ key, keyStart, valueStart, valueEnd })
    i = valueEnd
  }
  return properties
}

/**
 * Finds one named top-level property of the object literal starting at `objectStart`.
 * @param text - Full source text.
 * @param objectStart - Offset of the object's opening `{`.
 * @param key - Property name to find.
 * @returns The matching property descriptor, or `undefined` if not present at this object's own
 * top level (a same-named key nested deeper is never matched).
 */
function findProperty(text, objectStart, key) {
  return listTopLevelProperties(text, objectStart).find((p) => p.key === key)
}

/**
 * Detects the file's newline style and the indentation unit used by an object's own properties
 * (the whitespace between the start of a property's line and its opening quote), falling back to
 * `"\n"` / two spaces when there's nothing to detect from (an empty object with no siblings to
 * copy).
 * @param text - Full source text.
 * @param sampleKeyStart - Offset of a representative property key to measure indentation from, or
 * `undefined` if none exists.
 * @returns The detected newline and indent strings.
 */
function detectStyle(text, sampleKeyStart) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n"
  if (sampleKeyStart === undefined) return { newline, indent: "  " }
  const lineStart = text.lastIndexOf("\n", sampleKeyStart) + 1
  const candidate = text.slice(lineStart, sampleKeyStart)
  // A single-line (minified) file has no newline before `sampleKeyStart` at all, so `lineStart`
  // falls back to 0 and `candidate` becomes everything from the start of the file up to the key
  // -- real JSON content, not whitespace. Using that verbatim as "indentation" would splice
  // arbitrary file content into the insertion and corrupt the output. Only ever treat `candidate`
  // as a real indent when it actually is one (spaces/tabs only); anything else falls back to the
  // same two-space default as "no sample to measure from".
  const indent = /^[ \t]*$/.test(candidate) ? candidate : ""
  return { newline, indent: indent.length > 0 ? indent : "  " }
}

/**
 * Patches `package.json` source text so that `scripts.contract` equals `scriptValue`, touching
 * nothing else in the file. See this module's header for the exact invariant and why a textual
 * scan is used instead of parse/stringify.
 * @param text - Raw `package.json` source text.
 * @param scriptValue - The desired value of `scripts.contract` (e.g. `"tsx scripts/contract.mjs"`).
 * @returns The (possibly unchanged) text and what happened: `"created"` (the property didn't
 * exist and was added), `"unchanged"` (it already had exactly this value), or `"conflict"` (it
 * existed with a different value and was deliberately left alone -- the caller must report this,
 * never overwrite it).
 */
export function patchContractScript(text, scriptValue) {
  const rootStart = text.indexOf("{")
  if (rootStart === -1) {
    throw new Error("package.json does not contain a top-level object")
  }

  const scripts = findProperty(text, rootStart, "scripts")

  if (scripts !== undefined) {
    if (text[scripts.valueStart] !== "{") {
      // findProperty below assumes an object at this offset -- anything else (a string, null,
      // an array, ...) must be rejected here with a clear message, not left to fail deeper with
      // a confusing "not valid JSON" error from treating non-object syntax as one.
      const value = JSON.parse(text.slice(scripts.valueStart, scripts.valueEnd))
      throw new Error(
        `package.json's "scripts" field must be an object, not ${JSON.stringify(value)}.`,
      )
    }

    const contract = findProperty(text, scripts.valueStart, "contract")
    if (contract !== undefined) {
      const currentValue = JSON.parse(text.slice(contract.valueStart, contract.valueEnd))
      if (currentValue === scriptValue) {
        return { text, status: "unchanged" }
      }
      return { text, status: "conflict" }
    }

    // scripts exists but has no contract property -- insert it as the new last property.
    const siblings = listTopLevelProperties(text, scripts.valueStart)
    const lastSibling = siblings.at(-1)
    const { newline, indent: outerIndent } = detectStyle(
      text,
      findProperty(text, rootStart, "scripts")?.keyStart,
    )
    const innerIndent =
      lastSibling === undefined
        ? outerIndent + outerIndent
        : detectStyle(text, lastSibling.keyStart).indent
    const insertion = `"contract": ${JSON.stringify(scriptValue)}`

    if (lastSibling === undefined) {
      // scripts is `{}` (or contains only whitespace) -- insert as its sole property.
      const closeBraceOffset = findValueEnd(text, scripts.valueStart) - 1
      const patched =
        text.slice(0, scripts.valueStart + 1) +
        `${newline}${innerIndent}${insertion}${newline}${outerIndent}` +
        text.slice(closeBraceOffset)
      return { text: patched, status: "created" }
    }

    const patched =
      text.slice(0, lastSibling.valueEnd) +
      `,${newline}${innerIndent}${insertion}` +
      text.slice(lastSibling.valueEnd)
    return { text: patched, status: "created" }
  }

  // No "scripts" property at all -- insert one as the new last top-level property.
  const topLevel = listTopLevelProperties(text, rootStart)
  const lastTop = topLevel.at(-1)
  const { newline, indent: rootIndent } = detectStyle(text, lastTop?.keyStart)
  const innerIndent = rootIndent + rootIndent
  const scriptsBlock =
    `"scripts": {${newline}` +
    `${innerIndent}"contract": ${JSON.stringify(scriptValue)}${newline}` +
    `${rootIndent}}`

  if (lastTop === undefined) {
    const closeBraceOffset = findValueEnd(text, rootStart) - 1
    const patched =
      text.slice(0, rootStart + 1) +
      `${newline}${rootIndent}${scriptsBlock}${newline}` +
      text.slice(closeBraceOffset)
    return { text: patched, status: "created" }
  }

  const patched =
    text.slice(0, lastTop.valueEnd) +
    `,${newline}${rootIndent}${scriptsBlock}` +
    text.slice(lastTop.valueEnd)
  return { text: patched, status: "created" }
}
