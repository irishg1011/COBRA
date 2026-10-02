/*
 * certificate.js - learner Certificate of Completion page (/certificate)
 * feat/certificate
 *
 * Loads /api/certificate. The SERVER decides whether the learner has
 * finished the course (certificates.py) - this page only shows what it
 * is told: the certificate (name, course, date, certificate number) or
 * the "not unlocked yet" message with how many chapters are passed.
 * "Print or save as PDF" opens the browser's print window; the print
 * styles in certificate.css print only the certificate sheet.
 * Styles: learner/css/certificate.css
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    function show(id) {
        ['certificateLoading', 'certificateError', 'certificateLocked', 'certificateUnlocked']
            .forEach((key) => { $(key).hidden = key !== id; });
    }

    function renderLocked(cert) {
        const course = cert.course_name || 'course';
        let text = `Pass every chapter of the ${course} to unlock your Certificate of Completion.`;
        if (cert.chapters_total) {
            const s = cert.chapters_total === 1 ? '' : 's';
            text += ` You have passed ${cert.chapters_passed} of ${cert.chapters_total} chapter${s} so far.`;
        }
        $('certificateLockedText').textContent = text;
        show('certificateLocked');
    }

    function renderUnlocked(cert, learnerName) {
        $('certificateName').textContent = learnerName;
        $('certificateCourse').textContent = cert.course_name;
        $('certificateDate').textContent = cert.completed_on;
        $('certificateReference').textContent = cert.reference_no;
        document.title = `CobraByte - Certificate - ${learnerName}`;
        show('certificateUnlocked');
    }

    $('printCertificateBtn').addEventListener('click', () => window.print());

    fetch('/api/certificate', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
            if (!data || !data.success || !data.certificate) throw new Error(data && data.message);
            if (data.certificate.unlocked) renderUnlocked(data.certificate, data.learner_name);
            else renderLocked(data.certificate);
        })
        .catch(() => show('certificateError'));
});