# TaskFlow AI — Kaynak Kod Satışa Hazırlık Planı

**Hedef ürün:** Self-hosted SaaS boilerplate / kaynak kod paketi  
**Çalışma dalı:** `fix/go-live-blockers`  
**Başlangıç commit'i:** `bc12dbce60f26fce69f190e6ff564d43f86d70e7`  
**İlk denetim tarihi:** 22 Kasım 2026  
**Yayın kararı:** NO-GO — bu belge bir çalışma planıdır; ürünün hazır olduğunu iddia etmez.

## 1. Satış modelinin anlamı

Alıcı kaynak kodu, kurulum dosyalarını ve dokümantasyonu satın alır; kendi sunucusunda çalıştırır, markasına göre özelleştirir ve bakımını yapar. Bu nedenle teslimat yalnızca çalışan bir demo değildir. Temiz bir sunucuda tekrarlanabilir kurulum, güvenli varsayılanlar, anlaşılır yapılandırma, migration/backup/restore yönergeleri, lisans ve destek sınırları gerekir.

İlk sürümde barındırılan SaaS aboneliği, ödeme alma ve müşteri lisansı doğrulama servisi kapsam dışıdır. Ancak kaynak kodun lisans koşulları ve alıcının ürünü nasıl kullanabileceği açıkça tanımlanmalıdır.

## 2. İlk denetim — doğrulanmış bulgular

### P0 — satış öncesi engelleyiciler

- [ ] **Android oturum yenileme E2E doğrulaması:** Kodda /auth/mobile/login, /auth/mobile/refresh, /auth/mobile/logout uçları mevcut. Android tarafında refresh token EncryptedSharedPreferences içinde saklanıyor; TokenAuthenticator 401 sonrasında refresh yapıp dönen access/refresh token çiftini kaydediyor. Bu akışın gerçek backend ile fiziksel cihaz/emülatörde; access token süresi dolması, eşzamanlı 401, refresh token rotation, logout sonrası eski token reddi ve ağ hatası senaryolarıyla E2E doğrulanması hâlâ gerekiyor.
- [ ] **Üretim sırları ve yapılandırma:** `AuthModule` içinde `JWT_SECRET` yoksa kullanılabilecek sabit bir fallback secret bulunuyor. JWT stratejisi ayrıca secret zorunlu tutsa da satış paketinde sabit fallback kabul edilemez; tüm servislerde güvenli fail-fast yapılandırma doğrulanmalı.
- [ ] **Temiz kurulum / gerçek çalışma:** Son CI Docker Compose yapılandırmasını doğrulayıp image'ları build ediyor; temiz makinede servisleri başlatma, migration, kayıt/giriş, görev akışı ve servisler arası gerçek bağlantıyı tek uçtan uca senaryo ile kanıtlamıyor.
- [ ] **Lisans ve ürün teslimi:** Depoda kök seviyede alıcıya yönelik README ve lisans dosyası bulunmuyor. Backend ve frontend README dosyaları hâlâ framework başlangıç şablonları.
- [ ] **Production ağ sınırı:** Compose backend ve frontend portlarını doğrudan host'a yayımlıyor; HTTPS/reverse proxy/sertifika ve güvenli dış erişim kurulum rehberi teslimatın parçası değil.

### P1 — ürün güvenilirliği ve tamamlanmamış akışlar

- [ ] Workspace daveti, davet token'ı ve kabul/iptal/süre sonu akışı yerine kayıtlı kullanıcıyı doğrudan ACTIVE üye yapıyor.
- [ ] Audit yazma hatası yakalanıp loglanıyor fakat ana işlem devam ediyor; kritik işlemlerde audit kaydının kaybolması ve işlemle atomik olmaması değerlendirilmeli.
- [ ] E-posta kuyruğunda retry/backoff/retention politikası ve gerçek SMTP teslimat testi doğrulanmalı.
- [ ] ML modeli sentetik ve çok küçük veriyle eğitilmiş. Gerçek iş verisiyle doğruluk/kalibrasyon kanıtı yok; bu nedenle ürün pazarlamasında tahmin doğruluğu veya yüzde olasılık iddiası yapılmamalı. Deneysel özellik olarak sunulmalı veya varsayılan olarak kapatılmalı.
- [ ] Task/project listeleme için pagination ve büyük veri performansı ölçülmeli.
- [ ] Android offline sync hata matrisi, token yenileme ve gerçek cihaz ağ koşulları uçtan uca test edilmeli.

### P2 — kalite ve alıcı deneyimi

- [ ] Backend genel lint borcu sıfırlanmalı; CI'da non-blocking lint adımı blocking hale getirilmeli.
- [ ] Unit/integration/e2e test kapsamı, coverage raporu ve kritik tenant izolasyonu testleri genişletilmeli.
- [ ] Root README, kurulum, yapılandırma referansı, mimari, API, troubleshooting, upgrade, backup/restore ve release notları hazırlanmalı.
- [ ] Lisans, üçüncü taraf lisans/attribution envanteri, destek politikası ve sürümleme hazırlanmalı.
- [ ] Release artefact'ları (web/backend/ML container'ları, Android release APK/AAB gerekiyorsa) tekrarlanabilir şekilde üretilip kontrol edilmeli.
- [ ] Demo verisi ve demo hesapları güvenli, isteğe bağlı ve production sırlarından ayrı olmalı.

## 3. Mevcut doğrulama kanıtı

22 Kasım 2026'da incelenen GitHub Actions run `44935718258` (commit `bc12dbce60f26fce69f190e6ff564d43f86d70e7`) beş işi de başarılı tamamladı:

- Android unit tests, debug build ve Room instrumented testleri: başarılı; instrumented testler 5/5.
- Frontend lint, TypeScript ve build: başarılı.
- Backend TypeScript, 25 unit test ve build: başarılı.
- ML API testleri: başarılı.
- Docker Compose config validation ve servis image build'leri: başarılı.

Sınırlamalar:
- Backend genel lint raporu 112 hata ve 7 uyarı gösteriyor; adım `continue-on-error` olduğu için CI yeşil kalıyor.
- Backend production dependency audit 0 açık buldu; bu tam güvenlik denetimi değildir.
- Compose image build, production runtime veya gerçek deployment testi değildir.
- Bu run temiz kurulum, HTTPS, backup/restore, gerçek SMTP, Android release signing veya gerçek kullanıcı senaryolarını kanıtlamaz.

## 4. Uygulama sırası ve kabul kapıları

1. **Satış tabanı ve güvenli varsayılanlar:** secret/config fail-fast, ortam değişkeni referansı, mobil oturum sözleşmesi, root README/lisans kararları.
2. **Kimlik ve tenant güvenliği:** access/refresh lifecycle tüm istemcilerde tutarlı; paralel refresh, logout, parola değişimi, silinmiş kullanıcı, rol ve cross-workspace erişim testleri.
3. **Ürün akışları:** kayıt, giriş, workspace, davet, proje, görev, yorum, audit ve bildirim akışları e2e.
4. **Production operasyonu:** reverse proxy/TLS, health/readiness, migration, kalıcı veri, yedekleme/geri yükleme, log/izleme, kaynak limitleri ve güncelleme/rollback.
5. **Kalite ve performans:** backend lint blocking, güvenlik testleri, pagination, yük ve mobil offline senaryoları.
6. **Satış paketi:** lisans/attribution, kurulum ve yönetim belgeleri, sürüm artefact'ları, demo, changelog ve destek kapsamı.

Her kapı için değişiklik → test → CI log incelemesi → bu belgedeki durum güncellemesi uygulanacak. Bir kapı geçmeden sonraki aşama tamamlanmış sayılmayacak.

## 5. Açık ürün kararları

- Lisans türü, pazaryeri ve ticari yeniden dağıtım/white-label hakları netleştirilecek; lisans metni hukuki inceleme gerektirebilir.
- Android uygulaması ilk ücretli paketin zorunlu parçası mı, yoksa bonus/roadmap bileşeni mi olacak? Mobil uygulama dahil edilecekse release signing ve API URL yapılandırması alıcıya teslim edilmeli.
- ML risk analizi ilk sürümde deneysel/opsiyonel olarak sunulacak; doğrulanmış model kalitesi olmadan satış vaadi yapılmayacak.

**Şimdiki karar: NO-GO.** P0 ve ilgili kabul testleri tamamlanmadan ürün pazaryerine yüklenmeyecek.


## 24 Kasım 2026 — satış hazırlığı ilerleme notu

### Son doğrulanan CI
- Branch commit'i `8528ea6cdba582793de357fdf6299b37ff678915` için GitHub Actions run [45415943640](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/45415943640) **5/5 başarılı**.
- Backend, frontend, ML, Android (unit + debug APK + instrumented Room tests) ve Docker Compose servis başlatma/healthcheck işleri başarılı.
- Bu kanıt CI ortamındaki test ve Compose smoke test kapsamındadır; gerçek müşteri sunucusunda production deployment veya gerçek web/Android kullanıcı yolculuğu değildir.

### Bu tarihte tamamlanan hazırlıklar
- Kök `README.md` eklendi: ürün bileşenleri, Docker quick start, ortam değişkenleri, migration, veri kalıcılığı, production HTTPS/reverse proxy uyarıları, Android release notları ve bilinen sınırlamalar anlatılıyor. README açıkça pre-release/NO-GO durumunu ve lisansın henüz seçilmediğini belirtiyor.
- Kullanıcı parola değiştirdiğinde parola hash güncellemesi ve tüm aktif refresh tokenların iptali aynı Prisma transaction içinde yapılıyor; ilgili unit test mevcut.
- E-posta kuyruğu için beş denemeli exponential backoff, tamamlanan/başarısız işler için bounded retention ayarlandı. Bu yapılandırma gerçek SMTP teslimat testi yerine geçmez.

### Sonraki engelleyiciler
- Son email queue retry değişikliği commit'i `06de1701d7ba184787b4f71d70006b663af04e88` için CI sonucu bekleniyor.
- Kök README kurulum adımları temiz bir makinede bağımsız olarak takip edilip doğrulanmalı.
- Gerçek tarayıcı ve Android cihaz/emülatörde kayıt → giriş → token yenileme → parola değiştirme → eski oturum reddi → çıkış akışları E2E olarak kanıtlanmalı.
- Redis tabanlı IP rate limiting eklendi ve CI'da test ediliyor; account-level brute-force/lockout politikası, gerçek reverse-proxy IP zinciri ve saldırı testi ayrıca doğrulanmalı. Production TLS, yedekleme/geri yükleme ve secret rotation belgeleri hâlâ açık.
- Lisans seçimi ve üçüncü taraf lisans/attribution envanteri tamamlanmalı; bu nedenle README lisans izni vermediğini açıkça söylüyor.
- Backend genel lint borcu ve tam dependency/security review hâlâ kapanmadı.

**GO/NO-GO: NO-GO.** README ve email retry iyileştirmeleri teslimat kalitesini artırır ancak gerçek deployment/E2E, lisans, güvenlik ve operasyon kabul kapıları tamamlanmadan satışa çıkarılmamalıdır.

## 24 Kasım 2026 — güvenlik ve gecikme kontrolü

### Bu oturumda branch'e uygulanan değişiklikler
- `AuthService` artık `JWT_SECRET` değerinin en az 32 byte olmasını zorunlu tutuyor; eksik veya kısa değerle token üretimi reddediliyor.
- `JwtStrategy` aynı minimum secret uzunluğunu uygulama başlangıcında doğruluyor; zayıf yapılandırma ile API'nin açılması engelleniyor.
- AuthService unit testlerine eksik ve zayıf JWT secret senaryoları eklendi.
- FastAPI ML istemcisini sağlayan NestJS `HttpModule` için 3 saniye timeout ve redirect kapatma eklendi. ML servisi core task akışını süresiz bekletemez.

### Henüz doğrulanmadı
- Değişiklikler GitHub dalına yazıldı ve dosyalar geri okunarak kontrol edildi; bu oturumda CI job sonucu alınmadı. Testlerin geçtiği iddia edilmiyor.
- 32 byte uzunluk kontrolü secret'ın kriptografik rastgeleliğini kanıtlamaz. Alıcı benzersiz, rastgele secret üretmelidir.
- ML timeout değişikliği unit/integration testinde ve çalışan Compose ortamında doğrulanmalıdır.

**GO/NO-GO: NO-GO devam ediyor.** Bu değişiklikler güvenli varsayılanları ve servis dayanıklılığını iyileştirir; gerçek kurulum/E2E, tenant izolasyonu, rate limiting, production TLS, backup/restore, lisans ve Codester paket kabul kapılarını kapatmaz.


## 25 Kasım 2026 — son CI doğrulaması

- Branch HEAD commit'i `2a7f14c3606cdeabc32a225272f3b42bcd937e76` için GitHub Actions run [45466529888](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/45466529888), ikinci denemede **5/5 job başarılı** tamamlandı.
- Backend test/build, frontend lint/typecheck/build, ML API testleri, Docker Compose image build + servis healthcheck ve Android unit test/debug APK/Room instrumented test job'ları başarılı.
- Android instrumented test job'ı ilk denemede hosted emulator/ADB başlatma ve instrumentation process crash nedeniyle başarısız olmuştu. Testi kaldırmadan aynı job yeniden çalıştırıldı ve ikinci deneme başarılı oldu.
- Bu CI sonucu 24 Kasım güvenlik değişikliklerinin build/test hattından geçtiğini gösterir. Gerçek tarayıcı + fiziksel cihaz E2E, temiz müşteri makinesinde bağımsız kurulum, production TLS, backup/restore, SMTP teslimatı veya lisans uygunluğu kanıtı değildir.

**Durum güncellemesi:** CI kabul kapısı bu commit için geçti. Satış kararı yine **NO-GO**; P0/P1 operasyon, mobil oturum E2E, rate limiting, lisans/attribution ve Codester teslim paketi açık.


## 25 Kasım 2026 — mobil kimlik akışı ve tenant sınırı kod incelemesi

### Koddan doğrulanan uygulamalar
- Android istemcisinde mobil login/refresh/logout API tanımları mevcut.
- Refresh token Android'de EncryptedSharedPreferences ile saklanıyor; OkHttp TokenAuthenticator ayrı bir refresh HTTP client kullanıyor, yenilenen token çiftini kaydediyor ve eşzamanlı 401 isteklerinde güncel access token'ı yeniden kullanmaya çalışıyor.
- Backend JWT stratejisi yalnızca tokenType: access içeren token'ları kabul ediyor; refresh token'lar bearer access token olarak kullanılamıyor.
- Task sorguları workspace ID ile sınırlandırılıyor; workspace guard aktif üyelik arıyor. Görev güncellemesi workspace ID + task ID + version koşullu atomik update kullanıyor.

### Açık doğrulamalar / bulgular
- Yukarıdaki mobil akış statik kod incelemesinde mevcut; gerçek API ile mobil E2E kanıtı henüz yok.
- Workspace davetleri artık mevcut hesap için PENDING üyelik, 7 günlük expiry, Workspaces ekranından kabul/ret ve BullMQ e-posta kuyruğu kullanıyor. Gerçek SMTP ve browser E2E testi açık; davet/kabul/ret/iptal audit kaydı ayrıca tamamlanmalı.
- Yeni refresh tokenlar SHA-256 fingerprint ile unique index üzerinden bulunuyor; eski bcrypt hash'li oturumlar geriye dönük uyumluluk için fallback taramasını kullanıyor. Expired/revoked kayıt temizliği ve oturum sayısı politikası ayrıca incelenmeli. Çok sayıda eski kayıt sorgu maliyetini artırabilir.
- Auth uçları ve workspace davet oluşturma Redis tabanlı atomik IP rate limit kullanıyor; Redis yoksa fail-closed davranıyor. Çoklu instance konfigürasyonu, proxy güven sınırı, account-level brute-force ve gerçek saldırı testi hâlâ doğrulanmalı.

Bu not statik kaynak kod incelemesidir; bu akışların çalıştırıldığı veya saldırı testinden geçtiği anlamına gelmez.


## 25 Kasım 2026 — güvenlik, davet ve performans uygulama turu

### Branch'e eklenen değişiklikler
- **Redis rate limiting:** Auth register/login/refresh/mobile login/refresh/logout ve workspace invitation creation endpoint'leri Redis Lua fixed-window sayacıyla korunuyor. Varsayılan 60 saniyede 10 istek; refresh uçlarında 30 istek. Limit aşımında 429, Redis kullanılamadığında 503 fail-closed. IP değeri key'e doğrudan yazılmıyor; hash kullanılıyor. `TRUST_PROXY_HOPS` ile reverse proxy güven sınırı yapılandırılabiliyor.
- **Workspace invitation lifecycle:** Yalnız kayıtlı kullanıcı hesabına davet, PENDING üyelik, 7 günlük expiry, kullanıcıya bağlı accept/decline, expired state, yönetici tarafından pending üyeliği kaldırarak iptal ve Workspaces inbox arayüzü eklendi. BullMQ davet e-postası kuyruğu 5 deneme/exponential backoff/retention politikasıyla kullanılıyor. Token-link ile yeni hesap kaydı ilk sürüm kapsamı değil.
- **Refresh token lookup:** Yeni tokenlar bcrypt yerine SHA-256 fingerprint ile saklanıp unique index üzerinden bulunuyor. Eski bcrypt oturumları için geriye dönük fallback korunuyor; yeni oturumlarda tüm token listesini bcrypt ile tarama yapılmıyor.
- **Veritabanı:** Davet expiry alanı, inviter ilişkisi ve pending-invitation sorguları için bileşik indeks migration'ı eklendi.
- **CI:** Backend 13 test suite / 46 test, TypeScript, strict lint gate; frontend lint/typecheck/build; ML testleri; Android unit/debug/instrumented testleri; Docker Compose image build ve servis healthcheck kontrolleri son doğrulama turunda başarılı oldu. Bu kanıt yalnız CI ortamındaki otomatik kontrollerdir.

### Henüz satış onayı vermeyen açık kapılar
- Gerçek SMTP hesabıyla davet e-postası teslimatı ve retry davranışı uçtan uca test edilmedi.
- Tarayıcıda kayıt/giriş/refresh/password change/logout ve workspace invite/accept/decline akışları E2E olarak doğrulanmalı.
- Android'de gerçek API ile refresh rotation, eşzamanlı 401, offline queue, logout ve fiziksel cihaz testi yapılmalı.
- Davet, üyelik rolü ve güvenlik olayları için audit log kapsamı tamamlanmalı; transactional outbox değerlendirilmelidir.
- Backend genel lint borcu hâlâ migration/non-blocking durumunda; tam dependency/SBOM ve güvenlik incelemesi, TLS, backup/restore, secret rotation, lisans ve üçüncü taraf attribution açık.

**GO/NO-GO: NO-GO.** Otomatik CI kapıları geçilmiş olsa da gerçek müşteri kurulum/E2E, SMTP, audit, operasyon ve marketplace lisans kapıları tamamlanmadan Codester'a yükleme yapılmamalı.


## 25 Kasım 2026 — mevcut HEAD için son doğrulama durumu

- İnceleme anındaki PR HEAD: `fbb772b236baca3aa30dc91c7262addcc30453ec`.
- GitHub Actions run [45682351429](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/45682351429) bu HEAD için **devam ediyor**; henüz 5/5 başarılı sonucu yok.
- İş durumu: ML API testleri ve `pip-audit` başarılı. Backend TypeScript kontrolü devam ediyor; test/build/npm audit henüz başlamamış. Frontend lint ve typecheck başarılı, build devam ediyor; npm audit bekliyor. Android unit testleri devam ediyor; APK ve instrumented test adımları bekliyor. Docker Compose config doğrulaması başarılı; image build devam ediyor; servis healthcheck henüz başlamamış.
- CI workflow'unda backend genel lint adımı `continue-on-error: true`; dolayısıyla job başarılı olsa bile genel backend lint borcu kapanmış sayılmaz. Yeni güvenlik/davet modüllerine özel ESLint adımı blocking.
- Kök README mevcut ve Docker kurulum/production uyarılarını içeriyor. Ancak lisans seçilmemiş; README de açıkça lisansın henüz verilmediğini belirtiyor. Bu nedenle Codester dağıtım izni varmış gibi davranılamaz.
- PR değişiklik listesinde `.env` silinmiş; diff içeriğinde yalnızca örnek/değiştirilebilir parola değerleri görünüyor. Yine de geçmişte gerçek bir sır kullanıldıysa rotasyon gerekir. `.gitignore` artık `.env`, Python cache ve Android IDE dosyalarını dışlıyor; ilgili IDE/cache dosyaları PR'da silinmiş.

**Bu aşamadaki karar: NO-GO.** CI tamamlanmadan test sonucu ilan edilmeyecek. CI yeşil olsa bile gerçek kullanıcı E2E, temiz kurulumun bağımsız kabulü, TLS/reverse proxy, backup/restore, gerçek SMTP, lisans/attribution ve release paketi ayrıca kapanmalı.


## 25 Kasım 2026 — CI run 45682776849 / commit 86582cc

- Run: [TaskFlow CI #360](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/45682776849).
- Son kontrol anında run devam ediyordu; tamamlanmış sonuç olarak raporlanmamalı.
- ML API tests ve `pip-audit`: SUCCESS.
- Backend: security/invitation modüllerinin hedefli ESLint adımı tamamlandı; genel lint baseline non-blocking çalışıyor, build adımı başlamıştı. TypeScript/test/audit adımları henüz sonuçlanmamıştı.
- Frontend: `npm ci` sürüyordu; lint/typecheck/build/audit henüz tamamlanmamıştı.
- Android: unit testler sürüyordu; debug APK ve instrumented Room testleri bekliyordu.
- Docker: Compose config doğrulandı; tüm image build işlemi sürüyordu; runtime healthcheck henüz başlamamıştı.

### Repo hijyeni ve sır geçmişi
- Güncel `.gitignore` `.env`, `.env.*` (örnek dosya hariç), Python bytecode/cache, Android `.idea`, Gradle/build ve Node artefact'larını dışlıyor.
- `.env.example` yalnızca değiştirilmesi gereken örnek değerler içeriyor; `JWT_SECRET` için en az 32 rastgele byte, DB parolası ve Redis ayarları belgelenmiş.
- Tarihsel denetim notu, geçmiş `.env` dosyasında placeholder/sample değerleri bulunduğunu kaydediyor; bu tek başına canlı sır sızdığını kanıtlamaz. Ancak `REDIS_PASSWORD` örnek değeri daha önce sabit bir parola biçimindeydi. Bu değer herhangi bir gerçek ortamda kullanıldıysa döndürülmeli. Tam geçmiş secret scan ve history rewrite gerekip gerekmediği ayrıca doğrulanmalı; mevcut connector incelemesi tüm git objelerinde secret scanner çalıştırmış değildir.

### Paketleme kararı
- README kendi ifadesiyle ürünü hâlâ geliştirme aşamasında tanımlıyor ve hiçbir lisans seçilmediğini söylüyor.
- Ticari lisans ve third-party notice envanteri olmadan Codester'a yeniden dağıtım/satış yetkisi veren bir ZIP hazırlanamaz.
- Şu anki CI workflow'u gerçek tarayıcı E2E, Android gerçek backend E2E, SMTP teslimatı veya backup/restore testi çalıştırmıyor.

**Karar: NO-GO.** Bu run tamamlanmadan CI sonucu ilan edilmez; CI geçse dahi lisans, gerçek kullanıcı kabulü, sır taraması, operasyonel kontroller ve final ZIP inspection ayrı kapılardır.


## 25 Kasım 2026 — pending CI ve main analiz senkronizasyonu

- PR HEAD `5849609ad0b6c36b7b40b91ee7fc6003c97c5b9f` için run [45683129340](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/45683129340) oluşturuldu; inceleme anında `pending`, job sonuçları henüz alınamadı. Bu nedenle bu HEAD için CI PASS iddiası yok.
- `main/analysis/go_live.md` dosyasına remediation dalındaki güncel kod incelemesini ayrı tarihli ek olarak kaydettim. Başlangıç denetimi korunmuştur; remediation branch main'e merge edilmemiştir.
- README ürünün geliştirme aşamasında olduğunu, ML modelinin deneysel/sentetik veri temelli olduğunu ve tahmin doğruluğu iddiası yapılmadığını açıklıyor. `.env.example` örnek değerleri açıkça değiştirilmesi gereken placeholder olarak tanımlıyor.
- Marketplace lisansı ve üçüncü taraf attribution listesi bulunmadan Codester dağıtım ZIP'i yayınlanamaz. Lisans metni bu aşamada uydurulmayacak.
- Backend genel lint CI adımı non-blocking olduğundan tam lint temizliği ayrı bir kabul kapısıdır.

**Karar: NO-GO.** Pending run tamamlanmadan CI sonucu açıklanmayacak. Gerçek E2E/SMTP/backup-restore/TLS/secret-history scan/lisans ve paketleme işleri açık.


## 25 Kasım 2026 — CI run 45683129340 ara sonuç

- Frontend job tamamlandı: lint, TypeScript, build ve `npm audit --omit=dev --audit-level=high` başarılı.
- ML job tamamlandı: pytest ve `pip-audit` başarılı.
- Android job başarısız: `./gradlew testDebugUnitTest` aşamasında `org.jetbrains.kotlin.plugin.compose` sürüm `2.2.10` plugin marker çözümlenemedi; unit testler başlamadı, APK ve instrumented test adımları atlandı. Plugin Portal'da bu sürümün yayımlı olduğu doğrulandığı için başarısızlık şimdilik kod/test assertion hatası olarak sınıflandırılmıyor; Gradle plugin resolution/runner erişimi olarak ele alınıyor.
- Backend job'ı inceleme anında non-blocking genel lint aşamasındaydı; TypeScript/Jest/build/audit henüz sonuçlanmamıştı.
- Docker Compose config doğrulandı; image build devam ediyordu, runtime healthcheck başlamamıştı.
- Android job yeniden çalıştırma isteği, workflow hâlâ çalıştığı için GitHub tarafından reddedildi. Run tamamlandıktan sonra yalnız başarısız job yeniden denenecek.

Bu run tamamlanmadan CI PASS denmeyecek. Backend lint non-blocking kalmaya devam ediyor; lisans, E2E, SMTP, TLS, backup/restore ve release ZIP kapıları da açık.


## 25 Kasım 2026 — Android Gradle plugin resolution düzeltmesi

- Run `45683129340` Android job'ında `org.jetbrains.kotlin.plugin.compose:2.2.10` plugin marker çözümlemesi başarısız oldu; unit testler başlamadı.
- `android/settings.gradle.kts` içinde Compose Compiler plugin ID'sini Kotlin'in `org.jetbrains.kotlin:compose-compiler-gradle-plugin:<requested.version>` modülüne eşleyen `pluginManagement.resolutionStrategy` eklendi. Bu, plugin marker artifact çözümlemesini atlayıp gerçek plugin modülünü Maven Central üzerinden bulmayı hedefler.
- Kod değişikliği commit `7eacdf0a8de4e1ceee2c294d2cc3220289a3f66c` üzerinde. Bu düzeltmenin CI sonucu henüz yok; yeni bir PR workflow çalışması bekleniyor/doğrulanacak.
- Run `45683129340` için frontend, backend ve ML job'ları başarılı; Android başarısız. Docker image build inceleme anında sürüyordu. Bu run'ın sonucu 5/5 değildir.
