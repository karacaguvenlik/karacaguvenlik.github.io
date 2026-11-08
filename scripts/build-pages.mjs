// Generates the static inner pages, sitemap.xml and robots.txt.
// Usage: node scripts/build-pages.mjs   (no dependencies)
// When the custom domain goes live, change SITE below and the URLs in index.html.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://karacaguvenlik.github.io';
const PHONE = '+905387711146';
const PHONE_TEXT = '+90 538 771 11 46';
const EMAIL = 'krcguvenlik07@gmail.com';
const ADDRESS = 'Oba Mahallesi, Yüksek Sokak, No: 6/B Alanya/ANTALYA';
const BUSINESS = 'Karaca Güvenlik ve Bilişim Sistemleri';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const services = [
  {
    slug: 'kamera-sistemleri', name: 'Kamera Sistemleri',
    title: 'Alanya Kamera Sistemleri Kurulumu',
    desc: 'Alanya ve Antalya genelinde ev, iş yeri, site ve otel için IP ve analog güvenlik kamerası kurulumu, gece görüşlü kayıt ve telefondan canlı izleme. Ücretsiz keşif.',
    lead: 'Ev, iş yeri, site ve oteller için ihtiyaca göre projelendirilmiş güvenlik kamerası sistemleri. Kurulumdan sonra kameralarınızı telefonunuzdan canlı izleyebilirsiniz.',
    sections: [
      ['Neler yapıyoruz?', [
        'IP ve analog (HD) güvenlik kamerası kurulumu',
        'Kayıt cihazı (NVR/DVR) ve depolama kapasitesinin ihtiyaca göre planlanması',
        'Gece görüşlü iç ve dış mekân kameraları',
        'Telefon, tablet ve bilgisayardan canlı ve geriye dönük izleme kurulumu',
        'Eski sistemlerin yenilenmesi, kamera ekleme ve arıza onarımı',
      ]],
      ['Kimler için uygun?', [
        'Villa, müstakil ev ve apartman daireleri',
        'Mağaza, market, cafe ve restoranlar',
        'Site yönetimleri, oteller ve apart oteller',
        'Fabrika, depo ve şantiyeler',
      ]],
    ],
    body: 'Keşif sırasında giriş noktalarını, kör alanları ve kablolama güzergâhını yerinde inceliyoruz. Kamera sayısı, çözünürlük ve kayıt süresi mekânınıza ve bütçenize göre belirlenir; teklifi keşfin ardından net olarak sunuyoruz.',
  },
  {
    slug: 'alarm-sistemleri', name: 'Alarm Sistemleri',
    title: 'Alanya Alarm Sistemleri Kurulumu',
    desc: 'Alanya ve Antalya genelinde kablolu ve kablosuz hırsız alarm sistemleri, hareket ve kapı-pencere sensörleri, siren ve mobil bildirim kurulumu. Ücretsiz keşif.',
    lead: 'Kablolu ve kablosuz alarm sistemleriyle ev ve iş yerinizi izinsiz girişlere karşı koruyun. İhlal durumunda siren ve telefon bildirimiyle anında haberdar olun.',
    sections: [
      ['Neler yapıyoruz?', [
        'Kablolu ve kablosuz alarm paneli kurulumu',
        'Hareket, kapı-pencere ve cam kırılma sensörleri',
        'İç ve dış siren montajı',
        'Telefon uygulaması ile kurma/devre dışı bırakma ve bildirim ayarları',
        'Mevcut alarm sistemlerinin bakımı, pil değişimi ve arıza onarımı',
      ]],
      ['Kimler için uygun?', [
        'Ev, villa ve yazlıklar',
        'Mağaza, ofis ve iş yerleri',
        'Depo ve atölyeler',
      ]],
    ],
    body: 'Alarm sistemi, kamera sistemiyle birlikte planlandığında çok daha etkilidir. Keşifte riskli giriş noktalarını belirleyip sensör yerleşimini buna göre yapıyoruz.',
  },
  {
    slug: 'network-altyapisi', name: 'Network Altyapısı',
    title: 'Alanya Network ve Fiber Optik Altyapı Kurulumu',
    desc: 'Alanya ve Antalya genelinde yapısal kablolama, fiber optik, kabinet, switch ve kurumsal Wi-Fi kurulumu. Otel, site, ofis ve iş yerleri için network altyapısı.',
    lead: 'Güvenlik sistemlerinin ve iş yerinizin kesintisiz çalışması için sağlam bir ağ altyapısı şart. Kablolamadan Wi-Fi kapsama alanına kadar tüm altyapıyı kuruyoruz.',
    sections: [
      ['Neler yapıyoruz?', [
        'Cat6 yapısal kablolama ve patch panel sonlandırma',
        'Fiber optik kablolama ve bağlantılar',
        'Rack kabinet, switch ve modem/router kurulumu',
        'Otel, site ve büyük alanlar için kurumsal Wi-Fi ve erişim noktaları',
        'Mevcut ağdaki bağlantı ve hız sorunlarının tespiti',
      ]],
      ['Kimler için uygun?', [
        'Oteller ve apart oteller',
        'Ofisler, mağazalar ve restoranlar',
        'Site ve apartman ortak alanları',
        'Fabrika ve depolar',
      ]],
    ],
    body: 'Doğru planlanmış bir ağ altyapısı; kamera, PDKS, ses ve diafon sistemlerinin de sorunsuz çalışmasını sağlar. Projeyi büyümeye açık şekilde tasarlıyoruz.',
  },
  {
    slug: 'uydu-sistemleri', name: 'Uydu Sistemleri',
    title: 'Alanya Uydu ve Merkezi Anten Sistemleri',
    desc: 'Alanya ve Antalya genelinde çanak anten, merkezi uydu sistemi, multiswitch ve site/otel uydu dağıtım sistemleri kurulumu ve arıza onarımı.',
    lead: 'Tek daireden yüzlerce odalı otellere kadar uydu yayınını kayıpsız dağıtan çanak anten ve merkezi uydu sistemleri kuruyor, arızalarını gideriyoruz.',
    sections: [
      ['Neler yapıyoruz?', [
        'Çanak anten montajı ve uydu ayarı',
        'Apartman ve siteler için merkezi uydu sistemi',
        'Otel ve apart oteller için uydu/TV dağıtım sistemleri',
        'Multiswitch, LNB ve kablo yenileme',
        'Sinyal kaybı ve görüntü sorunlarının tespiti ve onarımı',
      ]],
    ],
    body: 'Merkezi sistemlerde her daireye ayrı çanak takılmasına gerek kalmaz; bina cephesi düzenli kalır ve sinyal kalitesi korunur.',
  },
  {
    slug: 'bilgisayar-satis-servis', name: 'Bilgisayar Satış & Servis',
    title: 'Alanya Bilgisayar Satış ve Teknik Servis',
    desc: 'Alanya’da masaüstü ve dizüstü bilgisayar satışı, çevre birimleri, bakım, onarım, format ve yazılım kurulumu. İş yerleri için bilgisayar ve sistem desteği.',
    lead: 'İhtiyacınıza uygun bilgisayar ve çevre birimlerini temin ediyor; mevcut cihazlarınızın bakım, onarım ve kurulum işlemlerini yapıyoruz.',
    sections: [
      ['Neler yapıyoruz?', [
        'Masaüstü, dizüstü bilgisayar ve çevre birimleri satışı',
        'Donanım arızası tespiti ve onarımı',
        'Format, işletim sistemi ve yazılım kurulumu',
        'Temizlik, bakım ve parça yükseltme (SSD, RAM vb.)',
        'İş yerleri için bilgisayar, yazıcı ve ağ kurulumu',
      ]],
    ],
    body: 'İş yerinizdeki bilgisayarları, kamera ve network sistemiyle birlikte tek ekipten destek alarak yönetebilirsiniz.',
  },
  {
    slug: 'ses-sistemleri', name: 'Ses Sistemleri',
    title: 'Alanya Ses ve Anons Sistemleri Kurulumu',
    desc: 'Alanya ve Antalya genelinde otel, restoran, mağaza ve fabrikalar için anons, fon müziği ve profesyonel ses sistemleri kurulumu.',
    lead: 'Otel, restoran, mağaza ve fabrikalar için anons ve fon müziği sistemleri kuruyoruz. Her alanın sesi ayrı ayrı kontrol edilebilir şekilde planlanır.',
    sections: [
      ['Neler yapıyoruz?', [
        'Tavan ve duvar tipi hoparlör montajı',
        'Anons ve fon müziği sistemleri',
        'Bölgesel ses kontrolü (zon) planlaması',
        'Amfi, mikser ve mikrofon kurulumu',
        'Mevcut ses sistemlerinin arıza onarımı',
      ]],
    ],
    body: 'Keşifte alanın büyüklüğünü ve kullanım amacını değerlendirerek hoparlör sayısını ve yerleşimini belirliyoruz.',
  },
  {
    slug: 'goruntulu-diafon', name: 'Görüntülü Diafon',
    title: 'Alanya Görüntülü Diafon Sistemleri',
    desc: 'Alanya ve Antalya genelinde villa, apartman ve siteler için görüntülü diafon, kapı otomatiği bağlantısı ve akıllı kapı zili kurulumu ve arıza onarımı.',
    lead: 'Kapınızdaki ziyaretçiyi görüntülü olarak görün, kapıyı içeriden açın. Villa, apartman ve siteler için görüntülü kapı giriş sistemleri kuruyoruz.',
    sections: [
      ['Neler yapıyoruz?', [
        'Villa ve müstakil evler için görüntülü diafon',
        'Apartman ve siteler için çok daireli diafon sistemleri',
        'Kapı kilidi ve otomatik kapı bağlantıları',
        'Telefona bildirim gönderebilen akıllı diafon modelleri',
        'Eski sesli diafonların görüntülüye dönüştürülmesi ve arıza onarımı',
      ]],
    ],
    body: 'Diafon sistemini kamera sistemiyle birlikte planlayarak giriş kapısını hem görüntülü konuşma hem de kayıt altında tutabilirsiniz.',
  },
  {
    slug: 'teknik-servis', name: 'Teknik Servis',
    title: 'Alanya Güvenlik Sistemleri Teknik Servis — 7/24 Acil',
    desc: 'Alanya’da kamera, alarm, diafon, uydu ve network sistemleri için 7/24 acil teknik servis, arıza tespiti, onarım ve periyodik bakım.',
    lead: 'Kamera kaydı mı durdu, alarm mı susmuyor, diafon mu çalışmıyor? 7/24 acil teknik servis hattımızdan bize ulaşın; arızayı tespit edip gideriyoruz.',
    sections: [
      ['Neler yapıyoruz?', [
        'Kamera, kayıt cihazı ve depolama arızaları',
        'Alarm paneli, sensör ve siren arızaları',
        'Diafon, uydu ve ses sistemi arızaları',
        'İnternet, modem ve ağ bağlantı sorunları',
        'Periyodik bakım ve sistem kontrolü',
      ]],
      ['Başka firmanın kurduğu sistemlere bakıyor musunuz?', [
        'Evet. Farklı firmalarca kurulmuş sistemlerin arıza tespiti, onarımı ve genişletilmesi için de hizmet veriyoruz.',
      ]],
    ],
    body: 'Acil durumlarda telefonla arayabilir veya WhatsApp üzerinden sorununuzu ve varsa fotoğrafını gönderebilirsiniz.',
  },
];

const icon = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  wa: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.7c-2 0-4-.5-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-1-2.2-1-.3-.1-.5-.2-.7.1l-1 1.3c-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6.3-.5v-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6 0-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.2 1.3 3.4c.2.2 2.3 3.5 5.5 4.9 2.7 1.1 3.3.9 3.9.8.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5l-.6-.4z"/></svg>',
};

function layout({ path, title, desc, body, jsonLd = [], noindex = false }) {
  const url = SITE + path;
  return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="theme-color" content="#060912">${noindex ? '\n    <meta name="robots" content="noindex">' : `
    <link rel="canonical" href="${url}">`}
    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${SITE}/assets/img/og-image.jpg">
    <meta property="og:url" content="${url}">
    <meta property="og:locale" content="tr_TR">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preload" href="/assets/fonts/sora-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/assets/fonts/jakarta-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/css/style.css">
    <script>document.documentElement.classList.add('js');</script>${jsonLd.map((o) => `
    <script type="application/ld+json">${JSON.stringify(o)}</script>`).join('')}
</head>
<body>

    <header class="header" id="header">
        <div class="header__inner">
            <a href="/" class="header__logo" aria-label="Karaca Güvenlik ana sayfa">
                <img src="/LOGO.png" alt="Karaca Güvenlik Bilişim Sistemleri" width="1189" height="230">
            </a>

            <nav class="nav" id="nav" aria-label="Ana menü">
                <a href="/" class="nav__link">Ana Sayfa</a>
                <a href="/#services" class="nav__link">Hizmetler</a>
                <a href="/#projects" class="nav__link">Projeler</a>
                <a href="/#sss" class="nav__link">SSS</a>
                <a href="/#contact" class="nav__link">İletişim</a>
            </nav>

            <div class="header__actions">
                <a href="tel:${PHONE}" class="btn btn--emergency header__cta">
                    <span class="pulse"></span>
                    <span>7/24 Acil Servis</span>
                </a>
                <button class="menu-toggle" id="menuToggle" aria-label="Menüyü aç" aria-expanded="false" aria-controls="nav">
                    <span></span><span></span><span></span>
                </button>
            </div>
        </div>
    </header>

    <main>
${body}
    </main>

    <footer class="footer">
        <div class="container footer__inner">
            <div class="footer__brand">
                <img src="/LOGO.png" alt="Karaca Güvenlik" width="1189" height="230" loading="lazy">
                <p>Alanya ve Antalya genelinde akıllı güvenlik sistemleri ve zayıf akım çözümleri.</p>
            </div>
            <div class="footer__col">
                <h4>Hizmetler</h4>
${services.slice(0, 5).map((s) => `                <a href="/hizmetler/${s.slug}.html">${esc(s.name)}</a>`).join('\n')}
            </div>
            <div class="footer__col">
                <h4>Kurumsal</h4>
                <a href="/#process">Çalışma Sürecimiz</a>
                <a href="/#projects">Referanslar</a>
                <a href="/#sss">Sık Sorulan Sorular</a>
                <a href="/#contact">İletişim</a>
                <a href="/kvkk.html">KVKK Aydınlatma Metni</a>
            </div>
            <div class="footer__col">
                <h4>İletişim</h4>
                <a href="tel:${PHONE}">${PHONE_TEXT}</a>
                <a href="mailto:${EMAIL}">${EMAIL}</a>
                <span>Oba Mah. Yüksek Sk. No: 6/B Alanya</span>
            </div>
        </div>
        <div class="container footer__bottom">
            <span>© <span id="year">2026</span> ${BUSINESS} — Alanya</span>
            <a href="#header">Başa dön ↑</a>
        </div>
    </footer>

    <a href="https://wa.me/${PHONE.slice(1)}" class="whatsapp" target="_blank" rel="noopener" aria-label="WhatsApp ile yazın">
        ${icon.wa}
        <span>WhatsApp</span>
    </a>

    <script src="/assets/js/main.js"></script>
</body>
</html>
`;
}

const business = {
  '@type': 'LocalBusiness', name: BUSINESS, url: SITE + '/', telephone: PHONE_TEXT, email: EMAIL,
  address: { '@type': 'PostalAddress', streetAddress: 'Oba Mahallesi, Yüksek Sokak, No: 6/B', addressLocality: 'Alanya', addressRegion: 'Antalya', addressCountry: 'TR' },
};

function pageHero({ crumbs, h1, lead, buttons = true }) {
  return `        <section class="page-hero">
            <div class="hero__grid" aria-hidden="true"></div>
            <div class="container">
                <ol class="breadcrumb">
${crumbs.map(([label, href]) => `                    <li>${href ? `<a href="${href}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join('\n')}
                </ol>
                <h1>${esc(h1)}</h1>
                <p>${esc(lead)}</p>${buttons ? `
                <div class="hero__buttons">
                    <a href="/#contact" class="btn btn--primary btn--lg">Ücretsiz Keşif Al ${icon.arrow}</a>
                    <a href="tel:${PHONE}" class="btn btn--ghost btn--lg">${icon.phone} Hemen Ara</a>
                </div>` : ''}
            </div>
        </section>`;
}

function sideCard(current) {
  return `                <aside class="side-card">
                    <h2>Ücretsiz keşif</h2>
                    <p>Alanya ve çevresinde yerinde keşif ve fiyat teklifi ücretsizdir.</p>
                    <a href="tel:${PHONE}" class="btn btn--primary">${icon.phone} Hemen Ara</a>
                    <a href="https://wa.me/${PHONE.slice(1)}" class="btn btn--ghost" target="_blank" rel="noopener">WhatsApp'tan Yaz</a>
                    <ul>
${services.map((s) => `                        <li><a href="/hizmetler/${s.slug}.html"${s.slug === current ? ' aria-current="page"' : ''}>${esc(s.name)}</a></li>`).join('\n')}
                    </ul>
                </aside>`;
}

function write(rel, html) {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, html);
}

for (const s of services) {
  const path = `/hizmetler/${s.slug}.html`;
  const body = `${pageHero({ crumbs: [['Ana Sayfa', '/'], ['Hizmetler', '/#services'], [s.name]], h1: s.title, lead: s.lead })}

        <section class="page-body">
            <div class="container page-grid">
                <article class="prose">
${s.sections.map(([h, items]) => `                    <h2>${esc(h)}</h2>
                    <ul class="checks">
${items.map((i) => `                        <li>${esc(i)}</li>`).join('\n')}
                    </ul>`).join('\n')}
                    <h2>Nasıl çalışıyoruz?</h2>
                    <p>${esc(s.body)}</p>
                    <p>Süreç; ücretsiz keşif, projelendirme ve teklif, profesyonel kurulum ve teslim sonrası destek adımlarından oluşur. Kurulum tamamlandığında sistemin kullanımını yerinde gösteriyoruz.</p>
                    <h2>Hizmet bölgemiz</h2>
                    <p>Alanya merkez, Oba, Mahmutlar, Kestel, Cikcilli, Tosmur ve Konaklı başta olmak üzere Antalya genelinde hizmet veriyoruz.</p>
                </article>
${sideCard(s.slug)}
            </div>
        </section>`;
  write(path.slice(1), layout({
    path, title: `${s.title} | Karaca Güvenlik`, desc: s.desc, body,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'Service', name: s.title, serviceType: s.name, description: s.desc, areaServed: { '@type': 'City', name: 'Alanya' }, provider: business },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Hizmetler', item: SITE + '/#services' },
        { '@type': 'ListItem', position: 3, name: s.name, item: SITE + path },
      ] },
    ],
  }));
}

// KVKK aydınlatma metni
{
  const body = `${pageHero({ crumbs: [['Ana Sayfa', '/'], ['KVKK Aydınlatma Metni']], h1: 'KVKK Aydınlatma Metni', lead: '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, web sitemiz üzerinden paylaştığınız kişisel verilere ilişkin bilgilendirme.', buttons: false })}

        <section class="page-body">
            <div class="container faq-wrap">
                <article class="prose">
                    <h2>1. Veri sorumlusu</h2>
                    <p>Kişisel verileriniz, veri sorumlusu sıfatıyla <strong>${BUSINESS}</strong> (“Karaca Güvenlik”) tarafından aşağıda açıklanan kapsamda işlenmektedir.</p>
                    <table>
                        <tr><th>Adres</th><td>${ADDRESS}</td></tr>
                        <tr><th>Telefon</th><td><a href="tel:${PHONE}">${PHONE_TEXT}</a></td></tr>
                        <tr><th>E-posta</th><td><a href="mailto:${EMAIL}">${EMAIL}</a></td></tr>
                    </table>

                    <h2>2. İşlenen kişisel veriler</h2>
                    <p>Ücretsiz keşif formu, telefon veya WhatsApp üzerinden bizimle iletişime geçtiğinizde şu veriler işlenebilir:</p>
                    <ul class="checks">
                        <li>Kimlik bilgisi: ad ve soyad</li>
                        <li>İletişim bilgisi: telefon numarası, e-posta adresi ve keşif için paylaşılan adres</li>
                        <li>Talep bilgisi: ilgilendiğiniz hizmet ve mesajınızda paylaştığınız açıklamalar</li>
                    </ul>

                    <h2>3. İşleme amaçları</h2>
                    <ul class="checks">
                        <li>Keşif ve fiyat teklifi taleplerinizin alınması ve yanıtlanması</li>
                        <li>Keşif randevusunun planlanması ve sizinle iletişime geçilmesi</li>
                        <li>Kurulum, bakım ve teknik servis hizmetlerinin yürütülmesi</li>
                        <li>Yasal yükümlülüklerimizin yerine getirilmesi</li>
                    </ul>

                    <h2>4. Hukuki sebepler</h2>
                    <p>Kişisel verileriniz; KVKK md. 5/2-c uyarınca bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması, md. 5/2-ç uyarınca hukuki yükümlülüklerimizin yerine getirilmesi ve md. 5/2-f uyarınca temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatlerimiz hukuki sebeplerine dayanılarak işlenir.</p>

                    <h2>5. Toplama yöntemi ve aktarım</h2>
                    <p>Web sitemizdeki keşif formu bir sunucuya kayıt yapmaz; formu gönderdiğinizde bilgileriniz kendi WhatsApp uygulamanız üzerinden doğrudan işletme hattımıza mesaj olarak iletilir. Bu iletim, WhatsApp hizmetini sağlayan WhatsApp/Meta altyapısı üzerinden gerçekleşir. Kişisel verileriniz bunun dışında üçüncü kişilerle paylaşılmaz; yalnızca yasal zorunluluk halinde yetkili kamu kurum ve kuruluşlarına aktarılabilir.</p>
                    <p>Sitemizde reklam veya takip amaçlı çerez kullanılmaz. Harita, yalnızca “Haritayı göster” butonuna tıkladığınızda Google Haritalar üzerinden yüklenir; bu durumda Google’ın kendi gizlilik politikası geçerlidir.</p>

                    <h2>6. Saklama süresi</h2>
                    <p>Kişisel verileriniz, işleme amacının gerektirdiği süre ve ilgili mevzuatta öngörülen zamanaşımı süreleri boyunca saklanır; sürenin sonunda silinir, yok edilir veya anonim hale getirilir.</p>

                    <h2>7. Haklarınız</h2>
                    <p>KVKK md. 11 uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, şartları oluştuğunda silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme, otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.</p>
                    <p>Başvurularınızı yukarıdaki adrese yazılı olarak veya <a href="mailto:${EMAIL}">${EMAIL}</a> adresine e-posta ile iletebilirsiniz. Başvurunuz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.</p>
                </article>
            </div>
        </section>`;
  write('kvkk.html', layout({ path: '/kvkk.html', title: 'KVKK Aydınlatma Metni | Karaca Güvenlik', desc: 'Karaca Güvenlik ve Bilişim Sistemleri kişisel verilerin korunması ve işlenmesine ilişkin aydınlatma metni.', body }));
}

// 404 (served by GitHub Pages for any missing path, so all links are root-absolute)
write('404.html', layout({
  path: '/404.html', noindex: true, title: 'Sayfa bulunamadı | Karaca Güvenlik', desc: 'Aradığınız sayfa bulunamadı.',
  body: `        <section class="not-found">
            <div>
                <strong>404</strong>
                <h1>Aradığınız sayfa bulunamadı</h1>
                <p>Sayfa taşınmış veya kaldırılmış olabilir. Ana sayfadan devam edebilir ya da bize hemen ulaşabilirsiniz.</p>
                <div class="hero__buttons">
                    <a href="/" class="btn btn--primary btn--lg">Ana Sayfaya Dön ${icon.arrow}</a>
                    <a href="tel:${PHONE}" class="btn btn--ghost btn--lg">${icon.phone} Hemen Ara</a>
                </div>
            </div>
        </section>`,
}));

// sitemap.xml + robots.txt
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', ...services.map((s) => `/hizmetler/${s.slug}.html`), '/kvkk.html'];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *
Allow: /
Disallow: /old.html

Sitemap: ${SITE}/sitemap.xml
`);

console.log(`Generated ${services.length} service pages, kvkk.html, 404.html, sitemap.xml, robots.txt`);
