"use strict";


/* ============================================================
   ELEMENTS
   ============================================================ */

const manualLocationSearch =
    document.getElementById("manualLocationSearch");

const searchLocationBtn =
    document.getElementById("searchLocationBtn");

const locationSearchResults =
    document.getElementById("locationSearchResults");

const locationSearchStatus =
    document.getElementById("locationSearchStatus");

const addressSelect =
    document.getElementById("address");

const saveManualLocationBtn =
    document.getElementById("saveManualLocationBtn");

const manualLocationModal =
    document.getElementById("manualLocationModal");


/* ============================================================
   SELECTED LOCATION
   ============================================================ */

let selectedLocationData = null;


/* ============================================================
   SEARCH LOCATION
   ============================================================ */

async function searchLocation() {

    if (!manualLocationSearch) {
        return;
    }


    /* ========================================================
       GET SEARCH QUERY
       ======================================================== */

    const query = manualLocationSearch.value.trim();

    if (!query) {

        if (locationSearchStatus) {

            locationSearchStatus.textContent =
                "Please enter a location.";

        }

        manualLocationSearch.focus();

        return;
    }


    /* ========================================================
       RESET PREVIOUS SELECTION
       ======================================================== */

    selectedLocationData = null;

    if (saveManualLocationBtn) {
        saveManualLocationBtn.disabled = true;
    }


    /* ========================================================
       CLEAR PREVIOUS RESULTS
       ======================================================== */

    if (locationSearchResults) {
        locationSearchResults.innerHTML = "";
    }


    /* ========================================================
       LOADING STATUS
       ======================================================== */

    if (locationSearchStatus) {

        locationSearchStatus.innerHTML = `
            <span
                class="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true">
            </span>
            Searching location...
        `;

    }


    /* ========================================================
       DISABLE SEARCH BUTTON
       ======================================================== */

    if (searchLocationBtn) {
        searchLocationBtn.disabled = true;
    }


    try {

        /* ====================================================
           NOMINATIM PARAMETERS
           ==================================================== */

        const params = new URLSearchParams({

            q: query,

            format: "json",

            addressdetails: "1",

            limit: "8",

            countrycodes: "ph"

        });


        /* ====================================================
           REQUEST
           ==================================================== */

        const response = await fetch(

            "https://nominatim.openstreetmap.org/search?" +
            params.toString(),

            {
                method: "GET",

                headers: {
                    "Accept": "application/json"
                }
            }

        );


        /* ====================================================
           CHECK RESPONSE
           ==================================================== */

        if (!response.ok) {
            throw new Error("Location search failed.");
        }


        /* ====================================================
           GET RESULTS
           ==================================================== */

        const results = await response.json();


        /* ====================================================
           NO RESULTS
           ==================================================== */

        if (!results || results.length === 0) {

            if (locationSearchStatus) {

                locationSearchStatus.textContent =
                    "No locations found.";

            }

            return;
        }


        /* ====================================================
           RESULT COUNT
           ==================================================== */

        if (locationSearchStatus) {

            locationSearchStatus.textContent =
                `${results.length} location(s) found.`;

        }


        /* ====================================================
           DISPLAY RESULTS
           ==================================================== */

        results.forEach(function (result) {

            createLocationResult(result);

        });


    } catch (error) {

        console.error(
            "Manual location search error:",
            error
        );


        if (locationSearchStatus) {

            locationSearchStatus.textContent =
                "Unable to search location.";

        }


        if (locationSearchResults) {

            locationSearchResults.innerHTML = `
                <div class="alert alert-danger">
                    Unable to search location.
                    Please try again.
                </div>
            `;

        }


    } finally {

        /* ====================================================
           ENABLE SEARCH BUTTON
           ==================================================== */

        if (searchLocationBtn) {
            searchLocationBtn.disabled = false;
        }

    }
}


/* ============================================================
   CREATE LOCATION RESULT
   ============================================================ */

function createLocationResult(result) {

    if (!locationSearchResults) {
        return;
    }


    /* ========================================================
       GET ADDRESS
       ======================================================== */

    const address = result.address || {};


    /* ========================================================
       FORMAT LOCATION
       ======================================================== */

    const formattedLocation = formatLocation(
        address,
        result.display_name
    );


    /* ========================================================
       CREATE BUTTON
       ======================================================== */

    const button = document.createElement("button");

    button.type = "button";

    button.className =
        "list-group-item list-group-item-action";


    /* ========================================================
       STORE COORDINATES
       ======================================================== */

    button.dataset.latitude = result.lat;

    button.dataset.longitude = result.lon;


    /* ========================================================
       DISPLAY RESULT
       ======================================================== */

    button.innerHTML = `

        <div class="fw-semibold">

            ${escapeHtml(
                formattedLocation ||
                result.display_name ||
                "Unknown location"
            )}

        </div>

        <div class="small text-muted mt-1">

            ${escapeHtml(
                result.display_name || ""
            )}

        </div>

    `;


    /* ========================================================
       SELECT RESULT
       ======================================================== */

    button.addEventListener(
        "click",
        function () {

            selectLocation(
                result,
                formattedLocation,
                button
            );

        }
    );


    /* ========================================================
       ADD TO RESULTS
       ======================================================== */

    locationSearchResults.appendChild(button);
}


/* ============================================================
   FORMAT LOCATION
   ============================================================

  

/* ============================================================
   FORMAT LOCATION
   ============================================================ */

function formatLocation(address, displayName) {

    if (!address || typeof address !== "object") {
        return "";
    }


    /* ========================================================
       STREET
       ======================================================== */

    const street = cleanValue(
        address.road ||
        address.street ||
        address.pedestrian ||
        address.footway ||
        address.path ||
        ""
    );


    /* ========================================================
       BARANGAY
       ======================================================== */

    const barangay = cleanValue(
        address.suburb ||
        address.village ||
        address.neighbourhood ||
        address.quarter ||
        address.hamlet ||
        ""
    );


    /* ========================================================
       CITY / TOWN / MUNICIPALITY
       ======================================================== */

    let townCity = "";


    /* ========================================================
       CITY
       ========================================================

       If Nominatim returns:

           city: "Vigan"

       convert to:

           Vigan City
       ======================================================== */

    if (address.city) {

        townCity = formatCityName(
            address.city
        );

    }


    /* ========================================================
       TOWN
       ======================================================== */

    else if (address.town) {

        townCity = cleanValue(
            address.town
        );

    }


    /* ========================================================
       MUNICIPALITY
       ======================================================== */

    else if (address.municipality) {

        townCity = cleanValue(
            address.municipality
        );

    }


    /* ========================================================
       PROVINCE
       ======================================================== */

    const provinceCandidates = [

        address.province,

        address.county,

        address.state_district,

        address.state

    ];


    let province = "";


    /* ========================================================
       FIND PROVINCE
       ======================================================== */

    for (
        const candidate of provinceCandidates
    ) {

        const cleaned =
            cleanProvince(candidate);


        if (cleaned) {

            province = cleaned;

            break;

        }

    }


    /* ========================================================
       PROVINCE FALLBACK
       ======================================================== */

    if (!province && displayName) {

        province =
            provinceFromDisplayName(
                displayName
            );

    }


    /* ========================================================
       BUILD LOCATION
       ======================================================== */

    const parts = [

        street,

        barangay,

        townCity,

        province

    ].filter(function (value) {

        return (
            value &&
            value.trim() !== ""
        );

    });


    /* ========================================================
       REMOVE DUPLICATES
       ======================================================== */

    const unique = [];


    parts.forEach(function (value) {

        const exists =
            unique.some(function (existing) {

                return (
                    existing.toLowerCase() ===
                    value.toLowerCase()
                );

            });


        if (!exists) {

            unique.push(value);

        }

    });


    /* ========================================================
       FINAL FORMAT
       ======================================================== */

    return unique.join(", ");
}


/* ============================================================
   FORMAT CITY NAME
   ============================================================

   Converts:

       Vigan
       Laoag
       Candon

   into:

       Vigan City
       Laoag City
       Candon City

   BUT:

       Vigan City

   remains:

       Vigan City

   This only runs when the value came from
   address.city, so towns/municipalities are not
   incorrectly changed.
   ============================================================ */

function formatCityName(value) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return "";
    }


    const city = value.trim();


    if (!city) {
        return "";
    }


    /* ========================================================
       ALREADY HAS CITY
       ======================================================== */

    if (
        /\bcity$/i.test(city)
    ) {

        return city;

    }


    /* ========================================================
       REMOVE POSSIBLE EXTRA SPACES
       ======================================================== */

    const cleanedCity =
        city.replace(/\s+/g, " ").trim();


    /* ========================================================
       ADD CITY
       ======================================================== */

    return `${cleanedCity} City`;
}


/* ============================================================
   PROVINCE FROM DISPLAY NAME
   ============================================================ */

function provinceFromDisplayName(displayName) {

    if (
        !displayName ||
        typeof displayName !== "string"
    ) {
        return "";
    }


    const parts = displayName

        .split(",")

        .map(function (part) {

            return part.trim();

        })

        .filter(Boolean);


    /* ========================================================
       SEARCH FROM END
       ======================================================== */

    for (
        let i = parts.length - 1;
        i >= 0;
        i--
    ) {

        const part = parts[i];


        /* ====================================================
           SKIP POSTAL CODE
           ==================================================== */

        if (/^\d+$/.test(part)) {
            continue;
        }


        /* ====================================================
           SKIP PHILIPPINES
           ==================================================== */

        if (
            part.toLowerCase() ===
            "philippines"
        ) {
            continue;
        }


        const cleaned =
            cleanProvince(part);


        if (cleaned) {

            return cleaned;

        }

    }


    return "";
}


/* ============================================================
   CLEAN PROVINCE
   ============================================================ */

function cleanProvince(value) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return "";
    }


    const normalized =
        value.trim().toLowerCase();


    /* ========================================================
       PHILIPPINE REGIONS
       ======================================================== */

    const regions = [

        "calabarzon",

        "central luzon",

        "ilocos region",

        "cagayan valley",

        "central visayas",

        "eastern visayas",

        "western visayas",

        "northern mindanao",

        "davao region",

        "soccsksargen",

        "caraga",

        "zamboanga peninsula",

        "bicol region",

        "mimaropa",

        "cordillera administrative region",

        "bangsamoro autonomous region in muslim mindanao",

        "national capital region",

        "metro manila",

        "ncr",

        "car",

        "region i",

        "region ii",

        "region iii",

        "region iv-a",

        "region iv-b",

        "region v",

        "region vi",

        "region vii",

        "region viii",

        "region ix",

        "region x",

        "region xi",

        "region xii",

        "region xiii",

        "philippines"

    ];


    /* ========================================================
       REMOVE REGION
       ======================================================== */

    if (
        regions.includes(normalized)
    ) {

        return "";

    }


    return value.trim();
}


/* ============================================================
   CLEAN VALUE
   ============================================================ */

function cleanValue(value) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return "";
    }


    return value.trim();
}


/* ============================================================
   SELECT LOCATION
   ============================================================

   Clicking a result ONLY selects it.

   It does NOT save it yet.

   User must click:

   SAVE LOCATION
   ============================================================ */

function selectLocation(
    result,
    formattedLocation,
    clickedButton
) {

    /* ========================================================
       COORDINATES
       ======================================================== */

    const latitude =
        Number(result.lat);

    const longitude =
        Number(result.lon);


    /* ========================================================
       VALIDATE COORDINATES
       ======================================================== */

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        console.error(
            "Invalid coordinates:",
            result
        );

        return;
    }


    /* ========================================================
       STORE SELECTED LOCATION
       ======================================================== */

    selectedLocationData = {

        latitude: latitude,

        longitude: longitude,

        address: formattedLocation,

        result: result

    };


    /* ========================================================
       REMOVE PREVIOUS HIGHLIGHT
       ======================================================== */

    document

        .querySelectorAll(
            "#locationSearchResults .list-group-item"
        )

        .forEach(function (item) {

            item.classList.remove(
                "active"
            );

        });


    /* ========================================================
       HIGHLIGHT CURRENT RESULT
       ======================================================== */

    if (clickedButton) {

        clickedButton.classList.add(
            "active"
        );

    }


    /* ========================================================
       ENABLE SAVE BUTTON
       ======================================================== */

    if (saveManualLocationBtn) {

        saveManualLocationBtn.disabled =
            false;

    }


    /* ========================================================
       STATUS
       ======================================================== */

    if (locationSearchStatus) {

        locationSearchStatus.innerHTML = `

            <span class="text-success">

                <i class="bi bi-check-circle-fill me-1"></i>

                Location selected.
                Click "Save Location".

            </span>

        `;

    }
}


/* ============================================================
   APPLY LOCATION EVERYWHERE
   ============================================================

   Runs ALL apply code when a location is saved:

   1. Click #applyLocationBtn
   2. Click every [data-apply-location]
   3. Click every .apply-location-btn
   4. Fires "change" on address dropdown
   5. Fires "input" + "change" on manual coordinates
   6. Dispatches "applyLocationAll"
   ============================================================ */

function applyLocationEverywhere(location) {

    /* ========================================================
       APPLY BUTTONS
       ======================================================== */

    const applyButtons =
        new Set();


    /* ========================================================
       MAIN APPLY BUTTON
       ======================================================== */

    const mainBtn =
        document.getElementById(
            "applyLocationBtn"
        );


    if (mainBtn) {

        applyButtons.add(
            mainBtn
        );

    }


    /* ========================================================
       OTHER APPLY BUTTONS
       ======================================================== */

    document

        .querySelectorAll(
            "[data-apply-location], .apply-location-btn"
        )

        .forEach(function (btn) {

            applyButtons.add(btn);

        });


    /* ========================================================
       CLICK APPLY BUTTONS
       ======================================================== */

    applyButtons.forEach(function (btn) {

        try {

            btn.click();

        } catch (error) {

            console.error(
                "Apply button error:",
                btn,
                error
            );

        }

    });


    /* ========================================================
       ADDRESS DROPDOWN CHANGE
       ======================================================== */

    if (addressSelect) {

        addressSelect.dispatchEvent(

            new Event(
                "change",
                {
                    bubbles: true
                }
            )

        );

    }


    /* ========================================================
       MANUAL COORDINATE FIELDS
       ======================================================== */

    [
        "manualLatitude",
        "manualLongitude"

    ].forEach(function (id) {

        const input =
            document.getElementById(id);


        if (input) {

            input.dispatchEvent(

                new Event(
                    "input",
                    {
                        bubbles: true
                    }
                )

            );


            input.dispatchEvent(

                new Event(
                    "change",
                    {
                        bubbles: true
                    }
                )

            );

        }

    });


    /* ========================================================
       GLOBAL EVENT
       ======================================================== */

    document.dispatchEvent(

        new CustomEvent(
            "applyLocationAll",
            {
                detail: location
            }
        )

    );
}


/* ============================================================
   SAVE MANUAL LOCATION
   ============================================================ */

if (saveManualLocationBtn) {

    /* ========================================================
       DISABLED BY DEFAULT
       ======================================================== */

    saveManualLocationBtn.disabled =
        true;


    /* ========================================================
       CLICK
       ======================================================== */

    saveManualLocationBtn.addEventListener(
        "click",
        function () {

            /* ================================================
               CHECK SELECTION
               ================================================ */

            if (!selectedLocationData) {

                if (locationSearchStatus) {

                    locationSearchStatus.textContent =
                        "Please select a location first.";

                }

                return;
            }


            /* ================================================
               GET SELECTED DATA
               ================================================ */

            const latitude =
                selectedLocationData.latitude;

            const longitude =
                selectedLocationData.longitude;

            const formattedLocation =
                selectedLocationData.address;

            const result =
                selectedLocationData.result;


            /* ================================================
               UPDATE ADDRESS
               ================================================ */

            if (addressSelect) {

                let option =
                    Array.from(
                        addressSelect.options
                    ).find(function (item) {

                        return (
                            item.value ===
                            formattedLocation
                        );

                    });


                /* ==========================================
                   CREATE OPTION IF NEEDED
                   ========================================== */

                if (!option) {

                    option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        formattedLocation;


                    option.textContent =
                        formattedLocation;


                    addressSelect.appendChild(
                        option
                    );

                }


                /* ==========================================
                   SELECT ADDRESS
                   ========================================== */

                addressSelect.value =
                    formattedLocation;

            }


            /* ================================================
               MANUAL LATITUDE
               ================================================ */

            const manualLatitude =
                document.getElementById(
                    "manualLatitude"
                );


            if (manualLatitude) {

                manualLatitude.value =
                    latitude.toFixed(6);

            }


            /* ================================================
               MANUAL LONGITUDE
               ================================================ */

            const manualLongitude =
                document.getElementById(
                    "manualLongitude"
                );


            if (manualLongitude) {

                manualLongitude.value =
                    longitude.toFixed(6);

            }


            /* ================================================
               GLOBAL VALUES
               ================================================ */

            window.manualSearchLatitude =
                latitude;

            window.manualSearchLongitude =
                longitude;

            window.manualSearchAddress =
                formattedLocation;


            /* ================================================
               DISPATCH MANUAL LOCATION EVENT
               ================================================ */

            document.dispatchEvent(

                new CustomEvent(
                    "manualLocationSelected",
                    {
                        detail: {

                            latitude:
                                latitude,

                            longitude:
                                longitude,

                            address:
                                formattedLocation,

                            result:
                                result

                        }
                    }
                )

            );


            /* ================================================
               APPLY LOCATION EVERYWHERE
               ================================================ */

            applyLocationEverywhere({

                latitude:
                    latitude,

                longitude:
                    longitude,

                address:
                    formattedLocation,

                result:
                    result

            });


            /* ================================================
               SAVE SUCCESS STATUS
               ================================================ */

            if (locationSearchStatus) {

                locationSearchStatus.innerHTML = `

                    <span class="text-success">

                        <i class="bi bi-check-circle-fill me-1"></i>

                        Location saved successfully.

                    </span>

                `;

            }


            /* ================================================
               RESET SELECTED LOCATION
               ================================================ */

            selectedLocationData =
                null;


            /* ================================================
               DISABLE SAVE BUTTON
               ================================================ */

            saveManualLocationBtn.disabled =
                true;


            /* ================================================
               CLOSE MODAL
               ================================================ */

            const modalElement =
                document.getElementById(
                    "manualLocationModal"
                );


            if (
                modalElement &&
                typeof bootstrap !==
                "undefined"
            ) {

                const modal =
                    bootstrap.Modal.getInstance(
                        modalElement
                    );


                if (modal) {

                    modal.hide();

                }

            }

        }
    );

}


/* ============================================================
   SEARCH BUTTON
   ============================================================ */

if (searchLocationBtn) {

    searchLocationBtn.addEventListener(
        "click",
        searchLocation
    );

}


/* ============================================================
   ENTER KEY
   ============================================================ */

if (manualLocationSearch) {

    manualLocationSearch.addEventListener(
        "keydown",
        function (event) {

            if (event.key === "Enter") {

                event.preventDefault();

                searchLocation();

            }

        }
    );

}


/* ============================================================
   MODAL
   ============================================================ */

if (manualLocationModal) {

    /* ========================================================
       MODAL OPEN
       ======================================================== */

    manualLocationModal.addEventListener(
        "shown.bs.modal",
        function () {

            if (manualLocationSearch) {

                manualLocationSearch.focus();

            }

        }
    );


    /* ========================================================
       MODAL CLOSE
       ======================================================== */

    manualLocationModal.addEventListener(
        "hidden.bs.modal",
        function () {

            /* ================================================
               CLEAR SEARCH
               ================================================ */

            if (manualLocationSearch) {

                manualLocationSearch.value =
                    "";

            }


            /* ================================================
               CLEAR RESULTS
               ================================================ */

            if (locationSearchResults) {

                locationSearchResults.innerHTML =
                    "";

            }


            /* ================================================
               CLEAR STATUS
               ================================================ */

            if (locationSearchStatus) {

                locationSearchStatus.textContent =
                    "";

            }


            /* ================================================
               RESET SELECTED LOCATION
               ================================================ */

            selectedLocationData =
                null;


            /* ================================================
               DISABLE SAVE BUTTON
               ================================================ */

            if (saveManualLocationBtn) {

                saveManualLocationBtn.disabled =
                    true;

            }

        }
    );

}


/* ============================================================
   ESCAPE HTML
   ============================================================ */

function escapeHtml(value) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value || "";


    return div.innerHTML;
}