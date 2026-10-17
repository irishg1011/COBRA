// feat/skippable-chapter: the Skippable switch in the Edit Chapter modal
// (edit-category-modal.html). Shared by Manage Course (admin-manage-course.js)
// and Publishing (admin-publishing.js), which call:
//   CobraChapterSkip.load(catId)  - when the modal opens
//   CobraChapterSkip.save(catId)  - after the name is saved; resolves to
//                                   {success, message} like the other saves
(function () {
    const toggle = document.getElementById("editCategorySkippable");
    const questionGroup = document.getElementById("chapterSkipQuestionGroup");
    const questionInput = document.getElementById("editCategorySkipQuestion");
    if (!toggle || !questionInput) {
        window.CobraChapterSkip = {
            load() {},
            save() { return Promise.resolve({ success: true }); },
        };
        return;
    }

    let loadedFor = null;   // the chapter whose settings are in the form (null = not loaded)

    function showQuestion() {
        if (questionGroup) questionGroup.hidden = !toggle.checked;
    }
    toggle.addEventListener("change", showQuestion);

    async function load(catId) {
        loadedFor = null;
        toggle.checked = false;
        toggle.disabled = true;
        questionInput.value = "";
        showQuestion();
        try {
            const resp = await fetch(`/admin/manage-course/categories/${encodeURIComponent(catId)}/skip-settings`,
                { credentials: "same-origin" });
            const data = await resp.json();
            if (!data.success) return;
            toggle.checked = !!data.is_skippable;
            questionInput.value = data.skip_question || "";
            loadedFor = String(catId);
        } catch (err) {
            // Left disabled: save() then changes nothing, so a failed load can
            // never switch Skippable off by accident.
        } finally {
            toggle.disabled = loadedFor === null;
            showQuestion();
        }
    }

    async function save(catId) {
        if (loadedFor !== String(catId)) return { success: true };
        try {
            const resp = await fetch(`/admin/manage-course/categories/${encodeURIComponent(catId)}/skip-settings`, {
                method: "POST",
                credentials: "same-origin",
                body: new URLSearchParams({
                    is_skippable: toggle.checked ? "1" : "0",
                    skip_question: questionInput.value.trim(),
                }),
            });
            return await resp.json();
        } catch (err) {
            return { success: false, message: "Could not save the skip setting. Please try again." };
        }
    }

    window.CobraChapterSkip = { load, save };
})();
