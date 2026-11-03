"use strict";

// ============================================================
// TIMEMARK — SAVE ALL INDIVIDUAL PHOTOS
// iOS / iPadOS / Android / Desktop
//
// Depends on (defined elsewhere in your project):
//   uploadedImages, currentImageIndex, showUploadedImage(index)
// Expects in the HTML:
//   <button id="all"> and <canvas id="canvas">
// ============================================================

window.TimeMark = window.TimeMark || {};


// ------------------------------------------------------------
// SETTINGS
// ------------------------------------------------------------

const SAVE_ALL = {
    jpegQuality: 0.95,
    renderSettleDelay: 100,      // ms to wait after the canvas redraws
    delayBetweenSaves: 500,      // ms between downloads (helps desktop browsers)
    objectUrlLifetime: 10000     // ms before a download URL is released
};


// ============================================================
// MAIN: SAVE ALL
// ============================================================

window.downloadAllImages = async function () {

    console.log("TimeMark: Save ALL clicked");

    if (!hasUploadedPhotos()) {
        alert("Please upload photos first.");
        return;
    }

    const button = document.getElementById("all");

    if (!button) {
        alert("Save ALL button was not found.");
        return;
    }

    if (button.disabled) {
        return;
    }

    const originalLabel = button.textContent;
    const originalIndex = getCurrentPhotoIndex();
    const total = uploadedImages.length;

    let savedCount = 0;

    button.disabled = true;

    try {

        for (let i = 0; i < total; i++) {

            button.textContent = "Saving " + (i + 1) + " / " + total;
            console.log("Processing:", i + 1, uploadedImages[i]);

            const wasSaved = await renderAndSavePhoto(i);

            if (wasSaved) {
                savedCount++;
                await delay(SAVE_ALL.delayBetweenSaves);
            }
        }

        // Go back to the photo the user was looking at
        showUploadedImage(Math.min(originalIndex, total - 1));

        console.log("Save ALL finished:", savedCount, "/", total);
        showSaveResult(savedCount, total);

    } catch (error) {

        console.error("SAVE ALL ERROR:", error);

        alert(
            "Unable to save photos.\n\n" +
            (error.message || "Unknown error.")
        );

    } finally {

        button.disabled = false;
        button.textContent = originalLabel;
    }
};


// ============================================================
// STEPS USED BY SAVE ALL
// ============================================================

function hasUploadedPhotos() {
    return (
        typeof uploadedImages !== "undefined" &&
        Array.isArray(uploadedImages) &&
        uploadedImages.length > 0
    );
}


function getCurrentPhotoIndex() {
    return typeof currentImageIndex !== "undefined"
        ? currentImageIndex
        : 0;
}


// Shows one photo, waits for it to draw, then saves the canvas.
// Returns true if the photo was saved, false if it was skipped.
async function renderAndSavePhoto(index) {

    const photo = uploadedImages[index];

    if (typeof showUploadedImage !== "function") {
        throw new Error("showUploadedImage() was not found.");
    }

    showUploadedImage(index);
    await waitForSaveRender();

    const canvas = document.getElementById("canvas");

    if (!canvas) {
        throw new Error("Canvas #canvas was not found.");
    }

    if (canvas.width <= 0 || canvas.height <= 0) {
        console.warn("Invalid canvas size:", index);
        return false;
    }

    const blob = await canvasToBlob(canvas, "image/jpeg", SAVE_ALL.jpegQuality);

    if (!blob) {
        console.warn("Could not create image:", photo);
        return false;
    }

    await saveIndividualPhoto(blob, createSaveAllFilename(photo, index));
    return true;
}


function showSaveResult(savedCount, total) {

    if (savedCount === total) {

        const plural = savedCount === 1 ? "" : "s";
        alert(savedCount + " photo" + plural + " saved successfully.");
        return;
    }

    alert(
        savedCount + " of " + total + " photos were processed.\n\n" +
        "If you are using iPhone/iPad, Safari may require " +
        "each download to be confirmed because iOS blocks " +
        "multiple automatic downloads from websites."
    );
}


// ============================================================
// SAVE ONE PHOTO
// ============================================================

function isIOS() {
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
}


async function saveIndividualPhoto(blob, filename) {

    if (!blob) {
        throw new Error("Empty image.");
    }

    // On supported iPhones/iPads, open the native Share Sheet
    if (isIOS() && await tryShareOnIOS(blob, filename)) {
        return;
    }

    // Everything else: normal browser download
    downloadBlob(blob, filename);
}


// Returns true if the Share Sheet was used, false to fall back to a download
async function tryShareOnIOS(blob, filename) {

    const canShare =
        typeof File !== "undefined" &&
        navigator.share &&
        navigator.canShare;

    if (!canShare) {
        return false;
    }

    try {

        const file = new File([blob], filename, { type: "image/jpeg" });

        if (!navigator.canShare({ files: [file] })) {
            return false;
        }

        await navigator.share({ files: [file], title: filename });
        return true;

    } catch (error) {

        // The user may have closed the Share Sheet.
        // Don't stop Save ALL completely.
        console.warn("iOS Share failed:", error);
        return false;
    }
}


// ============================================================
// CANVAS → BLOB
// ============================================================

function canvasToBlob(canvas, type, quality) {

    const mimeType = type || "image/jpeg";
    const jpegQuality = typeof quality === "number" ? quality : 0.95;

    return new Promise(function (resolve, reject) {

        try {

            // Old browsers without canvas.toBlob
            if (typeof canvas.toBlob !== "function") {
                resolve(dataURLToBlob(canvas.toDataURL(mimeType, jpegQuality)));
                return;
            }

            canvas.toBlob(function (blob) {

                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Canvas could not be converted to JPEG."));
                }

            }, mimeType, jpegQuality);

        } catch (error) {

            reject(error);
        }
    });
}


function dataURLToBlob(dataURL) {

    const parts = dataURL.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
}


// ============================================================
// NORMAL DOWNLOAD
// ============================================================

function downloadBlob(blob, filename) {

    if (!blob) {
        throw new Error("Download failed.");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    // Keep the link off-screen
    link.style.position = "fixed";
    link.style.left = "-99999px";
    link.style.top = "0";

    document.body.appendChild(link);
    link.click();

    setTimeout(function () {
        link.remove();
    }, 100);

    setTimeout(function () {
        URL.revokeObjectURL(url);
    }, SAVE_ALL.objectUrlLifetime);
}


// ============================================================
// FILE NAME
// Example: IMG_1234.jpg → IMG_1234_TimeMark_01.jpg
// ============================================================

function createSaveAllFilename(photo, index) {

    const number = index + 1;
    const fallbackName = "photo_" + number;

    let name = (photo && photo.name) ? photo.name : fallbackName;

    name = name
        .replace(/\.[^/.]+$/, "")                  // remove extension
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")    // remove invalid characters
        .trim();

    if (!name) {
        name = fallbackName;
    }

    return name + "_TimeMark_" + String(number).padStart(2, "0") + ".jpg";
}


// ============================================================
// TIMING HELPERS
// ============================================================

function nextFrame() {
    return new Promise(function (resolve) {
        requestAnimationFrame(resolve);
    });
}


// Waits two animation frames plus a short delay so the canvas
// has finished redrawing before it is saved.
async function waitForSaveRender() {
    await nextFrame();
    await nextFrame();
    await delay(SAVE_ALL.renderSettleDelay);
}


function delay(milliseconds) {
    return new Promise(function (resolve) {
        setTimeout(resolve, milliseconds);
    });
}


// ============================================================
// TIMEMARK ALIAS
// ============================================================

window.TimeMark.downloadAllImages = window.downloadAllImages;