(() => {
    const header = document.getElementById('header');
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('menuToggle');

    // Header
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Mobile menu
    const setMenu = (open) => {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    };
    toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

    // Active nav link (same-page anchors only; sub pages link to /#section)
    const links = [...document.querySelectorAll('.nav__link')].filter((l) => l.getAttribute('href').startsWith('#'));
    const sections = links.map((l) => document.querySelector(l.getAttribute('href'))).filter(Boolean);
    const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === '#' + entry.target.id));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));

    // Scroll reveal (staggered within each parent)
    const reveals = document.querySelectorAll('.reveal');
    reveals.forEach((el) => {
        const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
        el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 6) * 0.07}s`);
    });
    const revealer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                revealer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => revealer.observe(el));

    // Service card spotlight
    document.querySelectorAll('.service').forEach((card) => {
        card.addEventListener('pointermove', (e) => {
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${e.clientX - r.left}px`);
            card.style.setProperty('--my', `${e.clientY - r.top}px`);
        });
    });

    // Project filter
    const filters = document.querySelectorAll('.filter');
    const projects = document.querySelectorAll('.project');
    filters.forEach((btn) => {
        btn.addEventListener('click', () => {
            const f = btn.dataset.filter;
            filters.forEach((b) => {
                b.classList.toggle('is-active', b === btn);
                b.setAttribute('aria-selected', String(b === btn));
            });
            projects.forEach((p) => {
                p.classList.toggle('is-hidden', f !== 'all' && p.dataset.status !== f);
                p.classList.add('is-visible');
            });
        });
    });

    // Reviews loop seamlessly by duplicating the track content once
    const track = document.querySelector('.reviews__track');
    if (track) {
        [...track.children].forEach((c) => {
            const clone = c.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            track.appendChild(clone);
        });
    }

    // Google Maps is loaded on demand so no third-party cookies are set on page load
    const map = document.getElementById('map');
    if (map) {
        map.querySelector('.map__load').addEventListener('click', () => {
            const iframe = document.createElement('iframe');
            iframe.src = map.dataset.src;
            iframe.title = 'Karaca Güvenlik konum';
            iframe.loading = 'lazy';
            iframe.referrerPolicy = 'no-referrer-when-downgrade';
            iframe.allowFullscreen = true;
            map.appendChild(iframe);
            map.classList.add('is-loaded');
        });
    }

    // Quote form -> WhatsApp (static site, no backend)
    const form = document.getElementById('quoteForm');
    if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = new FormData(form);
        const text = [
            'Merhaba, ücretsiz keşif talebim var.',
            `Ad Soyad: ${d.get('name')}`,
            `Telefon: ${d.get('phone')}`,
            `Hizmet: ${d.get('service')}`,
            d.get('message') ? `Mesaj: ${d.get('message')}` : ''
        ].filter(Boolean).join('\n');
        window.open(`https://wa.me/905387711146?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    });

    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
})();
