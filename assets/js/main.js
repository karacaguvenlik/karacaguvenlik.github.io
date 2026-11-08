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
    const MAIL_TO = 'krcguvenlik07@gmail.com';
    const MAIL_ENDPOINT = `https://formsubmit.co/ajax/${MAIL_TO}`;
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
    // AJAX can be blocked (CORS / Cloudflare bot check). A regular form POST lets the
    // browser pass FormSubmit's check, then FormSubmit redirects back via _next.
    const postNatively = (fields, back) => {
        const f = document.createElement('form');
        f.method = 'POST';
        f.action = `https://formsubmit.co/${MAIL_TO}`;
        f.hidden = true;
        const all = { _template: 'table', _next: `${location.origin}/?gonderildi=${back}#${back === 'yorum' ? 'testimonials' : 'contact'}`, ...fields };
        Object.entries(all).forEach(([k, v]) => {
            const i = document.createElement('input');
            i.type = 'hidden'; i.name = k; i.value = v;
            f.appendChild(i);
        });
        document.body.appendChild(f);
        f.submit();
    };
    const submitMail = async (fields, back) => {
        try {
            await sendMail(fields);
            return true;
        } catch {
            postNatively(fields, back);
            return false;
        }
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

    // Turkish phone numbers: accepts 0538..., 538..., +90 538..., 90538...; mobile (5xx) or landline (2xx-4xx)
    const phoneDigits = (v) => {
        let n = String(v).replace(/\D/g, '');
        if (n.startsWith('90') && n.length === 12) n = n.slice(2);
        if (n.length === 10) n = '0' + n;
        return n;
    };
    const phoneValid = (v) => /^0[2-5]\d{9}$/.test(phoneDigits(v));
    // Displayed and e-mailed as xxx-xxx-xxxx (10 digits, without the leading 0)
    const phoneFormat = (n) => {
        const d = n.replace(/^0/, '');
        return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join('-');
    };
    const PHONE_MSG = 'Lütfen geçerli bir telefon numarası girin (xxx-xxx-xxxx).';
    const phone = document.getElementById('phone');
    if (phone) {
        const check = () => {
            const v = phone.value.trim();
            phone.setCustomValidity(!v || phoneValid(v) ? '' : PHONE_MSG);
        };
        phone.addEventListener('input', (e) => {
            // Live-format only plain digit entry starting with an area code (2-5); 0 / +90 forms are normalised on blur
            if (e.inputType && e.inputType.startsWith('delete')) return check();
            if (/^[\d\s-]*$/.test(phone.value) && /^[2-5]/.test(phone.value)) {
                phone.value = phoneFormat(phone.value.replace(/\D/g, '').slice(0, 10));
            }
            check();
        });
        phone.addEventListener('blur', () => {
            if (phoneValid(phone.value)) phone.value = phoneFormat(phoneDigits(phone.value));
            check();
        });
    }

    // Quote form
    const form = document.getElementById('quoteForm');
    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = new FormData(form);
        if (d.get('_honey')) return;
        if (!phoneValid(d.get('phone'))) { phone.setCustomValidity(PHONE_MSG); phone.reportValidity(); return; }
        d.set('phone', phoneFormat(phoneDigits(d.get('phone'))));
        setBusy(form, true);
        const sent = await submitMail({
            _subject: `Yeni keşif talebi: ${d.get('name')} (${d.get('service')})`,
            'Ad Soyad': d.get('name'),
            Telefon: d.get('phone'),
            Hizmet: d.get('service'),
            Mesaj: d.get('message') || '-',
            'KVKK onayı': 'Evet',
        }, 'teklif');
        if (!sent) return; // page is navigating to the fallback POST
        form.reset();
        setBusy(form, false);
        setStatus(form, 'ok', QUOTE_OK);
    });
    const QUOTE_OK = `<strong>Talebiniz alındı.</strong> En kısa sürede sizi arayacağız. Acil durumlar için bizi arayabilir veya <a href="${WA}" target="_blank" rel="noopener">WhatsApp'tan</a> yazabilirsiniz.`;
    const REVIEW_OK = '<strong>Teşekkür ederiz!</strong> Yorumunuz bize ulaştı; incelendikten sonra yayınlanacak.';

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
            const sent = await submitMail({
                _subject: `Yeni müşteri yorumu (${puan}/5) – onay bekliyor`,
                'Ad Soyad': `${ad} ${soyad}`,
                'Sitede görünecek ad': shown,
                Hizmet: d.get('hizmet'),
                Puan: `${puan} / 5`,
                Yorum: yorum,
                'Yayın izni': 'Evet',
                'Siteye eklemek için (yorumlar.json)': JSON.stringify({ ad: shown, hizmet: d.get('hizmet'), puan, yorum }),
            }, 'yorum');
            if (!sent) return;
            reviewForm.reset();
            setBusy(reviewForm, false);
            setStatus(reviewForm, 'ok', REVIEW_OK);
        });
    }

    // Returning from the fallback POST (FormSubmit redirects to /?gonderildi=...)
    const done = new URLSearchParams(location.search).get('gonderildi');
    if (done) {
        history.replaceState(null, '', location.pathname + location.hash);
        if (done === 'teklif' && form) setStatus(form, 'ok', QUOTE_OK);
        if (done === 'yorum' && reviewForm) {
            const note = document.createElement('div');
            note.className = 'form__status form__status--ok review-actions__ok';
            note.setAttribute('role', 'status');
            note.innerHTML = REVIEW_OK;
            document.querySelector('.review-actions').appendChild(note);
        }
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
