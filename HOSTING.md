# Deploying the app to Render

The Render Blueprint at the repository root deploys the frontend and backend services from `DoAn/BE` and `DoAn/FE`.

## Initial Render setup

1. In Render, choose **New > Blueprint** and connect this repository and the branch containing `render.yaml`.
2. Set `MONGO_URI` for both `quan1-site-service` and `quan1-translation-service` in Render's secret environment-variable fields. Keep `MONGO_DATABASE` set to `district1_historical_db`, or change it for both services if the existing database uses a different name. Set the required `DEEPSEEK_API_KEY` on the translation service if that provider is used.
3. Configure MongoDB network access to allow the deployed Render services, following the database provider's recommended restrictions.
4. Confirm the Blueprint creates all four services and that their environment variables and health checks are configured. The `quan1-web` site uses both backend URLs; `quan1-admin` uses the site service.
5. The Blueprint sets `autoDeploy: false` so production deployment happens only after GitHub Actions passes CI. Sync this setting in Render after updating the Blueprint.

## GitHub Actions CI/CD setup

CI runs the translation-service tests and builds both frontends on pull requests and pushes to `main`. CD runs after CI succeeds on `main` and sends a deploy request to each Render service.

In the repository's **Settings > Secrets and variables > Actions**, add these four repository secrets using each service's **Settings > Deploy Hook** URL from Render:

- `RENDER_DEPLOY_HOOK_SITE_SERVICE`
- `RENDER_DEPLOY_HOOK_TRANSLATION_SERVICE`
- `RENDER_DEPLOY_HOOK_WEB`
- `RENDER_DEPLOY_HOOK_ADMIN`

Keep the hook URLs, MongoDB connection string, and provider API keys in GitHub/Render secrets only; never commit them. You can also start the workflow manually with **Actions > CI/CD > Run workflow**.

## Local backend development

Run the backend services with Docker Compose from the repository root:

```sh
docker compose --env-file DoAn/BE/.env -f DoAn/BE/docker-compose.yml up --build
```

Create `DoAn/BE/.env` with `MONGODB_URI` and any provider keys you need; do not commit it. The Compose file expects the database URI and starts the site API on port `8000` and translation API on port `8001`.

## Production URLs

- Public site: https://quan1-web-4pxd.onrender.com
- Admin: https://quan1-admin.onrender.com
- Site API: https://quan1-site-service-a1vt.onrender.com
- Translation API: https://quan1-translation-service-d3xw.onrender.com

Free Render services may sleep when idle, so the first request after inactivity can take longer. Audio assets and translations are stored in MongoDB, not only on the service's temporary disk.

## Sharing and custom domains

Share https://quan1-web-4pxd.onrender.com directly. A custom domain is optional; add one under the `quan1-web` static site's **Settings > Custom Domains** in Render and configure the DNS records Render provides.
