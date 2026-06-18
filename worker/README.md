# Link Parser Worker

`parse-link-worker.js` is an optional Cloudflare Worker for automatic tutorial link parsing.

## Enable

1. Create a Cloudflare Worker.
2. Paste or deploy `parse-link-worker.js`.
3. Copy the Worker HTTPS URL.
4. Set `PARSE_PROXY` in `app/config.js`:

```js
window.MLK_CONFIG.PARSE_PROXY = 'https://your-worker-url.workers.dev';
```

5. Commit, push, and let GitHub Pages redeploy.

The PWA will then call the worker when parsing a shared recipe link. Without this URL, the app still tries to extract title, ingredients, and steps from the copied share text itself.

## API

POST JSON:

```json
{ "url": "https://example.com/recipe", "text": "optional copied share text" }
```

Response:

```json
{
  "title": "Recipe title",
  "cover": "https://example.com/cover.jpg",
  "ingredients": ["鸡蛋", "番茄"],
  "steps": ["炒鸡蛋", "炒番茄并混合"],
  "state": "auto",
  "link": "https://example.com/recipe"
}
```
