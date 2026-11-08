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

    // Reviews: approved reviews live in /assets/data/yorumlar.json (newest first).
    // The static HTML list is the no-JS fallback.
    const track = document.getElementById('reviewsTrack');
    const loopTrack = () => {
        [...track.children].forEach((c) => {
            const clone = c.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            track.appendChild(clone);
        });
    };
    const reviewEl = (r) => {
        const q = document.createElement('blockquote');
        q.className = 'review';
        const stars = document.createElement('div');
        stars.className = 'stars';
        stars.setAttribute('aria-label', `${r.puan} / 5`);
        stars.textContent = '★'.repeat(r.puan) + '☆'.repeat(5 - r.puan);
        const p = document.createElement('p');
        p.textContent = `"${r.yorum}"`;
        q.append(stars, p);
        if (r.ad || r.hizmet) {
            const by = document.createElement('footer');
            by.className = 'review__by';
            by.textContent = [r.ad, r.hizmet].filter(Boolean).join(' · ');
            q.append(by);
        }
        return q;
    };
    if (track) {
        fetch('/assets/data/yorumlar.json', { cache: 'no-cache' })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((list) => {
                const valid = list.filter((r) => r && r.yorum && r.puan >= 1 && r.puan <= 5);
                if (valid.length) track.replaceChildren(...valid.map(reviewEl));
            })
            .catch(() => {})
            .finally(loopTrack);
    }

    // Forms are delivered by e-mail through FormSubmit (static site, no backend)
    const MAIL_ENDPOINT = 'https://formsubmit.co/ajax/krcguvenlik07@gmail.com';
    const WA = 'https://wa.me/905387711146';
    const sendMail = async (fields) => {
        const res = await fetch(MAIL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ _template: 'table', _captcha: 'false', ...fields }),
        });
        const data = await res.json().catch(() => ({}));
        // Before the inbox is activated FormSubmit holds submissions and replies with an activation notice
        if (res.ok && (String(data.success) === 'true' || /activat/i.test(data.message || ''))) return;
        throw new Error(data.message || `HTTP ${res.status}`);
    };
    const setStatus = (form, type, html) => {
        const box = form.querySelector('.form__status');
        box.className = `form__status form__status--${type}`;
        box.innerHTML = html;
        box.hidden = false;
    };
    const setBusy = (form, busy) => {
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = busy;
        btn.classList.toggle('is-busy', busy);
    };

    // Quote form
    const form = document.getElementById('quoteForm');
    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = new FormData(form);
        if (d.get('_honey')) return;
        const waText = [
            'Merhaba, ücretsiz keşif talebim var.',
            `Ad Soyad: ${d.get('name')}`,
            `Telefon: ${d.get('phone')}`,
            `Hizmet: ${d.get('service')}`,
            d.get('message') ? `Mesaj: ${d.get('message')}` : ''
        ].filter(Boolean).join('\n');
        const waLink = `<a class="btn btn--ghost" href="${WA}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">WhatsApp'tan gönder</a>`;
        setBusy(form, true);
        try {
            await sendMail({
                _subject: `Yeni keşif talebi: ${d.get('name')} (${d.get('service')})`,
                'Ad Soyad': d.get('name'),
                Telefon: d.get('phone'),
                Hizmet: d.get('service'),
                Mesaj: d.get('message') || '-',
                'KVKK onayı': 'Evet',
            });
            form.reset();
            setStatus(form, 'ok', `<strong>Talebiniz alındı.</strong> En kısa sürede sizi arayacağız. Acil durumlar için bizi arayabilir veya WhatsApp'tan yazabilirsiniz.`);
        } catch {
            setStatus(form, 'error', `<strong>Talebiniz gönderilemedi.</strong> Lütfen bilgilerinizi WhatsApp'tan iletin veya bizi arayın.<div class="form__status-actions">${waLink}<a class="btn btn--ghost" href="tel:+905387711146">Hemen Ara</a></div>`);
        } finally {
            setBusy(form, false);
        }
    });

    // Review dialog
    const dialog = document.getElementById('reviewDialog');
    const reviewForm = document.getElementById('reviewForm');
    if (dialog && reviewForm) {
        document.getElementById('reviewOpen').addEventListener('click', () => dialog.showModal());
        document.getElementById('reviewClose').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const d = new FormData(reviewForm);
            if (d.get('_honey')) return;
            const titleTr = (s) => s.split(/\s+/).filter(Boolean)
                .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR')).join(' ');
            const ad = titleTr(String(d.get('ad')));
            const soyad = titleTr(String(d.get('soyad')));
            const shown = `${ad} ${soyad.charAt(0)}.`;
            const puan = Number(d.get('puan'));
            const yorum = String(d.get('yorum')).trim();
            setBusy(reviewForm, true);
            try {
                await sendMail({
                    _subject: `Yeni müşteri yorumu (${puan}/5) – onay bekliyor`,
                    'Ad Soyad': `${ad} ${soyad}`,
                    'Sitede görünecek ad': shown,
                    Hizmet: d.get('hizmet'),
                    Puan: `${puan} / 5`,
                    Yorum: yorum,
                    'Yayın izni': 'Evet',
                    'Siteye eklemek için (yorumlar.json)': JSON.stringify({ ad: shown, hizmet: d.get('hizmet'), puan, yorum }),
                });
                reviewForm.reset();
                setStatus(reviewForm, 'ok', '<strong>Teşekkür ederiz!</strong> Yorumunuz bize ulaştı; incelendikten sonra yayınlanacak.');
            } catch {
                setStatus(reviewForm, 'error', `<strong>Yorumunuz gönderilemedi.</strong> Lütfen biraz sonra tekrar deneyin veya <a href="${WA}" target="_blank" rel="noopener">WhatsApp'tan</a> iletin.`);
            } finally {
                setBusy(reviewForm, false);
            }
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

    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
})();
