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

- [ ] **Android oturum yenileme:** Android yalnızca access token alıyor; refresh endpoint'i/cookie akışı istemcide yok. Access token 15 dakika sonra sona erdiğinde mobil istemcinin oturumu yenileme yolu bulunmuyor. Mobil logout da sunucudaki refresh oturumunu iptal etmiyor.
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
