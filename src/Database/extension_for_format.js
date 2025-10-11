const vscode = require('vscode');

var vkbeautify;

///Following is based on https://github.com/vkiryukhin/vkBeautify
//Extracted the xml format method only.

/**
* vkBeautify - javascript plugin to pretty-print or minify text in XML, JSON, CSS and SQL formats.
*  
* Version - 0.99.00.beta 
* Copyright (c) 2012 Vadim Kiryukhin
* vkiryukhin @ gmail.com
* http://www.eslinstructor.net/vkbeautify/
* 
* MIT license:
*   http://www.opensource.org/licenses/mit-license.php
*/
function createShiftArr(step) {

    var space = '    ';

    if (isNaN(parseInt(step))) {  // argument is string
        space = step;
    } else { // argument is integer
        switch (step) {
            case 1: space = ' '; break;
            case 2: space = '  '; break;
            case 3: space = '   '; break;
            case 4: space = '    '; break;
            case 5: space = '     '; break;
            case 6: space = '      '; break;
            case 7: space = '       '; break;
            case 8: space = '        '; break;
            case 9: space = '         '; break;
            case 10: space = '          '; break;
            case 11: space = '           '; break;
            case 12: space = '            '; break;
        }
    }

    var shift = ['\n']; // array of shifts
    for (ix = 0; ix < 100; ix++) {
        shift.push(shift[ix] + space);
    }
    return shift;
}

function VKBeautify() {
    this.steps = {};//hold cache of our step configs (based on indent type and size)
};

VKBeautify.prototype.xml = function (text) {
    var ar = text
        .trim()
        .replace(/</g, '~::~<')
        .split('~::~'),
        len = ar.length,
        inComment = false,
        inCDATA = false,
        inDoctype = false,
        inClientScript = false,  // Thêm biến theo dõi <clientScript>
        deep_real = 0,
        deep = 0,
        str = '',
        ix = 0,
        step = vscode.window.activeTextEditor.options.insertSpaces ? vscode.window.activeTextEditor.options.tabSize : '\t'; // Read active editor's indent config!

    if (!this.steps[step]) {
        this.steps[step] = createShiftArr(step);
    }
    shift = this.steps[step];

    for (ix = 0; ix < len; ix++) {
        // In comment
        if (inComment) {
            str += ar[ix];
            if (ar[ix].search(/-->/) > -1) {
                inComment = false;
            }
        }
        // In <![CDATA[...]]>
        else if (inCDATA) {
            str += ar[ix];
            if (ar[ix].search(/\]\]>/) > -1) {
                inCDATA = false;
            }
        }
        // Start comment
        else if (ar[ix].search(/<!--/) > -1) {
            str = str.trim() + shift[deep] + ar[ix];
            inComment = true;
            if (ar[ix].search(/-->/) > -1) {
                inComment = false;
            }
        }
        // Start <![CDATA[...]]>
        else if (ar[ix].search(/<!\[CDATA\[/) > -1) {
            str += ar[ix]; // Giữ nguyên dòng mà không thêm xuống dòng
            inCDATA = true;
            if (ar[ix].search(/\]\]>/) > -1) {
                inCDATA = false;
            }
        }
        // End <![CDATA[...]]>
        else if (ar[ix].search(/\]\]>/) > -1) {
            str += ar[ix]; // Giữ nguyên dòng mà không thêm xuống dòng
            inCDATA = false;
        }
        // <!DOCTYPE xử lý đặc biệt
        else if (ar[ix].search(/<!DOCTYPE/) > -1) {
            str = str.trim() + shift[deep] + ar[ix].trim();
            inDoctype = true;
        }
        // Kết thúc DOCTYPE
        else if (inDoctype && ar[ix].search(/]>/) > -1) {
            str += shift[deep + 1] + ar[ix].trim(); // Giữ nội dung trên cùng một dòng
            inDoctype = false;
        }
        // Nội dung bên trong DOCTYPE
        else if (inDoctype) {
            str += shift[deep + 1] + ar[ix].trim(); // Giữ nội dung trên cùng một dòng
        }
        // <clientScript> xử lý đặc biệt
        else if (ar[ix].search(/<clientScript>/) > -1) {
            str = str.trim() + shift[deep] + ar[ix]; // Thêm thẻ mở <clientScript> vào cùng một dòng
            inClientScript = true;
        }
        // </clientScript> xử lý đặc biệt
        else if (inClientScript && ar[ix].search(/<\/clientScript>/) > -1) {
            str += ar[ix]; // Thêm thẻ đóng </clientScript> vào cùng một dòng
            inClientScript = false;
        }
        // <elm></elm>
        else if (ix > 0 && /^<\/[^<>!?\/\s]/.exec(ar[ix]) && /^<[^<>!?\/\s]/.exec(ar[ix - 1]) && /^<\/[^<>!?\/\s]+/.exec(ar[ix])[0].replace('/', '') == /^<[^<>!?\/\s]+/.exec(ar[ix - 1])[0]) {
            if (deep_real > 0) deep_real--;
            if (deep_real <= 100) deep = deep_real;
            str += ar[ix];
        }
        // </elm>
        else if (ar[ix].search(/<\//) > -1) {
            if (deep_real > 0) deep_real--;
            if (deep_real <= 100) deep = deep_real;
            str = str.trim() + shift[deep] + ar[ix];
        }
        // <elm> or <elm/>
        else if (ar[ix].search(/<[^<>!?\/\s]/) > -1) {
            str = str.trim() + shift[deep] + ar[ix];
            deep_real++;
            if (ar[ix].search(/\/>/) > -1) {
                deep_real--;
            }
            if (deep_real <= 100) deep = deep_real;
        }
        // Default case
        else {
            str += ar[ix];
        }
    }

    return str.trim();
};




function updateVKBeautify() {
    vkbeautify = new VKBeautify();
}

updateVKBeautify();

//Build a range of the entire document!
function getRange(document) {

    return new vscode.Range(
        // line 0, char 0:
        0, 0,
        // last line:
        document.lineCount - 1,
        // last character:
        document.lineAt(document.lineCount - 1).range.end.character
    )
}

// this method is called when your extension is activated
function activate(context) {

    var disposableXML = vscode.languages.registerDocumentFormattingEditProvider({ language: 'xml' }, {
        provideDocumentFormattingEdits: function (document) {
            return [vscode.TextEdit.replace(getRange(document), vkbeautify.xml(document.getText()))];
        }
    });
    vscode.workspace.onDidChangeConfiguration(updateVKBeautify, this, context.subscriptions);
    context.subscriptions.push(disposableXML);

    var disposableXSL = vscode.languages.registerDocumentFormattingEditProvider({ language: 'xsl' }, {
        provideDocumentFormattingEdits: function (document) {
            return [vscode.TextEdit.replace(getRange(document), vkbeautify.xml(document.getText()))];
        }
    });
    vscode.workspace.onDidChangeConfiguration(updateVKBeautify, this, context.subscriptions);
    context.subscriptions.push(disposableXSL);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
