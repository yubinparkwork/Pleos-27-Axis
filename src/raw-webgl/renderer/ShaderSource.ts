export type ShaderIncludeMap = Readonly<Record<string, string>>;

const INCLUDE_PATTERN = /^[ \t]*#include\s+<([a-z0-9-]+)>[ \t]*$/gim;

/** Expand the intentionally small GLSL include dialect used by this renderer. */
export function preprocessShaderSource(
  source: string,
  includes: ShaderIncludeMap,
  stack: readonly string[] = [],
): string {
  return source.replace(INCLUDE_PATTERN, (_statement, name: string) => {
    const include = includes[name];
    if (include === undefined) throw new Error(`Unknown GLSL include <${name}>.`);
    if (stack.includes(name)) {
      throw new Error(`Recursive GLSL include: ${[...stack, name].join(" -> ")}.`);
    }
    return `\n// begin include <${name}>\n${preprocessShaderSource(include, includes, [...stack, name])}\n// end include <${name}>\n`;
  });
}
