/** The oldest TypeScript release the `typescript` peer range admits, as `<major>.<minor>`. */
export declare const TYPESCRIPT_FLOOR: string

/** The floor, then the newest release of each major a consumer may have installed. */
export declare const TYPESCRIPT_COMPAT_VERSIONS: readonly string[]

/** The floor of a `>=<major>.<minor>.<patch>` range, as `<major>.<minor>`. */
export declare function rangeFloor(range: string): string

/** The `@types/node` version to install for one compat version. */
export declare function nodeTypesFor(version: string, enginesNode: string): string
