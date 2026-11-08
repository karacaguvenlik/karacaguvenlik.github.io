# Çıtır Pizza & Cafe — kullanım ve yayın kontrolü

## Önizleme ve yönetim

- Müşteri sayfası: `/` (varsayılan Türkçe). Diğer diller: `/?lang=en`, `/?lang=de`, `/?lang=ru`.
- Yönetim: `/admin`. İlk çalıştırmada rastgele oluşturulan `owner` hesabı yalnızca sunucunun özel başlangıç çıktısında gösterilir. Bu bilgileri paylaşmayın; panelden kişisel yönetici hesabınızı oluşturun, ilk şifreyi değiştirin.
- Fiyatlar örnek tutarlardır. Menüden ürün ve kategori düzenleyebilir, satışa kapatabilir, çevirileri değiştirebilirsiniz. Gerçek fiyatları girene kadar “örnek fiyat” uyarısını kaldırmayın.
- Bölge minimumu yalnızca ürün ara toplamına uygulanır; teslimat bedeli minimumu doldurmaz. Eşiğin altındaki siparişler hem ekranda hem sunucuda engellenir. Bölgeyi kapatabilir veya teslimat ücretini değiştirebilirsiniz.
- Siparişler SQLite veritabanında kalıcıdır; farklı cihazdaki panelden görülebilir. Sunucu çalışmalı, veritabanı kalıcı diskte tutulmalıdır. Önizleme yayındaki işletme hizmetinin yerine geçmez.
- Sesli bildirimi panelde açıkça etkinleştirin. Sekme açık ve internet bağlantısı aktif olmalıdır; bu sürüm arka planda çalışan SMS veya mobil push servisi değildir.

## Online kredi kartı nasıl açılır?

Mevcut bir ödeme kuruluşu hesabı olmadığı için **online tahsilat bu sürümde etkin değildir**. Kapıda nakit ve kapıda POS seçenekleri çalışır. Paneldeki ayar tek başına bir sanal POS oluşturmaz.

1. iyzico, PayTR veya tercih ettiğiniz lisanslı ödeme kuruluşuna işletme başvurusu yapın. İstenen işletme/vergi/banka belgeleri ve komisyonlar sağlayıcıya göre değişir; doğrudan sağlayıcıdan öğrenin.
2. Sağlayıcıyı seçtikten sonra sandbox hesabı ve test anahtarlarıyla sunucu entegrasyonu yapılır. Gizli anahtarlar sohbete veya panele yazılmaz, sunucu ortamında tutulur.
3. Sunucu güncel sepet tutarından bir ödeme oturumu başlatır; müşteri sağlayıcının güvenli ödeme ekranına yönlendirilir. Kart numarası ve CVV bu sistemde toplanmaz veya saklanmaz.
4. Sadece müşterinin geri döndüğü sayfaya güvenilmez: sağlayıcı sonucu sunucudan sorgulanır, imzalı bildirimler doğrulanır, tutar/para birimi/sipariş eşleşmesi kontrol edilir. Tekrarlanan bildirimler çift sipariş/ödeme yaratmamalıdır.
5. Başarılı, başarısız, iptal, zaman aşımı, tekrar bildirim ve iade senaryoları test edildikten sonra canlı anahtarlara geçilir. Canlı küçük tutarlı ödeme ve mutabakat testi yapılır.

Resmî örnek akış: [iyzico Checkout Form](https://docs.iyzico.com/odeme-metotlari/odeme-formu/cf-entegrasyonu). Sağlayıcı seçilmeden veya gerçek ödeme doğrulanmadan “ödendi” durumu üretilmez.

## SEO ve Google Ads

- Gerçek alan adınızı sunucuda `PUBLIC_URL=https://alan-adiniz` olarak tanımlayın. Kanonik bağlantılar, dört dilin hreflang karşılıkları, sitemap ve restoran şeması bu adrese göre üretilir.
- Alan adını Google Search Console'a doğrulayın ve `/sitemap.xml` adresini gönderin. Google İşletme profilindeki site/sipariş bağlantısını güncelleyin; işletme adı, adres ve telefonun tutarlı olduğunu kontrol edin.
- Menü içeriği sunucudan HTML olarak sunulur; JavaScript çalışmasa da arama motorları metinleri okuyabilir. Panel, API ve önizleme indekslenmemelidir. Google sıralaması veya reklam başarısı garanti edilemez.
- Google Ads dönüşüm işlemini “web sitesi / sipariş gönderimi” olarak oluşturun. Panelde `AW-…` kimliğini ve dönüşüm etiketini girin; bunlar herkese açık etiket tanımlayıcılarıdır, gizli API anahtarı değildir.
- Etiket ancak ziyaretçi reklam ölçümüne ayrıca izin verdikten sonra yüklenir (temel izin modu). Reddetmek siparişi engellemez. Tercihler alt menüden değiştirilebilir. Müşterinin adı, telefonu, adresi veya notu reklam olayına gönderilmez.
- Dönüşüm sunucunun siparişi başarıyla kaydetmesinden sonra benzersiz sipariş kimliği ve tutarı ile gönderilir; kapıda ödeme için bu, tahsilat değil sipariş oluşturma dönüşümüdür. Örnek fiyat modu açıkken reklam dönüşümü gönderilmez.
- Etiketleri açmadan önce işletmeye özel çerez/KVKK metinlerini ve veri aktarım şartlarını hukuken kontrol ettirin. Canlı Ads hesabında etiket ve dönüşüm doğrulaması henüz yapılmamıştır.

Resmî izin yaklaşımı: [Google temel izin modu](https://developers.google.com/tag-platform/security/guides/consent?consentmode=basic).

## Gerçek siparişten önce zorunlu kontrol

- Gerçek ürün fiyatları, içerik ve alerjenler, ürün fotoğrafları ve dört dilde çevirilerin işletme tarafından doğrulanması.
- Teslimat mahalleleri, limitleri ve ücretlerinin doğrulanması; çalışma saatleri ve sipariş kabul durumunun ayarlanması.
- İşletmenin ticari unvanı, gerekli iletişim bilgileri, KVKK aydınlatması, saklama/silme politikası ve uygulanabilir sipariş/sözleşme metinlerinin tamamlanması. Mevcut metinler hukuki danışmanlık veya tamamlanmış uyum beyanı değildir.
- HTTPS, güvenli yönetici şifreleri, personel yetkileri, kalıcı disk, yedekleme/geri yükleme, sunucu gözetimi ve erişim loglarının korunması.
- Restoran ile gerçek cihazlarda sipariş kabulü, hazırlık ve teslimat akışının denenmesi. Test siparişleri gerçek siparişlerden ayrılmalıdır.
