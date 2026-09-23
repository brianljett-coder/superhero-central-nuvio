
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 7000;
const BASE = process.env.PUBLIC_URL || "";

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8")
);

const TMDB_KEY = process.env.TMDB_API_KEY || "";
const DEFAULT_LANGUAGE = process.env.TMDB_LANGUAGE || "en-US";
const DEFAULT_REGION = process.env.TMDB_REGION || "US";

// TMDB keyword for "superhero".
const SUPERHERO_KEYWORD = "9715";

// Known production-company IDs.
const MARVEL_STUDIOS = "420";
const DC_ENTERTAINMENT = "9993";

// Number of TMDB pages to examine.
// TMDB normally returns up to 20 results per page.
const MAX_PAGES = 5;

// Maximum number of titles returned to Nuvio/Stremio per catalog.
const MAX_RESULTS = 100;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

function cfgFromReq(req) {
  return {
    key: req.query.tmdb_api_key || TMDB_KEY,
    language: req.query.language || DEFAULT_LANGUAGE,
    region: req.query.region || DEFAULT_REGION
  };
}

async function tmdb(endpoint, cfg, params = {}) {
  if (!cfg.key) {
    throw new Error("TMDB API key is not configured.");
  }

  const u = new URL("https://api.themoviedb.org/3" + endpoint);

  u.searchParams.set("api_key", cfg.key);
  u.searchParams.set("language", cfg.language);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      u.searchParams.set(k, v);
    }
  }

  const r = await fetch(u);

  if (!r.ok) {
    throw new Error(`TMDB HTTP ${r.status}`);
  }

  return r.json();
}

function poster(p) {
  return p
    ? `https://image.tmdb.org/t/p/w500${p}`
    : undefined;
}

function backdrop(p) {
  return p
    ? `https://image.tmdb.org/t/p/w1280${p}`
    : undefined;
}

function toMeta(x, type) {
  const id = x.imdb_id || (x.id ? `tmdb:${x.id}` : undefined);

  const m = {
    id,
    type,
    name: x.title || x.name,
    poster: poster(x.poster_path),
    background: backdrop(x.backdrop_path),
    description: x.overview || "",
    releaseInfo: (
      x.release_date ||
      x.first_air_date ||
      ""
    ).slice(0, 4),
    imdbRating: x.vote_average
      ? Number(x.vote_average.toFixed(1))
      : undefined
  };

  return Object.fromEntries(
    Object.entries(m).filter(([, v]) => v !== undefined && v !== "")
  );
}

function dedupe(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    if (!item || !item.id) continue;

    if (seen.has(item.id)) continue;

    seen.add(item.id);
    output.push(item);

    if (output.length >= MAX_RESULTS) {
      break;
    }
  }

  return output;
}

/*
 * Fetch multiple TMDB pages.
 */
async function discoverPages(type, cfg, params = {}) {
  const endpoint =
    type === "movie"
      ? "/discover/movie"
      : "/discover/tv";

  const all = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await tmdb(endpoint, cfg, {
      ...params,
      page
    });

    const results = data.results || [];

    all.push(...results);

    if (
      !results.length ||
      page >= (data.total_pages || page)
    ) {
      break;
    }
  }

  return dedupeRaw(all);
}

function dedupeRaw(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    if (!item || !item.id) continue;

    const key = `${item.media_type || ""}:${item.id}`;

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

/*
 * General superhero discovery.
 */
async function superheroDiscover(type, cfg) {
  return discoverPages(type, cfg, {
    with_keywords: SUPERHERO_KEYWORD,
    sort_by: "popularity.desc",
    include_adult: "false",
    region: cfg.region,
    ...(type === "movie"
      ? { with_release_type: "2|3|4|5|6" }
      : {})
  });
}

/*
 * Marvel discovery.
 *
 * We deliberately don't rely only on title words.
 * Marvel material is discovered through Marvel production
 * company data plus a broad superhero search.
 */
async function marvelDiscover(type, cfg) {
  const endpoint =
    type === "movie"
      ? "/discover/movie"
      : "/discover/tv";

  const all = [];

  // First: Marvel Studios production company.
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await tmdb(endpoint, cfg, {
      with_companies: MARVEL_STUDIOS,
      sort_by: "popularity.desc",
      include_adult: "false",
      region: cfg.region,
      page
    });

    const results = data.results || [];
    all.push(...results);

    if (
      !results.length ||
      page >= (data.total_pages || page)
    ) {
      break;
    }
  }

  // Second: broad superhero discovery.
  const superhero = await superheroDiscover(type, cfg);
  all.push(...superhero);

  return dedupeRaw(all);
}

/*
 * DC discovery.
 */
async function dcDiscover(type, cfg) {
  const endpoint =
    type === "movie"
      ? "/discover/movie"
      : "/discover/tv";

  const all = [];

  // DC Entertainment company results.
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await tmdb(endpoint, cfg, {
      with_companies: DC_ENTERTAINMENT,
      sort_by: "popularity.desc",
      include_adult: "false",
      region: cfg.region,
      page
    });

    const results = data.results || [];
    all.push(...results);

    if (
      !results.length ||
      page >= (data.total_pages || page)
    ) {
      break;
    }
  }

  // Broad superhero results as a second source.
  const superhero = await superheroDiscover(type, cfg);
  all.push(...superhero);

  return dedupeRaw(all);
}

/*
 * Animated superhero discovery.
 */
async function animatedDiscover(type, cfg) {
  return discoverPages(type, cfg, {
    with_keywords: SUPERHERO_KEYWORD,
    with_genres: "16",
    sort_by: "popularity.desc",
    include_adult: "false",
    region: cfg.region,
    ...(type === "movie"
      ? { with_release_type: "2|3|4|5|6" }
      : {})
  });
}

/*
 * Classic superhero discovery.
 */
async function classicDiscover(type, cfg) {
  const results = await superheroDiscover(type, cfg);

  return results.filter(item => {
    const date =
      item.release_date ||
      item.first_air_date ||
      "";

    const year = Number(date.slice(0, 4));

    return year > 0 && year < 2000;
  });
}

/*
 * Other comic-book heroes.
 *
 * This is intentionally broader than the old title filter.
 */
async function otherComicDiscover(type, cfg) {
  const superhero = await superheroDiscover(type, cfg);

  const terms = [
    "hellboy",
    "spawn",
    "kick-ass",
    "kick ass",
    "watchmen",
    "umbrella",
    "invincible",
    "turtles",
    "tmnt",
    "constantine",
    "blade",
    "rocketeer",
    "judge dredd",
    "men in black",
    "sin city",
    "darkman",
    "crow",
    "mortal kombat",
    "the mask",
    "mystery men",
    "v for vendetta",
    "bloodshot",
    "valiant",
    "image comics",
    "vertigo"
  ];

  return superhero.filter(item =>
    terms.some(term =>
      (item.title || item.name || "")
        .toLowerCase()
        .includes(term)
    )
  );
}

/*
 * Convert raw TMDB results into Stremio/Nuvio metas.
 */
function makeMetas(results, type) {
  return dedupe(
    results
      .filter(item => item && (item.title || item.name))
      .map(item => toMeta(item, type))
  );
}

async function catalogFor(id, type, cfg, extra = {}) {
  let results = [];

  /*
   * Search.
   *
   * Search results are intentionally broader than the old code.
   * This lets Nuvio/Stremio find superhero titles by name.
   */
  if (extra.search) {
    const endpoint =
      type === "movie"
        ? "/search/movie"
        : "/search/tv";

    const all = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await tmdb(endpoint, cfg, {
        query: extra.search,
        page,
        include_adult: "false",
        region: cfg.region
      });

      const pageResults = data.results || [];
      all.push(...pageResults);

      if (
        !pageResults.length ||
        page >= (data.total_pages || page)
      ) {
        break;
      }
    }

    return makeMetas(all, type);
  }

  if (
    id === "superhero_movies" ||
    id === "superhero_series"
  ) {
    results = await superheroDiscover(type, cfg);
  }

  else if (
    id === "marvel_movies" ||
    id === "marvel_series"
  ) {
    results = await marvelDiscover(type, cfg);
  }

  else if (
    id === "dc_movies" ||
    id === "dc_series"
  ) {
    results = await dcDiscover(type, cfg);
  }

  else if (
    id === "animated_movies" ||
    id === "animated_series"
  ) {
    results = await animatedDiscover(type, cfg);
  }

  else if (id === "classic_movies") {
    results = await classicDiscover(type, cfg);
  }

  else if (id === "other_comic_movies") {
    results = await otherComicDiscover(type, cfg);
  }

  return makeMetas(results, type);
}

/*
 * Manifest.
 */
app.get("/manifest.json", (req, res) => {
  cors(res);
  res.json(manifest);
});

/*
 * Standard catalog route.
 */
app.get(
  "/catalog/:type/:id.json",
  async (req, res) => {
    cors(res);

    try {
      const cfg = cfgFromReq(req);

      const metas = await catalogFor(
        req.params.id,
        req.params.type,
        cfg,
        {}
      );

      res.json({ metas });
    }

    catch (e) {
      console.error("Catalog error:", e);

      res.status(500).json({
        metas: [],
        error: e.message
      });
    }
  }
);

/*
 * Catalog route with extras such as search.
 */
app.get(
  "/catalog/:type/:id/:extra.json",
  async (req, res) => {
    cors(res);

    try {
      const cfg = cfgFromReq(req);

      const extra = Object.fromEntries(
        new URLSearchParams(req.params.extra)
      );

      const metas = await catalogFor(
        req.params.id,
        req.params.type,
        cfg,
        extra
      );

      res.json({ metas });
    }

    catch (e) {
      console.error("Catalog extra error:", e);

      res.status(500).json({
        metas: [],
        error: e.message
      });
    }
  }
);

/*
 * Metadata route.
 */
app.get(
  "/meta/:type/:id.json",
  async (req, res) => {
    cors(res);

    try {
      const cfg = cfgFromReq(req);

      const raw = req.params.id.replace(
        /^tmdb:/,
        ""
      );

      if (!/^\d+$/.test(raw)) {
        return res.json({
          meta: {
            id: req.params.id,
            type: req.params.type,
            name: "Superhero title"
          }
        });
      }

      const endpoint =
        req.params.type === "movie"
          ? `/movie/${raw}`
          : `/tv/${raw}`;

      const x = await tmdb(
        endpoint,
        cfg,
        {
          append_to_response:
            "credits,videos"
        }
      );

      res.json({
        meta: toMeta(
          x,
          req.params.type
        )
      });
    }

    catch (e) {
      console.error("Meta error:", e);

      res.status(500).json({
        meta: {
          id: req.params.id,
          type: req.params.type,
          name: "Unavailable"
        }
      });
    }
  }
);

/*
 * Simple home page.
 */
app.get("/", (req, res) =>
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Superhero Central</title>
<style>
body {
  font-family: system-ui;
  max-width: 760px;
  margin: 50px auto;
  padding: 0 20px;
}
code {
  background: #eee;
  padding: 3px 6px;
  border-radius: 4px;
}
</style>
</head>
<body>
<h1>🦸 Superhero Central</h1>
<p>Superhero-only catalog addon for Nuvio/Stremio.</p>
<p>Manifest: <code>/manifest.json</code></p>
<p>Set <code>TMDB_API_KEY</code> in the hosting environment before installing.</p>
</body>
</html>
`)
);

/*
 * Start server.
 */
app.listen(PORT, () =>
  console.log(
    `Superhero Central listening on ${PORT}`
  )
);
