document.addEventListener("DOMContentLoaded", () => {
    const animatedEls = document.querySelectorAll("[data-animate]");

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    animatedEls.forEach((el) => observer.observe(el));

    const heroImage = document.querySelector(".hero-image");
    const heroSection = document.querySelector(".hero-section");
    let ticking = false;

    if (heroImage && heroSection) {
        window.addEventListener("scroll", () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
                    if (window.scrollY < heroBottom) {
                        const offset = window.scrollY * 0.25;
                        heroImage.style.transform = `translateY(${offset}px)`;
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
    }
});