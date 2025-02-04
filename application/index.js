"use strict";

import {
  bottom_bar,
  side_toaster,
  load_ads,
  top_bar,
  getManifest,
  geolocation,
  setTabindex,
} from "./assets/js/helper.js";
import localforage from "localforage";
import m from "mithril";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import jsonToCsvExport from "json-to-csv-export";
import L from "leaflet";
import "swiped-events";

import "leaflet.vectorgrid";

import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";

import markerIcon from "./assets/css/images/marker-icon.png";
import markerIconRetina from "./assets/css/images/marker-icon-2x.png";

import GeometryUtil from "leaflet-geometryutil";
import "leaflet.markercluster";

import "leaflet.markercluster/dist/MarkerCluster.css"; // MarkerCluster default styles
import "leaflet.markercluster/dist/MarkerCluster.Default.css"; // MarkerCluster default styles

const sw_channel = new BroadcastChannel("sw-messages");

export let status = {
  debug: false,
  version: "",
  notKaiOS: true,
  selected_marker: "",
  previousView: "",
  selected_marker_cragId: "",
};

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

// Initialize `settings` with default values for export
export let settings;

let myAreas = [];

localforage
  .getItem("myAreas")
  .then((value) => {
    if (value === null) {
      localforage.setItem("myAreas", []);
    } else {
      myAreas = value;

      check_myAreas_update();
    }
  })
  .catch((err) => {
    localforage.setItem("myAreas", []);
  });

localforage
  .getItem("settings")
  .then((value) => {
    if (value === null) {
      settings = {
        grade: { climbing: "french", bouldering: "vscale" },
      };
      localforage.setItem("settings", settings);
    } else {
      settings = value;
      localforage.setItem("settings", value);
    }
  })
  .catch((err) => {
    settings = {
      grade: { climbing: "french", bouldering: "vscale" },
    };
    localforage.setItem("settings", settings);
  });

let cache_search = () => {
  localforage.setItem("articles", articles);
};

localforage.getItem("searchTerm").then((e) => {
  searchTerm = e;
});

const show_success_animation = () => {
  setTimeout(() => {
    document.querySelector(".success-checkmark").style.display = "block";
  }, 2000);

  setTimeout(() => {
    document.querySelector(".success-checkmark").style.display = "none";
  }, 4000);
};

const userAgent = navigator.userAgent || "";

if (userAgent && userAgent.includes("KAIOS")) {
  status.notKaiOS = false;
}

if (!status.notKaiOS) {
  const scripts = [
    "./assets/js/kaiads.v5.min.js",
    "http://127.0.0.1/api/v1/shared/core.js",
    "http://127.0.0.1/api/v1/shared/session.js",
    "http://127.0.0.1/api/v1/apps/service.js",
    "http://127.0.0.1/api/v1/audiovolumemanager/service.js",
    "https://static.kaiads.com/ads-sdk/ads-sdk.v5.min.js",
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
const mainmarker = { current_lat: 20, current_lng: 0 };

function ZoomMap(in_out) {
  if (!map) return;

  if (in_out === "in") {
    map.zoomIn();
  } else if (in_out === "out") {
    map.zoomOut();
  }
}

function MoveMap(direction) {
  document.querySelector("#map-container").focus();
  const baseStep = 0.01;
  const zoomFactor = Math.pow(2, map.getZoom());
  const step = baseStep / zoomFactor;

  // Aktuelle Mitte der Karte
  let center = map.getCenter();

  // Verschiebung berechnen
  if (direction === "left") {
    center.lng -= step;
  } else if (direction === "right") {
    center.lng += step;
  } else if (direction === "up") {
    center.lat += step;
  } else if (direction === "down") {
    center.lat -= step;
  }
  map.panTo(center);

  getMarkers();
}

let getMarkers = async () => {
  // Get the current bounds of the map
  const bounds = map.getBounds();

  // Get the center of the map for distance calculations
  const mapCenter = map.getCenter();

  // Reset the list of markers in bounds
  status.markers_in_bounds = [];

  // Iterate over all layers on the map
  map.eachLayer(function (layer) {
    if (layer instanceof L.Marker) {
      const markerLatLng = layer.getLatLng();

      // Check if the marker is within the map bounds
      if (bounds.contains(markerLatLng)) {
        // Remove any previous "selected" class
        if (layer.getElement()) {
          layer.getElement().classList.remove("selected-marker");
        }

        // Calculate the distance from the map center
        const distance = mapCenter.distanceTo(markerLatLng);

        // Add the marker and its distance to the list
        status.markers_in_bounds.push({ layer, distance });
      }
    }
  });

  // Sort the markers by distance (ascending)
  status.markers_in_bounds.sort((a, b) => a.distance - b.distance);

  // Extract only the marker layers from the sorted list
  status.markers_in_bounds = status.markers_in_bounds.map((item) => item.layer);

  console.log(status.markers_in_bounds.length);
  // Return the markers in bounds
};

let currentMarkerIndex = -1; // Initialize the index for tracking the current marker

let previousMarkerIndex = null;

function panToNextMarker() {
  const markers = status.markers_in_bounds;

  if (!markers || markers.length === 0) {
    console.warn("No markers in bounds to pan to.");
    return;
  }

  // Increment the index and loop back to the start if at the end of the list
  currentMarkerIndex = (currentMarkerIndex + 1) % markers.length;
  const selectedMarker = markers[currentMarkerIndex];
  const markerLatLng = selectedMarker.getLatLng();

  // Open popup for the selected marker
  selectedMarker.openPopup();
  status.selected_marker_cragId = selectedMarker.options.id;

  // Pan the map to the selected marker
  map.panTo(markerLatLng);

  // Update classes for the current and previous markers
  if (
    previousMarkerIndex !== null &&
    previousMarkerIndex !== currentMarkerIndex
  ) {
    const previousMarker = markers[previousMarkerIndex];
    previousMarker.getElement().classList.remove("selected-marker");
  }

  selectedMarker.getElement().classList.add("selected-marker");

  previousMarkerIndex = currentMarkerIndex; // Update the previous marker index
}

// Initialize the map and define the setup
function map_function(lat, lng, zoom = 10) {
  map = L.map("map-container", {
    keyboard: true,
    zoomControl: false,
    shadowUrl: "",
    minZoom: 3,
    worldCopyJump: true,
  }).setView([lat, lng], zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  if (!status.notKaiOS)
    document.getElementsByClassName(
      "leaflet-control-attribution"
    )[0].style.display = "none";

  const addedMarkers = new Set();

  // Vector tile server URL
  const url = "https://maptiles.openbeta.io/crags/{z}/{x}/{y}.pbf";

  // Vektorkacheln hinzufügen
  const vectorTileLayer = L.vectorGrid.protobuf(url, {
    rendererFactory: L.canvas.tile,
    vectorTileLayerStyles: {},
    attribution: "&copy; mapBox contributors",
    interactive: false,
    debug: false,
    opacity: 0,
    minZoom: 0,
    maxZoom: 10,
  });

  // Vektorkachel-Layer zur Karte hinzufügen
  vectorTileLayer.addTo(map);

  // Listen to the 'tileload' event to process the tile once it's loaded
  vectorTileLayer.on("tileload", function (event) {
    const coords = event.coords; // The coordinates of the tile (x, y, z)

    // Construct the URL for the .pbf tile using the coordinates
    const tileUrl = L.Util.template(url, coords);

    // Fetch and decode the vector tile
    fetch(tileUrl)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        // Decode .pbf data using VectorTile and Protobuf
        const tile = new VectorTile(new Protobuf(new Uint8Array(arrayBuffer)));

        //marker group or cluster
        let markers;
        if (status.notKaiOS) {
          markers = L.markerClusterGroup({
            disableClusteringAtZoom: 16,
          });
        } else {
          markers = L.layerGroup([]);
        }

        // Process each layer in the tile
        for (const layerName in tile.layers) {
          const layer = tile.layers[layerName];

          // Process each feature in the layer
          for (let i = 0; i < layer.length; i++) {
            const feature = layer
              .feature(i)
              .toGeoJSON(coords.x, coords.y, coords.z);

            // Add markers for relevant features
            if (
              feature.type === "Feature" &&
              feature.geometry.type === "Point"
            ) {
              const [lon, lat] = feature.geometry.coordinates;

              if (
                !addedMarkers.has(feature.properties.id) &&
                feature.properties.type === "crag" &&
                feature.properties.totalClimbs > 0
              ) {
                const popup = L.popup().setContent(
                  `<strong>${feature.properties.name}</strong><br>Climbs: ${feature.properties.totalClimbs}<br><a href="#" onclick="window.history.go(-1); return false;">Open</a>`
                );

                const marker = L.marker([lat, lon], {
                  id: feature.properties.id,
                }).bindPopup(popup);

                markers.addLayer(marker);

                // Handle marker click events
                marker.on("click", (event) => {
                  status.selected_marker_cragId = event.target.options.id;
                  articles = [];
                  fetchAreasById(status.selected_marker_cragId)
                    .then((r) => {
                      articles.push(r.data.area);
                    })
                    .catch((e) => {
                      console.error(e);
                    });
                });

                // Track added markers to avoid duplicates
                addedMarkers.add(feature.properties.id);
              }
            }
          }
        }

        markers.addTo(map);

        // Handle moveend events for marker selection
        map.on("zoomend", () => {
          getMarkers();
        });
      })
      .catch((err) => {
        console.error("Error fetching or decoding tile:", err);
      });
  });

  let myMarker = null;
  L.Icon.Default.prototype.options.shadowUrl = "";

  L.Icon.Default.prototype.options.iconUrl = markerIcon;
  L.Icon.Default.prototype.options.iconRetinaUrl = markerIconRetina;

  let geolocation_cb = function (e) {
    if (!myMarker) {
      // Create the marker only once
      myMarker = L.marker([e.coords.latitude, e.coords.longitude])
        .addTo(map)
        .bindPopup("It's me");
      myMarker._icon.classList.add("myMarker");
      myMarker.options.shadowUrl = "";

      // Update the marker's position
      myMarker.setLatLng([e.coords.latitude, e.coords.longitude]);
    }
  };
  geolocation(geolocation_cb);
  // if (lat != 0 && lng != 0) L.marker([lat, lng]).addTo(map);
  map.setView([lat, lng]);

  articles.map((e) => {
    // Create the marker with a custom 'id' property
    let marker = L.marker([e.metadata.lat, e.metadata.lng], {
      id: e.uuid, // Add the unique ID to the marker options
    })
      .addTo(map)
      .bindPopup(e.areaName);

    // Open the popup for the marker matching the given coordinates
    if (e.metadata.lat === lat && e.metadata.lng === lng) {
      marker.openPopup();
    }

    // Add a click event listener to the marker
    marker.on("click", (event) => {
      const markerId = event.target.options.id; // Retrieve the ID from the marker options
      status.selected_marker = markerId;
    });
  });
}

//check if has update in downloaded areas

function findUpdatedAtValues(obj) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (key === "updatedAt") {
      acc.push(value);
    } else if (typeof value === "object" && value !== null) {
      acc.push(...findUpdatedAtValues(value)); // Recursively merge results
    }
    return acc;
  }, []);
}

let getYoungestdate = (arr) => {
  arr.sort((a, b) => b - a);
  return arr[0];
};

let check_myAreas_update = async () => {
  myAreas.forEach((e) => {
    AreasUpdate(e.uuid).then((docs) => {
      let updatedDocsDate = findUpdatedAtValues(docs);

      getYoungestdate(updatedDocsDate);

      if (updatedDocsDate.length > 0) {
        AreasUpdate(e.uuid).then((docs) => {
          let updatedDocsDate = findUpdatedAtValues(docs);

          if (updatedDocsDate.length > 0 && e.downloaded < updatedDocsDate[0]) {
            e.update = true;
          } else {
            e.update = false;
          }
        });
      }
    });
  });
};
check_myAreas_update();

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
          },
          (err) => {
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

async function fetchGraphQL(query, variables) {
  const response = await fetch("https://api.openbeta.io/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  const requestBody = JSON.stringify({ query, variables });

  if (!response.ok) {
    console.error(`HTTP error! status: ${response.status}`);
    return { errors: [{ message: `HTTP ${response.status}` }] };
  }

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
      media {
        mediaUrl
        format
      }
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
        media {
        mediaUrl
        format
        }
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

const operationsDocId = `
query MyQuery($uuid: ID!) {
  area(uuid: $uuid) {

    areaName
      totalClimbs
      uuid
      metadata {
        lat
        lng
        isBoulder
      }

      media {
        mediaUrl
        format
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
      media {
        mediaUrl
        format
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
`;

async function fetchAreasById(uuid) {
  try {
    const variables = { uuid: uuid }; // Passing uuid as a variable
    const { errors, data } = await fetchGraphQL(operationsDocId, variables);

    if (errors) throw new Error(JSON.stringify(errors));

    console.log(data);

    return { success: true, data };
  } catch (error) {
    console.error("Error:", error); // Handle errors
  }
}

const areaCheckUpdate = `query MyQuery($uuid: ID!) {
  getAreaHistory(filter: {areaId: $uuid}) {
    changes {
      fullDocument {
        ... on Area {
          areaName
          authorMetadata {
            updatedAt
            updatedByUser
          }
        }
      }
    }
    operation
  }
}`;

async function AreasUpdate(uuid) {
  try {
    const variables = { uuid: uuid }; // Passing uuid as a variable
    const { errors, data } = await fetchGraphQL(areaCheckUpdate, variables);

    if (errors) throw new Error(JSON.stringify(errors));

    //console.log(data);

    return { success: true, data };
  } catch (error) {
    console.error("Error:", error); // Handle errors
  }
}

let myAreasDeleteItem = (id) => {
  myAreas = myAreas.filter((e) => e.uuid !== id);

  localforage
    .setItem("myAreas", myAreas)
    .then(() => {
      m.redraw();
    })
    .catch((err) => {
      console.error("Error saving to localforage:", err);
    });
};

////////////////
///VIEWS
///////////////

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
          console.log(status);

          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");

          bottom_bar("", "", "");

          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        myAreas.length > 0
          ? m(
              "button",
              {
                class: "item",
                onclick: () => {
                  m.route.set("/myAreasView");
                },
              },
              "MyAreas"
            )
          : null,
        status.previousView == "/article"
          ? m(
              "button",
              {
                class: "item",
                onclick: () => {
                  if (myAreas == null) myAreas = [];
                  current_article.downloaded = Date.now();
                  myAreas.push(current_article);
                  localforage.setItem("myAreas", myAreas).then(() => {
                    history.back();
                    show_success_animation();
                  });
                },
              },
              "Save area"
            )
          : null,
        ticks.length
          ? m(
              "button",
              {
                class: "item",
                oncreate: ({ dom }) => {
                  scrollToCenter();
                },
                onclick: () => {
                  m.route.set("/ticksView");
                },
              },
              "TickLog"
            )
          : null,
        m(
          "button",
          {
            class: "item",
            oncreate: ({ dom }) => {},
            onclick: () => {
              m.route.set("/about");
            },
          },
          "About"
        ),
        m(
          "button",
          {
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
            class: "item",
            onclick: () => {
              m.route.set("/privacy_policy");
            },
            oncreate: () => {
              setTabindex();
              document.querySelector(".item").focus();
            },
          },
          "Privacy Policy"
        ),
        m("div", {
          id: "KaiOSads-Wrapper",

          oncreate: () => {
            if (!status.notKaiOS) load_ads();
          },
        }),
      ]
    );
  },
};

let ticks = [];

// Load ticks from localforage
localforage
  .getItem("ticks")
  .then((value) => {
    ticks = value || []; // Set to an empty array if `value` is null
  })
  .catch(() => {
    ticks = [];
  });

let addTick = async (
  routeId,
  routeName,
  routeType,
  grade,
  location,
  style,
  date,
  source
) => {
  if (!ticks.length) {
    ticks = (await localforage.getItem("ticks")) || [];
  }

  ticks.push({
    id: uuidv4(16),
    routeId: routeId,
    routeName: routeName,
    routeType: routeType,
    grade: grade,
    location: location,
    style: style,
    date: date,
    source: source,
  });

  console.log(ticks);

  // Save updated ticks to localforage
  localforage.setItem("ticks", ticks).then((value) => {
    show_success_animation();
    setTimeout(() => {
      history.back();
    }, 200);
  });
};

var tickView = {
  view: function () {
    return m(
      "div",
      {
        id: "optionsView",
        class: "flex page",
        oncreate: () => {
          top_bar("", "", "");

          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");

          bottom_bar("", "", "");

          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m(
          "button",
          {
            "data-tick-type": "onsight",
            class: "item",
            oncreate: ({ dom }) => {
              dom.focus();
              scrollToCenter();
            },
            onclick: () => {
              console.log(current_article.metadata);
              let location =
                "lat:" +
                current_article.metadata.lat +
                "/lng:" +
                current_article.metadata.lng;

              let routetype = Object.entries(current_detail.type).find(
                ([key, value]) => value
              )?.[0];

              let grade =
                Object.entries(current_detail.grades).find(([key, value]) => {
                  if (current_detail.type.bouldering) {
                    return key === settings.grade.bouldering;
                  } else {
                    return key === settings.grade.climbing;
                  }
                })?.[1] ??
                Object.values(current_detail.grades).find((value) => value);

              addTick(
                current_detail.uuid,
                current_detail.name,
                routetype,
                grade,
                location,
                "onsight",
                new Date(),
                "openbeta.io"
              );
            },
          },
          "Onsight"
        ),

        m(
          "button",
          {
            "data-tick-type": "toprope",
            class: "item",
            oncreate: () => {},
            onclick: () => {
              let location =
                "lat:" +
                current_article.metadata.lat +
                "/lng:" +
                current_article.metadata.lng;

              let routetype = Object.entries(current_detail.type).find(
                ([key, value]) => value
              )?.[0];

              let grade =
                Object.entries(current_detail.grades).find(([key, value]) => {
                  if (current_detail.type.bouldering) {
                    return key === settings.grade.bouldering;
                  } else {
                    return key === settings.grade.climbing;
                  }
                })?.[1] ??
                Object.values(current_detail.grades).find((value) => value);

              addTick(
                current_detail.uuid,
                current_detail.name,
                routetype,
                grade,
                location,
                "redpoint",
                new Date(),
                "openbeta.io"
              );
            },
          },
          "Redpoint"
        ),

        m(
          "button",
          {
            "data-tick-type": "flash",
            class: "item",
            onclick: () => {
              let location =
                "lat:" +
                current_article.metadata.lat +
                "/lng:" +
                current_article.metadata.lng;

              let routetype = Object.entries(current_detail.type).find(
                ([key, value]) => value
              )?.[0];

              let grade =
                Object.entries(current_detail.grades).find(([key, value]) => {
                  if (current_detail.type.bouldering) {
                    return key === settings.grade.bouldering;
                  } else {
                    return key === settings.grade.climbing;
                  }
                })?.[1] ??
                Object.values(current_detail.grades).find((value) => value);

              addTick(
                current_detail.uuid,
                current_detail.name,
                routetype,
                grade,
                location,
                "flash",
                new Date(),
                "openbeta.io"
              );
            },
          },
          "Flash"
        ),

        m(
          "button",
          {
            "data-tick-type": "toprope",
            class: "item",
            oncreate: () => {
              setTabindex();
            },
            onclick: () => {
              let location =
                "lat:" +
                current_article.metadata.lat +
                "/lng:" +
                current_article.metadata.lng;

              let routetype = Object.entries(current_detail.type).find(
                ([key, value]) => value
              )?.[0];

              let grade =
                Object.entries(current_detail.grades).find(([key, value]) => {
                  if (current_detail.type.bouldering) {
                    return key === settings.grade.bouldering;
                  } else {
                    return key === settings.grade.climbing;
                  }
                })?.[1] ??
                Object.values(current_detail.grades).find((value) => value);

              addTick(
                current_detail.uuid,
                current_detail.name,
                routetype,
                grade,
                location,
                "toprope",
                new Date(),
                "openbeta.io"
              );
            },
          },
          "TopRope"
        ),
      ]
    );
  },
};

let articles = [];
let current_article;

let searchTerm = "";
let stats = "";
let focused_article;
localforage
  .getItem("stats")
  .then((e) => {
    stats = e;
  })
  .catch(() => {});

const start = {
  onbeforeremove: function () {
    status.previousView = "/start";
  },

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
    } else {
      console.error("Failed to fetch areas:", result.error);
      side_toaster("data could not be loaded", 3000);
      articles = [];
    }
  },

  oninit() {
    focused_article = null;

    // Retrieve the `search` parameter from the URL
    const params = m.route.param("search");
    if (params) {
      searchTerm = params;
      this.search();
    } else {
      searchTerm = "";
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
        class: "page",
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
      m("div", { class: "loading-spinner-2" }, [
        m("div"),
        m("div"),
        m("div"),
        m("div"),
      ]),

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
                  "data-lat": e.metadata.lat,
                  "data-lng": e.metadata.lng,
                  "data-id": e.uuid,

                  oncreate: (vnode) => {
                    document.querySelector("#start").classList.add("search-ok");
                    if (status.selected_marker == e.uuid) {
                      vnode.dom.focus();
                    }
                    if (status.selected_marker == "") {
                      current_article = articles[0];
                    }
                  },
                  onclick: () => {
                    if (e.totalClimbs == 0) {
                      side_toaster("no climbs", 3000);
                    } else {
                      current_article = e.uuid;
                      if (current_article)
                        m.route.set("/article?index=" + e.uuid);
                    }
                  },
                  onfocus: () => {
                    focused_article = e;
                    current_article = e;
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
                    e?.media.length > 0
                      ? m("span", { class: "tag" }, "media")
                      : null,
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

///////////////
///CLIMBS/////
/////////////

function flattenArray(arr) {
  return arr.reduce((acc, val) => {
    return acc.concat(Array.isArray(val) ? flattenArray(val) : val);
  }, []);
}

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
  return flattenArray(results); // Use the custom flatten function
}

const article = {
  onbeforeremove: function () {
    status.previousView = "/article";
  },

  view: function () {
    articles.find((h) => {
      var index = m.route.param("index");
      if (index != h.uuid) return false;

      current_article = h;

      return true;
    });

    const allClimbs = getAllNestedKeys(current_article, "climbs");

    return m(
      "div",
      {
        id: "article",
        class: "page",

        onremove: () => {
          if (current_article != "") {
            scrollToCenter();
          } else {
            scrollToTop();
          }
        },

        oncreate: () => {
          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");
          bottom_bar(
            "<img src='assets/icons/map.svg'>",
            "",
            "<img src='assets/icons/option.svg'>"
          );
        },
      },

      m("h1", { class: "extra" }, "Climbs"),
      allClimbs.map((climb, i) => {
        return m(
          "article",
          {
            class: "item",
            oncreate: (vnode) => {
              setTabindex();

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
              setTabindex();

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

              climb.type
                ? Object.entries(climb.type)
                    .filter(([key, value]) => value !== null)
                    .map(([key, value]) => {
                      return value === true
                        ? m("span", { class: "tag" }, key)
                        : null;
                    })
                : "",

              climb.grades
                ? Object.entries(climb.grades)
                    .filter(([key, value]) => value !== null)
                    .map(([key, value]) => {
                      return value != null
                        ? m("span", { class: "tag" }, value)
                        : null;
                    })
                : null,

              ticks
                .filter((e) => e.routeId === climb.uuid)
                .slice(0, 1)
                .map((e) => m("span", { class: "tag tick" }, "tick")),
            ]),

            m("h2", climb.name),
          ]
        );
      }),
      current_article.media?.length > 0
        ? m("div", { id: "image-wrapper" }, [
            current_article.media.map((e) => {
              return m("li", { class: "item" }, [
                m("img", {
                  loading: "lazy",
                  src: "https://media.openbeta.io" + e.mediaUrl + "?w=640&q=75",
                  oncreate: () => {
                    setTabindex();
                  },
                }),
              ]);
            }),
          ])
        : null
    );
  },
};

let current_detail;
var detail = {
  view: function () {
    current_article.climbs.find((h) => {
      var index = m.route.param("detail");
      if (index != h.uuid) return false;

      current_detail = h;

      return true;
    });

    return m(
      "div",
      {
        id: "article",
        class: "page scroll",
        tabIndex: 0,

        onremove: () => {
          scrollToTop();
        },
        oncreate: (vnode) => {
          setTimeout(() => {
            setTabindex();
          }, 500);
          vnode.dom.focus();
          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");

          bottom_bar("<img src='assets/icons/tick.svg'>", "", "");
          scrollToTop();
        },
      },
      m("div", { id: "detail" }, [
        m("h1", { class: "extra" }, "Climb"),

        m("ul", [
          m(
            "li",
            { class: "" },
            m.trust(
              "<div>Area</div><span>" + current_article.areaName + "</span>"
            )
          ),
          m(
            "li",
            { class: "" },

            m.trust("<div>Name</div><span>" + current_detail.name + "</span>")
          ),
          current_detail.fa
            ? m(
                "li",
                { class: "" },

                m.trust(
                  "<div>First ascent</div><span>" +
                    current_detail.fa +
                    "</span>"
                )
              )
            : null,

          Object.entries(current_detail.type)
            .filter(([key, value]) => value !== null)
            .map(([key, value]) => {
              return value === true
                ? m(
                    "li",
                    { class: "tag" },
                    m.trust("<div>Type</div><span>" + key + "</span>")
                  )
                : null;
            }),

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
                { class: "" },

                m.trust(
                  "<div>Type</div><span>" + current_detail.length + "</span>"
                )
              )
            : null,
        ]),
      ]),
      ticks
        ? m(
            "div",
            {
              id: "my-tick-list-title",
              oncreate: (vnode) => {
                vnode.dom.style.opacity = "0";
              },
            },
            "My Ticks"
          )
        : null,
      m("ul", { id: "my-tick-list" }, [
        ticks
          .filter((e) => e.routeId === current_detail.uuid)
          .map((e) => {
            return m(
              "li",
              {
                oncreate: () => {
                  document.querySelector("#my-tick-list-title").style.opacity =
                    "1";
                  setTabindex();
                },
                class: "flex justify-content-spacebetween item",
              },
              [
                m("span", { class: "" }, e.style),
                m("span", dayjs(e.date).format("DD/MM/YYYY")),
              ]
            );
          }),
      ])
    );
  },
};

let mapView = {
  view: function () {
    return m(
      "div",
      {
        id: "map-container",

        onremove: () => {
          searchTerm = "";
          localforage.setItem("searchTerm", searchTerm);

          if (!status.notKaiOS) {
            articles = [];

            fetchAreasById(status.selected_marker_cragId)
              .then((r) => {
                articles.push(r.data.area);
                m.redraw();
              })
              .catch((e) => {
                console.log(e);
              });
          }
        },

        oncreate: (vnode) => {
          bottom_bar("", "", "");

          if (!status.notKaiOS)
            bottom_bar(
              "<img src='assets/icons/plus.svg'>",
              "<img src='assets/icons/select.svg'>",
              "<img src='assets/icons/minus.svg'>"
            );

          const params = new URLSearchParams(m.route.get().split("?")[1]);
          const lat = parseFloat(params.get("lat")) || "27.986065";
          const lng = parseFloat(params.get("lng")) || "86.922623";

          map_function(lat, lng, 16);

          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");
        },
      },
      [
        m("div", { id: "cross" }, [
          m("div", { id: "cross-inner" }, [
            m("div"),
            m("div"),
            m("div"),
            m("div"),
          ]),
        ]),
      ]
    );
  },
};

///////////////
///INTRO//////
/////////////

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

//////////////
////myAreas////
////////////

var myAreasView = {
  view: function () {
    return m(
      "div",
      {
        class: "page",
        id: "myAreasView",
      },
      [
        m("h1", { class: "extra" }, "MyAreas"),
        m("div", [
          myAreas.map((e) => {
            return m(
              "article",
              {
                class: "item",
                "data-lat": e.metadata.lat,
                "data-lng": e.metadata.lng,
                "data-id": e.uuid,
                "data-swipe-threshold": 20,
                oninit: () => {},

                onfocus: (vnode) => {
                  bottom_bar("", "", "<img src='assets/icons/delete.svg'>");
                  focused_article = e;
                  current_article = e;
                },

                onclick: () => {
                  current_article = e;
                  if (current_article.update) {
                    fetchAreasById(e.uuid)
                      .then((r) => {
                        current_article.update = false;
                        e = r.data.area;
                        e.downloaded = Date.now();
                        localforage.setItem("myAreas", myAreas).then(() => {
                          current_article = e;
                          m.route.set("/article");
                          side_toaster("content updated", 5000);
                        });
                      })
                      .catch((e) => {
                        console.error(e);
                      });
                  } else {
                    m.route.set("/article");
                  }
                },

                onkeydown: (event) => {
                  if (event.key === "Enter") {
                    current_article = e;
                    m.route.set("/article");
                  }
                },
              },
              [
                m("div", { class: "tags" }, [
                  m("span", { class: "tag" }, e.pathTokens[0]),
                  e.update ? m("span", { class: "tag" }, "new") : null,

                  e.metadata.isBoulder
                    ? m("span", { class: "tag" }, "Bouldering")
                    : m("span", { class: "tag" }, "Climbing"),
                  m("span", { class: "tag" }, e.totalClimbs),
                ]),

                m(
                  "h2",
                  {
                    oncreate: () => {
                      setTabindex();
                    },
                  },
                  e.areaName
                ),
              ]
            );
          }),
        ]),
      ]
    );
  },
};

//////////////
////TICKS////
////////////

var ticksView = {
  view: function () {
    return m(
      "div",
      {
        class: "page",
        id: "ticks-view",
        oninit: () => {},
        onremove: () => {},
      },
      [
        m("h1", { class: "extra" }, "Ticks"),
        m("div", [
          ticks.map((e) => {
            return m(
              "article",
              {
                class: "item",
                oncreate: () => {
                  bottom_bar("<img src='assets/icons/save.svg'>", "", "");
                  setTabindex();
                },
              },
              [
                m("div", { class: "tags" }, [
                  m("span", { class: "tag" }, e.style),
                  m("span", { class: "tag" }, e.routeType),
                  m("span", { class: "tag" }, e.grade),
                ]),
                m("div", { class: "flex justify-content-spacebetween" }, [
                  m("span", { class: "name" }, e.routeName),
                  m(
                    "span",
                    { class: "date" },
                    dayjs(e.date).format("DD.MM.YYYY")
                  ),
                ]),
              ]
            );
          }),
        ]),
      ]
    );
  },
};

var about = {
  view: function () {
    return m(
      "div",
      {
        class: "scoll page",
        tabindex: 0,
        oncreate: (vnode) => {
          vnode.dom.focus();
        },
      },
      [
        m(
          "div",
          m.trust(
            "<strong>PicTick</strong> is an app with which you can search for climbing areas and climbing routes. you can also ‘tick’ your routes to create an overview of the routes you have climbed. The data that is searched comes from openbeta.io a free climbing database. <br><br>"
          ),
          m("li", "Version: " + status.version)
        ),
      ]
    );
  },
};

var privacy_policy = {
  view: function () {
    return m(
      "div",
      {
        id: "privacy_policy",
        class: "page scroll",
        tabindex: "0",
        oncreate: (vnode) => {
          vnode.dom.focus();
        },
      },
      [
        m(
          "h1",
          {
            oncreate: (vnode) => {
              vnode.dom.focus();
            },
          },
          "Privacy Policy for PicTick"
        ),
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
      ]
    );
  },
};

var settingsView = {
  view: function () {
    return m(
      "div",
      {
        class: "page flex ",
        id: "settings-page",
        oncreate: () => {
          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");
          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m("div", "Set your default grade type"),

        m("h2", {}, "Climbing"),
        m(
          "div",
          {
            class: "item input-parent",
            oncreate: (vnode) => {
              vnode.dom.focus();
            },
          },
          [
            m("label", { for: "climbing-grade" }, ""),
            m(
              "select",
              {
                name: "climbing-grade",
                class: "select-box",
                id: "climbing-grade",
                value: settings.grade.climbing,
                onchange: (e) => {
                  settings.grade.climbing = e.target.value;
                  m.redraw();
                },
              },
              [
                m("option", { value: "french" }, "French"),
                m("option", { value: "yds" }, "YDS"),
                m("option", { value: "uuia" }, "UIAA"),
              ]
            ),
          ]
        ),

        m("h2", {}, "Bouldering"),
        m("div", { class: "item input-parent" }, [
          m("label", { for: "bouldering-grade" }, ""),
          m(
            "select",
            {
              name: "bouldering-grade",
              class: "select-box",
              id: "bouldering-grade",
              value: settings.grade.bouldering,
              onchange: (e) => {
                settings.grade.bouldering = e.target.value;
                m.redraw();
              },
            },
            [
              m("option", { value: "fb" }, "Fontainebleau (FB)"),
              m("option", { value: "vscale" }, "V-Scale"),
            ]
          ),
        ]),

        m(
          "button",
          {
            class: "item button-save-settings",
            oncreate: () => {
              setTabindex();
            },
            onkeydown: (e) => {
              if (e.key === "Enter") {
                e.target.click();
              }
            },
            onclick: () => {
              localforage.setItem("settings", settings).then(() => {
                side_toaster("settings saved", 4000);
              });
            },
          },
          "Save"
        ),
      ]
    );
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
  "/tickView": tickView,
  "/ticksView": ticksView,
  "/myAreasView": myAreasView,
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

document.addEventListener("onbeforeunload", function (e) {
  cache_search();
});

document.addEventListener("swiped", function (e) {
  console.log(e.target); // element that was swiped
  console.log(e.detail); // see event data below
  console.log(e.detail.dir); // swipe direction
  alert("delete ?");
});

document.addEventListener("DOMContentLoaded", function (e) {
  /////////////////
  ///NAVIGATION
  /////////////////

  let nav = function (move) {
    if (
      document.activeElement.nodeName == "SELECT" ||
      document.activeElement.type == "date" ||
      document.activeElement.type == "time" ||
      document.activeElement.classList.contains("scroll")
    )
      return false;

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
    .querySelector("#top-bar div div.button-left")
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
        if (r.startsWith("/mapView")) {
          MoveMap("up");
        } else {
          nav(-1);
        }

        break;
      case "ArrowDown":
        if (r.startsWith("/mapView")) {
          MoveMap("down");
        } else {
          nav(+1);
        }

        break;

      case "SoftRight":
      case "Alt":
        if (r.startsWith("/start")) {
          m.route.set("/options");
        }

        if (r.startsWith("/article")) {
          m.route.set("/options");
        }

        if (r.startsWith("/myAreas")) {
          myAreasDeleteItem(focused_article);
        }

        if (r.startsWith("/map")) {
          ZoomMap("out");
        }

        break;

      case "SoftLeft":
      case "Control":
        if (r.startsWith("/map")) {
          ZoomMap("in");
        }

        if (r.startsWith("/start")) {
          if (current_article == undefined) {
            m.route.set("/mapView", {
              lat: 0,
              lng: 0,
              uuid: 0,
            });
            return;
          }
          //if (articles.length == 0) return false;
          if (focused_article != null) {
            m.route.set("/mapView", {
              lat: current_article.metadata.lat,
              lng: current_article.metadata.lng,
              uuid: current_article.uuid,
            });
          } else {
            m.route.set("/mapView", {
              lat: current_article.metadata.lat || 0,
              lng: current_article.metadata.lng || 0,
              uuid: current_article.uuid || 0,
            });
          }
        }

        if (r.startsWith("/article")) {
          m.route.set("/mapView", {
            lat: current_article.metadata.lat,
            lng: current_article.metadata.lng,
            uuid: current_article.uuid,
          });
        }

        if (r.startsWith("/detail")) {
          m.route.set("/tickView");
        }

        if (r.startsWith("/ticksView")) {
          jsonToCsvExport({ data: ticks });
        }

        break;

      case "Enter":
        if (document.activeElement.classList.contains("input-parent")) {
          document.activeElement.children[0].focus();
        }

        if (r.startsWith("/map")) {
          panToNextMarker();
        }

        break;

      case "#":
        break;

      case "Backspace":
        if (r.startsWith("/myAreasView")) {
          history.back();
        }
        if (r.startsWith("/mapView")) {
          m.route.set("/start", { "search": "" });
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

        if (r.startsWith("/tickView")) {
          history.back();
        }

        if (r.startsWith("/ticksView")) {
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

//worker sleep mode
try {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
} catch (e) {
  console.log(e);
}

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
