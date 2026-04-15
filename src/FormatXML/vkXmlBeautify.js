/**
 * Pretty-print XML — logic từ mikeburgh.xml-format (vkBeautify), có xử lý <clientScript> cho FastBusiness.
 * MIT (vkBeautify) — Vadim Kiryukhin / Mike Burgh adaptation.
 */

function createShiftArr(step) {
    var space = "    ";

    if (isNaN(parseInt(step, 10))) {
        space = step;
    } else {
        switch (step) {
            case 1:
                space = " ";
                break;
            case 2:
                space = "  ";
                break;
            case 3:
                space = "   ";
                break;
            case 4:
                space = "    ";
                break;
            case 5:
                space = "     ";
                break;
            case 6:
                space = "      ";
                break;
            case 7:
                space = "       ";
                break;
            case 8:
                space = "        ";
                break;
            case 9:
                space = "         ";
                break;
            case 10:
                space = "          ";
                break;
            case 11:
                space = "           ";
                break;
            case 12:
                space = "            ";
                break;
            default:
                space = "    ";
        }
    }

    var shift = ["\n"];
    for (var ix = 0; ix < 100; ix++) {
        shift.push(shift[ix] + space);
    }
    return shift;
}

function VKBeautify() {
    this.steps = {};
}

/**
 * @param {string} text
 * @param {number|string} indentStep — số khoảng (1–12) hoặc '\t'
 */
VKBeautify.prototype.xml = function (text, indentStep) {
    if (indentStep === undefined || indentStep === null) {
        indentStep = 4;
    }

    var ar = text
            .trim()
            .replace(/</g, "~::~<")
            .split("~::~"),
        len = ar.length,
        inComment = false,
        inCDATA = false,
        inDoctype = false,
        inClientScript = false,
        deep_real = 0,
        deep = 0,
        str = "",
        ix = 0;

    if (!this.steps[indentStep]) {
        this.steps[indentStep] = createShiftArr(indentStep);
    }
    var shift = this.steps[indentStep];

    for (ix = 0; ix < len; ix++) {
        if (inComment) {
            str += ar[ix];
            if (ar[ix].search(/-->/) > -1) {
                inComment = false;
            }
        } else if (inCDATA) {
            str += ar[ix];
            if (ar[ix].search(/\]\]>/) > -1) {
                inCDATA = false;
            }
        } else if (ar[ix].search(/<!--/) > -1) {
            str = str.trim() + shift[deep] + ar[ix];
            inComment = true;
            if (ar[ix].search(/-->/) > -1) {
                inComment = false;
            }
        } else if (ar[ix].search(/<!\[CDATA\[/) > -1) {
            str += ar[ix];
            inCDATA = true;
            if (ar[ix].search(/\]\]>/) > -1) {
                inCDATA = false;
            }
        } else if (ar[ix].search(/\]\]>/) > -1) {
            str += ar[ix];
            inCDATA = false;
        } else if (ar[ix].search(/<!DOCTYPE/) > -1) {
            str = str.trim() + shift[deep] + ar[ix].trim();
            inDoctype = true;
        } else if (inDoctype && ar[ix].search(/]>/) > -1) {
            str += shift[deep + 1] + ar[ix].trim();
            inDoctype = false;
        } else if (inDoctype) {
            str += shift[deep + 1] + ar[ix].trim();
        } else if (ar[ix].search(/<clientScript>/) > -1) {
            str = str.trim() + shift[deep] + ar[ix];
            inClientScript = true;
        } else if (inClientScript && ar[ix].search(/<\/clientScript>/) > -1) {
            str += ar[ix];
            inClientScript = false;
        } else if (
            ix > 0 &&
            /^<\/[^<>!?/\s]/.exec(ar[ix]) &&
            /^<[^<>!?/\s]/.exec(ar[ix - 1]) &&
            /^<\/[^<>!?/\s]+/.exec(ar[ix])[0].replace("/", "") === /^<[^<>!?/\s]+/.exec(ar[ix - 1])[0]
        ) {
            if (deep_real > 0) deep_real--;
            if (deep_real <= 100) deep = deep_real;
            str += ar[ix];
        } else if (ar[ix].search(/<\//) > -1) {
            if (deep_real > 0) deep_real--;
            if (deep_real <= 100) deep = deep_real;
            str = str.trim() + shift[deep] + ar[ix];
        } else if (ar[ix].search(/<[^<>!?/\s]/) > -1) {
            str = str.trim() + shift[deep] + ar[ix];
            deep_real++;
            if (ar[ix].search(/\/>/) > -1) {
                deep_real--;
            }
            if (deep_real <= 100) deep = deep_real;
        } else {
            str += ar[ix];
        }
    }

    return str.trim();
};

module.exports = { VKBeautify };
