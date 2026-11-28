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

**Kod gözlemi (26 Kasım 2026):** Yukarıdaki yarış koşulu ve hata ayrıştırması bulgusu commit `675246a` ile kapatıldı; AUTH-02, AUTH-03 ve AUTH-04 kodda var ve yerel backend PostgreSQL E2E ile doğrulandı. AUTH-05 ve AUTH-06 kısmidir. Gereksinim bazında durum ve kanıt için belgenin sonundaki 26 Kasım çapraz kontrol bölümüne bakın.

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

**Uygulanan ilk sürüm akışı:** OWNER/yetkili ADMIN, TaskFlow'da kayıtlı kullanıcının e-posta adresi ve rolünü girer → backend yetkiyi ve hedef rolü doğrular → üyelik 7 gün süreli PENDING oluşturulur → BullMQ üzerinden kullanıcıya Workspaces ekranını açan e-posta kuyruğa alınır → yalnız davet edilen kullanıcı kendi hesabıyla giriş yapıp daveti kabul/ret eder → kabulde üyelik atomik olarak ACTIVE olur. OWNER/ADMIN bekleyen daveti üyelik listesinden kaldırarak iptal edebilir. Bu sürüm token-link ile yeni kullanıcı kaydı desteklemez.

**Alternatifler:** Kullanıcı kayıtlı değil; zaten üye; bekleyen davet var; davet süresi doldu/iptal edildi; davetli olmayan kullanıcı kabul etmeye çalıştı; ADMIN ayrıcalık yükseltmeye çalıştı; son OWNER çıkarılmaya çalışıldı.

**Gereksinimler**
- **MEM-01:** PENDING → ACTIVE / EXPIRED akışı atomik olmalı; reddetme ve yönetici tarafından iptal desteklenmeli.
- **MEM-02:** OWNER normal davetle atanamamalı; sahiplik devri ayrı olmalı.
- **MEM-03:** ADMIN'in rol atama sınırları backend'de uygulanmalı.
- **MEM-04:** Son OWNER korunmalı.
- **MEM-05:** Üyelik ve rol değişiklikleri audit'e yazılmalı.
- **MEM-06:** İlk sürümde davet mevcut TaskFlow hesabının userId değerine bağlanmalı; yalnız o hesap kabul edebilmeli ve davet 7 gün içinde kullanılmalı. Token-link ile kayıt akışı kapsam dışıdır.
- **MEM-07:** Davet yanıtı hesabın varlığını ve profilini ifşa etmemeli; bekleyen davetlerde ad-soyad gösterilmemeli.

**Kod gözlemi (25 Kasım 2026):** PENDING davet oluşturma, 7 günlük expiry, kullanıcının kendi Workspaces ekranından kabul/ret etmesi, atomik ACTIVE geçişi, süresi dolan davetin EXPIRED yapılması ve BullMQ e-posta kuyruğu kodda mevcut. Gerçek SMTP teslimatı ve browser E2E akışı henüz doğrulanmadı. Üyelik/davet olayları için audit kayıtları da tamamlanmalı.

**Kod gözlemi (26 Kasım 2026):** Commit `2b30009` ile davet yanıtı kayıtlı/kayıtsız adres için aynı hale getirildi, bekleyen davetlerde ad-soyad ve avatar gizlendi, yeniden davet koşullu yazma ile yapılıyor, eşzamanlı davet çakışması 409 dönüyor ve silinmiş workspace daveti kabul edilemiyor. MEM-06 ve MEM-01'in kabul, expiry ve iptal kısımları yerel backend PostgreSQL E2E ile doğrulandı; başarılı ret akışı E2E ile doğrulanmadı. MEM-07 kısmidir: bekleyen davet satırı üye listesinde yalnız kayıtlı hesaplar için oluşuyor ve yanıt süresi farkı da hesabın var olup olmadığını ele verebilir; bu nedenle kısmi hesap tespiti mümkün. Browser E2E, gerçek SMTP ve davet audit kayıtları hâlâ açık.

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

**ML mimarisi (27 Kasım 2026):** Yukarıdaki açık ML kararlarının yanıtları ve onaylı mimari, belgenin sonundaki "27 Kasım 2026 — ML mimarisi (onaylı öneri)" bölümündedir. Aşama 0 uygulandı: ürünle birlikte tahmin modeli gelmez ve risk hesaplaması asenkrondur.

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

**Kod gözlemi (26 Kasım 2026):** NOTIF-05 için e-posta HTML'i kaçışlanıyor, davet bağlantısı yalnız mutlak `http`/`https` URL ise basılıyor ve konu satırından CR/LF temizleniyor (commit `2b30009`, unit testler). E-posta kuyruğu `attempts: 5` ve exponential backoff ile tanımlı (NOTIF-03 kodda var, doğrulanmadı). Gerçek SMTP teslimatı doğrulanmadı.

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

**Kod gözlemi (26 Kasım 2026):** OPS-02 kısmidir: build context'leri `.env` ve anahtar dosyalarını imajlara almıyor (commit `761f03a`), ancak `.env.example` içindeki `JWT_SECRET` yer tutucusu kod tarafından tespit edilmiyor. OPS-05 kısmidir: CORS allowlist, Helmet header'ları ve nonce tabanlı CSP kodda var (commit `20ecec7`); repoda HTTPS/reverse proxy yapılandırması yok. Deployment gereksinimleri README.md "Production deployment notes" bölümünde tutulur.

## 6. Uçtan uca kabul senaryoları

Bu senaryolar otomasyon ve manuel test planının temelidir. CI build'i tek başına E2E kabul kriterini kapatmaz.

| ID | Senaryo | Beklenen sonuç | Öncelik |
|---|---|---|---|
| E2E-01 | Kayıt ve login | Güvenli oturum açılır | P0 |
| E2E-02 | Workspace oluşturma | Workspace + OWNER üyeliği atomik oluşur | P0 |
| E2E-03 | Üye daveti | Kayıtlı kullanıcıya PENDING davet, kabul/ret, 7 günlük expiry ve iptal gerçek backend ile E2E doğrulanır | P1 |
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

**Kanıt notu (26 Kasım 2026, yerel koşu, tek kullanımlık PostgreSQL 16 + Redis 7):** Aşağıdakiler yalnızca **backend API seviyesinde** PostgreSQL E2E kanıtıdır; tarayıcı (Web UI) ve Android istemci E2E doğrulaması değildir ve CI sonucu bu ortamda doğrulanamamıştır.
- E2E-01: web ve mobil login, token ayrımı `test/auth-session.e2e-spec.ts` ile doğrulandı. Kayıt adımları `test/taskflow.e2e-spec.ts` içinde yer alıyor; ancak bu test bütün olarak (E2E-20 assertion'ı nedeniyle) başarısız olduğundan kayıt kısmı E2E ile bağımsız olarak doğrulanmış sayılmamalı.
- E2E-03: davet, başarılı kabul, 7 günlük expiry, iptal, tek kullanımlık kabul, eşzamanlı kabul ve davetin alıcıya bağlı olması `test/workspace-invitations.e2e-spec.ts` ile doğrulandı (10/10). Başarılı ret akışı E2E ile **doğrulanmadı**; ret yalnızca yanlış kullanıcının reddinin 404 aldığı negatif senaryoda test ediliyor (`test/workspace-invitations.e2e-spec.ts:270-273`). Gerçek SMTP ve Web UI akışı açık.
- E2E-16: web logout (eşzamanlı refresh dahil) ve mobil logout sonrası oturumun iptali `test/auth-session.e2e-spec.ts` ile doğrulandı. Android istemcide doğrulanmadı.
- E2E-20: backend üye olmayan kullanıcıya 404 döndürüyor ve veri sızdırmıyor (`test/workspace-invitations.e2e-spec.ts`). `test/taskflow.e2e-spec.ts` aynı durumda 403 beklediği için başarısız; beklenen kod için karar gerekli (bkz. §10).
- Web UI ve Android için hiçbir E2E senaryosu bu turda doğrulanmadı.

**Kanıt güncellemesi (27 Kasım 2026):** 14. karar (404) sonrasında `test/taskflow.e2e-spec.ts` içindeki iki eski 403 beklentisi (`GET /workspaces/:workspaceId/projects` ve `PATCH /workspaces/:workspaceId/tasks/:id`) `01005bc` ile 404 olarak düzeltildi. Yerel PostgreSQL 16 + Redis 7 koşusunda bu test 2/2, bütün backend E2E suite'i 5/5 suite ve 32/32 test geçti; GitHub Actions'ta gerekli beş job `01005bc`, `eb7f162` ve `0802f3d` üzerinde başarılı (ayrıntı: `go_live.md`, 27 Kasım bölümü). Böylece E2E-20 ve E2E-01'in kayıt adımları **backend API seviyesinde** doğrulandı. Web UI ve Android istemci E2E doğrulaması hâlâ yok.

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
| Üyelik/davet | MEM-01…07 | P1 | Invite state-machine tests |
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
6. İlk sürüm kararı: davetli kullanıcı önceden kayıtlı olmalı; davet 7 gün PENDING kalır, yalnız ilgili hesap kabul/ret edebilir. Token-link ile yeni kayıt sonraki sürüme bırakıldı.
7. Task silme, arşivleme, yeniden açma ve due date değişimi nasıl davranır?
8. Web/Android conflict çözümünde kullanıcıya hangi seçenekler sunulur?
9. İlk sürüm bildirim kanalı e-posta mı, uygulama içi mi, push mı?
10. Abonelik, entegrasyon ve gelişmiş raporlama ilk satış sürümünde var mı?
11. Hesap başına login limiti nasıl olmalı? Mevcut 20 deneme / 15 dk politikası başkası tarafından tüketilebildiği için hedefli hesap engellemeye açık; (IP, hesap) bazlı limit ve yalnız başarısız denemeleri sayan genel üst sınır alternatifi değerlendirilmeli.
12. Redis erişilemezken logout ve parola değişimi reddedilmeli mi (mevcut: `503`), yoksa izin verilmeli mi? Redis için yüksek erişilebilirlik gerekiyor mu?
13. Hedef deployment topolojisi nedir (doğrudan, tek reverse proxy, CDN + load balancer)? `TRUST_PROXY_HOPS` değeri ve Web/API'nin aynı site altında yayınlanması buna göre sabitlenmeli.
14. Başka workspace'e erişimde 403 mü 404 mü dönülmeli (E2E-20)? **Karar verildi (26 Kasım 2026): 404 Not Found.** Üye olmayan kullanıcıdan workspace'in varlığı gizlenir. Karar öncesinde backend zaten 404 döndürüyordu, `test/taskflow.e2e-spec.ts` ise 403 bekliyordu. `WorkspaceMemberGuard` (`backend/src/workspaces/guards/workspace-member.guard.ts`) değiştirilmedi; test `01005bc` ile bu karara uyarlandı.
15. Refresh token ailelerine mutlak bir oturum ömrü konulacak mı? Ömür yoksa düzenli kullanılan bir oturum logout veya parola değişimine kadar geçerli kalır (go_live M-3); ömür konulursa kullanıcılar, özellikle Android'de, periyodik olarak yeniden giriş yapar.
16. 30 saniyelik refresh reuse grace penceresi kısaltılacak mı? Kısa pencere çalınmış token tespitini güçlendirir (go_live M-4, R-2), ancak çok sekmeli veya yavaş ağdaki meşru eşzamanlı refresh isteklerinin `REFRESH_TOKEN_ROTATED` alıp oturumun düşmesine yol açabilir.

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


## 13. İlk kaynak kod çapraz kontrolü — 17 Kasım 2026

Bu bölüm, ilk akış taslağının mevcut branch'teki gerçek kaynak kodla karşılaştırılmasından çıkan bulgulardır. Bunlar otomatik testle doğrulanmış sonuçlar değildir; ilgili dosyalar incelenmiştir.

### 13.1 Üyelik daveti — 17 Kasım tarihli bulgu (25 Kasım'da güncellendi)

İncelenen kaynak: `backend/src/workspaces/workspaces.service.ts`, `backend/src/workspaces/workspaces.controller.ts`.

- Davet edilen kullanıcının sistemde önceden kayıtlı olması gerekiyor.
- 17 Kasım incelemesinde üyelik doğrudan `ACTIVE` oluşturuluyordu; bu bulgu 25 Kasım düzeltmesinden önceki kodu anlatır.
- 25 Kasım itibarıyla davet `PENDING` oluşturuluyor, 7 günlük expiry saklanıyor, kullanıcı kendi hesabından kabul/ret edebiliyor ve davet e-postası BullMQ kuyruğuna alınıyor.
- Token-link kullanılmıyor; davet mevcut kullanıcı hesabının userId değerine bağlı. Gerçek SMTP ve browser E2E doğrulaması hâlâ açık.

**Gereksinim etkisi:** MEM-01'in temel state machine'i kodda mevcut. MEM-06 ilk sürüm için hesap-bağlı davet olarak karşılanıyor; token-link ve yeni kullanıcı kaydı sonraki sürüm kapsamıdır.

### 13.2 Workspace rolü ve Web arayüzü aynı davranışı sunmuyor

İncelenen kaynak: `frontend/src/components/layout/Navbar.tsx`, `frontend/src/app/w/[workspaceSlug]/page.tsx`, `backend/src/tasks/tasks.controller.ts`, `backend/src/projects/projects.service.ts`.

- Backend task create/update için VIEWER rolünü reddediyor.
- Navbar'daki **New Task** butonu VIEWER için gizlenmiyor; kullanıcı butona basıp backend'den 403 alabilir.
- Yeni proje butonu OWNER/ADMIN için gösteriliyor; backend de proje oluşturmayı OWNER/ADMIN ile sınırlandırıyor.
- Bu yüzden task yazma yetkisi UI ile backend arasında tutarlı değil.

**Gereksinim etkisi:** AUTHZ-03 backend tarafında uygulanmış görünse de UX/role-based UI kabul kriteri tamamlanmamış. UI kontrolü güvenlik sınırı değildir; backend kontrolü korunmalı.

### 13.3 Görev detay ekranı ve yorum akışı

İncelenen kaynak: `frontend/src/components/kanban/TaskDetailModal.tsx`, `backend/src/comments/comments.service.ts`, `backend/src/comments/comments.controller.ts`.

- Task detail modal tek görev endpoint'i çağırmak yerine workspace task listesini indirip taskId ile istemci tarafında arıyor.
- Yorum listeleme ve oluşturma task'ın workspace'e ait olduğunu kontrol ediyor.
- Yorum silme yalnız yorum yazarı veya OWNER/ADMIN için izinli; soft delete uygulanıyor.
- UI silme butonunu her yorum için herkese gösteriyor; backend reddetse de kullanıcı gereksiz hata deneyimi yaşayabilir.
- Yorum oluşturma için ayrıca VIEWER yazma politikası görünmüyor. WorkspaceMemberGuard tek başına VIEWER'ın yorum yazmasını engelliyor mu, guard/role policy üzerinden ayrıca doğrulanmalı.

**Gereksinim etkisi:** TASK-07 tek görev detay endpoint'i ihtiyacını destekliyor. Yorum izin matrisi AUTHZ-03 kapsamına dahil edilmeli.

### 13.4 ML tahmininin kullanıcıya sunumu kritik bir tutarsızlık taşıyor

İncelenen kaynak: `ml-service/train.py`, `ml-service/MODEL_CARD.md`, `ml-service/main.py`, `backend/src/ai/ai.service.ts`, `frontend/src/components/kanban/TaskDetailModal.tsx`.

- Model yalnızca altı elle yazılmış sentetik örnekle eğitilmiş.
- Model card bunun deneysel olduğunu, gerçek dünya doğrulaması ve kalibrasyon bulunmadığını açıkça belirtiyor.
- API sınıf tahmininden sonra 0.20/0.50/0.85 sabit değerleri risk_score olarak döndürüyor.
- Task detail UI bu değeri 100 ile çarpıp yüzde işaretiyle gösteriyor (ör. HIGH için 85%). Bu gerçek gecikme olasılığı değildir ve kullanıcıyı yanıltabilir.

**P0 ürün/güven gereksinimi:** Gerçek olasılık modeli ve kalibrasyon doğrulanana kadar arayüz bu değeri yüzde/olasılık olarak sunmamalı. Deneysel risk sınıfı gösterilecekse bunun deneysel sınıflandırma olduğu açıkça belirtilmeli ve yüzde işareti kaldırılmalı.

### 13.5 ML feature extraction tenant sınırı ve veri kalitesi

İncelenen kaynak: `backend/src/ai/risk-feature.service.ts`.

- Assignee aktif görev sayısı sorgusunda `workspaceId` filtresi yok; kişinin diğer workspace'lerdeki görevleri de sayılabilir. Bu hem tahmini bozar hem workspace'ler arası aktivite bilgisini feature'a taşır.
- Yorumlar `include: { comments: true }` ile tümü çekiliyor; silinmiş yorumlar filtrelenmiyor ve yalnız count için tüm satırlar belleğe alınıyor.
- Assignee aktif görev sayısı ve comment count için dar kapsamlı count sorguları daha uygun.
- Due date yoksa 7 gün varsayılıyor; bu değer ürün/ML kararı olarak gerekçelendirilmeli, sessiz varsayım olmamalı.

**Gereksinim etkisi:** ML feature'ları workspace kapsamlı ve tutarlı tanımlanmalı; deletedAt filtreleri ve feature contract testleri eklenmeli. Assignee workload özelliğinin tanımı (yalnız bu workspace mi, tüm workspace'ler mi?) açık karara bağlanmalı. Multi-tenant ürün güvenliği nedeniyle varsayılan öneri workspace kapsamıdır.

### 13.6 ML isteği ana task isteğinin içinde bekleniyor

İncelenen kaynak: `backend/src/tasks/tasks.service.ts`, `backend/src/ai/ai.service.ts`.

- Task create/update akışı `assessAndSaveRisk` çağrısını await ediyor.
- AI servisinde HTTP timeout açıkça tanımlı görünmüyor.
- ML erişilemezse servis UNAVAILABLE döndürüyor; task kaydı başarısız olmuyor ancak tahmin kaydı yine de oluşturuluyor.
- Bu davranış ürün açısından kısmi başarıya yakın; fakat API yanıt süresi ML servisine bağlı kalıyor.

**Gereksinim etkisi:** ML çağrısı için timeout, retry/idempotency, PENDING/UNAVAILABLE durumu ve asenkron işleme kararı netleştirilmeli. Task CRUD kullanılabilirliği tahmin servisi sağlığına bağlanmamalı.

### 13.7 Atama bildirimi tekrarlanabilir ve HTML güvenliği eksik

İncelenen kaynak: `backend/src/tasks/tasks.service.ts`, `backend/src/tasks/events/task-assigned.listener.ts`, `backend/src/notifications/email.processor.ts`, `backend/src/notifications/notifications.module.ts`.

- Listener TasksModule provider'ı olarak kayıtlı; email queue TasksModule ve NotificationsModule içinde register ediliyor; processor NotificationsModule provider'ı olarak mevcut. İlk incelemede modül bağlantısı bulunuyor.
- Task update sırasında assigneeId mevcut olduğu sürece `task.assigned` olayı emit ediliyor; assignee değişmemiş olsa da aynı kullanıcıya tekrar e-posta kuyruğa girebilir.
- Listener hataları yakalayıp logluyor; event/outbox garantisi bulunmuyor ve hatalar üst akışa taşınmıyor.
- EmailProcessor HTML gövdesine kullanıcı adı ve task title değerlerini escape etmeden yerleştiriyor.
- Job kimliği/idempotency, retry sınırları ve başarısız işlerin operasyonel yönetimi ayrıca tanımlanmalı.

**Gereksinim etkisi:** NOTIF-01, NOTIF-03, NOTIF-05 ve NOTIF-07 P1/P0 kapsamına alınmalı. Bildirim yalnızca yeni atama veya gerçek assignee değişiminde tetiklenmeli.

### 13.8 Proje silme ve görev oluşturma ilişkisi

İncelenen kaynak: `backend/src/projects/projects.service.ts`, `backend/src/tasks/tasks.service.ts`, `backend/prisma/schema.prisma`.

- Proje silme fiziksel silme yerine `deletedAt` ile soft delete yapıyor.
- Task create içindeki proje sorgusu workspaceId ve id kontrol ediyor ancak deletedAt null şartı görünmüyor.
- Bu nedenle soft-deleted projeye yeni task oluşturulması mümkün olabilir.
- Task relation'ında project silinmesi için Restrict davranışı bulunuyor; mevcut soft-delete davranışıyla ürün politikası netleştirilmeli.

**Gereksinim etkisi:** TASK-01/PROJ-03 için task create sırasında projenin aktif olması zorunlu olmalı; arşivli/silinmiş proje davranışı ayrı tanımlanmalı.

### 13.9 Mevcut test engeli ve düzeltme

Önceki CI run `43923614882` içinde backend TypeScript kontrolü başarılıydı; Jest'te yalnız TasksService test dosyası, `@nestjs/axios` ESM modülünün CommonJS Jest ortamında yüklenmesi nedeniyle başlamıyordu. Test, gerçek HTTP transport'u kullanmadığı için AI servis modülü testte mock'landı ve AI tipi type-only import'a çevrildi.

- Düzeltme commit'i: `67fd27809462440edc91b0d8b0b74ee97a9263e7`
- Yeni CI run: [44031495018](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/44031495018)
- Bu run incelendiğinde ML testi başarılıydı; backend, Android, frontend ve Compose işleri hâlâ çalışıyordu. Sonuç henüz yeşil kabul edilmemeli.

### Güncellenmiş ilk öncelik sırası

1. ML yüzde gösterimini güvenli hale getir; feature extraction workspace sınırını düzelt.
2. Task create sırasında soft-deleted proje kontrolünü ekle.
3. Task update'te yalnız gerçek assignee değişiminde atama bildirimi üret; e-posta HTML escape et.
4. VIEWER için Web task aksiyonunu gizle; yorum yazma rol politikasını netleştir.
5. TaskService unit test Jest izolasyonu düzeltmesini CI'da doğrula.
6. Davet kabul akışının ürün kapsamını kararlaştır; ardından durum makinesi tasarla.
7. ML task CRUD senkron bağımlılığını timeout/asenkron işleme ile azalt.
8. E2E testleri gerçek DB/Redis/ML/Frontend senaryolarıyla tamamla.


### 13.10 Task detay ve yorum yetkileri — branch çalışması, 17 Kasım 2026

İncelenen kaynaklar: `backend/src/tasks/tasks.controller.ts`, `backend/src/tasks/tasks.service.ts`, `frontend/src/components/kanban/TaskDetailModal.tsx`, `frontend/src/components/kanban/KanbanColumn.tsx`.

- Önceki Web task detail modal'ı tüm workspace task listesini çekip seçili task'ı istemcide arıyordu. Bu hem gereksiz veri transferi hem de liste büyüdükçe ölçeklenme sorunu.
- `GET /workspaces/:workspaceId/tasks/:taskId` endpoint'i eklendi. Sorgu taskId + workspaceId + deletedAt:null koşullarını birlikte kullanıyor; assignee ve en güncel risk assessment döndürüyor.
- TaskService testlerine workspace kapsamı ve bulunamayan/silinmiş task davranışı için testler eklendi.
- VIEWER için Kanban durum ilerletme butonları gizlendi. Backend VIEWER yazma kontrolü korunuyor.
- Task detail yorum formu VIEWER için gizlendi. Yorum silme aksiyonu yalnız yorum sahibi veya OWNER/ADMIN için gösteriliyor; backend izin kontrolü nihai güvenlik sınırı olmaya devam ediyor.
- Modal, task değiştirildiğinde önceki task'ın yorumlarını temizliyor ve bulunamayan/erişilemeyen task için ayrı durum gösteriyor.

**Doğrulama notu:** Bu değişiklikler `fix/go-live-blockers` branch'indedir; CI sonucu bekleniyor. UI'daki gizleme test edilmiş backend yetkisinin yerine geçmez. Controller integration testleri ve gerçek Web E2E senaryosu ayrıca gereklidir.


### 13.11 ML sayısal skorunun kaldırılması — 17 Kasım 2026 branch güncellemesi

Önceki API, LOW/MEDIUM/HIGH sınıfından 0.20/0.50/0.85 sabit değerleri türetip risk_score alanında döndürüyordu. Bu değerler olasılık veya model güveni değildi. fix/go-live-blockers branch'inde bu sahte sayısal skor kaldırıldı: risk_score artık null dönüyor ve backend tipi nullable olarak tanımlandı. ML API testi de bu davranışı doğruluyor. Model yalnızca deneysel sınıflandırma üretmeye devam ediyor; gerçek gecikme olasılığı için etiketli veri, değerlendirme ve calibration çalışması hâlâ gerekli. CI henüz doğrulanmadı.


### 13.12 18 Kasım 2026 — Önceki tespitlerin güncel kodla yeniden değerlendirilmesi

Aşağıdaki notlar 13.3–13.8 bölümlerindeki tarihsel bulguları güncel branch koduna göre tamamlar; eski bulguların tarihsel kaydı silinmemiştir.

- **TASK detail:** `GET /workspaces/:workspaceId/tasks/:taskId` eklendi; sorgu workspace ve `deletedAt: null` ile kapsamlanıyor. Web modal artık workspace görev listesini indirerek task aramıyor. Modal yükleme durumunu seçili task kimliği üzerinden türetiyor.
- **Yorum izinleri:** VIEWER yorum oluşturamaz; UI formu VIEWER için gizlenir. Yorum silme UI yalnız yazar veya OWNER/ADMIN için gösterilir. Backend service/controller kontrolleri gerçek güvenlik sınırıdır; controller testi ESM bağımlılıklarını mock'layarak izole edildi.
- **ML:** `risk_score` sabit 0.20/0.50/0.85 değerlerinden türetilmiyor; `null`. Bu nedenle UI yüzde/olasılık göstermiyor. Mevcut altı sentetik eğitim örneği gerçek dünyada tahmin başarısı kanıtlamaz.
- **Feature extraction:** assignee aktif görev sayısı workspace ile sınırlandırıldı; yorum sayısı yalnız silinmemiş yorumları sayan count sorgusuyla alınıyor.
- **Atama bildirimi:** task update yalnız assignee gerçekten değiştiğinde assignment event üretir. E-posta HTML alanları escape edilir; job ID task + version ile tekrarlı kuyruğa alımı azaltır. EventEmitter hâlâ transactional outbox değildir; process crash kayıp riski açık kalır.
- **Silinmiş proje:** task create yalnız aynı workspace içindeki aktif projeyi kabul eder.

### 13.13 Workspace üye daveti — gerçek ürün akışı ile mevcut davranış arasındaki fark

İncelenen kaynaklar: `backend/src/workspaces/workspaces.controller.ts`, `backend/src/workspaces/workspaces.service.ts`, `backend/src/workspaces/dto/invite-member.dto.ts`, `backend/prisma/schema.prisma`, Web members sayfası.

**25 Kasım 2026 güncel davranışı:** OWNER/ADMIN davet endpoint'ine e-posta ve rol gönderir. İlk sürüm yalnız kayıtlı hesapları kabul eder. Üyelik `PENDING` ve 7 günlük `invitationExpiresAt` ile oluşturulur; BullMQ davet e-postası kuyruğa alınır. Davetli kullanıcı `/workspaces` ekranından kendi hesabıyla kabul/ret yapar. Kabul `updateMany` koşuluyla atomiktir; süresi dolmuş davet `EXPIRED` olur. OWNER/ADMIN bekleyen üyeliği kaldırarak daveti iptal edebilir. Davet oluşturma IP tabanlı rate limit kapsamındadır.

**Ürün kapsamı kararı:** İlk sürüm daveti kayıtlı kullanıcı hesabına bağlar; token-link ile yeni kayıt ve yeniden gönderim sonraki sürüme bırakılmıştır. PENDING davet workspace erişimi vermez; kabul yalnız JWT'den gelen userId ile yapılır. E-posta bağlantısı token taşımaz, yalnız Workspaces ekranını açar. Davet/kabul/ret/iptal olayları için audit kaydı eklenmesi ve SMTP teslimatının doğrulanması açık iş olarak kalır.

**Kabul kriterleri:** (1) yalnız OWNER/ADMIN uygun roller için davet oluşturabilir; (2) OWNER rolü normal davetle verilemez; (3) ADMIN yalnız MEMBER/VIEWER davet edebilir; (4) davet 7 gün sonra expire olur; (5) kabul işlemi atomiktir ve yalnız davet edilen userId kabul edebilir; (6) expired/revoked/already-accepted davet reddedilir; (7) PENDING üyelik workspace erişimi alamaz; (8) davet/kabul/ret/iptal audit edilir — henüz açık; (9) e-posta dayanıklı BullMQ kuyruğuna alınır, gerçek SMTP teslimatı test edilmelidir.

**Öncelik:** P1. Temel hesap-bağlı davet akışı uygulanmıştır; audit ve gerçek SMTP/browser E2E kanıtı olmadan satış onayı verilmemelidir.

### 13.14 18 Kasım — doğrulama durumu

18 Kasım'daki branch düzeltmeleri (yorum controller test izolasyonu, TaskDetailModal effect/lifecycle ve WorkspaceMemberGuard request typing) için CI henüz tamamlanmış kabul edilmemelidir. Sonuçlar yalnız Actions run tamamlandığında ve ilgili job logları incelendiğinde doğrulanacaktır.


### 13.15 ML gecikme tahmini için veri ve etiket gereksinimi

Gerçek gecikme olasılığı hedefleniyorsa model yalnızca mevcut task snapshot'larından eğitilemez; tahmin anındaki feature değerleri ile sonradan gerçekleşen sonuç arasında zaman ilişkisi kurulmalıdır.

- **Etiket önerisi:** Task tamamlandığında `completedAt > dueDate` ise gecikmiş; `completedAt <= dueDate` ise zamanında. Due date bulunmayan task'lar bu ikili etiketten ayrı tutulmalı. Due date geçmiş ve hâlâ tamamlanmamış görevler için sağdan sansürleme/observation cutoff politikası ayrıca tanımlanmalı; bunları doğrudan completed-late ile aynı sınıfa koymak veri yanlılığı oluşturabilir.
- **Zaman damgası:** Mevcut `Task.updatedAt` tamamlanma zamanı değildir; açıklama, atama veya diğer güncellemelerde değişebilir. Güvenilir `completedAt` veya task status transition history gerekir.
- **Feature snapshot:** Her tahmin anında kullanılan `days_until_due`, workspace içi assignee workload, comment count, priority ve diğer feature'lar o ana ait değerleriyle saklanmalı. Sonradan oluşan yorum veya görev yükü geçmiş tahmin kaydını değiştirmemeli.
- **Veri kalitesi:** Sentetik altı örnek yalnızca pipeline testi içindir. Gerçek model için yeterli sayıda gerçek/izinli etiketli task, workspace bazlı train/test ayrımı veya zamansal holdout, class imbalance raporu, baseline karşılaştırması, ROC-AUC/PR-AUC, Brier score ve calibration curve gerekir. Ölçümler yoksa performans iddiası yapılmaz.
- **Tenant ve gizlilik:** Eğitim verisi workspace'ler arasında otomatik birleştirilmemeli. Veri kullanımı, saklama süresi, anonimleştirme/pseudonymization ve kullanıcıya açıklama politikası belirlenmeli. Metin içerikleri (yorum/görev açıklaması) varsayılan olarak modele taşınmamalı.
- **Ürün davranışı:** Yeterli veri ve kalibrasyon yoksa skor `null` kalır; deneysel sınıf etiketi olasılık gibi sunulmaz. Tahmin başarısızlığı task oluşturma/güncelleme işlemini engellemez.

**Önerilen teknik önkoşul:** Önce status transition history veya `completedAt` alanı için migration ve task lifecycle testleri; sonra immutable feature snapshot + outcome dataset export; en son model eğitimi ve calibration. Bu sıra izlenmeden `predict_proba()` eklemek tek başına gerçek olasılık sağlamaz.


## 13.16 Güncel çapraz kontrol — 18 Kasım 2026

Bu ek, `fix/go-live-blockers` dalındaki kaynak kodun yeniden okunmasıyla hazırlanmıştır. Bu bölüm ürün gereksinimlerini ana dalda tutar; kaynak kod değişikliklerinin main'e merge edildiği anlamına gelmez. CI kanıtı: branch commit `b7063ad86e7a0ccb744ed46bd1f50716abcccd6e`, Actions run [#44262570835](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/44262570835), 5/5 job başarılı.

### Android offline sync — kısmi ilerleme

Güncel kodda `TaskViewModel.queueStatusChange` pending status değişikliğini Room'a yazar, `ownerUserId` ile hesap bazında ayırır ve `SyncScheduler` unique WorkManager işi başlatır. `SyncWorker` yalnızca mevcut oturum kullanıcısının kuyruğunu işler; Authorization header ile API'ye PATCH gönderir; 2xx sonrası siler. 401 BLOCKED_AUTH, 403 FAILED, 409 CONFLICT, 408/429/5xx ve exception retry olarak ayrılır. Login sonrası aynı kullanıcıya ait BLOCKED_AUTH kayıtları yeniden kuyruğa alınır.

**Durum (25 Kasım):** OFF hesap izolasyonu ve temel HTTP işleme kodda mevcut; Worker için 2xx/401/403/409/429/5xx/network/malformed payload test matrisi ve gerçek backend entegrasyon testi hâlâ gerekli. Android refresh token EncryptedSharedPreferences içinde saklanıyor; TokenAuthenticator 401 sonrasında ayrı refresh client ile token çiftini yeniliyor. Backend mobile login/refresh/logout uçları mevcut; gerçek API ile fiziksel cihaz E2E doğrulaması açık.

### Backend auth/session — kod tabanı güçlendirildi, E2E açık

- Yeni refresh tokenlar SHA-256 fingerprint ile unique index üzerinden bulunuyor; eski bcrypt hash'li oturumlar için sınırlı legacy fallback korunuyor.
- Refresh rotation Prisma transaction içinde compare-and-swap `updateMany` kullanıyor. Aynı tokenla yarışta yalnız bir istek başarılı olabiliyor; revoked token tekrar kullanılırsa kalan aktif oturumlar iptal ediliyor ve `TOKEN_REUSE_DETECTED` dönüyor.
- Parola değiştirme parola hash'ini güncelliyor ve aktif refresh tokenları aynı Prisma transaction içinde revoke ediyor.
- Web refresh tokenı HttpOnly/SameSite cookie ile kullanıyor. Android mobile login/refresh/logout body sözleşmesini kullanıyor; refresh token EncryptedSharedPreferences içinde saklanıyor ve OkHttp TokenAuthenticator yenileme yapıyor.

**Kabul kriterleri:** Transaction/CAS, paralel refresh, token reuse, parola değişiminde revoke için unit testler mevcut. Gerçek Web/Android backend E2E, Android eşzamanlı 401 ve offline senaryoları, audit log kapsamı ve fiziksel cihaz doğrulaması hâlâ açık.

### RBAC ve üyelik

- TasksController VIEWER'ın task create/update işlemlerini; CommentsController VIEWER'ın comment create işlemini engelliyor.
- ProjectsService create/delete yalnız OWNER/ADMIN kabul ediyor.
- WorkspacesService ADMIN'in OWNER veya ADMIN davet etmesini engelliyor; son OWNER'ın rolünü düşürme/üyeliğini silme kontrolü var.
- MEMBER'ın task create/update yapabilmesi mevcut kod davranışı. Bu ürün politikası açık bir RBAC matrisiyle kesinleştirilmeli.
- 25 Kasım güncellemesi: Üye daveti PENDING + 7 günlük expiry, accept/decline endpoint'leri, Workspaces inbox ve BullMQ e-posta listener'ı ile uygulanmıştır. İlk sürüm yalnız kayıtlı hesaplara yöneliktir; audit ve gerçek SMTP/browser E2E doğrulaması açık.

### Notifications, audit ve yan etkiler

NotificationsModule AppModule'a dahil; TaskAssignedListener ve WorkspaceInvitationListener provider'ları kayıtlı; email queue ve EmailProcessor kodda bağlı. E-posta HTML alanları escape ediliyor. Queue için 5 deneme, exponential backoff, completed/failed retention ayarları mevcut. SMTP gerçek teslimat testi hâlâ yok. AuditService DB hatasını catch edip yuttuğu için domain write başarılıyken audit kaydı kaybolabilir. Transactional outbox bulunmuyor.

### Task, ML ve API davranışı

- Task version update tek koşullu `updateMany` compare-and-swap kullanıyor; unit test başarı ve yarışta 409 yolunu kapsıyor. Gerçek PostgreSQL concurrency integration testi yine gerekli.
- Task create/update ML tahminini senkron bekliyor. NestJS ML HttpModule için 3 saniye timeout ve redirect kapatma eklendi; bu sınırın gerçek Compose ortamında yük/latency testi ayrıca yapılmalı.
- ML endpoint sabit risk_score üretmiyor; `risk_score: null`. Altı sentetik örnekli GradientBoosting sınıflandırıcısı yalnız deneysel LOW/MEDIUM/HIGH etiketi üretiyor. Model card gerçek dünya doğruluğu iddiası olmadığını belirtiyor.
- Feature extraction'da due date olmayan görev için 7 gün varsayımı kullanılıyor; bu ürün/ML semantiği olarak açıkça onaylanmalı.
- Task listelerinde pagination görünmüyor. Schema'da archivedAt/deletedAt var; TasksController'da archive/delete/restore endpoint'i görünmüyor.

### Test kanıtı ve takip

CI run #44262570835 tüm beş job'ı geçmiştir (Android unit + instrumented Room queue; frontend lint/typecheck/build/audit; Docker Compose validation + image build; ML pytest + pip-audit; backend TypeScript/Jest/build/audit). Backend'in mevcut lint baseline'ı non-blocking'dir. Bu sonuçlar build/test kanıtıdır; yukarıdaki E2E, gerçek SMTP, gerçek Android refresh ve production runtime kabul kriterlerini kapatmaz.

**Sıradaki geliştirme sırası:** (1) auth/session atomikliği ve Android/Web refresh/logout sözleşmesi, (2) notification retry + audit/outbox güvenilirliği, (3) ML HTTP timeout/async scoring, (4) Android Worker fault-injection/integration testleri, (5) pagination ve task archive lifecycle.


---

# 25 Kasım 2026 — Remediation dalı güncellemesi

> Bu ek, önceki gereksinim ve denetim notlarını silmez. Aşağıdaki uygulama durumu `fix/go-live-blockers` dalının kaynak kodundan okunmuştur; PR #1 henüz `main` dalına birleştirilmemiştir. Kodun bulunması, uçtan uca test edildiği anlamına gelmez.

## Kimlik, oturum ve workspace

- Backend'de parola değişimi parola hash güncellemesi ile aktif refresh token iptalini aynı Prisma transaction içinde yapacak şekilde güncellenmiştir.
- Yeni refresh tokenlar SHA-256 fingerprint ile saklanıp unique index üzerinden bulunur; eski bcrypt formatı için geriye dönük doğrulama yolu korunur. Paralel refresh, reuse ve eski kayıt temizliği gerçek PostgreSQL E2E testiyle doğrulanmalıdır.
- Auth endpoint'leri ve workspace daveti oluşturma Redis Lua tabanlı atomik IP rate limit kullanır. Varsayılan limit genel auth uçlarında 60 saniyede 10, refresh uçlarında 30 istektir. Limit aşımı 429, Redis erişilemezliği 503 fail-closed davranışı üretir. Proxy hop ayarı ve hesap bazlı brute-force koruması ayrıca test edilmelidir.
- Workspace daveti, kayıtlı kullanıcı için PENDING üyelik, 7 günlük expiry, kabul/ret ve yönetici iptali akışına sahiptir; davet e-postası BullMQ kuyruğuna bağlanmıştır. Yeni hesap için token-link ile self-service onboarding kapsam dışıdır. Gerçek SMTP teslimatı/retry ve davet audit kayıtları henüz kabul testiyle kanıtlanmamıştır.
- Android kaynak kodunda login/refresh/logout endpoint tanımları, EncryptedSharedPreferences tabanlı token saklama ve 401 sonrası TokenAuthenticator refresh akışı vardır. Gerçek backend ile cihaz/emülatör E2E testleri hâlâ gereklidir.

## Deployment ve repo hijyeni

- Remediation dalında root `.env` kaldırılmış; `.env.example` yer tutucu değerlerle düzenlenmiş; `.gitignore` sırlar, Python cache/bytecode, Android IDE ve build artefact'larını hariç tutar. Tarihsel tüm Git objeleri için tam secret scan yapılmış değildir; gerçek bir sır kullanıldıysa rotasyon ve gerekirse history rewrite değerlendirilmelidir.
- Docker Compose PostgreSQL, Redis, ML, migration, backend ve frontend servislerini içerir. CI'daki Compose doğrulama, image build ve healthcheck adımları temiz müşteri makinesi kabul testi, TLS/reverse proxy, backup/restore veya gerçek kullanıcı akışının yerine geçmez.
- Root README ürünün hâlâ geliştirme aşamasında olduğunu ve ML modelinin sentetik küçük veriyle eğitilmiş deneysel bir model olduğunu açıkça belirtir. Doğrulanmış gecikme olasılığı iddiası yapılmamalıdır.
- Ticari lisans ve üçüncü taraf attribution envanteri henüz seçilmemiş/tamamlanmamıştır; lisans kararı olmadan Codester yeniden dağıtım paketi yayınlanamaz.

## 25 Kasım CI gözlemi

- Run [45683129340](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/45683129340), merge ref `6c26465d327eac0077ed21a223f5203da6c4cc37` üzerinde çalıştı. ML testleri ve pip-audit başarılı; frontend lint, typecheck, build ve production dependency audit başarılı.
- Android unit test job'ı Gradle'ın `org.jetbrains.kotlin.plugin.compose:2.2.10` plugin marker artifact'ını çözememesi nedeniyle build konfigürasyonu aşamasında başarısız oldu. Bu, uygulama unit test assertion hatası değildir; Gradle plugin resolution/CI erişimi kaynaklı bir build blocker olarak ele alınmalıdır. Plugin Portal'da 2.2.10 sürümünün yayımlı olduğu doğrulanmıştır; dolayısıyla önce aynı job yeniden çalıştırılarak geçici repository erişim sorunu olup olmadığı ayrıştırılmalıdır.
- Backend job'ı inceleme anında non-blocking genel lint adımındaydı; TypeScript/test/build/audit adımları henüz başlamamıştı. Docker image build devam ediyordu; healthcheck henüz başlamamıştı.
- Workflow genel backend lint adımını `continue-on-error: true` ile çalıştırır. Bu nedenle CI job'ının yeşil olması, tüm backend lint borcunun kapandığı anlamına gelmez.

**Güncel kabul kararı: NO-GO.** PR #1 draft kalmalıdır. Öncelik Android plugin resolution/build hatasını yeniden üretip ayırmak, bu run'daki backend/Docker sonuçlarını almak, sonra E2E/SMTP/operasyon/lisans kapılarını kapatmaktır.


---

# 26 Kasım 2026 — Güvenlik uygulamaları çapraz kontrolü

> Bu ek önceki bulguları silmez. Kaynak: `fix/go-live-blockers` dalındaki `675246a` (SEC-01, R-1), `761f03a` (SEC-04-A), `2b30009` (SEC-05) ve `20ecec7` (SEC-02) commit'leri. "Doğrulama" sütunu yerel koşulara dayanır; CI sonucu bu ortamda doğrulanamamıştır. Backend PostgreSQL E2E, Web UI veya Android E2E anlamına gelmez. Hazırlık kararı ve açık bulgular `go_live.md` içindeki 26 Kasım bölümünde, teknik ayrıntılar README.md içinde tutulur.

| Gereksinim | Durum | Doğrulama | Not |
|---|---|---|---|
| AUTH-02 | Kodda var | Backend PostgreSQL E2E | Opak refresh token, rotasyon, token ailesi ve reuse iptali |
| AUTH-03 | Kodda var | Backend PostgreSQL E2E | Kullanıcı satırı kilidi; kilitsiz anomali negatif kontrolle gösterildi |
| AUTH-04 | Kodda var | Backend PostgreSQL E2E | Parola değişiminde tüm oturumlar iptal; eski access token'lar reddediliyor |
| AUTH-05 | Kısmi | Backend PostgreSQL E2E (rate limit) | Rate limit var; beklenmeyen hatalarda iç mesaj istemciye dönüyor (SEC-06) |
| AUTH-06 | Kısmi | Backend PostgreSQL E2E | Web ve mobil logout aynı oturum ailesini iptal ediyor; Android istemcide doğrulanmadı |
| AUTH-07 | Kodda var | Kod incelemesi | Token/parola loglanmıyor; e-posta adresleri loglanıyor (ayrı gizlilik konusu) |
| MEM-01 | Kodda var | Backend PostgreSQL E2E (ret hariç) | Tek kullanımlık ve atomik kabul, expiry, iptal, silinmiş workspace kontrolü; ret yalnız negatif E2E senaryosunda (yanlış kullanıcı) test edildi, başarılı ret akışı doğrulanmadı |
| MEM-06 | Kodda var | Backend PostgreSQL E2E | Davet yalnız ilgili hesap tarafından kabul/ret edilebiliyor |
| MEM-07 | Kısmi | Backend PostgreSQL E2E | Yanıt gövdesi tek tip, bekleyen davette profil gizli; bekleyen satırın yalnız kayıtlı hesaplar için oluşması ve yanıt süresi farkı kısmi hesap tespitine izin veriyor |
| NOTIF-03 | Kodda var | Doğrulanmadı | `attempts: 5`, exponential backoff |
| NOTIF-05 | Kodda var | Unit test | HTML kaçışlama, URL doğrulama, konu satırı temizliği; gerçek SMTP doğrulanmadı |
| OPS-02 | Kısmi | İmaj içerik taraması | `.env` imajlara girmiyor; `JWT_SECRET` yer tutucusu kodda tespit edilmiyor |
| OPS-05 | Kısmi | Unit test, tarayıcı kontrolü | CORS allowlist, Helmet ve nonce tabanlı CSP var; HTTPS/reverse proxy yok |

**Çözüm notu (27 Kasım 2026):** Yukarıdaki tablo 26 Kasım durumunu kaydeder ve değiştirilmemiştir. İki satırdaki tespit `fix/go-live-blockers` dalında sonradan kapatıldı (ayrıntı ve CI kanıtı: `go_live.md`, 27 Kasım bölümü):
- **AUTH-05:** "Beklenmeyen hatalarda iç mesaj istemciye dönüyor (SEC-06)" tespiti M-5 kapsamında `0802f3d` ile kapandı. `HttpException` olmayan hatalar istemciye yalnızca genel 500 mesajıyla dönüyor ve sunucu tarafında loglanıyor (`http-exception.filter.spec.ts`, CI run `45959034137`). Rate limit ve güvenli hata mesajları dalda kodda var. Hesap başına login limiti politikası (H-4, §10 karar 11) açık kaldığı için AUTH-05'in rate limit tarafı ürün kararına bağlıdır.
- **OPS-02:** "`JWT_SECRET` yer tutucusu kodda tespit edilmiyor" tespiti C-1 kapsamında `1961f0b` ile kapandı. Backend bilinen yer tutucuları ve açıkça zayıf secret'ları açılışta reddediyor; CI Compose testi `eb7f162` ile rastgele secret kullanıyor. WF-12 altındaki 26 Kasım kod gözlemindeki aynı ifade için de bu not geçerlidir. OPS-02 **kısmi** kalır: `.env` dosyası dalda Git'ten kaldırıldı, ancak `main`'de hâlâ izleniyor ve public Git geçmişinde bulunduğu için değerlerin rotation değerlendirmesi açıktır; işaret içermeyen tahmin edilebilir secret'lar da tespit edilemez.

Bu düzeltmeler henüz `main`'e merge edilmedi.

Bu turda değerlendirilmeyen gereksinimlerin durumu önceki bölümlerde kaldığı gibidir. Yeni ürün kararları §10'a (madde 11–16) eklendi. 14. madde 26 Kasım'da karara bağlandı (404); diğerleri açıktır.


---

# 27 Kasım 2026 — ML mimarisi (onaylı öneri)

> Bu bölüm, ürün sahibinin onayladığı ML mimarisini tek yerde toplar. Önceki bölümleri değiştirmez. WF-06'daki ML gereksinimleri (ML-01…ML-11) ve §13.15'teki veri/etiket notları geçerlidir; bu bölüm onların uygulanma biçimini tanımlar.

## 1. Amaç ve ilkeler

TaskFlow AI, görevlerin teslim tarihini kaçırma riskini gerçek görev yaşam döngüsü verisinden öğrenerek tahmin etmeli, tahminlerini ölçmeli ve yalnızca kanıtlanmış iyileşmede güncellemelidir. Ürün self-hosted dağıtılır; müşteri verisi kurulumun dışına çıkmaz.

1. Gerçek ML merkezdedir; kurallar yalnızca karşılaştırma baseline'ıdır.
2. Güvenilir olay kaynağı: yalnız ekleme yapılan ve görev güncellemesiyle aynı veritabanı işleminde yazılan `TaskEvent` tablosu.
3. Açık saatli teslim tarihleri o saatte geçerlidir; yalnızca tarih içeren teslim tarihleri workspace saat diliminde o günün sonunda dolar; tüm zaman damgaları UTC saklanır.
4. Altı sentetik örnekle eğitilmiş eski model kaldırılmıştır; demo olarak tutulmaz.
5. Eğitim yalnızca workspace bazındadır; workspace verileri hiçbir zaman karışmaz. Kurulum genelinde eğitim yalnızca ileride açıkça değerlendirilecek bir seçenektir.
6. Workspace bazında eğitimi workspace yöneticisi açıkça etkinleştirir; sonrasında hazırlık kontrolü ve zamanlanmış eğitim otomatik çalışabilir.
7. Model sürümleri kalıcı depolamada saklanır.
8. Eğitim özellikleri, canlı tahminle aynı tanımlarla backend'de üretilir.
9. Veri hazırlık eşikleri yapılandırılabilir başlangıç hipotezleridir; kanıtlanmış şart değildir.
10. Küçük workspace'ler tamamen kullanılabilir kalır; yanıltıcı tahmin gösterilmez.
11. Sentetik veri yalnızca teknik doğruluğu ve pipeline davranışını doğrular; gerçek dünya başarısı kanıtı olarak sunulmaz.
12. Her yeni model etkinleşmeden önce değerlendirmeden geçer; geçemezse önceki model korunur.
13. Workspace verisi, eğitim, modeller ve tahminler sıkı biçimde izole edilir.
14. Public Jira Dataset yalnız koşullu adaydır: lisans, kişisel veri, kaynak içerik hakları, veritabanı hakları ve ticari dağıtım etkileri doğrulanmadan kullanılmaz. Lisansı belirsiz veri kullanılmaz.
15. Doğrulanmamış model çıktıları güvenilir olasılık olarak gösterilmez.

## 2. Başlangıç durumu ve sınırlamaları

- ML servisi tek tahmin yapan bir `/predict` sunuyordu; model 6 elle yazılmış örnekle eğitilmişti ve sağduyuya aykırı çıktılar veriyordu (ör. 30 gün gecikmiş görev LOW).
- Risk, görev oluşturma ve güncelleme isteği içinde senkron hesaplanıyordu (O-1).
- Özellikler görev geçmişini kullanmıyor; teslim tarihi yoksa 7 gün varsayıyordu.
- Audit kaydı yalnızca güncelleme sonrası durumu tutuyor ve işlemin parçası değil; teslim tarihi ve atama geçmişi, `completedAt` ve tahmin anındaki özellikler kaydedilmiyor.
- Android çevrimdışı değişikliklerde istemci zamanını göndermiyor.

## 3. Veri temeli

- **`TaskEvent`:** `id`, `workspaceId`, `taskId`, `type`, `field`, `oldValue`, `newValue`, `occurredAt` (UTC, sunucu), `clientOccurredAt` (opsiyonel), `actorId`, `source`. Olay türleri: oluşturma; durum, teslim tarihi, atanan kişi, öncelik değişikliği; silme/arşivleme; yorum. Görev güncellemesiyle aynı işlemde yazılır; olay yazılamazsa güncelleme de geri alınır. İndeksler: (`workspaceId`, `taskId`, `occurredAt`), (`workspaceId`, `occurredAt`). Audit log'dan yalnızca durum geçmişi kısmen geri doldurulabilir.
- **Türetilmiş alanlar:** `completedAt` (son DONE geçişi; yeniden açılırsa sıfırlanır); teslim tarihinin "yalnızca tarih / açık saatli" bilgisi; workspace saat dilimi.
- **Tahmin kaydı (`RiskAssessment`):** `featureSnapshot`, `featureSpecVersion`, kalibre `probability` (yalnızca doğrulanmışsa), `category`, `modelId`/`modelVersion`, `state`; yapılandırılabilir saklama süresi.

## 4. Tahmin problemi ve etiket

- Hedef: P(tahmin anında bilinen teslim tarihinde görev hâlâ tamamlanmamış | o anki durum).
- Geç: son DONE teslim tarihinden sonra ya da teslim tarihinde açık. Zamanında: teslim tarihinden önce DONE. Etiket tahmin anındaki teslim tarihine göre hesaplanır.
- Dışlananlar: teslim tarihi olmayan, teslim tarihinden önce silinen/arşivlenen, tamamlandıktan sonra teslim tarihi girilen görevler; oluşturulduğunda gecikmiş görevler ayrı grup.
- Sonucu belli olmayan görevler sınıflandırmada kullanılmaz; survival yaklaşımında right-censored kullanılabilir.
- Çıktı: kalibrasyon kontrolünden geçen modelde olasılık; LOW/MEDIUM/HIGH eşikleri test setinde seçilip modelle saklanır. Teslim tarihi olmayan görevde tahmin üretilmez.

## 5. Özellik ve tahmin sözleşmesi

- Backend'de `TaskEvent`'i oynatan, belirli bir ana göre çalışan tek özellik üreticisi; canlı tahmin ve eğitim aynı kodu kullanır.
- `featureSpecVersion` ile sürümleme; uyuşmazlıkta ML servisi isteği reddeder.
- Özellik grupları: zaman, ilerleme, teslim tarihi davranışı, iş yükü, aktivite, görev nitelikleri. Serbest metin içeriği, ham kişi kimlikleri ve tamamlanma sonrası bilgiler kullanılmaz.
- ML servisi: `/predict`, `/predict/batch`; istekler `workspaceId` ve `featureSpecVersion` taşır.

## 6. Tahmin akışı

- `risk-assessment` BullMQ kuyruğu; oluşturma, güncelleme, yorum ve atamada iş eklenir; görev sürümüne bağlı `jobId` ve kısa gecikme ile tekilleştirme; eski sürüm işleri atlanır.
- Teslim tarihi olan açık görevler için günlük, workspace bazında toplu yeniden hesaplama.
- Workspace'in etkin modeli yoksa ML çağrılmaz ve durum "veri toplanıyor" / "tahmin yok" olarak kaydedilir.
- Hatalarda backoff ile yeniden deneme; son geçerli değerlendirme korunur; istek yolu ML'i beklemez. ML servisi modelsiz de `healthy` döner.

## 7. Modeller

- Zorunlu baseline'lar: taban oran, az özellikli Logistic Regression.
- Birincil aday: HistGradientBoostingClassifier. Güçlü aday: ayrık zamanlı survival (görev-gün hazard, GBM ile).
- Opsiyonel (yalnızca ölçülebilir kazançla): LightGBM, Cox PH, Random Survival Forest.
- Küçük veri önlemleri: sığ ağaç, yüksek yaprak minimumu, az veride sigmoid kalibrasyon.
- Açıklanabilirlik: genel için permutation importance; tek tahmin için katkı değerleri (SHAP opsiyonel). Sabit eşikli ipuçları kullanılmaz.

## 8. Değerlendirme ve etkinleştirme

- Zamana göre ayrım (genişleyen pencere, en yakın dönem test) ve proje bazlı gruplama; aynı görevin snapshot'ları farklı setlere düşmez.
- Sızıntı kontrolleri: zamanda geri gitme değişmezliği, karıştırılmış etiket testi, bilinçli tuzak özelliği.
- Metrikler: PR-AUC, Brier, ECE, seçilen eşikte precision/recall, bootstrap güven aralıkları.
- Etkinleştirme: (1) PR-AUC'de baseline ve mevcut modeli önceden belirlenmiş farkla geçme, güven aralığı alt sınırı > 0; (2) Brier/ECE tolerans içinde; (3) dejenere olmayan dağılım; (4) karıştırılmış etiket testi; (5) şüpheli baskın özellik yok.
- Başarısızlıkta mevcut model kalır ve gerekçeli rapor yazılır; her workspace için son K model saklanır ve geri dönülebilir. Olasılık yalnızca kalibrasyon kontrolünden geçmiş modelde gösterilir.

## 9. Workspace bazında yerel eğitim

- Yönetici açıkça etkinleştirir; öncesinde yalnızca hazırlık durumu gösterilir.
- Hazırlık her gece hesaplanır; yalnızca etiketlenebilir görevler (teslim tarihi var, sonucu belli, dışlanmamış, `TaskEvent` dönemine ait) sayılır; snapshot değil görev sayısı esastır.
- Başlangıç hipotezleri (yapılandırılabilir): ≥ 300 etiketlenebilir görev; her sınıfta ≥ 50; azınlık oranı %5–95; ≥ 90 gün aralık ve son ≥ 30 gün test dönemi; test döneminde ≥ 20 azınlık görevi; ≥ 3 atanan kişi veya proje ve yeterli alan doluluğu.
- Eşiklerin doğrulanması: (1) gizli sinyalli sentetik simülasyonla veri miktarına göre metrik ve güven aralığı değişimi (yalnızca istatistiksel alt sınır); (2) hukuken onaylanmış gerçek veri olursa öğrenme eğrileri; (3) yerel hazırlık ve değerlendirme raporları ile müşterilerin isteğe bağlı paylaştığı bilgiler — merkezi veri toplanmaz; (4) asıl koruma etkinleştirme kontrolüdür.
- Zamanlama: ayda bir veya etiketlenebilir görev sayısı ~%20 arttığında (hangisi daha geç); elle tetikleme mümkündür.
- Akış: backend eğitim satırlarını üretir → `model-training` BullMQ işi ML servisinde düşük eşzamanlılıkla eğitir → değerlendirme ve etkinleştirme kontrolü → model ve `metadata.json` kalıcı depolamaya yazılır.
- Depolama: `models/workspaces/<workspaceId>/<modelId>/` (kalıcı volume).
- İzolasyon: her iş ve tahmin tek `workspaceId` taşır; model yükleyici metadata'daki `workspaceId` uyuşmazsa reddeder; eğitim satırları başka workspace verisi içeremez (testle doğrulanır); workspace silinince modelleri silinir.
- Küçük workspace'lerde tüm ürün çalışır; risk alanında yalnızca "veri toplanıyor" / "henüz doğrulanmış model yok" gösterilir.

## 10. Ürün çıkışı

- Varsayılan tahmin modeli gönderilmez; ürün eksiksiz ve test edilmiş öğrenme altyapısıyla çıkar.
- Genel model yalnızca hukuken onaylı bir veri setiyle eğitilip gerçek veride baseline'ı geçerse sonraki bir sürümde, "bu workspace'in verisiyle eğitilmedi" uyarısıyla eklenebilir.
- Pazarlama: "Her workspace'in kendi verisinden öğrenir, modelini ölçer ve yalnızca kanıtlanmış iyileşmede etkinleştirir." Doğruluk yüzdesi verilmez; ekran görüntülerinde sahte tahmin gösterilmez.

## 11. Doğrulama stratejisi

- Seed'li, deterministik olay simülatörü (durum makinesi), veriyi gerçek uygulama yolundan yazar; senaryo fixture'ları repoda, ölçek üretimi ayrıca.
- Senaryolar: zamanında/geç/sınırda tamamlanma; teslim tarihinde açık; sonucu belirsiz; erteleme, öne çekme, kaldırma, tamamlandıktan sonra ekleme; saat dilimi ve yaz saati; yeniden açma ve geri dönüşler; çoklu yeniden atama; eksik alanlar; sırasız/tekrarlı olaylar; çevrimdışı gecikme; silme/arşivleme; teslim tarihi kullanmayan, çok küçük, tek sınıflı, dengesiz ve çoklu workspace'ler.
- Tutarlılık: sıralı zaman, geçerli geçişler, olay oynatma ile görev satırı uyumu, doğru `workspaceId`.
- Sentetik veri teknik doğruluğu, pipeline davranışını, sınır durumlarını, izolasyonu ve gizli sinyalin geri bulunmasını (gürültüde etkinleştirme reddi) doğrular; gerçek müşteri başarısını doğrulamaz.

## 12. Arayüz durumları (web ve Android aynı)

| Durum | Gösterilen | Olasılık |
|---|---|---|
| Veri toplanıyor | "Risk tahmini için veri toplanıyor (etiketlenebilir görev: X / Y)" | Hayır |
| Eğitim kapalı / doğrulanmış model yok | "Bu workspace için henüz doğrulanmış bir model yok" | Hayır |
| Genel model (koşullu) | "Genel model; bu workspace'in verisiyle eğitilmedi" + model kartı | Yalnızca kalibre edilmişse |
| Workspace modeli etkin | Kategori, gerçek katkı faktörleri, eğitim dönemi, baseline'a göre iyileşme | Yalnızca kalibre edilmişse |
| Düşük güven | Kategori + "düşük güven" | Hayır |
| Tahmin yok | "Tahmin şu an yapılamıyor" (servis kapalı / teslim tarihi yok) | Hayır |

## 13. Uygulama aşamaları ve kabul kriterleri

| Aşama | İçerik | Kabul kriterleri |
|---|---|---|
| **0** | O-1 `risk-assessment` kuyruğu; eski 6 örnekli modelin, `train.py`'nin ve model dosyasının kaldırılması; ML servisinin modelsiz açılması; dürüst arayüz durumları; model kartı ve README | Görev istekleri ML'i beklemez; ML servisi modelsiz `healthy`, Docker smoke testi geçer; web ve Android uydurma kategori göstermez; testler yeşil |
| **1** (0'a bağlı) | `TaskEvent` (aynı işlem), `completedAt`, teslim tarihi biçimi ve workspace saat dilimi, opsiyonel `clientOccurredAt`, audit'ten kısmi geri doldurma, simülatör v1 | Olay yazılamazsa güncelleme geri alınır; oynatma ile görev satırı birebir uyumlu; saat dilimi/yaz saati testleri; yalnız ekleme yapan migration; güncelleme gecikmesi ölçülmüş |
| **2** (1'e bağlı) | As-of özellik ve etiket üreticisi, `featureSpecVersion`, `RiskAssessment` alanları, `/predict/batch`, günlük yeniden hesaplama, sızıntı testleri | Sızıntı testleri yeşil; sözleşme testi; teslim tarihi olmayan görevde tahmin yok; günlük hesaplama hedef sürede |
| **3** (2'ye bağlı) | Baseline'lar, HistGB, kalibrasyon ve eşik seçimi, etkinleştirme/kalibrasyon kontrolleri, metadata ve geri alma, uçtan uca sentetik testler | Gizli sinyalde model geçer ve etkinleşir; gürültü ve karıştırılmış etikette reddedilir; başarısız model öncekini bozmaz; tekrarlanabilir eğitim; sentetik metrik iddia olarak kullanılmaz |
| **4** (3'e bağlı) | Yönetici onayı, hazırlık raporu, zamanlanmış eğitim, kalıcı volume ve workspace modelleri, izolasyon kontrolleri, tüm arayüz durumları | Onaysız eğitim çalışmaz; kriterler yapılandırılabilir ve raporlanır; workspace'ler arası sızıntı yok (testle); silinen workspace'in modelleri silinir; küçük workspace kullanılabilir; web/Android aynı durumu gösterir |
| **5** (opsiyonel) | Survival karşılaştırması, tek tahmin açıklaması, LightGBM, eşiklerin kanıtla ayarı; koşullu genel model | — |

Sürüm kapısı: 0–4 kabul kriterlerini karşılamış; model kartı "ürünle birlikte doğrulanmış bir model gönderilmemektedir" der; doğruluk iddiası yok.

## 14. Açık kararlar ve dış bağımlılıklar

1. ~~Teslim tarihi veri modeli~~ — **karar verildi (27 Kasım 2026):** `Workspace.timezone` (IANA, varsayılan `UTC`) ve `Task.dueDateIsDateOnly`. `YYYY-MM-DD` girişi yalnızca tarih olarak UTC gece yarısında saklanır ve workspace saat diliminde o günün sonunda biter; saatli ISO değer tam an olarak saklanır. Mevcut teslim tarihleri yalnızca tarih kabul edildi (web formu yalnızca tarih gönderiyordu, Android teslim tarihi göndermiyor).
2. Etkinleştirme parametreleri: minimum iyileşme farkı, kalibrasyon toleransı, saklanacak model sayısı K.
3. Olay ve tahmin kayıtlarının saklama politikası.
4. Public Jira Dataset için hukuki görüş (KVKK/GDPR dayanağı; kaynak Jira örneklerinin veritabanı hakları ve kullanım şartları) ve Envato kurallarının kontrolü — yalnız genel model seçeneği için.
5. Eğitim işinin müşteri sunucusunda kullanacağı varsayılan kaynak sınırları.

## 15. Uygulama durumu

- **Aşama 0 uygulandı (27 Kasım 2026, `fix/go-live-blockers`, commit `cdd1904`):** `risk-assessment` BullMQ kuyruğu ve processor; görev istekleri işi yalnızca kuyruğa ekler ve beklemez; ML servisi modelsiz açılır ve `/predict` için `503 MODEL_UNAVAILABLE` döner; model yoksa risk kaydı yazılmaz; eski `v1` modelin mevcut veritabanlarındaki kayıtları API'de gösterilmez; web ve Android yalnızca bir modelden gelen LOW/MEDIUM/HIGH değerini gösterir, aksi halde "risk tahmini henüz yok" durumunu gösterir.
- **Aşama 1 uygulandı (27 Kasım 2026, `fix/go-live-blockers`, henüz commit edilmedi):** append-only `TaskEvent` tablosu (`seq` ile sıralı; `CREATED`, `SNAPSHOT`, `STATUS_CHANGED`, `DUE_DATE_CHANGED`, `ASSIGNEE_CHANGED`, `PRIORITY_CHANGED`, `COMMENT_ADDED`, `COMMENT_DELETED`; kaynak `API` / `OFFLINE_SYNC` / `BACKFILL`). Görev oluşturma/güncelleme ve yorum ekleme/silme olaylarla aynı veritabanı transaction'ında yazılır; olay yazılamazsa değişiklik geri alınır. Güncellemede olaylar yalnızca version kontrolünü kazanan istek için yazılır. `Task.completedAt` eklendi. Android çevrimdışı değişikliklerde cihaz zamanını `clientOccurredAt` olarak gönderir; sunucu zamanı (`occurredAt`) esas kalır. Migration mevcut veriyi doldurur: audit kayıtlarından durum geçişleri (`BACKFILL`), her görev için bir `SNAPSHOT`, DONE görevler için `completedAt` (son DONE geçişi, yoksa `updatedAt`). Audit kaydı eksik eski görevlerin geçmişi yalnızca snapshot anından itibaren güvenilirdir; Aşama 2 eğitim verisinde bu görevlerin snapshot öncesi dönemi kullanılmamalıdır.
  - Doğrulama: birim testleri (saat dilimi/DST dahil teslim tarihi hesabı, diff ve replay); gerçek PostgreSQL + Redis üzerinde E2E: seed'li simülatörle 8 görev × 20 işlemin olaylardan yeniden kurulan hâlinin görev satırıyla birebir eşleşmesi, olay yazımı başarısız olunca rollback, eşzamanlı güncelleme ve yorum silmede tek olay, workspace izolasyonu, saat dilimi ayarı yetkisi; eski veri üzerinde backfill migration'ı (UTC dışı oturum saat dilimiyle).
  - Simülatör yalnızca teknik doğrulama içindir; tahmin sinyali taşımaz ve model kalitesi kanıtı olarak kullanılamaz.
- **Aşama 1 gecikme ölçümü (27 Kasım 2026):** üretim derlemesi, yerel PostgreSQL 16 + Redis 7, Apple M3, her ölçüm 300 ardışık `PATCH`. Olay yazmayan başlık değişikliği p50 4,6–4,9 ms / p95 6,4–6,6 ms; bir olay yazan durum değişikliği p50 5,2–5,6 ms / p95 7,5–7,6 ms. Olay yazımının ek maliyeti p50'de yaklaşık 0,6 ms.
- **Aşama 2 uygulandı (27 Kasım 2026, `fix/go-live-blockers`, henüz commit edilmedi):**
  - `backend/src/risk-features/`: tek as-of özellik üreticisi (`buildFeatures`), uygunluk kontrolü, etiket üreticisi (`labelAt`) ve günlük örneklemeli eğitim satırları (`buildTrainingRows`). Özellik sözleşmesi `tf-risk-v1`: 21 sayısal özellik (zaman, ilerleme, teslim tarihi davranışı, iş yükü, aktivite, öncelik). Liste `ml-service/feature_spec.json` ile aynı ve sözleşme testiyle korunuyor.
  - Tahmin yapılmayan durumlar: teslim tarihi yok, teslim tarihi geçmiş, DONE, silinmiş/projesi silinmiş, geçmişi TaskEvent öncesine dayanan görev. Etiket, tahmin anında bilinen teslim tarihinde DONE olup olmamaya göre belirlenir. Sonucu henüz belli olmayan ve teslim tarihinden önce kaldırılan görevler etiketlenmez.
  - ML servisi: `/predict` ve `/predict/batch` (en çok 1000 öğe) `workspaceId` + `featureSpecVersion` ister. Sürüm uyuşmazlığı veya eksik/fazla özellik `422` döner. Başka workspace'e ait model kullanılmaz. Model paketi sözleşmesi (eşikler, `calibrated`) başlangıçta doğrulanır. Olasılık yalnızca kalibre modelde döner.
  - Backend: eski `RiskFeatureService` (teslim tarihi yoksa 7 gün varsayıyordu) kaldırıldı. `RiskInferenceService` canlı tahmini aynı üreticiyle yapar ve 200'lük gruplar halinde gönderir. `RiskAssessment` kayıtlarına `featureSpecVersion`, `featureSnapshot` ve `reason` alanları eklendi (yalnızca ekleme yapan migration). Artık uygulanmayan bir tahmin, `UNAVAILABLE` kaydıyla geri çekilir; istemciler bu durumda seviye göstermez. Yorum ekleme/silme de değerlendirme tetikler. BullMQ job scheduler her gün 02:00 UTC'de workspace başına toplu yeniden hesaplama başlatır.
  - Doğrulama: birim testleri (özellik değerleri, iş yükü, etiket kuralları, saat dilimi), seed'li sızıntı testleri (gelecekteki olaylar ve gelecekteki silinme özellikleri değiştirmiyor; gözlem anından sonraki olaylar etiketi değiştirmiyor), Python sözleşme testleri, gerçek PostgreSQL + Redis üzerinde E2E (workspace izolasyonu, gönderilen özelliklerin aynen saklanması, DONE olunca geri çekme, modelsiz durumda kayıt yok, eksik geçmişte tahmin yok, zamanlayıcı kaydı).
  - Günlük hesaplama süresi (stub ML, Apple M3): 1.000 açık görev 1,5 sn; 5.000 görev 7,5 sn; 10.000 görev 16,3 sn (yaklaşık 21 olay/görev). Hedef: workspace başına 10.000 açık görev < 60 sn.
  - Bilinen sınır: `buildTrainingRows` henüz bir eğitim işi tarafından kullanılmıyor (Aşama 3). Özellik açıklamaları (`factors`) boş; açıklanabilirlik Aşama 3/5 kapsamında.
- **Aşama 3 uygulandı (27 Kasım 2026, `fix/go-live-blockers`, henüz commit edilmedi):** `ml-service/training/`.
  - **Ayrım:** Zamana ve göreve göre yapılıyor. Son 30 gün test dönemi. Eğitimde yalnızca bütün teslim tarihleri, dolayısıyla etiketleri, test döneminden önce bilinen görevler kullanılıyor; bu dönemin son kısmı kalibrasyon ve eşik seçimi için ayrılıyor. Sınırı aşan görevler atılıyor ve her görevin ağırlığı 1.
  - **Modeller:** taban oran ve 6 özellikli LR baseline'ları; aday HistGradientBoosting (sığ ağaç, büyük yaprak). Kalibrasyon Platt yöntemiyle kalibrasyon setinde yapılıyor.
  - **Eşikler:** Bilinçli sapma: eşikler §4'teki "test setinde seçilir" ifadesinin aksine kalibrasyon setinde seçiliyor. Testte seçmek değerlendirmeyi iyimser yapardı.
  - **Etkinleştirme kontrolü:** §8'deki beş kontrol uygulanıyor. Karıştırılmış etiket kontrolü, taban orandan bağımsız olduğu için 10 karıştırmanın ROC-AUC ortalamasıyla yapılıyor ve tolerans ölçülen varyansa göre belirleniyor; tek karıştırmanın PR-AUC'si küçük test setinde ±0,06 oynadığı için yanlış ret üretiyordu.
  - **Rapor:** Tüm eşikler yapılandırılabilir ve rapora yazılıyor.
  - **Model kaydı:** `MODELS_DIR/workspaces/<workspaceId>/` altında modeller, metadata, her eğitimin raporu (reddedilenler dahil) ve atomik aktif işaretçi tutuluyor. Son 5 model saklanıyor ve geri alma mümkün. Reddedilen aday aktif modeli değiştirmiyor.
  - **Servis:** Aktif modeli yeniden başlatma olmadan alıyor. Başka workspace'e ait, farklı scikit-learn sürümüyle eğitilmiş, uyumsuz sözleşmeli veya eşikleri geçersiz modeli reddediyor. Komut satırı aracı: `python -m training.cli train|rollback`.
  - **Doğrulama:** 26 pytest testi. Kapsam: gizli sinyalin etkinleşmesi; gürültü, sızıntı tuzağı, yetersiz veri, geçersiz satır ve mevcut modeli geçemeyen adayın reddi; tekrarlanabilirlik; geri alma; son K modelin tutulması; workspace izolasyonu ve dizin dışına çıkma denemesi; sürüm uyuşmazlığı; servisin yeniden başlatmasız model alması.
  - **Docker imajında uçtan uca:** servis açıkken eğitim yapıldı ve model sunuldu, başka workspace'e 503 döndü, gürültüyle yapılan eğitim reddedildi ve aktif model korundu.
  - **Ölçülen etkinleşme gücü (sentetik, 10 seed, yalnızca teknik doğrulama):** Gürültü hiçbir boyutta etkinleşmedi (0/10). Sızıntı tuzağı her seferinde reddedildi (10/10). Orta güçte gerçek sinyal, test döneminde ~140 görevle 2/10, ~270 görevle 9/10, ~390 görevle 10/10 etkinleşti.
  - **Aşama 4 için sonuç:** §9'daki "test döneminde ≥ 20 azınlık görevi" hipotezi etkinleşme gücü için zayıf. Öneri: hazırlık kontrolü test döneminde yaklaşık ≥ 250 etiketlenebilir görev aramalı. Bu da yapılandırılabilir bir başlangıç değeri olmalı ve gerçek veriyle yeniden değerlendirilmeli.
  - **Bilinen sınırlar:** Eğitimi backend'den tetikleyen iş, satırların backend'den aktarılması, kalıcı volume, yönetici onayı ve arayüz durumları Aşama 4 kapsamında. Tahmin açıklamaları (`factors`) hâlâ boş.
- **Aşama 4 uygulandı (27 Kasım 2026, `fix/go-live-blockers`, henüz commit edilmedi):**
  - **Onay ve hazırlık:** `Workspace.riskTrainingEnabled` alanıyla yönetici onayı geldi. Onay yoksa çıkarım ML'i hiç çağırmıyor ve önceki tahminleri `training-disabled` nedeniyle geri çekiyor. Onay kaldırılınca model de devre dışı bırakılıyor. Hazırlık raporu (`riskReadiness`) her gece 03:00 UTC'de ve onay verildiğinde hesaplanıyor.
  - **Eğitim çalıştırmaları:** `RiskModelTraining` tablosu çalıştırmanın durumunu (QUEUED/RUNNING/PROMOTED/REJECTED/NOT_READY/FAILED), tetikleyicisini, hazırlığı ve raporu tutuyor.
  - **İş kuyruğu:** BullMQ `risk-model-training` kuyruğu tek eşzamanlılıkla çalışıyor. Zamanlanmış eğitim "ilk kez, sonra ≥30 gün VE ≥%20 büyüme" kuralını izliyor; elle tetikleme de var. Her gece silinmiş workspace'lerin modelleri temizleniyor.
  - **ML servisi:** `/train` (aynı anda tek eğitim, `409 TRAINING_IN_PROGRESS`), `/models/{ws}`, `/rollback`, `/deactivate`, `/models/prune` uç noktaları eklendi. Compose'a kalıcı `ml-models` volume'u ve backend'e `RISK_*` ayarlarının geçişi eklendi.
  - **Uç noktalar:** `GET/PATCH /workspaces/:id/risk-model`, `POST .../train`, `POST .../rollback`. Durumu her üye görebiliyor; yönetimi yalnızca OWNER/ADMIN yapabiliyor.
  - **Arayüz:** Web'e "Delay-risk model" paneli eklendi (hazırlık kontrolleri, aktif model, son eğitim; yöneticiler için aç/kapat, şimdi eğit, geri al). Görev detayında §12 durumları gösteriliyor. Android aynı durum metinlerini gösteriyor.
  - **§9 değişikliği:** Hazırlık eşiği "test döneminde ≥ 20 azınlık görevi" iken, Aşama 3 güç ölçümüne dayanarak "test döneminde ≥ 250 görev ve ≥ 20 azınlık görevi" yapıldı. Değer yapılandırılabilir ve gerçek veriyle yeniden değerlendirilmeli.
  - **Doğrulama:** backend 34 suite / 367 birim testi; E2E 52/52, iki kez çalıştırıldı (onay ve yetki, onayda hazırlık ve ilk eğitim, `/train` satırlarının yalnızca o workspace'ten gelmesi, NOT_READY, eşzamanlı çalıştırma reddi, onay kaldırılınca devre dışı bırakma, geri alma hatası, gece temizliği, zamanlayıcı kaydı); ML 31 test; Android birim testleri ve derleme; web `tsc`, ESLint ve build.
  - **Compose duman testi:** 5 servis sağlıklı, migration'lar uygulandı, model volume'u konteyner yeniden oluşturulunca da korunuyor.
  - **Bilinen sınırlar:** Workspace silme uç noktası ürün içinde yok; temizlik, silinmiş veya artık olmayan workspace'leri gece kapsıyor. ML yönetim uç noktalarının kendi kimlik doğrulaması yok, yalnızca Compose ağı içinden erişilebiliyor. Web arayüzü tarayıcıda elle denenmedi; Android arayüzü cihazda denenmedi. Tahmin açıklamaları (`factors`) hâlâ boş (Aşama 5).
- Aşama 5 (opsiyonel) başlamadı.

---

# 28 Kasım 2026 — `main` dalına birleştirme notu

`fix/go-live-blockers` dalı bu tarihte `main`'e birleştirildi. Bu belgede daldaki güncel sürüm esas alındı. Aşağıdaki satırlar yalnızca `main`'deki sürümde vardı (son `main` doküman commit'i `c9f11dd`, 26 Kasım 2026); geçmiş kaybolmasın diye aynen korunuyor. Bu satırlardaki "`main`'e merge edilmedi", "`main`'de değil" gibi ifadeler birleştirmeden önceki durumu anlatır; dalın tüm kod değişiklikleri artık `main`'dedir. Go-live kararı değişmedi: güncel durum yukarıdaki en son tarihli bölümlerdedir.

**Hedeflenen akış:** OWNER/yetkili ADMIN e-posta ve rol girer → backend yetkiyi ve hedef rolü doğrular → süreli davet oluşturulur → davet gönderilir → hedef kullanıcı tek kullanımlı daveti kabul eder → üyelik ACTIVE olur → OWNER rol/üyelik yönetir → audit kaydı oluşur.

**Alternatifler:** Kullanıcı bulunamadı; zaten üye; davet süresi doldu/iptal edildi; token tekrar kullanıldı; ADMIN ayrıcalık yükseltmeye çalıştı; son OWNER çıkarılmaya çalışıldı.

- **MEM-01:** Davet oluşturma/kabul/iptal/süre aşımı durum makinesi olmalı.

- **MEM-06:** Davet linkleri tahmin edilemez, tek kullanımlık ve süreli olmalı.

**Kod gözlemi:** Üye listeleme/davet/rol değiştirme/çıkarma servis kodu var. Davet kabulünün tam akışı ve e-posta job'larının çalışması doğrulanmalı; bu belge bunları tamamlanmış saymaz.

| E2E-03 | Üye daveti | Süreli, tek kullanımlı davet tamamlanır | P1 |

6. Davetli kullanıcı önceden kayıtlı olmak zorunda mı; kabul/süre sonu nasıl işler?

14. Başka workspace'e erişimde 403 mü 404 mü dönülmeli (E2E-20)? **Karar verildi (26 Kasım 2026): 404 Not Found.** Üye olmayan kullanıcıdan workspace'in varlığı gizlenir. `main`'deki `WorkspaceMemberGuard` da bu durumda 404 döndürür; `fix/go-live-blockers` dalındaki E2E testi `01005bc` ile bu karara uyarlandı.

### 13.1 Üyelik daveti gerçekte kabul akışı değil

- Davet endpoint'i üyeliği doğrudan `ACTIVE` olarak oluşturuyor.
- Davet token'ı, davet süresi, kabul/ret ve iptal durum makinesi görünmüyor.
- Bu nedenle WF-03'teki gerçek davet-kabul yolculuğu mevcut haliyle **eksik**; var olan davranış daha çok kayıtlı kullanıcıyı doğrudan workspace'e eklemek.

**Gereksinim etkisi:** MEM-01 ve MEM-06 henüz karşılanmış değil. Ürün kararı: davetli kişi kayıtlı değilse ne olacak? İlk sürümde davet linkiyle kayıt + kabul mü, yoksa yalnız mevcut kullanıcıya ekleme mi?

**Mevcut davranış:** OWNER/ADMIN davet endpoint'ine e-posta ve rol gönderir. E-posta sistemde kayıtlı değilse 404 döner. Kayıtlı kullanıcı varsa üyelik hemen `ACTIVE` olarak oluşturulur; davet e-postası yalnız bilgilendirme niteliğindedir. `MembershipStatus.PENDING` ve `EXPIRED` enum değerleri tanımlı olmasına rağmen davet kabul/ret durum makinesinde kullanılmıyor. Tekrarlı üyelik unique constraint nedeniyle conflict verir.

**Ürün gereksinimi kararı:** Gerçek SaaS daveti için e-posta linki/token, token hash saklama, expiration, kabul/ret, davet iptali/yeniden gönderim, zaten üye/önceden davetli kullanıcı, yanlış workspace, token tekrar kullanımı ve davet rolünün kabul anındaki geçerliliği senaryoları tanımlanmalı. Davet kabul edilene kadar üyelik PENDING olmalı; workspace erişimi yalnız ACTIVE üyeliğe verilmeli. Davet linki token'ı loglara veya audit metadata'ya yazılmamalı. Kullanıcı zaten kayıtlı mı değil mi ayrıntısı gereksiz yere dışarı sızdırılmamalı.

**Kabul kriterleri:** (1) yalnız OWNER/ADMIN uygun roller için davet oluşturabilir; (2) OWNER rolü normal davetle verilemez; (3) ADMIN yalnız MEMBER/VIEWER davet edebilir; (4) davet token'ı tek kullanımlık ve süreli; (5) kabul işlemi atomik; (6) expired/revoked/used token reddedilir; (7) PENDING üyelik API/guard tarafından workspace erişimi alamaz; (8) davet ve kabul olayları audit edilir; (9) e-posta gönderimi dayanıklı kuyrukla yapılır.

**Öncelik:** P1 ürün kapsamı; mevcut otomatik ACTIVE ekleme davranışı demo için çalışabilir ancak gerçek davet kabul akışı olarak sunulmamalı.

**Durum:** OFF hesap izolasyonu ve temel HTTP işleme kodda mevcut; Worker için 2xx/401/403/409/429/5xx/network/malformed payload test matrisi ve gerçek backend entegrasyon testi henüz yeterli kanıtlanmadı. Android refresh token akışı bulunmuyor; 401 sonrası yeniden giriş gerekebilir. Logout yerel session'ı temizliyor ancak backend logout/revoke çağrısı yapmıyor.

### Backend auth/session — açık P0

- Refresh token doğrulama, aktif tokenları listeleme, eşleşen tokenı revoke etme ve yeni token üretme ayrı DB işlemleri. Atomik compare-and-swap/transaction yok; aynı refresh token ile eşzamanlı istekler yarışabilir.
- `refreshTokens` catch bloğu tüm hataları `INVALID_REFRESH_TOKEN` olarak dönüştürüyor; `TOKEN_THEFT_DETECTED` ayrımı kayboluyor.
- Parola değişimi `passwordHash` güncelliyor; aktif refresh tokenları revoke etmiyor.
- Android AuthApiService yalnız login içeriyor; refresh/logout ve cookie yönetimi bulunmuyor. Backend refresh tokenı HttpOnly cookie olarak sunuyor; Android istemcinin bu cookie akışına katıldığına dair kod yok.

**Kabul kriterleri:** Refresh rotation transaction/CAS; paralel refresh testi (tek başarılı rotasyon); token reuse davranışı ve güvenli audit; parola değişiminde tüm oturumların revoke edilmesi; Web ve Android logout/refresh davranışının açık ve test edilmiş sözleşmesi.

- Üye daveti hâlâ kayıtlı kullanıcıya doğrudan ACTIVE üyelik oluşturuyor; davet tokenı, expiry, accept/reject/revoke state machine yok. `workspace.member_invited` event'inin listener'ı görünmüyor.

NotificationsModule AppModule'a dahil; TaskAssignedListener TasksModule provider'ı; email queue ve EmailProcessor kodda bağlı. E-posta HTML alanları escape ediliyor. Ancak queue add çağrısında attempts/backoff/retention ayarı görünmüyor ve SMTP gerçek teslimat testi yok. AuditService DB hatasını catch edip yuttuğu için domain write başarılıyken audit kaydı kaybolabilir. Transactional outbox bulunmuyor.

- Task create/update ML tahminini senkron bekliyor. AiService HTTP timeout tanımlamıyor; servis yanıt vermezse task API uzun süre bekleyebilir.

# 26 Kasım 2026 — `fix/go-live-blockers` dalındaki gereksinim durumu (`main`'e merge edilmedi)

> **Kapsam:** Bu bölüm `fix/go-live-blockers` dalındaki (`01005bc`) analizden yalnızca doküman olarak aktarılmıştır. Aşağıdaki "Kodda var", "kapatıldı" ve "doğrulandı" ifadeleri **dalın kodu** için geçerlidir; dal henüz `main`'e merge edilmediği için bu davranışlar **`main`'in kodunda (`b5b4fb4`) mevcut değildir**. `main` için yukarıdaki tarihsel bulgular (ör. §13.1'deki doğrudan ACTIVE davet) geçerliliğini korur. Bu bölüm önceki bölümleri değiştirmez. Dal ile `main` arasındaki farkın özeti `go_live.md` içindeki "Dal ve `main` durumu" tablosundadır. Bu bölümdeki README atıfları dalın README'sine aittir.

## Dalda yapılan gereksinim tanımı değişiklikleri

Dalda aşağıdaki tanımlar ilk sürüm kapsamı olarak yeniden yazıldı. `main`'deki özgün metinler yukarıda korunur; bu sürümler dal merge edildiğinde onların yerine geçecek önerilerdir.

- MEM-06 (dal tanımı): İlk sürümde davet mevcut TaskFlow hesabının userId değerine bağlanmalı; yalnız o hesap kabul edebilmeli ve davet 7 gün içinde kullanılmalı. Token-link ile kayıt akışı kapsam dışıdır.
- §10 madde 6 (dal kararı): İlk sürüm kararı: davetli kullanıcı önceden kayıtlı olmalı; davet 7 gün PENDING kalır, yalnız ilgili hesap kabul/ret edebilir. Token-link ile yeni kayıt sonraki sürüme bırakıldı.
- E2E-03 (dal kabul ölçütü): Kayıtlı kullanıcıya PENDING davet, kabul/ret, 7 günlük expiry ve iptal gerçek backend ile E2E doğrulanır
- MEM-07 dalda eklendi; bu belgeye de WF-03 altına eklendi. Durumu aşağıdaki tabloda **Kısmi**.

## Dal kod gözlemleri (25–26 Kasım 2026)

**WF-01 (AUTH):** WF-01 kod gözlemindeki yarış koşulu ve hata ayrıştırması bulgusu dalda commit `675246a` ile kapatıldı; AUTH-02, AUTH-03 ve AUTH-04 kodda var ve yerel backend PostgreSQL E2E ile doğrulandı. AUTH-05 ve AUTH-06 kısmidir. Gereksinim bazında durum ve kanıt için belgenin sonundaki 26 Kasım çapraz kontrol bölümüne bakın.

**WF-03 (MEM), 25 Kasım:** PENDING davet oluşturma, 7 günlük expiry, kullanıcının kendi Workspaces ekranından kabul/ret etmesi, atomik ACTIVE geçişi, süresi dolan davetin EXPIRED yapılması ve BullMQ e-posta kuyruğu kodda mevcut. Gerçek SMTP teslimatı ve browser E2E akışı henüz doğrulanmadı. Üyelik/davet olayları için audit kayıtları da tamamlanmalı.

**WF-03 (MEM), 26 Kasım:** Commit `2b30009` ile davet yanıtı kayıtlı/kayıtsız adres için aynı hale getirildi, bekleyen davetlerde ad-soyad ve avatar gizlendi, yeniden davet koşullu yazma ile yapılıyor, eşzamanlı davet çakışması 409 dönüyor ve silinmiş workspace daveti kabul edilemiyor. MEM-06 ve MEM-01'in kabul, expiry ve iptal kısımları yerel backend PostgreSQL E2E ile doğrulandı; başarılı ret akışı E2E ile doğrulanmadı. MEM-07 kısmidir: bekleyen davet satırı üye listesinde yalnız kayıtlı hesaplar için oluşuyor ve yanıt süresi farkı da hesabın var olup olmadığını ele verebilir; bu nedenle kısmi hesap tespiti mümkün. Browser E2E, gerçek SMTP ve davet audit kayıtları hâlâ açık.

**WF-09 (NOTIF):** NOTIF-05 için e-posta HTML'i kaçışlanıyor, davet bağlantısı yalnız mutlak `http`/`https` URL ise basılıyor ve konu satırından CR/LF temizleniyor (commit `2b30009`, unit testler). E-posta kuyruğu `attempts: 5` ve exponential backoff ile tanımlı (NOTIF-03 kodda var, doğrulanmadı). Gerçek SMTP teslimatı doğrulanmadı.

**WF-12 (OPS):** OPS-02 kısmidir: build context'leri `.env` ve anahtar dosyalarını imajlara almıyor (commit `761f03a`), ancak `.env.example` içindeki `JWT_SECRET` yer tutucusu kod tarafından tespit edilmiyor. OPS-05 kısmidir: CORS allowlist, Helmet header'ları ve nonce tabanlı CSP kodda var (commit `20ecec7`); repoda HTTPS/reverse proxy yapılandırması yok. Deployment gereksinimleri README.md "Production deployment notes" bölümünde tutulur.

## Dal E2E kanıt notu

**Kanıt güncellemesi (26 Kasım 2026, sonraki tur):** 14. karar (404) sonrasında dalda `test/taskflow.e2e-spec.ts` içindeki iki eski 403 beklentisi `01005bc` ile 404 olarak düzeltildi. Yerel PostgreSQL 16 + Redis 7 koşusunda bu test 2/2, bütün backend E2E suite'i 5/5 suite ve 32/32 test geçti; böylece E2E-20 ve E2E-01'in kayıt adımları dalda **backend API seviyesinde** yerel olarak doğrulandı. GitHub Actions'ta `01005bc` için Backend job'u başarılı; Android job'u bu kayıt yazılırken bekleniyordu. Web UI ve Android istemci E2E doğrulaması hâlâ yok. `main`'de bu testler ve CI workflow'u yok.

## Dal gereksinim çapraz kontrolü

Durum ve doğrulama sütunları `fix/go-live-blockers` dalı için geçerlidir; `main` için bu gereksinimlerin dal kapsamındaki uygulaması eksiktir.

Yeni ürün kararları §10'a (madde 11–16) eklendi; 14. madde karara bağlandı (404), diğerleri açıktır.
