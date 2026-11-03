// ============================================================
// TIMEMARK — VALIDATE REQUIRED FIELDS
// ============================================================
//
// Used by:
//
//     onclick="validateRequiredFields()"
//
// Returns:
//     true  = allow the button action
//     false = stop the button action
//
// ============================================================

function validateRequiredFields() {

    // --------------------------------------------------------
    // REQUIRED FIELD IDs
    // --------------------------------------------------------

    const requiredFields = [
        "title",
        "technology",
        "area",
        "tech",
        "date",
        "time",
        "address",
        "coordinate"
    ];


    // --------------------------------------------------------
    // CHECK EACH FIELD
    // --------------------------------------------------------

    for (
        let i = 0;
        i < requiredFields.length;
        i++
    ) {

        const id =
            requiredFields[i];

        const element =
            document.getElementById(id);


        // ----------------------------------------------------
        // ELEMENT DOES NOT EXIST
        // ----------------------------------------------------

        if (!element) {

            console.warn(
                "Required field not found:",
                "#" + id
            );

            continue;

        }


        // ----------------------------------------------------
        // GET VALUE
        // ----------------------------------------------------

        let value =
            String(
                element.value || ""
            ).trim();


        // ----------------------------------------------------
        // SELECT FIELD
        // ----------------------------------------------------

        if (
            element.tagName === "SELECT"
        ) {

            value =
                String(
                    element.value || ""
                ).trim();

        }


        // ----------------------------------------------------
        // EMPTY FIELD
        // ----------------------------------------------------

        if (!value) {

            // -----------------------------------------------
            // Remove previous validation
            // -----------------------------------------------

            element.classList.add(
                "is-invalid"
            );


            // -----------------------------------------------
            // Focus the empty field
            // -----------------------------------------------

            try {

                element.focus();

            } catch (error) {

                console.warn(
                    "Unable to focus field:",
                    id
                );

            }


            // -----------------------------------------------
            // Message
            // -----------------------------------------------

            console.warn(
                "Required field is empty:",
                "#" + id
            );


            return false;

        }


        // ----------------------------------------------------
        // FIELD IS VALID
        // ----------------------------------------------------

        element.classList.remove(
            "is-invalid"
        );

    }


    // --------------------------------------------------------
    // ALL REQUIRED FIELDS VALID
    // --------------------------------------------------------

    console.log(
        "All required fields are valid."
    );


    return true;

}


// ============================================================
// GLOBAL FUNCTION
// ============================================================
//
// IMPORTANT:
//
// Your HTML uses:
//
//     onclick="validateRequiredFields()"
//
// Inline HTML handlers need the function to be available
// globally.
//
// ============================================================

window.validateRequiredFields =
    validateRequiredFields;