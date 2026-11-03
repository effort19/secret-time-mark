"use strict";

// ============================================================
// TIMEMARK LOCATION.JS  (v6 - town / barangay root-cause fix)
// ============================================================
//
// FIXES IN v6  (why a town / barangay could come out wrong)
//   ROOT CAUSE: when the real-boundary lookup (Overpass) failed, the
//   town fell back to whatever Nominatim listed, which for places near
//   a border is often a NEARBY city (e.g. "Vigan City" for a barangay of
//   San Ildefonso). That wrong result was then CACHED, so it stuck.
//   1. A whitelisted city (Vigan, Candon, Laoag, Batac) is accepted only
//      when real boundaries OR the zoom-10 boundary lookup confirm it.
//      If neither can, the town stays EMPTY. Nothing is substituted.
//   2. Overpass is retried on 3 servers with a timeout and "runtime
//      error" detection, so a single busy server no longer disables the
//      boundary check.
//   3. Results computed WITHOUT boundary data are never cached, so the
//      next lookup tries again instead of repeating a wrong town.
//   4. Overlapping municipality polygons: the lookup town is kept only if
//      one of the polygons is that town, otherwise it is dropped.
//   5. Barangay: the real barangay polygon is no longer rejected for
//      containing words like "Village" / "Zone", no longer rejected when
//      its name equals a street or the town, and when several polygons
//      overlap the one matching the address data is chosen.
//   6. "Candon" (barangay) + "Candon City" (town) are no longer merged
//      into one part when the address is joined.
//   7. candidateLabel() no longer re-reads the raw display_name to
//      rebuild a town.
//   There is no hardcoded Vigan fallback anywhere; "Vigan" only appears
//   in CITY_WHITELIST, which decides when "City" may be added.
//
// WHAT'S NEW IN v5 (display only - detection logic is unchanged)
//   1. PROGRESSIVE ADDRESS: the "Current location" address now appears as
//      soon as the exact GPS point is resolved. The nearby options are
//      added to the dropdown while they load (before, the dropdown stayed
//      on "Finding nearby addresses..." until all 9 lookups finished).
//   2. CLEARER DROPDOWN: the current location is marked with a pin and
//      nearby options show their distance, e.g.
//          📍 Pantay Laud, Vigan City, Ilocos Sur
//          Busiing Norte, San Ildefonso, Ilocos Sur  (35 m)
//      Turn this off with DECORATE_ADDRESS_OPTIONS = false (the option
//      text then equals the plain address, as in v4). option.value is
//      ALWAYS the plain address either way.
//   3. SAFER DROPDOWN: the list is not rebuilt while the person has it
//      open, and a choice made while loading is kept.
//   4. CLEAR ALTERNATES: alternate formats of the current location
//      (with street, town + province only, full with postcode) are
//      labelled in the option tooltip instead of all saying
//      "Current location".
//   5. FRIENDLY STATUS TEXT while loading, and a calmer error message.
//
// CITY RULE (single source of truth: CITY_WHITELIST + enforceCityRule)
//   Ilocos Sur:    only Vigan City and Candon City
//   Ilocos Norte:  only Laoag City and Batac City
//   Every other town / municipality / province never shows "City".
//
// TOWN DETECTION (never guessed), order of trust:
//   0. real boundaries (Overpass is_in, admin_level 6)
//   1. the display_name part directly before the province
//   2. a municipality / town / city / county field that is ALSO in
//      display_name
//   3. nothing -> town stays empty
//
// BARANGAY DETECTION (never guessed), order of trust:
//   0. real barangay polygon (admin_level 10)
//   1. address.barangay
//   2. a display_name part written "Barangay X" / "Brgy. X"
//   3. address.suburb
//   4. address.village
//   then one zoom-14 lookup; otherwise empty.
//
// DEFAULT FORMAT:  Barangay, Town/City, Province
// STREET FORMAT:   National Highway, Barangay, Town/City, Province
//
// ============================================================


// ============================================================
// GLOBAL TIMEMARK OBJECT
// ============================================================

window.TimeMark = window.TimeMark || {};
window.TimeMark.location = window.TimeMark.location || {};

window.TimeMark.location.phoneLatitude = null;
window.TimeMark.location.phoneLongitude = null;
window.TimeMark.location.phoneAccuracy = null;
window.TimeMark.location.phoneAddress = "";


// ============================================================
// SETTINGS
// ============================================================

// true  -> dropdown text shows a pin for the current location and the
//          distance for nearby options (option.value stays plain)
// false -> dropdown text is the plain address
const DECORATE_ADDRESS_OPTIONS = true;

// most options shown in the address dropdown
const MAX_ADDRESS_OPTIONS = 8;


// ============================================================
// DOM VARIABLES
// ============================================================

let locationAddressInput = null;
let locationCoordinateInput = null;
let locationButton = null;

const LOCATION_BLOCKED_MESSAGE =
    "Location is blocked. Allow Location for this site in your browser settings, then tap Use My Location.";


// ============================================================
// CACHE
// ============================================================

const reverseGeocodeCache = Object.create(null);
const nearbyAddressCache = Object.create(null);
const highwayCache = Object.create(null);
const nominatimCache = Object.create(null);
const adminCache = Object.create(null);

// Incremented on every address-dropdown refresh so a slow, older
// lookup can never overwrite the result of a newer one.
let addressRequestCounter = 0;


// ============================================================
// SETUP DOM
// ============================================================

function setupLocationElements() {
    locationAddressInput = document.getElementById("address");
    locationCoordinateInput = document.getElementById("coordinate");
    locationButton = document.getElementById("getLocationBtn");
}


// ============================================================
// SECURE LOCATION CHECK
// ============================================================

window.isLocationSecure = function () {
    return (
        window.isSecureContext === true ||
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
    );
};


// ============================================================
// TEXT HELPERS
// ============================================================

function clean(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).replace(/\s+/g, " ").trim();
}

function same(a, b) {
    return clean(a).toLowerCase() === clean(b).toLowerCase();
}

// Compares names ignoring "City", "City of", "Municipality of",
// "Barangay" and "Brgy." so "Vigan" == "Vigan City" == "City of Vigan"
function normalizeName(value) {
    return clean(value)
        .toLowerCase()
        .replace(/^(?:city|municipality) of\s+/, "")
        .replace(/^(?:barangay|brgy\.?)\s+/, "")
        .replace(/\s+(?:city|municipality)$/, "")
        .trim();
}

function sameName(a, b) {
    const x = normalizeName(a);
    const y = normalizeName(b);
    return x !== "" && x === y;
}

function addUnique(list, value) {
    const text = clean(value);
    if (!text) {
        return;
    }
    if (!list.some(function (item) { return sameName(item, text); })) {
        list.push(text);
    }
}


// ============================================================
// PHILIPPINE REGION FILTER
// ============================================================

const PHILIPPINE_REGION_PATTERN =
    /\b(?:NCR|CAR|Ilocos Region|Cagayan Valley|Central Luzon|CALABARZON|MIMAROPA|Bicol Region|Western Visayas|Central Visayas|Eastern Visayas|Zamboanga Peninsula|Northern Mindanao|Davao Region|SOCCSKSARGEN|Caraga|Bangsamoro|BARMM|Cordillera Administrative Region)\b/i;

function isRegionName(value) {
    const text = clean(value);
    return PHILIPPINE_REGION_PATTERN.test(text) || /\bregion\b/i.test(text);
}


// ============================================================
// CITY WHITELIST  (THE ONLY PLACE THAT DECIDES "CITY")
// ============================================================

const CITY_WHITELIST = {
    "ilocos sur": ["vigan", "candon"],
    "ilocos norte": ["laoag", "batac"]
};

function isIlocosTargetProvince(value) {
    const text = clean(value).toLowerCase();
    return text === "ilocos sur" || text === "ilocos norte";
}

// Strips "City of", "Municipality of", trailing "City"/"Municipality"
function baseTownName(value) {
    return clean(value)
        .replace(/^City of\s+/i, "")
        .replace(/^Municipality of\s+/i, "")
        .replace(/\s+(?:City|Municipality)$/i, "")
        .trim();
}

function isIlocosCity(value, province) {

    const allowed = CITY_WHITELIST[clean(province).toLowerCase()];

    if (!allowed) {
        return false;
    }

    const base = baseTownName(value).toLowerCase();

    return base !== "" && allowed.indexOf(base) !== -1;
}

// Adds "City" ONLY for the four whitelisted cities.
// Everything else has any "City" suffix removed.
function enforceCityRule(town, province) {

    const base = baseTownName(town);

    if (!base) {
        return "";
    }

    return isIlocosCity(base, province) ? base + " City" : base;
}


// ============================================================
// PROVINCE
// ============================================================

function provinceFromText(text) {

    const value = String(text || "");

    if (/\bilocos sur\b/i.test(value)) {
        return "Ilocos Sur";
    }

    if (/\bilocos norte\b/i.test(value)) {
        return "Ilocos Norte";
    }

    return "";
}

function getRawProvince(address) {

    if (!address) {
        return "";
    }

    // province first, then state, then state_district.
    // county is accepted ONLY when it literally names an Ilocos province
    // (in some OSM data it holds the municipality instead).
    const candidates = [
        address.province,
        address.state,
        address.state_district,
        provinceFromText(address.county)
    ];

    for (let i = 0; i < candidates.length; i++) {

        const value = clean(candidates[i]);

        if (!value) {
            continue;
        }
        if (isRegionName(value)) {
            continue;
        }

        return value;
    }

    return "";
}

function getProvince(address) {
    return getRawProvince(address);
}


// ============================================================
// STREET NAME
// ============================================================

function getStreetName(address) {

    if (!address) {
        return "";
    }

    return (
        clean(address.road) ||
        clean(address.pedestrian) ||
        clean(address.footway) ||
        clean(address.path) ||
        clean(address.residential) ||
        clean(address.street)
    );
}


// ============================================================
// NATIONAL HIGHWAY
// ============================================================

function isNationalHighwayName(value) {

    const text = clean(value);

    if (!text) {
        return false;
    }

    return (
        /\bnational highway\b/i.test(text) ||
        /\bnational hi[- ]?way\b/i.test(text) ||
        /^n[- ]?\d+\b/i.test(text) ||
        /\bah26\b/i.test(text) ||
        /\bah\s*26\b/i.test(text) ||
        /\bmaharlika highway\b/i.test(text)
    );
}

function formatHighwayName(name, ref) {

    let highwayName = clean(name);
    const highwayRef = clean(ref);

    if (!highwayName && !highwayRef) {
        return "";
    }

    if (isNationalHighwayName(highwayName)) {
        highwayName = "National Highway";
    }

    if (highwayName && highwayRef && !same(highwayName, highwayRef)) {
        return highwayName + " (" + highwayRef + ")";
    }

    if (highwayName) {
        return highwayName;
    }

    return highwayRef;
}

function looksLikeStreet(value) {

    const text = clean(value);

    if (!text) {
        return false;
    }

    return /\b(?:road|rd\.?|street|st\.?|avenue|ave\.?|highway|hwy\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|corner|junction|way|route|rt\.?)\b/i
        .test(text);
}


// ============================================================
// KEYS THAT ARE NOT THE TOWN
// ============================================================

// Barangay-level and street-level address keys. NOTE: "county" is NOT
// listed: in some OSM data it holds the real municipality.
const SUB_MUNICIPAL_KEYS = [
    "barangay", "suburb", "village", "quarter", "neighbourhood",
    "hamlet", "city_district", "district", "road",
    "street", "pedestrian", "footway", "path", "residential"
];

// Address keys that may legitimately hold the town / city
const TOWN_KEYS = ["municipality", "town", "city", "county"];

function isSubMunicipalPart(part, address) {

    if (!address) {
        return false;
    }

    return SUB_MUNICIPAL_KEYS.some(function (key) {
        return sameName(part, address[key]);
    });
}

function isTownField(part, address) {

    if (!address) {
        return false;
    }

    return TOWN_KEYS.some(function (key) {
        return sameName(part, address[key]);
    });
}


// ============================================================
// TOWN FROM DISPLAY NAME
// ============================================================

// display_name runs specific -> general:
//   "Street, Barangay, Town/City, Province, Region, Postcode, Philippines"
// so the town is the part DIRECTLY BEFORE the province. Returns ""
// (never a guess) when that part is missing or looks like something else.
function townFromDisplayName(displayName, province, address, extraSkip) {

    if (!province) {
        return "";
    }

    const parts = String(displayName || "")
        .split(",")
        .map(clean)
        .filter(Boolean);

    let provinceIndex = -1;

    for (let i = parts.length - 1; i >= 0; i--) {
        if (sameName(parts[i], province)) {
            provinceIndex = i;
            break;
        }
    }

    if (provinceIndex < 1) {
        return "";
    }

    const part = parts[provinceIndex - 1];

    if (/^\d+$/.test(part)) return "";
    if (sameName(part, "Philippines")) return "";
    if (isRegionName(part)) return "";
    if (looksLikeStreet(part)) return "";

    // explicitly written as a barangay
    if (/^(?:barangay|brgy\.?)\s+\S/i.test(part)) return "";

    // barangay / street level, unless the address also lists it as a town field
    if (isSubMunicipalPart(part, address) && !isTownField(part, address)) {
        return "";
    }

    const skip = extraSkip || [];

    if (skip.some(function (item) { return sameName(part, item); })) {
        return "";
    }

    return enforceCityRule(part, province);
}


// ============================================================
// PICK TOWN  (VERIFIED, NEVER INVENTED)
// ============================================================

function pickTown(address, province, displayName, extraSkip) {

    if (!address) {
        return "";
    }

    const displayParts = String(displayName || "")
        .split(",")
        .map(clean)
        .filter(Boolean);

    // Candidate fields, most reliable first. "city" is last because
    // OSM sometimes fills it with a NEARBY place.
    const found = [];

    [address.municipality, address.town, address.city, address.county]
        .forEach(function (field) {

            const base = baseTownName(field);

            if (!base) {
                return;
            }
            if (province && sameName(base, province)) {
                return;
            }
            if (isRegionName(base)) {
                return;
            }

            addUnique(found, base);
        });

    // No display_name to verify against: use the API's own field order
    if (!displayParts.length) {
        return found.length ? enforceCityRule(found[0], province) : "";
    }

    // 1. structural: the part right before the province
    const anchored = townFromDisplayName(
        displayName,
        province,
        address,
        extraSkip
    );

    if (anchored) {
        return anchored;
    }

    // 2. a candidate field that is really part of display_name
    for (let i = 0; i < found.length; i++) {

        const isVerified = displayParts.some(function (part) {
            return sameName(part, found[i]);
        });

        if (isVerified) {
            return enforceCityRule(found[i], province);
        }
    }

    // 3. cannot be confirmed -> do not invent one
    return "";
}


// ============================================================
// BARANGAY
// ============================================================

// When true, a barangay that is ONLY a number or roman numeral keeps the
// word "Barangay" ("Barangay 3, Laoag City, Ilocos Norte") because a bare
// "3" or "III" is meaningless in an address. Set to false to always strip.
const KEEP_PREFIX_FOR_NUMBERED_BARANGAY = true;

// "Barangay X", "Brgy. X", "Brgy X", "Bgy. X", "Brg. X"
const BARANGAY_PREFIX_PATTERN = /^(?:barangay|brgy|bgy|brg)(?:\.\s*|\s+)/i;

// the prefix word on its own, with no name after it
const BARANGAY_WORD_ONLY_PATTERN = /^(?:barangay|brgy|bgy|brg)\.?$/i;

const ROMAN_NUMERAL_PATTERN =
    /^(?=[ivxlcdm]+$)m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i;

// Removes "Barangay" / "Brgy." (and a following "No." / "#" before a
// number) from the start of a name. Names without the prefix are returned
// unchanged.
function stripBarangayPrefix(value) {

    const text = clean(value);

    if (!text) {
        return "";
    }

    const stripped = text.replace(BARANGAY_PREFIX_PATTERN, "");

    if (stripped === text) {
        return text;
    }

    return stripped
        .replace(/^(?:no\.?|number|#)\s*(?=\d)/i, "")
        .trim();
}

// "3", "12-A", "III", "IV" - a label that means nothing without the word
function isNumberOnlyLabel(text) {

    const value = clean(text);

    if (!value) {
        return false;
    }

    if (/^\d+(?:[-\s]?[A-Za-z])?$/.test(value)) {
        return true;
    }

    return value.length <= 7 && ROMAN_NUMERAL_PATTERN.test(value);
}

// Final display name of a barangay: prefix removed (except for bare
// numbers, see KEEP_PREFIX_FOR_NUMBERED_BARANGAY).
function formatBarangayName(value) {

    const name = stripBarangayPrefix(value);

    if (!name || BARANGAY_WORD_ONLY_PATTERN.test(name)) {
        return "";
    }

    if (KEEP_PREFIX_FOR_NUMBERED_BARANGAY && isNumberOnlyLabel(name)) {
        return "Barangay " + name;
    }

    return name;
}

// Narrow road check for barangay candidates. looksLikeStreet() is too
// broad here: it also matches "way", "drive", "corner", "route", "st."
// anywhere, which wrongly rejected real barangay names.
function looksLikeRoadName(value) {

    const text = clean(value);

    if (!text) {
        return false;
    }

    return (
        /\b(?:road|rd|street|avenue|ave|highway|hwy|boulevard|blvd|junction|expressway|bypass)\b/i
            .test(text) ||
        /\bst\.?$/i.test(text)
    );
}

// trustLevel: 0 = guessed field (suburb / village / fallback)
//             1 = explicit barangay (address.barangay, "Barangay X")
//             2 = real barangay boundary (OSM admin polygon)
// A higher level may legitimately share a name with the town (level 1+)
// or with a street (level 2); level 0 may not.
function candidateIsBadBarangay(value, address, streetName, town, province, trustLevel) {

    const a = address || {};
    const level = Number(trustLevel) || 0;

    const raw = clean(value);
    const hasPrefix = BARANGAY_PREFIX_PATTERN.test(raw);
    const text = stripBarangayPrefix(raw);

    if (!text) {
        return true;
    }

    if (BARANGAY_WORD_ONLY_PATTERN.test(text)) {
        return true;
    }

    if (!/[A-Za-z0-9]/.test(text)) {
        return true;
    }

    // street / road
    if (level < 2 && sameName(text, streetName)) {
        return true;
    }

    const streetFields = [
        a.road,
        a.street,
        a.pedestrian,
        a.footway,
        a.path,
        a.residential
    ];

    for (let i = 0; i < streetFields.length; i++) {
        if (level < 2 && sameName(text, streetFields[i])) {
            return true;
        }
    }

    // house number / postcode (a plain number is allowed only when the
    // data wrote it as "Barangay 12")
    if (!hasPrefix) {

        const lower = text.toLowerCase();
        const house = clean(a.house_number).toLowerCase();
        const postcode = clean(a.postcode).toLowerCase();

        if (house && lower === house) {
            return true;
        }

        if (postcode && lower === postcode) {
            return true;
        }
    }

    // the same name as the town or province is a duplicate, not a barangay
    if (level < 1 && sameName(text, town)) {
        return true;
    }

    if (sameName(text, province)) {
        return true;
    }

    if (isRegionName(text)) {
        return true;
    }

    if (sameName(text, "Philippines")) {
        return true;
    }

    if (looksLikeRoadName(text)) {
        return true;
    }

    return false;
}

// Subdivisions, sitios, puroks ... are not barangays
function looksLikeSubdivision(value) {
    return /\b(?:subdivision|village|homes|heights|estates?|compound|purok|sitio|zone)\b/i
        .test(clean(value));
}

// A barangay is accepted ONLY when the data identifies it as one:
//   1. address.barangay
//   2. a display_name part written "Barangay X" / "Brgy. X"
//   3. address.suburb
//   4. address.village
// neighbourhood, quarter, street fields, house number and postcode are
// never used. suburb / village are skipped when they are really the town
// or look like a subdivision. Returns the display name with the
// "Barangay" prefix removed, or "" when no valid barangay exists.
function findBarangay(address, streetName, town, province, displayName) {

    if (!address) {
        return { name: "", level: 0 };
    }

    const candidates = [];

    // 1. explicit barangay field
    candidates.push({ value: address.barangay, trusted: true });

    // 2. explicit "Barangay X" / "Brgy. X" written in display_name
    String(displayName || "")
        .split(",")
        .map(clean)
        .filter(Boolean)
        .forEach(function (part) {

            if (/^(?:barangay|brgy|bgy|brg)(?:\.\s*|\s+)\S/i.test(part)) {
                candidates.push({ value: part, trusted: true });
            }
        });

    // 3 + 4. suburb, then village (only when appropriate, see below)
    candidates.push({ value: address.suburb, trusted: false });
    candidates.push({ value: address.village, trusted: false });

    for (let i = 0; i < candidates.length; i++) {

        const item = candidates[i];
        const raw = clean(item.value);

        if (!raw) {
            continue;
        }

        const hasPrefix = BARANGAY_PREFIX_PATTERN.test(raw);
        const stripped = stripBarangayPrefix(raw);

        const level = (item.trusted || hasPrefix) ? 1 : 0;

        if (
            candidateIsBadBarangay(raw, address, streetName, town, province, level)
        ) {
            continue;
        }

        if (!item.trusted && !hasPrefix) {

            // a subdivision / sitio / purok is not a barangay
            if (looksLikeSubdivision(stripped)) {
                continue;
            }

            // a municipality can be tagged as suburb / village in OSM
            if (isTownField(stripped, address)) {
                continue;
            }
        }

        const name = formatBarangayName(raw);

        if (name) {
            return { name: name, level: level };
        }
    }

    return { name: "", level: 0 };
}

// public API (unchanged): returns only the name
function getBarangay(address, streetName, town, province, displayName) {
    return findBarangay(address, streetName, town, province, displayName).name;
}


// ============================================================
// DISTANCE
// ============================================================

function distanceMeters(lat1, lon1, lat2, lon2) {

    const R = 6371000;

    const p1 = Number(lat1) * Math.PI / 180;
    const p2 = Number(lat2) * Math.PI / 180;
    const dp = (Number(lat2) - Number(lat1)) * Math.PI / 180;
    const dl = (Number(lon2) - Number(lon1)) * Math.PI / 180;

    const a =
        Math.sin(dp / 2) ** 2 +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {

    const distance = Number(meters);

    if (!Number.isFinite(distance)) {
        return "";
    }

    if (distance < 1000) {
        return Math.round(distance) + " m";
    }

    return (distance / 1000).toFixed(1) + " km";
}

function joinParts() {

    const parts = [];

    // duplicates are removed by exact name (ignoring only a "Barangay" /
    // "Brgy." prefix). "Candon" and "Candon City" are different parts.
    const keyOf = function (value) {
        return clean(value).toLowerCase().replace(/^(?:barangay|brgy\.?)\s+/, "");
    };

    for (let i = 0; i < arguments.length; i++) {

        const text = clean(arguments[i]);

        if (!text) {
            continue;
        }

        if (!parts.some(function (item) { return keyOf(item) === keyOf(text); })) {
            parts.push(text);
        }
    }

    return parts.join(", ");
}


// ============================================================
// FORMAT CITY + PROVINCE
// ============================================================

function formatCityTownProvince(address, displayName = "") {

    if (!address) {
        return "";
    }

    let province = getProvince(address);

    if (!province) {
        province = provinceFromText(displayName);
    }

    const cityTown = pickTown(address, province, displayName);

    let finalCity = enforceCityRule(cityTown, province);

    if (finalCity && province && same(finalCity, province)) {
        finalCity = "";
    }

    return joinParts(finalCity, province);
}


// ============================================================
// FETCH NOMINATIM  (cached + rate limited to ~1 request/second)
// ============================================================

let nominatimLastCall = 0;
let nominatimQueue = Promise.resolve();

function waitForNominatimSlot() {

    const run = nominatimQueue.then(function () {

        const wait = Math.max(0, nominatimLastCall + 1100 - Date.now());

        return new Promise(function (resolve) {
            setTimeout(resolve, wait);
        }).then(function () {
            nominatimLastCall = Date.now();
        });
    });

    nominatimQueue = run.catch(function () {});

    return run;
}

function nominatimCacheKey(latitude, longitude, zoom) {

    // Coarse lookups (zoom <= 12) round to 4 decimals (~11 m). The old
    // 3 decimals (~110 m) could return the neighbouring town's boundary
    // for points near a municipal border.
    const digits = Number(zoom) <= 12 ? 4 : 6;

    return (
        Number(latitude).toFixed(digits) + "," +
        Number(longitude).toFixed(digits) + "," + zoom
    );
}

function fetchNominatim(latitude, longitude, zoom = 18) {

    const key = nominatimCacheKey(latitude, longitude, zoom);

    if (nominatimCache[key]) {
        return nominatimCache[key];
    }

    const url =
        "https://nominatim.openstreetmap.org/reverse" +
        "?format=jsonv2" +
        "&lat=" + encodeURIComponent(latitude) +
        "&lon=" + encodeURIComponent(longitude) +
        "&zoom=" + encodeURIComponent(zoom) +
        "&addressdetails=1" +
        "&accept-language=en";

    const promise = waitForNominatimSlot()
        .then(function () {
            return fetch(url, {
                method: "GET",
                headers: { Accept: "application/json" }
            });
        })
        .then(function (response) {

            if (!response.ok) {
                throw new Error("Address lookup failed. HTTP " + response.status);
            }

            return response.json();
        })
        .then(function (data) {

            // Nominatim answers {"error": "..."} with HTTP 200 when nothing
            // is found. Never cache that as a valid (empty) address.
            if (!data || data.error) {
                throw new Error(
                    "Address lookup returned no result" +
                    (data && data.error ? ": " + data.error : ".")
                );
            }

            return data;
        })
        .catch(function (error) {
            // do not keep failed lookups in the cache
            delete nominatimCache[key];
            throw error;
        });

    nominatimCache[key] = promise;

    return promise;
}


// ============================================================
// FETCH NEARBY NATIONAL HIGHWAY (OVERPASS)
// ============================================================

async function fetchNearbyNationalHighway(latitude, longitude) {

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }

    const cacheKey = lat.toFixed(4) + "," + lon.toFixed(4);

    if (highwayCache[cacheKey] !== undefined) {
        return highwayCache[cacheKey];
    }

    const radius = 500;

    const query = `
        [out:json][timeout:10];
        way(around:${radius},${lat},${lon})[highway][name];
        out tags center;
    `;

    try {

        const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: query
            }
        );

        if (!response.ok) {
            throw new Error("Overpass HTTP " + response.status);
        }

        const data = await response.json();

        if (!data || !Array.isArray(data.elements)) {
            highwayCache[cacheKey] = null;
            return null;
        }

        const candidates = [];

        data.elements.forEach(function (element) {

            const tags = element.tags || {};
            const highwayType = clean(tags.highway).toLowerCase();
            const name = clean(tags.name);
            const ref = clean(tags.ref);

            if (!name && !ref) {
                return;
            }

            const isNational =
                isNationalHighwayName(name) ||
                isNationalHighwayName(ref);

            const isMajorRoad =
                highwayType === "trunk" ||
                highwayType === "primary";

            if (!isNational && !isMajorRoad) {
                return;
            }

            const roadName = formatHighwayName(name, ref);

            if (!roadName) {
                return;
            }

            let distance = 0;

            if (
                element.center &&
                Number.isFinite(Number(element.center.lat)) &&
                Number.isFinite(Number(element.center.lon))
            ) {
                distance = distanceMeters(
                    lat,
                    lon,
                    Number(element.center.lat),
                    Number(element.center.lon)
                );
            }

            candidates.push({
                name: roadName,
                distance: distance,
                highway: highwayType,
                ref: ref,
                isNational: isNational
            });
        });

        candidates.sort(function (a, b) {
            if (a.isNational && !b.isNational) return -1;
            if (!a.isNational && b.isNational) return 1;
            return a.distance - b.distance;
        });

        const result = candidates.length ? candidates[0] : null;

        highwayCache[cacheKey] = result;

        console.log("NEARBY NATIONAL HIGHWAY:", result);

        return result;

    } catch (error) {

        console.warn("National Highway lookup failed:", error);

        highwayCache[cacheKey] = null;

        return null;
    }
}


// ============================================================
// REAL ADMINISTRATIVE BOUNDARIES (OVERPASS is_in)
// ============================================================

const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
];

// POSTs an Overpass query, trying every server in turn. A server that
// times out, answers with an HTTP error, or answers 200 with a
// "runtime error" remark (overloaded) is skipped. Throws when all fail.
async function fetchOverpassJson(query, timeoutMs) {

    let lastError = new Error("No Overpass server answered.");

    for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {

        const controller =
            typeof AbortController === "function" ? new AbortController() : null;

        const timer = controller
            ? setTimeout(function () { controller.abort(); }, timeoutMs || 12000)
            : null;

        try {

            const response = await fetch(OVERPASS_ENDPOINTS[i], {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: query,
                signal: controller ? controller.signal : undefined
            });

            if (!response.ok) {
                throw new Error("Overpass HTTP " + response.status);
            }

            const data = await response.json();

            if (!data || !Array.isArray(data.elements)) {
                throw new Error("Overpass returned no element list.");
            }

            if (data.remark && /error|timed out|out of memory/i.test(String(data.remark))) {
                throw new Error("Overpass remark: " + data.remark);
            }

            return data;

        } catch (error) {

            lastError = error;

            console.warn("Overpass server failed:", OVERPASS_ENDPOINTS[i], error);

        } finally {

            if (timer) {
                clearTimeout(timer);
            }
        }
    }

    throw lastError;
}

function singleName(list) {
    return list.length === 1 ? list[0] : "";
}

// Asks OpenStreetMap which administrative polygons CONTAIN the point:
//   admin_level 4  = province
//   admin_level 6  = municipality / city
//   admin_level 10 = barangay
// Returns { ok, provinces[], towns[], barangays[], province, town,
// barangay }. "ok" is true only when the province polygon was found.
// Returns null when the request fails (callers then keep the normal
// Nominatim behaviour).
async function fetchAdminAreas(latitude, longitude) {

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }

    const cacheKey = lat.toFixed(5) + "," + lon.toFixed(5);

    if (adminCache[cacheKey] !== undefined) {
        return adminCache[cacheKey];
    }

    const query = `
        [out:json][timeout:15];
        is_in(${lat},${lon})->.a;
        area.a[boundary=administrative][admin_level];
        out tags;
    `;

    try {

        const data = await fetchOverpassJson(query, 12000);

        const provinces = [];
        const towns = [];
        const barangays = [];

        data.elements.forEach(function (element) {

            const tags = element.tags || {};
            const level = clean(tags.admin_level);
            const name = clean(tags.name) || clean(tags["name:en"]);

            if (!name) {
                return;
            }

            if (level === "4") {
                addUnique(provinces, name);
            } else if (level === "6") {
                addUnique(towns, baseTownName(name));
            } else if (level === "10") {
                addUnique(barangays, name);
            }
        });

        const result = {
            ok: provinces.length > 0,
            provinces: provinces,
            towns: towns,
            barangays: barangays,
            province: singleName(provinces),
            town: singleName(towns),
            barangay: singleName(barangays)
        };

        console.log("ADMIN AREAS:", result);

        // an empty answer may be transient: only cache useful results
        if (result.ok) {
            adminCache[cacheKey] = result;
        }

        return result;

    } catch (error) {

        console.warn("Admin boundary lookup failed:", error);

        return null;
    }
}

// Decides the town using the real boundaries:
//   - exactly one municipality / city polygon -> that name wins
//   - boundaries answered but NO municipality polygon -> a whitelisted
//     city (Vigan, Candon, Laoag, Batac) is unconfirmed, so it is dropped
//   - several polygons overlap, or no boundary data -> keep the lookup result
function adminTownFor(admin, town, province) {

    if (!admin || !admin.ok) {
        return town;
    }

    if (admin.towns.length === 1) {
        return admin.towns[0];
    }

    if (admin.towns.length === 0) {
        return isIlocosCity(town, province) ? "" : town;
    }

    // several overlapping polygons: the lookup town is kept only when one
    // of them really is that town; otherwise it is unconfirmed -> empty
    // (the zoom-10 lookup may still fill it in)
    const match = admin.towns.find(function (name) {
        return sameName(name, town);
    });

    return match || "";
}

// The barangay from the real boundary polygons (admin_level 10).
//   - polygons that are clearly not a barangay (region, road ...) are ignored
//   - exactly one usable polygon -> that name (a polygon is authoritative:
//     it is NOT rejected for "Village" / "Zone" in its name, or for sharing
//     a name with a street or the town)
//   - several overlapping polygons -> only the one the address data also
//     names; otherwise nothing is guessed
function pickAdminBarangay(admin, address, streetName, town, province, displayName) {

    if (!admin || !admin.ok || !admin.barangays || !admin.barangays.length) {
        return "";
    }

    const usable = admin.barangays.filter(function (name) {
        return !candidateIsBadBarangay(name, address, streetName, town, province, 2);
    });

    if (usable.length === 1) {
        return formatBarangayName(usable[0]);
    }

    if (usable.length > 1) {

        const own = getBarangay(address, streetName, town, province, displayName);

        const match = usable.find(function (name) {
            return sameName(name, own);
        });

        return match ? formatBarangayName(match) : "";
    }

    return "";
}


// ============================================================
// BARANGAY FALLBACK LOOKUP (zoom 14)
// ============================================================

// Trusted only when it is a real administrative boundary of type
// suburb / village, in the same province (and town, unless the town was
// already confirmed by real boundaries), and its name passes the normal
// barangay validation. Anything else returns "".
async function fetchBarangayFallback(
    latitude,
    longitude,
    town,
    province,
    streetName,
    townVerified
) {

    try {

        const data = await fetchNominatim(latitude, longitude, 14);

        if (!data) {
            return "";
        }

        const category = clean(data.category || data.class).toLowerCase();
        const type = clean(data.type).toLowerCase();
        const addressType = clean(data.addresstype).toLowerCase();

        if (category !== "boundary" || type !== "administrative") {
            return "";
        }

        if (addressType !== "suburb" && addressType !== "village") {
            return "";
        }

        const fbAddress = data.address || {};
        const fbDisplay = clean(data.display_name);

        let fbProvince = getProvince(fbAddress);

        if (!fbProvince && fbDisplay) {
            fbProvince = provinceFromText(fbDisplay);
        }

        // must be the same province
        if (province && fbProvince && !sameName(province, fbProvince)) {
            return "";
        }

        // must be the same town (skipped when the real boundaries already
        // confirmed the town: the lookup's own town can be a nearby city)
        if (!townVerified) {

            const fbTown = pickTown(fbAddress, fbProvince || province, fbDisplay);

            if (town && fbTown && !sameName(town, fbTown)) {
                return "";
            }
        }

        const name = clean(data.name);

        if (!name) {
            return "";
        }

        if (candidateIsBadBarangay(name, fbAddress, streetName, town, province)) {
            return "";
        }

        if (
            !BARANGAY_PREFIX_PATTERN.test(name) &&
            looksLikeSubdivision(name)
        ) {
            return "";
        }

        if (!BARANGAY_PREFIX_PATTERN.test(name) && isTownField(name, fbAddress)) {
            return "";
        }

        return formatBarangayName(name);

    } catch (error) {

        console.warn("Barangay fallback lookup failed:", error);

        return "";
    }
}


// ============================================================
// RESOLVE ADDRESS
// ============================================================

// options.barangayFallback = false skips the extra zoom-14 lookup
// (used for the offset points of the nearby-address list).
// options.admin = result of fetchAdminAreas() for the GPS point (or null
// when it failed). When undefined, resolveAddress fetches it itself.
async function resolveAddress(latitude, longitude, options) {

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error("Invalid coordinates.");
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error("Coordinates are outside valid range.");
    }

    const useBarangayFallback =
        !options || options.barangayFallback !== false;

    const cacheKey = lat.toFixed(6) + "," + lon.toFixed(6);

    if (reverseGeocodeCache[cacheKey] !== undefined) {
        return reverseGeocodeCache[cacheKey];
    }

    // DETAILED LOOKUP (throws on error / empty result, so nothing
    // empty is ever cached)
    const data = await fetchNominatim(lat, lon, 18);

    const address = data && data.address ? data.address : {};
    const displayName = clean(data && data.display_name);

    console.log("RAW NOMINATIM ADDRESS:", address);
    console.log("RAW NOMINATIM DISPLAY NAME:", displayName);

    // PROVINCE (fallback: read it from display_name)
    let province = getProvince(address);

    if (!province && displayName) {
        province = provinceFromText(displayName);
    }

    // TOWN / CITY (verified, never invented)
    let town = pickTown(address, province, displayName);

    // STREET
    let streetName = getStreetName(address);

    // NATIONAL HIGHWAY (Ilocos Sur / Norte only)
    let nationalHighway = null;

    if (isIlocosTargetProvince(province)) {
        try {
            nationalHighway = await fetchNearbyNationalHighway(lat, lon);
        } catch (error) {
            console.warn("Highway lookup failed:", error);
        }
    }

    if (streetName && isNationalHighwayName(streetName)) {

        streetName = formatHighwayName(streetName, address.ref);

    } else if (nationalHighway && nationalHighway.isNational) {

        streetName = nationalHighway.name;
    }

    // HOUSE NUMBER
    const houseNumber = clean(address.house_number);

    let street = streetName;

    if (street && houseNumber && !isNationalHighwayName(street)) {
        street = houseNumber + " " + streetName;
    }

    // REAL BOUNDARIES (Ilocos Sur / Norte only). Nominatim can list a
    // NEARBY city as the town; the polygons that really contain the
    // point decide.
    let admin = null;

    if (isIlocosTargetProvince(province)) {

        if (options && options.admin !== undefined) {
            admin = options.admin;
        } else {
            admin = await fetchAdminAreas(lat, lon);
        }

        // boundaries of another province -> not for this point
        if (admin && admin.province && !sameName(admin.province, province)) {
            console.warn("Admin boundary province mismatch, ignored:", admin.province, province);
            admin = null;
        }
    }

    const adminTown = adminTownFor(admin, town, province);

    if (adminTown !== town && !sameName(adminTown, town)) {
        console.log("Town set by real boundaries:", town || "(none)", "->", adminTown || "(none)");
    }

    town = adminTown;

    const townConfirmed = !!(admin && admin.ok && admin.towns.length === 1);

    // BARANGAY (only when the data explicitly identifies one; prefix
    // already removed). The real barangay polygon is preferred, then
    // address.barangay / "Barangay X" / suburb / village.
    let barangay = pickAdminBarangay(
        admin,
        address,
        streetName,
        town,
        province,
        displayName
    );

    let barangayLevel = barangay ? 2 : 0;

    if (!barangay) {

        const found = findBarangay(address, streetName, town, province, displayName);

        barangay = found.name;
        barangayLevel = found.level;
    }

    // COARSE LOOKUP (zoom 10 = real admin boundary).
    // A whitelisted city (Vigan, Candon, Laoag, Batac) is kept ONLY when
    // the real boundaries confirmed it. Otherwise this lookup must confirm
    // it. If it cannot (request failed, or no usable answer) the town is
    // left EMPTY: a missing town is better than a wrong city.
    const cityNeedsConfirmation =
        !townConfirmed &&
        isIlocosTargetProvince(province) &&
        isIlocosCity(town, province);

    const needsCoarse = !town || !province || cityNeedsConfirmation;

    if (needsCoarse) {

        let coarseTown = "";

        try {

            const coarseData = await fetchNominatim(lat, lon, 10);

            const coarseAddress =
                coarseData && coarseData.address ? coarseData.address : {};

            const coarseDisplay = clean(coarseData && coarseData.display_name);

            if (!province) {
                province = getProvince(coarseAddress);
            }

            if (!province && coarseDisplay) {
                province = provinceFromText(coarseDisplay);
            }

            coarseTown = pickTown(coarseAddress, province, coarseDisplay);

            // The real boundaries show NO municipality polygon here, so a
            // whitelisted city from the coarse lookup cannot be confirmed.
            if (
                coarseTown &&
                admin &&
                admin.ok &&
                admin.towns.length === 0 &&
                isIlocosCity(coarseTown, province)
            ) {
                console.log("Coarse city rejected (not confirmed by boundaries):", coarseTown);
                coarseTown = "";
            }

        } catch (error) {

            console.warn("Coarse lookup failed:", error);

            coarseTown = "";
        }

        if (cityNeedsConfirmation) {

            // confirmed (same city), corrected (another town), or empty
            if (!sameName(coarseTown, town)) {
                console.log("City not confirmed:", town, "->", coarseTown || "(none)");
            }

            town = coarseTown;

        } else if (!town) {

            town = coarseTown;

        } else if (
            isIlocosTargetProvince(province) &&
            isIlocosCity(town, province) &&
            coarseTown &&
            !sameName(coarseTown, town) &&
            !sameName(coarseTown, province)
        ) {

            // province was only learned from the coarse lookup
            console.log("City corrected:", town, "->", coarseTown);

            town = coarseTown;
        }
    }

    // FINAL CITY NORMALIZATION (whitelist decides "City")
    town = enforceCityRule(town, province);

    // BARANGAY FALLBACK (zoom 14, real boundary containing the point)
    if (!barangay && town && useBarangayFallback) {
        barangay = await fetchBarangayFallback(
            lat,
            lon,
            town,
            province,
            streetName,
            townConfirmed
        );
    }

    // FINAL DUPLICATE CHECK
    if (town && province && sameName(town, province)) {
        province = "";
    }

    // a guessed barangay (level 0) can never repeat the town; an explicit
    // barangay or a real boundary may share the town's name
    if (barangay && town && barangayLevel < 1 && sameName(barangay, town)) {
        barangay = "";
    }

    if (barangay && province && sameName(barangay, province)) {
        barangay = "";
    }

    // RESULT COORDINATES
    // latitude/longitude = the OSM feature that was matched
    // queryLatitude/queryLongitude = the point that was actually asked for
    const resultLatitude = Number(data && data.lat);
    const resultLongitude = Number(data && data.lon);

    const finalLatitude =
        Number.isFinite(resultLatitude) ? resultLatitude : lat;

    const finalLongitude =
        Number.isFinite(resultLongitude) ? resultLongitude : lon;

    const result = {

        street: street,
        barangay: barangay,
        town: town,
        province: province,
        postcode: clean(address.postcode),
        displayName: displayName,
        latitude: finalLatitude,
        longitude: finalLongitude,
        queryLatitude: lat,
        queryLongitude: lon,

        distance: distanceMeters(lat, lon, finalLatitude, finalLongitude),

        osmType: clean(data && data.type),
        osmClass: clean(data && data.class),

        nationalHighway: nationalHighway ? nationalHighway.name : "",
        nationalHighwayDistance: nationalHighway ? nationalHighway.distance : null
    };

    // Never cache a result that was computed WITHOUT boundary data (Ilocos
    // only): the next call must try again instead of repeating a town that
    // could not be verified.
    const boundaryAnswered =
        !isIlocosTargetProvince(province) || !!(admin && admin.ok);

    if (boundaryAnswered) {
        reverseGeocodeCache[cacheKey] = result;
    }

    console.log("RESOLVED ADDRESS:", result);
    console.log("FORMATTED LOCATION:", makeDefaultAddress(result));

    return result;
}


// ============================================================
// ADDRESS FORMATS
// (every builder re-applies the city rule, so "City" can never
//  slip through from cached or saved values)
// ============================================================

// Barangay, Town/City, Province
function makeDefaultAddress(address) {

    if (!address) {
        return "";
    }

    return joinParts(
        address.barangay,
        enforceCityRule(address.town, address.province),
        address.province
    );
}

// Street / National Highway, Barangay, Town/City, Province
function makeStreetAddress(address) {

    if (!address) {
        return "";
    }

    return joinParts(
        address.street,
        address.barangay,
        enforceCityRule(address.town, address.province),
        address.province
    );
}

function makeFullAddress(address) {

    if (!address) {
        return "";
    }

    return joinParts(
        address.street,
        address.barangay,
        enforceCityRule(address.town, address.province),
        address.province,
        address.postcode
    );
}


// ============================================================
// REVERSE GEOCODE
// ============================================================

async function reverseGeocode(latitude, longitude) {

    try {

        const address = await resolveAddress(latitude, longitude);

        const result = makeDefaultAddress(address);

        console.log("FORMATTED LOCATION:", result);

        return result;

    } catch (error) {

        console.error("reverseGeocode failed:", error);

        return "";
    }
}

async function reverseGeocodePhone(latitude, longitude) {
    return reverseGeocode(latitude, longitude);
}


// ============================================================
// OFFSET COORDINATE
// ============================================================

function offsetCoordinate(latitude, longitude, metersNorth, metersEast) {

    const lat = Number(latitude);
    const lon = Number(longitude);

    const latRadians = lat * Math.PI / 180;

    const dLat = metersNorth / 111320;

    const dLon =
        metersEast /
        (111320 * Math.max(0.1, Math.cos(latRadians)));

    return {
        latitude: lat + dLat,
        longitude: lon + dLon
    };
}


// ============================================================
// CANDIDATE LABEL
// ============================================================

function candidateLabel(address) {

    // The already-verified parts are used as they are. The town is NOT
    // rebuilt from the raw display_name (that is where a nearby city
    // could sneak back in).
    return (
        makeDefaultAddress(address) ||
        makeStreetAddress(address) ||
        clean(address.displayName)
    );
}


// ============================================================
// ADD NEARBY CANDIDATE
// ============================================================

function addNearbyCandidate(
    list,
    address,
    originalLatitude,
    originalLongitude,
    isExact = false
) {

    if (!address) {
        return;
    }

    const label = candidateLabel(address);

    if (!label) {
        return;
    }

    let latitude = Number(address.latitude);
    let longitude = Number(address.longitude);

    // The "current location" option must keep the REAL point that was
    // asked for (phone GPS), not the coordinates of the OSM feature that
    // happened to match. Otherwise re-selecting it moves the coordinates.
    if (isExact) {
        latitude = Number(originalLatitude);
        longitude = Number(originalLongitude);
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
    }

    const distance = isExact
        ? 0
        : distanceMeters(originalLatitude, originalLongitude, latitude, longitude);

    if (!isExact && distance > 500) {
        return;
    }

    const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();

    const existing = list.find(function (item) {
        return (
            item.normalized === normalized ||
            (
                Math.abs(item.latitude - latitude) < 0.00001 &&
                Math.abs(item.longitude - longitude) < 0.00001
            )
        );
    });

    if (existing) {

        if (distance < existing.distance) {
            existing.latitude = latitude;
            existing.longitude = longitude;
            existing.distance = distance;
            existing.address = address;
            existing.isExact = isExact || existing.isExact;
        }

        return;
    }

    list.push({
        value: label,
        latitude: latitude,
        longitude: longitude,
        distance: distance,
        address: address,
        normalized: normalized,
        isExact: isExact
    });
}


// ============================================================
// GET NEARBY ADDRESS OPTIONS
// ============================================================

function sortNearby(list) {

    return list.slice().sort(function (a, b) {
        if (a.isExact && !b.isExact) return -1;
        if (!a.isExact && b.isExact) return 1;
        return a.distance - b.distance;
    });
}

// onProgress(partialList) is called after every resolved point with the
// candidates found so far (sorted), so the dropdown can fill in while
// the rest of the lookups are still running.
async function getNearbyAddressOptions(latitude, longitude, onProgress) {

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return [];
    }

    const cacheKey = lat.toFixed(6) + "," + lon.toFixed(6);

    if (nearbyAddressCache[cacheKey]) {
        return nearbyAddressCache[cacheKey];
    }

    const results = [];

    const points = [
        { latitude: lat, longitude: lon, exact: true },
        offsetCoordinate(lat, lon, 35, 0),
        offsetCoordinate(lat, lon, -35, 0),
        offsetCoordinate(lat, lon, 0, 35),
        offsetCoordinate(lat, lon, 0, -35),
        offsetCoordinate(lat, lon, 25, 25),
        offsetCoordinate(lat, lon, 25, -25),
        offsetCoordinate(lat, lon, -25, 25),
        offsetCoordinate(lat, lon, -25, -25)
    ];

    // Real municipality / barangay boundaries of the GPS point. Fetched
    // ONCE and shared with the offset points (all within about 35 m), so
    // every option gets the same, correct town. null = lookup failed.
    let admin = null;

    try {
        admin = await fetchAdminAreas(lat, lon);
    } catch (error) {
        console.warn("Admin boundary lookup failed:", error);
        admin = null;
    }

    // Sequential on purpose: fetchNominatim already spaces requests
    // about 1.1 s apart to respect the Nominatim usage policy.
    for (let i = 0; i < points.length; i++) {

        const point = points[i];

        try {

            // the extra barangay lookup runs only for the real GPS point
            const address = await resolveAddress(
                point.latitude,
                point.longitude,
                {
                    barangayFallback: point.exact === true,
                    admin: admin
                }
            );

            addNearbyCandidate(results, address, lat, lon, point.exact === true);

            if (typeof onProgress === "function" && results.length) {
                try {
                    onProgress(sortNearby(results));
                } catch (error) {
                    console.warn("Progress callback failed:", error);
                }
            }

        } catch (error) {
            console.warn("Nearby address lookup failed:", error);
        }
    }

    const sorted = sortNearby(results);

    // never cache an empty list, nor an Ilocos list built without boundary
    // data (a transient failure would stick)
    const needsBoundaries = sorted.some(function (item) {
        return item.address && isIlocosTargetProvince(item.address.province);
    });

    if (sorted.length && (!needsBoundaries || (admin && admin.ok))) {
        nearbyAddressCache[cacheKey] = sorted;
    }

    console.log("NEARBY LOCATIONS:", sorted);

    return sorted;
}


// ============================================================
// BUILD ADDRESS OPTIONS
// ============================================================

function buildAddressOptionsFromNearby(nearby, originalLatitude, originalLongitude) {

    const options = [];
    const seen = new Set();

    for (let i = 0; i < nearby.length; i++) {

        const item = nearby[i];

        const value = clean(item.value);

        if (!value) {
            continue;
        }

        const key = value.toLowerCase().trim();

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);

        options.push({
            label: item.isExact
                ? "Current location"
                : formatDistance(item.distance) + " nearby",
            value: value,
            latitude: item.latitude,
            longitude: item.longitude,
            distance: item.distance,
            isExact: item.isExact === true
        });
    }

    // ALTERNATE CURRENT LOCATION FORMATS (each one is labelled, so the
    // tooltip says what is different instead of "Current location" x4)
    const exact = nearby.find(function (item) { return item.isExact; });

    if (exact && exact.address) {

        const address = exact.address;

        const alternate = [
            {
                label: "Current location (with street)",
                value: makeStreetAddress(address)
            },
            {
                label: "Current location (town and province)",
                value: joinParts(
                    enforceCityRule(address.town, address.province),
                    address.province
                )
            },
            {
                label: "Current location (full, with postcode)",
                value: makeFullAddress(address)
            }
        ];

        for (let i = 0; i < alternate.length; i++) {

            const value = clean(alternate[i].value);

            if (!value) {
                continue;
            }

            const key = value.toLowerCase();

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            options.push({
                label: alternate[i].label,
                value: value,
                latitude: Number(originalLatitude),
                longitude: Number(originalLongitude),
                distance: 0,
                isExact: true,
                isAlternate: true
            });
        }
    }

    // keep the list short and readable (exact first, then nearest)
    if (options.length > MAX_ADDRESS_OPTIONS) {
        options.length = MAX_ADDRESS_OPTIONS;
    }

    return options;
}


// ============================================================
// GET ADDRESS OPTIONS
// ============================================================

// onProgress(options) receives the dropdown options built from the
// candidates found so far.
async function getAddressOptions(latitude, longitude, onProgress) {

    const nearby = await getNearbyAddressOptions(
        latitude,
        longitude,
        typeof onProgress === "function"
            ? function (partial) {
                onProgress(
                    buildAddressOptionsFromNearby(partial, latitude, longitude)
                );
            }
            : null
    );

    const options = buildAddressOptionsFromNearby(nearby, latitude, longitude);

    if (!options.length) {

        try {

            const exact = await resolveAddress(latitude, longitude);

            const value =
                makeDefaultAddress(exact) || clean(exact.displayName);

            if (value) {
                options.push({
                    label: "Current location",
                    value: value,
                    latitude: Number(latitude),
                    longitude: Number(longitude),
                    distance: 0,
                    isExact: true
                });
            }

        } catch (error) {
            console.error("Exact address fallback failed:", error);
        }
    }

    return options;
}


// ============================================================
// SET ADDRESS CHOICES
// ============================================================

// Text shown for an option in the dropdown. option.value is NEVER
// decorated: it is always the plain address.
function addressOptionText(option) {

    const value = option.value;

    if (!DECORATE_ADDRESS_OPTIONS) {
        return value;
    }

    if (option.isExact) {
        return "\uD83D\uDCCD " + value;
    }

    const distance = formatDistance(option.distance);

    return distance ? value + "  (" + distance + ")" : value;
}

function setAddressChoices(
    options,
    preferredValue,
    preferredLatitude,
    preferredLongitude
) {

    const select = document.getElementById("address");

    if (!select || select.tagName !== "SELECT" || !options || !options.length) {
        return "";
    }

    let chosenIndex = 0;

    if (preferredValue) {

        const index = options.findIndex(function (option) {
            return same(option.value, preferredValue);
        });

        if (index >= 0) {
            chosenIndex = index;
        }
    }

    select.innerHTML = "";

    options.forEach(function (option, index) {

        const element = document.createElement("option");

        element.value = option.value;
        element.textContent = addressOptionText(option);
        element.title = option.label || "Address";

        element.dataset.latitude = String(option.latitude ?? "");
        element.dataset.longitude = String(option.longitude ?? "");
        element.dataset.distance = String(option.distance ?? "");
        element.dataset.exact = option.isExact ? "true" : "false";

        if (index === chosenIndex) {
            element.selected = true;
        }

        select.appendChild(element);
    });

    select.selectedIndex = chosenIndex;

    const selected = options[chosenIndex];

    const selectedValue = selected ? selected.value : "";

    if (selected) {

        const latitude = Number(selected.latitude);
        const longitude = Number(selected.longitude);

        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            updateCoordinateField(latitude, longitude);
        }

    } else if (
        preferredLatitude !== undefined &&
        preferredLongitude !== undefined
    ) {
        updateCoordinateField(preferredLatitude, preferredLongitude);
    }

    console.log("ADDRESS CHOICES:", options);
    console.log("SELECTED ADDRESS:", selectedValue);

    return selectedValue;
}

// Used while the nearby lookups are still running. Skips outdated
// requests, never rebuilds a dropdown the person has open, and keeps a
// choice the person already made.
function showProgressAddressChoices(options, requestId) {

    if (requestId !== addressRequestCounter) {
        return;
    }

    const select = document.getElementById("address");

    if (!select || select.tagName !== "SELECT" || !options || !options.length) {
        return;
    }

    if (document.activeElement === select) {
        return;
    }

    const kept = clean(select.value);

    const value = setAddressChoices(options, kept);

    if (value) {
        window.TimeMark.location.phoneAddress = value;
    }
}


// ============================================================
// ADDRESS DROPDOWN HELPERS
// ============================================================

function clearAddressDropdown() {

    const select = document.getElementById("address");

    if (!select || select.tagName !== "SELECT") {
        return;
    }

    select.innerHTML = "";

    const option = document.createElement("option");

    option.value = "";
    option.textContent = "Select address";
    option.selected = true;

    select.appendChild(option);
}

function addAddressOption(address, selectImmediately = true) {

    const select = document.getElementById("address");

    if (!select || select.tagName !== "SELECT") {
        return;
    }

    const text = clean(address);

    if (!text) {
        return;
    }

    let existingOption = Array.from(select.options).find(function (option) {
        return same(option.value, text);
    });

    if (!existingOption) {

        existingOption = document.createElement("option");

        existingOption.value = text;
        existingOption.textContent = text;

        select.appendChild(existingOption);
    }

    if (selectImmediately) {
        select.value = text;
    }
}

function setAddressDropdown(address) {

    const select = document.getElementById("address");

    if (!select || select.tagName !== "SELECT") {
        return;
    }

    const text = clean(address);

    if (!text) {
        clearAddressDropdown();
        return;
    }

    select.innerHTML = "";

    const option = document.createElement("option");

    option.value = text;
    option.textContent = text;
    option.selected = true;

    select.appendChild(option);
}

function setAddressStatus(message) {

    const select = document.getElementById("address");

    if (!select || select.tagName !== "SELECT") {
        return;
    }

    select.innerHTML = "";

    const option = document.createElement("option");

    option.value = "";
    option.textContent = message;
    option.disabled = true;
    option.selected = true;

    select.appendChild(option);
}

function setAddressError(message) {
    setAddressStatus(message);
}


// ============================================================
// FORMAT COORDINATE
// OUTPUT: 17.582397° N, 120.389073° E
// ============================================================

function formatPhoneCoordinate(latitude, longitude) {

    if (
        latitude === null ||
        latitude === undefined ||
        longitude === null ||
        longitude === undefined
    ) {
        return "";
    }

    if (String(latitude).trim() === "" || String(longitude).trim() === "") {
        return "";
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return "";
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return "";
    }

    return (
        Math.abs(lat).toFixed(6) + "° " + (lat >= 0 ? "N" : "S") +
        ", " +
        Math.abs(lon).toFixed(6) + "° " + (lon >= 0 ? "E" : "W")
    );
}

function normalizePhoneCoordinate(value) {

    if (value === null || value === undefined) {
        return "";
    }

    const text = String(value).trim();

    if (!text) {
        return "";
    }

    if (/[NS]/i.test(text) && /[EW]/i.test(text)) {
        return text.replace(/\s+/g, " ").trim();
    }

    const parts = text.replace(/°/g, "").split(",");

    if (parts.length !== 2) {
        return text;
    }

    return formatPhoneCoordinate(
        Number(parts[0].trim()),
        Number(parts[1].trim())
    );
}

function updateCoordinateField(latitude, longitude) {

    const input = document.getElementById("coordinate");

    if (!input) {
        return;
    }

    const coordinate = formatPhoneCoordinate(latitude, longitude);

    input.value = coordinate || "Not available";
}


// ============================================================
// UPDATE TIMEMARK PHONE LOCATION
// ============================================================

function updateTimeMarkPhoneLocation(locationData) {

    if (!locationData) {
        return;
    }

    const latitude = Number(locationData.latitude);
    const longitude = Number(locationData.longitude);
    const accuracy = locationData.accuracy;

    const coordinate =
        locationData.coordinate ||
        formatPhoneCoordinate(latitude, longitude);

    const address = locationData.address || "";

    window.TimeMark.location.phoneLatitude = latitude;
    window.TimeMark.location.phoneLongitude = longitude;
    window.TimeMark.location.phoneAccuracy = accuracy;
    window.TimeMark.location.phoneAddress = address;

    if (typeof window.getCurrentUploadedPhoto !== "function") {
        return;
    }

    const currentPhoto = window.getCurrentUploadedPhoto();

    if (!currentPhoto) {
        return;
    }

    // NEVER OVERWRITE MANUAL GPS
    if (currentPhoto.manuallyAdjusted === true) {
        console.log("Manual GPS detected. Phone GPS will not overwrite it.");
        return;
    }

    currentPhoto.latitude = latitude;
    currentPhoto.longitude = longitude;
    currentPhoto.accuracy = accuracy;
    currentPhoto.coordinate = coordinate;
    currentPhoto.address = address;
    currentPhoto.gpsSource = "phone";

    // SAVE ORIGINAL PHONE GPS
    if (
        currentPhoto.originalLatitude === null ||
        currentPhoto.originalLatitude === undefined
    ) {
        currentPhoto.originalLatitude = latitude;
        currentPhoto.originalLongitude = longitude;
        currentPhoto.originalAccuracy = accuracy;
        currentPhoto.originalCoordinate = coordinate;
        currentPhoto.originalAddress = address;

    } else if (
        !currentPhoto.originalAddress &&
        address &&
        Number(currentPhoto.originalLatitude) === latitude &&
        Number(currentPhoto.originalLongitude) === longitude
    ) {
        // The first save happens before the address is resolved, so the
        // original address would stay empty. Fill it in once it arrives,
        // but only for the SAME coordinates.
        currentPhoto.originalAddress = address;
    }

    if (typeof window.updateCurrentPhotoLocation === "function") {
        window.updateCurrentPhotoLocation(currentPhoto);
    }
}


// ============================================================
// HANDLE ADDRESS DROPDOWN CHANGE
// ============================================================

function handleAddressDropdownChange(event) {

    const select = event.target;

    if (!select || select.tagName !== "SELECT") {
        return;
    }

    const option = select.options[select.selectedIndex];

    const value = clean(select.value);

    if (!value) {
        return;
    }

    const selectedLatitude = Number(option && option.dataset.latitude);
    const selectedLongitude = Number(option && option.dataset.longitude);

    const hasCoordinates =
        Number.isFinite(selectedLatitude) &&
        Number.isFinite(selectedLongitude);

    const currentPhoto =
        typeof window.getCurrentUploadedPhoto === "function"
            ? window.getCurrentUploadedPhoto()
            : null;

    const isManual = currentPhoto && currentPhoto.manuallyAdjusted === true;

    // ONLY MOVE GPS WHEN NOT MANUAL
    if (hasCoordinates && !isManual) {
        updateCoordinateField(selectedLatitude, selectedLongitude);
    }

    window.TimeMark.location.phoneAddress = value;

    if (currentPhoto) {

        // ADDRESS ALWAYS SAVED
        currentPhoto.address = value;

        if (hasCoordinates && !isManual) {

            currentPhoto.latitude = selectedLatitude;
            currentPhoto.longitude = selectedLongitude;

            currentPhoto.coordinate = formatPhoneCoordinate(
                selectedLatitude,
                selectedLongitude
            );

            currentPhoto.gpsSource =
                option.dataset.exact === "true"
                    ? "phone"
                    : "address-selection";
        }

        if (typeof window.updateCurrentPhotoLocation === "function") {
            window.updateCurrentPhotoLocation(currentPhoto);
        }
    }

    if (
        window.TimeMark &&
        typeof window.TimeMark.render === "function"
    ) {
        window.TimeMark.render();
    }

    window.dispatchEvent(
        new CustomEvent("timemarkaddresschanged", {
            detail: {
                address: value,
                latitude: hasCoordinates ? selectedLatitude : null,
                longitude: hasCoordinates ? selectedLongitude : null,
                coordinate: hasCoordinates
                    ? formatPhoneCoordinate(selectedLatitude, selectedLongitude)
                    : ""
            }
        })
    );
}


// ============================================================
// UPDATE ADDRESS FROM COORDINATES
// ============================================================

async function updateAddressFromCoordinates(latitude, longitude) {

    const select = document.getElementById("address");

    if (!select || select.tagName !== "SELECT") {
        console.warn("updateAddressFromCoordinates: #address must be a <select>.");
        return "";
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        addressRequestCounter++;
        clearAddressDropdown();
        return "";
    }

    // newest request wins; older, slower ones are ignored
    const requestId = ++addressRequestCounter;

    // the previous point's address must not stay attached to new coordinates
    window.TimeMark.location.phoneAddress = "";

    updateCoordinateField(lat, lon);

    setAddressStatus("Finding your address...");

    try {

        const options = await getAddressOptions(lat, lon, function (partial) {
            showProgressAddressChoices(partial, requestId);
        });

        if (requestId !== addressRequestCounter) {
            return "";
        }

        if (!options.length) {
            setAddressError("Address unavailable");
            return "";
        }

        // keep a choice the person made while the list was loading
        const address = setAddressChoices(options, clean(select.value));

        window.TimeMark.location.phoneAddress = address;

        return address;

    } catch (error) {

        console.error("updateAddressFromCoordinates failed:", error);

        if (requestId === addressRequestCounter) {
            setAddressError("Address unavailable");
        }

        return "";
    }
}

async function loadAddressDropdown(latitude, longitude, preferredValue = "") {

    const requestId = ++addressRequestCounter;

    try {

        const options = await getAddressOptions(
            latitude,
            longitude,
            function (partial) {
                showProgressAddressChoices(partial, requestId);
            }
        );

        if (requestId !== addressRequestCounter) {
            return [];
        }

        if (options.length) {

            setAddressChoices(options, preferredValue, latitude, longitude);

            return options;
        }

    } catch (error) {
        console.error("loadAddressDropdown failed:", error);
    }

    if (requestId === addressRequestCounter) {
        setAddressError("Address unavailable");
    }

    return [];
}


// ============================================================
// GET PHONE LOCATION
// ============================================================

async function getPhoneLocationFromDevice() {

    setupLocationElements();

    if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by this browser.");
    }

    if (!window.isLocationSecure()) {
        throw new Error("Location requires HTTPS or localhost.");
    }

    setAddressStatus("Getting your location...");

    if (locationCoordinateInput) {
        locationCoordinateInput.value = "Getting coordinates...";
    }

    if (locationButton) {
        locationButton.disabled = true;
        locationButton.textContent = "Getting Location...";
    }

    return new Promise(function (resolve, reject) {

        navigator.geolocation.getCurrentPosition(

            async function (position) {

                try {

                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;
                    const accuracy = position.coords.accuracy;

                    console.log("PHONE GPS:", latitude, longitude, accuracy);

                    const coordinate = formatPhoneCoordinate(latitude, longitude);

                    // the coordinate shows immediately, before the address
                    updateCoordinateField(latitude, longitude);

                    // SAVE GPS FIRST (clears any previous address)
                    updateTimeMarkPhoneLocation({
                        latitude: latitude,
                        longitude: longitude,
                        accuracy: accuracy,
                        coordinate: coordinate,
                        address: "",
                        gpsSource: "phone"
                    });

                    setAddressStatus("Finding your address...");

                    // newest request wins (shared with the other refreshes)
                    const requestId = ++addressRequestCounter;

                    let phoneAddress = "";
                    let addressOptions = [];

                    try {

                        addressOptions = await getAddressOptions(
                            latitude,
                            longitude,
                            function (partial) {
                                showProgressAddressChoices(partial, requestId);
                            }
                        );

                        if (
                            addressOptions.length &&
                            requestId === addressRequestCounter
                        ) {
                            const select = document.getElementById("address");

                            // keep a choice made while the list was loading
                            phoneAddress = setAddressChoices(
                                addressOptions,
                                select ? clean(select.value) : ""
                            );
                        }

                    } catch (error) {
                        console.error("Reverse geocoding failed:", error);
                    }

                    if (!phoneAddress && requestId === addressRequestCounter) {
                        setAddressError("Address unavailable");
                    }

                    window.TimeMark.location.phoneAddress = phoneAddress;

                    // the dropdown can end on a nearby option, so the
                    // coordinate field follows the selected option
                    const selectedOption = (function () {
                        const select = document.getElementById("address");
                        return select && select.tagName === "SELECT"
                            ? select.options[select.selectedIndex]
                            : null;
                    })();

                    const selectedLatitude =
                        selectedOption ? Number(selectedOption.dataset.latitude) : NaN;
                    const selectedLongitude =
                        selectedOption ? Number(selectedOption.dataset.longitude) : NaN;

                    if (
                        phoneAddress &&
                        Number.isFinite(selectedLatitude) &&
                        Number.isFinite(selectedLongitude)
                    ) {
                        updateCoordinateField(selectedLatitude, selectedLongitude);
                    } else {
                        updateCoordinateField(latitude, longitude);
                    }

                    updateTimeMarkPhoneLocation({
                        latitude: latitude,
                        longitude: longitude,
                        accuracy: accuracy,
                        coordinate: coordinate,
                        address: phoneAddress,
                        gpsSource: "phone"
                    });

                    if (locationButton) {
                        locationButton.disabled = false;
                        locationButton.textContent = "Location Updated";
                    }

                    const locationData = {
                        latitude: latitude,
                        longitude: longitude,
                        accuracy: accuracy,
                        coordinate: coordinate,
                        address: phoneAddress,
                        gpsSource: "phone",
                        nearbyAddresses: addressOptions
                    };

                    window.dispatchEvent(
                        new CustomEvent("timemarklocationready", {
                            detail: locationData
                        })
                    );

                    if (
                        window.TimeMark &&
                        typeof window.TimeMark.render === "function"
                    ) {
                        window.TimeMark.render();
                    }

                    resolve(locationData);

                } catch (error) {

                    console.error("Phone location processing error:", error);

                    setAddressError("Unable to process location");

                    if (locationCoordinateInput) {
                        locationCoordinateInput.value = "Not available";
                    }

                    if (locationButton) {
                        locationButton.disabled = false;
                        locationButton.textContent = "Use My Location";
                    }

                    reject(error);
                }
            },

            function (error) {

                console.error("Geolocation error:", error);

                let message = "Unable to get location.";

                if (error && error.code === 1) {
                    message = LOCATION_BLOCKED_MESSAGE;
                } else if (error && error.code === 2) {
                    message = "Location unavailable.";
                } else if (error && error.code === 3) {
                    message = "Location request timed out.";
                }

                setAddressError(message);

                if (locationCoordinateInput) {
                    locationCoordinateInput.value = "Not available";
                }

                if (locationButton) {
                    locationButton.disabled = false;
                    locationButton.textContent = "Use My Location";
                }

                reject(error);
            },

            {
                enableHighAccuracy: true,
                timeout: 30000,
                maximumAge: 0
            }
        );
    });
}


// ============================================================
// SAFARI LOCATION PERMISSION
// ============================================================

async function requestSafariLocationPermission() {

    if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by this browser.");
    }

    if (!window.isLocationSecure()) {
        throw new Error("Location requires HTTPS or localhost.");
    }

    return true;
}


// ============================================================
// REQUEST LOCATION
// ============================================================

async function requestLocationFromUser() {

    try {

        setupLocationElements();

        if (!navigator.geolocation) {
            throw new Error("Geolocation is not supported.");
        }

        if (!window.isLocationSecure()) {
            throw new Error("Location requires HTTPS.");
        }

        await requestSafariLocationPermission();

        setAddressStatus("Allow location access when asked...");

        if (locationButton) {
            locationButton.disabled = true;
            locationButton.textContent = "📍 Requesting Permission...";
        }

        return await getPhoneLocationFromDevice();

    } catch (error) {

        console.error("Location request failed:", error);

        let message = "Unable to get location.";

        if (error && error.code === 1) {
            message = LOCATION_BLOCKED_MESSAGE;
        } else if (error && error.code === 2) {
            message = "Location unavailable.";
        } else if (error && error.code === 3) {
            message = "Location request timed out.";
        } else if (error && error.message) {
            message = error.message;
        }

        setAddressError(message);

        if (locationButton) {
            locationButton.disabled = false;
            locationButton.textContent = "Use My Location";
        }

        throw error;
    }
}


// ============================================================
// INITIALIZE
// ============================================================

function initializePhoneLocation() {

    setupLocationElements();

    console.log("========================================");
    console.log("TIMEMARK LOCATION INITIALIZED (v6)");
    console.log("Secure:", window.isLocationSecure());
    console.log("Geolocation:", !!navigator.geolocation);
    console.log("City whitelist:", JSON.stringify(CITY_WHITELIST));
    console.log("Decorated dropdown text:", DECORATE_ADDRESS_OPTIONS);
    console.log("========================================");

    // ADDRESS SELECT
    const addressSelect = document.getElementById("address");

    if (addressSelect && addressSelect.tagName === "SELECT") {

        if (!addressSelect.options.length) {

            const option = document.createElement("option");

            option.value = "";
            option.textContent = "Select address";
            option.selected = true;

            addressSelect.appendChild(option);
        }

        if (addressSelect.dataset.timemarkBound !== "true") {

            addressSelect.addEventListener("change", handleAddressDropdownChange);

            addressSelect.dataset.timemarkBound = "true";
        }
    }

    // LOCATION BUTTON
    if (
        locationButton &&
        locationButton.dataset.timemarkBound !== "true"
    ) {

        locationButton.addEventListener("click", function () {

            requestLocationFromUser().catch(function (error) {
                console.error("Location button error:", error);
            });
        });

        locationButton.dataset.timemarkBound = "true";
    }

    // COORDINATE INITIAL
    if (locationCoordinateInput && !locationCoordinateInput.value) {
        locationCoordinateInput.value = "Not available";
    }

    // AUTOMATIC LOCATION
    if (
        window.TimeMark.autoLocation !== false &&
        !window.TimeMark.location.autoLocationStarted &&
        navigator.geolocation &&
        window.isLocationSecure()
    ) {

        window.TimeMark.location.autoLocationStarted = true;

        const startAuto = function () {

            requestLocationFromUser().catch(function (error) {
                console.warn("Automatic location:", error);
            });
        };

        setTimeout(function () {

            if (
                navigator.permissions &&
                typeof navigator.permissions.query === "function"
            ) {

                navigator.permissions
                    .query({ name: "geolocation" })
                    .then(function (status) {

                        if (status.state === "denied") {
                            setAddressError(LOCATION_BLOCKED_MESSAGE);
                            return;
                        }

                        startAuto();
                    })
                    .catch(startAuto);

            } else {

                startAuto();
            }

        }, 300);
    }
}


// ============================================================
// DOM READY
// ============================================================

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePhoneLocation);
} else {
    initializePhoneLocation();
}


// ============================================================
// TIMEMARK API
// ============================================================

window.TimeMark.getPhoneLocationFromDevice = getPhoneLocationFromDevice;
window.TimeMark.requestLocationFromUser = requestLocationFromUser;
window.TimeMark.formatPhoneCoordinate = formatPhoneCoordinate;
window.TimeMark.normalizePhoneCoordinate = normalizePhoneCoordinate;
window.TimeMark.reverseGeocode = reverseGeocode;
window.TimeMark.reverseGeocodePhone = reverseGeocodePhone;
window.TimeMark.updateAddressFromCoordinates = updateAddressFromCoordinates;
window.TimeMark.formatCityTownProvince = formatCityTownProvince;
window.TimeMark.resolveAddress = resolveAddress;
window.TimeMark.getAddressOptions = getAddressOptions;
window.TimeMark.getNearbyAddressOptions = getNearbyAddressOptions;
window.TimeMark.loadAddressDropdown = loadAddressDropdown;
window.TimeMark.setAddressDropdown = setAddressDropdown;
window.TimeMark.setAddressChoices = setAddressChoices;
window.TimeMark.clearAddressDropdown = clearAddressDropdown;
window.TimeMark.updateCoordinateField = updateCoordinateField;
window.TimeMark.fetchNearbyNationalHighway = fetchNearbyNationalHighway;
window.TimeMark.fetchAdminAreas = fetchAdminAreas;
window.TimeMark.enforceCityRule = enforceCityRule;
window.TimeMark.getBarangay = getBarangay;
window.TimeMark.formatBarangayName = formatBarangayName;


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.reverseGeocode = reverseGeocode;
window.reverseGeocodePhone = reverseGeocodePhone;
window.updateAddressFromCoordinates = updateAddressFromCoordinates;
window.getPhoneLocationFromDevice = getPhoneLocationFromDevice;
window.requestLocationFromUser = requestLocationFromUser;
window.formatPhoneCoordinate = formatPhoneCoordinate;
window.normalizePhoneCoordinate = normalizePhoneCoordinate;
window.formatCityTownProvince = formatCityTownProvince;
window.resolveAddress = resolveAddress;
window.getAddressOptions = getAddressOptions;
window.getNearbyAddressOptions = getNearbyAddressOptions;
window.loadAddressDropdown = loadAddressDropdown;
window.setAddressDropdown = setAddressDropdown;
window.setAddressChoices = setAddressChoices;
window.clearAddressDropdown = clearAddressDropdown;


// ============================================================
// END LOCATION.JS
// ============================================================
