# TaskFlow AI — Ürün Analizi ve Yol Haritası

> Bu belge, TaskFlow'un ürün olarak neyi amaçladığını ve nasıl gelişeceğini herkesin anlayabileceği bir dille açıklar. Ayrıntılı teknik inceleme, test koşulları ve açık mühendislik konuları için [Ürün İş Akışları ve Gereksinim Analizi](./product_workflows_requirements.md) belgesine bakın.

## 1. TaskFlow nedir?

TaskFlow AI, küçük ve orta ölçekli ekiplerin projelerini ve günlük işlerini tek bir yerde takip edebilmesi için geliştirdiğimiz bir proje ve görev yönetimi uygulamasıdır.

Bir ekip TaskFlow ile:
- Bir çalışma alanı oluşturabilir ve ekip arkadaşlarını burada bir araya getirebilir.
- Projeler açıp bu projelere görevler ekleyebilir.
- Görevleri ekip üyelerine atayabilir, öncelik ve teslim tarihi belirleyebilir.
- Web veya Android uygulamasından işlerini takip edebilir.
- Android uygulamasında desteklenen bazı değişiklikleri internet bağlantısı yokken yapıp daha sonra eşitleyebilir.
- İlerleyen aşamalarda, görevlerin gecikme riskini geçmiş verilere dayanarak değerlendirebilir.

Amacımız yalnızca görevleri listelemek değil. Ekiplerin ne yapacağını planlamasına, işlerin durumunu takip etmesine ve olası gecikmeleri daha erken fark etmesine yardımcı olmak.

## 2. Hangi problemi çözmek istiyoruz?

Ekiplerin işleri farklı araçlara, mesajlara ve kişisel notlara dağılabiliyor. Bu durumda kimin hangi işten sorumlu olduğu, bir görevin ne durumda bulunduğu veya teslim tarihinin yaklaşıp yaklaşmadığı kolayca gözden kaçabiliyor.

TaskFlow bu bilgileri ortak bir çalışma alanında toplamak istiyor. Böylece ekip üyeleri aynı proje ve görev bilgileri üzerinden çalışabiliyor.

## 3. Kullanıcı TaskFlow'u nasıl kullanır?

Temel kullanım akışı şu şekilde:

1. Kullanıcı hesabını oluşturur veya giriş yapar.
2. Yeni bir çalışma alanı kurar ya da mevcut bir ekibe katılır.
3. Çalışma alanında bir proje oluşturur.
4. Projeye görevler ekler; görevleri kişilere atar ve teslim tarihlerini belirler.
5. Ekip üyeleri görevleri günceller, yorum yapar ve ilerlemeyi takip eder.
6. Kullanıcı aynı iş bilgilerine web ve Android uygulamasından erişir.
7. Android'de internet yoksa desteklenen değişiklikler cihazda bekletilir ve bağlantı geldiğinde gönderilmeye çalışılır.

Bu akış ürünün hedeflediği deneyimi anlatır. Buradaki her adımın tüm hata ve kullanım senaryolarıyla tamamlandığı veya canlı ortamda doğrulandığı anlamına gelmez. Mevcut geliştirme ve test durumu ayrıntılı gereksinim belgesinde tutulur.

## 4. Uygulamanın parçaları

TaskFlow birbiriyle iletişim kuran birkaç parçadan oluşur:

| Parça | Basitçe görevi |
|---|---|
| Web uygulaması | Tarayıcıdan proje ve görevleri yönetmek |
| Android uygulaması | Telefonda görevleri takip etmek ve desteklenen durumlarda çevrimdışı çalışmak |
| Sunucu (backend) | Kullanıcı, ekip, proje ve görev işlemlerinin kurallarını yürütmek |
| Veritabanı | Uygulamanın kalıcı bilgilerini saklamak |
| Arka plan işlemleri | E-posta ve bildirim gibi işleri ana ekranı bekletmeden yürütmek |
| Makine öğrenmesi servisi | Yeterli ve güvenilir veri oluştuğunda görev gecikme riskini değerlendirmek |

Web ve Android aynı ekip ve görev bilgileriyle çalışmalıdır. Bilginin asıl kaynağı sunucu ve veritabanıdır.

## 5. Yapay zekâ ve makine öğrenmesi neden var?

TaskFlow'daki makine öğrenmesi bölümünün amacı, bir görevin gecikme riski hakkında ekibe yardımcı olabilecek bir değerlendirme sunmak.

Örneğin teslim tarihine kalan süre, görev sahibinin mevcut iş yükü ve görev üzerindeki hareketlilik gibi bilgiler ileride değerlendirilebilir.

Bu özellik henüz deneysel aşamadadır. Mevcut örnek veri gerçek ekiplerin çalışma geçmişini temsil etmek için yeterli değildir. Bu nedenle bugün gerçek gecikme olasılığı veya doğrulanmış tahmin başarısı sunduğumuzu söylemiyoruz. Önce güvenilir veri, doğru ölçüm ve test sürecini tamamlamamız gerekiyor.

## 6. Geliştirme yaklaşımımız

Projeyi tek seferde tamamlanmış bir ürün gibi sunmak yerine, önemli kullanım akışlarını sırayla geliştirip doğrulamayı hedefliyoruz.

Önceliklerimiz:

1. Hesap ve oturum işlemlerini güvenilir hâle getirmek.
2. Çalışma alanı, üyelik ve kullanıcı yetkilerini netleştirmek.
3. Proje ve görev işlemlerini web ve Android'de tutarlı çalıştırmak.
4. Android çevrimdışı değişikliklerinin güvenli biçimde eşitlenmesini sağlamak.
5. Bildirimlerin ve işlem geçmişinin güvenilirliğini artırmak.
6. Makine öğrenmesi özelliğini ancak yeterli veri ve ölçüm olduğunda kullanıcıya sunmak.
7. Kurulum, yedekleme ve canlı ortam hazırlığını doğrulamak.

Bu sıra, yeni bulgulara göre değişebilir. Bir özelliğin kodda bulunması tek başına tamamlandığı anlamına gelmez; test ve doğrulama kanıtını da arıyoruz.

## 7. Ürün kapsamı

İlk sürümün odağı çalışma alanları, ekip üyeliği, projeler, görevler ve web/Android kullanım deneyimidir.

Abonelik ve ödeme, takvim bağlantıları, gelişmiş raporlar, zaman takibi ve kurumsal tek oturum açma gibi konular temel kullanım akışları oturduktan sonra değerlendirilecektir. Bunlar şu an kesinleşmiş ilk sürüm kapsamı değildir.

## 8. Belgeler

- [Ürün İş Akışları ve Gereksinim Analizi](./product_workflows_requirements.md): Ayrıntılı iş akışları, kabul koşulları, teknik bulgular, güvenlik ve test gereksinimleri.
- [Proje kaynak kodu](../): Web, Android, backend ve makine öğrenmesi servislerinin bulunduğu depo.

---

**Not:** TaskFlow geliştirme aşamasında olan bir projedir. Bu belgede ürün hedefi ile bugün doğrulanmış özellikleri birbirinden ayrı tutuyoruz. Tamamlanmamış işleri tamamlanmış gibi göstermemek, geliştirme sürecimizin önemli bir parçasıdır.
