# Thunderbird Mail MCP for Codex

[English installation and usage](../README.md)

Codex'i bilgisayarınızda açık olan Thunderbird'e bağlar. Thunderbird'de tanımlı hesapları listeler, e-postaları arar ve okur, seçilen gelen iletileri okundu yapar ve yeni ileti, yanıt veya iletme taslağı açar.

Python sunucusu Codex ile standart giriş/çıkış üzerinden haberleşir. Thunderbird eklentisi ise `127.0.0.1` üzerindeki, bağlantı anahtarıyla korunan yerel köprüye bağlanır. Kurulum, her kullanıcıya özel bir anahtar ve kişisel eklenti dosyası üretir.

## Gereksinimler

- SQLite desteği bulunan **Python 3.10 veya üzeri**.
- Hesapları tanımlanmış ve eşitlenmiş **Thunderbird 128 veya üzeri**. Kullanım sırasında açık olmalıdır.
- Yerel stdio MCP sunucularını destekleyen bir Codex istemcisi.
- Thunderbird'e dosyadan eklenti yükleyebilme yetkisi.

İlk canlı bağlantı Windows üzerinde kullanıldı. Kurulum betiği macOS ve Linux için de standart kullanıcı klasörlerini seçer. Bu sistemlerdeki masaüstü bağlantılarının ayrıca doğrulanması gerekir.

## Kurulum

### 1. Projeyi indirin

GitHub'da **Code → Download ZIP** seçeneğine tıklayın. ZIP'i çıkarın ve proje klasöründe bir terminal açın. Git kullanıyorsanız aşağıdaki komutları çalıştırabilirsiniz.

```sh
git clone https://github.com/HeloqRam/Thunderbird-Mail-MCP-Codex.git
cd Thunderbird-Mail-MCP-Codex
```

### 2. Kişisel kurulum dosyalarını üretin

Windows üzerinde çalıştırın.

```powershell
py -3 setup.py
```

macOS veya Linux üzerinde çalıştırın.

```sh
python3 setup.py
```

Betiğin sonunda eklenti ve Codex yapılandırma dosyasının tam yolu gösterilir.

| Sistem | Varsayılan kurulum klasörü |
| --- | --- |
| Windows | `%LOCALAPPDATA%\ThunderbirdMailMCP` |
| macOS | `~/Library/Application Support/ThunderbirdMailMCP` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/thunderbird-mail-mcp` |

Bu klasörde `bridge.py`, `connection.json`, `Thunderbird-Mail-MCP.xpi` ve `codex-mcp.toml` oluşur. Özet geçmişi kullanılınca `summaries.sqlite3` da oluşturulur. Kurulum dosyaları kaynak kod klasörünün dışında tutulur.

Farklı klasör veya bağlantı noktası seçmek için aşağıdaki örneği kullanabilirsiniz.

```powershell
py -3 setup.py --data-dir "C:\LocalTools\ThunderbirdMailMCP" --port 28747
```

Kaynak kod klasörünün dışında, kişisel bir klasör seçin. Kurulumdan sonra bu klasörü aynı yerde tutun.

### 3. Thunderbird eklentisini yükleyin

1. Thunderbird'de **Eklentiler ve Temalar** bölümünü açın.
2. Dişli menüsünden **Dosyadan Eklenti Yükle** seçeneğini seçin.
3. Kurulumun oluşturduğu `Thunderbird-Mail-MCP.xpi` dosyasını seçin. Tam yolu terminal çıktısında gösterilir.
4. İstenen izinleri inceleyip onaylayın.

Eklenti; hesapları listelemek için `accountsRead`, posta aramak ve okumak için `messagesRead`, okundu durumunu değiştirmek için `messagesUpdate`, taslak açmak için `compose` izinlerini kullanır. Yerel HTTP köprüsüne erişim izni de gerekir.

[Thunderbird eklenti yükleme kılavuzu](https://support.mozilla.org/en-US/kb/installing-addon-thunderbird)

### 4. Codex bağlantısını ekleyin

Oluşturulan `codex-mcp.toml` dosyasını metin düzenleyicide açın. İçindeki `[mcp_servers.thunderbird-mail]` bölümünün tamamını Codex yapılandırmanıza ekleyin.

- Windows'ta varsayılan dosya `%USERPROFILE%\.codex\config.toml` konumundadır.
- macOS ve Linux'ta varsayılan dosya `~/.codex/config.toml` konumundadır.
- `CODEX_HOME` değişkeni kullanıyorsanız yapılandırma klasörü ona göre değişir.

Aynı sunucu bölümü zaten varsa onu güncelleyin. Diğer yapılandırma bölümlerini koruyun. Kurulumun ürettiği örnek, bilgisayarınızdaki Python ve köprü dosyasının gerçek yollarını içerir.

Aşağıdaki bölüm yalnızca genel bir örnektir.

```toml
[mcp_servers.thunderbird-mail]
command = "C:/Python312/python.exe"
args = ["-u", "C:/LocalTools/ThunderbirdMailMCP/bridge.py"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Dosyayı kaydedip Codex istemcisini tamamen kapatın ve yeniden açın. Thunderbird açık kalsın. Codex, sunucuya bağlanırken Python köprüsünü başlatır.

[Resmî Codex MCP yapılandırma belgesi](https://learn.chatgpt.com/docs/extend/mcp)

### 5. Bağlantıyı deneyin

Codex'e aşağıdaki isteği yazın.

> Thunderbird MCP bağlantısını kontrol et ve posta hesaplarımı listele.

Ardından örnek olarak şunları isteyebilirsiniz.

> Dünden beri gelen yeni okunmamış mailleri özetle. Göndereni, posta kutusunu ve tarihini göster.

> Bu özetteki gelen iletileri okundu olarak işaretle.

> recipient@example.com adresine Toplantı konulu ve Yarın görüşebilir miyiz? içerikli bir taslak hazırla.

Taslak Thunderbird'de açılır. İçeriği ve alıcıları kontrol edip **Gönder** düğmesine kendiniz basarsınız.

## Araçlar ve çalışma biçimi

| Araç | İşlev |
| --- | --- |
| `status` | Eklenti bağlantısını, hesap sayısını ve sürümü gösterir. |
| `list_accounts` | Hesapları ve gönderici kimliklerini listeler. |
| `search_messages` | Hesap, gönderen, konu ve ileti tarihine göre sayfalı arama yapar. |
| `read_messages` | En fazla 8 iletinin metnini ve ek dosya bilgilerini okur. |
| `mark_read` | En fazla 25 seçili gelen iletiyi okundu yapar ve sonucu doğrular. |
| `remember_summarized` | Özete alınan ileti anahtarlarının SHA-256 özetlerini yerel geçmişe kaydeder. |
| `prepare_draft` | Belirlenen gönderici kimliğiyle yeni, yanıt veya iletme taslağı açar. |

Arama varsayılan olarak okunmamış iletileri getirir. Spam, silinmiş, gönderilmiş, giden kutusu, taslak ve şablon klasörleri varsayılan kapsamın dışındadır. `unread=false` hem okunmuş hem okunmamış iletileri kapsar. `include_other_folders=true` diğer klasörleri de dahil eder.

Sonuçlarda hesap, klasör, gönderen, konu, ileti tarihi, okundu durumu ve kararlı bir anahtar bulunur. `next_offset` boş olana kadar sayfalama yapılmalıdır. `new_only=true` daha önce özetlenen iletileri atlar. Yalnızca gerçekten özetlenen kayıtların anahtarları geçmişe yazılmalıdır.

`mark_read`, yeni bir aramadan alınmış `id` ve ona karşılık gelen `key` değerlerini ister. Tarih aralığı için aynı `since` değeri de gönderilmelidir. Her ileti için `marked_read`, `already_read`, `skipped` veya `error` sonucu döner. Kısmi sonuçları tekrar denemeden önce kontrol edin.

Tarih alanı iletinin Date başlığıdır. Sunucuya geliş zamanını veren Received başlığının okunması bu sürümdeki araçların kapsamı dışındadır. Metinler 12.000 karakterle sınırlanır, daha uzun içerikte `body_truncated` işareti döner. Eklerin adı, türü ve boyutu listelenir. Ek içeriğini incelemek ve Excel oluşturmak için istemcide ek araçlar gerekir.

## Gizlilik ve yerel dosyalar

Posta hesapları ve şifreleri Thunderbird tarafından yönetilir. Kurulum yalnızca yerel bağlantı anahtarı üretir. `connection.json` ve kişisel `.xpi` dosyası bu anahtarı içerdiği için gizli tutulmalıdır.

Köprü yalnızca bilgisayarın yerel döngü adresinde dinler. Host başlığını ve bağlantı anahtarını kontrol eder. HTTP istek günlüğü kapalıdır. İstediğiniz posta içeriği MCP aracılığıyla yapay zekâ istemcisine aktarılır, bu nedenle istemcinin veri işleme kuralları geçerlidir. Özet geçmişi seçilen ileti anahtarlarının SHA-256 değerlerini saklar.

Depoda kaynak kod, dokümantasyon ve yapay posta verileri kullanan testler bulunur. Kişisel bağlantı dosyaları, üretilmiş eklentiler, posta profilleri, posta dışa aktarımları, ekler ve raporlar sürüm kontrolünden dışlanır.

## Güncelleme

Yeni kaynak kodu indirip kurulumu **aynı veri klasörüyle** tekrar çalıştırın. Mevcut bağlantı ayarları ve özet geçmişi korunur. Yeni üretilen eklentiyi Thunderbird'e tekrar yükleyin ve Codex'i yeniden başlatın.

Bağlantı noktasını değiştirmek için farklı bir veri klasörü ve `--port` kullanın. Yeni eklentiyi yükleyip o kuruluma ait Codex bölümünü kullanın.

## Sorun giderme

| Sorun | Kontrol |
| --- | --- |
| Python bulunamıyor | Python 3.10+ kurun. `py -3 --version` veya `python3 --version` ile kontrol edin. |
| MCP araçları görünmüyor | Dosya yollarını ve TOML bölümünü kontrol edin, ardından Codex'i yeniden başlatın. |
| Eklenti bağlı görünmüyor | Thunderbird'ü açık tutun. Eklentinin etkin ve aynı kurulum anahtarıyla üretilmiş olduğunu kontrol edin. |
| Bağlantı noktası kullanılıyor | Çakışan hizmeti durdurun veya yeni bir klasöre farklı portla kurulum oluşturun. |
| Bazı klasörler aramada yok | İlgili istek için `include_other_folders=true` kullanın. |
| İleti okunamıyor | Thunderbird'deki eşitlemeyi ve iletinin erişilebilirliğini kontrol edin. İlgili ID için hata döner. |
| İstek zaman aşımına uğradı | Tekrarlamadan önce Thunderbird'ü kontrol edin. Taslak açılması veya okundu işlemi başlamış olabilir. |

## Geliştirme ve test

```sh
python -m unittest discover -s tests -p "test_*.py" -v
node --test tests/extension.test.cjs
```

Testler yapay posta kayıtları ve geçici klasörler kullanır. Eklenti testleri için Node.js 18+ gerekir. Normal kullanımda Python standart kütüphanesi yeterlidir.

[Thunderbird posta API belgesi](https://webextension-api.thunderbird.net/en/mv2/messages.html)
