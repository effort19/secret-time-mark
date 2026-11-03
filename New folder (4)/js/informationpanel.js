// ========================================================
// Draw Panel
// ========================================================

// Address wrapping:
//   fits on one line  ->  "Town, Province"
//   too wide          ->  "Town,"
//                         "Province"
// IMPORTANT: it must measure with the SAME font that is drawn on the
// panel (passed in as `font`), otherwise the width is wrong and the
// address breaks onto two lines even when it would fit.
function wrapAddressText(text, maxWidth, fontSize, maxLines = 10, font) {

    if (!text) {
        return [""];
    }

    // Measure with the real panel font
    ctx.font = font || `400 ${fontSize}px ${PANEL.font}`;

    // Split address by comma
    const parts = text
        .split(",")
        .map(function (part) {
            return part.trim();
        })
        .filter(function (part) {
            return part.length > 0;
        });

    const lines = [];
    let currentLine = "";

    // Build natural address lines
    parts.forEach(function (part, index) {

        const isLast = index === parts.length - 1;
        const piece = isLast ? part : part + ",";

        const testLine = currentLine
            ? currentLine + " " + piece
            : piece;

        const testWidth = ctx.measureText(testLine).width;

        if (!currentLine || testWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = piece;
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    // Maximum lines
    if (lines.length > maxLines) {

        const result = lines.slice(0, maxLines);
        const remaining = lines.slice(maxLines).join(" ");

        if (remaining) {
            result[maxLines - 1] += " " + remaining;
        }

        return result;
    }

    return lines;
}


// ------------------------------------------------------------
// LAYOUT
// ------------------------------------------------------------

const PANEL = {
    width: 750,
    minHeight: 617,            // title + 6 rows
    x: 0,                      // distance from left edge
    bottomOffset: 0,           // distance from bottom edge

    titleHeight: 101,          // minimum title bar height (grows when title wraps)
    titleSize: 55,
    titleWeight: 700,
    titleMaxLines: 3,          // maximum title lines
    titleRightPadding: 18,
    titleVerticalPadding: 40,  // space above + below the title text block
    titleLineHeightMultiplier: 1.1,

    leftPadding: 22,
    labelWidth: 160,
    labelValueGap: 87,         // value column starts at x = 255
    valueLeftPadding: 8,
    valueRightPadding: 18,

    rowHeight: 86,
    rowVerticalPadding: 20,
    lineHeightMultiplier: 1.0,
    minLineHeight: 18,

    font: "'Roboto Condensed', 'Arial Narrow', Arial, sans-serif"
};


// ------------------------------------------------------------
// COLORS
// ------------------------------------------------------------

const PANEL_COLORS = {
    titleBar:  "rgba(233, 138, 44, 0.92)",
    titleText: "#ffffff",
    body:      "rgba(255, 255, 255, 0.88)",
    label:     "#555555",
    value:     "#111111",
    divider:   "rgba(180, 180, 180, 0.35)"
};


// ------------------------------------------------------------
// PER-ROW FONT SETTINGS
// Change size / weight for any single row here.
// ------------------------------------------------------------

const ROW_STYLES = {
    technology: { labelSize: 42, valueSize: 43, labelWeight: 700, valueWeight: 400 },
    area:       { labelSize: 42, valueSize: 43, labelWeight: 700, valueWeight: 400 },
    tech:       { labelSize: 42, valueSize: 43, labelWeight: 700, valueWeight: 400 },
    time:       { labelSize: 42, valueSize: 43, labelWeight: 700, valueWeight: 400 },
    address:    { labelSize: 42, valueSize: 43, labelWeight: 700, valueWeight: 400 },

    // Starts at 40 and shrinks automatically if it does not fit on one line
    coordinate: { labelSize: 42, valueSize: 40, labelWeight: 700, valueWeight: 400 }
};

// Smallest size a single-line row (time, coordinate) is allowed to shrink to
const COORDINATE_MIN_SIZE = 42;


// ------------------------------------------------------------
// COORDINATE FORMAT
// Result: 17.582397°N, 120.389073°E
// ------------------------------------------------------------

function formatCoordinateForPanel(value) {

    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")                // collapse extra spaces
        .replace(/°\s+([NSEW])/gi, "°$1")    // "° N" -> "°N"
        .replace(/\s*,\s*/, ", ");           // exactly one space after the comma
}


// ------------------------------------------------------------
// ROW DEFINITIONS
// ------------------------------------------------------------

function getPanelRows() {

    const coordinate = formatCoordinateForPanel(val("coordinate"));

    return [
        { key: "technology", label: "Technology", value: val("technology") || "", maxLines: 100 },
        { key: "area",       label: "Area",       value: val("area") || "",       maxLines: 1 },
        { key: "tech",       label: "Tech",       value: val("tech") || "",       maxLines: 10, slashWrap: true },
        { key: "time",       label: "Time",       value: getTimeDisplayValue(),   maxLines: 1, noWrap: true },
        { key: "address",    label: "Address",    value: val("address") || "",    maxLines: 40 },
        { key: "coordinate", label: "Coordinate", value: coordinate,              maxLines: 1, noWrap: true }
    ];
}


// ------------------------------------------------------------
// TITLE (wraps like the address, text shown as typed)
// ------------------------------------------------------------

function getPanelTitle() {
    return String(val("title") || "").trim();
}


// ------------------------------------------------------------
// BREAK A TOO-WIDE LINE  (shared by the title and the Tech row)
// ------------------------------------------------------------

// If `line` fits, it is returned as is. Otherwise it is broken by
// words, and a single word that is still too wide is broken by
// characters. `fits(text)` must measure with the real drawn font.
function breakLineToFit(line, fits) {

    if (fits(line)) {
        return [line];
    }

    const out = [];
    let cur = "";

    line.split(" ").forEach(function (word) {

        const test = cur ? cur + " " + word : word;

        if (fits(test)) {
            cur = test;
            return;
        }

        if (cur) {
            out.push(cur);
            cur = "";
        }

        if (fits(word)) {
            cur = word;
            return;
        }

        // Single long word: break by characters
        let chunk = "";

        for (const ch of word) {
            if (chunk && !fits(chunk + ch)) {
                out.push(chunk);
                chunk = ch;
            } else {
                chunk += ch;
            }
        }

        cur = chunk;
    });

    if (cur) {
        out.push(cur);
    }

    return out.length > 0 ? out : [""];
}


// Same wrapping style as the address: break at commas first.
// Fallback: a line that is still too wide is broken by words, then by characters.
function wrapTitleText(text, maxWidth, font, maxLines) {

    if (!text) {
        return [""];
    }

    ctx.font = font;

    const fits = function (t) {
        return ctx.measureText(t).width <= maxWidth;
    };

    const parts = text
        .split(",")
        .map(function (part) {
            return part.trim();
        })
        .filter(function (part) {
            return part.length > 0;
        });

    const lines = [];
    let currentLine = "";

    parts.forEach(function (part, index) {

        const isLast = index === parts.length - 1;
        const piece = isLast ? part : part + ",";
        const testLine = currentLine ? currentLine + " " + piece : piece;

        if (!currentLine || fits(testLine)) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = piece;
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    // Fallback for lines that are still too wide
    const fitted = [];

    lines.forEach(function (line) {
        breakLineToFit(line, fits).forEach(function (piece) {
            fitted.push(piece);
        });
    });

    // Respect maxLines: merge extra lines into the last allowed one
    if (maxLines && fitted.length > maxLines) {

        const result = fitted.slice(0, maxLines);
        result[maxLines - 1] += " " + fitted.slice(maxLines).join(" ");

        return result;
    }

    return fitted.length > 0 ? fitted : [""];
}


// ------------------------------------------------------------
// MEASURING
// ------------------------------------------------------------

// Wraps text only AFTER a "/" so each line ends with a slash:
//   "asfas/fsa/fas/"
//   "fas/asf/as/fas/f/asf/"
// A segment that is too wide on its own (no slash to break at) is
// broken by words, then by characters, just like the title, so the
// text never runs past the right edge of the panel.
function wrapSlashText(text, maxWidth, font, maxLines) {

    const value = String(text || "").trim();

    if (!value) {
        return [""];
    }

    ctx.font = font;

    const fits = function (t) {
        return ctx.measureText(t).width <= maxWidth;
    };

    // Split into pieces that each keep their trailing slash
    const parts = value.match(/[^/]+\/?|\//g) || [value];

    const lines = [];
    let current = "";

    parts.forEach(function (part) {

        // Fits on the current line
        if (fits(current + part)) {
            current += part;
            return;
        }

        // Does not fit: close the current line
        if (current) {
            lines.push(current);
            current = "";
        }

        // Fits on a line of its own
        if (fits(part)) {
            current = part;
            return;
        }

        // Too wide even alone: break by words / characters
        const pieces = breakLineToFit(part, fits);

        for (let i = 0; i < pieces.length - 1; i++) {
            lines.push(pieces[i]);
        }

        current = pieces[pieces.length - 1];
    });

    if (current) {
        lines.push(current);
    }

    // Respect maxLines: merge any extra lines into the last allowed one
    if (maxLines && lines.length > maxLines) {
        const kept = lines.slice(0, maxLines - 1);
        kept.push(lines.slice(maxLines - 1).join(""));
        return kept;
    }

    return lines.length > 0 ? lines : [""];
}


function getRowLines(row, valueWidth, valueSize, valueFont) {

    let lines;

    if (row.slashWrap) {
        lines = wrapSlashText(row.value, valueWidth, valueFont, row.maxLines);
    } else if (row.key === "address") {
        // FIX: pass valueFont so the width is measured with the real panel font
        lines = wrapAddressText(row.value, valueWidth, valueSize, row.maxLines, valueFont);
    } else if (row.noWrap) {
        // Keep ONE space (do not remove all spaces)
        lines = [String(row.value || "").replace(/\s+/g, " ").trim()];
    } else {
        lines = wrapPanelText(row.value, valueWidth, valueSize, row.maxLines);
    }

    return (lines && lines.length > 0) ? lines : [""];
}


function measureRow(row, valueWidth, s) {

    const style = ROW_STYLES[row.key];

    let valueSize = style.valueSize * s;
    let valueFont = `${style.valueWeight} ${valueSize}px ${PANEL.font}`;

    // Shrink single-line rows (coordinate) until they fit
    if (row.noWrap) {

        const text = String(row.value || "").replace(/\s+/g, " ").trim();
        const minSize = COORDINATE_MIN_SIZE * s;

        ctx.font = valueFont;

        while (ctx.measureText(text).width > valueWidth && valueSize > minSize) {
            valueSize -= s;
            valueFont = `${style.valueWeight} ${valueSize}px ${PANEL.font}`;
            ctx.font = valueFont;
        }
    }

    const lines = getRowLines(row, valueWidth, valueSize, valueFont);

    const lineHeight = Math.max(
        PANEL.minLineHeight * s,
        valueSize * PANEL.lineHeightMultiplier
    );

    const requiredHeight =
        lines.length * lineHeight + PANEL.rowVerticalPadding * s;

    return {
        label: row.label,
        lines: lines,
        lineHeight: lineHeight,
        rowHeight: Math.max(PANEL.rowHeight * s, requiredHeight),

        labelFont: `${style.labelWeight} ${style.labelSize * s}px ${PANEL.font}`,
        valueFont: valueFont
    };
}


function measurePanel(h, s) {

    const panelW = PANEL.width * s;

    // ---- Title (wrapped) ----
    const titleFont = `${PANEL.titleWeight} ${PANEL.titleSize * s}px ${PANEL.font}`;

    const titleWidth =
        panelW - (PANEL.leftPadding + PANEL.titleRightPadding) * s;

    const titleLines = wrapTitleText(
        getPanelTitle(),
        titleWidth,
        titleFont,
        PANEL.titleMaxLines
    );

    const titleLineHeight =
        PANEL.titleSize * s * PANEL.titleLineHeightMultiplier;

    // Title bar grows with the number of lines so it never overlaps the rows
    const titleH = Math.max(
        PANEL.titleHeight * s,
        titleLines.length * titleLineHeight + PANEL.titleVerticalPadding * s
    );

    // ---- Rows ----
    const valueOffset =
        PANEL.labelWidth + PANEL.valueLeftPadding + PANEL.labelValueGap;

    const valueWidth =
        panelW - (valueOffset + PANEL.valueRightPadding) * s;

    const rows = getPanelRows().map(function (row) {
        return measureRow(row, valueWidth, s);
    });

    const rowsTotal = rows.reduce(function (sum, row) {
        return sum + row.rowHeight;
    }, 0);

    const minRowsHeight = (PANEL.minHeight - PANEL.titleHeight) * s;
    const panelH = titleH + Math.max(minRowsHeight, rowsTotal);

    const panelX = PANEL.x * s;
    const panelY = h - panelH - PANEL.bottomOffset * s;

    return {
        x: panelX,
        y: panelY,
        w: panelW,
        h: panelH,
        titleH: titleH,
        titleLines: titleLines,
        titleLineHeight: titleLineHeight,
        titleFont: titleFont,
        labelX: panelX + PANEL.leftPadding * s,
        valueX: panelX + valueOffset * s,
        rows: rows
    };
}


// ------------------------------------------------------------
// DRAWING
// ------------------------------------------------------------

function drawPanelBackground(p) {

    // Body
    ctx.fillStyle = PANEL_COLORS.body;
    ctx.fillRect(p.x, p.y + p.titleH, p.w, p.h - p.titleH);

    // Title bar
    ctx.fillStyle = PANEL_COLORS.titleBar;
    ctx.fillRect(p.x, p.y, p.w, p.titleH);
}


function drawPanelTitle(p, s) {

    ctx.font = p.titleFont;
    ctx.fillStyle = PANEL_COLORS.titleText;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Vertically centered block of title lines
    const blockHeight = p.titleLines.length * p.titleLineHeight;
    const firstLineY =
        p.y + p.titleH / 2 - blockHeight / 2 + p.titleLineHeight / 2;

    p.titleLines.forEach(function (line, i) {
        ctx.fillText(line, p.labelX, firstLineY + i * p.titleLineHeight);
    });
}


function drawPanelDivider(p, y, s) {

    ctx.strokeStyle = PANEL_COLORS.divider;
    ctx.lineWidth = Math.max(1, s);

    ctx.beginPath();
    ctx.moveTo(p.x, y);
    ctx.lineTo(p.x + p.w, y);
    ctx.stroke();
}


function drawPanelRow(p, row, rowY) {

    const centerY = rowY + row.rowHeight / 2;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Label
    ctx.font = row.labelFont;
    ctx.fillStyle = PANEL_COLORS.label;
    ctx.fillText(row.label, p.labelX, centerY);

    // Value (vertically centered block of lines)
    ctx.font = row.valueFont;
    ctx.fillStyle = PANEL_COLORS.value;

    const blockHeight = row.lines.length * row.lineHeight;
    const firstLineY = centerY - blockHeight / 2 + row.lineHeight / 2;

    row.lines.forEach(function (line, i) {
        ctx.fillText(line, p.valueX, firstLineY + i * row.lineHeight);
    });
}


// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

function drawInformationPanel(w, h, s, margin) {

    const panel = measurePanel(h, s);

    ctx.save();
    ctx.globalAlpha = 1;

    drawPanelBackground(panel);
    drawPanelTitle(panel, s);

    let rowY = panel.y + panel.titleH;

    panel.rows.forEach(function (row, index) {

        if (index > 0) {
            drawPanelDivider(panel, rowY, s);
        }

        drawPanelRow(panel, row, rowY);
        rowY += row.rowHeight;
    });

    ctx.restore();
}