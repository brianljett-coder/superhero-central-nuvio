# 🦸 Superhero Central — Nuvio Addon

A superhero-focused catalog addon for Nuvio/Stremio using TMDB metadata.

## Includes
- Superhero Movies
- Superhero Series
- Marvel
- DC
- Animated superheroes
- Classic superheroes
- Other comic-book heroes
- Catalog search

## Important
This addon supplies catalog/metadata only. It does not provide unauthorized copies of copyrighted movies or TV episodes.

## Deploy
1. Create a small Node.js web service from this folder.
2. Set environment variable `TMDB_API_KEY` to your TMDB API key.
3. Start with `npm start`.
4. Make sure the service is reachable over HTTPS.
5. In Nuvio choose Addons → Install from URL and enter:
   `https://YOUR-DOMAIN.example/manifest.json`

## Optional environment variables
- `PORT` (default 7000)
- `PUBLIC_URL`
- `TMDB_LANGUAGE` (default en-US)
- `TMDB_REGION` (default US)

Nuvio uses the standard Stremio addon protocol, so the addon exposes `/manifest.json`, `/catalog/...`, and `/meta/...` endpoints.
