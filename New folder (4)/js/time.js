"use strict";
// ============================================================
// TIME DISPLAY
// ============================================================
// Output:
// Thurs, Oct 02, 2026 16:03
//
// 24-HOUR FORMAT
// NO AM/PM
// NO GMT
// NO GMT+8
// ============================================================

function getTimeDisplayValue() {
    return formatDateTime();
}


// ============================================================
// GET CURRENT PHILIPPINES DATE/TIME
// ============================================================

function getPhilippinesDateTime() {

    const now = new Date();

    const parts = new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: "Asia/Manila",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }
    ).formatToParts(now);

    const values = {};

    parts.forEach(part => {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    });

    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute)
    };
}


// ============================================================
// SET DEFAULT DATE
// ============================================================

function setDefaultDate() {

    const dateInput =
        document.getElementById("date");

    if (!dateInput) {
        return;
    }

    // Do not overwrite user's existing date
    if (dateInput.value) {
        return;
    }

    const ph =
        getPhilippinesDateTime();

    dateInput.value =
        `${ph.year}-${String(ph.month).padStart(2, "0")}-${String(ph.day).padStart(2, "0")}`;
}


// ============================================================
// SET DEFAULT TIME
// ============================================================

function setDefaultTime() {

    const timeInput =
        document.getElementById("time");

    if (!timeInput) {
        return;
    }

    // IMPORTANT:
    // Do NOT overwrite a time selected by the user.

    if (timeInput.value) {
        return;
    }

    const ph =
        getPhilippinesDateTime();

    timeInput.value =
        `${String(ph.hour).padStart(2, "0")}:${String(ph.minute).padStart(2, "0")}`;
}


// ============================================================
// INITIALIZE DATE + TIME
// ============================================================

function initializeDateTimeInputs() {

    setDefaultDate();
    setDefaultTime();
}


// ============================================================
// FORMAT DATE / TIME
// ============================================================
//
// Example:
//
// Thurs, Oct 02, 2026 16:03
//
// ============================================================

function formatDateTime() {

    const dateInput =
        document.getElementById("date");

    const timeInput =
        document.getElementById("time");


    const dateValue =
        dateInput
            ? dateInput.value
            : "";

    const timeValue =
        timeInput
            ? timeInput.value
            : "";


    // ========================================================
    // DATE
    // ========================================================

    let year;
    let month;
    let day;


    if (
        /^\d{4}-\d{2}-\d{2}$/.test(
            dateValue
        )
    ) {

        const parts =
            dateValue
                .split("-")
                .map(Number);

        year = parts[0];
        month = parts[1];
        day = parts[2];

    } else {

        const ph =
            getPhilippinesDateTime();

        year = ph.year;
        month = ph.month;
        day = ph.day;
    }


    // ========================================================
    // CREATE LOCAL DATE FOR WEEKDAY
    // ========================================================

    const date =
        new Date(
            year,
            month - 1,
            day
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return timeValue || "";
    }


    // ========================================================
    // WEEKDAY
    // ========================================================

    const weekday =
        date.toLocaleDateString(
            "en-US",
            {
                weekday: "short"
            }
        );


    // ========================================================
    // MONTH
    // ========================================================

    const monthName =
        date.toLocaleDateString(
            "en-US",
            {
                month: "short"
            }
        );


    // ========================================================
    // DAY
    // ========================================================

    const displayDay =
        String(day).padStart(
            2,
            "0"
        );


    // ========================================================
    // TIME
    // ========================================================

    let hour;
    let minute;


    if (
        /^\d{2}:\d{2}$/.test(
            timeValue
        )
    ) {

        const parts =
            timeValue
                .split(":")
                .map(Number);

        hour = parts[0];
        minute = parts[1];

    } else {

        const ph =
            getPhilippinesDateTime();

        hour = ph.hour;
        minute = ph.minute;
    }


    // ========================================================
    // VALIDATE HOUR
    // ========================================================

    if (
        !Number.isFinite(hour) ||
        hour < 0 ||
        hour > 23
    ) {

        hour = 0;
    }


    // ========================================================
    // VALIDATE MINUTE
    // ========================================================

    if (
        !Number.isFinite(minute) ||
        minute < 0 ||
        minute > 59
    ) {

        minute = 0;
    }


    // ========================================================
    // 24-HOUR TIME
    // ========================================================

    const displayHour =
        String(hour).padStart(
            2,
            "0"
        );

    const displayMinute =
        String(minute).padStart(
            2,
            "0"
        );


    // ========================================================
    // FINAL OUTPUT
    // ========================================================

            return (
            `${weekday}, ` +
            `${monthName} ${displayDay}, ${year}  ` +
            `${displayHour}:${displayMinute}`
        );
        }



document.addEventListener(
    "DOMContentLoaded",
    function () {

        initializeDateTimeInputs();

    }
);