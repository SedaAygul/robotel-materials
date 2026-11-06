# Robotel · Malzeme Kütüphanesi

Robotel Türkiye tasarımcıları ve gönüllüleri için filament malzemelerini, kaynakları ve test koşullarıyla birlikte karşılaştıran açık kaynak bir kütüphane. Okçuluk ve yüzme aparatları başlangıç uygulamalarıdır; veri yapısı başka tasarımlara da genişleyebilir. Reçine sistemleri ileriki çalışma kapsamındadır.

Uygulama adresi: [Robotel Malzeme Kütüphanesi](https://robotel-malzeme-kutuphanesi.sedaaygul99.chatgpt.site).

## Neler yapılabilir?

- Ashby tarzı grafikte yoğunluk karşısında elastik modül, çekme/akma dayanımı veya uzamayı seçip mevcut ölçümleri inceleyin. Baskı yönü, koşullandırma ve test yöntemi farklılıklarını görün.
- Malzemeleri arayın, filtreleyin ve yan yana karşılaştırın. Özelliği eksik olan malzeme katalogda kalır.
- **Eksikler** görünümünden araştırılacak alanları bulun.
- Giriş yaptıktan sonra kaynaklı malzeme, ölçüm veya düzeltme önerisi gönderin. Yetkili inceleyicinin onayından sonra ortak veri güncellenir.
- Değişiklikleri tarihçeden izleyin; güncel veriyi Excel, JSON veya CSV olarak dışa aktarın.
- Yüzmede kalan uzva bağlanan palet ve elde kavramayı destekleyen ortez yaklaşımlarını ayrı inceleyin.

Herkes okuyabilir. Katkı için ChatGPT ile giriş kullanılır. Bekleyen ve reddedilen önerileri yalnız yazarı ve değerlendiriciler görebilir; onaylananlar yayımlanır. GitHub hesabı uygulamayı kullanmak için zorunlu değildir; kod geliştirmeleri GitHub üzerinden önerilebilir.

## Veriyi nasıl okumalıyız?

Bir polimer ailesi ile belirli marka, ürün, renk ve katkı içeren filament aynı kayıt değildir. Ölçümler kaynak ve numune koşullarıyla birlikte saklanır. Boş alan **bilinmiyor** demektir; sıfır veya olumsuz sonuç değildir. Grafikte gösterilemeyen kayıtlar katalogdan çıkarılmaz.

Bu kütüphane aday malzeme seçimini destekler. Bir ürünün teknik föyü veya grafikteki konumu, basılan çocuk aparatının güvenlik, biyouyumluluk ya da 1–2 yıllık kullanım ömrü onayı anlamına gelmez. Son tasarım, üretim koşulları ve kullanım yükleri ayrıca doğrulanmalıdır. Cilde temas eden astar da kendi malzemesi ve temas koşullarıyla değerlendirilir.

## Başlangıç

Tasarımcılar için [kullanım rehberi](docs/KULLANIM.md), katkıcılar için [katkı rehberi](CONTRIBUTING.md), kurulumu ve incelemeyi yönetenler için [bakım rehberi](docs/MAINTAINER.md) bulunur. Veri hakları [DATA_LICENSE.md](DATA_LICENSE.md) içinde açıklanır.

Uygulama kodu [MIT lisanslıdır](LICENSE). Üçüncü taraf teknik föy, makale, görsel ve CAD dosyalarının hakları kendi sahiplerine aittir; yazılım lisansı bu içerikleri yeniden lisanslamaz.

## Teknik temel ve sahiplik

Arayüz React/Vinext, ortak kayıtlar Cloudflare D1, giriş Sites üzerinden sağlanır. GitHub kaynak kodunu ve geliştirme geçmişini tutar. Canlı veri ve barındırma ayrı hizmetlerdir; GitHub deposunun kopyalanması canlı veritabanını kopyalamaz. GitHub Pages statik barındırma sunduğu için bu ortak yazma ve inceleme akışını tek başına çalıştırmaz. [GitHub Pages açıklaması](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Excel çıktısı Drive üzerinden paylaşılabilir. Bu sürüm otomatik çift yönlü Drive/Excel eşitlemesi içermez; canlı uygulama ortak değişikliklerin ana kaydıdır. Barındırma, kimlik ve veritabanı hesabının sahipliği ile güncel hizmet limitleri bakım sorumlusunca takip edilmelidir.
