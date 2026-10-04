import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const routes = { home: '/', about: '/about', schools: '/schools', register: '/register', 'register-school': '/register/school' };
export const profiles = {
  unthrottled: { latencyMs: 0, downloadMbps: null, uploadMbps: null, cpuRate: 1 },
  'mobile-pressure': { latencyMs: 150, downloadMbps: 10, uploadMbps: 2, cpuRate: 4 },
};
const safeOrigin = value => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Performance URLs must be HTTP(S), without credentials, query or fragment.');
  }
  return url.origin;
};
export async function readOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${name}`);
    const key = name.slice(2);
    options[key] = ['smoke', 'resume'].includes(key) ? true : argv[++i];
    if (options[key] === undefined) throw new Error(`Missing value for ${name}`);
  }
  const allowed = ['before-session', 'after-session', 'before-url', 'after-url', 'before-label', 'after-label',
    'before-api-url', 'after-api-url', 'before-cdn-url', 'after-cdn-url', 'rounds', 'profile', 'output',
    'viewports', 'routes', 'observation-ms', 'motion', 'smoke', 'resume', 'click-readiness'];
  for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error(`Unknown option --${key}`);
  const config = { rounds: Number(options.rounds ?? 5), profile: options.profile ?? 'unthrottled',
    output: path.resolve(options.output ?? `artifacts/performance/${Date.now()}`),
    viewports: (options.viewports ?? 'desktop,mobile').split(','),
    routes: (options.routes ?? Object.keys(routes).join(',')).split(','),
    observationMs: Number(options['observation-ms'] ?? 5000), motion: options.motion ?? 'no-preference',
    smoke: !!options.smoke, resume: !!options.resume, variants: {} };
  config.clickReadiness = options['click-readiness'] ?? 'preview';
  if (!['preview', 'complete'].includes(config.clickReadiness)) throw new Error('Use --click-readiness preview or complete.');
  if (!Number.isInteger(config.rounds) || config.rounds < (config.smoke ? 1 : 5)) throw new Error('At least five paired rounds are required (or explicit --smoke).');
  if (!profiles[config.profile]) throw new Error('Use --profile unthrottled or mobile-pressure.');
  if (config.viewports.some(value => !['desktop', 'mobile'].includes(value))) throw new Error('Unknown viewport.');
  if (config.routes.some(value => !routes[value])) throw new Error('Unknown route name.');
  if (!['no-preference', 'reduce'].includes(config.motion)) throw new Error('Unknown motion setting.');
  if (!(config.observationMs >= 1000 && config.observationMs <= 20_000)) throw new Error('Observation window must be 1000–20000 ms.');
  for (const variant of ['before', 'after']) {
    let session = {};
    if (options[`${variant}-session`]) {
      session = JSON.parse(await readFile(options[`${variant}-session`], 'utf8'));
      if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) throw new Error(`${variant} session has expired.`);
    }
    const rawWebUrl = options[`${variant}-url`] ?? session.webUrl ?? session[`${variant}Url`];
    if (!rawWebUrl) throw new Error(`Provide --${variant}-session or --${variant}-url.`);
    const webUrl = safeOrigin(rawWebUrl);
    if (new URL(rawWebUrl).pathname !== '/') throw new Error('Web base URL must be an origin, without a path.');
    const apiUrl = options[`${variant}-api-url`] ?? session.apiUrl;
    const cdnUrl = options[`${variant}-cdn-url`] ?? session.cdnUrl;
    config.variants[variant] = { webUrl, apiOrigin: apiUrl ? safeOrigin(apiUrl) : null,
      cdnOrigin: cdnUrl ? safeOrigin(cdnUrl) : null,
      label: options[`${variant}-label`] ?? session.sourceLabel ?? session.revision ?? 'UNIDENTIFIED_SOURCE',
      runId: session.runId ?? null, expiresAt: session.expiresAt ?? null,
      locality: ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(webUrl).hostname) ? 'loopback' : 'remote' };
  }
  return config;
}

export function browserEnvironment() {
  const env = { ...process.env };
  const removed = [];
  for (const key of Object.keys(env)) {
    if (/^(https?_proxy|all_proxy|no_proxy|ftp_proxy|node_use_env_proxy|global_agent_.*proxy|npm_config_.*proxy)$/i.test(key)) {
      removed.push(key); delete env[key];
    }
  }
  return { env, removed };
}
