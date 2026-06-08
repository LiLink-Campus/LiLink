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
