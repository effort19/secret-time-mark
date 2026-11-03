// ============================================================
// TIMEMARK — MULTIPLE PHOTO + GPS + MANUAL LOCATION (FIXED)
// ============================================================
//
// FIX: "Identifier 'image' has already been declared"
//
// The whole file is wrapped in an IIFE so none of its top-level
// names (image, hasPhoto, uploadedImages, ...) can clash with
// variables declared in your other scripts.
//
// The photo is passed to the main app through setPhotoState(),
// which sets window.image / window.hasPhoto AND the main
// script's own `image` / `hasPhoto` if they exist.
//
// Script order in HTML:
//   1. EXIF library
//   2. main app script (defines render, etc.)
//   3. location.js (defines window.reverseGeocode)
//   4. this file
// ============================================================

(function () {
"use strict";


// ============================================================
// STORAGE
// ============================================================

const uploadedImages = [];

let currentImageIndex = 0;

let currentLatitude = null;
let currentLongitude = null;
let currentAccuracy = null;
let currentAddress = "";


// ============================================================
// HTML ELEMENT REFERENCES
// ============================================================

let multiplePhotoInput = null;
let multipleAddressInput = null;
let multipleCoordinateInput = null;
let manualLatitudeInput = null;
let manualLongitudeInput = null;
let applyLocationBtn = null;
let resetLocationBtn = null;


function initializeLocationElements() {

    multiplePhotoInput = document.getElementById("photoInput");
    multipleAddressInput = document.getElementById("address");
    multipleCoordinateInput = document.getElementById("coordinate");
    manualLatitudeInput = document.getElementById("manualLatitude");
    manualLongitudeInput = document.getElementById("manualLongitude");
    applyLocationBtn = document.getElementById("applyLocationBtn");
    resetLocationBtn = document.getElementById("resetLocationBtn");

    console.log("TimeMark location elements:", {
        photoInput: !!multiplePhotoInput,
        address: !!multipleAddressInput,
        coordinate: !!multipleCoordinateInput,
        manualLatitude: !!manualLatitudeInput,
        manualLongitude: !!manualLongitudeInput,
        applyButton: !!applyLocationBtn,
        resetButton: !!resetLocationBtn
    });

}


// ============================================================
// SHARE CURRENT PHOTO WITH THE MAIN APP
// ============================================================
//
// Does NOT declare `image` / `hasPhoto` (that caused the
// "already been declared" error). It only assigns to them.
//
// If your render() uses a different variable name
// (e.g. uploadedImage / currentImage), add it below.
//
// ============================================================

function setPhotoState(img, has) {

    // For code that reads window.image / window.hasPhoto
    window.image = img;
    window.hasPhoto = has;

    // For the main script's own `let image` / `let hasPhoto`
    // (shared global scope). try/catch so it never crashes.
    try { image = img; } catch (e) {}
    try { hasPhoto = has; } catch (e) {}

}


// ============================================================
// FORMAT COORDINATES
// EXACT OUTPUT: 17.582397° N, 120.389073° E
// ============================================================

function formatCoordinate(latitude, longitude) {

    if (
        latitude === null ||
        latitude === undefined ||
        longitude === null ||
        longitude === undefined
    ) {
        return "";
    }

    if (
        String(latitude).trim() === "" ||
        String(longitude).trim() === ""
    ) {
        return "";
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
    ) {
        return "";
    }

    return (
        Math.abs(lat).toFixed(6) + "° " + (lat >= 0 ? "N" : "S") +
        ", " +
        Math.abs(lon).toFixed(6) + "° " + (lon >= 0 ? "E" : "W")
    );

}


// ============================================================
// CHECK SUPPORTED IMAGE
// Some browsers give HEIC/HEIF an empty MIME type, so the file
// extension is checked as well.
// ============================================================

function isSupportedImageFile(file) {

    if (!file) {
        return false;
    }

    const name = String(file.name || "").toLowerCase();
    const extensionMatch = name.match(/\.([a-z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[1] : "";

    const supportedExtensions = [
        "jpg", "jpeg", "png", "heic", "heif", "avif", "webp"
    ];

    if (supportedExtensions.includes(extension)) {
        return true;
    }

    return (
        typeof file.type === "string" &&
        file.type.startsWith("image/")
    );

}


// ============================================================
// SET ADDRESS FIELD (<select id="address"> compatible)
// ============================================================

function setAddressField(address) {

    const select = document.getElementById("address");

    if (!select) {
        return;
    }

    const value = String(address || "").trim();

    if (select.tagName === "SELECT") {

        if (!value) {
            select.value = "";
            return;
        }

        let existing = null;

        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === value) {
                existing = select.options[i];
                break;
            }
        }

        if (!existing) {
            existing = document.createElement("option");
            existing.value = value;
            existing.textContent = value;
            select.appendChild(existing);
        }

        select.value = value;
        return;

    }

    // Fallback if #address is an input
    select.value = value;

}


// ============================================================
// PHONE GPS
// ============================================================

function getCurrentPhoneLocation() {

    return new Promise(function (resolve, reject) {

        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by this browser."));
            return;
        }

        navigator.geolocation.getCurrentPosition(

            async function (position) {

                const latitude = Number(position.coords.latitude);
                const longitude = Number(position.coords.longitude);
                const accuracy = Number(position.coords.accuracy);

                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                    reject(new Error("Invalid GPS coordinates."));
                    return;
                }

                let address = "";

                if (typeof window.reverseGeocode === "function") {

                    try {
                        address = await window.reverseGeocode(latitude, longitude);
                    } catch (error) {
                        console.warn("Phone GPS address lookup failed:", error);
                    }

                } else {
                    console.warn("reverseGeocode() is not available yet.");
                }

                resolve({
                    latitude: latitude,
                    longitude: longitude,
                    accuracy: Number.isFinite(accuracy) ? accuracy : null,
                    address: address,
                    coordinate: formatCoordinate(latitude, longitude),
                    gpsSource: "phone"
                });

            },

            function (error) {

                let message = "Unable to get phone location.";

                if (error && error.code === error.PERMISSION_DENIED) {
                    message = "Location permission denied.";
                } else if (error && error.code === error.POSITION_UNAVAILABLE) {
                    message = "Phone location unavailable.";
                } else if (error && error.code === error.TIMEOUT) {
                    message = "Phone location request timed out.";
                }

                reject(new Error(message));

            },

            {
                enableHighAccuracy: true,
                timeout: 30000,
                maximumAge: 10000
            }

        );

    });

}


// ============================================================
// DMS → DECIMAL
// ============================================================

function convertDMSToDecimal(dms) {

    if (!dms || dms.length < 3) {
        return null;
    }

    const degrees = Number(dms[0]);
    const minutes = Number(dms[1]);
    const seconds = Number(dms[2]);

    if (
        !Number.isFinite(degrees) ||
        !Number.isFinite(minutes) ||
        !Number.isFinite(seconds)
    ) {
        return null;
    }

    return degrees + minutes / 60 + seconds / 3600;

}


// ============================================================
// READ PHOTO EXIF GPS
// ============================================================

function readPhotoGPS(file) {

    return new Promise(function (resolve) {

        if (typeof EXIF === "undefined") {
            console.warn("EXIF library not loaded.");
            resolve(null);
            return;
        }

        try {

            EXIF.getData(file, function () {

                try {

                    const latitude = EXIF.getGPSLatitude
                        ? EXIF.getGPSLatitude(this)
                        : EXIF.getTag(this, "GPSLatitude");

                    const longitude = EXIF.getGPSLongitude
                        ? EXIF.getGPSLongitude(this)
                        : EXIF.getTag(this, "GPSLongitude");

                    const latitudeRef = EXIF.getTag(this, "GPSLatitudeRef");
                    const longitudeRef = EXIF.getTag(this, "GPSLongitudeRef");

                    if (!latitude || !longitude) {
                        resolve(null);
                        return;
                    }

                    let lat = convertDMSToDecimal(latitude);
                    let lon = convertDMSToDecimal(longitude);

                    if (lat === null || lon === null) {
                        resolve(null);
                        return;
                    }

                    const latRef = String(latitudeRef || "").trim().toUpperCase();
                    const lonRef = String(longitudeRef || "").trim().toUpperCase();

                    lat = latRef === "S" ? -Math.abs(lat) : Math.abs(lat);
                    lon = lonRef === "W" ? -Math.abs(lon) : Math.abs(lon);

                    if (
                        !Number.isFinite(lat) ||
                        !Number.isFinite(lon) ||
                        lat < -90 ||
                        lat > 90 ||
                        lon < -180 ||
                        lon > 180
                    ) {
                        resolve(null);
                        return;
                    }

                    resolve({
                        latitude: lat,
                        longitude: lon,
                        accuracy: null,
                        gpsSource: "exif"
                    });

                } catch (error) {
                    console.warn("EXIF GPS error:", error);
                    resolve(null);
                }

            });

        } catch (error) {
            console.warn("EXIF.getData failed:", error);
            resolve(null);
        }

    });

}


// ============================================================
// LOAD ONE PHOTO
// ============================================================

async function loadUploadedFile(file, index, fallbackLocation) {

    let photoGPS = null;

    // EXIF GPS
    try {
        photoGPS = await readPhotoGPS(file);
    } catch (error) {
        console.warn("Unable to read photo GPS:", error);
    }

    // GPS PRIORITY: EXIF > PHONE
    const foundLocation =
        photoGPS ||
        (
            fallbackLocation
                ? {
                    latitude: fallbackLocation.latitude,
                    longitude: fallbackLocation.longitude,
                    accuracy: fallbackLocation.accuracy,
                    gpsSource: "phone"
                }
                : null
        );

    const latitude = foundLocation ? foundLocation.latitude : null;
    const longitude = foundLocation ? foundLocation.longitude : null;
    const accuracy = foundLocation ? foundLocation.accuracy : null;
    const gpsSource = foundLocation ? foundLocation.gpsSource : "none";

    let address = "";

    // REVERSE GEOCODE THE EXACT GPS
    if (latitude !== null && longitude !== null) {

        try {
            if (typeof window.reverseGeocode === "function") {
                address = await window.reverseGeocode(latitude, longitude);
            }
        } catch (error) {
            console.warn("Address lookup failed:", error);
        }

    }

    const coordinate = formatCoordinate(latitude, longitude);

    // READ IMAGE
    return new Promise(function (resolve, reject) {

        const reader = new FileReader();

        reader.onload = function (event) {

            const newImage = new Image();

            newImage.onload = function () {

                resolve({

                    image: newImage,
                    file: file,
                    date: new Date(file.lastModified),
                    index: index,
                    name: file.name,

                    // CURRENT LOCATION
                    latitude: latitude,
                    longitude: longitude,
                    accuracy: accuracy,
                    address: address,
                    coordinate: coordinate,
                    gpsSource: gpsSource,
                    manuallyAdjusted: false,

                    // ORIGINAL LOCATION (never changes)
                    originalLatitude: latitude,
                    originalLongitude: longitude,
                    originalAccuracy: accuracy,
                    originalAddress: address,
                    originalCoordinate: coordinate,
                    originalGpsSource: gpsSource

                });

            };

            newImage.onerror = function () {
                reject(new Error("Unable to load image: " + file.name));
            };

            newImage.src = event.target.result;

        };

        reader.onerror = function () {
            reject(new Error("Unable to read image: " + file.name));
        };

        reader.readAsDataURL(file);

    });

}


// ============================================================
// UPLOAD MULTIPLE PHOTOS
// ============================================================

async function handlePhotoUpload(event) {

    const files = Array.from(event.target.files || [])
        .filter(function (file) {
            return isSupportedImageFile(file);
        });

    if (!files.length) {
        return;
    }

    // CLEAR OLD PHOTO LIST
    uploadedImages.length = 0;
    currentImageIndex = 0;
    setPhotoState(null, false);

    const status = document.getElementById("uploadStatus");

    try {

        // PHONE GPS FALLBACK
        if (status) {
            status.textContent = "Getting location...";
        }

        let fallbackLocation = null;

        try {
            fallbackLocation = await getCurrentPhoneLocation();
        } catch (error) {
            console.warn(
                "Phone GPS unavailable:",
                error && error.message ? error.message : error
            );
        }

        // LOAD PHOTOS
        if (status) {
            status.textContent = "Reading " + files.length + " photo(s)...";
        }

        const loadedPhotos = await Promise.all(
            files.map(function (file, index) {
                return loadUploadedFile(file, index, fallbackLocation);
            })
        );

        // KEEP ORIGINAL UPLOAD ORDER
        loadedPhotos.sort(function (a, b) {
            return a.index - b.index;
        });

        loadedPhotos.forEach(function (photo) {
            uploadedImages.push(photo);
        });

        // SHOW FIRST PHOTO
        if (uploadedImages.length) {
            showUploadedImage(0);
        }

        updatePhotoGallery();

    } catch (error) {

        console.error("Photo upload error:", error);

        if (status) {
            status.textContent = "Upload error";
        }

        alert(
            error && error.message
                ? error.message
                : "Unable to upload photos."
        );

    }

}


// ============================================================
// UPDATE CURRENT PHOTO LOCATION
// ============================================================

function updateCurrentPhotoLocation(item) {

    if (!item) {
        return;
    }

    currentLatitude = item.latitude ?? null;
    currentLongitude = item.longitude ?? null;
    currentAccuracy = item.accuracy ?? null;
    currentAddress = item.address || "";

    if (manualLatitudeInput) {
        manualLatitudeInput.value =
            currentLatitude !== null ? String(currentLatitude) : "";
    }

    if (manualLongitudeInput) {
        manualLongitudeInput.value =
            currentLongitude !== null ? String(currentLongitude) : "";
    }

    // Always regenerate from latitude/longitude
    const coordinate = formatCoordinate(currentLatitude, currentLongitude);

    item.coordinate = coordinate;

    if (multipleCoordinateInput) {
        multipleCoordinateInput.value =
            coordinate || "Location not available";
    }

    // ADDRESS
    if (multipleAddressInput) {

        if (currentAddress) {

            setAddressField(currentAddress);

        } else if (multipleAddressInput.tagName === "SELECT") {

            multipleAddressInput.value = "";

        } else {

            multipleAddressInput.value =
                coordinate ? "Address not available" : "Location not available";

        }

    }

    // TIMEMARK GLOBAL LOCATION
    window.TimeMark = window.TimeMark || {};
    window.TimeMark.location = window.TimeMark.location || {};

    window.TimeMark.location.latitude = currentLatitude;
    window.TimeMark.location.longitude = currentLongitude;
    window.TimeMark.location.accuracy = currentAccuracy;
    window.TimeMark.location.address = currentAddress;
    window.TimeMark.location.coordinate = coordinate;
    window.TimeMark.location.gpsSource = item.gpsSource || "none";
    window.TimeMark.location.manuallyAdjusted = item.manuallyAdjusted === true;

    window.TimeMark.currentImageIndex = currentImageIndex;
    window.TimeMark.currentPhoto = item;

}


// ============================================================
// SHOW CURRENT PHOTO
// ============================================================

function showUploadedImage(index) {

    if (
        !uploadedImages.length ||
        index < 0 ||
        index >= uploadedImages.length
    ) {
        return;
    }

    const item = uploadedImages[index];

    if (!item || !item.image) {
        return;
    }

    currentImageIndex = index;

    // Give the picture to the main app
    setPhotoState(item.image, true);

    // Load this photo's own GPS (keeps manual GPS per photo)
    updateCurrentPhotoLocation(item);

    // DATE
    const dateInput = document.getElementById("date");

    if (dateInput) {

        const date = item.date;

        if (date instanceof Date && !Number.isNaN(date.getTime())) {

            dateInput.value =
                date.getFullYear() +
                "-" +
                String(date.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(date.getDate()).padStart(2, "0");

        }

    }

    // TIME — PHILIPPINES / ASIA-MANILA
    const timeInput = document.getElementById("time");

    if (timeInput) {

        const date = item.date;

        if (date instanceof Date && !Number.isNaN(date.getTime())) {

            const philippinesDate = new Date(
                date.toLocaleString("en-US", { timeZone: "Asia/Manila" })
            );

            timeInput.value =
                String(philippinesDate.getHours()).padStart(2, "0") +
                ":" +
                String(philippinesDate.getMinutes()).padStart(2, "0");

        }

    }

    // VERIFICATION CODE
    const codeInput = document.getElementById("verificationCode");

    if (codeInput && typeof generateVerificationCode === "function") {
        codeInput.value = generateVerificationCode();
    }

    // RENDER
    if (typeof render === "function") {
        render();
    }

    updatePhotoGallery();

}


// ============================================================
// NEXT / PREVIOUS PHOTO
// ============================================================

function nextPhoto() {

    if (uploadedImages.length <= 1) {
        return;
    }

    showUploadedImage((currentImageIndex + 1) % uploadedImages.length);

}


function previousPhoto() {

    if (uploadedImages.length <= 1) {
        return;
    }

    showUploadedImage(
        (currentImageIndex - 1 + uploadedImages.length) % uploadedImages.length
    );

}


// ============================================================
// GET CURRENT PHOTO
// ============================================================

function getCurrentUploadedPhoto() {

    if (
        currentImageIndex < 0 ||
        currentImageIndex >= uploadedImages.length
    ) {
        return null;
    }

    return uploadedImages[currentImageIndex];

}


// ============================================================
// APPLY MANUAL LOCATION
// ============================================================
async function applyManualLocation() {

    const photo = getCurrentUploadedPhoto();

    if (!photo) {
        alert("Please upload a photo first.");
        return;
    }

    const latitudeText =
        manualLatitudeInput ? manualLatitudeInput.value.trim() : "";

    const longitudeText =
        manualLongitudeInput ? manualLongitudeInput.value.trim() : "";

    if (latitudeText === "" || longitudeText === "") {
        alert("Please enter both latitude and longitude.");
        return;
    }

    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        alert("Latitude must be between -90 and 90.");
        return;
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        alert("Longitude must be between -180 and 180.");
        return;
    }

    // SAVE ORIGINAL GPS (only if not already saved)
    if (photo.originalLatitude === undefined) {

        photo.originalLatitude = photo.latitude;
        photo.originalLongitude = photo.longitude;
        photo.originalAccuracy = photo.accuracy;
        photo.originalAddress = photo.address || "";
        photo.originalCoordinate = photo.coordinate || "";
        photo.originalGpsSource = photo.gpsSource || "none";

    }

    // KEEP THE ADDRESS CURRENTLY SELECTED IN THE DROPDOWN
    if (
        multipleAddressInput &&
        multipleAddressInput.tagName === "SELECT" &&
        multipleAddressInput.value
    ) {
        photo.address = multipleAddressInput.value;
    }

    // SAVE MANUAL GPS (address is NOT touched)
    photo.latitude = latitude;
    photo.longitude = longitude;
    photo.accuracy = null;
    photo.coordinate = formatCoordinate(latitude, longitude);
    photo.gpsSource = "manual";
    photo.manuallyAdjusted = true;

    if (getCurrentUploadedPhoto() === photo) {

        updateCurrentPhotoLocation(photo);

        if (typeof render === "function") {
            render();
        }

    }

    console.log("MANUAL LOCATION SAVED:", {
        photo: photo.name,
        latitude: photo.latitude,
        longitude: photo.longitude,
        coordinate: photo.coordinate,
        address: photo.address
    });

}


// ============================================================
// RESET GPS
// ============================================================

async function resetManualLocation() {

    const photo = getCurrentUploadedPhoto();

    if (!photo) {
        alert("Please upload a photo first.");
        return;
    }

    if (
        photo.originalLatitude === null ||
        photo.originalLatitude === undefined ||
        photo.originalLongitude === null ||
        photo.originalLongitude === undefined
    ) {
        alert("This photo has no original GPS coordinates.");
        return;
    }

    // RESTORE ORIGINAL GPS
    photo.latitude = photo.originalLatitude;
    photo.longitude = photo.originalLongitude;
    photo.accuracy = photo.originalAccuracy;
    photo.address = photo.originalAddress || "";
    photo.coordinate = formatCoordinate(photo.latitude, photo.longitude);
    photo.gpsSource = photo.originalGpsSource || "none";
    photo.manuallyAdjusted = false;

    // If original address is empty, look it up again
    if (
        !photo.address &&
        photo.latitude !== null &&
        photo.longitude !== null
    ) {

        try {
            if (typeof window.reverseGeocode === "function") {
                photo.address = await window.reverseGeocode(
                    photo.latitude,
                    photo.longitude
                );
            }
        } catch (error) {
            console.warn("Reset address lookup failed:", error);
        }

    }

    // UPDATE SCREEN
    if (getCurrentUploadedPhoto() === photo) {

        updateCurrentPhotoLocation(photo);

        if (typeof render === "function") {
            render();
        }

    }

    console.log("GPS RESET:", {
        photo: photo.name,
        latitude: photo.latitude,
        longitude: photo.longitude,
        coordinate: photo.coordinate,
        address: photo.address
    });

}


// ============================================================
// GETTERS
// ============================================================

function getCurrentUploadedFile() {

    const photo = getCurrentUploadedPhoto();

    return photo ? photo.file : null;

}


function getCurrentPhotoLocation() {

    const photo = getCurrentUploadedPhoto();

    if (!photo) {
        return {
            latitude: null,
            longitude: null,
            accuracy: null,
            address: "",
            coordinate: "",
            gpsSource: "none",
            manuallyAdjusted: false
        };
    }

    return {
        latitude: photo.latitude ?? null,
        longitude: photo.longitude ?? null,
        accuracy: photo.accuracy ?? null,
        address: photo.address || "",
        coordinate: formatCoordinate(photo.latitude, photo.longitude),
        gpsSource: photo.gpsSource || "none",
        manuallyAdjusted: photo.manuallyAdjusted === true
    };

}


function getCurrentPhotoCoordinate() {

    const photo = getCurrentUploadedPhoto();

    if (!photo) {
        return "";
    }

    return formatCoordinate(photo.latitude, photo.longitude);

}


function getCurrentPhotoAddress() {

    const photo = getCurrentUploadedPhoto();

    return photo ? photo.address || "" : "";

}


// ============================================================
// UPDATE PHOTO GALLERY
// ============================================================

function updatePhotoGallery() {

    const status = document.getElementById("uploadStatus");
    const counter = document.getElementById("photoCounter");
    const previousBtn = document.getElementById("previousPhotoBtn");
    const nextBtn = document.getElementById("nextPhotoBtn");

    const total = uploadedImages.length;

    if (status) {
        status.textContent =
            total === 0
                ? "0 photos uploaded"
                : total + (total === 1 ? " photo uploaded" : " photos uploaded");
    }

    if (counter) {
        counter.textContent =
            total === 0
                ? "0 / 0"
                : (currentImageIndex + 1) + " / " + total;
    }

    if (previousBtn) {
        previousBtn.disabled = total <= 1;
    }

    if (nextBtn) {
        nextBtn.disabled = total <= 1;
    }

}


// ============================================================
// CONNECT BUTTONS
// ============================================================

function bindOnce(element, eventName, handler) {

    if (!element || element.dataset.timemarkBound === "true") {
        return;
    }

    element.addEventListener(eventName, handler);
    element.dataset.timemarkBound = "true";

}


function initializeLocationEvents() {

    bindOnce(multiplePhotoInput, "change", handlePhotoUpload);

    bindOnce(applyLocationBtn, "click", function (event) {

        event.preventDefault();

        applyManualLocation().catch(function (error) {
            console.error("Apply location error:", error);
        });

    });

    bindOnce(resetLocationBtn, "click", function (event) {

        event.preventDefault();

        resetManualLocation().catch(function (error) {
            console.error("Reset location error:", error);
        });

    });

}


// ============================================================
// DOM READY
// ============================================================

function initializeTimeMarkLocation() {

    initializeLocationElements();
    initializeLocationEvents();
    updatePhotoGallery();

    console.log("TimeMark multiple-photo location system initialized.");

}


if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTimeMarkLocation);
} else {
    initializeTimeMarkLocation();
}


// ============================================================
// GLOBAL EXPORTS
// ============================================================

window.uploadedImages = uploadedImages;
window.formatCoordinate = formatCoordinate;
window.getCurrentPhoneLocation = getCurrentPhoneLocation;
window.handlePhotoUpload = handlePhotoUpload;
window.readPhotoGPS = readPhotoGPS;
window.showUploadedImage = showUploadedImage;
window.nextPhoto = nextPhoto;
window.previousPhoto = previousPhoto;
window.getCurrentUploadedPhoto = getCurrentUploadedPhoto;
window.getCurrentUploadedFile = getCurrentUploadedFile;
window.getCurrentPhotoLocation = getCurrentPhotoLocation;
window.getCurrentPhotoCoordinate = getCurrentPhotoCoordinate;
window.getCurrentPhotoAddress = getCurrentPhotoAddress;
window.updateCurrentPhotoLocation = updateCurrentPhotoLocation;
window.applyManualLocation = applyManualLocation;
window.resetManualLocation = resetManualLocation;
window.updatePhotoGallery = updatePhotoGallery;


// ============================================================
// REVERSE GEOCODING CHECK
// location.js should be loaded before this file.
// ============================================================

if (typeof window.reverseGeocode === "function") {
    console.log("TimeMark reverseGeocode() detected.");
} else {
    console.warn(
        "TimeMark reverseGeocode() is not available yet. " +
        "Make sure location.js is loaded."
    );
}


// ============================================================
// END MULTIPLE.JS
// ============================================================

})();