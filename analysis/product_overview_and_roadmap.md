# TaskFlow AI — Ürün Analizi ve Yol Haritası

> **Bu belgenin amacı:** TaskFlow'un ne olduğunu, kullanıcıların ürünü nasıl kullanacağını, bugünkü durumu ve sıradaki işleri sade bir dille anlatmak.
>
> **Son düzenleme:** 19 Kasım 2026  
> **Dal:** `main`  
> **Ayrıntılı teknik gereksinimler:** [Ürün iş akışları ve gereksinim analizi](./product_workflows_requirements.md) — kabul senaryoları, güvenlik ve kalite gereksinimleri, kaynak kod incelemeleri ve teknik takip kayıtları burada tutulur.

---

## 1. TaskFlow nedir?

TaskFlow AI, küçük ve orta ölçekli ekiplerin işlerini tek bir yerde düzenlemesine yardımcı olmayı hedefleyen bir proje ve görev yönetimi uygulamasıdır.

Bir ekip TaskFlow'da:
- Bir çalışma alanı (workspace) oluşturabilir.
- Çalışma alanı içinde projeler açabilir.
- Projelere görevler ekleyebilir.
- Görevleri ekip arkadaşlarına atayabilir, öncelik ve teslim tarihi belirleyebilir.
- Web veya Android uygulamasından görevlerini takip edebilir.
- İnternet bağlantısı olmadığında Android'de yaptığı bazı değişiklikleri daha sonra göndermek üzere saklayabilir.
- İleride, görevlerin gecikme riskini veriye dayalı bir modelle değerlendirebilir.

TaskFlow'un amacı yalnızca görev listesi sunmak değil; ekiplerin işlerini planlamasını, ilerlemeyi görmesini ve olası gecikmeleri daha erken fark etmesini sağlamaktır.

### İlk sürümün sınırları

İlk sürümde odağımız workspace, proje, görev, ekip üyeliği, web/Android kullanımı ve güvenilir veri senkronizasyonu olacak.

Abonelik ve ödeme, takvim entegrasyonları, gelişmiş raporlar, zaman takibi, Gantt şeması ve kurumsal tek oturum açma (SSO) şimdilik kesinleşmiş kapsamda değil. Bunları ancak temel ürün akışları oturduktan sonra değerlendireceğiz.

---

## 2. Kullanıcılar TaskFlow'u nasıl kullanacak?

Bir kullanıcının baştan sona yaşayacağı temel yolculuk şöyle:

1. **Hesap açar veya giriş yapar.** E-posta ve parolasıyla hesabına erişir.
2. **Bir çalışma alanına katılır.** Kendi çalışma alanını oluşturabilir veya başka bir ekipten davet alabilir.
3. **Proje oluşturur.** Örneğin “Mobil uygulama” veya “Yeni web sitesi” gibi bir proje açar.
4. **Görev ekler.** Göreve başlık, açıklama, öncelik, sorumlu kişi ve teslim tarihi verir.
5. **Ekiple birlikte çalışır.** Görevler güncellenir, yorumlar eklenir ve sorumlular değişebilir.
6. **İlerlemesini takip eder.** Web ve Android'de aynı görev bilgilerini görür.
7. **Gerekirse çevrimdışı çalışır.** Android uygulaması bağlantı yokken yapılan desteklenen değişiklikleri cihazda saklar ve bağlantı geldiğinde göndermeyi dener.
8. **Gecikme riskini inceler.** İleride sistem, görev ve ekip iş yükü verilerinden yararlanarak deneysel bir risk değerlendirmesi sunabilir.

Bu, ürünün hedeflediği yolculuktur. Bütün adımların gerçek ortamda uçtan uca sorunsuz çalıştığı henüz kanıtlanmış değildir.

---

## 3. Kullanıcı rolleri ve yetkiler

Her çalışma alanında herkesin aynı yetkiye sahip olması doğru olmaz. Bu nedenle dört temel rol kullanıyoruz:

| Rol | Ne yapabilir? |
|---|---|
| **OWNER (Sahip)** | Çalışma alanının sahibi olur; üyeleri ve önemli çalışma alanı ayarlarını yönetir. |
| **ADMIN (Yönetici)** | Günlük ekip yönetimi ve izin verilen yönetim işlemlerini yapar. Sahip rolünü kendi başına veremez. |
| **MEMBER (Üye)** | Projelerde ve görevlerde çalışır. |
| **VIEWER (İzleyici)** | Bilgileri görüntüler; değişiklik yapamaz. |

Önemli güvenlik kuralı: Bir kullanıcının hangi işlemi yapabileceğine yalnızca ekrandaki butonlara bakarak karar verilmez. Backend (sunucu tarafı) her istekte kullanıcının gerçekten o yetkiye sahip olup olmadığını kontrol etmelidir.

**Henüz netleştirmemiz gereken konu:** MEMBER rolünün proje oluşturma, üye davet etme, yorum silme ve görev silme gibi işlemlerdeki sınırları tek bir yetki tablosuyla kesinleştirilmeli.

---

## 4. Ürünün ana parçaları

TaskFlow birden fazla uygulama ve servisin birlikte çalışmasıyla oluşuyor. Her parçanın görevi farklı:

| Parça | Görevi |
|---|---|
| **Web uygulaması** | Kullanıcının tarayıcıdan projeleri ve görevleri yönetmesini sağlar. |
| **Android uygulaması** | Telefonda görevleri görüntüleme, güncelleme ve çevrimdışı çalışma deneyimini sağlar. |
| **Backend (sunucu)** | Giriş, yetkiler, projeler, görevler ve iş kurallarının asıl yönetildiği yerdir. |
| **Veritabanı** | Kullanıcı, çalışma alanı, proje, görev ve diğer kalıcı bilgileri saklar. |
| **Arka plan işleri** | E-posta gibi işlemleri ana isteği bekletmeden yürütmek için kullanılır. |
| **ML servisi** | Yeterli ve güvenilir veri olduğunda görev gecikme riskini değerlendirmek için kullanılır. |

Web ve Android aynı bilgiyi göstermelidir. Bir görevdeki asıl ve geçerli bilgi backend ile veritabanında tutulur; istemciler kendi başlarına farklı bir gerçeklik oluşturmamalıdır.

---

## 5. Ana iş akışları ve bugünkü durum

Aşağıdaki durumlar, kaynak kod incelemesi ve erişebildiğimiz CI sonuçlarına göre hazırlanmıştır. “Kodda mevcut” demek, her gerçek kullanıcı senaryosunun eksiksiz test edildiği anlamına gelmez.

### 5.1 Hesap açma, giriş ve oturum

**Beklenen davranış**

Kullanıcı kayıt olur, giriş yapar ve güvenli bir oturum alır. Oturumun süresi dolduğunda uygulama bunu güvenli biçimde yenileyebilmelidir. Kullanıcı çıkış yaptığında oturumu geçersiz hale gelmelidir.

**Bugünkü durum**
- Backend'de kayıt, giriş, token yenileme ve çıkış işlemleri bulunuyor.
- Refresh token (oturumu yenilemek için kullanılan uzun ömürlü anahtar) yenileme mantığı için testler mevcut.
- 19 Kasım itibarıyla son CI çalışmasında backend testlerinin 10 test dosyası ve 25 testi başarılı oldu.
- Android tarafında token yenileme ve backend oturumunu kapatma akışı hâlâ tamamlanması gereken konular arasında.

**Sıradaki işler**
- Parola değişince açık oturumların da güvenli biçimde kapatıldığını doğrulamak.
- Web ve Android oturum davranışlarını aynı güvenlik beklentisine getirmek.
- Aynı refresh token iki istek tarafından aynı anda kullanıldığında yalnızca bir isteğin başarılı olmasını sağlamak.

### 5.2 Çalışma alanı oluşturma ve üyelik

**Beklenen davranış**

Kullanıcı bir çalışma alanı oluşturduğunda otomatik olarak o alanın sahibi olmalı. Bir çalışma alanına yalnızca üyesi olan kullanıcılar erişebilmeli.

**Bugünkü durum**
- Çalışma alanı ve üyelik yönetimi için backend kodu bulunuyor.
- Üyelik rolü ve çalışma alanı sınırları için kontroller eklendi.
- Başka bir çalışma alanına ait veriye erişim ve tüm rol kombinasyonları gerçek uçtan uca testlerle ayrıca doğrulanmalı.

**Sıradaki işler**
- OWNER, ADMIN, MEMBER ve VIEWER için izinleri tek bir tabloda kesinleştirmek.
- Her API işleminde çalışma alanı üyeliğinin kontrol edildiğini test etmek.
- Son OWNER'ın yanlışlıkla silinmesini veya yetkisinin düşürülmesini önlemek.

### 5.3 Ekip üyesi davet etme

**Olmasını istediğimiz davranış**

OWNER veya yetkili ADMIN bir e-posta adresine davet gönderir. Davet edilen kişi bağlantıyı açar ve kabul eder. Davet belirli bir süre geçerli olur; kabul edilen davet tekrar kullanılamaz.

**Bugünkü durum**

Mevcut akış, sistemde zaten hesabı bulunan kişiyi çalışma alanına doğrudan aktif üye olarak ekleyebiliyor. Gerçek bir davet bağlantısı, daveti kabul etme, süresinin dolması ve iptal edilmesi akışı henüz tamamlanmış değil.

**Sıradaki işler**
- Davetli kişinin önceden hesabı olmasının gerekip gerekmediğine karar vermek.
- Davet oluşturma, gönderme, kabul etme, iptal etme ve sürenin dolması adımlarını tasarlamak.
- Her adım için güvenlik ve test senaryolarını hazırlamak.

### 5.4 Proje ve görev yönetimi

**Beklenen davranış**

Kullanıcı çalışma alanında proje oluşturur. Projeye görev ekler; görev için sorumlu, öncelik ve teslim tarihi belirler. Görev güncellendiğinde diğer istemciler de güncel bilgiyi görür.

**Bugünkü durum**
- Proje ve görev işlemleri için backend ve web arayüzü mevcut.
- Tek bir görevin ayrıntısını getiren endpoint eklendi; web ekranı bu endpoint'i kullanacak şekilde düzenlendi.
- Görev güncellemelerinde eski bilgiyle yeni bilgiyi ezmeyi önlemek için sürüm kontrolü kullanılıyor. Buna *eşzamanlı güncelleme kontrolü* denir.
- Bazı silme, arşivleme ve geri alma davranışlarının ürün kuralı netleştirilmeli.

**Sıradaki işler**
- Proje silindiğinde veya arşivlendiğinde içindeki görevlerin ne olacağını kararlaştırmak.
- Aynı görev iki farklı yerden aynı anda güncellenirse kullanıcıya anlaşılır bir uyarı göstermek.
- Listeleme, arama, filtreleme ve sayfalama davranışlarını tamamlamak.
- Rol bazında butonların ve backend izinlerinin birbiriyle tutarlı olduğunu doğrulamak.

### 5.5 Görev gecikme riski ve makine öğrenmesi

**Ürün hedefi**

TaskFlow ileride bir görevin zamanında bitirilememe riskini değerlendirebilmeli. Örneğin teslim tarihine kalan süre, görevi üstlenen kişinin iş yükü ve görev üzerindeki hareketlilik gibi bilgilerden yararlanabilir.

**Önemli ayrım**

Bir modelin “LOW”, “MEDIUM” veya “HIGH” demesi, görevin gecikme ihtimalinin yüzde 20, 50 veya 85 olduğu anlamına gelmez. Gerçek bir yüzde gösterebilmek için yeterli gerçek veriyle eğitilmiş, ayrı veriler üzerinde ölçülmüş ve olasılıkları güvenilirliği açısından kontrol edilmiş bir model gerekir.

**Bugünkü durum**
- ML servisi ve model altyapısı projede bulunuyor.
- Mevcut örnek veri çok küçük ve sentetik; gerçek ekiplerin görev geçmişini temsil etmiyor.
- Sabit risk puanlarının gerçek olasılık gibi gösterilmesini önlemek için API tarafındaki `risk_score` alanı artık `null` döndürüyor.
- Bu nedenle bugün TaskFlow'un gerçek gecikme olasılığını tahmin ettiğini söyleyemeyiz.

**Sıradaki işler**
1. “Gecikmiş görev” tanımını netleştirmek.
2. Modelin hangi zaman aralığı için tahmin yapacağını belirlemek.
3. Gerçek ve izinli kullanım verisi oluşmadan başarı iddiasında bulunmamak.
4. Modeli basit bir başlangıç yöntemiyle karşılaştırmak ve sonuçlarını ölçmek.
5. Yeterli kanıt oluşana kadar ekranda bunu deneysel özellik olarak tanıtmak.

### 5.6 Android çevrimdışı çalışma ve senkronizasyon

**Beklenen davranış**

Kullanıcı internet bağlantısı yokken desteklenen bir görev değişikliğini yapabilir. Uygulama bu işlemi telefonda saklar. Bağlantı geldiğinde sunucuya gönderir ve sonucuna göre işlemi tamamlandı, bekliyor veya kullanıcı müdahalesi gerekiyor şeklinde işaretler.

**Bugünkü durum**
- Room veritabanında bekleyen işlemleri saklayan bir kuyruk bulunuyor.
- WorkManager, bağlantı geldiğinde bu işlemleri göndermek için kullanılıyor.
- İşlemler kullanıcı hesabıyla ilişkilendiriliyor; böylece bir hesaba ait bekleyen değişikliklerin başka bir hesapla gönderilmesi önlenmeye çalışılıyor.
- Başarılı yanıt, yetki hatası, oturum hatası ve çakışma gibi durumlar için farklı davranışlar tanımlandı.
- Ancak sunucu işlemi kaydettiği halde yanıt telefona ulaşmazsa ne olacağı ve aynı isteğin tekrar gönderilmesi gibi durumlar daha kapsamlı test edilmeli.

**Sıradaki işler**
- Ağ kesintisi, oturum süresinin dolması, 403, 409, 429 ve sunucu hatalarını ayrı ayrı test etmek.
- Uygulama gönderim sırasında kapanırsa verinin kaybolmadığını doğrulamak.
- Aynı işlemin iki kez uygulanmasını önleyecek güvenli tekrar gönderim kuralını tamamlamak.
- Kullanıcıya bekleyen, tamamlanan ve çözümlenmesi gereken işlemleri anlaşılır göstermek.

### 5.7 Bildirimler ve e-postalar

**Beklenen davranış**

Bir görev başka bir kullanıcıya atandığında veya önemli bir olay gerçekleştiğinde ilgili kişiye bildirim gönderilir. E-posta gönderilemezse görev kaydı yine de kaybolmamalı; başarısız gönderim izlenebilmeli ve güvenli biçimde tekrar denenebilmelidir.

**Bugünkü durum**
- Bildirim kuyruğu ve e-posta işleyicisi için kod bağlantıları mevcut.
- E-posta içeriğinde kullanıcıdan gelen metinlerin güvenli biçimde gösterilmesi için düzenlemeler yapıldı.
- Gerçek SMTP teslimatı, başarısız gönderimlerin tekrar denenmesi ve aynı bildirimin iki kez gönderilmemesi henüz yeterince kanıtlanmadı.

**Sıradaki işler**
- Gerçek test e-posta hesabıyla gönderim testi yapmak.
- Başarısız e-postaların tekrar deneme kuralını belirlemek.
- Aynı görev ataması için gereksiz tekrar e-postası gönderilmesini önlemek.
- Veritabanına kaydedilmiş önemli bir olayın bildirim kuyruğuna da güvenilir biçimde ulaştığını doğrulamak.

### 5.8 Hata kayıtları ve geçmiş

TaskFlow'da önemli işlemlerin kim tarafından ve ne zaman yapıldığını takip edebilmeliyiz. Bu kayıtlar, sorunları anlamak ve gerektiğinde geriye dönük inceleme yapmak için önemlidir.

Bu alanın yazma işlemleriyle aynı güvenilirlikte çalıştığı henüz kanıtlanmış değil. Özellikle görev kaydı başarılı olup geçmiş kaydı başarısız olursa nasıl davranacağımızı netleştirmeliyiz.

### 5.9 Kurulum ve işletim

TaskFlow'u yalnızca geliştiren kişinin bilgisayarında değil, temiz bir makinede de kurabilmeliyiz.

**Bugünkü durum**
- Docker Compose yapılandırması ve servis imajlarının oluşturulması CI'da kontrol ediliyor.
- 19 Kasım'daki son CI çalışmasında Docker doğrulama ve imaj oluşturma işi başarılı oldu.
- Bu sonuç, tüm servislerin gerçek bir sunucuda birlikte çalıştığını veya yedekleme/geri yüklemenin test edildiğini tek başına kanıtlamaz.

**Sıradaki işler**
- Temiz bir ortamda kurulum ve veritabanı migration adımlarını çalıştırmak.
- Uygulama açıldıktan sonra kayıt, giriş, proje, görev ve bildirim akışlarını denemek.
- Yedek alma ve yedekten geri dönme denemesi yapmak.
- Production ortamında HTTPS, gizli anahtarlar, loglar ve sağlık kontrollerini doğrulamak.

---

## 6. Şu anki durumumuz

19 Kasım 2026 itibarıyla son GitHub Actions çalışması **#195**:

[CI #195 — GitHub Actions](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/44372516928)

| Kontrol | Sonuç | Ne anlama geliyor? |
|---|---|---|
| Backend testleri ve build | Başarılı | 10 test dosyası ve 25 test geçti; backend build adımı da başarılı. |
| Web lint, typecheck ve build | Başarılı | Web kodu kontrol edildi ve üretim derlemesi oluşturuldu. |
| ML testleri | Başarılı | Mevcut ML servis testleri geçti; modelin gerçek hayattaki başarısını kanıtlamaz. |
| Docker yapılandırması ve imajlar | Başarılı | Compose yapılandırması kontrol edildi ve imajlar oluşturuldu. |
| Android | Başarısız | Gradle, Foojay toolchain eklentisini indiremedi. Hata uygulama testine ulaşmadan, Android projesi hazırlanırken oluştu. |

**Önemli:** Bu nedenle CI'ın tamamı şu anda yeşil değil. Android tarafındaki son hata, uygulama testinin başarısız olduğunu göstermiyor; Gradle'ın ihtiyaç duyduğu eklentiyi bulamaması nedeniyle derleme başlamadan durdu.

Ayrıca backend'in tüm eski lint (kod biçimi ve kalite) uyarılarını temizleme işi devam ediyor. Yeni değişen backend dosyaları için daha sıkı bir kontrol uygulanıyor; eski dosyalardaki tüm sorunların kapandığını söylemiyoruz.

---

## 7. Öncelik sıramız

Yeni özelliklere dağılmadan önce aşağıdaki sırayı izleyelim:

| Öncelik | Yapılacak iş | Neden önemli? |
|---|---|---|
| 1 | Android Gradle eklentisinin CI'da çözülememe sorununu gidermek | Android derleme ve testlerinin yeniden çalışabilmesi için gerekli. |
| 2 | Oturum güvenliğini Web ve Android'de tamamlamak | Kullanıcının hesabı ve açık oturumları korunmalı. |
| 3 | Android çevrimdışı senaryolarını ve tekrar gönderimi test etmek | Kullanıcının yaptığı değişiklikler kaybolmamalı veya iki kez uygulanmamalı. |
| 4 | Üye daveti ve rol kurallarını netleştirmek | Ekip yönetimi güvenli ve anlaşılır olmalı. |
| 5 | Bildirim ve geçmiş kayıtlarının güvenilirliğini artırmak | Önemli olaylar kaybolmamalı ve tekrar etmemeli. |
| 6 | ML özelliğinin gerçek kapsamını belirlemek | Deneysel bir sonucu gerçek tahmin gibi sunmamalıyız. |
| 7 | Temiz kurulum, yedekleme ve geri yüklemeyi doğrulamak | Projeyi başka bir ortamda güvenle çalıştırabilmeliyiz. |
| 8 | Kullanıcı deneyimi, erişilebilirlik ve performans kontrolleri | Ürünün günlük kullanım kalitesini artırmak. |

Bu sıra değişebilir; ancak bir işin önceliği değiştiğinde nedenini bu belgede açıklayacağız.

---

## 8. Henüz karar vermemiz gereken ürün soruları

Bunlar doğrudan kod yazarak çözülecek konular değil; önce nasıl bir ürün davranışı istediğimize karar vermeliyiz.

1. Davet edilen kişinin TaskFlow hesabı önceden bulunmak zorunda mı?
2. MEMBER hangi yönetim işlemlerini yapabilmeli?
3. Proje arşivlendiğinde içindeki görevler nasıl davranmalı?
4. Görev silme, arşivleme ve geri alma seçenekleri ilk sürümde bulunmalı mı?
5. “Gecikmiş görev” tam olarak ne demek olacak?
6. ML tahmini hangi zaman aralığı için yapılacak?
7. ML için yeterli gerçek veri oluşana kadar bu özellik kullanıcıya nasıl gösterilecek?
8. İlk sürümde hangi bildirimler e-posta, hangileri uygulama içi olacak?
9. İlk teslimde abonelik veya ödeme sistemi gerekli mi?

Karar verilmemiş bir konuyu kodda varsayımla uygulamak yerine burada açıkça kaydetmeliyiz.

---

## 9. Sık kullanılan terimler

| Terim | Basit açıklama |
|---|---|
| **Workspace** | Bir ekibin projelerini ve üyelerini bir arada tuttuğu çalışma alanı. |
| **Backend** | Uygulamanın kurallarını çalıştıran ve verileri yöneten sunucu tarafı. |
| **API** | Web/Android uygulamalarının backend ile konuşmasını sağlayan arayüz. |
| **Endpoint** | API içindeki belirli bir işlem adresi; örneğin görev ayrıntısını getirme. |
| **Database / Veritabanı** | Uygulamanın kalıcı bilgilerini sakladığı yer. |
| **Token** | Kullanıcının giriş yaptığını kanıtlamak için kullanılan dijital anahtar. |
| **Refresh token** | Oturum süresi dolduğunda yeni oturum anahtarı almak için kullanılan anahtar. |
| **CI** | Kod GitHub'a gönderildiğinde test ve derleme kontrollerinin otomatik çalışması. |
| **Build** | Kaynak koddan çalıştırılabilir uygulama veya paket oluşturma işlemi. |
| **E2E test** | Bir özelliği baştan sona, gerçek kullanıcı akışına benzer biçimde test etmek. |
| **Worker** | Ana uygulamadan ayrı olarak arka planda iş yapan süreç. |
| **Queue / Kuyruk** | Daha sonra işlenmek üzere bekleyen işlerin listesi. |
| **Migration** | Veritabanı yapısında yapılan değişiklikleri mevcut veriye güvenli biçimde uygulama. |
| **Idempotency** | Aynı istek tekrar gönderilse bile işlemin ikinci kez uygulanmamasını sağlayan yaklaşım. |
| **409 Conflict** | İstenen değişikliğin sunucudaki daha yeni veriyle çakıştığını belirten yanıt. |
| **ML** | Makine öğrenmesi; örnek verilerden örüntü öğrenerek tahmin üretme yaklaşımı. |
| **Calibration / Kalibrasyon** | Modelin verdiği yüzde tahminlerinin gerçek gerçekleşme oranlarıyla ne kadar uyumlu olduğunu kontrol etme. |

---

## 10. Bu belgeyi nasıl kullanacağız?

Bu dosya ürünün genel resmini ve ilerleme durumunu kolay takip etmek içindir. Ayrıntılı gereksinimleri, kabul senaryolarını, teknik bulguları ve her gereksinimin hangi testle doğrulanacağını görmek için [ayrıntılı ürün gereksinimleri belgesine](./product_workflows_requirements.md) bakın.


Bu belgeyi teknik terimlerle dolu bir yapılacaklar listesi olarak değil, ürünün ortak çalışma notu olarak kullanacağız.

Bir özelliği ele alırken:
1. Önce kullanıcının ne yapmak istediğini sade bir dille anlatacağız.
2. Bugün uygulamada bunun hangi kısmının bulunduğunu kontrol edeceğiz.
3. Eksik veya belirsiz davranışları açıkça yazacağız.
4. Gerekirse teknik çözümü ayrı bir bölümde açıklayacağız.
5. Değişikliği yaptıktan sonra test ve CI sonucunu kontrol edeceğiz.
6. Ancak kanıt varsa ilgili işi tamamlandı olarak işaretleyeceğiz.

### Durumları nasıl okuyacağız?

- **Mevcut:** Kodda ilgili parça bulunuyor.
- **Kısmen mevcut:** Bir bölümü çalışıyor, ancak tamamlanması gereken adımlar var.
- **Test edilmeli:** Kod var; gerçek kullanım veya hata senaryosu henüz yeterince doğrulanmadı.
- **Eksik:** Henüz yapılmadı.
- **Karar bekliyor:** Önce ürünün nasıl davranacağına karar vermeliyiz.

Bir CI testinin geçmesi, o özelliğin bütün kullanıcı senaryolarında sorunsuz olduğunu tek başına kanıtlamaz.

---

## 11. Bir sonraki çalışma

İlk olarak Android CI'daki Gradle eklenti çözümleme sorununu inceleyeceğiz. Ardından oturum yönetimi ve çevrimdışı senkronizasyon senaryolarını tamamlayacağız.

Bunları yaparken yalnızca mevcut hatayı kapatmaya odaklanmayacağız; TaskFlow'un baştan sona tutarlı bir ürün olarak çalışmasını hedefleyeceğiz.
