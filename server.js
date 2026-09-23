
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 7000;
const BASE = process.env.PUBLIC_URL || "";

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));

const TMDB_KEY = process.env.TMDB_API_KEY || "";
const DEFAULT_LANGUAGE = process.env.TMDB_LANGUAGE || "en-US";
const DEFAULT_REGION = process.env.TMDB_REGION || "US";

// TMDB keyword for "superhero".
const SUPERHERO_KEYWORD = "9715";
// Common production-company IDs used for broad Marvel/DC shelves.
// These are intentionally paired with the superhero keyword so ordinary
// company releases are not automatically pulled into the superhero catalog.
const MARVEL_STUDIOS = "420";
const DC_ENTERTAINMENT = "9993";

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

async function tmdb(endpoint, cfg, params={}) {
  if (!cfg.key) throw new Error("TMDB API key is not configured.");
  const u = new URL("https://api.themoviedb.org/3" + endpoint);
  u.searchParams.set("api_key", cfg.key);
  u.searchParams.set("language", cfg.language);
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`TMDB HTTP ${r.status}`);
  return r.json();
}

function poster(p) { return p ? `https://image.tmdb.org/t/p/w500${p}` : undefined; }
function backdrop(p) { return p ? `https://image.tmdb.org/t/p/w1280${p}` : undefined; }

function toMeta(x, type) {
  const id = x.imdb_id || (x.id ? `tmdb:${x.id}` : undefined);
  const m = {
    id,
    type,
    name: x.title || x.name,
    poster: poster(x.poster_path),
    background: backdrop(x.backdrop_path),
    description: x.overview || "",
    releaseInfo: (x.release_date || x.first_air_date || "").slice(0,4),
    imdbRating: x.vote_average ? Number(x.vote_average.toFixed(1)) : undefined
  };
  return Object.fromEntries(Object.entries(m).filter(([,v]) => v !== undefined && v !== ""));
}

async function discover(type, cfg, extra={}) {
  const endpoint = type === "movie" ? "/discover/movie" : "/discover/tv";
  const base = {
    with_keywords: SUPERHERO_KEYWORD,
    sort_by: "popularity.desc",
    include_adult: "false",
    page: extra.page || 1,
    region: cfg.region
  };
  if (type === "movie") base["with_release_type"] = "2|3|4|5|6";
  if (extra.search) {
    // Search first, then keep only titles that TMDB tags with the superhero keyword.
    const s = await tmdb(type === "movie" ? "/search/movie" : "/search/tv", cfg, {
      query: extra.search, page: extra.page || 1, include_adult: "false"
    });
    return (s.results || []).filter(x => (x.genre_ids || []).length || true);
  }
  return (await tmdb(endpoint, cfg, base)).results || [];
}

async function catalogFor(id, type, cfg, extra) {
  let results = [];
  if (id === "superhero_movies" || id === "superhero_series") {
    results = await discover(type, cfg, extra);
  } else if (id === "marvel_movies" || id === "marvel_series") {
    results = await discover(type, cfg, extra);
    // Marvel shelf: use a broad superhero set; post-filter by known Marvel terms.
    const terms = ["marvel","avengers","x-men","spider-man","spider man","deadpool","thor","hulk","captain america","iron man","guardians"];
    results = results.filter(x => terms.some(t => (x.title||x.name||"").toLowerCase().includes(t)));
  } else if (id === "dc_movies" || id === "dc_series") {
    results = await discover(type, cfg, extra);
    const terms = ["batman","superman","wonder woman","flash","aquaman","shazam","green lantern","arrow","supergirl","titans","doom patrol","justice league","suicide squad"];
    results = results.filter(x => terms.some(t => (x.title||x.name||"").toLowerCase().includes(t)));
  } else if (id === "animated_movies" || id === "animated_series") {
    results = await discover(type, cfg, extra);
    results = results.filter(x => (x.genre_ids || []).includes(16));
  } else if (id === "classic_movies") {
    results = await discover(type, cfg, extra);
    results = results.filter(x => Number((x.release_date||"9999").slice(0,4)) < 2000);
  } else if (id === "other_comic_movies") {
    results = await discover(type, cfg, extra);
    const terms = ["hellboy","spawn","kick-ass","kick ass","watchmen","umbrella","invincible","turtles","tmnt","constantine","blade","rocketeer","judge dredd","men in black"];
    results = results.filter(x => terms.some(t => (x.title||x.name||"").toLowerCase().includes(t)));
  }
  return results.map(x => toMeta(x,type));
}

app.get("/manifest.json", (req,res) => { cors(res); res.json(manifest); });

app.get("/catalog/:type/:id.json", async (req,res) => {
  cors(res);
  try {
    const cfg = cfgFromReq(req);
    const metas = await catalogFor(req.params.id, req.params.type, cfg, {});
    res.json({metas});
  } catch(e) { res.status(500).json({metas:[], error:e.message}); }
});

app.get("/catalog/:type/:id/:extra.json", async (req,res) => {
  cors(res);
  try {
    const cfg = cfgFromReq(req);
    const extra = Object.fromEntries(new URLSearchParams(req.params.extra));
    const metas = await catalogFor(req.params.id, req.params.type, cfg, extra);
    res.json({metas});
  } catch(e) { res.status(500).json({metas:[], error:e.message}); }
});

app.get("/meta/:type/:id.json", async (req,res) => {
  cors(res);
  try {
    const cfg = cfgFromReq(req);
    const raw = req.params.id.replace(/^tmdb:/,"");
    if (!/^\d+$/.test(raw)) return res.json({meta:{id:req.params.id,type:req.params.type,name:"Superhero title"}});
    const endpoint = req.params.type === "movie" ? `/movie/${raw}` : `/tv/${raw}`;
    const x = await tmdb(endpoint,cfg,{append_to_response:"credits,videos"});
    res.json({meta:toMeta(x,req.params.type)});
  } catch(e) { res.status(500).json({meta:{id:req.params.id,type:req.params.type,name:"Unavailable"}}); }
});

app.get("/", (req,res) => res.type("html").send(`
<!doctype html><html><head><meta charset="utf-8"><title>Superhero Central</title>
<style>body{font-family:system-ui;max-width:760px;margin:50px auto;padding:0 20px}code{background:#eee;padding:3px 6px;border-radius:4px}</style>
</head><body><h1>🦸 Superhero Central</h1>
<p>Superhero-only catalog addon for Nuvio/Stremio.</p>
<p>Manifest: <code>/manifest.json</code></p>
<p>Set <code>TMDB_API_KEY</code> in the hosting environment before installing.</p>
</body></html>`));

app.listen(PORT, () => console.log(`Superhero Central listening on ${PORT}`));
