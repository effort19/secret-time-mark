
"use strict";

// ============================================================
// TIMEMARK CANVAS SETUP
// ============================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const FONT =
    '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';

let image = new Image();
let hasPhoto = false;


// ============================================================
// LOCATION FIELDS
// ============================================================

const addressInput =
    document.getElementById("address");

const coordinateInput =
    document.getElementById("coordinate");


// ============================================================
// LOAD IMAGE ASSET
// ============================================================

function loadAsset(path) {

    const asset = new Image();

    asset.onload = function () {

        if (hasPhoto) {
            render();
        }

    };

    asset.onerror = function () {

        console.warn(
            "Could not load image:",
            path
        );

    };

    asset.src = path;

    return asset;
}


const badgeImage =
    loadAsset("./img/badge.png");

const timeMarkLogo =
    loadAsset("./img/timemark-logo.png");


// ============================================================
// VALUE HELPER
// ============================================================

function val(id) {

    const element =
        document.getElementById(id);

    return element
        ? element.value.trim()
        : "";

}


// ============================================================
// INPUTS
// ============================================================

const inputIds = [
    "title",
    "technology",
    "area",
    "tech",
    "date",
    "time",
    "timezone",
    "address",
    "coordinate",
    "verified",
    "verificationCode"
];


// ============================================================
// INPUT EVENTS
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        inputIds.forEach(function (id) {

            const element =
                document.getElementById(id);

            if (!element) {
                return;
            }

            element.addEventListener(
                "input",
                render
            );

        });

        render();

    }
);


// ============================================================
// VERIFICATION CODE
// ============================================================

function generateVerificationCode() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (
        let i = 0;
        i < 14;
        i++
    ) {

        result +=
            characters.charAt(
                Math.floor(
                    Math.random() *
                    characters.length
                )
            );

    }

    return result;
}


function updateVerificationCode() {

    const input =
        document.getElementById(
            "verificationCode"
        );

    const code =
        generateVerificationCode();

    if (input) {
        input.value = code;
    }

    return code;
}


// ============================================================
// TEXT FIT
// ============================================================

function fitText(
    text,
    maxWidth,
    maxSize,
    minSize
) {

    let size = maxSize;

    while (
        size > minSize
    ) {

        ctx.font =
            `700 ${size}px ${FONT}`;

        if (
            ctx.measureText(text).width <=
            maxWidth
        ) {

            break;

        }

        size--;

    }

    return size;
}


// ============================================================
// TEXT WRAP
// ============================================================

function wrapText(
    text,
    maxWidth,
    fontSize,
    maxLines = 2
) {

    ctx.font =
        `${fontSize}px ${FONT}`;

    const words =
        String(text || "")
            .split(/\s+/)
            .filter(Boolean);

    if (!words.length) {
        return [""];
    }

    const lines = [];

    let line = "";

    for (
        const word of words
    ) {

        const test =
            line
                ? `${line} ${word}`
                : word;

        if (
            ctx.measureText(test).width <=
            maxWidth
        ) {

            line = test;

        }
        else {

            if (line) {
                lines.push(line);
            }

            line = word;

        }

    }

    if (line) {
        lines.push(line);
    }

    if (
        lines.length <= maxLines
    ) {

        return lines;

    }

    const result =
        lines.slice(
            0,
            maxLines
        );

    let last =
        result[maxLines - 1];

    while (
        last.length &&
        ctx.measureText(
            last + "…"
        ).width > maxWidth
    ) {

        last =
            last.slice(
                0,
                -1
            );

    }

    result[maxLines - 1] =
        last.trimEnd() + "…";

    return result;
}


// ============================================================
// PLACEHOLDER
// ============================================================

function drawPlaceholder() {

    canvas.width = 1000;
    canvas.height = 700;

    ctx.fillStyle = "#555";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#fff";

    ctx.font =
        `700 34px ${FONT}`;

    ctx.fillText(
        "Upload a photo to begin",
        canvas.width / 2,
        canvas.height / 2
    );

    ctx.font =
        `20px ${FONT}`;

    ctx.fillText(
        "Your TimeMark overlay will appear here.",
        canvas.width / 2,
        canvas.height / 2 + 40
    );
}


// ============================================================
// MAIN RENDER
// ============================================================

function render() {

    if (
        !hasPhoto ||
        !image.naturalWidth
    ) {

        drawPlaceholder();

        return;

    }


    const maxWidth = 1400;

    const scale =
        Math.min(
            1,
            maxWidth /
            image.naturalWidth
        );


    const w =
        Math.round(
            image.naturalWidth *
            scale
        );

    const h =
        Math.round(
            image.naturalHeight *
            scale
        );


    canvas.width = w;
    canvas.height = h;


    // --------------------------------------------------------
    // PHOTO
    // --------------------------------------------------------

    ctx.drawImage(
        image,
        0,
        0,
        w,
        h
    );


    const s =
        Math.max(
            0.65,
            w / 1200
        );


    const margin =
        22 * s;


    // --------------------------------------------------------
    // WATERMARK
    // --------------------------------------------------------

    drawVerticalVerification(
        w,
        h,
        s
    );


    // --------------------------------------------------------
    // INFORMATION PANEL
    // --------------------------------------------------------

    drawInformationPanel(
        w,
        h,
        s,
        margin
    );


    // --------------------------------------------------------
    // LOGO
    // --------------------------------------------------------

    drawTimeMarkLogo(
        w,
        h,
        s
    );

}




  


// ============================================================
// TIME MARK — INFORMATION PANEL
// Verification / vertical badge removed
// ============================================================



// ============================================================
// TEXT WRAPPING — NO "..." FOR ADDRESS
// ============================================================

function wrapPanelText(
    text,
    maxWidth,
    fontSize,
    maxLines
) {

    text = String(text || "")
        .replace(/\s+/g, " ")
        .trim();

    if (!text) {
        return [""];
    }

    const words = text.split(" ");
    const lines = [];
    let current = "";

    for (let i = 0; i < words.length; i++) {

        const word = words[i];

        const test =
            current
                ? current + " " + word
                : word;

        const width =
            ctx.measureText(test).width;

        if (width <= maxWidth) {

            current = test;

        } else {

            if (current) {
                lines.push(current);
            }

            current = word;
        }
    }

    if (current) {
        lines.push(current);
    }

    // ========================================================
    // DO NOT CUT ADDRESS
    // ========================================================

    return lines;
}



// ============================================================
// LOGO
// ============================================================

function drawTimeMarkLogo(
    w,
    h,
    s
) {

    ctx.save();


    const logoW =
        260 * s;

    const logoH =
        250 * s;


    const marginRight =
        3 * s;

    const marginBottom =
        2 * s;


    if (
        timeMarkLogo.complete &&
        timeMarkLogo.naturalWidth > 0
    ) {

        const ratio =
            Math.min(
                logoW /
                timeMarkLogo.naturalWidth,
                logoH /
                timeMarkLogo.naturalHeight
            );


        const drawW =
            timeMarkLogo.naturalWidth *
            ratio;


        const drawH =
            timeMarkLogo.naturalHeight *
            ratio;


        const x =
            w -
            drawW -
            marginRight;


        const y =
            h -
            drawH -
            marginBottom;


        ctx.drawImage(
            timeMarkLogo,
            x,
            y,
            drawW,
            drawH
        );

    }


    ctx.restore();

}


// ============================================================
// INITIAL DRAW
// ============================================================

drawPlaceholder();


if (
    document.fonts &&
    document.fonts.ready
) {

    document.fonts.ready.then(
        function () {

            render();

        }
    );

}

