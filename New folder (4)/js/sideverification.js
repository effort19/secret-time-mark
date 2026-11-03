// ============================================================
// VERTICAL VERIFICATION STRIP
// Depends on (defined elsewhere in your project):
//   ctx, val(), badgeImage
// ============================================================


// ------------------------------------------------------------
// SETTINGS (design pixels at s = 1)
// ------------------------------------------------------------

const VERIFICATION = {

    // Text
    font: "'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontWeight: 400,
    fontSize: 30,
    textColor: "#FFFFFF",

    // Badge
    badgeWidth: 46,
    badgeHeight: 40,
    badgeRotation: 90,        // degrees, relative to the rotated strip
    badgeGap: 6,              // badge -> code
    badgeOffsetY: -4,         // nudges badge across the strip (was BADGE_LEFT)

    // Gap between the code and "Timemark Verified"
    textGap: 14,

    // Position
    rightMargin: 18,          // distance from right edge
    verticalPosition: -100    // offset from vertical center
};


// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function isBadgeReady() {
    return (
        typeof badgeImage !== "undefined" &&
        badgeImage &&
        badgeImage.complete &&
        badgeImage.naturalWidth > 0
    );
}


function drawVerificationBadge(centerX, centerY, width, height, rotationDeg) {

    ctx.save();

    ctx.translate(centerX, centerY);
    ctx.rotate(rotationDeg * Math.PI / 180);

    ctx.drawImage(badgeImage, -width / 2, -height / 2, width, height);

    ctx.restore();
}


// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

function drawVerticalVerification(w, h, s) {

    const V = VERIFICATION;

    // Values
    const code = val("verificationCode") || "";
    const verifiedText = val("verified") || "Timemark Verified";

    // Scaled sizes
    const fontSize = V.fontSize * s;
    const badgeW = V.badgeWidth * s;
    const badgeH = V.badgeHeight * s;

    ctx.save();

    // Place on the right side, then rotate the whole strip
    ctx.translate(w - V.rightMargin * s, h / 2 + V.verticalPosition * s);
    ctx.rotate(-Math.PI / 2);

    // Font
    ctx.font = `${V.fontWeight} ${fontSize}px ${V.font}`;
    ctx.fontKerning = "normal";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = V.textColor;

    // Measure
    const codeWidth = code ? ctx.measureText(code).width : 0;
    const verifiedWidth = ctx.measureText(verifiedText).width;
    const textGap = code ? V.textGap * s : 0;

    // A badge turned 90 degrees takes up its HEIGHT along the text direction
    const badgeReady = isBadgeReady();
    const isSideways = Math.abs(V.badgeRotation) % 180 === 90;
    const badgeAlongText = isSideways ? badgeH : badgeW;
    const badgeSpace = badgeReady ? badgeAlongText + V.badgeGap * s : 0;

    // Center everything as one block
    const totalWidth = badgeSpace + codeWidth + textGap + verifiedWidth;
    let x = -totalWidth / 2;

    // Badge
    if (badgeReady) {
        drawVerificationBadge(
            x + badgeAlongText / 2,
            V.badgeOffsetY * s,
            badgeW,
            badgeH,
            V.badgeRotation
        );
    }

    x += badgeSpace;

    // Code
    if (code) {
        ctx.fillText(code, x, 0);
        x += codeWidth + textGap;
    }

    // "Timemark Verified"
    ctx.fillText(verifiedText, x, 0);

    ctx.restore();
}   