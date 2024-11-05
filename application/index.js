"use strict";

import {
  bottom_bar,
  side_toaster,
  load_ads,
  top_bar,
  getManifest,
  geolocation,
} from "./assets/js/helper.js";
import localforage from "localforage";
import m from "mithril";
import dayjs from "dayjs";
import swiped from "swiped-events";
import { request, gql } from "graphql-request";
import L from "leaflet";
import markerIcon from "./marker-icon.png";

const sw_channel = new BroadcastChannel("sw-messages");

const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});

export let status = { debug: false, version: "", notKaiOS: true };

let default_settings = {};

export let settings = {};

localforage
  .getItem("articles")
  .then((value) => {
    if (value === null) {
      // Item does not exist, initialize it as an empty array
      articles = [];
      return localforage.setItem("articles", articles).then(() => {});
    } else {
      articles = value;
    }
  })
  .catch((err) => {
    console.error("Error accessing localForage:", err);
  });

let cache_search = () => {
  localforage.setItem("articles", articles);
};

localforage.getItem("searchTerm").then((e) => {
  searchTerm = e;
});

if ("b2g" in navigator || "navigator.mozApps" in navigator)
  status.notKaiOS = false;

if (!status.notKaiOS) {
  const scripts = [
    "http://127.0.0.1/api/v1/shared/core.js",
    "http://127.0.0.1/api/v1/shared/session.js",
    "http://127.0.0.1/api/v1/apps/service.js",
    "http://127.0.0.1/api/v1/audiovolumemanager/service.js",
    "./assets/js/kaiads.v5.min.js",
  ];

  scripts.forEach((src) => {
    const js = document.createElement("script");
    js.type = "text/javascript";
    js.src = src;
    document.head.appendChild(js);
  });
}

if (status.debug) {
  window.onerror = function (msg, url, linenumber) {
    alert(
      "Error message: " + msg + "\nURL: " + url + "\nLine Number: " + linenumber
    );
    return true;
  };
}

//map

let map;
let step = 0.004;
const mainmarker = { current_lat: 0, current_lng: 0 };

// Function to zoom the map
function ZoomMap(in_out) {
  if (!map) return; // Check if the map is initialized

  let current_zoom_level = map.getZoom();
  if (in_out === "in") {
    map.setZoom(current_zoom_level + 1);
  } else if (in_out === "out") {
    map.setZoom(current_zoom_level - 1);
  }
}

// Function to move the map
function MoveMap(direction) {
  let n = map.getCenter();

  mainmarker.current_lat = n.lat;
  mainmarker.current_lng = n.lng;

  if (direction === "left") {
    mainmarker.current_lng -= step;
  } else if (direction === "right") {
    mainmarker.current_lng += step;
  } else if (direction === "up") {
    mainmarker.current_lat += step;
  } else if (direction === "down") {
    mainmarker.current_lat -= step;
  }
  map.panTo(new L.LatLng(mainmarker.current_lat, mainmarker.current_lng));
}

// Initialize the map and define the setup
function map_function(lat, lng) {
  map = L.map("map-container", {
    keyboard: true,
    zoomControl: false,
    shadowUrl: null,
  }).setView([lat, lng], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  let once = false;
  let myMarker;
  L.Icon.Default.prototype.options.shadowUrl = "";
  L.Icon.Default.prototype.options.iconUrl = markerIcon;

  let geolocation_cb = function (e) {
    if (!myMarker) {
      // Create the marker only once
      myMarker = L.marker([e.coords.latitude, e.coords.longitude])
        .addTo(map)
        .bindPopup("It's me");
      myMarker._icon.classList.add("myMarker");
      myMarker.options.shadowUrl = "";
      usersPosition = e;
      myMarker.options.url = markerIcon;

      if (!lat) {
        // Set the view only once
        map.setView([lat, lng]);
        once = true; // Set 'once' to true after the first execution
      }
    } else {
      // Update the marker's position
      myMarker.setLatLng([e.coords.latitude, e.coords.longitude]);
      usersPosition = e;
    }
  };
  geolocation(geolocation_cb);

  L.marker([lat, lng]).addTo(map);
  map.setView([lat, lng]);

  articles.map((e, i) => {
    L.marker([e.metadata.lat, e.metadata.lng]).addTo(map).bindPopup(e.areaName);
  });

  map.on("zoomend", function () {
    let zoom_level = map.getZoom();

    if (zoom_level > 16) {
      step = 0.0005;
    } else if (zoom_level > 15) {
      step = 0.001;
    } else if (zoom_level > 14) {
      step = 0.002;
    } else if (zoom_level > 13) {
      step = 0.004;
    } else if (zoom_level > 12) {
      step = 0.01;
    } else if (zoom_level > 11) {
      step = 0.02;
    } else if (zoom_level > 10) {
      step = 0.04;
    } else if (zoom_level > 9) {
      step = 0.075;
    } else if (zoom_level > 8) {
      step = 0.15;
    } else if (zoom_level > 7) {
      step = 0.3;
    } else if (zoom_level > 6) {
      step = 0.5;
    } else if (zoom_level > 5) {
      step = 1.2;
    } else if (zoom_level > 4) {
      step = 2.75;
    } else if (zoom_level > 3) {
      step = 4.5;
    } else if (zoom_level > 2) {
      step = 8;
    } else {
      step = 20;
    }
  });
}

//open KaiOS app
let app_launcher = () => {
  var currentUrl = window.location.href;

  // Check if the URL includes 'id='
  if (!currentUrl.includes("code=")) return false;

  const params = new URLSearchParams(currentUrl.split("?")[1]);
  const code = params.get("code");

  if (!code) return false;

  let result = code.split("#")[0];

  setTimeout(() => {
    try {
      const activity = new MozActivity({
        name: "feedolin",
        data: result,
      });
      activity.onsuccess = function () {
        console.log("Activity successfuly handled");
        setTimeout(() => {
          window.close();
        }, 4000);
      };

      activity.onerror = function () {
        console.log("The activity encouter en error: " + this.error);
        alert(this.error);
      };
    } catch (e) {
      console.log(e);
    }

    if ("b2g" in navigator) {
      try {
        let activity = new WebActivity("feedolin", {
          name: "feedolin",
          data: result,
        });
        activity.start().then(
          (rv) => {
            setTimeout(() => {
              window.close();
            }, 3000);

            // alert(rv);
          },
          (err) => {
            //alert(err);

            if (err == "NO_PROVIDER") {
            }
          }
        );
      } catch (e) {
        alert(e);
      }
    }
  }, 2000);
};
if (!status.notKaiOS) app_launcher();

//test if device online
let checkOnlineStatus = async () => {
  return fetch("https://www.google.com", {
    method: "HEAD",
    mode: "no-cors",
  })
    .then(() => true)
    .catch(() => false);
};

async function fetchGraphQL(query, variables) {
  const response = await fetch("https://api.openbeta.io/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok)
    side_toaster(`HTTP error! status: ${response.status}`, 4000);

  return await response.json();
}

const operationsDoc = `
  query MyQuery($search: String!) {
  stats {
    totalClimbs
    totalCrags
  }
    areas(filter: {leaf_status: {isLeaf: false},area_name: {match: $search}}) {
      areaName
      totalClimbs
      uuid
      metadata {
        lat
        lng
        isBoulder
      }
      pathTokens
      climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
      children {
        areaName
        totalClimbs
        uuid
        metadata {
          lat
          lng
          isBoulder
        }
        pathTokens
        climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
        children {
          areaName
          totalClimbs
          uuid
          metadata {
            lat
            lng
            isBoulder
          }
          pathTokens
          climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
          children {
            areaName
            totalClimbs
            uuid
            metadata {
              lat
              lng
              isBoulder
            }
            pathTokens
            climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
            children {  
              areaName
              totalClimbs
              uuid
              metadata {
                lat
                lng
                isBoulder
              }
              pathTokens
              climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
            }
          }
        }
      }
    }
  }
`;
async function fetchAreas(searchValue) {
  try {
    const { errors, data } = await fetchGraphQL(operationsDoc, {
      search: searchValue,
    });
    if (errors) throw new Error(JSON.stringify(errors));

    return { success: true, areas: data.areas, stats: data.stats };
  } catch (error) {
    console.error("Error:", error);
    return { success: false, error: error.message };
  }
}

var root = document.getElementById("app");

var options = {
  view: function () {
    return m(
      "div",
      {
        id: "optionsView",
        class: "flex",
        oncreate: () => {
          top_bar("", "", "");

          if (status.notKaiOS)
            top_bar("", "", "<img src='assets/icons/back.svg'>");

          bottom_bar(
            "",
            "<img class='not-desktop' src='assets/icons/select.svg'>",
            ""
          );

          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m(
          "button",
          {
            tabindex: 0,

            class: "item",
            oncreate: ({ dom }) => {
              dom.focus();

              scrollToCenter();
            },
            onclick: () => {
              m.route.set("/about");
            },
          },
          "About"
        ),
        m(
          "button",
          {
            tabindex: 1,

            class: "item",
            onclick: () => {
              m.route.set("/settingsView");
            },
          },
          "Settings"
        ),

        m(
          "button",
          {
            tabindex: 2,

            class: "item",
            onclick: () => {
              m.route.set("/privacy_policy");
            },
          },
          "Privacy Policy"
        ),
        m("div", {
          id: "KaiOSads-Wrapper",
          class: "",

          oncreate: () => {
            if (status.notKaiOS == false) load_ads();
          },
        }),
      ]
    );
  },
};

let articles = [];
let current_article;

let searchTerm = "";
let stats = "";
localforage
  .getItem("stats")
  .then((e) => {
    stats = e;
  })
  .catch(() => {});
const start = {
  async search() {
    document.querySelector(".loading-spinner-2").style.display = "block";
    const result = await fetchAreas(searchTerm);
    document.querySelector(".loading-spinner-2").style.display = "none";

    let s = document.querySelector("#search-input").value;
    if (result.success && s.length > 1) {
      articles = result.areas;
      if (articles.length > 0) m.redraw();

      if (result.stats)
        localforage
          .setItem("stats", result.stats)
          .then((e) => {
            stats = e;
          })
          .catch((e) => {});
      cache_search();
    } else {
      console.error("Failed to fetch areas:", result.error);
      side_toaster("data could not be loaded", 3000);
      articles = [];
    }
  },

  oninit() {
    // Retrieve the `search` parameter from the URL
    const params = m.route.param("search");
    if (params) {
      searchTerm = params;
      this.search();
    }
  },
  onremove: () => {
    scrollToTop();
  },

  view() {
    return m(
      "div",
      {
        id: "start",
        oncreate: () => {},

        oninit: () => {
          bottom_bar(
            "<img src='assets/icons/map.svg'>",
            "",
            "<img src='assets/icons/option.svg'>"
          );
          top_bar("", "", "");
        },
      },
      m("div.loading-spinner-2", [m("div"), m("div"), m("div"), m("div")]),

      m("input[type=text]", {
        id: "search-input",
        class: "item",
        tabIndex: 0,
        placeholder: "Search areas",
        oncreate: (vnode) => {
          vnode.dom.focus();
        },
        oninput: (e) => {
          searchTerm = e.target.value;
          localforage.setItem("searchTerm", searchTerm);
          document.querySelector("#start").classList.remove("search-ok");

          // Update the URL parameter
          m.route.set(`/start?search=${encodeURIComponent(searchTerm)}`);

          if (searchTerm.length > 2) {
            this.search();
          } else {
            articles = [];
            //reset cache
            localforage.setItem("articles", articles);
          }
        },
        value: searchTerm,
      }),

      m(
        "section",
        {
          id: "search-results",
          oncreate: () => {},
        },
        articles.length > 0
          ? articles.slice(0, 100).map((e, i) =>
              m(
                "article",
                {
                  class: "item",
                  tabIndex: i + 1,
                  oncreate: () => {
                    document.querySelector("#start").classList.add("search-ok");
                  },
                  onclick: () => {
                    if (e.totalClimbs == 0) {
                      side_toaster("no climbs", 3000);
                    } else {
                      current_article = e.uuid;
                      m.route.set("/article?index=" + e.uuid);
                    }
                  },

                  onkeydown: (event) => {
                    if (event.key === "Enter") {
                      if (e.totalClimbs == 0) {
                        side_toaster("no climbs", 3000);
                      } else {
                        current_article = e.id;
                        m.route.set("/article?index=" + e.uuid);
                      }
                    }
                  },
                },
                [
                  m("div", { class: "tags" }, [
                    m("span", { class: "tag" }, e.pathTokens[0]),

                    e.metadata.isBoulder
                      ? m("span", { class: "tag" }, "Bouldering")
                      : m("span", { class: "tag" }, "Climbing"),
                    m("span", { class: "tag" }, e.totalClimbs),
                  ]),

                  m("h2", e.areaName),
                ]
              )
            )
          : null
      ),
      m("section", { id: "stats-footer" }, [
        m(
          "div",
          m.trust(
            "The data is loaded from <a href='https://openbeta.io/' target='_blank'>OpenBeta</a> a free rock climbing route database. Make a <a href='https://opencollective.com/openbeta' target='_blank'>Donate</a> to help the project grow."
          )
        ),

        m("div", m.trust("<strong>OpenBeta License</strong> CC BY-SA 4.0")),

        stats ? m("span", "Climbs " + stats.totalClimbs) : null,
        stats ? m("span", "Crags " + stats.totalCrags) : null,
      ])
    );
  },
};

function getAllNestedKeys(obj, key) {
  let results = [];

  function search(obj) {
    if (Array.isArray(obj)) {
      obj.forEach((item) => search(item));
    } else if (typeof obj === "object" && obj !== null) {
      if (obj.hasOwnProperty(key)) {
        results.push(obj[key]);
      }
      Object.values(obj).forEach((value) => search(value));
    }
  }

  search(obj);
  return results.flat(); // Flatten in case each 'climbs' is an array
}

const article = {
  view: function () {
    articles.find((h) => {
      var index = m.route.param("index");
      if (index != h.uuid) return false;

      current_article = h;
      console.log(current_article);

      return true;
    });

    const allClimbs = getAllNestedKeys(current_article, "climbs");

    return m(
      "div",
      {
        id: "article",
        onremove: () => {
          setTimeout(() => {
            if (current_article != "") {
              scrollToCenter();
            } else {
              scrollToTop();
            }
          }, 1000);
        },

        oncreate: () => {
          if (status.notKaiOS)
            top_bar("", "", "<img src='assets/icons/back.svg'>");
          bottom_bar("<img src='assets/icons/map.svg'>", "", "");
        },
      },
      m("h1", "Climbs"),
      allClimbs.map((climb, i) => {
        console.log(climb);
        return m(
          "article",
          {
            class: "item",
            tabIndex: i,
            oncreate: (vnode) => {
              if (current_detail.uuid == climb.uuid) {
                vnode.dom.focus();
              }

              if (current_article == "" && i == 0) {
                vnode.dom.focus();
              }
            },
            onclick: () => {
              current_detail = climb;

              m.route.set(
                "/detail?index=" +
                  current_article.uuid +
                  "&detail=" +
                  climb.uuid
              );
            },

            onkeydown: (event) => {
              if (event.key === "Enter") {
                current_detail = climb;

                m.route.set(
                  "/detail?index=" +
                    current_article.uuid +
                    "&detail=" +
                    climb.uuid
                );
              }
            },
          },
          [
            m("div", { class: "tags" }, [
              Object.entries(current_article.pathTokens)
                .filter(([key, value]) => value !== null)
                .map(([key, value]) => {
                  return value === true
                    ? m("span", { class: "tag" }, key)
                    : null;
                }),

              Object.entries(climb.type)
                .filter(([key, value]) => value !== null)
                .map(([key, value]) => {
                  return value === true
                    ? m("span", { class: "tag" }, key)
                    : null;
                }),

              Object.entries(climb.grades)
                .filter(([key, value]) => value !== null)
                .map(([key, value]) => {
                  return value != ""
                    ? m("span", { class: "tag" }, value)
                    : null;
                }),
            ]),

            m("h2", climb.name),
          ]
        );
      })
    );
  },
};

let current_detail;

var detail = {
  view: function () {
    const matchedArticle = current_article.climbs.find((h) => {
      var index = m.route.param("detail");
      if (index != h.uuid) return false;

      current_detail = h;

      return true;
    });

    return m(
      "div",
      {
        id: "article",
        onremove: () => {
          scrollToTop();
        },
        oncreate: () => {
          if (status.notKaiOS)
            top_bar("", "", "<img src='assets/icons/back.svg'>");
          bottom_bar("<img src='assets/icons/tick.svg'>", "", "");
          scrollToTop();
        },
      },
      m("div", { id: "detail", class: "item" }, [
        m("h1", "Climb"),

        m("ul", [
          m(
            "li",
            m.trust(
              "<div>Area</div><span>" + current_article.areaName + "</span>"
            )
          ),
          m(
            "li",
            m.trust("<div>Name</div><span>" + current_detail.name + "</span>")
          ),
          current_detail.fa
            ? m(
                "li",
                m.trust(
                  "<div>First ascent</div><span>" +
                    current_detail.fa +
                    "</span>"
                )
              )
            : null,

          Object.entries(current_detail.type)
            .filter(([key, value]) => value !== null)
            .map(([key, value]) =>
              m(
                "li",
                { class: "tag" },
                m.trust("<div>Type</div><span>" + key + "</span>")
              )
            ),
          ,
          Object.entries(current_detail.grades)
            .filter(([key, value]) => value !== null)
            .map(([key, value]) =>
              m(
                "li",
                { class: "tag" },
                m.trust("<div>" + key + "</div><span>" + value + "</span>")
              )
            ),
          current_detail.length > 0
            ? m(
                "li",
                m.trust(
                  "<div>Type</div><span>" + current_detail.length + "</span>"
                )
              )
            : null,
        ]),
      ])
    );
  },
};

let mapView = {
  view: function () {
    return m("div", {
      id: "map-container",

      oncreate: (vnode) => {
        bottom_bar(
          "<img src='assets/icons/plus.svg'>",
          "<img src='assets/icons/location.svg'>",
          "<img src='assets/icons/minus.svg'>"
        );

        const params = new URLSearchParams(m.route.get().split("?")[1]);
        const lat = parseFloat(params.get("lat"));
        const lng = parseFloat(params.get("lng"));

        map_function(lat, lng);

        if (status.notKaiOS)
          top_bar("", "", "<img src='assets/icons/back.svg'>");
      },
    });
  },
};

var intro = {
  view: function () {
    return m(
      "div",
      {
        class: "width-100 height-100",
        id: "intro",
        oninit: () => {
          setTimeout(() => {
            m.route.set("/start", { search: searchTerm });
          }, 2000);
        },
        onremove: () => {
          localStorage.setItem("version", status.version);
          document.querySelector(".loading-spinner").style.display = "none";
        },
      },
      [
        m("img", {
          src: "./assets/icons/intro.svg",

          oncreate: () => {
            document.querySelector(".loading-spinner").style.display = "block";
            let get_manifest_callback = (e) => {
              try {
                status.version = e.manifest.version;
                document.querySelector("#version").textContent =
                  e.manifest.version;
              } catch (e) {}

              if ("b2g" in navigator || status.notKaiOS) {
                fetch("/manifest.webmanifest")
                  .then((r) => r.json())
                  .then((parsedResponse) => {
                    status.version = parsedResponse.b2g_features.version;
                  });
              }
            };
            getManifest(get_manifest_callback);
          },
        }),
        m(
          "div",
          {
            class: "flex width-100  justify-content-center ",
            id: "version-box",
          },
          [
            m(
              "kbd",
              {
                id: "version",
              },
              localStorage.getItem("version") || 0
            ),
          ]
        ),
      ]
    );
  },
};

var about = {
  view: function () {
    return m("div", { class: "page" }, [m("li", "Version: " + status.version)]);
  },
};

var privacy_policy = {
  view: function () {
    return m("div", { id: "privacy_policy", class: "page" }, [
      m("h1", "Privacy Policy for PicTick"),
      m(
        "p",
        "PicTick is committed to protecting your privacy. This policy explains how data is handled within the app."
      ),

      m("h2", "Data Collection and Storage"),
      m(
        "p",
        "PicTick does not collect, store, or transmit any personal data to external servers beyond what is necessary for core app functionality. All climbing data related to areas, crags, and climbs is fetched directly from openBeta.io and stored temporarily on your device for your convenience."
      ),

      m("h2", "User Authentication and Data Access"),
      m("p", [
        "PicTick provides an option for users to connect their openBeta.io accounts through Auth0 authentication. By connecting your account, you allow PicTick to access specific personal data, including your profile information and your list of ticked climbs, directly from openBeta.io. This data is only used within the app to enhance your experience, such as by displaying your personal climbing records and preferences.",
      ]),
      m("p", [
        "No user data accessed from openBeta.io is stored on external servers or shared with third parties. This data remains temporarily stored on your device for the duration of your session.",
      ]),

      m("h2", "Third-Party Services"),
      m("p", [
        "PicTick uses data from ",
        m(
          "a",
          {
            href: "https://openbeta.io/",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "openBeta.io"
        ),
        " for climbing information. The app also uses Auth0 for secure user authentication. For more details on how these services handle user data, please refer to the ",
        m(
          "a",
          {
            href: "https://auth0.com/privacy",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Auth0 Privacy Policy"
        ),
        " and the openBeta.io privacy policy.",
      ]),

      m("h2", "KaiOS Users"),
      m("p", [
        "If you are using PicTick on a KaiOS device, the app uses ",
        m("strong", "KaiOS Ads"),
        ", which may collect data related to your usage. The data collected by KaiOS Ads is subject to the ",
        m(
          "a",
          {
            href: "https://www.kaiostech.com/privacy-policy/",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "KaiOS privacy policy"
        ),
        ".",
      ]),
      m("p", [
        "For users on all other platforms, ",
        m("strong", "no ads"),
        " are displayed, and no external data collection occurs.",
      ]),

      m("h2", "User Rights"),
      m(
        "p",
        "As a user, you have the right to access, manage, and delete any data that the app may temporarily store on your device. If you connect to openBeta.io, you can manage or revoke access to PicTick through your openBeta.io account settings."
      ),

      m("h2", "Policy Updates"),
      m(
        "p",
        "This Privacy Policy may be updated periodically. Any changes will be communicated through updates to the app."
      ),

      m(
        "p",
        "By using PicTick, you acknowledge and agree to this Privacy Policy."
      ),
    ]);
  },
};

var settingsView = {
  view: function () {
    return m("div", {
      class: "flex justify-content-center page",
      id: "settings-page",
      oncreate: () => {
        if (status.notKaiOS)
          top_bar("", "", "<img src='assets/icons/back.svg'>");
        if (status.notKaiOS) bottom_bar("", "", "");
      },
    });
  },
};

m.route(root, "/intro", {
  "/article": article,
  "/detail": detail,
  "/mapView": mapView,
  "/settingsView": settingsView,
  "/intro": intro,
  "/start": start,
  "/options": options,
  "/about": about,
  "/privacy_policy": privacy_policy,
});

function scrollToCenter() {
  const activeElement = document.activeElement;
  if (!activeElement) return;

  const rect = activeElement.getBoundingClientRect();
  let elY = rect.top + rect.height / 2;

  let scrollContainer = activeElement.parentNode;

  // Find the first scrollable parent
  while (scrollContainer) {
    if (
      scrollContainer.scrollHeight > scrollContainer.clientHeight ||
      scrollContainer.scrollWidth > scrollContainer.clientWidth
    ) {
      // Calculate the element's offset relative to the scrollable parent
      const containerRect = scrollContainer.getBoundingClientRect();
      elY = rect.top - containerRect.top + rect.height / 2;
      break;
    }
    scrollContainer = scrollContainer.parentNode;
  }

  if (scrollContainer) {
    scrollContainer.scrollBy({
      left: 0,
      top: elY - scrollContainer.clientHeight / 2,
      behavior: "smooth",
    });
  } else {
    // If no scrollable parent is found, scroll the document body
    document.body.scrollBy({
      left: 0,
      top: elY - window.innerHeight / 2,
      behavior: "smooth",
    });
  }
}

let scrollToTop = () => {
  document.body.scrollTo({
    left: 0,
    top: 0,
    behavior: "smooth",
  });

  document.documentElement.scrollTo({
    left: 0,
    top: 0,
    behavior: "smooth",
  });
};

document.addEventListener("DOMContentLoaded", function (e) {
  /////////////////
  ///NAVIGATION
  /////////////////

  let nav = function (move) {
    if (
      document.activeElement.nodeName == "SELECT" ||
      document.activeElement.type == "date" ||
      document.activeElement.type == "time" ||
      status.window_status == "volume"
    )
      return false;

    if (document.activeElement.classList.contains("scroll")) {
      const scrollableElement = document.querySelector(".scroll");
      if (move == 1) {
        scrollableElement.scrollBy({ left: 0, top: 10 });
      } else {
        scrollableElement.scrollBy({ left: 0, top: -10 });
      }
    }

    const currentIndex = document.activeElement.tabIndex;
    let next = currentIndex + move;
    let items = 0;

    items = document.getElementById("app").querySelectorAll(".item");

    console.log(items);

    if (document.activeElement.parentNode.classList.contains("input-parent")) {
      document.activeElement.parentNode.focus();
      return true;
    }

    let targetElement = 0;

    if (next <= items.length) {
      targetElement = items[next];
      targetElement.focus();
    }

    if (next >= items.length) {
      targetElement = items[0];
      targetElement.focus();
    }

    scrollToCenter();
  };

  //detect swiping to fire animation

  let swiper = () => {
    let startX = 0;
    let maxSwipeDistance = 300; // Maximum swipe distance for full fade-out

    document.addEventListener(
      "touchstart",
      function (e) {
        startX = e.touches[0].pageX;
        document.querySelector("body").style.opacity = 1; // Start with full opacity
      },
      false
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        let diffX = Math.abs(e.touches[0].pageX - startX);

        // Calculate the inverted opacity based on swipe distance
        let opacity = 1 - Math.min(diffX / maxSwipeDistance, 1);

        // Apply opacity to the body (or any other element)
        document.querySelector("body").style.opacity = opacity;
      },
      false
    );

    document.addEventListener(
      "touchend",
      function (e) {
        // Reset opacity to 1 when the swipe ends
        document.querySelector("body").style.opacity = 1;
      },
      false
    );
  };

  swiper();

  // Add click listeners to simulate key events
  document
    .querySelector("div.button-left")
    .addEventListener("click", function (event) {
      simulateKeyPress("SoftLeft");
    });

  document
    .querySelector("div.button-right")
    .addEventListener("click", function (event) {
      simulateKeyPress("SoftRight");
    });

  document
    .querySelector("div.button-center")
    .addEventListener("click", function (event) {
      simulateKeyPress("Enter");
    });

  //top bar

  document
    .querySelector("#top-bar div div.button-right")
    .addEventListener("click", function (event) {
      simulateKeyPress("Backspace");
    });

  document
    .querySelector("#top-bar div div.button-left")
    .addEventListener("click", function (event) {
      simulateKeyPress("*");
    });

  // Function to simulate key press events
  function simulateKeyPress(k) {
    shortpress_action({ key: k });
  }

  let isKeyDownHandled = false;

  document.addEventListener("keydown", function (event) {
    if (!isKeyDownHandled) {
      handleKeyDown(event); // Your keydown handler

      isKeyDownHandled = true;

      // Reset the flag after some time if needed, or based on your conditions
      setTimeout(() => {
        isKeyDownHandled = false;
      }, 300); // Optional timeout to reset the flag after a short delay
    }
  });

  let isKeyUpHandled = false;

  document.addEventListener("keyup", function (event) {
    if (!isKeyUpHandled) {
      handleKeyUp(event); // Your keydown handler

      isKeyUpHandled = true;

      // Reset the flag after some time if needed, or based on your conditions
      setTimeout(() => {
        isKeyUpHandled = false;
      }, 300); // Optional timeout to reset the flag after a short delay
    }
  });

  document.addEventListener("swiped", function (e) {
    let r = m.route.get();

    let dir = e.detail.dir;

    if (dir == "down") {
      if (window.scrollY === 0 || document.documentElement.scrollTop === 0) {
        // Page is at the top
        const swipeDistance = e.detail.yEnd - e.detail.yStart;

        if (swipeDistance > 300) {
          // reload_data();
        }
      }
    }
    if (dir == "right") {
      if (r.startsWith("/start")) {
      }
    }
    if (dir == "left") {
      if (r.startsWith("/start")) {
      }
    }
  });

  // ////////////////////////////
  // //KEYPAD HANDLER////////////
  // ////////////////////////////

  let longpress = false;
  const longpress_timespan = 2000;
  let timeout;

  function repeat_action(param) {
    switch (param.key) {
    }
  }

  //////////////
  ////LONGPRESS
  /////////////

  function longpress_action(param) {
    switch (param.key) {
      case "Backspace":
        window.close();
        break;
    }
  }

  // /////////////
  // //SHORTPRESS
  // ////////////

  function shortpress_action(param) {
    let r = m.route.get();

    switch (param.key) {
      case "ArrowRight":
        if (r.startsWith("/mapView")) {
          MoveMap("right");
        }

        break;

      case "ArrowLeft":
        if (r.startsWith("/mapView")) {
          MoveMap("left");
        }
        break;
      case "ArrowUp":
        nav(-1);
        if (r.startsWith("/mapView")) {
          MoveMap("up");
        }

        break;
      case "ArrowDown":
        if (r.startsWith("/mapView")) {
          MoveMap("down");
        }
        nav(+1);

        break;

      case "SoftRight":
      case "Alt":
        if (r.startsWith("/start")) {
          m.route.set("/options");
        }

        if (r.startsWith("/map")) {
          ZoomMap("in");
        }
        break;

      case "SoftLeft":
      case "Control":
        if (r.startsWith("/map")) {
          ZoomMap("out");
        }

        if (r.startsWith("/start")) {
          m.route.set("/mapView", {
            lat: articles[0].metadata.lat,
            lng: articles[0].metadata.lng,
          });
        }

        if (r.startsWith("/article")) {
          m.route.set("/mapView", {
            lat: current_article.metadata.lat,
            lng: current_article.metadata.lng,
          });
        }

        break;

      case "Enter":
        if (document.activeElement.classList.contains("input-parent")) {
          document.activeElement.children[0].focus();
        }
        break;

      case "#":
        break;

      case "Backspace":
        if (r.startsWith("/mapView")) {
          history.back();
        }

        if (r.startsWith("/article")) {
          history.back();
        }

        if (r.startsWith("/detail")) {
          history.back();
        }

        if (r.startsWith("/options")) {
          history.back();
        }

        if (r.startsWith("/about")) {
          history.back();
        }

        if (r.startsWith("/settingsView")) {
          history.back();
        }

        if (r.startsWith("/privacy_policy")) {
          history.back();
        }

        break;
    }
  }

  // ///////////////////////////////
  // //shortpress / longpress logic
  // //////////////////////////////

  function handleKeyDown(evt) {
    if (evt.key == "Backspace" && document.activeElement.tagName != "INPUT") {
      evt.preventDefault();
    }

    if (evt.key === "EndCall") {
      evt.preventDefault();
      window.close();
    }
    if (!evt.repeat) {
      longpress = false;
      timeout = setTimeout(() => {
        longpress = true;
        longpress_action(evt);
      }, longpress_timespan);
    }

    if (evt.repeat) {
      if (evt.key == "Backspace") evt.preventDefault();

      if (evt.key == "Backspace") longpress = false;

      repeat_action(evt);
    }
  }

  function handleKeyUp(evt) {
    if (evt.key == "Backspace") evt.preventDefault();

    if (status.visibility === false) return false;

    clearTimeout(timeout);
    if (!longpress) {
      shortpress_action(evt);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      status.visibility = true;
    } else {
      status.visibility = false;
    }
  });
});

window.addEventListener("online", () => {
  status.deviceOnline = true;
});
window.addEventListener("offline", () => {
  status.deviceOnline = false;
});

//webActivity KaiOS 3

try {
  navigator.serviceWorker
    .register(new URL("sw.js", import.meta.url), {
      type: "module",
    })
    .then((registration) => {
      console.log("Service Worker registered successfully.");

      // Check if a service worker is waiting to be activated
      if (registration.waiting) {
        console.log("A waiting Service Worker is already in place.");
        registration.update();
      }

      if ("b2g" in navigator) {
        // Subscribe to system messages if available
        if (registration.systemMessageManager) {
          registration.systemMessageManager.subscribe("activity").then(
            () => {
              console.log("Subscribed to general activity.");
            },
            (error) => {
              alert("Error subscribing to activity:", error);
            }
          );
        } else {
          alert("systemMessageManager is not available.");
        }
      }
    })
    .catch((error) => {
      alert("Service Worker registration failed:", error);
    });
} catch (e) {
  console.error("Error during Service Worker setup:", e);
}

//KaiOS3 handel mastodon oauth
sw_channel.addEventListener("message", (event) => {
  let result = event.data.oauth_success;

  if (result) {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

    var urlencoded = new URLSearchParams();
    urlencoded.append("code", result);
    urlencoded.append("scope", "read");

    urlencoded.append("grant_type", "authorization_code");
    urlencoded.append("redirect_uri", process.env.redirect);
    urlencoded.append("client_id", process.env.clientId);
    urlencoded.append("client_secret", process.env.clientSecret);

    var requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: urlencoded,
      redirect: "follow",
    };

    fetch(settings.mastodon_server_url + "/oauth/token", requestOptions)
      .then((response) => response.json()) // Parse the JSON once
      .then((data) => {
        settings.mastodon_token = data.access_token; // Access the token
        localforage.setItem("settings", settings);
        m.route.set("/start?index=0");

        side_toaster("Successfully connected", 10000);
      })
      .catch((error) => {
        console.error("Error:", error);
        side_toaster("Connection failed");
      });
  }
});
