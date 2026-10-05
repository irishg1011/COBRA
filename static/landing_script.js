document.addEventListener("DOMContentLoaded", () => {
    const sections = document.querySelectorAll("section");
    const navLinks = document.querySelectorAll(".nav-links a");

    window.addEventListener("scroll", () => {
        let current = "";
        sections.forEach((section) => {
            const sectionTop = section.offsetTop;
            if (pageYOffset >= sectionTop - 100) {
                current = section.getAttribute("id");
            }
        });

        navLinks.forEach((link) => {
            link.classList.remove("active");
            if (link.getAttribute("href") === `#${current}`) {
                link.classList.add("active");
            }
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('section, div[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    window.addEventListener('scroll', () => {
        let current = '';
        const scrollPosition = window.scrollY + 150;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href === `#${current}` || (current === 'home' && href === '#home')) {
                link.classList.add('active');
            }
        });
    });
});

// ============================================================
// "Send Us a Message" (feat/contact-messages)
// Sends the contact form to POST /api/contact without leaving the page.
// The server saves the message for Admin > Messages and emails it to
// the admin inbox; it also checks every field again - the checks here
// only save a round trip.
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const fields = {
        name: document.getElementById('name'),
        email: document.getElementById('email'),
        message: document.getElementById('message'),
    };
    const trap = document.getElementById('website');
    const status = document.getElementById('contactFormStatus');
    const submitBtn = document.getElementById('contactSubmitBtn');
    const EMAIL_RULE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const MESSAGE_MIN = 10;
    let sending = false;

    // Enter in Name / Email moves down to the next box instead of sending
    // the form; only the Send Message button sends. (Enter inside the
    // Message box still makes a new line.)
    [[fields.name, fields.email], [fields.email, fields.message]].forEach(([from, to]) => {
        if (!from || !to) return;
        from.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            e.preventDefault();
            to.focus();
        });
    });

    function showStatus(text, isError) {
        status.textContent = text || '';
        status.classList.toggle('is-error', Boolean(isError));
    }

    function setFieldError(key, text) {
        const note = form.querySelector(`.contact-field-error[data-error-for="${key}"]`);
        if (note) note.textContent = text || '';
        if (fields[key]) fields[key].classList.toggle('is-invalid', Boolean(text));
    }

    function showErrors(errors) {
        Object.keys(fields).forEach((key) => setFieldError(key, errors[key]));
        const first = Object.keys(fields).find((key) => errors[key]);
        if (first) fields[first].focus();
    }

    function validate() {
        const errors = {};
        const name = fields.name.value.trim();
        const email = fields.email.value.trim();
        const message = fields.message.value.trim();
        if (!name) errors.name = 'Please enter your name.';
        if (!email) errors.email = 'Please enter your email address.';
        else if (!EMAIL_RULE.test(email)) errors.email = 'Please enter a valid email address.';
        if (!message) errors.message = 'Please write your message.';
        else if (message.length < MESSAGE_MIN) errors.message = `Your message is too short. Please write at least ${MESSAGE_MIN} characters.`;
        return errors;
    }

    // A field's message clears as soon as it is edited.
    Object.keys(fields).forEach((key) => {
        fields[key].addEventListener('input', () => setFieldError(key, ''));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (sending) return;
        showStatus('');

        const errors = validate();
        showErrors(errors);
        if (Object.keys(errors).length) return;

        sending = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: fields.name.value.trim(),
                    email: fields.email.value.trim(),
                    message: fields.message.value.trim(),
                    website: trap ? trap.value : '',
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.success) {
                form.reset();
                showErrors({});
                showStatus(data.message || 'Thank you! Your message has been sent.');
            } else {
                if (data.errors) showErrors(data.errors);
                showStatus(data.message || 'We could not send your message. Please try again.', true);
            }
        } catch (err) {
            showStatus('We could not send your message. Check your connection and try again.', true);
        } finally {
            sending = false;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Message';
        }
    });
});