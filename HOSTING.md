# Deploying the app to Render

Render provides a public `onrender.com` URL for the web app, so a purchased domain is not required. The `render.yaml` Blueprint creates the static frontend and both FastAPI services.

## Before deploying

1. Put `render.yaml` and `HOSTING.md` at the GitHub repository root. The current Render Blueprint expects the application folders under `DoAn/BE` and `DoAn/FE` (`APP/thuyet-minh-app` and `WEB/thuyet-minh-web`). Render deploys from a connected Git provider; this workspace currently has no Git repository configured.
2. Sign in to Render and choose **New > Blueprint**. Connect that repository and select the branch containing `render.yaml`.
3. When prompted, enter the existing MongoDB connection string as `MONGO_URI` for both `quan1-site-service-a1vt` and `quan1-translation-service-d3xw`. Enter it only in Render's secret environment-variable fields; do not commit it or paste it into chat. Keep `MONGO_DATABASE` set to `district1_historical_db`, or change it in both services if the existing database uses a different name.
4. In the MongoDB provider's network-access settings, allow connections from the deployed Render services. Use the provider's recommended network restrictions where available.
5. Wait for all four services to finish deploying. The Blueprint connects `quan1-web-4pxd` to both API services and `quan1-admin` to `quan1-site-service-a1vt`; frontend API URLs are supplied by Render from the backend services.
6. Open https://quan1-web-4pxd.onrender.com to test the site list and audio. Open https://quan1-admin.onrender.com to access the admin site. Free web services can sleep when idle, so the first request after inactivity may take longer.

Audio assets and translations are stored in MongoDB, not only on the service's temporary disk.

## Sharing with a friend

Send https://quan1-web-4pxd.onrender.com to your friend. They do not need a separate account or a domain to open the app.

## Adding a custom domain later

After buying a domain, add it to the `quan1-web-4pxd` static site under **Settings > Custom Domains** in Render. Then add the DNS records Render displays at your domain provider and verify the domain in Render. Keep the generated `onrender.com` URL as a fallback.
