export function firstSearchParam(value: string | string[] | undefined) {
  return typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value[0]
      : undefined;
}

export function loginHrefFromSearch(search: string) {
  const nextPath = new URLSearchParams(search).get("next");
  if (!nextPath) {
    return "/login";
  }

  return `/login?${new URLSearchParams({ next: nextPath }).toString()}`;
}

export function registerPathFromSearch(search: string, path: string) {
  const nextPath = new URLSearchParams(search).get("next");
  if (!nextPath) {
    return path;
  }

  return `${path}?${new URLSearchParams({ next: nextPath }).toString()}`;
}
