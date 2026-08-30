export declare function toKebabSlug(title: string): string

export declare function nextAdrNumber(entries: readonly string[]): string

export declare function createAdr(
  root: string,
  title: string,
): Promise<{ readonly number: string; readonly slug: string; readonly filePath: string }>
