# Deploying the app to Render

Render provides a public `onrender.com` URL for the web app, so a purchased domain is not required. The `render.yaml` Blueprint creates the static frontend and both FastAPI services.

## Before deploying

1. Put the `BE`, `FE`, `render.yaml`, and `HOSTING.md` paths in one GitHub repository. Render deploys from a connected Git provider; this workspace currently has no Git repository configured.
2. Sign in to Render and choose **New > Blueprint**. Connect that repository and select the branch containing `render.yaml`.
3. When prompted, enter the existing MongoDB connection string as `MONGO_URI` for both `quan1-site-service` and `quan1-translation-service`. Enter it only in Render's secret environment-variable fields; do not commit it or paste it into chat. Keep `MONGO_DATABASE` set to `district1_historical_db`, or change it in both services if the existing database uses a different name.
4. In the MongoDB provider's network-access settings, allow connections from the deployed Render services. Use the provider's recommended network restrictions where available.
5. Wait for all three services to finish deploying. Render supplies HTTPS URLs for the web app and APIs; the Blueprint connects the frontend to both API services.
6. Open the `quan1-web` service's `onrender.com` URL and test the site list and audio. Free web services can sleep when idle, so the first request after inactivity may take longer.

Audio assets and translations are stored in MongoDB, not only on the service's temporary disk.

## Sharing with a friend

Send the public `quan1-web` `onrender.com` URL to your friend. They do not need a separate account or a domain to open the app.

## Adding a custom domain later

After buying a domain, add it to the `quan1-web` static site under **Settings > Custom Domains** in Render. Then add the DNS records Render displays at your domain provider and verify the domain in Render. Keep the generated `onrender.com` URL as a fallback.
