"use strict";

// ============================================================
// CUSTOM AREAS  (add new areas to the #area dropdown)
// ============================================================

(function () {

    const STORAGE_KEY = "timemarkCustomAreas";

    let select, addBtn, box, input, saveBtn, cancelBtn;

    function normalize(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function loadCustomAreas() {
        try {
            const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(list) ? list : [];
        } catch (error) {
            return [];
        }
    }

    function saveCustomAreas(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (error) {
            console.warn("Could not save areas:", error);
        }
    }

    function findOption(value) {
        const key = value.toLowerCase();
        return Array.from(select.options).find(function (option) {
            return option.value.toLowerCase() === key;
        });
    }

    function addOption(value) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
        return option;
    }

    function openBox() {
        box.classList.remove("d-none");
        input.value = "";
        input.focus();
    }

    function closeBox() {
        box.classList.add("d-none");
        input.value = "";
    }

    function addNewArea() {

        const value = normalize(input.value);

        if (!value) {
            input.focus();
            return;
        }

        // already in the list: just select it
        let option = findOption(value);

        if (!option) {
            option = addOption(value);

            const saved = loadCustomAreas();
            saved.push(value);
            saveCustomAreas(saved);
        }

        select.value = option.value;

        // let the rest of the app (panel preview, saved photo data) update
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));

        closeBox();
    }

    function init() {

        select = document.getElementById("area");
        addBtn = document.getElementById("addAreaBtn");
        box = document.getElementById("newAreaBox");
        input = document.getElementById("newAreaInput");
        saveBtn = document.getElementById("saveAreaBtn");
        cancelBtn = document.getElementById("cancelAreaBtn");

        if (!select || !addBtn || !box || !input || !saveBtn || !cancelBtn) {
            return;
        }

        // restore saved areas
        loadCustomAreas().forEach(function (value) {
            const text = normalize(value);
            if (text && !findOption(text)) {
                addOption(text);
            }
        });

        addBtn.addEventListener("click", openBox);
        saveBtn.addEventListener("click", addNewArea);
        cancelBtn.addEventListener("click", closeBox);

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                addNewArea();
            } else if (event.key === "Escape") {
                closeBox();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();