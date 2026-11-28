> **Güncel durum notu — 27 Kasım 2026:** C-1, H-1 ve M-5 `fix/go-live-blockers` dalında kapatıldı ve CI ile doğrulandı; ayrıntılar belgenin sonundaki **"27 Kasım 2026 — C-1, M-5 ve H-1 kapanışı"** bölümündedir. Güncel karar hâlâ **NO-GO**.

> **Güncel durum notu — 26 Kasım 2026:** Bu sayfanın başındaki 18 Kasım bloğu ve sonraki tarihli bölümler tarihsel kayıttır; orada "açık" görünen bazı bulgular (refresh yarışı, parola sonrası oturum iptali, doğrudan ACTIVE davet, rate limit ve Helmet/CSP eksikliği) sonradan kapatılmıştır. En güncel değerlendirme ve kanıtlar için belgenin sonundaki **"26 Kasım 2026 — Güvenlik uygulamaları sonrası değerlendirme"** bölümüne bakın. Güncel karar: **NO-GO**.

> **Kaynak kod yeniden kontrolü — 18 Kasım 2026 (latest branch):**
>
> Bu ek, yukarıdaki tarihsel ilk denetim notlarının yerine geçmez; ancak aşağıdaki noktaları güncel branch için düzeltir:
>
> **Düzeltildi / artık mevcut:**
> - Android offline status değişikliği `TaskViewModel.queueStatusChange` ile `PendingOperationEntity` olarak Room'a yazılıyor; işlem `ownerUserId` ile hesaba bağlanıyor ve `SyncScheduler` unique WorkManager işi başlatıyor.
> - `SyncWorker` yalnızca aktif oturumun kullanıcısına ait işlemleri alıyor, açık Authorization header ile PATCH gönderiyor; 2xx sonrası kuyruğu siliyor. 401 `BLOCKED_AUTH`, 403 `FAILED`, 409 `CONFLICT`, 408/429/5xx ve exception retry olarak ayrılıyor.
> - Android login başarılı olunca token + userId kaydediliyor ve o hesaba ait BLOCKED_AUTH işlemleri yeniden kuyruğa alınıyor. Logout yerel token/userId'yi temizliyor.
> - Android API URL artık `BuildConfig.API_BASE_URL` üzerinden; Authorization/Cookie log header'ları redacted.
> - Backend task version güncellemesi `updateMany` koşullu compare-and-swap kullanıyor; stale yarışta 409 dönüyor. İlgili unit testler mevcut.
> - Task detay endpoint'i workspace kapsamıyla tek kayıt getiriyor; frontend modal bunu kullanıyor.
> - VIEWER task create/update ve comment create işlemlerinden controller'da engelleniyor. Project create/delete OWNER/ADMIN ile sınırlandırılmış.
> - ADMIN'in OWNER veya ADMIN rolü davet etmesi engellenmiş; son OWNER'ın rolünü düşürme/üyeliğini silme koruması mevcut.
> - NotificationsModule AppModule'a bağlı; TaskAssignedListener TasksModule provider'ı; email queue ve EmailProcessor kod bağlantısı mevcut. HTML e-posta alanları escape ediliyor.
> - ML API artık sahte sabit `risk_score` üretmiyor; `null` döndürüyor. Model card altı sentetik örnekle eğitildiğini ve deneysel olduğunu açıkça belirtiyor. UI bunu yüzde olasılık diye göstermiyor.
>
> **Hâlâ açık / test kanıtı yetersiz:**
> - AuthService refresh rotasyonu token'ı önce okuyup sonra ayrı update ile revoke ediyor; transaction/CAS yok. Hata catch'i `TOKEN_THEFT_DETECTED` dahil tüm hataları `INVALID_REFRESH_TOKEN` olarak maskeliyor.
> - Parola değişimi yalnız passwordHash güncelliyor; kullanıcının aktif refresh token'ları revoke edilmiyor.
> - Android yalnız access token alıyor; AuthApiService'de refresh/logout çağrısı veya refresh-cookie yönetimi yok. Access token 15 dakika sonra expire olduğunda Android yenileme yapamıyor. Android logout yalnızca yerel tokenı siliyor; backend refresh token kayıtlarını revoke etmiyor.
> - Android offline kuyruğunda 401 `BLOCKED_AUTH` olur; login sonrası requeue var, fakat access token yenileme mekanizması yok. Uzun süren oturumda kullanıcı tekrar login olmak zorunda kalabilir.
> - Bildirim listener'ı ve processor bağlanmış olsa da `emailQueue.add` çağrısında attempts/backoff/retention ayarı verilmemiş; BullMQ varsayılanı ile başarısız teslimatın otomatik retry garantisi yok. Gerçek SMTP teslimatı doğrulanmadı; transporter her job'da oluşturuluyor.
> - Workspace daveti hâlâ önceden kayıtlı kullanıcıyı doğrudan ACTIVE yapıyor; token/expiry/accept/revoke akışı yok. `workspace.member_invited` event'inin karşılayan listener'ı görünmüyor.
> - AuditService yazma hatasını yakalayıp yutuyor; task/comment ana işlemi başarılı olsa bile audit kaydı kaybolabilir. Transactional outbox yok.
> - Task oluşturma/güncelleme ML çağrısını senkron bekliyor; AiService HTTP timeout tanımlamıyor. ML erişilemezse UNAVAILABLE sonucu saklanabiliyor; fakat yavaş/askıda servis API yanıtını bekletebilir.
> - Frontend'de 401 refresh mekanizması var ancak refresh token rotasyonu eşzamanlı sekmeler/istemciler açısından backend tarafında atomik değil. Login state yalnız Zustand belleğinde tutuluyor; sayfa yenilemesinde state'in nasıl geri kurulduğu ayrıca test edilmeli.
> - Task/project listelerinde pagination görünmüyor. Task archive/delete schema alanları var fakat TasksController'da archive/delete/restore endpoint'i görünmüyor.
> - Backend testleri task CAS ve workspace guard/rol kurallarının bazılarını kapsıyor; AuthService refresh paralelliği, parola sonrası revoke, notification retry/delivery, cross-tenant uçtan uca senaryolar ve Android Worker HTTP hata matrisi için özel test kanıtı eksik.
>
> **Güncel teknik öncelik önerisi:** Önce auth/session yaşam döngüsü (özellikle refresh CAS + password revoke + Android refresh/logout sözleşmesi), ardından event/audit/notification güvenilirliği ve ML timeout davranışı. Bunlar tamamlanmadan yeni UI özelliklerine geçmeyelim.
>
> ---
>
> **Güncel doğrulama — 18 Kasım 2026:** Aşağıdaki ilk denetim bölümleri tarihsel başlangıç durumunu ve o tarihteki bulguları korur. Branch'te yapılan sonraki düzeltmeler için en güncel kanıt:
> - Branch: `fix/go-live-blockers`
> - Doğrulanan commit: `b7063ad86e7a0ccb744ed46bd1f50716abcccd6e`
> - GitHub Actions run: [#44262570835](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/44262570835)
> - **5/5 job başarılı:** Android unit tests + debug build + instrumented Room queue tests; frontend lint/typecheck/build/audit; Docker Compose validation + tüm servis image build'leri; ML pytest + pip-audit; backend TypeScript/Jest/build/audit.
> - Android instrumented test adımı artık `google_atd` Android Test Device imajıyla başarılı. Önceki `device offline`, emulator shell timeout ve `Unknown API Level` hataları test assertion hatası değil, CI emulator/ADB ortamı sorunlarıydı.
> - Backend'in yeni authorization testleri için lint blocking. Mevcut backend lint baseline non-blocking kaldığından tüm backend lint borcu kapanmış değildir.
> - Bu run test/build/image build kanıtıdır; temiz makinede Compose runtime, migration, gerçek Web/Android kullanıcı yolculukları, release signing, production deployment, backup/restore veya ML model kalitesini kanıtlamaz.
>
> **Güncel karar: NO-GO devam ediyor.** CI yeşil olsa da ürün kabul kriterleri ve operasyonel kontroller tamamlanmış değildir. Bu belgedeki “ilk denetim” bölümlerini güncel branch durumuyla karıştırmayın; bir bulgu branch'te düzeltildiyse aşağıdaki güncel doğrulama ve ilgili commit/test kanıtı esas alınmalıdır.
>
> ---
>
> **Durum güncellemesi — 16 Kasım 2026:** İlk denetim bulguları aşağıda, denetlenen başlangıç commit'i main / 31e8554faef5b0fa6a2c3418966226ae94efc9a1 esas alınarak korunmuştur. Düzeltmeler fix/go-live-blockers dalında yapılmıştır; bu dal henüz main dalına birleştirilmemiştir.
>
> **CI doğrulaması — run #69, commit ae95093bd70136c2f5f39fe81a096a8dc9ccad33:**
> - Backend: npm ci, Prisma generate, targeted authorization lint, TypeScript, Jest, build ve production audit başarılı. Genel backend lint borcu (169 error / 21 warning) hâlâ geçici non-blocking; kapatılmış değildir.
> - Frontend: npm ci, lint, typecheck, production build ve production audit başarılı.
> - ML: pytest (3 passed) ve pip-audit başarılı.
> - Docker: Compose config doğrulaması ve tüm servis image build'leri başarılı.
> - Android: unit testler, assembleDebug ve connectedDebugAndroidTest başarılı. Instrumented testler 4/4 geçti; önceki başarısızlık ExampleInstrumentedTest.kt:22 içindeki eski package assertion'ıydı. Assertion, commit 219aa0559ec3d0f5457279974e4d40f9d50c7947 ile düzeltildi. Emulator loglarında ADB/izin uyarıları görüldü ancak test adımı başarılı tamamlandı.
> - CI run #69 tüm 5 işi başarıyla tamamladı. Bu, branch üzerindeki build/test kapısının geçtiğini gösterir; production deployment, gerçek kullanıcı akışları, release signing ve operasyonel hazırlık doğrulaması değildir.
>
> **İlk turda yapılan başlıca düzeltmeler:** ADMIN'in OWNER/ADMIN rolü ataması engellendi; invite/role DTO validation eklendi; VIEWER task write işlemlerinden engellendi; root .env repodan kaldırıldı ve ignore dosyaları eklendi; backend/frontend/ML Dockerfile ve Compose servisleri, healthcheck ve migration job eklendi; Redis password bağlantısı ve CORS allowlist yapılandırıldı; Android API URL/cleartext ayrımı ve offline worker hata durumları iyileştirildi; dependency lockfile'lar güncellendi.
>
> **GO/NO-GO kararı hâlâ NO-GO.** Başarılı CI, tek başına satılabilir ürün veya production deployment kanıtı değildir. Android instrumented test sonucu, release APK build/signing, temiz makinede docker compose up sonrası gerçek DB migration ve login→task→ML→notification smoke testi, yedekleme/geri yükleme, dış erişim/HTTPS ve alıcı dokümantasyonu ayrıca doğrulanmalıdır. Offline queue'ya kayıt ekleme ve WorkManager enqueue akışı uçtan uca doğrulanmış değildir. ML modeli yalnızca az sayıda sentetik örnekle eğitilmiştir ve risk_score hâlâ sabit eşlemeyle üretilmektedir; satışta gerçek tahmin doğruluğu iddiası yapılmamalıdır.
>
> **Sırlar:** .env geçmişte public Git geçmişinde bulunmuştu. Değerlerin gerçek ortamda kullanılmış olma ihtimali varsa hemen rotate edilmeli; geçmişi temizlemek için ayrıca history rewrite ve tüm contributor klonlarının yenilenmesi gerekir.
>
> **Dal durumu:** Bu değişiklikler fix/go-live-blockers dalında. main'e merge edilmeden ve yukarıdaki kalan kontroller tamamlanmadan satış paketini yayımlama.
>
> ---
>

# TaskFlow — Yayına Çıkış ve Teslim Rehberi

**Son Güncelleme:** 16 Kasım 2026  
**Depo:** https://github.com/busraknya/taskflow-ai-full-project  
**Denetlenen commit:** main / 31e8554faef5b0fa6a2c3418966226ae94efc9a1  
**Kapsam:** Android, NestJS + Prisma, Next.js, FastAPI + scikit-learn, Docker Compose

## İçindekiler

| Bölüm | Konu |
|---|---|
| 1 | Yönetici özeti ve GO/NO-GO |
| 2 | Güvenlik denetimi |
| 3 | Performans ve kaynak yönetimi |
| 4 | Mimari ve iş akışları |
| 5 | Test ve kalite kapısı |
| 6 | Deployment |
| 7 | Alıcı deneyimi ve dokümantasyon |
| 8 | Kod temizliği ve teslim paketi |
| 9 | Öncelikli aksiyon planı |
| Ek A | Doğrulanamayan kontroller |

---

## 1. YÖNETİCİ ÖZETİ VE GO/NO-GO KARARI

TaskFlow; multi-tenant workspace, proje, görev, yorum, aktivite kaydı ve AI risk skorlama hedefleyen dört parçalı bir ürün. NestJS backend'de JWT, Prisma/PostgreSQL, Redis/BullMQ ve FastAPI ML istemcisi; Next.js'te workspace/Kanban arayüzü; Android'de Compose login, workspace ve task ekranları bulunuyor. DTO validation, bcrypt parola hashleme, refresh token hash saklama ve workspace membership kontrolü iyi başlangıçlar. Ancak kök README/lisans yok; Compose backend/frontend'i çalıştırmıyor. Yetkilendirmede rol yükseltme açığı; Android'de emulator URL'si ve veri kaybettiren offline worker; bildirim modül bağlantısı eksikliği; sentetik ve doğrulanmamış ML modeli var. Testler başlangıç örnekleri seviyesinde. Build, test, dependency audit ve gerçek Compose çalıştırması bu ortamda doğrulanamadı.

<badge color="danger">NO-GO</badge> **Mevcut commit ile ücretli pazaryeri dağıtımı veya “tek komutla production-ready SaaS” vaadi verilmemeli.**

### Engelleyiciler

| Bulgu | Efor |
|---|---:|
| ADMIN davetiyle OWNER rolü atayabiliyor; rol doğrulaması yok | S |
| Compose backend/frontend'i başlatmıyor; Redis env sözleşmesi uyumsuz | M |
| Android emulator-only HTTP URL'sine sabit; gerçek cihaz/production bağlantısı yok | S |
| Android SyncWorker API'ye göndermeden offline işlemi siliyor | M |
| TaskAssignedListener ve EmailProcessor modüllere bağlanmamış | S |
| Migration, readiness, güvenli production config ve tek komut kurulum akışı yok | M |
| Alıcıya yönelik kurulum dokümantasyonu/teslim paketi yok | M |

Yayın öncesi: .env'i kaldır/rotate et; refresh race ve parola sonrası session revoke düzelt; VIEWER yazma yetkisini kapat; CORS/rate limit/Helmet/CSP/HTTPS ekle; Android token logging ve cleartext'i kapat; ML modelini gerçek veride doğrula; test ve dependency audit çalıştır; README/lisans/API/release belgelerini hazırla.

Yayın sonrası: pagination, index/cache, observability, Lighthouse/Profiler, ML drift ve model versioning.

---

## 2. GÜVENLİK DENETİMİ

### 2.1 Sırlar ve depo hijyeni

**[ÖNEM: Yüksek] Kök .env public repoda izleniyor** — Kanıt: main tree'de /.env (410 B) var. İçerik POSTGRES_PASSWORD=change_me_in_production, JWT_SECRET=change_me_to_a_very_secure_random_string_min_32_chars, REDIS_PASSWORD=my_secure_redis_password_123 içeriyor. GitHub commit geçmişinde 26 Eylül 2026 tarihli .env ekleme commit'i ve placeholder değerleri içeren diff bulundu. — Neden sorun: canlı sır olduğu kanıtlanmadı; ancak alıcı bu dosyayı production'da kullanırsa JWT anahtarı tahmin edilebilir ve DB parolası bilinir. — Düzeltme: .env'i repodan kaldır, root .gitignore'a ekle, yalnız .env.example tut. Kullanıldıysa credential'ları döndür. Gerçek secret geçmişte bulunduysa git geçmişini temizle.

**[ÖNEM: Yüksek] Root .gitignore yok; IDE/bytecode dosyaları commit edilmiş** — Kanıt: root .gitignore yok; android/.idea altındaki dosyalar ve ml-service/__pycache__/main.cpython-311.pyc izleniyor. ml-service/models/risk_model_v1.joblib (117,260 B) de izleniyor. — Neden sorun: geçici/kişisel dosyalar pakete girer. Model binary'si runtime girdisi olabilir; otomatik silinmemeli. — Düzeltme: .env*, *.pem, *.key, *.keystore, node_modules/, **/build/, **/.gradle/, **/.idea/, __pycache__/, *.py[cod], .venv/, .next/, dist/, coverage/, logs/ ignore et; tracked .idea/pycache'i kaldır. Model teslim edilecekse model card/checksum ekle.

**[ÖNEM: Yüksek] .env.example eksik ve çelişkili** — Kanıt: REDIS_URL iki kez yazılmış; REDIS_HOST/PORT yok. app.module.ts:26-30 bunları zorunlu bekliyor. ai.service.ts:23 ML_SERVICE_URL; email.processor.ts:14-25 SMTP_HOST/PORT/USER/PASSWORD/FROM; frontend/src/lib/api.ts:5 NEXT_PUBLIC_API_URL okuyor. — Neden sorun: alıcı örnek config'le kurulum yapamaz. — Düzeltme: tek env şeması; zorunlu/opsiyonel, servis, örnek ve açıklama. REDIS_URL veya REDIS_HOST/PORT'tan birini standardize et.

### 2.2 Kimlik doğrulama ve yetkilendirme

**[ÖNEM: Kritik] ADMIN davetiyle OWNER rolü atayabiliyor** — Kanıt: workspaces.service.ts:86-117; satır 91 ADMIN/OWNER davet edebilir, satır 113 istemciden gelen role doğrudan kaydedilir. workspaces.controller.ts:25-33 düz body nesnesi alıyor. — Neden sorun: ADMIN, davet ettiği kullanıcıya OWNER rolü vererek owner-only rol yönetimini atlar. — Düzeltme: InviteMemberDto; role yalnız ADMIN/MEMBER/VIEWER; OWNER yalnız ayrı OWNER transfer akışıyla atanmalı.

**[ÖNEM: Yüksek] VIEWER görev yazma işlemlerinden engellenmiyor** — Kanıt: tasks.controller.ts:8-10 AuthGuard + WorkspaceMemberGuard; workspace-member.guard.ts:26-40 yalnız ACTIVE membership kontrol ediyor. tasks.service.ts:43-99 create ve 122-195 update rol kontrolü yapmıyor. — Neden sorun: VIEWER dahil her aktif üye task oluşturup güncelleyebilir. — Düzeltme: merkezi RBAC policy; OWNER/ADMIN/MEMBER/VIEWER matrisi; VIEWER için GET dışında yazma reddi.

**[ÖNEM: Yüksek] Bazı body nesneleri runtime validation almıyor** — Kanıt: workspaces.controller.ts:30-32,47-49 ve users.controller.ts:18-21 düz TypeScript body tipleri. — Neden sorun: Global ValidationPipe DTO metadata'sı olmayan nesnelerde enum/boolean/email kontrolü yapmaz. — Düzeltme: InviteMemberDto, UpdateMemberRoleDto, UpdateNotificationPreferenceDto; class-validator kuralları; UUID path/query için ParseUUIDPipe.

**[ÖNEM: Yüksek] Parola değişiminde refresh tokenlar revoke edilmiyor** — Kanıt: users.service.ts:33-50 yalnız passwordHash güncelliyor; auth.service.ts:127-132 logout'ta refresh token revoke ediyor. — Neden sorun: ele geçirilmiş refresh token parola değişiminden sonra kullanılabilir. — Düzeltme: parola değişiminde tüm aktif refresh tokenları revoke et; gerekirse session version/security stamp kullan.

**[ÖNEM: Yüksek] Refresh token rotasyonu yarış koşuluna açık** — Kanıt: auth.service.ts:89-100 aktif tokenları getirip hash karşılaştırıyor; 113-118 eşleşeni revoked yapıp yeni token üretiyor. Update revokedAt IS NULL koşuluyla atomik değil, transaction içinde değil. — Neden sorun: eşzamanlı iki refresh aynı tokenı geçerli görüp ayrı token üretebilir. — Düzeltme: transaction + updateMany compare-and-swap; count 1 değilse reddet; paralel refresh testi ekle.

**[ÖNEM: Orta] TOKEN_THEFT_DETECTED kodu maskeleniyor** — Kanıt: auth.service.ts:102-110 bu hatayı fırlatıyor; 119-124 catch tüm hataları INVALID_REFRESH_TOKEN'a çeviriyor. — Neden sorun: token reuse olayı ayırt edilemez. — Düzeltme: beklenen HttpException'ları yeniden fırlat; beklenmeyen hataları normalize et ve güvenli audit log üret.

**[ÖNEM: Orta] JWT modülünde bilinen fallback secret var** — Kanıt: auth.module.ts:11-14 process.env.JWT_SECRET || 'super-secret-key-change-it'. AuthService/JwtStrategy secret yoksa hata veriyor; fallback'in mevcut token üretiminde kullanıldığı kanıtlanmadı. — Neden sorun: başka bir kod yolu bilinen default'u kullanabilir. — Düzeltme: fallback'i kaldır; ConfigService ile fail-fast.

### 2.3 Validation, injection ve dosya erişimi

**[ÖNEM: Orta] Metin alanlarında boyut sınırları eksik** — Kanıt: CreateTaskDto title/description MaxLength içermiyor; CreateCommentDto.body yalnız IsString/MinLength; RegisterDto.fullName yalnız IsString. FastAPI TaskFeatures main.py:31-35 sayısal sınır tanımlamıyor. — Neden sorun: aşırı büyük payload ve anlamsız feature değerleri. — Düzeltme: MaxLength/IsNotEmpty/Min/Max, Pydantic Field ge/le ve body size limit.

**[ÖNEM: Orta] E-posta HTML template kullanıcı girdisini escape etmiyor** — Kanıt: email.processor.ts:28-29 fullName/taskTitle HTML içine doğrudan ekleniyor. — Neden sorun: kullanıcı kontrollü alanlar HTML markup enjekte edebilir. — Düzeltme: HTML escaping yapan template engine; subject/header için CRLF validation.

**[ÖNEM: Düşük] İncelenen kodda raw SQL/NoSQL kullanımı görülmedi** — Kanıt: incelenen servisler Prisma Client kullanıyor; GitHub code search $queryRaw sorgusu sonuç döndürmedi. Yerel tam depo grep'i çalıştırılamadığı için tüm depo için kesin yokluk iddiası değildir. — Düzeltme: CI'da $queryRawUnsafe, shell/eval ve dosya yolu kullanımlarını tara; raw SQL gerekirse parametreli kullan.

**[ÖNEM: Düşük] Upload/path traversal yüzeyi görülmedi** — Kanıt: incelenen controller/tree'de upload endpoint'i veya dosya yazma modülü yok. — Düzeltme: upload eklenirse MIME/size allowlist, random object key ve private storage.

### 2.4 OWASP Top 10

| OWASP | Sonuç |
|---|---|
| A01 Broken Access Control | Kritik: ADMIN OWNER atayabiliyor; VIEWER görev yazabiliyor. |
| A02 Cryptographic Failures | Yüksek: placeholder secret'lar; Android HTTP ve log token riski. Gerçek secret sızıntısı kanıtlanmadı. |
| A03 Injection | Orta: HTML e-posta escaping yok; SQL injection kanıtı görülmedi. |
| A04 Insecure Design | Yüksek: davet accept akışı yok; refresh race; outbox/idempotency yok. |
| A05 Security Misconfiguration | Yüksek: localhost CORS, tracked .env, port publish, cleartext, Helmet/CSP yok. |
| A06 Vulnerable Components | Doğrulanamadı: npm/pip/Gradle audit çalıştırılmadı. |
| A07 Auth Failures | Yüksek: rate limit yok; password change revoke yok; Android refresh/logout eksik. |
| A08 Software/Data Integrity | Orta: model binary repoda; build'de train; artifact provenance yok. |
| A09 Logging/Monitoring | Yüksek: console log; exception filter Error.message döndürebiliyor. |
| A10 SSRF | Kanıtlanmış kullanıcı kontrollü SSRF yüzeyi görülmedi; ML URL env'den geliyor. |

### 2.5 CORS, rate limit, headers, HTTPS, hata mesajı

**[ÖNEM: Yüksek] CORS localhost'a sabit** — Kanıt: main.ts:10-13 origin http://localhost:3000. — Neden sorun: production frontend başka domain'deyse browser API çağrıları CORS'ta engellenir. — Düzeltme: CORS_ORIGINS allowlist; credentials açıkken wildcard kullanma.

**[ÖNEM: Yüksek] Rate limiting görünmüyor** — Kanıt: AppModule/main.ts/AuthController incelendi; ThrottlerModule/guard veya login limit yok. — Neden sorun: brute force ve account creation abuse. — Düzeltme: login/register/refresh IP + hesap bazlı limit, artan gecikme ve audit log.

**[ÖNEM: Yüksek] Helmet/CSP/security headers yok** — Kanıt: main.ts'te Helmet yok; next.config.ts boş. — Düzeltme: Helmet; Next.js CSP, HSTS (HTTPS), X-Content-Type-Options, Referrer-Policy ve frame-ancestors.

**[ÖNEM: Yüksek] Android cleartext ve Authorization log riski** — Kanıt: AndroidManifest.xml:6-8 usesCleartextTraffic=true; ApiClient.kt:12 http://10.0.2.2:4000/api/v1/; ApiClient.kt:19-21 HEADERS logging, Authorization redact yok. — Neden sorun: emulator URL gerçek cihazda çalışmaz; HTTP tokenı korumaz; logcat'e bearer token yazılabilir. — Düzeltme: BuildConfig URL; release HTTPS + cleartext false; release'te logging kapalı, debug'da Authorization/Cookie redact.

**[ÖNEM: Orta] Exception filter beklenmeyen Error.message değerini döndürüyor** — Kanıt: http-exception.filter.ts:33-35. — Neden sorun: DB/driver iç mesajları sızabilir. — Düzeltme: client'a genel mesaj + correlation ID; ayrıntıyı redacted server log'a yaz.

### 2.6 Dependency audit

**[ÖNEM: Yüksek] CVE taraması yapılmadan satışa çıkılmamalı** — Kanıt: package-lock dosyaları ve requirements.txt var; npm audit, pip-audit ve Gradle SCA bu ortamda çalıştırılamadı. — Düzeltme: CI'da npm audit --omit=dev, pip-audit -r ml-service/requirements.txt, OSV-Scanner/Gradle Dependency-Check; kritik/yüksek CVE release blocker.

---

## 3. PERFORMANS VE KAYNAK YÖNETİMİ

**[ÖNEM: Orta] Task/comment listelerinde pagination yok** — Kanıt: tasks.service.ts:102-120 tüm workspace task'larını; comments.service.ts:60-68 tüm yorumları getiriyor. TaskDetailModal.tsx:36-40 tek task için tüm task listesini çekip client-side find yapıyor. — Neden sorun: workspace büyüdükçe response/DB/bellek maliyeti büyür. — Düzeltme: cursor pagination, page size sınırı, GET task/:id endpoint'i, comment pagination.

**[ÖNEM: Orta] Composite index'ler sorgu şekillerine göre eksik olabilir** — Kanıt: schema.prisma:144-149 Task index'leri; task query workspaceId + projectId + deletedAt ve position sıralaması (tasks.service.ts:103-119). Comment taskId + deletedAt + createdAt; audit workspaceId + createdAt; risk taskId + computedAt DESC. Şemada çoğu yalnız ayrı index. — Neden sorun: sort/filter maliyeti artabilir. — Düzeltme: staging verisiyle EXPLAIN ANALYZE/BUFFERS; gerekirse Task(workspaceId,projectId,deletedAt,position), Comment(taskId,deletedAt,createdAt), AuditLogEntry(workspaceId,createdAt DESC), RiskAssessment(taskId,computedAt DESC) composite index'lerini ölçerek ekle.

**[ÖNEM: Orta] Risk feature extraction tüm yorum kayıtlarını belleğe alıyor** — Kanıt: risk-feature.service.ts:9-14 comments:true; satır 40 yalnız comments.length kullanıyor. — Neden sorun: body ve metadata gereksiz yüklenir. — Düzeltme: _count veya comment.count({taskId, deletedAt:null}).

**[ÖNEM: Orta] Assignee workload sayımı workspace dışına taşıyor** — Kanıt: risk-feature.service.ts:30-36 filtrede assigneeId/status/deletedAt var; workspaceId yok. — Neden sorun: başka workspace task'ları bu workspace'in risk skorunu etkiler. — Düzeltme: ürün kuralına göre workspaceId filtresi ekle veya global workload'u açıkça tanımla.

**[ÖNEM: Orta] Task version kontrolü atomik değil** — Kanıt: tasks.service.ts:122-137 read/check; 153-164 update where yalnız id, version increment. — Neden sorun: iki eşzamanlı update aynı version'ı geçebilir. — Düzeltme: updateMany CAS where id+workspaceId+version+deletedAt; count 0 ise 409.

**[ÖNEM: Orta] ML çağrısı task API response'unu bekletiyor; timeout yok** — Kanıt: tasks.service.ts:96-98/193-195 await assessAndSaveRisk; ai.service.ts:33-35 HTTP call timeout tanımlamıyor. — Düzeltme: BullMQ async scoring, timeout, circuit breaker ve UNAVAILABLE state.

**[ÖNEM: Yüksek] BullMQ worker bağlanmamış; retry/backoff/retention yok** — Kanıt: tasks.module.ts:8-18 queue register var fakat TaskAssignedListener providers listesinde yok; NotificationsModule AppModule imports listesinde yok; EmailProcessor yalnız notifications.module.ts içinde. attempts/backoff/retention/concurrency ayarı görülmedi. — Neden sorun: email job'ları işlenmeyebilir. — Düzeltme: listener/provider/module registration; attempts, exponential backoff, removeOnComplete/Fail, concurrency ve alarm; SMTP transporter reuse.

**[ÖNEM: Orta] Redis cache stratejisi yok** — Kanıt: Redis BullMQ connection için kullanılıyor; cache manager görülmedi. — Düzeltme: ölç; düşük değişkenlikli metadata için kısa TTL; yetki kararlarını stale cache'ten verme.

**[ÖNEM: Orta] Frontend dashboard CSR ağırlıklı** — Kanıt: workspace page.tsx:1 'use client'; useEffect ile workspace/project/member/task fetch; login/register da client component. — Düzeltme: interaktif Kanban/modal client kalsın; ilk veri yüklemesini Server Component'e taşıma olasılığını ölç.

**[ÖNEM: Orta] Frontend test/typecheck script'i yok** — Kanıt: frontend/package.json:5-10 yalnız dev/build/start/lint. — Düzeltme: Vitest + RTL, Playwright, tsc --noEmit.

**[ÖNEM: Kritik] Android offline worker API'ye göndermeden işlemi siliyor** — Kanıt: SyncWorker.kt:19-27 API call yorum satırında, buna rağmen dao.deleteOperation(op.id) çalışıyor. — Neden sorun: offline kullanıcı değişikliği kaybolur. — Düzeltme: server 2xx ack sonrası sil; idempotency key, retry/backoff, 409 conflict state ve test.

**[ÖNEM: Yüksek] Android worker'ın enqueue/repository bağlantısı görünmüyor** — Kanıt: SyncWorker ve Room DAO mevcut; TaskViewModel/TaskScreen içinde DAO insert veya WorkManager enqueue yok. — Düzeltme: repository + pending operation write + unique WorkManager work + network constraint.

**[ÖNEM: Yüksek] Android refresh/logout akışı eksik** — Kanıt: AuthApiService yalnız login; AuthInterceptor yalnız access token; CookieJar/refresh yok. AppNavGraph logout yalnız login'e navigasyon; TokenManager.clearToken() çağrısı görünmüyor. — Neden sorun: backend access token 15m; Android refresh yapamaz ve logout tokenı temizlemez. — Düzeltme: CookieJar/refresh single-flight, revoke endpoint, clearToken, expiry tests.

**[ÖNEM: Yüksek] Android release shrink kapalı; instrumented test yanlış package bekliyor** — Kanıt: app/build.gradle.kts:25-32 isMinifyEnabled=false; ExampleInstrumentedTest.kt:21-22 com.taskflowai.myapplication bekliyor, applicationId com.taskflowai.taskflowai. — Neden sorun: R8 kapalı; testin mevcut applicationId ile başarısız olması beklenir. — Düzeltme: minify/shrinkResources ve keep rules test; assertion düzelt; release assemble ve instrumented test çalıştır.

**[ÖNEM: Orta] Android ViewModel hataları yutuyor** — Kanıt: TaskViewModel.kt:55-57,75-77,93-94 boş catch. — Düzeltme: sealed UI error state, retry ve redacted log.

**[ÖNEM: Düşük] N+1/Compose recomposition/bellek sızıntısı kanıtlanmadı; ölçüm yok** — Kanıt: Prisma include'ları var; Android Studio Profiler/Compose Layout Inspector/query log çalıştırılmadı. TaskScreen filtrelemeyi her recomposition'da yapıyor. — Düzeltme: clinic.js/autocannon, pg_stat_statements/EXPLAIN, Lighthouse, Android Profiler/Compose recomposition counts. GradientBoosting dört feature ile CPU üzerinde çalışır; GPU gereksinimi kanıtı yok. ML model global değişkende process başında bir kez yükleniyor (main.py:29), her request'te değil.

---

## 4. MİMARİ VE İŞ AKIŞI MANTIĞI

**[ÖNEM: Orta] RBAC kararları guard ve servisler arasında dağınık** — Kanıt: WorkspaceMemberGuard yalnız membership; ProjectsService OWNER/ADMIN; CommentsService author/ADMIN/OWNER; TasksService rol kontrolü yapmıyor. — Neden sorun: endpoint'ler arasında rol politikası tutarsız. — Düzeltme: merkezi policy/ability; controller HTTP parse; servis domain kuralı; policy unit test.

**[ÖNEM: Yüksek] Workspace daveti gerçek invitation akışı değil** — Kanıt: workspaces.service.ts:95-117 mevcut kullanıcı bulunup ACTIVE membership ekleniyor; token/expiry/accept endpoint yok. workspace.member_invited event'i emit ediliyor ama listener görülmedi. — Neden sorun: kullanıcı onayı yok, davet edilecek kişinin önceden kayıtlı olması gerekiyor. — Düzeltme: token hash, expiresAt, invitedEmail, pending status, accept/revoke endpoint ve e-posta linki.

### Uçtan uca akış riskleri

- **Register/login:** bcrypt hash ve JWT var; access 15m/refresh 30d. Rate limit yok; refresh race var; parola değişiminde session revoke yok; Android refresh cookie saklamıyor. E-posta doğrulama/password reset görünmüyor.
- **Workspace oluşturma:** workspace + OWNER membership transaction içinde (workspaces.service.ts:14-48). Davet işlemi doğrudan ACTIVE üyelik; OWNER escalation açığı var; mail listener yok.
- **Task create → AI → notification:** task create, audit, event ve risk assessment ayrı adımlar (tasks.service.ts:66-98). Audit hatası yutuluyor; event in-process ve outbox yok; ML await ediliyor; bildirim listener bağlı değil. Kısmi başarısızlıkta rollback yok.
- **Task update:** version read/check/update atomik değil (tasks.service.ts:122-164). CAS update ve 409 testi gerekli.
- **Android offline:** worker işlem gönderilmeden siliyor; repository enqueue görünmüyor; gerçek offline sync vaadi verilmemeli.

**[ÖNEM: Orta] Audit log kritik yazma işlemiyle atomik değil** — Kanıt: tasks.service.ts:79-87 task create sonrası audit; AuditService hata catch edip yutuyor. — Neden sorun: task oluşur ama audit kaydı kaybolabilir. — Düzeltme: task + outbox/audit transaction veya retry edilebilir audit job.

**[ÖNEM: Orta] Idempotency/outbox yok** — Kanıt: task create POST için idempotency key görünmüyor; eventEmitter.emit in-process. — Neden sorun: retry edilen POST duplicate task yaratabilir; process crash event'i kaybettirebilir. — Düzeltme: idempotency key unique constraint ve transactional outbox.

**[ÖNEM: Orta] Zustand yalnız auth state; server state page local** — Kanıt: useAuthStore.ts:1-23; workspace dashboard kendi useState ile API verisi tutuyor. — Düzeltme: TanStack Query/SWR server state, Zustand UI/auth state.

**[ÖNEM: Orta] Bazı dosyalar çok sorumluluk taşıyor** — Kanıt: workspace page.tsx 226 satır; SettingsModal.tsx yaklaşık 216 satır; workspaces.service.ts 211 satır. — Düzeltme: hooks/repository, UI component ve policy service ayrımı. GitHub code search TODO/FIXME sonuç vermedi; tam grep çalışmadığından “yok” denemez.

**[ÖNEM: Orta] Task archive/delete alanları var ama endpoint görünmüyor** — Kanıt: schema.prisma Task.archivedAt/deletedAt; tasks.controller.ts yalnız POST/GET/PATCH. — Düzeltme: soft delete/archive endpoint, role policy, restore ve tests.

### Konfigürasyon envanteri

| Değişken | Kullanım | Tespit |
|---|---|---|
| POSTGRES_USER/PASSWORD/DB | Compose | placeholder defaults |
| DATABASE_URL | Prisma | env var |
| JWT_SECRET | Auth | placeholder; güçlü secret gerekli |
| NODE_ENV | cookie secure | .env development |
| REDIS_HOST/PORT | BullMQ | backend zorunlu; .env.example'de yok |
| REDIS_PASSWORD | .env | BullMQ config'e aktarılmıyor |
| REDIS_URL | env/example | duplicate; app.module okumuyor |
| ML_SERVICE_URL | AiService | örnek env'de yok; localhost default |
| SMTP_HOST/PORT/USER/PASSWORD/FROM | EmailProcessor | örnek env'de yok |
| NEXT_PUBLIC_API_URL | Frontend | örnek env'de yok; localhost default |
| Android API URL | ApiClient | hardcoded emulator address |

**[ÖNEM: Yüksek] Env schema validation yok** — Kanıt: ConfigModule.forRoot global; Joi/Zod schema görülmedi. — Düzeltme: Zod/Joi schema; production'da JWT_SECRET, DATABASE_URL, Redis, CORS_ORIGINS, ML_SERVICE_URL, SMTP ve frontend API URL doğrulansın.

---

## 5. TEST DURUMU VE KALİTE KAPISI

### Kaynak ağacında görünen test envanteri

| Katman | Dosyalar | Test case sayısı | Kapsam |
|---|---|---:|---|
| Backend unit | app.controller.spec.ts, prisma.service.spec.ts, risk-feature.service.spec.ts | 4 | Hello World, Prisma defined, risk feature extraction |
| Backend e2e | test/app.e2e-spec.ts, test/taskflow.e2e-spec.ts | 3 | root endpoint ve auth guard |
| Android unit | ExampleUnitTest.kt | 1 | 2+2 |
| Android instrumented | ExampleInstrumentedTest.kt | 1 | package assertion; beklenen package uyuşmuyor |
| Frontend | test dosyası/script görünmedi | 0 | yok |
| ML | test dosyası görünmedi | 0 | yok |

Bunlar kaynakta tanımlı case sayısıdır; geçen/kalan/atlanan sonucu değildir. Komutlar çalıştırılamadığı için test sonucu doğrulanamadı.

**[ÖNEM: Yüksek] Kritik domain testleri yok** — Kanıt: auth refresh, RBAC, tenant isolation, task concurrency, notification queue, ML failure, frontend ve offline sync için test dosyası görünmüyor. — Düzeltme: auth parallel refresh; workspace cross-tenant; ADMIN/VIEWER role; task CAS; queue/SMTP; ML invalid input; web refresh/role; Android offline ack testleri.

### CI kalite kapısı

- Backend: npm ci, non-mutating lint, tsc --noEmit, unit/e2e test, build.
- Frontend: npm ci, eslint, tsc --noEmit, Vitest/RTL, Playwright, build.
- ML: pip install, ruff, pytest, pip-audit.
- Android: gradlew testDebugUnitTest, lintDebug, assembleDebug, connectedDebugAndroidTest, assembleRelease.
- Security: npm audit --omit=dev, OSV-Scanner, secret scan, dependency review, image scan.
- PR checks required; release artifact commit SHA + SemVer tag; smoke test + approval before production.

Not: backend/package.json lint script'i --fix içeriyor; CI lint kontrolü dosya değiştirmemeli. Ayrı lint:fix script'i kullanılmalı.

---

## 6. YAYINA ÇIKIŞ (DEPLOYMENT) HAZIRLIĞI

**[ÖNEM: Kritik] Compose backend ve frontend'i başlatmıyor** — Kanıt: docker-compose.yml:3-48 yalnız postgres, ml-service, redis tanımlıyor; tree'de backend/Dockerfile ve frontend/Dockerfile yok. — Neden sorun: docker compose up uygulamayı değil yalnız altyapı servislerini başlatır. — Düzeltme: backend/frontend Dockerfile ve compose servisleri; multi-stage build, non-root user, healthcheck, restart, internal network ve dependencies.

**[ÖNEM: Kritik] Backend Redis env sözleşmesi Compose ile uyuşmuyor** — Kanıt: app.module.ts:26-30 REDIS_HOST/REDIS_PORT zorunlu; compose'da backend yok; .env.example'de bu değerler yok. — Neden sorun: backend eklendiğinde env sağlanmazsa başlangıç hata verir. — Düzeltme: backend'e REDIS_HOST=redis/REDIS_PORT=6379; Redis auth varsa REDIS_PASSWORD geçir; tek config standardı.

**[ÖNEM: Yüksek] Compose port ve credential varsayılanları production için güvenli değil** — Kanıt: docker-compose.yml:8-12 DB default password ve host port; 26-27 ML port publish; 40-41 Redis port publish, Redis auth yok; postgres healthcheck user/db hardcoded (16). — Düzeltme: production'da yalnız reverse proxy port publish; DB/Redis/ML internal; secret manager; Redis ACL; healthcheck env'e bağlı.

**[ÖNEM: Orta] ML Dockerfile tek aşamalı ve root çalışıyor** — Kanıt: ml-service/Dockerfile:1-18 python:3.11-slim, build-essential, root user varsayılan, RUN python train.py; compose bind mount ./ml-service:/app. — Neden sorun: image gereksiz büyür; root; bind mount image dosyalarını maskeler; her build'de sentetik model train edilir. — Düzeltme: builder/runtime multi-stage; non-root; .dockerignore; doğrulanmış model artifact; production'da bind mount yok. Image boyutu ölçülmedi.

**[ÖNEM: Yüksek] Prisma migration deployment adımı yok** — Kanıt: Compose'da backend/migrate service yok; package.json scriptlerinde prisma migrate deploy yok. Seed file var ama startup integration yok. — Düzeltme: ayrı one-shot migrate job; API readiness migration sonrası; demo seed explicit opt-in.

**[ÖNEM: Yüksek] GitHub Actions CI görünmüyor** — Kanıt: recursive tree'de .github/workflows yok. — Düzeltme: PR CI + main release workflow; lint/typecheck/test/build/audit/image scan; GHCR push; staging smoke; production approval.

### Önerilen tek komut alıcı akışı

1. Docker Engine + Compose v2 kur.
2. .env.example → .env; unique JWT/DB/Redis secrets üret.
3. docker compose up -d --build.
4. PostgreSQL/Redis healthcheck bekle.
5. migrate job prisma migrate deploy çalıştır.
6. ML model artifact/readiness kontrol et.
7. API readiness ve web healthcheck.
8. Demo seed yalnız opt-in; production'da default kapalı.

JWT secret için örnek: openssl rand -base64 48 (burada çalıştırılmadı). DB parolası password manager/secret manager ile üret; .env'i web root'a koyma.

### Observability, backup, rollback

**[ÖNEM: Orta] Structured logging/health/metrics standardı yok** — Kanıt: email processor ve audit service console log kullanıyor; readiness/metrics standardı görünmüyor. — Düzeltme: pino JSON + requestId/correlationId; redacted logs; /health/live ve /health/ready; Prometheus/OpenTelemetry/Sentry; queue depth/age/fail, API p95/error, DB pool, ML latency, Android sync pending metrics.

Backup: PostgreSQL günlük backup + WAL/PITR (destekleniyorsa), encryption/retention; aylık staging restore tatbikatı. Migration: expand/contract ve backward-compatible; destructive migration öncesi backup/restore testi. Redis queue durability gereksinimini belirle.

Rollback: önceki image tag'i sakla; latest kullanma; uygulama image'ini geri al; destructive DB migration rollback yerine forward fix; queue payload schema version; rollback sonrası login/workspace/task/comment/ML smoke test.

---

## 7. ALICI DENEYİMİ VE DOKÜMANTASYON

**[ÖNEM: Yüksek] Kök README yok; alt README'ler framework starter** — Kanıt: root tree'de README.md yok. backend/README.md:24-26 Nest starter repository; frontend/README.md:1 create-next-app starter. Android/ML README görünmüyor. — Neden sorun: alıcı ürünün mimarisini/kurulumunu/limitlerini öğrenemez. Codester upload guide dokümantasyon, düzenli dosya yapısı ve İngilizce item/docs istiyor. — Düzeltme: root README + docs/installation.md, configuration.md, architecture.md, api.md, android.md, backup-restore.md, troubleshooting.md; İngilizce PDF/HTML help file.

Önerilen README başlıkları: Product overview/screenshots; features & limitations; architecture diagram; requirements; quick start; env table; demo credentials/seed policy; web setup; Android emulator/physical URL; ML model/data/metrics/limitations; API docs; backup/restore; troubleshooting; license/third-party notices; support policy; changelog.

**[ÖNEM: Yüksek] Repository lisansı tanımlı değil** — Kanıt: repo metadata license=null; root LICENSE yok; backend/package.json license UNLICENSED; frontend license alanı yok. — Neden sorun: alıcı kaynak kodunun kullanım/değiştirme/dağıtım şartını anlayamaz; UNLICENSED pazaryeri alıcı lisansı değildir. — Düzeltme: Codester item lisansını esas al; tüm kod/assets için satış ve dağıtım hakkını doğrula; THIRD_PARTY_NOTICES/credits ekle; repo lisansı seçilecekse platform şartlarıyla çelişmediğinden emin ol.

Codester'ın resmi sayfası Regular License'ı tek proje, Extended License'ı çoklu proje olarak tanımlıyor; Extended kaynak dosyalarının daha büyük projenin parçası olarak dağıtımına izin verse de ürünü as-is yeniden satmaya izin vermiyor. Bu alıcı lisansıdır; satıcı olarak ürün hak sahipliği ve marketplace sözleşmesi ayrıdır. Resmi lisans: https://www.codester.com/info/licenses

**[ÖNEM: Orta] Swagger/OpenAPI görünmüyor** — Kanıt: backend/package.json @nestjs/swagger içermiyor; main.ts Swagger setup yok. — Düzeltme: SwaggerModule, bearer auth, DTO örnekleri ve hata schema; production docs auth/IP ile korunsun.

### Alıcının takılacağı ilk 5 konu ve README metni

1. **Env:** “Copy .env.example to .env. Generate unique JWT, PostgreSQL and Redis secrets. Never use sample values in production.”
2. **Redis:** “Inside Docker use hostname redis, not localhost. Set REDIS_HOST=redis and REDIS_PORT=6379.”
3. **CORS/web:** “Set CORS_ORIGINS to the exact web origin and NEXT_PUBLIC_API_URL to the public API base URL. Production requires HTTPS.”
4. **Android:** “10.0.2.2 is emulator-only. On a physical device use a reachable API hostname and HTTPS.”
5. **Database:** “Wait for PostgreSQL health, then run Prisma migrate deploy. Demo seed is optional and must never run by default in production.”

### Pazaryeri materyalleri

Öne çıkarılabilecekler (ancak doğrulandıktan sonra): multi-workspace Kanban, task comments/activity, RBAC, Android companion, AI risk labels, Docker self-hosting. Offline-first veya AI probability prediction iddiası mevcut kodla desteklenmiyor.

Hazırla: web dashboard/Kanban/task detail/risk/member/activity/settings ekran görüntüleri; Android gerçek cihaz ekranları; 60-90 saniye kurulum/kullanım videosu; live demo + reset prosedürü; 800x400 preview, 200x200 icon ve screenshot ZIP.

Codester upload guide: https://www.codester.com/info/upload  
Codester seller guide: https://server.codester.com/info/seller  
CodeCanyon help file requirements: https://help.author.envato.com/hc/en-us/articles/360000471583-Code-Item-Preparation-Technical-Requirements  
CodeCanyon'a da gönderilecekse güncel platform şartlarını ayrıca kontrol et; iki pazaryerinin şartlarını eşitleme.

---

## 8. KOD TEMİZLİĞİ VE TESLİM PAKETİ

Repodan çıkar/ignore et: root .env, android/.idea, ml-service/__pycache__, node_modules, .next, dist, coverage, build, .gradle, .venv, logs, OS/IDE dosyaları. Model .joblib runtime için gerekiyorsa tut; model card/checksum ile belgele. Gradle wrapper jar ve package lock dosyaları reproducible build için kalmalı.

Önerilen teslim ağacı:

~~~text
TaskFlow/
├── README.md
├── CHANGELOG.md
├── LICENSE-or-marketplace-notice.txt
├── THIRD_PARTY_NOTICES.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── docker-compose.prod.yml
├── .dockerignore
├── docs/
│   ├── installation.md
│   ├── configuration.md
│   ├── architecture.md
│   ├── api.md
│   ├── android.md
│   ├── backup-restore.md
│   └── troubleshooting.md
├── backend/ (Dockerfile, package/lock, prisma, src)
├── frontend/ (Dockerfile, package/lock, src)
├── android/ (README, gradlew, gradle, app)
└── ml-service/ (Dockerfile, requirements, main, train, models/)
~~~

**[ÖNEM: Orta] Paket metadata eksik** — Kanıt: backend/package.json name=backend, version=0.0.1, description/author boş, private true, UNLICENSED. frontend/package.json name=frontend, version=0.1.0, description/author/repository/license yok. Repo description/topics/homepage null/boş. — Düzeltme: package metadata'ya ürün adı, açıklama, author, repository ve semver ekle; private alanı npm publish niyetine göre bırak. CHANGELOG ve release tag kullan.

Release ZIP kontrolü: temiz tag'den üret; env/IDE/cache/node_modules/build yok; clean VM'de install/build; demo seed opt-in; İngilizce help PDF/HTML ve credits; SHA256 checksum, version/date; kurulum README adımlarıyla geliştirici makinesi olmadan tamamlanmalı.

---

## 9. ÖNCELİKLİ AKSİYON PLANI

| Önem | Alan | Bulgu | Dosya/Konum | Öneri | Efor |
|---|---|---|---|---|---:|
| Kritik | RBAC | ADMIN OWNER atayabiliyor | workspaces.service.ts:86-117 | OWNER transferi ayrı; DTO/policy | S |
| Kritik | Android | Offline işlem API ack olmadan siliniyor | SyncWorker.kt:19-27 | API ack, retry/idempotency/conflict | M |
| Kritik | Docker | Compose API/web servislerini başlatmıyor | docker-compose.yml:3-48 | backend/frontend image + service | M |
| Kritik | Docker | Backend Redis env sözleşmesi eksik | app.module.ts:23-40 | REDIS_HOST/PORT/PASSWORD | S |
| Kritik | Android | Emulator-only HTTP URL release'e sabit | ApiClient.kt:11-13, Manifest | BuildConfig URL + HTTPS | S |
| Yüksek | Secrets | .env public repoda tracked | /.env | remove/ignore/rotate if used | S |
| Yüksek | Hygiene | root .gitignore yok; IDE/pycache tracked | tree | ignore ve tracked cleanup | S |
| Yüksek | RBAC | VIEWER task yazabiliyor | tasks.controller/service | role policy | M |
| Yüksek | Queue | listener/processor registration yok | tasks.module/app.module | module/provider + tests | S |
| Yüksek | Android auth | refresh/logout/token clear yok | AuthApiService/AppNavGraph | refresh + revoke + clear | M |
| Yüksek | Security | CORS localhost; rate limit/headers yok | main.ts/next.config.ts | allowlist/throttle/Helmet/CSP | M |
| Yüksek | Security | password change refresh revoke yok | users.service.ts | session revoke | S |
| Yüksek | Security | Authorization header loglanabilir | ApiClient.kt | redact/disable release logs | S |
| Yüksek | ML | 6 sentetik örnek, sabit score | train.py/main.py | gerçek data/metrics/calibration | L |
| Yüksek | Docs | root README/help docs yok | repo root | English installation/help | M |
| Yüksek | License | LICENSE yok; backend UNLICENSED | root/package.json | rights + notices + terms | M |
| Yüksek | CI | GitHub Actions görünmüyor | .github/workflows | PR/release workflow | M |
| Yüksek | Validation | raw body nesneleri | workspace/users controllers | DTO + runtime validation | S |
| Yüksek | Migration | migrate deploy otomasyonu yok | compose/package | one-shot migrate job | M |
| Yüksek | Dependency | SCA çalıştırılmadı | lockfiles/requirements | npm/pip/Gradle/image scan | M |
| Orta | Auth | refresh rotation race | auth.service.ts:84-124 | transaction CAS | M |
| Orta | Auth | token theft code maskeleniyor | auth.service.ts:102-124 | exception ayrımı | S |
| Orta | Auth | JWT fallback secret | auth.module.ts:11-14 | fallback kaldır | S |
| Orta | API | pagination yok | task/comment services | cursor pagination | M |
| Orta | DB | composite index eksikleri olası | schema/services | EXPLAIN sonrası index | M |
| Orta | ML | comment body'leri gereksiz yükleniyor | risk-feature.service.ts | count/_count | S |
| Orta | ML | assignee workload tenant scope dışı | risk-feature.service.ts | workspace rule/filter | S |
| Orta | Concurrency | task version check atomik değil | tasks.service.ts:122-164 | atomic CAS | M |
| Orta | AI | ML call synchronous/timeout yok | ai.service/tasks.service | async queue + timeout | M |
| Orta | Frontend | CSR ağırlığı/server state ayrımı | workspace page/store | Query cache + SSR ölçümü | M |
| Orta | Android | WorkManager enqueue görünmüyor | SyncWorker/TaskViewModel | repository scheduling | M |
| Orta | Android | boş catch/hata state'i yok | TaskViewModel.kt | UI state/retry | S |
| Orta | Android | R8 kapalı, instrumented test package hatalı | build.gradle/test | fix + release test | S |
| Orta | API docs | Swagger yok | backend package/main | OpenAPI | S |
| Orta | Metadata | description/author/repository eksik | package.json | metadata/semver | S |
| Düşük | Perf | N+1 ve p95 ölçülmedi | API | query profiling | S |
| Düşük | Perf | Lighthouse/Profiler/EXPLAIN yok | tüm katmanlar | baseline | M |
| Düşük | API | task detail tüm listeyi indiriyor | TaskDetailModal.tsx | GET task/:id | S |

### Yayın öncesi kontrol listesi

- [ ] 1. .env'i kaldır; root .gitignore ekle; kullanılmış sır varsa rotate et.
- [ ] 2. ADMIN OWNER atamasını engelle; invite/role DTO ve VIEWER policy.
- [ ] 3. Android URL/HTTPS/log redaction ve refresh/logout tamamla.
- [ ] 4. Offline sync API acknowledgement, retry, idempotency, conflict ve WorkManager wiring.
- [ ] 5. TaskAssignedListener/EmailProcessor registration ve SMTP testleri.
- [ ] 6. Backend/frontend Dockerfile, Compose services, healthcheck, network, env.
- [ ] 7. Prisma migrate deploy job; demo seed opt-in.
- [ ] 8. CORS/rate limit/Helmet/CSP/exception redaction/password session revoke.
- [ ] 9. ML gerçek veri/validasyon/kalibrasyon/model card; scoring async.
- [ ] 10. Pagination, atomic version CAS, EXPLAIN/index.
- [ ] 11. Backend/frontend/Android/ML testlerini ekle ve çalıştır.
- [ ] 12. npm/pip/Gradle/container security audit.
- [ ] 13. GitHub Actions CI/CD ve rollback.
- [ ] 14. Structured logs, health/readiness, metrics, backup/restore tatbikatı.
- [ ] 15. İngilizce README/help PDF, API docs, FAQ, CHANGELOG, third-party notices.
- [ ] 16. Clean VM'de release ZIP kurulumunu baştan sona test et.
- [ ] 17. Release smoke test/build/audit sonuçlarını kaydet.

**Bu maddeler tamamlandığında ürünü satışa çıkarabilirsin.**

---

## Ek A. Doğrulanamayan kontroller ve önerilen komutlar

GitHub connector ile dosyalar/commit diff'i okundu; repository checkout çalışma dizinine mount edilmemişti. Terminal kontrolünde çalışma dizini / idi ve git status komutu fatal: not a git repository döndürdü. Proje komutlarını başka dizinde çalıştırıp proje sonucu gibi sunmak doğru olmaz. Bu nedenle hiçbir build/test/audit sonucu başarılı veya başarısız diye raporlanmıyor.

| Kontrol | Durum | Sonraki adım |
|---|---|---|
| docker compose config/up | Doğrulanamadı | checkout'ta config + temiz VM smoke |
| Backend npm ci/test/e2e/build | Doğrulanamadı | exit code, test count, logs kaydet |
| Frontend lint/typecheck/build | Doğrulanamadı | npm ci, eslint, tsc --noEmit, build |
| npm audit --omit=dev | Doğrulanamadı | backend/frontend lockfile audit |
| pip install --dry-run / pip-audit | Doğrulanamadı | requirements üzerinden çalıştır |
| pytest | Doğrulanamadı | ML testleri ekle, pytest |
| gradlew tasks/test/assembleRelease | Doğrulanamadı | JDK/SDK/emulator ile çalıştır |
| Gradle SCA | Doğrulanamadı | OSV/Dependency-Check |
| git log -p --all -S ... | Kısmen | GitHub .env commit diff'i görüldü; tam local tarama yok |
| gitleaks/trufflehog | Doğrulanamadı | tüm history scan |
| Docker image size | Doğrulanamadı | docker image ls/layer inspection |
| Lighthouse/Profiler/EXPLAIN | Doğrulanamadı | staging ve temsil edici veri |

Önerilen komutlar (repo checkout'ta):
- docker compose config
- docker compose up -d --build && docker compose ps
- Backend: npm ci && npm run build && npm test -- --runInBand && npm run test:e2e -- --runInBand
- Frontend: npm ci && npx eslint . && npx tsc --noEmit && npm run build
- npm audit --omit=dev
- pip install -r ml-service/requirements.txt && pip-audit -r ml-service/requirements.txt && pytest
- Android: ./gradlew tasks testDebugUnitTest lintDebug assembleDebug connectedDebugAndroidTest assembleRelease
- gitleaks detect --source . --redact
- docker image ls; staging DB'de EXPLAIN (ANALYZE, BUFFERS)

Komutlar başarıyla çalışmadan “build başarılı”, “testler geçti”, “CVE yok” veya “production hazır” denmemeli.

## Ek B. Pazaryeri kaynakları

- Codester upload guide: https://www.codester.com/info/upload
- Codester seller guide: https://server.codester.com/info/seller
- Codester license terms: https://www.codester.com/info/licenses
- Codester allowed items: https://support.codester.com/hc/en-us/articles/115000018789-What-items-are-allowed-to-be-sold-on-Codester
- CodeCanyon technical documentation: https://help.author.envato.com/hc/en-us/articles/360000471583-Code-Item-Preparation-Technical-Requirements
- CodeCanyon common rejection factors: https://help.author.envato.com/hc/en-us/articles/360000536823-Common-Rejection-Factors-for-Code-Items

Pazaryeri kuralları değişebileceğinden gönderim gününde resmi seller/author dokümanlarını yeniden kontrol et.


---

## 16 Kasım 2026 — ikinci denetim turu (fix/go-live-blockers)

Bu bölüm, yukarıdaki ilk denetim raporunu silmez; branch üzerinde sonradan yapılan düzeltmeleri ve doğrulama durumunu ayrı kaydeder.

### Bu turda yapılan değişiklikler

- **Backend task concurrency:** Görev güncellemesindeki read-then-write version kontrolü, `updateMany` üzerinde `id + workspaceId + deletedAt + version` koşullu atomik compare-and-swap işlemine çevrildi. Etkilenen satır sayısı 1 değilse güncel sürüm okunuyor ve `STALE_VERSION` 409 Conflict dönüyor.
- **DTO validation:** `UpdateTaskDto.version` artık negatif olmayan tam sayı olarak doğrulanıyor (`IsInt`, `Min(0)`).
- **Backend regression tests:** Başarılı CAS, yarışta stale-version conflict ve güncelleme sırasında kaybolan kayıt için testler eklendi.
- **ML startup davranışı:** ML servisi model artifact'i yoksa sentetik veriden sessizce model üretmiyor; açık bir hata ile başlamayı reddediyor. Model eğitimi ayrı `train.py` adımında kalıyor.
- **ML regression test:** Artifact eksik olduğunda loader'ın hata verdiği test eklendi.
- **Model card:** `ml-service/MODEL_CARD.md` eklendi. v1'in altı sentetik örnekten oluştuğu, ölçülmüş doğruluk/kalibrasyon bulunmadığı ve API'deki 0.2/0.5/0.85 değerlerinin olasılık olmadığı açıkça belgelendi.

### Doğrulama durumu

- Önceki Android hesap izolasyonu commit'i `dcbb25428cb0682fbc4698668691a09c440e12ab` için CI run #95 (`43918642822`) beş işin tamamında başarılı oldu: Backend, Frontend, ML, Android ve Docker. [Run #95](https://github.com/busraknya/taskflow-ai-full-project/actions/runs/43918642822)
- Bu bölümdeki yeni backend/ML değişikliklerinin CI doğrulaması henüz tamamlanmış sayılmıyor. Ara commit'lere ait Actions çalışmaları yeni push'larla iptal edildi; son branch commit'i: `ebfb5bf2d6555381a613e0a0dd36e6c23f16d8aa`. Bu commit için yeni CI sonucunu bekle.
- **GO/NO-GO: NO-GO devam ediyor.** Backend CAS ve ML startup düzeltmeleri, gerçek deployment/E2E, ML model validasyonu, Android sync Worker HTTP senaryoları ve release/backup doğrulamasının yerine geçmez.


---

## 17 Kasım 2026 — Son branch denetimi ve devam eden düzeltmeler

> Bu bölüm önceki denetim tarihçesini silmez; 17 Kasım'daki kaynak incelemesi ve branch değişikliklerinin güncel notudur.

### Kodda doğrulanan ek bulgular
- RiskFeatureService assignee aktif görev sayımını workspaceId ile sınırlandırıyor ve yorum sayısını yalnız deletedAt:null kayıtlarından count sorgusuyla alıyor.
- Task create aktif olmayan/silinmiş proje ilişkisini reddediyor.
- Task update yalnız assignee gerçekten değiştiğinde assignment event yayımlıyor.
- ML risk paneli sabit 0.20/0.50/0.85 değerlerini yüzde gibi göstermiyor; deneysel risk sınıfı olarak etiketleniyor.
- E-posta HTML gövdesinde kullanıcı adı ve görev başlığı escape ediliyor; escape helper için unit test eklendi.
- Atama e-posta kuyruğuna taskId + taskVersion bazlı jobId veriliyor; aynı task version event'inin yinelenmesi engelleniyor. Bu tek başına DB transaction ile event/outbox garantisi sağlamaz.
- Workspace-scoped task detail GET endpoint'i eklendi; silinmiş/başka workspace task'ı 404 döner.
- Web task detail modal artık bütün task listesini indirip task aramak yerine tekil endpoint kullanıyor.
- VIEWER için Kanban durum ilerletme, task create ve comment create UI aksiyonları gizlendi. Backend write guard'ları korunuyor; yorum silme UI yalnız yazar veya OWNER/ADMIN için gösteriliyor.

### Henüz kanıtlanmamış / açık kalanlar
- 17 Kasım'daki en son commitler için CI tamamlanmış ve yeşil olarak doğrulanmadı.
- Backend genel lint borcu hâlâ ayrı bir kalite işi; yalnızca ilgili yeni dosyalarda hedefli lint/format uygulanmalı.
- Atama event'i halen in-process EventEmitter üzerinden; DB commit sonrası process crash event kaybına yol açabilir. Transactional outbox veya eşdeğer dayanıklı event aktarımı gerekir.
- Email processor retry davranışı BullMQ yapılandırmasına bağlı; queue attempts/backoff/retention ve failed job operasyonu gerçek Redis ile test edilmedi.
- Task CRUD halen ML servisini senkron await ediyor; timeout ve asenkron tahmin durum makinesi tamamlanmadı.
- Task detail endpoint'i ve VIEWER akışları için backend controller integration + gerçek Web E2E testleri eksik.
- Üye daveti henüz süreli token ve kabul durum makinesi değil; kayıtlı kullanıcıyı doğrudan ACTIVE üyeliğe ekleme davranışı mevcut.
- ML veri kümesi altı sentetik örnek; gerçek gecikme olasılığı, calibration veya üretim doğruluğu iddiası yok.

### Güncel GO/NO-GO
**NO-GO devam ediyor.** Kod düzeltmeleri ve unit testler ürünün üretim hazır olduğunu kanıtlamaz. CI, gerçek DB/Redis/ML entegrasyonu, rol bazlı E2E, temiz Docker kurulumu, backup/restore ve alıcı dokümantasyonu tamamlanmadan yayın/satış kararı verilmemeli.

### Devam eden branch
fix/go-live-blockers — main üzerinde yalnız ürün gereksinim belgesi güncellendi. Kod değişiklikleri bu branch'te tutuluyor ve merge edilmedi.


### ML skor sözleşmesi güncellemesi — 17 Kasım 2026
- FastAPI artık sınıf etiketinden 0.20/0.50/0.85 sabit risk_score üretmiyor; risk_score null döndürüyor.
- NestJS RiskPredictionResult alanı number | null olarak güncellendi; ML servisi erişilemediğinde de null dönüyor.
- ML API testi risk_score değerinin null olmasını bekliyor; model card eski sabit eşlemelerin kaldırıldığını açıklıyor.
- Bu değişiklik olasılık tahmini sağlamaz; yalnızca yanıltıcı skorun API ve DB'ye aktarılmasını önler. Gerçek olasılık modeli ve calibration hâlâ P0 kapsamındadır.


---

## 18 Kasım 2026 — CI hata analizi ve workspace üyelik akışı

### CI run 44136596994 (commit ee6f622)
- Android unit tests/debug build: PASS.
- ML API tests: PASS.
- Docker Compose validation/image build: PASS.
- Backend: FAIL — yeni `comments.controller.spec.ts`, controller'ın `@nestjs/passport` ESM modülünü CommonJS Jest içinde yüklemesi nedeniyle suite başlamadı. Ayrıca lint raporu 183 error / 23 warning içeriyordu.
- Frontend: FAIL — `TaskDetailModal` effect içinde senkron setState nedeniyle `react-hooks/set-state-in-effect`; lint toplam 1 error / 35 warning.

### Düzeltmeler (branch `fix/go-live-blockers`)
- Comment controller request tipi tanımlandı; `req.user` ve membership erişimleri artık `any` değil.
- Comment controller unit testinde Passport AuthGuard ve WorkspaceMemberGuard test-double ile izole edildi; gerçek HTTP guard davranışı ayrı integration test gerektirir.
- TaskDetailModal task + comments yüklemesini async effect içinde başlatıyor; yükleniyor durumu seçili taskId ile yüklenen taskId karşılaştırılarak türetiliyor. Eski task verisi yeni task seçiliyken gösterilmiyor.
- TaskDetailModal API response tipi tanımlandı; kullanılmayan `onTaskUpdated` prop'u kaldırıldı.
- WorkspaceMemberGuard request tipi tanımlandı; body bulunmayabileceği için `request.body?.workspaceId` kullanılıyor; kullanılmayan ForbiddenException import kaldırıldı.

### Workspace daveti mevcut durum
- Invite endpoint yalnız kayıtlı e-postaları kabul ediyor; kayıtlı kullanıcıya üyelik anında ACTIVE oluşturuluyor ve e-posta bilgilendirme olarak gönderiliyor.
- PENDING/EXPIRED enumları var fakat token, kabul, ret, iptal ve expiration akışı yok. Bu nedenle gerçek davet kabul ürünü tamamlanmış değil.
- Gerçek davet token/state machine P1 ürün gereksinimi olarak `analysis/product_workflows_requirements.md` içinde tanımlandı.

### CI durumu
- 18 Kasım düzeltmeleri art arda commit edildiğinden bazı Actions run'ları yeni commitler tarafından iptal edildi. Son commit `36c5401f074bf0646addf9125df7c8a784877871` için CI sonucu ayrıca doğrulanmalı.
- Backend lint borcu devam ediyor; CI lint script'i tüm backend dosyalarını taradığı için yalnız yeni dosyaları düzeltmek yeşil CI sağlamayabilir. Kalan lint hataları sınıflandırılmalı ve sistematik biçimde ele alınmalı.


### 18 Kasım 2026 — CI run 44247578789 son inceleme

Run sonucu: **FAILURE**. Başarısız tek job Android instrumented Room queue tests; backend, frontend, ML ve Docker job'ları SUCCESS.

Android log incelemesi:
- `testDebugUnitTest` ve `assembleDebug` adımları başarısız değil.
- `connectedDebugAndroidTest` aşamasında emulator başlatılıyor; emulator boot sırasında ADB tekrar tekrar `device offline` döndürüyor ve sonunda exit code 224 ile kapanıyor.
- Bu log, Room test assertion failure kanıtı değil; CI emulator/ADB provisioning sorunu.

CI düzeltmesi:
- Android job `ubuntu-latest` (run anında Ubuntu 26.04.1) yerine `ubuntu-24.04` olarak sabitlendi.
- Emulator `-no-window -gpu swiftshader_indirect -noaudio -no-boot-anim` ile başlatılacak ve animasyonlar kapatılacak.
- Commit: `1b24947888d8ab5da26fee6f90e531b55713c5cb`.
- Bu değişiklik henüz yeniden CI ile doğrulanmadı. Android emulator testleri geçmeden Android entegrasyon testleri PASS sayılmayacak.


### 18 Kasım 2026 — CI run 44259059256: ikinci emulator denemesi

Run sonucu yine FAILURE; yalnız Android job başarısız. Backend, frontend, ML ve Docker job'ları SUCCESS.

Log incelemesi:
- Runner Ubuntu 24.04 olarak doğru seçilmiş.
- API 35 emulator boot tamamlandı (`Emulator booted.`).
- Ardından emulator console başlatılamadı; `ShellCommandUnresponsiveException` oluştu.
- Gradle cihazı `Unknown API Level` olarak atladı; `No compatible devices connected` ile instrumented test başlatılamadı.
- Unit test ve debug APK assemble adımları başarılı.
- Bu sonuç Room test assertion hatası değil, CI emulator imajı/ADB shell erişilebilirliği sorunudur.

İkinci CI denemesi düzeltmesi:
- `google_atd` (Android Test Device) sistem imajına geçildi.
- Emulator RAM 2048 MB / heap 512 MB, boot timeout 600 sn, `-no-snapshot -wipe-data` ile temiz başlangıç ayarlandı.
- Commit: `a719a7577ee19afdda9fa57ef18d58f7d8489635`.
- Henüz CI sonucu yok. Sonuç gelmeden Android instrumented test PASS denmeyecek.


# 25 Kasım 2026 — Sonraki remediation dalı için durum eki

> Bu ek, 16 Kasım tarihli başlangıç denetimini silmez veya geriye dönük olarak değiştirmez. Aşağıdaki güncel durum `fix/go-live-blockers` dalındaki kaynak kod ve dokümanların incelenmesine dayanır; bu değişiklikler henüz `main` dalına birleştirilmiş değildir.

## Güncel kod incelemesinde doğrulanan iyileştirmeler

- Kök `.env` remediation dalında silinmiş; `.env.example` örnek/yer tutucu değerlerle yeniden düzenlenmiş ve `.gitignore` sırları, Python cache/bytecode, Android `.idea`, Gradle ve build artefact'larını dışlayacak şekilde eklenmiştir. Tarihsel git objelerinin tamamında secret scanner çalıştırıldığı doğrulanmamıştır. Eski bir gerçek sır kullanıldıysa rotasyon gerekir.
- Workspace davetleri artık doğrudan ACTIVE üyelik vermek yerine PENDING durum, 7 günlük sona erme, kabul/ret ve kuyruk üzerinden e-posta akışı içeriyor. Token-link ile davetsiz kayıtlı olmayan kullanıcı onboarding'i ilk sürüm kapsamı değildir. SMTP teslimatı henüz gerçek hesapla kanıtlanmamıştır.
- Auth ve workspace invitation endpoint'leri için Redis tabanlı rate limiting eklenmiştir. Redis erişilemiyorsa fail-closed davranış tasarlanmıştır; proxy hop ayarının gerçek reverse proxy zincirinde doğrulanması ve saldırı testi açık kalır.
- Yeni refresh token kayıtları SHA-256 fingerprint ve unique index ile bulunur; eski bcrypt kayıtları için geriye dönük uyumluluk fallback'i korunur. Gerçek paralel refresh/reuse E2E ve eski kayıt temizliği politikası açık kalır.
- Android istemcisinde login/refresh/logout API tanımları, encrypted token storage ve 401 sonrası refresh authenticator kodu bulunur. Bunlar statik kod bulgularıdır; gerçek API ve cihazla E2E kanıtı değildir.
- Docker Compose artık PostgreSQL, Redis, ML, migration, backend ve frontend servislerini tanımlar. CI Compose config/image build ve healthcheck adımlarını çalıştırır; temiz müşteri makinesinde bağımsız kurulum kabulü ve production TLS/reverse proxy doğrulaması yerine geçmez.
- README ürünün geliştirme/pre-release durumunu ve ML tahminlerinin deneysel olduğunu açıkça belirtir. README lisans vermemektedir; ticari dağıtım lisansı ve üçüncü taraf attribution envanteri çözülmemiştir.

## Doğrulama ve karar

- Remediation dalındaki 25 Kasım CI run'ları commit bazında değerlendirilmelidir. Run `45683129340`, commit `5849609ad0b6c36b7b40b91ee7fc6003c97c5b9f` için oluşturulmuş ve inceleme anında `pending` durumundadır; bu nedenle başarılı sayılmaz.
- CI workflow'unda backend genel lint baseline adımı `continue-on-error: true` olduğundan yeşil job sonucu tüm backend lint borcunun kapandığını göstermez.
- Henüz gerçek browser/Android E2E, SMTP teslimatı, backup/restore, production TLS, tam secret-history taraması, ticari lisans/attribution ve Codester ZIP kabulü tamamlanmamıştır.

**Güncel karar: NO-GO.** Bu remediation değişiklikleri başlangıç denetimindeki bazı bulguları kapatmıştır; ancak `main` branch'e merge edilmemiştir ve marketplace release için gerekli operasyonel, E2E ve lisans kapıları açık kalır.


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


---

# 26 Kasım 2026 — Güvenlik uygulamaları sonrası değerlendirme

> Bu bölüm önceki tarihli bölümleri silmez veya değiştirmez. Dal: `fix/go-live-blockers`. Teknik ayrıntılar (politika değerleri, yapılandırma, API sözleşmesi) bu belgede tekrarlanmaz; README.md içindeki "Production deployment notes", "Security controls" ve "Authentication API contract" bölümlerinde tutulur.

## Bu turda dala eklenen değişiklikler

| Commit | Kapsam |
|---|---|
| `675246a` | SEC-01 ve R-1: opak refresh token (SHA-256), `tokenType` doğrulaması, atomik rotasyon, token ailesi ve reuse iptali, parola değişiminde tüm oturumların iptali, devre dışı/silinmiş hesap reddi, kullanıcı satırı kilidi (`SELECT ... FOR UPDATE`), migration `20261126120000_session_security` |
| `761f03a` | SEC-04-A: `backend/`, `frontend/`, `ml-service/` build context'leri için `.dockerignore` |
| `2b30009` | SEC-05: tek tip davet yanıtı, bekleyen davetlerde profil gizleme, koşullu yeniden davet, eşzamanlı davet çakışmasında 409, silinmiş workspace kontrolü, e-posta URL doğrulama ve konu satırı temizliği |
| `20ecec7` | SEC-02: global IP / kullanıcı / hassas işlem rate limitleri, hesap başına login limiti, limiter kesintisinde askıda kalma düzeltmesi, Helmet, nonce tabanlı frontend CSP |

## Önceki bulguların güncel durumu

| Tarihsel bulgu | Güncel durum | Kanıt |
|---|---|---|
| Refresh token rotasyonu yarış koşuluna açık (§2.2, 18 Kasım bloğu) | Kapandı | `675246a`; PostgreSQL E2E eşzamanlı refresh ve kilit sırası testleri |
| Parola değişiminde refresh token'lar iptal edilmiyor (§2.2) | Kapandı | `675246a`; unit ve PostgreSQL E2E |
| `TOKEN_THEFT_DETECTED` kodu maskeleniyor (§2.2) | Yerini ayrı hata kodları aldı (`REFRESH_TOKEN_REUSED`, `REFRESH_TOKEN_ROTATED`, `REFRESH_TOKEN_EXPIRED`) | `675246a` |
| JWT modülünde bilinen fallback secret (§2.2) | Kapandı; secret ConfigService'ten alınıyor ve en az 32 byte olmalı | `675246a` |
| Eski bcrypt refresh kayıtları için geriye dönük doğrulama (25 Kasım notu) | Kaldırıldı; eski kayıtlar migration ile iptal ediliyor, kullanıcılar bir kez yeniden giriş yapar | `675246a`, migration `20261126120000_session_security` |
| Davet doğrudan ACTIVE üyelik veriyor (18 Kasım bloğu) | Kapandı (PENDING akışı önceki remediation commit'lerinde); gizlilik kuralları eklendi | `2b30009`; PostgreSQL E2E |
| Rate limiting yok (§2.5) | Kapandı (kodda var, yerel E2E ile doğrulandı) | Önceki remediation + `20ecec7` |
| Helmet/CSP/security headers yok (§2.5) | Kapandı (kodda var, tarayıcıda doğrulandı) | `20ecec7` |
| Exception filter beklenmeyen `Error.message` değerini döndürüyor (§2.5) | **Açık** (26 Kasım); 27 Kasım'da `0802f3d` ile kapandı | `backend/src/common/filters/http-exception.filter.ts:47-48` (26 Kasım) |
| Docker build context'ine yerel `.env` giriyor (SEC-04 denetim bulgusu; bu belgede daha önce bulgu olarak kayıtlı değildi) | Kapandı | `761f03a`; imaj içerik taraması |
| ML Dockerfile tek aşamalı ve root çalışıyor (tarihsel bulgu) | Yalnız `.dockerignore` kısmı karşılandı; multi-stage build, non-root çalışma ve bind mount konuları yeniden değerlendirilmedi ve **kapanmış sayılmamalı** | `761f03a` (`ml-service/.dockerignore`) |

Android cleartext/logging, audit hata yutma, ML senkron çağrı ve pagination bulguları bu turda yeniden değerlendirilmedi.

## Doğrulama kanıtı

Aşağıdaki sonuçlar **yerel koşulardır**. Bu ortamda `gh` olmadığı için ilgili commit'lerin GitHub Actions sonuçları doğrulanamadı.

- Backend unit: 18 suite, 157/157 başarılı.
- Backend E2E, tek kullanımlık PostgreSQL 16 + Redis 7 (32 test, 31 başarılı): `auth-session` 16/16, `workspace-invitations` 10/10, `rate-limit-outage` 3/3, `app` 1/1, `taskflow` 1/2. Başarısız test, `test/taskflow.e2e-spec.ts` içinde 403 beklerken 404 alan ve bu turdan önce de var olan kontroldür; `WorkspaceMemberGuard` üye olmayanlara bilinçli olarak 404 döndürür.
- R-1 negatif kontrolü (PostgreSQL): kullanıcı kilidi olmadan, eşzamanlı rotasyonla oluşan yeni token parola değişimi sonrasında aktif kaldı; kilitle iptal edildi.
- Docker: dört servis imajı build edildi; imajlarda `.env` veya anahtar dosyası yok; migrate imajı `prisma.config.ts` yüklüyor; geçici ağda migrate → backend → kayıt/login (HttpOnly cookie) → ML health → frontend smoke testi başarılı.
- CSP: production build'de sayfadaki 11 script etiketinin tamamı istek başına üretilen nonce'u taşıyor; headless Chrome'da production (`/login`, `/register`, `/workspaces`) ve geliştirme modunda 0 CSP ihlali, istemci JavaScript'i çalışıyor.
- Mutasyon kontrolleri, kilit, rate limit, `tokenType` ve limiter askıda kalma düzeltmelerinin testlerce yakalandığını gösterdi.

Bu kanıtlar gerçek tarayıcı ve Android kullanıcı yolculuklarını, SMTP teslimatını, TLS'li production ortamını veya backup/restore'u doğrulamaz.

## Açık bulgular (26 Kasım hazırlık değerlendirmesi)

| ID | Önem | Bulgu | Durum |
|---|---|---|---|
| C-1 | Critical (yapılandırmaya bağlı) | `.env.example` içindeki `JWT_SECRET` yer tutucusu 32 byte kontrolünü geçiyor; değiştirilmezse access token sahteciliği mümkün. README uyarıyor, kod tespit etmiyor. | Kapandı (27 Kasım, `1961f0b` + `eb7f162`) |
| H-1 | High | CI E2E adımı `taskflow.e2e-spec.ts` 403/404 uyuşmazlığı nedeniyle büyük olasılıkla başarısız (yerelde doğrulandı, CI'da doğrulanamadı). | Kapandı (27 Kasım, `01005bc`; gerekli CI job'ları başarılı) |
| H-2 | High | Repoda TLS/reverse proxy yok; production'da refresh cookie `Secure` olduğundan HTTP üzerinden web oturumu yenilenemez. | Açık |
| H-3 | High (yapılandırmaya bağlı) | `TRUST_PROXY_HOPS` yanlış ayarlanırsa veya backend portu proxy dışında erişilebilir kalırsa IP sahteciliği ya da paylaşılan auth limitleri. | Açık |
| H-4 | High | Hesap başına login limiti (20 / 15 dk) başkası tarafından tüketilebilir; hedef hesabın girişi sürekli engellenebilir. | Açık, karar gerekli |
| M-1 | Medium | Redis kesintisinde refresh/logout/parola değişimi `503`; oturum kapatılamaz, erişim token'ları dolunca web oturumu sürmez. | Açık |
| M-2 | Medium (teorik) | Redis'e paketlerin düştüğü kesintide istek başına yaklaşık 3,5 sn ek gecikme. | Test edilmedi |
| M-3 | Medium | Refresh token ailelerinin mutlak ömrü yok. | Açık |
| M-4 | Medium | 30 sn grace penceresi theft detection'ı daraltıyor (R-2). | Açık |
| M-5 | Medium | Exception filter iç hata mesajını döndürüyor (SEC-06). | Kapandı (27 Kasım, `0802f3d`) |
| M-6 | Medium (yapılandırmaya bağlı) | `REDIS_PASSWORD` varsayılanı boş. | Açık |
| M-7 | Medium | Ortak IP (NAT/CGNAT) arkasındaki kullanıcılar IP başına auth limitlerini paylaşır. | Açık |
| M-8 | Medium | CI `prisma migrate deploy` komutunu `--config` olmadan çalıştırıyor. Yerel gözleme göre CLI bu durumda kullanılmayan `prisma7.config.ts` dosyasını yüklüyor; CI'da aynı davranış olası, ancak bağımsız olarak doğrulanmadı. | Açık |

Düşük önemli açıklar: davetlerde kısmi hesap tespiti (bekleyen satır ve yanıt süresi), Redis dönüşünden sonraki ilk auth isteğinin 503 alması, loglarda e-posta adresleri, SMTP için `requireTLS` bulunmaması, `FRONTEND_URL` varsayılanının localhost olması, CSP ihlal raporlamasının olmaması, `RefreshToken` tablosunun temizlenmemesi.

## Karar

**Güncel karar: NO-GO.** Uygulama kodundaki kimlik, oturum, davet, rate limit ve header kontrolleri kodda mevcut ve yerel testlerle doğrulandı. C-1, H-1, H-2, H-3 ve M-5 go-live engelleyicisidir; bunlar kapatılmadan ve TLS'li, doğru proxy topolojisine sahip bir ortamda gerçek kullanıcı akışları doğrulanmadan ticari production dağıtımı yapılmamalı. Karar, yalnız bu onaylı engelleyicilere dayanarak da NO-GO'dur.

H-4 (hesap başına login limiti politikası) ve M-1 (Redis kesintisinde logout ve parola değişimi davranışı) ürün sahibi kararını bekliyor (`product_workflows_requirements.md` §10, karar 11 ve 12). Ürün sahibi bunları go-live kapısı olarak onaylarsa P0 engelleyici olarak kalırlar; onaylamazsa P1'e taşınmaları önerilir. Bu belge iki karardan hiçbirini vermez; aynı koşul `sales_readiness_plan.md` içinde de geçerlidir.


---

# 27 Kasım 2026 — C-1, M-5 ve H-1 kapanışı

> Bu bölüm önceki tarihli bölümleri silmez. 26 Kasım "Karar" paragrafı o tarihteki durumu anlatan tarihsel kayıttır; güncel karar aşağıdadır. Dal: `fix/go-live-blockers`. Bu değişiklikler henüz `main`'e merge edilmedi.

## Bu turda dala eklenen commit'ler

| Commit | Kapsam |
|---|---|
| `01005bc` | H-1: `test/taskflow.e2e-spec.ts` içindeki iki eski 403 beklentisi 404 olarak düzeltildi (ürün sahibinin 404 kararı; guard davranışı değişmedi) |
| `1961f0b` | C-1: backend açılışta bilinen `JWT_SECRET` yer tutucularını (şu anki ve eski `.env.example` değerleri), yer tutucu işaretlerini (`replace_with`, `change_me`, `your-secret`, `placeholder` vb.), tamamı köşeli parantezli şablonları ve en fazla 8 karakterlik bir parçanın tekrarından oluşan değerleri reddediyor; hata mesajı secret'ı içermiyor |
| `eb7f162` | C-1 CI uyumluluğu: Compose smoke testi `.env.example` kopyasındaki yer tutucuyu her çalışmada `openssl rand -hex 32` ile üretilen bir secret ile değiştiriyor |
| `0802f3d` | M-5: `HttpException` olmayan hatalar istemciye yalnızca genel 500 mesajıyla dönüyor; hatalar sunucu tarafında method ve query string'siz path ile loglanıyor; Prisma hatalarında mesaj loglanmıyor (yalnızca sınıf, `code` ve stack frame'leri); `expose: true` olan 4xx `http-errors` hataları kendi status'ünü koruyor (çok büyük gövde artık 413) |

## Doğrulama kanıtı

- **GitHub Actions (TaskFlow CI, beş job: Backend, Frontend, ML, Docker Compose, Android):**
  - `01005bc`: run `45878677241` (`push`) ve run `45878686268` (`pull_request`) — beş job başarılı.
  - `1961f0b`: run `45949820235` — **başarısız**. Docker Compose job'u, CI'ın `.env.example` yer tutucusunu kullanması nedeniyle kırıldı (C-1'in beklenen etkisi; `eb7f162` ile düzeltildi). Android unit test adımı da başarısızdı; commit Android'e dokunmuyor.
  - `eb7f162`: run `45952276417` — ilk denemede Android unit test adımı başarısız; Android kodu değişmeden yeniden çalıştırılan **ikinci denemede beş job başarılı**. İlk denemedeki hata geçici altyapı sorunu olarak değerlendirildi, kök nedeni log'a erişilemediği için doğrulanmadı.
  - `0802f3d`: run `45959034137`, ilk deneme — beş job başarılı.
- **Yerel koşular:** C-1 için `jwt-config.spec.ts` (42 test) ve mutasyon kontrolleri; M-5 için `http-exception.filter.spec.ts` (21 test) ve mutasyon kontrolleri; backend unit suite 20/20 suite, 220/220 test; tek kullanımlık PostgreSQL 16 + Redis 7 ile backend E2E 5/5 suite, 32/32 test; düzeltilmiş Compose adımıyla yerel `docker compose up --wait` beş servis healthy.
- **Not:** Bu commit'ler için `pull_request` CI çalışması yok; PR #1'in `main` ile doküman conflict'i bulunduğu için GitHub `pull_request` workflow'unu tetiklemiyor. Yukarıdaki sonuçlar `push` çalışmalarına aittir.
- **Bilinen aralıklı durum:** `src/auth/auth-session.spec.ts` M-5 çalışması sırasında yerelde iki kez aralıklı başarısız oldu, sonraki 16 yerel koşuda ve CI'da geçti; kök nedeni belirlenmedi.

## Bulgu durumu (27 Kasım)

| ID | Önem | Durum | Kanıt / bağımlılık |
|---|---|---|---|
| C-1 | Critical | **Kapandı (dalda)** | `1961f0b`, `eb7f162`; CI run `45952276417` (deneme 2) ve `45959034137` |
| H-1 | High | **Kapandı (dalda)** | `01005bc`; gerekli beş CI job'u `01005bc`, `eb7f162` (deneme 2) ve `0802f3d` üzerinde başarılı |
| M-5 | Medium | **Kapandı (dalda)** | `0802f3d`; CI run `45959034137` |
| H-2 | High | Açık | Repoda TLS/reverse proxy yok; deploy topolojisi kararına (karar 13) bağlı |
| H-3 | High (yapılandırmaya bağlı) | Açık | `TRUST_PROXY_HOPS` değeri deploy topolojisi kararına (karar 13) bağlı |
| H-4 | High | Açık, ürün sahibi kararı bekleniyor | `product_workflows_requirements.md` §10, karar 11 |
| M-1 | Medium | Açık, ürün sahibi kararı bekleniyor | `product_workflows_requirements.md` §10, karar 12 |
| M-2, M-3, M-4, M-6, M-7, M-8 | Medium | Açık / doğrulanmadı | 26 Kasım tablosundaki durum geçerli |

C-1 kalan sınırlaması: işaret içermeyen, tahmin edilebilir insan yazımı secret'lar (ör. şirket adı + yıl) güvenilir biçimde tespit edilemez; README'deki `openssl rand -hex 32` yönergesi geçerlidir. M-5 kalan sınırlaması: Prisma dışı hataların stack'i mesajıyla birlikte loglanır (loglarda kişisel veri riskine ilişkin düşük önemli bulgu açık kalır).

## Doğrulanmamış olanlar

Gerçek backend ile Web UI ve Android E2E, gerçek SMTP teslimatı, TLS'li production ortamı ve backup/restore hâlâ doğrulanmadı. Başarılı ret akışının E2E'si ve M-2 de doğrulanmadı.

## Güncel karar

**Güncel karar: NO-GO.** C-1, H-1 ve M-5 `fix/go-live-blockers` dalında kapandı ve CI ile doğrulandı. Buna karşın H-2 ve H-3 (TLS/reverse proxy ve proxy topolojisi) açık go-live engelleyicileridir ve deploy topolojisi kararına (karar 13) bağlıdır. H-4 ve M-1 ürün sahibi kararını bekliyor; go-live kapısı olarak onaylanırlarsa P0 engelleyici olarak kalırlar, onaylanmazlarsa P1'e taşınmaları önerilir. Ayrıca bu düzeltmeler `main`'de değildir ve yukarıdaki doğrulanmamış kullanıcı/operasyon akışları tamamlanmadan ticari production dağıtımı yapılmamalıdır.

---

# 27 Kasım 2026 — E-posta davetleri ve SMTP varsayılanı (henüz commit edilmedi)

- **Dış SMTP varsayılanı kaldırıldı:** `SMTP_HOST` boşken e-posta işlemcisi dışarıdaki `smtp.mailtrap.io` sunucusuna bağlanmaya çalışıyordu. Lokal kurulumda bu doğrulandı: davet e-postaları bu sunucuda `EAUTH` hatası aldı. Artık e-posta varsayılan olarak kapalı; hiçbir sunucuya bağlanılmıyor ve açılışta tek bir uyarı loglanıyor. SMTP ayarlıysa açılışta bağlantı doğrulanıyor. Geliştirme için isteğe bağlı Mailpit profili (`dev-mail`) eklendi.
- **E-posta adresine davet:** Yeni `WorkspaceInvitation` modeli, yalnız hash'i saklanan tek kullanımlık token, URL fragment'ında (`/invite#token`) taşınan bağlantı, 7 gün süre, yeniden gönderme (eski bağlantıyı geçersiz kılar), iptal ve bekleyen davet listesi. Kayıtlı olmayan adresler de davet edilebiliyor; kişi bağlantıdan kayıt olup katılıyor.
- **Kapanan düşük önemli açık:** "Davetlerde kısmi hesap tespiti" kapandı. Davet yanıtı ve bekleyen liste, hesabı olan ve olmayan adresler için aynı; davet sırasında hesap araması yapılmıyor.
- **Kalan sınırlama:** E-posta doğrulaması olmadığı için davet bağlantısı tek başına katılma yetkisi veriyor. Bağlantı yalnızca hedef kişiyle paylaşılmalı.
- **Doğrulama:** backend 35 suite / 379 birim testi; E2E 8 suite / 52 test (yeni davet akışı ve eski bekleyen davetlerin kabulü dahil); lokal Compose + Mailpit ile uçtan uca davet → e-posta → kayıt → kabul akışı; web `tsc`, ESLint ve build.

---

# 28 Kasım 2026 — API mesajları İngilizceye çevrildi (Y-2, backend kısmı; henüz commit edilmedi)

- Backend'in kullanıcıya döndürdüğü tüm Türkçe hata/yanıt mesajları (yaklaşık 40 metin, 15 kaynak dosya) İngilizceye çevrildi. Bunlar exception mesajları, DTO validasyon mesajları, genel 500 mesajı ve çıkış/şifre değişikliği yanıtları. Hata kodları (`INVALID_CREDENTIALS`, `STALE_VERSION` vb.) ve HTTP durumları değişmedi; istemciler kodlara bakmaya devam ediyor.
- Web arayüzü ve Android zaten İngilizceydi. Frontend `errors.ts` içindeki, artık backend'de bulunmayan üç Türkçe mesaj eşlemesi kaldırıldı.
- Kapsam dışında kalanlar: Türkçe kod yorumları (kullanıcıya görünmüyor) ve çok dilli destek (i18n) yok; arayüz ve API tek dilli, İngilizce.
- **Doğrulama:** backend 35 suite / 379 birim testi; `tsc`; değişen dosyalarda ESLint 0 sorun (HEAD'de de 0); Prettier'da yeni sorun yok (7 dosyadaki eski biçim farkları değişiklikten önce de vardı); gerçek PostgreSQL 16 + Redis 7 ile E2E 8 suite / 52 test; frontend `tsc`, ESLint ve build.

---

# 28 Kasım 2026 — Görev ve audit listelerinde sayfalama (TASK-06, AUD-06'nın sayfalama kısmı)

- **API (uyumsuz değişiklik):** `GET /workspaces/:id/tasks` ve `GET /workspaces/:id/audit` artık dizi yerine `{ items, nextCursor }` döndürüyor. Keyset (cursor) sayfalama kullanılıyor; offset yok. Görevler `(position, id)` sırasıyla, audit kayıtları `(createdAt, id)` azalan sırayla geliyor. Bu sayede eşit `position` veya eşit zaman damgalı kayıtlar sayfalar arasında atlanmıyor ya da tekrarlanmıyor. Parametreler: `limit` (varsayılan 50, en fazla 200), `cursor`; görevlerde ayrıca `projectId` (UUID) ve `status`. Bozuk veya başka bir listeye ait cursor `400 INVALID_CURSOR` döndürüyor. Ürün henüz yayında olmadığından eski istemci yok; web ve Android aynı değişiklikte güncellendi.
- **Web ve Android:** Kanban sütunları ve Android durum sekmeleri ilk 50 görevi yüklüyor; devamı sütun/sekme altındaki "Load more" ile geliyor. Daha fazla görev varsa sayaç "50+" gibi gösteriliyor. Activity sayfasında da "Load more" var. Görev ekleme veya taşıma sonrasında dört sütunun ilk sayfası yeniden yükleniyor. Bu arada `position` değeri değiştiği için tekrar gelen görev listeye ikinci kez eklenmiyor.
- **İndeksler (migration `20261128060000_list_pagination_indexes`):** `Task(projectId, status, position, id)` ve `AuditLogEntry(workspaceId, createdAt, id)` eklendi. Bunların öneki olan `Task(projectId)` ve `AuditLogEntry(workspaceId)` kaldırıldı. Sorgulara aynı anlamı taşıyan ama indeks sınırı olarak kullanılabilen bir koşul (`position >=` / `createdAt <=`) eklendi.
- **Ölçüm** (PostgreSQL 16, 99.200 görev, 100.000 audit kaydı; sütunda 5.000, workspace'te 5.000 eşleşen satır; `EXPLAIN ANALYZE`):

  | Sorgu | Önce | Sonra |
  |---|---|---|
  | Görev sütunu, ilk sayfa | 4,1 ms (5.000 satır okunup sıralanıyor) | 0,18 ms (indeks taraması, 51 satır) |
  | Görev sütunu, derin sayfa | 1,2 ms | 0,09 ms |
  | Audit, ilk sayfa | 2,6 ms | 0,06 ms |
  | Audit, derin sayfa | 1,4 ms | 0,07 ms |

  Önceki maliyet eşleşen satır sayısıyla doğrusal artıyordu; şimdi sayfa boyutuna bağlı. Migration bu veri üzerinde 1 saniyenin altında uygulandı. Çok büyük kurulumlarda `CREATE INDEX` yazmaları kısa süre bekletebilir; yükseltmeyi düşük trafikli bir zamanda yapmak gerekir.
- **Kapsam dışı:** Üye listesi sayfalanmadı. Bir workspace'te genelde onlarca üye olur; üst sınır koymak da kayıtları kullanıcıya haber vermeden kesmek anlamına gelirdi. Audit için tarih aralığı filtresi (AUD-06'nın diğer kısmı) ve yorum sayfalaması yapılmadı.
- **Doğrulama:** backend 36 suite / 385 birim testi; E2E 9 suite / 61 test (yeni `pagination.e2e-spec.ts`: eşit `position`/zaman damgasında sıranın doğruluğu, silinmiş ve başka projedeki görevlerin hariç tutulması, başka workspace'in audit kayıtlarının hariç tutulması, geçersiz `cursor`/`limit`/`status` için 400). Mutasyon kontrolü: id karşılaştırması `gt` yerine `gte` yapılınca E2E başarısız oluyor. Ayrıca `tsc`, değişen dosyalarda ESLint'te yeni sorun yok, Prettier, web `tsc`/build, Android `testDebugUnitTest assembleDebug`. Not: Android'deki sayfalama mantığı için birim testi yok. `auth-session.spec.ts` içindeki bilinen kararsız test paralel çalıştırmada 10'da 3 kez "socket hang up" ile düştü; CI'ın kullandığı `--runInBand` modunda 5/5 temiz geçti.

---

# 28 Kasım 2026 — Tutarlı hata kodları

- **Sorun:** Hata yanıtındaki `code` alanında özel kod verilmişse `STALE_VERSION` gibi bir değer, verilmemişse Nest'in insan için yazılmış durum metni (`'Not Found'`, `'Forbidden'`, `'Bad Request'`) dönüyordu. Yaklaşık 80 exception'ın çoğunda özel kod yok. Web login/register ekranları `code || message` kullandığından, kodu olmayan hatalarda kullanıcı gerçek mesaj yerine "Bad Request" gibi bir metin görüyordu.
- **Düzeltme:** Özel kod yoksa kod artık HTTP durumundan büyük harf ve alt çizgiyle üretiliyor (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `PAYLOAD_TOO_LARGE`; bilinmeyen durumlarda `HTTP_<durum>`). DTO validasyon hataları `VALIDATION_FAILED` döndürüyor. Özel kodlar (`STALE_VERSION`, `INVITATION_*`, `REFRESH_TOKEN_*` vb.) değişmedi; istemcilerin baktığı kodlar etkilenmedi. Yanıt formatı aynı: `{ statusCode, code, message, details }`.
- **Web:** `getErrorMessage` artık hata gövdesini alıyor. Bilinen kod için kullanıcı dostu metni, yoksa ilk validasyon hatasını, o da yoksa API mesajını gösteriyor; kod metni hiç gösterilmiyor.
- **Doğrulama:** backend 36 suite / 392 birim testi (`--runInBand`; filtre testine durumdan kod üretimi ve kodsuz `ForbiddenException` → `FORBIDDEN` eklendi); E2E 9 suite / 61 test; `tsc`, değişen dosyalarda ESLint'te yeni sorun yok; web `tsc` ve build.
