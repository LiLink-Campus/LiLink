import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function saveBuildRouteSummary(workspace, output) {
  const directory = path.join(workspace, 'apps/web/.next');
  const routes = JSON.parse(await readFile(path.join(directory, 'routes-manifest.json'), 'utf8'));
  const prerender = JSON.parse(await readFile(path.join(directory, 'prerender-manifest.json'), 'utf8'));
  await writeFile(path.join(output, 'build-route-summary.json'), JSON.stringify({
    scope: 'Next production build manifest; not Vercel compiled routes or billed CPU',
    headers: routes.headers, headerCount: routes.headers.length,
    redirectCount: routes.redirects.length, redirects: routes.redirects,
    dynamicRoutes: routes.dynamicRoutes.map(route => route.page),
    staticRoutes: routes.staticRoutes.map(route => route.page),
    prerenderRoutes: Object.fromEntries(Object.entries(prerender.routes).map(([route, value]) =>
      [route, { initialRevalidateSeconds: value.initialRevalidateSeconds }])),
  }, null, 2));
}
