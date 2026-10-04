document.addEventListener("DOMContentLoaded", function () {
    const editor = document.getElementById("editorContent");
    const form = document.getElementById("uploadModuleForm");
    const hiddenInput = document.getElementById("hiddenModuleContent");
    
    if (!editor || !form) return;

    document.querySelectorAll(".editor-toolbar button[data-action]").forEach((button) => {
        button.addEventListener("click", function (e) {
            e.preventDefault();
            const action = this.getAttribute("data-action");

            switch (action) {
                case "undo":
                    document.execCommand("undo", false, null);
                    break;
                case "redo":
                    document.execCommand("redo", false, null);
                    break;
                case "bold":
                    document.execCommand("bold", false, null);
                    break;
                case "italic":
                    document.execCommand("italic", false, null);
                    break;
                case "underline":
                    document.execCommand("underline", false, null);
                    break;
                case "strikethrough":
                    document.execCommand("strikethrough", false, null);
                    break;
                case "h1":
                    document.execCommand("formatBlock", false, "<h1>");
                    break;
                case "h2":
                    document.execCommand("formatBlock", false, "<h2>");
                    break;
                case "h3":
                    document.execCommand("formatBlock", false, "<h3>");
                    break;
                case "alignLeft":
                    document.execCommand("justifyLeft", false, null);
                    break;
                case "alignCenter":
                    document.execCommand("justifyCenter", false, null);
                    break;
                case "alignRight":
                    document.execCommand("justifyRight", false, null);
                    break;
                case "ul":
                    document.execCommand("insertUnorderedList", false, null);
                    break;
                case "ol":
                    document.execCommand("insertOrderedList", false, null);
                    break;
                case "quote":
                    document.execCommand("formatBlock", false, "<blockquote>");
                    break;
            }
            editor.focus();
        });
    });

    form.addEventListener("submit", function () {
        if (window.CobraCode) window.CobraCode.stripAll(editor);   // no code-color spans in saved HTML
        hiddenInput.value = editor.innerHTML;
    });
});