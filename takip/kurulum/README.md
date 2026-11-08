# Araç Takip Sistemi — Kurulum Rehberi

Bu rehber, TrackerKing cihazlarını (1× EC33, 4× G109) TrackerKing uygulaması yerine
kendi sunucumuza bağlamak için gereken tüm adımları içerir.

Sistem üç parçadan oluşur:

| Parça | Nerede | Ne işe yarar |
|---|---|---|
| **Traccar sunucusu** | Kendi sunucumuz (VPS) | Cihazlardan gelen konumları alır ve saklar, komutları gönderir |
| **Takip paneli** | `https://karacaguvenlik.github.io/takip/` | Canlı harita, geçmiş rota, motor durdurma/çalıştırma |
| **Cihazlar** | Araçlarda | SMS ile sunucumuzun adresine yönlendirilir |

> ⚠️ Cihazlar yönlendirildikten sonra **TrackerKing uygulamasında görünmez**. Geri dönmek
> isterseniz TrackerKing'in eski sunucu adresini (bkz. Adım 4, `SERVER#` / `(ip)` sorgusu) not alın.

---

## Adım 1 — Sunucuyu hazırlama

**Gerekenler**

- Sabit IP'li bir Linux VPS: **Ubuntu 24.04** önerilir. 1 vCPU, 1–2 GB RAM ve 20 GB disk 5–50 araç için yeterlidir
  (örn. Hetzner CX22, DigitalOcean 1 GB veya yerli bir VPS firması).
- Bir alan adı veya alt alan adı, örn. `takip.karacaguvenlik.com`. HTTPS için zorunludur.
  Panel HTTPS bir sitede çalıştığı için sunucuya da HTTPS ile bağlanması gerekir.

**Yapılacaklar**

1. VPS'i Ubuntu 24.04 ile oluşturun ve root şifresini veya SSH anahtarını alın.
2. Alan adı panelinizde (DNS) bir **A kaydı** ekleyin: `takip` → VPS IP adresi.
   Birkaç dakika içinde yayılır. Kontrol etmek için: `ping takip.karacaguvenlik.com`.
3. VPS sağlayıcısının ayrı bir güvenlik duvarı (firewall) paneli varsa şu portları açın:
   **22, 80, 443 ve 5023 (TCP)**.

## Adım 2 — Traccar'ı kurma (tek komut)

Sunucuya SSH ile bağlanın ve şu komutları çalıştırın:

```bash
curl -fsSLO https://karacaguvenlik.github.io/takip/kurulum/sunucu-kurulum.sh
sudo bash sunucu-kurulum.sh takip.karacaguvenlik.com
```

Betik sırasıyla şunları yapar:

- Traccar 6.17.0'ı kurar ve sistem servisi olarak başlatır (Java içinde gelir).
- Yalnızca **GT06 protokolünü (port 5023)** açar. Her iki model de bu protokolü kullanır.
- Panelin sunucuya bağlanabilmesi için `web.origin` ayarını `https://karacaguvenlik.github.io` olarak yapar.
- **Caddy**'yi kurar ve Let's Encrypt ile otomatik HTTPS sertifikası alır.
- Güvenlik duvarında 22, 80, 443 ve 5023 portlarını açar.

Betik birden fazla kez çalıştırılabilir; ayarlar çoğalmaz.

## Adım 3 — Yönetici hesabı ve araçları ekleme

1. Tarayıcıda `https://takip.karacaguvenlik.com` adresini açın. **İlk kayıt olan hesap yönetici olur**,
   bu yüzden hemen kendi hesabınızı oluşturun.
2. Yönetici olarak giriş yapıp *Ayarlar → Sunucu* bölümünde **"Kayıt"** (registration) seçeneğini kapatın.
   Böylece başkaları hesap açamaz.
3. Her araç için **Cihazlar → +** ile:
   - **Ad:** plaka veya araç adı (örn. `07 ABC 123`)
   - **Tanımlayıcı:** cihazın **15 haneli IMEI** numarası (cihazın etiketinde yazar veya `IMEI#` SMS'iyle öğrenilir)
4. Müşteriye ayrı hesap açacaksanız *Ayarlar → Kullanıcılar* bölümünden kullanıcı oluşturup
   yalnızca o müşterinin araçlarını bu kullanıcıya bağlayın.

## Adım 4 — Cihazları sunucuya yönlendirme (SMS)

SMS'leri **cihazın içindeki SIM kartın numarasına** gönderin. Komutlarda Türkçe karakter ve boşluk
kullanmayın. Cihaz genellikle `OK` veya ayarın kendisiyle yanıt verir.

**Türkiye APN değerleri:** Turkcell → `internet` · Vodafone → `internet` · Türk Telekom → `internet`.
M2M/IoT hatlarında APN farklı olabilir; operatörünüze sorun.

Aşağıdaki örneklerde `takip.karacaguvenlik.com` yerine kendi alan adınızı yazın.

### EC33 (4G)

Komutlar `#` ile biter.

| Amaç | SMS |
|---|---|
| Mevcut sunucuyu öğren (**önce bunu not alın**) | `SERVER#` |
| APN ayarla | `APN,internet#` |
| Sunucuyu ayarla (alan adı ile) | `SERVER,1,takip.karacaguvenlik.com,5023,0#` |
| Sunucuyu ayarla (IP ile, alternatif) | `SERVER,0,SUNUCU_IP,5023,0#` |
| Saat dilimi (Türkiye UTC+3) | `GMT,E,3,0#` |
| Gönderme aralığı: kontak açıkken 10 sn, kapalıyken 1 saat | `TIMER,10,3600#` |
| Motoru durdur (röle kes) | `RELAY,1#` |
| Motoru çalıştır (röle aç) | `RELAY,0#` |
| Durum sorgula (GPS/GSM/güç) | `STATUS#` |
| Ayarları sorgula | `PARAM#` |
| Konum sorgula | `WHERE#` |
| Cihazı yeniden başlat | `RESET#` |

Ayarlardan sonra `RESET#` gönderin; cihaz yaklaşık 1 dakika içinde sunucuya bağlanır.

### G109 (2G)

G109 komutları **parantez içinde** yazılır.

| Amaç | SMS |
|---|---|
| APN ayarla | `(apn,1,internet,,)` |
| Sunucuyu ayarla | `(ip,1,1,takip.karacaguvenlik.com,5023,1)` |
| Gönderme aralığı: kontak açıkken 30 sn, kapalıyken 1 saat, 30° dönüşte ek kayıt | `(uptime,1,30,3600,30)` |
| Kontak algılama: 1 = kontak kablosu, 0 = sanal (hareketle) | `(acc,1,1,0)` |
| Kilometre sayacını ayarla (km) | `(mile,1,12345)` |

> **G109 için not:** Bu komutlar G109'u GT06 / port 5023 ile kullanan bir platformun belgesinden
> alınmıştır ([smartGPS](https://wiki.smartgps.com.br/books/g109/page/informacoes-sobre-o-g109)).
> G109'un **motor durdurma** ve **sorgulama** SMS komutları doğrulanamadı. Cihaz kutusundan çıkan
> kılavuzda farklı bir komut varsa onu kullanın; kılavuzun fotoğrafını gönderirseniz bu tabloyu güncelleriz.
> Motor durdurma, cihaz sunucuya bağlandıktan sonra paneldeki **"Motoru durdur"** düğmesiyle
> GPRS üzerinden de denenebilir.

### Bağlantıyı kontrol etme

1. Panelde veya Traccar arayüzünde araç **çevrimiçi** (yeşil) görünmelidir.
2. Görünmüyorsa sunucuda kayıtları izleyin:
   ```bash
   tail -f /opt/traccar/logs/tracker-server.log
   ```
   - `Unknown device - 86xxxxxxxxxxxxx` → IMEI Traccar'a eklenmemiş veya yanlış yazılmış (Adım 3).
   - Hiç kayıt yoksa → APN yanlış, SIM kartta internet paketi yok veya 5023 portu kapalı.

## Adım 5 — Paneli kullanma

1. `https://karacaguvenlik.github.io/takip/` adresini açın.
2. **Sunucu adresi:** `https://takip.karacaguvenlik.com`, ardından Traccar kullanıcı adınız ve şifreniz.
3. Panel özellikleri:
   - Canlı harita (10 saniyede bir güncellenir); harita veya uydu görünümü
   - Araç listesi: durum, hız, kontak bilgisi, son veri zamanı; arama
   - Araç detayı: hız, kontak, akü voltajı, uydu sayısı, IMEI, Google Haritalar bağlantısı
   - Geçmiş rota: bugün, dün veya özel tarih aralığı; toplam mesafe ve en yüksek hız
   - Komutlar: **Motoru durdur / çalıştır** (onay ister) ve özel komut gönderme
     (örn. EC33 için `WHERE#`). Cihaz çevrimdışıysa komut sıraya alınır, bağlandığında gönderilir.
4. Telefonda da çalışır. Ana ekrana eklemek için tarayıcıda *Paylaş → Ana Ekrana Ekle* seçeneğini kullanın.

Hız sınırı, bölge (geofence) ve kontak bildirimleri gibi alarmlar Traccar arayüzündeki
*Ayarlar → Bildirimler* bölümünden kurulur. Resmi **Traccar Manager** mobil uygulaması da aynı sunucuya bağlanabilir.

## Bakım

| İş | Komut |
|---|---|
| Servis durumu | `systemctl status traccar caddy` |
| Yeniden başlat | `systemctl restart traccar` |
| Güncelle | `sudo TRACCAR_VERSION=6.x.y bash sunucu-kurulum.sh takip.karacaguvenlik.com` |
| Veritabanı yedeği | `systemctl stop traccar && cp -r /opt/traccar/data ~/traccar-yedek-$(date +%F) && systemctl start traccar` |

## Hukuki not

Araç takibi kişisel veri işler (KVKK). Takip edilen araçların sahiplerinden ve sürücülerinden
yazılı onay alın, verileri yalnızca bu amaçla kullanın.
