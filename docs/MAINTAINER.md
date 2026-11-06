# Bakım ve kurulum

Bu belge bakım sorumlusu içindir. Tasarımcıların yerel kurulum yapması gerekmez. Başlangıç altyapısının ayrıntıları [STARTER.md](STARTER.md) içinde korunur.

## Yapı

- `app/`: arayüz, sunucu uçları ve giriş yardımcıları.
- `app/lib/`: ortak veri türleri ve uygulama hizmetleri.
- `data/seed-public.json`: kamuyla paylaşılabilecek başlangıç derlemesi.
- `db/schema.ts` ve `drizzle/`: ortak veritabanı şeması ve sürümlü geçişler.
- `.openai/hosting.json`: Sites proje kimliği ve D1/R2 bağlama beyanı; gizli değer içermez.
- `scripts/`: kurulum, geliştirme, derleme ve veri hazırlama yardımcıları.

Canlı değişikliklerin ana kaydı D1 veritabanıdır. Tarayıcı depolaması ortak veri kaynağı değildir. GitHub kod geçmişini tutar; uygulamadaki içerik tarihçesinin yerine geçmez.

## Geliştirme

Node.js `>=22.13.0`, npm ve Git gerekir. Yayın paketleme için `tar` da gerekir; Windows `tar.exe` kullanılabilir. Sites eklentisiyle çalışırken eklentinin yaşam döngüsü talimatlarını izleyin. Bağımsız geliştirmede temel komutlar:

```sh
npm run install:ci
npm run dev
npm run build
npm start
```

Kilit dosyasını koruyun ve iki kurulumu aynı anda çalıştırmayın. Portable geliştirme önizlemesi varsayılan olarak 5173 portunda başlar; yalnız loopback adresinde tutun. `npm start`, derlenmiş Worker'ı yerel ortamda çalıştırır; yayın yapmaz.

Portable geliştirmede `/signin-with-chatgpt?return_to=/` yalnız yerel test kimliğini kullanır; `/signout-with-chatgpt?return_to=/` çıkış yapar. Bu taklit giriş üretim derlemesine dahil değildir. Gerçek sitede giriş platform tarafından yönetilir; bu ayrılmış yollar için uygulama içinde yeni OAuth uçları yazmayın.

## İnceleyici yetkisi

Üretim ortamındaki `MAINTAINER_EMAILS` ayarı yalnız sunucuda tutulur. Yetkili e-posta listesini Sites ortam ayarı/gizli değeri olarak yapılandırın; depoya veya arayüze koymayın. Giriş yapabilmek tek başına onay yetkisi vermez. Yetkisiz kullanıcıların sunucuya doğrudan istekle onay/geri alma yapamaması gerekir.

İlk inceleyicinin girişte kullanılan hesabının e-postasını doğrulayın. GitHub hesabı ile uygulama giriş hesabı farklı olabilir. Yerel test hesabını üretim listesine eklemeyin. Ortam değişikliği sonrasında ayarın uygulanması için yeni sürüm yayımlamak gerekebilir.

## Veritabanı geçişleri

Şema değişince:

```sh
npm run db:generate
```

Üretilen SQL'i inceleyip kaynak kontrolüne alın. Geçişler şema değişiklikleri içindir; özel çalışma kitabını topluca geçiş SQL'ine gömmeyin. Derleme `dist/server/wrangler.json` dosyasını üretir. Yerel ortamda sıradaki uygulanmamış geçişi çalıştırın:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Dosya adını gerçek bekleyen geçişle değiştirin. Aynı geçişi tekrar uygulamayın. Bu komut yalnız yerel önizleme veritabanını günceller; üretim yayını ayrı yönetilir.

## İnceleme ve tarihçe

İnceleyici kaynağı, birimi, deney türünü, ürün kapsamını ve koşulları kontrol eder. Çelişkili kaynaklar gerekçeyle korunabilir; farklı koşullar tek değere zorlanmamalıdır. Bir öneriyi reddederken kısa bir gerekçe yazın.

Aynı kişi + İstanbul takvim günü bir sürüm grubu oluşturur. Her değişikliğin önceki/sonraki içeriği ve kimliği korunur. Bu gruplama arayüzü sadeleştirir; tam kopya dosyalar yerine değişiklik kaydı tutmak depolamayı sınırlar. Geri alma yeni bir olay ekler. Sürüm çakışması alınırsa güncel veriyi yükleyip yeniden inceleyin.

## Yedekleme, yayın ve sahiplik

Kaynak kodu ile canlı veriyi ayrı yedekleyin. Düzenli güncel Excel/JSON dışa aktarımı saklayın; tam felaket kurtarma için barındırma sağlayıcısının D1 yedeği ve geri yükleme işlemini ayrıca belgeleyin. Kullanıcı listesini veya gizli değerleri herkese açık yedeğe eklemeyin.

GitHub deposu bir kaynak kodu dağıtımıdır. Sites çalışma ortamı, kimlik servisi, D1 verisi ve çalışma zamanı ayarları ayrı kaynaklardır. Fork oluşturmak canlı veriyi veya hesap sahipliğini taşımaz. Kurum sürdürülebilirliği için hesap sorumlusu, erişim devri, hizmet kotaları/ücretleri ve yedekleme sorumluluğunu belirleyin. Güncel fiyatları burada sabit kabul etmeyin.

`.env*`, `.dev.vars*`, `.sites-runtime/`, `.wrangler/`, `node_modules/` ve derleme çıktıları depoya alınmaz. Özel kaynak çalışma kitaplarını, CAD arşivlerini ve çocuklara ait belgeleri açık depoya eklemeyin. Kaynak veri hazırlama adımından sonra kamuya açık çıktıyı yeniden kontrol edin.

Yayın öncesinde anonim okuma, giriş gerektiren katkı, yetkisiz onay engeli, sürüm çakışması, yinelenen isteğin tek işlem üretmesi, geri alma ve Excel'in okunabilirliğini doğrulayın. Yayın URL'sini ancak başarılı yayın ve erişim kontrolünden sonra README'ye ekleyin.
