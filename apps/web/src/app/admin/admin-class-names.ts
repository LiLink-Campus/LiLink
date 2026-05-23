type CssModule = Record<string, string>;
type ClassValue = string | false | null | undefined;

export function cx(
  styleMaps: CssModule | CssModule[],
  ...values: ClassValue[]
) {
  const maps = Array.isArray(styleMaps) ? styleMaps : [styleMaps];

  return values
    .flatMap((value) => (value ? value.split(/\s+/).filter(Boolean) : []))
    .flatMap((token) => {
      const moduleClasses = maps
        .map((styles) => styles[token])
        .filter(Boolean);

      return moduleClasses.length > 0 ? moduleClasses : token;
    })
    .join(" ");
}
