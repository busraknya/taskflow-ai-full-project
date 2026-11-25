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
