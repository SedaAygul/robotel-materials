# Tasarımcılar için kullanım rehberi

## 1. Kullanım ihtiyacını yazın

Parçanın görevi, yükün yönü ve tekrar sayısı, su/nem/ısı ortamı, cilde temas, temizleme yöntemi, yazıcı kapasitesi ve maliyet sınırlarıyla başlayın. Okçulukta yük taşıyan parça ile yumuşak astarın, yüzmede kuvvet ileten palet ile bağlantının gereksinimleri aynı olmayabilir. Kütüphane tek bir "en iyi filament" seçmez.

## 2. Kataloğu ve eksikleri inceleyin

Malzeme kartı bir aileyi veya belirli bir ticari ürünü temsil eder. PLA ailesi için bulunan bir değeri bütün PLA ürünlerine, renklerine veya baskı yönlerine taşımayın. Malzeme adının bulunması, tüm özelliklerinin doğrulanmış olması anlamına gelmez.

**Eksikler** görünümü araştırma listesi olarak kullanılabilir. Örneğin yorulma verisi bulunmayan bir ürün görünür kalır; bu alan **eksik** olarak görünür. Eksik veri, yüksek ya da düşük performans sonucuna çevrilmez.

## 3. Ashby tarzı grafiği okuyun

İki sayısal özelliği eksenlere seçin. Yoğunluk–çekme elastik modülü grafiği başlangıç için yararlıdır. Bir noktanın hangi ürüne, kaynağa, baskı yönüne ve koşula ait olduğunu ayrıntısından kontrol edin.

- Aynı ürünün kuru/nemli veya XY/Z ölçümleri farklı noktalardır; farklar anlamlıdır.
- Eksenlerden biri eksikse kayıt grafikte çizilemez. Katalogda bulunmaya devam eder.
- Logaritmik eksende eşit uzaklıklar eşit farkları değil oranları gösterir; sıfır ve negatif değer çizilemez.
- Bir "±" değeri, kaynak açıklamıyorsa otomatik olarak standart sapma kabul edilmez.
- Çekme ve eğilme modülü gibi farklı deneylerin sonuçları tek özellikmiş gibi birleştirilmemelidir.

Grafikteki yerleşim bir sıralama veya güvenlik puanı değildir. Önce zorunlu kullanım koşullarını sağlayan adayları belirleyin, sonra kütle, rijitlik, üretilebilirlik ve maliyeti birlikte karşılaştırın.

## 4. Adayları yan yana karşılaştırın

Karşılaştırma için az sayıda aday seçin. Bilinen sayısal değerlerle birlikte yöntem, üretim şekli ve boş alanları okuyun. Enjeksiyonla üretilmiş numunenin değeri, yazıcıda basılmış parçanın doğrudan garantisi değildir.

Yüzme için yoğunluk, su emme, klorlu/tuzlu su koşulları, temizlenebilirlik ve bağlantıların davranışı ayrı sorulardır. Yoğunluk tek başına tamamlanmış aparatın yüzebilirliğini veya kullanıcı üzerindeki etkisini açıklamaz. Suyu yüzeyde itme davranışı ile bünyeye su alma davranışı da ayrı özelliklerdir.

Okçuluk için yalnız ilk çekmedeki dayanım yeterli bir karşılaştırma olmayabilir. Tekrarlanan yük, yön, çentikler/bağlantılar ve baskı kalitesi bağlamını araştırın. Kütüphanede veri bulunmayan bir konuda prototip doğrulama işi açın.

## 5. Kaynaklı katkı önerin

Giriş yaptıktan sonra boş alanı tamamlamak veya hatayı düzeltmek için öneri gönderin. Katkının incelenmesini bekleyin. Öneri formuna çocuk adı, fotoğrafı, sağlık bilgisi veya özel dosya eklemeyin. Ayrıntılar [katkı rehberinde](../CONTRIBUTING.md).

## 6. Veriyi paylaşın

Excel, JSON veya CSV çıktısı o anki ortak verinin bir kopyasıdır. Dosyadaki sürüm bilgisini ve kaynakları koruyun. Excel'i Drive'da paylaşabilirsiniz; dosyada sonradan yaptığınız değişiklikler bu sürümde canlı uygulamaya kendiliğinden geri dönmez. Ortak kayda işlenecek düzeltmeyi uygulamadaki öneri yoluyla gönderin.

## Yüzme tasarımları

İlk karşılaştırma kalan uzva bağlanan palet ile elde kavramayı destekleyen ortez yaklaşımını ayrı tutar. Hedef anatomi, bağlantı, hareket serbestliği, ayrılma mekanizması ve temizleme gereksinimlerini birlikte okuyun. Henüz ortak bir tasarım seçildiği varsayılmaz. Bir modelin çevrim içi bulunması veya CAD dosyasının olması, çocuklar için kullanım onayı değildir.
