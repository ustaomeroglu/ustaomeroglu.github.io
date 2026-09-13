# AI assistant setup

The site has a chat widget (`js/assistant.js` + the `ai-*` styles) that answers
visitors' questions about Muhammed and his research. It talks to a small
Cloudflare Worker (`assistant/worker.js`) that holds the Gemini API key and the
site's content, so no secrets ever appear in the website code.

The widget stays **hidden** until `WORKER_URL` in `js/assistant.js` is set, so
the site works fine before/without this setup.

Everything below is free: Gemini free tier (no credit card) + Cloudflare
Workers free plan (100k requests/day).

## 1. Get a Gemini API key (~2 min)

1. Go to https://aistudio.google.com/ and sign in with a Google account.
2. Click **Get API key** → **Create API key**.
3. Copy the key (starts with `AIza...`).

## 2. Deploy the Worker (~5 min)

1. Create a free account at https://dash.cloudflare.com/.
2. In the dashboard: **Workers & Pages** → **Create** → **Create Worker**.
   Name it e.g. `site-assistant`, click **Deploy** (the hello-world default).
3. Click **Edit code**, delete the boilerplate, paste the full contents of
   `assistant/worker.js`, then **Deploy**.
4. Back on the Worker page: **Settings** → **Variables and Secrets** →
   **Add** → type **Secret**, name `GEMINI_API_KEY`, value = your key from
   step 1. Save (this redeploys).
5. Copy the Worker URL, e.g. `https://site-assistant.<your-subdomain>.workers.dev`.

Quick test from a terminal (should return JSON with an `answer`):

```bash
curl -s https://site-assistant.<your-subdomain>.workers.dev \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: https://ustaomeroglu.github.io" \
  -d '{"messages":[{"role":"user","text":"What is RET?"}]}'
```

## 3. Point the widget at the Worker

In `js/assistant.js`, set the first line:

```js
const WORKER_URL = "https://site-assistant.<your-subdomain>.workers.dev";
```

Commit and push. The "Ask my AI" button appears at the bottom-right of the site.

## Notes

- **Quota:** Gemini's free tier is per-day (a few hundred to ~1500 requests
  depending on model). When it runs out, the Worker returns a friendly
  "my PhD stipend could not buy more API credits" message; it resets at
  midnight Pacific.
- **Models:** `MODELS` in `worker.js` lists model IDs tried in order. If Google
  retires one (404), the next is used. Update the list as new free Flash
  models appear.
- **Site content:** the assistant's knowledge lives in `SYSTEM_PROMPT` in
  `worker.js`. When the site or papers change, edit it and redeploy (paste the
  updated file in the dashboard editor).
- **Abuse limits:** the Worker only accepts requests from
  `ustaomeroglu.github.io` (and localhost for testing), caps message sizes and
  reply length, and your only real exposure is someone burning the free daily
  quota.
