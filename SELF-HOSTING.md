# Self-Hosting Factory Careers

Factory Careers can be run locally or on a private server with Docker Compose. The hosted Factory production deployment uses Render plus Supabase, but the compose flow remains useful for evaluation, smoke testing, and small private deployments.

## Quick Start

```bash
curl -fsSLO https://raw.githubusercontent.com/theFactoryHQ/factory-careers/main/docker-compose.production.yml
curl -fsSLO https://raw.githubusercontent.com/theFactoryHQ/factory-careers/main/setup.sh
chmod +x setup.sh
./setup.sh
docker compose -f docker-compose.production.yml up -d
```

Open `http://localhost:3000`.

## Services

| Service | Purpose |
| --- | --- |
| `app` | Factory Careers Nuxt/Nitro application. |
| `db` | PostgreSQL database. |
| `minio` | S3-compatible object storage for candidate documents. |
| `adminer` | Optional database browser, enabled with the `tools` profile. |

## Image

The production compose file uses:

```text
ghcr.io/thefactoryhq/factory-careers:latest
```

For repeatable installs, pin the image tag to a release version.

## Environment

`setup.sh` generates local secrets and a `.env` file. Review `.env.example` for production variables before using the app with real candidate data.

At minimum, production-like deployments need:

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `NUXT_PUBLIC_SITE_URL`

## Backups

Back up PostgreSQL and object storage together. A database snapshot without matching document objects is incomplete.

```bash
docker compose -f docker-compose.production.yml exec -T db \
  pg_dump -U "$DB_USER" --no-owner --no-acl "$DB_NAME" > factory-careers.sql

docker run --rm \
  -v factory_careers_minio_data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/factory-careers-minio.tar.gz -C /data .
```

## Security Notes

- Keep Postgres and MinIO bound to localhost or private networking.
- Put HTTPS termination in front of the app for any non-local deployment.
- Rotate `BETTER_AUTH_SECRET`, database credentials, and storage credentials if `.env` is exposed.
- Complete `docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md` before storing real candidate data.

