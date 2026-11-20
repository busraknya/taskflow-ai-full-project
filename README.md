<!-- Language navigation -->
<p align="right">
  <a href="#english">English</a> | <a href="#türkçe">Türkçe</a>
</p>

# TaskFlow AI

<a id="english"></a>

## English

TaskFlow AI is a project and task management application in development. It is designed to help small and medium-sized teams organize projects, assign work, follow progress, and keep task information in one shared place.

The project brings together a web application, an Android app, a backend, and an experimental machine-learning service.

### What are we building?

With TaskFlow, a team should be able to:

- Create a shared workspace and manage team members.
- Organize work into projects and tasks.
- Assign tasks and set priorities and due dates.
- Follow the same work information on web and Android.
- Make supported changes offline on Android and sync them when the connection returns.
- Explore task-delay risk insights when enough reliable data is available.

TaskFlow is still under active development. The list above describes the intended product experience; it does not mean every flow is production-ready.

### How is it structured?

| Part | Responsibility |
|---|---|
| Web app | Manage projects and tasks in a browser |
| Android app | Follow and update tasks on a phone, including supported offline actions |
| Backend | Apply the main application rules and handle requests |
| Database | Store accounts, workspaces, projects, tasks, and related data |
| Background jobs | Handle work such as notifications and email |
| ML service | Experiment with task-delay risk assessment |

**Main technologies:** Next.js and TypeScript for the web app; NestJS and Prisma for the backend; PostgreSQL and Redis for data and background jobs; Kotlin and Jetpack Compose for Android; FastAPI and scikit-learn for the experimental ML service.

### Machine-learning approach

The goal is to explore whether task information—such as time remaining until a due date and the assignee's workload—can help identify tasks that may be delayed.

This feature is experimental. The current sample data is not enough to demonstrate real-world prediction quality, so TaskFlow does not claim to provide verified delay probabilities.

### Project documentation

- [Product overview and roadmap](analysis/product_overview_and_roadmap.md) — the product, its main user journey, and development priorities in plain language.
- [Detailed workflows and requirements](analysis/product_workflows_requirements.md) — detailed requirements, acceptance scenarios, technical findings, and testing notes.

### Development status

TaskFlow is being developed step by step. We distinguish between code that exists, behavior that has been tested, and features that are ready for real users. See the detailed requirements document for current findings and open work.

---

<a id="türkçe"></a>

## Türkçe

TaskFlow AI, küçük ve orta ölçekli ekiplerin projelerini düzenlemesine, görevleri ekip üyelerine atamasına ve işlerin ilerleyişini takip etmesine yardımcı olmak amacıyla geliştirdiğimiz bir proje ve görev yönetimi uygulamasıdır.

Proje; web uygulaması, Android uygulaması, sunucu tarafı ve deneysel bir makine öğrenmesi servisinden oluşur.

### Ne geliştiriyoruz?

TaskFlow ile ekiplerin:

- Ortak bir çalışma alanı oluşturmasını ve ekip üyelerini yönetmesini,
- İşlerini proje ve görevlere ayırmasını,
- Görevleri kişilere atamasını, öncelik ve teslim tarihi belirlemesini,
- Aynı iş bilgilerini web ve Android üzerinden takip etmesini,
- Android'de desteklenen bazı değişiklikleri internet bağlantısı yokken yapıp bağlantı geldiğinde eşitlemesini,
- Yeterli ve güvenilir veri oluştuğunda görev gecikme riskine ilişkin değerlendirmelerden yararlanmasını hedefliyoruz.

TaskFlow hâlâ geliştirme aşamasındadır. Bu maddeler hedeflediğimiz ürün deneyimini anlatır; tüm özelliklerin canlı kullanım için hazır olduğu anlamına gelmez.

### Sistem hangi parçalardan oluşuyor?

| Bölüm | Görevi |
|---|---|
| Web uygulaması | Proje ve görevleri tarayıcıdan yönetmek |
| Android uygulaması | Görevleri telefondan takip etmek ve desteklenen durumlarda çevrimdışı çalışmak |
| Backend (sunucu) | Uygulamanın temel kurallarını yürütmek ve istekleri işlemek |
| Veritabanı | Hesap, çalışma alanı, proje, görev ve ilgili bilgileri saklamak |
| Arka plan işlemleri | Bildirim ve e-posta gibi işleri yürütmek |
| ML servisi | Görev gecikme riskini değerlendirmeye yönelik denemeler yapmak |

**Kullandığımız başlıca teknolojiler:** Web tarafında Next.js ve TypeScript; sunucu tarafında NestJS ve Prisma; veri ve arka plan işlemlerinde PostgreSQL ve Redis; Android tarafında Kotlin ve Jetpack Compose; deneysel makine öğrenmesi servisinde FastAPI ve scikit-learn.

### Makine öğrenmesi yaklaşımı

Amacımız, teslim tarihine kalan süre ve görevi üstlenen kişinin iş yükü gibi bilgilerden yararlanarak gecikme riski taşıyan görevleri belirlemeyi araştırmak.

Bu özellik deneysel aşamadadır. Şu anki örnek veriler gerçek hayattaki tahmin başarısını göstermek için yeterli değildir. Bu nedenle TaskFlow'un doğrulanmış gecikme olasılıkları sunduğunu iddia etmiyoruz.

### Proje belgeleri

- [Ürün analizi ve yol haritası](analysis/product_overview_and_roadmap.md) — ürünün amacı, temel kullanıcı akışı ve geliştirme öncelikleri.
- [Ayrıntılı iş akışları ve gereksinimler](analysis/product_workflows_requirements.md) — gereksinimler, kabul senaryoları, teknik bulgular ve test notları.

### Geliştirme durumu

TaskFlow'u adım adım geliştiriyoruz. Kodda bulunan bir özellik ile test edilmiş ve gerçek kullanıcıların kullanımına hazır bir özelliği birbirinden ayrı değerlendiriyoruz. Güncel bulgular ve tamamlanması gereken işler için ayrıntılı gereksinim belgesine bakabilirsiniz.

---

<p align="center">
  <a href="#english">Back to English ↑</a> · <a href="#türkçe">Türkçe bölümüne git</a>
</p>
