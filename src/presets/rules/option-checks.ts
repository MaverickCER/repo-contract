/**
 * Shows a bad option value in a load-time error. A string is quoted, so `"80"` reads apart from
 * `80` and an empty string stays visible. A list or an object is named, since `String` would print
 * nothing or `[object Object]`.
 * @param value - the value an option was given.
 * @returns the value as the error message shows it.
 */
export function shownValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return "a list"
  if (typeof value === "object" && value !== null) return "an object"
  return String(value)
}

/**
 * Checks a preset's options argument when the config loads. A parameter default replaces only
 * `undefined`, so `null` would otherwise fail as a property read that names no preset.
 * @param preset - the preset's name, for the error.
 * @param options - the options argument, after any parameter default.
 * @throws {TypeError} when `options` is not a plain object.
 */
export function checkOptionsObject(preset: string, options: unknown): void {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError(`${preset}: options must be an object, got ${shownValue(options)}.`)
  }
}

/**
 * Checks a boolean option when the config loads. A truthy string such as `"no"` would otherwise
 * switch the option on.
 * @param preset - the preset's name, for the error.
 * @param option - the option's name.
 * @param value - the option's value; `undefined` means it was left out.
 * @throws {RangeError} when `value` is given and is not `true` or `false`.
 */
export function checkBoolean(preset: string, option: string, value: unknown): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new RangeError(`${preset}: ${option} must be true or false, got ${shownValue(value)}.`)
  }
}

/**
 * Checks path options when the config loads. The tool would misread an empty or non-string path.
 * The check would then fail every run with a misleading message.
 * @param preset - the preset's name, for the error.
 * @param paths - each path option by name.
 * @throws {RangeError} naming the first option that is not a non-empty string.
 */
export function checkPaths(preset: string, paths: Readonly<Record<string, unknown>>): void {
  for (const [option, value] of Object.entries(paths)) {
    if (typeof value !== "string" || value === "") {
      throw new RangeError(
        `${preset}: ${option} must be a non-empty path, got ${shownValue(value)}.`,
      )
    }
  }
}
