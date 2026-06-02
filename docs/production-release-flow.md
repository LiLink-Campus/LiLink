# Production Release Flow

This flow is for the backend API host. The web app deploys separately through Vercel.

## Files

- Local Docker: `docker-compose.local.yml` and `apps/api/Dockerfile.local`
- Production Docker: `docker-compose.prod.yml` and `apps/api/Dockerfile.prod`
- Production startup: `apps/api/scripts/production-entrypoint.mjs`
- Production compose wrapper: `npm run deploy:prod:*`

Production does not run the local PostgreSQL service. The API reads Neon `DATABASE_URL` and other production settings from `/home/admin/lilink/.env`, mounted into the container as the Docker secret `api_env`. Do not use compose `env_file` for production secrets.

The production `.env` must set `APP_ENV=production` or omit `APP_ENV`; any other value makes the production entrypoint fail.

## One-Time Host Cleanup

Older production hosts may have a local `skip-worktree` override on the removed root `docker-compose.yml`. Before merging the production compose split, remove that hidden override so the deleted local file cannot keep shadowing the committed production deploy path:

```sh
cd /home/admin/lilink
git -c safe.directory=/home/admin/lilink ls-files -v docker-compose.yml
cp docker-compose.yml /tmp/lilink-docker-compose.previous.yml
git -c safe.directory=/home/admin/lilink update-index --no-skip-worktree docker-compose.yml
git -c safe.directory=/home/admin/lilink restore docker-compose.yml
```

The backup is only for audit/rollback context. Production deploys from `docker-compose.prod.yml` after this change.

## Release

```sh
cd /home/admin/lilink
git -c safe.directory=/home/admin/lilink fetch origin
git -c safe.directory=/home/admin/lilink merge --ff-only origin/main

# Confirm GitHub Actions passed for this exact commit before deployment when
# status is available.
git -c safe.directory=/home/admin/lilink rev-parse HEAD

docker tag lilink-api:latest lilink-api:previous-good

# Optional but recommended for Sentry source maps. Keep the token in the shell
# or deploy environment, not in compose files or runtime env.
export SENTRY_RELEASE="$(git -c safe.directory=/home/admin/lilink rev-parse HEAD)"
# export SENTRY_AUTH_TOKEN=...

npm run deploy:prod:config
npm run deploy:prod:up
```

If npm is unavailable on the host, use the equivalent compose command:

```sh
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 \
SENTRY_RELEASE="$(git -c safe.directory=/home/admin/lilink rev-parse HEAD)" \
docker compose -f docker-compose.prod.yml up -d --build api
```

## Verify

```sh
docker logs --tail 100 lilink-api
curl -fsS http://127.0.0.1:4000/v1/health
curl -fsS https://api.lilink.top/v1/health
curl -fsS https://api.lilink.top/v1/public/landing
```

Confirm production secrets are not exposed through Docker metadata:

```sh
docker inspect lilink-api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | awk -F= '{print $1}' \
  | grep -E '^(DATABASE_URL|JWT_SECRET|ADMIN_JWT_SECRET|MERCHANT_JWT_SECRET|SMTP_PASS|ADMIN_BOOTSTRAP_PASSWORD|REDEEM_TICKET_SECRET|SENTRY_AUTH_TOKEN)$' \
  && exit 1 || true
```

## Rollback

```sh
docker tag lilink-api:previous-good lilink-api:latest
npm run deploy:prod:up:no-build
```

Prefer a normal forward fix when possible. Rollback is only for restoring API availability after a bad image.
