/**
 * upload-video-tutorial-ui.js - Front-end only UI behavior for the
 * standalone Upload Video Tutorial page (admin/upload-video-tutorial.html).
 *
 * Handles drag-and-drop / browse file selection, live description
 * character counter, and live-updating the read-only "Video Information"
 * preview table. No backend calls, no save/publish wiring yet.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {

        // Description editor char counter
        const descEditor = document.getElementById("videoDescriptionEditor");
        const descCounter = document.getElementById("videoDescCounter");
        const DESC_MAX = 2000;

        if (descEditor && descCounter) {
            descEditor.addEventListener("input", function () {
                const length = descEditor.textContent.length;
                descCounter.textContent = `${length} / ${DESC_MAX}`;
            });
        }

        // Video File Drop Zone
        const dropzone = document.getElementById("videoDropzone");
        const browseBtn = document.getElementById("videoBrowseBtn");
        const fileInput = document.getElementById("videoFileInput");
        const selectedFileBox = document.getElementById("videoSelectedFile");
        const selectedFileName = document.getElementById("videoSelectedFileName");
        const removeFileBtn = document.getElementById("removeVideoFileBtn");

        function showSelectedFile(file) {
            if (!file) return;
            selectedFileName.textContent = file.name;
            selectedFileBox.classList.add("show");
        }

        function clearSelectedFile() {
            selectedFileBox.classList.remove("show");
            selectedFileName.textContent = "—";
            if (fileInput) fileInput.value = "";
        }

        if (browseBtn && fileInput) {
            browseBtn.addEventListener("click", function () {
                fileInput.click();
            });

            fileInput.addEventListener("change", function () {
                if (fileInput.files && fileInput.files[0]) {
                    showSelectedFile(fileInput.files[0]);
                }
            });
        }

        if (dropzone) {
            ["dragenter", "dragover"].forEach((eventName) => {
                dropzone.addEventListener(eventName, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add("dragover");
                });
            });

            ["dragleave", "drop"].forEach((eventName) => {
                dropzone.addEventListener(eventName, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove("dragover");
                });
            });

            dropzone.addEventListener("drop", function (e) {
                const files = e.dataTransfer && e.dataTransfer.files;
                if (files && files[0]) {
                    if (fileInput) {
                        fileInput.files = files;
                    }
                    showSelectedFile(files[0]);
                }
            });
        }

        if (removeFileBtn) {
            removeFileBtn.addEventListener("click", clearSelectedFile);
        }

        // Video Information preview table (Category only, front-end only)
        const videoCategorySelect = document.getElementById("videoCategorySelect");
        const videoInfoCategory = document.getElementById("videoInfoCategory");

        if (videoCategorySelect && videoInfoCategory) {
            videoCategorySelect.addEventListener("change", function () {
                const selectedOption = videoCategorySelect.options[videoCategorySelect.selectedIndex];
                videoInfoCategory.textContent = selectedOption ? selectedOption.textContent : "-";
            });
        }
    });
})();