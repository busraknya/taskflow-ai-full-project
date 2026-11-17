# TaskFlow AI — Ürün İş Akışları ve Gereksinim Analizi

> **Belge türü:** Ürün keşfi, iş akışı ve gereksinim analizi  
> **Durum:** İlk taslak — kaynak kodla çapraz doğrulama devam ediyor  
> **Tarih:** 16 Kasım 2026  
> **Dal:** fix/go-live-blockers  
> **İlişkili belge:** [Yayına çıkış ve teknik denetim](./go_live.md)

## 1. Amaç ve kullanım

Bu belge TaskFlow AI'ın yalnızca mevcut ekranlarını veya servislerini listelemek için değil, ürünün baştan sona hangi kullanıcı ihtiyacını hangi iş akışıyla karşıladığını anlamak için hazırlanmıştır.

Amaçlarımız:
1. Kullanıcı rollerini, hedeflerini ve yetki sınırlarını tanımlamak.
2. Ana iş akışlarını normal, alternatif ve hata senaryolarıyla açıklamak.
3. Web, Android, backend, veritabanı, kuyruklar ve ML arasındaki sorumlulukları görünür kılmak.
4. Test edilebilir işlevsel ve işlevsel olmayan gereksinimler çıkarmak.
5. Kodda bulunan, kısmi, eksik ve henüz doğrulanmamış davranışları ayırmak.
6. Analizden test senaryoları ve geliştirme işleri üretmek.

**Bu belge tamamlanma beyanı değildir.** Kodda endpoint veya ekran bulunması, akışın uçtan uca doğru çalıştığını kanıtlamaz.

### Durum etiketleri
- **Kodda var:** İlgili yapı kaynak kodda gözlemlendi; E2E doğrulaması anlamına gelmez.
- **Kısmi:** Akışın bir bölümü var; önemli adımlar veya hata senaryoları eksik.
- **Doğrulanmadı:** Kod işareti var; gerçek çalışma kanıtı henüz yok.
- **Eksik / karar gerekli:** Ürün davranışı tanımlanmalı veya uygulanmalı.
- **Kabul edildi:** Ürün kararı netleşti ve gereksinim olarak sabitlendi.

## 2. Ürün tanımı ve sınırlar

TaskFlow AI; küçük ve orta ölçekli ekiplerin workspace'ler içinde projelerini ve görevlerini yönetmesini, ekip iş yükünü takip etmesini ve görevlerin zamanında tamamlanamama olasılığına ilişkin makine öğrenmesi destekli tahmin almasını hedefleyen çok kiracılı bir SaaS ürünüdür.

### Temel ürün değeri
- Ekip çalışmasını workspace ve proje yapısı altında düzenlemek.
- Görev sahipliği, öncelik, durum ve teslim tarihlerini yönetmek.
- Web ve Android istemcilerinden aynı kanonik verilere erişmek.
- Ekip iş yükü ve görev bağlamından gecikme olasılığı tahmini üretmek.
- Tahminin olasılığını, güncelliğini ve dayanaklarını anlaşılır biçimde sunmak.
- Android'de bağlantı kesintilerinde yerel işlem kuyruğu tutup güvenli senkronizasyon yapmak.

Abonelik/faturalandırma, üçüncü taraf takvim entegrasyonları, dosya depolama, Gantt, zaman takibi, kurumsal SSO ve gelişmiş raporlama mevcut kapsam varsayımı değildir. Ayrı ürün kararı gerektirir.

## 3. Aktörler ve yetki modeli

| Aktör | Hedef | Beklenen sınır |
|---|---|---|
| Ziyaretçi | Ürünü tanımak, kayıt/giriş | Workspace verisine erişemez |
| Kayıtlı kullanıcı | Hesap açmak, oturum açmak | Üyesi olmadığı workspace'e erişemez |
| OWNER | Workspace sahipliği ve üyelik yönetimi | Sahiplik devri ayrı ve güvenli akış |
| ADMIN | Workspace operasyonlarını yönetmek | OWNER yetkilerini devralamaz |
| MEMBER | Proje ve görev çalışmalarını yürütmek | Ürün politikasınca izin verilen yazma işlemleri |
| VIEWER | İlerlemeyi izlemek | Salt okunur |
| Sistem/Worker | Arka plan işleri ve senkronizasyon | Kapsamı sınırlı, doğrulanmış işlemler |

### Yetkilendirme gereksinimleri
- **AUTHZ-01:** Her workspace isteğinde aktif üyelik ve workspace kapsamı backend'de doğrulanmalı.
- **AUTHZ-02:** İstemciden gelen userId/role değerine güvenilmemeli; kimlik token ve DB üyeliğinden alınmalı.
- **AUTHZ-03:** VIEWER yazma işlemi yapamamalı.
- **AUTHZ-04:** ADMIN OWNER atayamamalı veya OWNER'a özel işlemleri yapamamalı.
- **AUTHZ-05:** Son OWNER'ın çıkarılması/rolünün düşürülmesi engellenmeli.
- **AUTHZ-06:** Pasife alınan/çıkarılan üye sonraki isteklerde erişimini kaybetmeli.
- **AUTHZ-07:** Başka workspace'e ait kaynaklar ID tahminiyle okunamamalı/değiştirilememeli.

**Açık karar:** MEMBER rolünün proje oluşturma, üye davet etme, yorum silme ve görev silme izinleri net bir RBAC matrisiyle belirlenmeli.

## 4. Ana kullanıcı yolculuğu

1. Kullanıcı kayıt olur ve giriş yapar.
2. Workspace oluşturur veya davet edildiği workspace'e katılır.
3. Workspace içinde proje oluşturur/seçer.
4. Görev ekler; başlık, açıklama, öncelik, sorumlu ve teslim tarihi belirler.
5. Ekip üyeleri görevi görüntüler ve günceller.
6. Sistem görev bağlamından gecikme olasılığını hesaplar ve saklar.
7. Web ve Android tahmini, tahmin zamanını ve açıklayıcı faktörleri gösterir.
8. Görev ve risk değişiklikleri istemcilerde tutarlı görünür.
9. Atama ve önemli olaylarda ilgili kullanıcılara bildirim gönderilir.
10. Görev tamamlandığında aktif risk görünümü kapanır; geçmiş tahminler ölçüm için korunabilir.

Bu yolculuğun tamamı henüz E2E kanıtıyla doğrulanmış değildir.

## 5. İş akışları

### WF-01 — Kayıt, giriş ve oturum yönetimi

**Aktör:** Ziyaretçi / kayıtlı kullanıcı.  
**Ana akış:** Kayıt formu → alan doğrulama → benzersiz e-posta kontrolü → parola hashleme → kullanıcı kaydı → login → access/refresh token → güvenli istemci saklama → workspace seçimi.

**Alternatif/hata senaryoları:** E-posta zaten kayıtlı; geçersiz form; yanlış parola; rate limit; access token süresi dolmuş; refresh token geçersiz/tekrar kullanılmış/revoke edilmiş; ağ yok; logout.

**Gereksinimler**
- **AUTH-01:** Parolalar güçlü password hashing ile saklanmalı.
- **AUTH-02:** Access token kısa ömürlü; refresh token rotasyonlu ve revoke edilebilir olmalı.
- **AUTH-03:** Aynı refresh token'ın eşzamanlı iki kullanımı atomik biçimde engellenmeli.
- **AUTH-04:** Parola değişiminde aktif refresh oturumları revoke edilmeli.
- **AUTH-05:** Login/register/refresh rate limit ve güvenli hata mesajlarıyla korunmalı.
- **AUTH-06:** Web ve Android logout aynı güvenlik sonucunu üretmeli.
- **AUTH-07:** Token/parola loglara yazılmamalı.

**Kod gözlemi:** Backend register/login/refresh/logout mevcut. Refresh rotasyonu kodda var; yarış koşulu ve hata ayrıştırması ayrıca test/düzeltme gerektiriyor. Android token saklama ve hesap izolasyonu iyileştirmeleri branch'te mevcut. Web-mobil oturum eşitliği doğrulanmalı.

### WF-02 — Workspace oluşturma ve seçme

**Ana akış:** Kullanıcı aktif üyeliklerini listeler → workspace seçer veya ad/slug ile yenisini oluşturur → backend workspace ve OWNER üyeliğini transaction içinde oluşturur → istemci workspace bağlamına geçer.

**Alternatifler:** Hiç workspace yok; slug çakışması; transaction hatası; üyelik pasif; başka workspace ID'siyle erişim denemesi.

**Gereksinimler**
- **WS-01:** Workspace ve ilk OWNER üyeliği atomik oluşturulmalı.
- **WS-02:** Kullanıcı yalnız aktif üyesi olduğu workspace'leri görebilmeli.
- **WS-03:** Seçilen workspace sonraki API çağrılarında doğru kapsamı belirlemeli.
- **WS-04:** Workspace'i olmayan kullanıcı için onboarding/empty state olmalı.
- **WS-05:** Slug benzersizliği DB constraint ile garanti edilmeli.

### WF-03 — Üye daveti, kabulü, rol değişimi ve çıkarılması

**Hedeflenen akış:** OWNER/yetkili ADMIN e-posta ve rol girer → backend yetkiyi ve hedef rolü doğrular → süreli davet oluşturulur → davet gönderilir → hedef kullanıcı tek kullanımlı daveti kabul eder → üyelik ACTIVE olur → OWNER rol/üyelik yönetir → audit kaydı oluşur.

**Alternatifler:** Kullanıcı bulunamadı; zaten üye; davet süresi doldu/iptal edildi; token tekrar kullanıldı; ADMIN ayrıcalık yükseltmeye çalıştı; son OWNER çıkarılmaya çalışıldı.

**Gereksinimler**
- **MEM-01:** Davet oluşturma/kabul/iptal/süre aşımı durum makinesi olmalı.
- **MEM-02:** OWNER normal davetle atanamamalı; sahiplik devri ayrı olmalı.
- **MEM-03:** ADMIN'in rol atama sınırları backend'de uygulanmalı.
- **MEM-04:** Son OWNER korunmalı.
- **MEM-05:** Üyelik ve rol değişiklikleri audit'e yazılmalı.
- **MEM-06:** Davet linkleri tahmin edilemez, tek kullanımlık ve süreli olmalı.

**Kod gözlemi:** Üye listeleme/davet/rol değiştirme/çıkarma servis kodu var. Davet kabulünün tam akışı ve e-posta job'larının çalışması doğrulanmalı; bu belge bunları tamamlanmış saymaz.

### WF-04 — Proje yaşam döngüsü

**Ana akış:** Yetkili kullanıcı proje oluşturur → proje workspace'e bağlanır → listede görünür → görevler projeye bağlanır → proje güncellenir/arşivlenir/silinir.

**Açık senaryolar:** Aynı isimli projeye izin; silinen projeye bağlı görevler; arşivli projeye görev ekleme; yetkisiz erişim.

**Gereksinimler**
- **PROJ-01:** Proje tek bir workspace'e ait olmalı.
- **PROJ-02:** Proje erişimi üyelik ve rol politikasıyla korunmalı.
- **PROJ-03:** Silme/arşivleme sırasında bağlı görevlerin davranışı tanımlanmalı.
- **PROJ-04:** Büyük listeler pagination desteklemeli.

### WF-05 — Görev oluşturma, görüntüleme ve güncelleme

**Oluşturma:** Kullanıcı başlık/açıklama/proje/öncelik/assignee/due date girer → backend proje-workspace ilişkisini ve assignee üyeliğini doğrular → task kaydedilir → audit olayı oluşturulur → atama olayı tetiklenir → ML değerlendirmesi istenir → task ve son tahmin listede görünür.

**Güncelleme:** İstemci task version gönderir → backend yetki/kapsam/assignee doğrular → version compare-and-swap atomik yapılır → version artar → audit/atama/ML yan etkileri tetiklenir. Eski version 409 döner; istemci güncel veriyi alır ve conflict'i kullanıcıya açıklar.

**Alternatifler:** Boş/aşırı uzun başlık; geçersiz tarih; workspace dışı assignee; VIEWER yazma denemesi; soft-deleted task; eşzamanlı update; ML timeout; audit/notification hatası.

**Gereksinimler**
- **TASK-01:** Task yalnız kendi workspace'ine ait proje altında oluşturulmalı.
- **TASK-02:** Assignee aktif workspace üyesi olmalı.
- **TASK-03:** Durum/öncelik/tarih backend'de doğrulanmalı.
- **TASK-04:** Version kontrolü atomik olmalı; stale update ezilmemeli.
- **TASK-05:** Task ve audit tutarlılığı stratejisi tanımlanmalı.
- **TASK-06:** Listeleme pagination/filtre/sıralama desteklemeli.
- **TASK-07:** Tek task için verimli detay endpoint'i olmalı.
- **TASK-08:** Silme/geri alma/arşivleme davranışı belirlenmeli.
- **TASK-09:** Web ve Android aynı alan, enum, tarih ve version sözleşmesini kullanmalı.

**Kod gözlemi:** Backend create/list/update ve version alanı mevcut; atomik updateMany compare-and-swap branch'te bulunuyor. Bu davranışın eşzamanlı integration testi ve istemci conflict akışı doğrulanmalı.

### WF-06 — ML gecikme olasılığı tahmini

**Ürün hedefi:** Model, açıkça tanımlanmış tahmin ufkunda görevin gecikmeli tamamlanma olasılığını üretmelidir. Ekranda görülen yüzde, HIGH sınıfına atanmış sabit puan değil, kalibre edilmiş model olasılığı olmalıdır.

**Önce tanımlanması gereken etiket:** “Gecikme” due date sonrasında DONE olmak mı, tolerans süresini aşmak mı, yoksa belirli bir ufukta tamamlanmamış olmak mı? Eğitim etiketi ile ürün tanımı aynı olmalı.

**Hedeflenen akış:** Backend task feature'larını çıkarır → sürümlü feature şeması ML servisine gider → model gecikme olasılığı üretir → backend olasılık/model sürümü/tahmin zamanı/faktörleri saklar → Web ve Android aynı tahmini gösterir → feature değişince yeniden tahmin tetiklenir → DONE görev aktif risk görünümünden çıkar, geçmiş kayıt ölçüm için kalır.

**Başlangıç feature'ları:** Teslim tarihine kalan süre, assignee aktif task sayısı, yorum sayısı, öncelik. Ek feature'lar veri kalitesi ve ürün gerekçesiyle seçilmeli; veri sızıntısı ve hassas özelliklerden kaçınılmalı.

**Alternatifler:** ML servisi kapalı/timeout; artifact yok veya uyumsuz; feature eksik/aralık dışı; eğitim verisi az/sentetik; yeni model eski tahminlerle uyumsuz; task kaydı başarılı ama tahmin başarısız; aynı task için yinelenen tahmin; modelin eğitim dağılımı dışında örnek.

**Gereksinimler**
- **ML-01:** Gecikme etiketi ve tahmin ufku ürün seviyesinde tanımlanmalı.
- **ML-02:** Model olasılık üretmeli; sınıf etiketi tek başına olasılık gibi sunulmamalı.
- **ML-03:** Olasılıklar bağımsız validation/test verisinde calibration ile değerlendirilmeli.
- **ML-04:** ROC-AUC, PR-AUC, Brier Score, calibration ve baseline karşılaştırması raporlanmalı.
- **ML-05:** Zaman bazlı train/test ayrımı ve leakage kontrolleri uygulanmalı.
- **ML-06:** Örnek sayısı, sınıf dengesi, kaynak, etiket ve sınırlılıklar model card'da açıklanmalı.
- **ML-07:** Tahmin model sürümü, feature şeması sürümü ve zaman damgası taşımalı.
- **ML-08:** ML hatası task kaydını gereksiz yere başarısız kılmamalı; PENDING/READY/STALE/UNAVAILABLE gibi durumlar tanımlanmalı.
- **ML-09:** Tahmin olasılık, açıklama ve güncellik bilgisiyle sunulmalı; garanti gibi gösterilmemeli.
- **ML-10:** Gerçek etiketler geldikçe performans ve drift izlenmeli.
- **ML-11:** Sentetik veri metrikleri gerçek dünya başarısı olarak sunulmamalı.

**Kod gözlemi:** FastAPI /predict endpoint'i sınıf tahmini yapıyor; risk_score LOW/MEDIUM/HIGH sınıfından sabit değerlerle üretiliyor. Bu gerçek gecikme olasılığı değildir. Backend risk assessment kaydı tutuyor. Feature extraction, eğitim pipeline'ı ve veri kaynağı ayrıca denetlenmeli.

**Açık ML kararları:** Gecikme tanımı; tahmin ufku; due date değişince eski tahminin saklanması; tahmin güncelliği; veri yetersizken deneysel gösterim; kullanıcıya açıklanacak faktörler.

### WF-07 — Web/Android veri tutarlılığı

**Ana akış:** İstemci backend'den kanonik veriyi alır → değişiklik gönderir → backend RBAC/version kontrolü yapar → kanonik yanıt döner → diğer istemci refresh/polling/push stratejisiyle güncellenir.

**Gereksinimler**
- **SYNC-01:** Backend tek doğruluk kaynağıdır.
- **SYNC-02:** API sözleşmesi, enum ve tarih formatları aynı olmalı.
- **SYNC-03:** Conflict kullanıcıya anlaşılır sunulmalı.
- **SYNC-04:** Diğer istemcide güncellemenin görünme stratejisi tanımlanmalı.
- **SYNC-05:** Bir kullanıcının yerel verisi başka hesaba sızmamalı.

### WF-08 — Android offline ve senkronizasyon

**Ana akış:** Uygulama yerel veriyi gösterir → offline değişiklik ownerUserId ve baseVersion ile Room kuyruğuna yazılır → UI pending gösterir → ağ gelince WorkManager gönderir → yalnızca aynı kullanıcının tokenı kullanılır → başarılı operation temizlenir → hata türüne göre retry/block/conflict uygulanır.

**Senaryolar:** Uçak modu; DNS/API erişimi yok; 401; 403; 409; 408/429/5xx; uygulama kapanması; backend uyguladı ama yanıt kayboldu; aynı operation iki kez gönderildi; logout ve farklı hesapla giriş; aynı hesapla tekrar giriş; eski/bozuk payload.

**Gereksinimler**
- **OFF-01:** Operation kalıcı kuyruğa yazılmadan UI başarı göstermemeli.
- **OFF-02:** Operation ownerUserId, operationId, entityId, payload, baseVersion, createdAt ve state taşımalı.
- **OFF-03:** Worker yalnız oturumdaki kullanıcıya ait operation'ları göndermeli.
- **OFF-04:** Logout tokenı temizlemeli; eski hesap kuyruğu başka tokenla gönderilmemeli.
- **OFF-05:** Backend idempotency veya güvenli replay stratejisi sağlamalı.
- **OFF-06:** 401/403/409/429/5xx ve network hataları ayrı işlenmeli.
- **OFF-07:** 409 conflict sessizce ezilmemeli.
- **OFF-08:** Retry/backoff sınırı ve kalıcı hata görünürlüğü olmalı.
- **OFF-09:** Room migration eski kuyruğu güvenli ele almalı.
- **OFF-10:** Kullanıcı pending/synced/failed/conflict durumunu görebilmeli.

**Kod gözlemi:** Room operation queue, WorkManager ve ownerUserId hesap izolasyonu mevcut. Tüm HTTP hata durumları, crash/replay ve idempotency henüz kanıtlanmış değil.

### WF-09 — Bildirim ve arka plan işleri

**Ana akış:** İş olayı oluşur → güvenilir event/outbox ile kuyruğa aktarılır → worker işler → kanal üzerinden gönderir → başarısızsa kontrollü retry → sonuç gözlemlenir.

**Gereksinimler**
- **NOTIF-01:** DB işlemi ile event üretimi arasında kayıp event riski outbox veya eşdeğeriyle giderilmeli.
- **NOTIF-02:** BullMQ consumer/processor modüllere bağlı olmalı.
- **NOTIF-03:** Retry/backoff, failed-job inceleme, retention ve concurrency tanımlanmalı.
- **NOTIF-04:** Bildirim tercihleri ve kanallar uygulanmalı.
- **NOTIF-05:** E-posta HTML escape edilmeli; SMTP sırları korunmalı.
- **NOTIF-06:** Bildirim hatası task işlemini geri almamalı ama izlenmeli.
- **NOTIF-07:** Aynı event çift bildirim oluşturmamalı.

**Kod gözlemi:** Event emitter, queue ve processor ile ilgili kod var. Listener/processor bağlantısı ve gerçek teslimat doğrulanmalı.

### WF-10 — Audit trail

- **AUD-01:** Kim, ne zaman, hangi workspace/entity üzerinde ne yaptı tutulmalı.
- **AUD-02:** Audit kullanıcı tarafından değiştirilememeli.
- **AUD-03:** Token/parola gibi hassas veri metadata'ya girmemeli.
- **AUD-04:** Audit sorguları workspace ve role göre korunmalı.
- **AUD-05:** Kritik DB değişikliği ile audit kaydı tutarlılığı sağlanmalı.
- **AUD-06:** Pagination ve tarih aralığı filtresi desteklenmeli.

### WF-11 — Hata ve kullanıcı deneyimi durumları

Her ana ekranda loading, empty, success, validation, unauthorized, not found, network error, timeout, server error, conflict, retry ve partial-success durumları tasarlanmalı.

- **UX-01:** Stack trace veya hassas sunucu detayı kullanıcıya gösterilmemeli.
- **UX-02:** Güvenli tekrar deneme yolu bulunmalı.
- **UX-03:** Task kaydı başarılı ama ML başarısızsa kısmi başarı doğru anlatılmalı.
- **UX-04:** Web ve Android aynı iş kurallarını izlemeli.
- **UX-05:** Responsive tasarım, klavye, screen reader ve kontrast incelenmeli.

### WF-12 — Kurulum, deployment ve operasyon

**Ana akış:** Temiz makine → runtime/Docker gereksinimleri → .env.example'dan yapılandırma → Compose servisleri → DB migration → readiness → kayıt/login → ana iş akışı smoke test → backup/restore.

**Gereksinimler**
- **OPS-01:** Tekrarlanabilir temiz kurulum belgelenmeli.
- **OPS-02:** Secret repoda bulunmamalı; production secret yönetimi açıklanmalı.
- **OPS-03:** Liveness/readiness ayrılmalı ve bağımlılıklar doğru kontrol edilmeli.
- **OPS-04:** Migration, hata ve rollback yaklaşımı belgelenmeli.
- **OPS-05:** HTTPS, CORS allowlist, güvenli header ve production Android API URL'si tanımlanmalı.
- **OPS-06:** Backup/restore gerçek ortamda test edilmeli.
- **OPS-07:** Loglar redacted ve correlation ID içermeli.
- **OPS-08:** API latency, 5xx, queue backlog, ML hata oranı ve kaynak kullanımı izlenmeli.
- **OPS-09:** Release artifact, version, checksum ve kurulum talimatları hazırlanmalı.

## 6. Uçtan uca kabul senaryoları

Bu senaryolar otomasyon ve manuel test planının temelidir. CI build'i tek başına E2E kabul kriterini kapatmaz.

| ID | Senaryo | Beklenen sonuç | Öncelik |
|---|---|---|---|
| E2E-01 | Kayıt ve login | Güvenli oturum açılır | P0 |
| E2E-02 | Workspace oluşturma | Workspace + OWNER üyeliği atomik oluşur | P0 |
| E2E-03 | Üye daveti | Süreli, tek kullanımlı davet tamamlanır | P1 |
| E2E-04 | ADMIN OWNER atamaya çalışır | 403 | P0 |
| E2E-05 | VIEWER task oluşturur | 403 | P0 |
| E2E-06 | MEMBER task oluşturur | Doğru workspace/projeye kaydolur | P0 |
| E2E-07 | Workspace dışı assignee seçilir | İstek reddedilir | P0 |
| E2E-08 | İki istemci aynı task'ı günceller | Bir kazanan, diğerine 409 | P0 |
| E2E-09 | Task sonrası ML tahmini | Olasılık/model sürümü saklanır ve gösterilir | P0 |
| E2E-10 | ML servisi kapalı | Task kaydı korunur, tahmin unavailable/pending | P0 |
| E2E-11 | Android offline değişiklik | Kalıcı kuyruk ve pending UI | P0 |
| E2E-12 | Android online sync | Operation güvenli biçimde uygulanır | P0 |
| E2E-13 | Android hesap A'dan B'ye geçer | A kuyruğu B tokenıyla gönderilmez | P0 |
| E2E-14 | Sync 409 alır | Değişiklik sessizce ezilmez | P0 |
| E2E-15 | Task atanır | Doğru kullanıcıya tek bildirim | P1 |
| E2E-16 | Logout | Oturum temizlenir/revoke edilir | P0 |
| E2E-17 | Temiz Docker kurulumu | Migration ve servis health check geçer | P0 |
| E2E-18 | Backup restore | İlişkiler tutarlı geri gelir | P1 |
| E2E-19 | Web ve Android aynı task | Alanlar/version/tahmin tutarlı | P0 |
| E2E-20 | Başka workspace ID erişimi | Veri sızmadan 403/404 | P0 |

## 7. İşlevsel olmayan gereksinimler

| Alan | Beklenti |
|---|---|
| Güvenlik | Multi-tenant izolasyon, RBAC, token güvenliği, secrets, HTTPS |
| Güvenilirlik | Idempotency, kontrollü retry, transaction, hata toleransı |
| Performans | Pagination, sorgu indeksleri, timeout, queue backpressure |
| Ölçeklenebilirlik | API/worker/ML servisleri ayrı ölçeklenebilir |
| Gözlemlenebilirlik | Structured logs, metrics, tracing/correlation ID, alert |
| Kullanılabilirlik | Loading/empty/error/conflict durumları |
| Erişilebilirlik | Klavye, screen reader, kontrast, responsive UI |
| Veri bütünlüğü | Migration, optimistic concurrency, backup/restore |
| ML güvenilirliği | Calibration, leakage önleme, model versioning, drift |
| Bakım | Modüler mimari, API sözleşmesi, otomatik test, dokümantasyon |
| Teslim | Temiz kurulum, lisans, environment açıklaması, release artifact |

## 8. Sistem sorumlulukları ve veri akışı

| Bileşen | Sorumluluk | Güven sınırı |
|---|---|---|
| Next.js Web | UI, form, görselleştirme | Yetki kararı vermez |
| Android | UI, yerel cache, offline queue | Sunucu yetkisini bypass etmez |
| NestJS API | Auth, RBAC, iş kuralları | Ana iş mantığı ve yetki kaynağı |
| PostgreSQL/Prisma | Kalıcı domain verisi | Constraint ve transaction doğruluğu |
| Redis/BullMQ | Arka plan işleri | Retry ve tekrar işleme yönetilmeli |
| FastAPI ML | Feature şemasından tahmin | Yetkilendirme/ana DB sahibi değil |
| WorkManager | Android sync | Sunucu yanıtına göre operation state günceller |

```text
Web / Android
     |
     v
NestJS API ------> PostgreSQL
     |                  |
     |                  +-- Workspace / Project / Task / Audit / Risk
     |
     +------> FastAPI ML ------> Delay probability
     |
     +------> Redis / BullMQ --> Notifications / Background jobs

Android:
UI -> Room operation queue -> WorkManager -> NestJS API
```

Bu diyagram mantıksal sorumlulukları gösterir; event bağlantıları gerçek kod ve entegrasyon testiyle doğrulanmalıdır.

## 9. Gereksinim izlenebilirliği ve ilk iş listesi

| Alan | Gereksinimler | Öncelik | Doğrulama |
|---|---|---|---|
| Auth/session | AUTH-01…07 | P0 | Backend auth tests + Web/Android E2E |
| Workspace/RBAC | AUTHZ-01…07, WS-01…05 | P0 | API integration + cross-tenant tests |
| Üyelik/davet | MEM-01…06 | P1 | Invite state-machine tests |
| Proje | PROJ-01…04 | P1 | API + UI flow |
| Task | TASK-01…09 | P0 | Concurrency + validation + E2E |
| ML | ML-01…11 | P0 | Dataset audit + offline evaluation + API contract |
| İstemci tutarlılığı | SYNC-01…05 | P0 | Same-record Web/Android test |
| Android offline | OFF-01…10 | P0 | Room/Worker/network fault tests |
| Bildirim | NOTIF-01…07 | P1 | Queue integration + delivery test |
| Audit | AUD-01…06 | P1 | DB/API permission tests |
| UX | UX-01…05 | P1 | UI state/accessibility review |
| Operations | OPS-01…09 | P0 | Clean deployment + restore drill |

**Öncelik:** P0 veri kaybı, güvenlik, ana kullanıcı yolculuğu veya ML temel değerini etkiler ve yayın öncesi kapanmalıdır. P1 tamamlanmış/güvenilir deneyim için önemlidir. P2 iyileştirme/ölçek aşamasıdır.

## 10. Açık ürün kararları

1. Gecikme etiketi: due date sonrası tamamlanma mı, toleranslı gecikme mi?
2. Tahmin ufku: görev teslim tarihine göre mi, gelecek 7 gün içinde mi?
3. Tahmin ekranı: yüzde, faktörler, model güncelliği ve veri yetersizliği nasıl gösterilecek?
4. Gerçek etiketli veri birikene kadar deneysel model nasıl etiketlenecek?
5. MEMBER rolü hangi yönetim işlemlerini yapabilir?
6. Davetli kullanıcı önceden kayıtlı olmak zorunda mı; kabul/süre sonu nasıl işler?
7. Task silme, arşivleme, yeniden açma ve due date değişimi nasıl davranır?
8. Web/Android conflict çözümünde kullanıcıya hangi seçenekler sunulur?
9. İlk sürüm bildirim kanalı e-posta mı, uygulama içi mi, push mı?
10. Abonelik, entegrasyon ve gelişmiş raporlama ilk satış sürümünde var mı?

## 11. Analizden uygulamaya geçiş

Her akışta şu sıra izlenir:

1. İlgili Web, Android, backend, DB, worker ve ML kaynakları incelenir.
2. Gerçek durum kodda var/kısmi/eksik/doğrulanmadı olarak işaretlenir; dosya/endpoint referansı eklenir.
3. Belirsiz davranış ürün kararı olarak kaydedilir.
4. Gereksinim ID ve test edilebilir kabul kriteri tanımlanır.
5. Normal, alternatif, hata, güvenlik ve concurrency testleri yazılır.
6. Küçük ve odaklı değişiklik branch'te uygulanır.
7. Test sonucu, CI run ve commit SHA kaydedilir.
8. Gereksinim ancak kabul kriteri ve test kanıtı tamamlanınca DONE olur.

### Başlangıç takip tablosu

| Gereksinim | Kod durumu | Test durumu | Sonraki adım |
|---|---|---|---|
| AUTH-03 refresh rotation atomikliği | Kısmi | Doğrulanmadı | Transaction/CAS + paralel test |
| AUTHZ-03 VIEWER salt okunur | Kodda var | Doğrulanmadı | Tüm write endpoint'lerini test et |
| TASK-04 atomik version kontrolü | Kodda var | Doğrulanmadı | Paralel update integration testi |
| ML-02 gerçek olasılık çıktısı | Eksik | Doğrulanmadı | Etiket/veri/model tasarımını kararlaştır |
| OFF-03 kullanıcı bazlı kuyruk | Kodda var | Kısmi | Worker HTTP/hesap değişimi testleri |
| NOTIF-02 processor bağlantısı | Doğrulanmadı | Doğrulanmadı | Module wiring + queue smoke test |
| OPS-01 temiz kurulum | Kısmi | Doğrulanmadı | Compose up + migrate + smoke test |

## 12. Belge bakım kuralları

- Yeni özellik eklenmeden önce ilgili akış ve kabul kriteri tanımlanır.
- Ürün kararı değişirse açık kararlar ve etkilenen gereksinimler birlikte güncellenir.
- Kodda olmayan özellik “var” olarak işaretlenmez.
- Build/lint başarısı E2E kabul kriterini kapatmaz.
- ML kalitesi gerçek ve bağımsız veriyle ölçülmeden başarı iddiası yapılmaz.
- Kapanan gereksinime test kanıtı, CI run ve commit referansı eklenir.
- Bu belge ürünün **ne yapması gerektiğini**; go_live.md ise ürünün **yayına hazır olup olmadığını ve kanıtları** takip eder.

**Sonraki adım:** Akışları kaynak kod bazında derinleştirip her gereksinime dosya/endpoint/test referansı eklemek; açık ürün kararlarını netleştirmek; sonra bu gereksinimlerden öncelikli test ve geliştirme işleri çıkarmak.
