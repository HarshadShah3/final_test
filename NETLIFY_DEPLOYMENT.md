# Netlify deployment

The production site is configured as one Netlify project. The React frontend is served from `frontend/dist`, while the Express API runs as the `api` Netlify Function. Browser requests use the same-origin `/api` path, so no public backend URL is required.

## Deploy from GitHub

1. Import the repository and select the deployment branch.
2. Leave **Base directory** empty so Netlify can read the root `netlify.toml`.
3. Netlify will use the configured build command, publish directory and functions directory automatically.
4. Trigger a clean deployment after changing an existing site's base-directory setting.

Do not deploy only the `frontend/dist` folder. A static-only upload does not include the API function and the map cannot load.

## Verification

After deployment, open these URLs on the Netlify domain:

- `/api/health` should return `{"status":"ok"}`.
- `/api/map/regions?metric=population` should return a GeoJSON feature collection containing 56 regions.
- `/preferences` and `/explore` should load directly after a browser refresh.

No production environment variable is required for the API URL. `VITE_API_BASE_URL` remains available only when the frontend and backend are intentionally hosted on different domains.

Frontend document security headers are configured in `netlify.toml`. If using an external API origin, also add that origin to the frontend CSP `connect-src` allow-list. See [frontend security and release links](docs/FRONTEND_SECURITY_AND_RELEASE_LINKS.md) for local checks and the stable Iteration 2 / archived Iteration 1 URL mapping.
