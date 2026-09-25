          const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const MAX_PAGES = 10;
const MAX_RESULTS = 100;

const MANIFEST = {
  id: "com.superherocentral.nuvio",
  version: "1.0.0",
  name: "Superhero Central",
  description:
    "A superhero-only catalog addon for Nuvio: Marvel, DC, comic-book heroes, animated heroes, classics, series and more.",
  logo:
    "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f9b8.svg",
  resources: ["catalog", "meta"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "superhero_movies",
      name: "Superhero Movies",
      extra: [{ name: "search", isRequired: false }]
    },
    {
      type: "series",
      id: "superhero_series",
      name: "Superhero Series",
      extra: [{ name: "search", isRequired: false }]
    },
    {
      type: "movie",
      id: "marvel_movies",
      name: "Marvel Movies"
    },
    {
      type: "series",
      id: "marvel_series",
      name: "Marvel Series"
    },
    {
      type: "movie",
      id: "dc_movies",
      name: "DC Movies"
    },
    {
      type: "series",
      id: "dc_series",
      name: "DC Series"
    },
    {
      type: "movie",
      id: "animated_movies",
      name: "Animated Superheroes"
    },
    {
      type: "series",
      id: "animated_series",
      name: "Animated Superhero Series"
    },
    {
      type: "movie",
      id: "classic_movies",
      name: "Classic Superheroes"
    },
    {
      type: "movie",
      id: "other_comic_movies",
      name: "Other Comic Heroes"
    }
  ],
  behaviorHints: {
    adult: false,
    p2p: false,
    configurable: true
  },
  config: [
    {
      key: "tmdb_api_key",
      type: "password",
      title: "TMDB API Key",
      required: true
    },
    {
      key: "language",
      type: "text",
      title: "Language",
      default: "en-US"
    },
    {
      key: "region",
      type: "text",
      title: "Region",
      default: "US"
    }
  ]
};

function dedupe(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (!item || !item.id) return false;

    const key = `${item.id}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function tmdb(path, params = {}) {
  if (!TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(
    `https://api.themoviedb.org/3${path}`
  );

  url.searchParams.set(
    "api_key",
    TMDB_API_KEY
  );

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `TMDB error ${response.status}`
    );
  }

  return response.json();
}

async function discoverPages(
  mediaType,
  params = {},
  pages = MAX_PAGES
) {
  const all = [];

  for (
    let page = 1;
    page <= pages;
    page++
  ) {
    const data = await tmdb(
      `/discover/${mediaType}`,
      {
        ...params,
        page
      }
    );

    all.push(
      ...(data.results || [])
    );

    if (
      page >=
      (data.total_pages || 1)
    ) 
      break;
    }


  return all;
}

async function searchPages(
  mediaType,
  query,
  pages = 2
) {
  const all = [];

  for (
    let page = 1;
    page <= pages;
    page++
  ) {
    const data = await tmdb(
      `/search/${mediaType}`,
      {
        query,
        page,
        include_adult: false
      }
    );

    all.push(
      ...(data.results || [])
    );

    if (
      page >=
      (data.total_pages || 1)
    ) {
      break;
    }
  }

  return all;
}

async function searchMany(
  mediaType,
  queries,
  pages = 2
) {
  const all = [];

  for (const query of queries) {
    const results =
      await searchPages(
        mediaType,
        query,
        pages
      );

    all.push(...results);
  }

  return dedupe(all);
}

async function superheroDiscover(
  mediaType
) {
  return discoverPages(
    mediaType,
    {
      with_keywords: "9715",
      sort_by: "popularity.desc",
      include_adult: false
    }
  );
}

async function marvelDiscover(
  mediaType
) {
  const companyResults =
    await discoverPages(
      mediaType,
      {
        with_companies: "420",
        sort_by:
          "popularity.desc",
        include_adult: false
      }
    );

  const superheroResults =
    await superheroDiscover(
      mediaType
    );

  return dedupe([
    ...companyResults,
    ...superheroResults
  ]);
}

async function dcDiscover(
  mediaType
) {
  const companyResults =
    await discoverPages(
      mediaType,
      {
        with_companies: "9993",
        sort_by:
          "popularity.desc",
        include_adult: false
      }
    );

  const superheroResults =
    await superheroDiscover(
      mediaType
    );

  return dedupe([
    ...companyResults,
    ...superheroResults
  ]);
}

/*
 * ANIMATED SUPERHEROES
 *
 * The targeted searches are retained because they find
 * Batman/Superman/Marvel animated films that TMDB's
 * superhero keyword can miss.
 *
 * Every targeted result must actually be classified
 * by TMDB as Animation.
 */
async function animatedDiscover(
  mediaType
) {
  const baseResults =
    await discoverPages(
      mediaType,
      {
        with_keywords: "9715",
        with_genres: "16",
        sort_by:
          "popularity.desc",
        include_adult: false
      }
    );

  const queries = [
    "Batman animated",
    "Superman animated",
    "Justice League animated",
    "Justice League Dark animated",
    "Teen Titans animated",
    "Green Lantern animated",
    "Wonder Woman animated",
    "Flash animated",
    "Aquaman animated",
    "Suicide Squad animated",
    "Marvel animated",
    "Avengers animated",
    "Spider-Man animated",
    "Spider-Man animated movie",
    "Iron Man animated",
    "Hulk animated",
    "Thor animated",
    "Wolverine animated",
    "X-Men animated",
    "Fantastic Four animated",
    "Captain America animated"
  ];

  const searchedResults =
    await searchMany(
      mediaType,
      queries,
      2
    );

  const animatedSearched =
    searchedResults.filter(
      (item) =>
        Array.isArray(
          item.genre_ids
        ) &&
        item.genre_ids.includes(16)
    );

  return dedupe([
    ...baseResults,
    ...animatedSearched
  ]);
}

/*
 * CLASSIC SUPERHEROES
 *
 * Proven working version.
 */
async function classicDiscover() {
  const queries = [
    "Superman",
    "Batman",
    "Hulk",
    "Flash Gordon",
    "The Shadow",
    "The Rocketeer",
    "Dick Tracy",
    "Judge Dredd",
    "Spawn",
    "The Phantom",
    "The Crow",
    "Blade",
    "Teenage Mutant Ninja Turtles",
    "Mighty Morphin Power Rangers",
    "Captain America",
    "Fantastic Four",
    "Spider-Man",
    "X-Men",
    "Punisher",
    "Hellboy"
  ];

  const all = [];

  for (const query of queries) {
    const results =
      await searchPages(
        "movie",
        query,
        2
      );

    for (const movie of results) {
      if (!movie.release_date)
        continue;

      const year = Number(
        movie.release_date.slice(
          0,
          4
        )
      );

      if (
        year > 0 &&
        year < 2000
      ) {
        all.push(movie);
      }
    }
  }

  const superheroResults =
    await superheroDiscover(
      "movie"
    );

  for (const movie of superheroResults) {
    if (!movie.release_date)
      continue;

    const year = Number(
      movie.release_date.slice(
        0,
        4
      )
    )
                if (year > 0 && year < 2000) {
            all.push(movie);
    }
  }

  return dedupe(all);
}

async function otherComicDiscover() {
  /*
   * OTHER COMIC HEROES
   *
   * Curated TMDB movie IDs only.
   * No broad title searches, which prevents:
   * - duplicate search results
   * - ambiguous titles
   * - unrelated/adult search results
   */

  const movieIds = [
    // Spawn
    10336,

    // Hellboy
    1487,
    11253,
    456740,
    726898,

    // The Crow
    9495,
    957452,

    // The Phantom
    9514,

    // The Rocketeer
    2453,

    // Dick Tracy
    8592,

    // Judge Dredd / Dredd
    403,
    49049,

    // Sin City
    187,
    189,

    // Watchmen
    13183,

    // V for Vendetta
    752,

    // Kick-Ass
    10140,
    59859,

    // Scott Pilgrim
    22538,

    // Kingsman
    207703,
    343668,
    476669,

    // Wanted
    553,

    // The Mask
    854,

    // Men in Black
    607,
    608,
    41154,
    479455,

    // Constantine
    561,

    // Bloodshot
    338762,

    // Darkman
    10655,
    19017,
    19018,

    // Mystery Men
    9741,

    // The Spirit
    8285,

    // League of Extraordinary Gentlemen
    8698,

    // Tank Girl
    9067,

    // Stardust
    4523,

    // The Old Guard
    547016,

    // 30 Days of Night
    4513,
    44535,

    // I Am Number Four
    46528,

    // Chronicle
    76726
  ];

  const results = [];

  for (const movieId of movieIds) {
    try {
      const movie = await tmdb(
        `/movie/${movieId}`
      );

      if (!movie) {
        continue;
      }

      // Extra safety: never allow TMDB to return an adult item.
      if (movie.adult === true) {
        continue;
      }

      results.push(movie);
    } catch (error) {
      // Ignore a bad/removed TMDB ID rather than
      // breaking the entire catalog.
      console.error(
        `Other Comic movie ${movieId} failed:`,
        error.message
      );
    }
  }

  return dedupe(results);
}

function poster(path) {
  return path
    ? `https://image.tmdb.org/t/p/w500${path}`
    : undefined;
}

function backdrop(path) {
  return path
    ? `https://image.tmdb.org/t/p/w1280${path}`
    : undefined;
}

function toStremioItem(
  item,
  mediaType
) {
  return {
    id:
      `${mediaType}:${item.id}`,

    type:
      mediaType === "tv"
        ? "series"
        : "movie",

    name:
      mediaType === "tv"
        ? item.name ||
          item.original_name
        : item.title ||
          item.original_title,

    poster:
      poster(item.poster_path),

    background:
      backdrop(
        item.backdrop_path
      ),

    description:
      item.overview || "",

    releaseInfo:
      mediaType === "tv"
        ? item.first_air_date ||
          ""
        : item.release_date ||
          "",

    imdbRating:
      typeof item.vote_average ===
      "number"
        ? Number(
            item.vote_average.toFixed(
              1
            )
          )
        : undefined
  };
}

app.get(
  "/manifest.json",
  (req, res) => {
    res.json(MANIFEST);
  }
);

app.get(
  "/",
  (req, res) => {
    res.send(
      "Superhero Central is running."
    );
  }
);

app.get(
  "/catalog/:type/:id.json",
  async (req, res) => {
    try {
      const {
        type,
        id
      } = req.params;

      const search =
        req.query.search;

      let mediaType;

      if (type === "movie") {
        mediaType = "movie";
      } else if (
        type === "series"
      ) {
        mediaType = "tv";
      } else {
        return res
          .status(400)
          .json({
            metas: []
          });
      }

      let results = [];

      if (search) {
        results =
          await searchPages(
            mediaType,
            search,
            MAX_PAGES
          );
      } else {
        switch (id) {
          case "superhero_movies":
          case "superhero_series":
            results =
              await superheroDiscover(
                mediaType
              );
            break;

          case "marvel_movies":
          case "marvel_series":
            results =
              await marvelDiscover(
                mediaType
              );
            break;

          case "dc_movies":
          case "dc_series":
            results =
              await dcDiscover(
                mediaType
              );
            break;

          case "animated_movies":
          case "animated_series":
            results =
              await animatedDiscover(
                mediaType
              );
            break;

          case "classic_movies":
            results =
              await classicDiscover();

            mediaType = "movie";
            break;

          case "other_comic_movies":
            results =
              await otherComicDiscover();

            mediaType = "movie";
            break;

          default:
            return res
              .status(404)
              .json({
                metas: []
              });
        }
      }

      results =
        dedupe(results)
          .slice(
            0,
            MAX_RESULTS
          );

      const metas =
        results.map(
          (item) =>
            toStremioItem(
              item,
              mediaType
            )
        );

      res.json({
        metas
      });

    } catch (error) {
      console.error(
        "Catalog error:",
        error
      );

      res.status(500).json({
        metas: [],
        error:
          "Unable to load catalog"
      });
    }
  }
);

app.get(
  "/meta/:type/:id.json",
  async (req, res) => {
    try {
      const {
        type,
        id
      } = req.params;

      

const mediaType =
  type === "series"
    ? "tv"
    : "movie";

const tmdbId =
  id.replace(
    /^(movie|tv):/,
    ""
  );

const data =
  await tmdb(
    `/${mediaType}/${tmdbId}`,
          {
            append_to_response:
              "credits,videos"
          }
        );

      const meta = {
        id:
          `${mediaType}:${data.id}`,

        type,

        name:
          mediaType === "tv"
            ? data.name ||
              data.original_name
            : data.title ||
              data.original_title,

        poster:
          poster(
            data.poster_path
          ),

        background:
          backdrop(
            data.backdrop_path
          ),

        description:
          data.overview || "",

        releaseInfo:
          mediaType === "tv"
            ? data.first_air_date ||
              ""
            : data.release_date ||
              "",

        imdbRating:
          typeof data.vote_average ===
          "number"
            ? Number(
                data.vote_average.toFixed(
                  1
                )
              )
            : undefined
      };

      res.json({
        meta
      });

    } catch (error) {
      console.error(
        "Meta error:",
        error
      );

      res.status(500).json({
        meta: {},
        error:
          "Unable to load metadata"
      });
    }
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      `Superhero Central listening on ${PORT}`
    );
  }
);
      
            
