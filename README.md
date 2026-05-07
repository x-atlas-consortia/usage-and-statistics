# Usage & Statistics Board

Public-facing Usage and Statistics Dashboard
Includes Data from search-api's publication-and-usage-stats endpoint
As well as LookerPortals for the Webportal and Dataportal

## Running

```
serve 
```

## Configure API URL (env-style)

This project is static, so browser code cannot read shell env vars directly.
Use runtime config via `envs.js`:

- Set `window.__APP_CONFIG__.API_URL` in `envs.js`.
- `app.js` will use that value; if not present it falls back to the built-in default URL.

Example `envs.js` (already included):

```js
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};
window.__APP_CONFIG__.API_URL = 'http://10.4.119.74:8484/publication-and-usage-stats';
```