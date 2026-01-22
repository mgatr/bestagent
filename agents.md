# BestAgent - Proje Dokümantasyonu

## 🎯 Genel Bakış

BestAgent, VSCode için geliştirilmiş, yapay zeka destekli bir asistan eklentisidir. OpenAI, Anthropic (Claude), Google (Gemini) ve DeepSeek gibi çeşitli AI modellerini destekler.

## ✨ Yeni Eklenen Özellikler

### 1. 🚀 Otomatik Proje Tanıma (Startup)
- **Bot ilk açıldığında otomatik olarak projeyi tarar ve bilgileri gösterir!**
- Workspace klasörlerini, açık dosyaları ve proje yapısını otomatik tespit eder
- Her yeni workspace açıldığında hoş geldiniz mesajı ile birlikte proje bilgisi gösterilir
- Kullanıcı "workspace", "proje bilgisi" veya "proje yapısı" yazdığında otomatik güncellenir

### 2. 🔍 Akıllı Proje Arama Sistemi
- **Üst sağ köşede görünür arama butonu** (🔍 ikonu)
- **AI otomatik dosya arama yapabilir**: Sadece dosya adı yazmanız yeterli!
  - Örnek: "Button.tsx" → AI otomatik arar
  - Örnek: "api dosyası bul" → AI otomatik arar
- Proje genelinde dosya arama yapabilir
- `node_modules` gibi gereksiz klasörleri otomatik filtreler
- Arama sonuçlarını anlaşılır şekilde listeler

### 3. 💾 Analiz Kaydetme (agents.md)
- Bot, proje analizi ve sohbet geçmişini `agents.md` dosyasına kaydedebilir
- Ayarlar menüsünden "Analizi agents.md'ye Kaydet" butonuyla erişilebilir
- Zaman damgalı, detaylı analiz raporları oluşturur

### 4. 🔒 TAM Kalıcı Sohbet Geçmişi
- **ARTIK HİÇBİR TIKLAMA SOHBET GEÇMİŞİNİ SİLMEZ!**
- Sohbet geçmişi `workspaceState` ile kalıcı şekilde saklanır
- Sidebar kapatılıp açılsa bile sohbet kaybolmaz
- Diğer sekmelere geçildiğinde veya VSCode yeniden başlatıldığında bile sohbet kalır
- `retainContextWhenHidden: true` ile webview içeriği her zaman korunur
- Sayfa yüklendiğinde önceki tüm sohbet otomatik yüklenir
- **Sohbeti sadece "Sohbeti Temizle" butonu ile manuel olarak silebilirsiniz**

### 5. ⚡ Hızlı İşlem Butonları
Ayarlar menüsüne eklenen yeni butonlar:
- **📁 Workspace Bilgisi Göster**: Mevcut projenin yapısını anında gösterir
- **💾 Analizi agents.md'ye Kaydet**: Tüm analizi kaydeder
- **🗑️ Sohbeti Temizle**: Sohbet geçmişini manuel olarak sıfırlar (onay ister)

## 🛠️ Teknik Detaylar

### Yeni Metodlar

#### `getWorkspaceInfo()`
```typescript
private async getWorkspaceInfo(): Promise<string>
```
- Workspace klasörlerini tarar
- Açık dosyaları listeler
- Ana dosya/klasör yapısını gösterir

#### `searchInProject(query: string)`
```typescript
private async searchInProject(query: string): Promise<string>
```
- VSCode'un `findFiles` API'sini kullanır
- Dosya adına göre arama yapar
- Sonuçları filtreleyerek döner

#### `saveProjectAnalysis()`
```typescript
private async saveProjectAnalysis(): Promise<string>
```
- Workspace bilgisi toplar
- Sohbet geçmişini ekler
- `agents.md` dosyasına yazar

### Kalıcı Depolama

Sohbet geçmişi şu şekilde saklanır:
```typescript
// Kaydetme
await this._context.workspaceState.update('conversationHistory', this.conversationHistory);

// Yükleme
this.conversationHistory = context.workspaceState.get('conversationHistory', []);
```

### WebView Yapılandırması

```typescript
vscode.window.registerWebviewViewProvider(
    'cline-assistant.chatView',
    provider,
    {
        webviewOptions: {
            retainContextWhenHidden: true // Önemli!
        }
    }
)
```

## 📋 Kullanım Kılavuzu

### 🚀 İlk Kullanım
1. Extension'ı yükleyin ve VSCode'u açın
2. Sol sidebar'da BestAgent ikonuna tıklayın
3. **Bot otomatik olarak projenizi tarayacak ve bilgileri gösterecek!**
4. Ayarlar menüsünden (⚙️) API Key ve Model yapılandırması yapın

### 📁 Workspace Bilgisi Görme
**Otomatik:** Bot açılışta otomatik gösterir
**Manuel:**
1. Ayarlar menüsünü açın (⚙️ butonu)
2. "📁 Workspace Bilgisi Göster" butonuna tıklayın
3. VEYA sohbette "workspace bilgisi", "proje yapısı" yazın

### 🔍 Akıllı Proje Arama
**Yöntem 1 - AI Otomatik Arama:**
- Direkt dosya adı yazın: "Button.tsx"
- Veya sorarak arayın: "api dosyası bul"
- AI otomatik arama yapacak!

**Yöntem 2 - Manuel Arama:**
1. 🔍 Arama butonuna tıklayın (üst sağ köşe)
2. Dosya adını mesaj olarak yazın
3. Sonuçları anında görün

### 💾 Analiz Kaydetme
1. Ayarlar menüsünü açın (⚙️)
2. "💾 Analizi agents.md'ye Kaydet" butonuna tıklayın
3. Proje kök dizininde `agents.md` dosyası oluşturulur
4. Tüm sohbet geçmişi ve proje analizi kaydedilir

### 🗑️ Sohbet Temizleme
⚠️ **Not:** Sohbet artık otomatik temizlenmiyor!
1. Ayarlar menüsünü açın (⚙️)
2. "🗑️ Sohbeti Temizle" butonuna tıklayın
3. Onaylayın (sadece bu şekilde temizlenir)

## 🎨 UI İyileştirmeleri

- Üst toolbar artık birden fazla buton içeriyor
- Butonlar arasında tutarlı boşluklar ve stil
- Hover efektleri ve geçiş animasyonları
- Responsive tasarım

## 🔐 Güvenlik

- API anahtarları `vscode.setState()` ile güvenli şekilde saklanır
- Sohbet geçmişi workspace bazında saklanır (global değil)
- Hassas veriler localStorage'da değil, VSCode'un kendi sisteminde tutulur

## 🚀 Kurulum ve Çalıştırma

```bash
# Bağımlılıkları yükle
npm install

# Derleme
npm run compile

# VSIX paketi oluştur
npx vsce package
```

## 📝 Gelecek Geliştirmeler

- [ ] Syntax highlighting desteği
- [ ] Kod snippet'leri kaydetme
- [ ] Multi-workspace desteği
- [ ] Export/import sohbet geçmişi
- [ ] Özel komutlar sistemi
- [ ] Proje yapısı görselleştirme

## 🤖 Desteklenen AI Modelleri

### OpenAI
- GPT-4o
- GPT-4o Mini
- GPT-4 Turbo
- GPT-3.5 Turbo

### Anthropic
- Claude 3.5 Sonnet
- Claude 3 Opus
- Claude 3 Haiku

### Google
- Gemini Pro
- Gemini Pro Vision

### DeepSeek
- DeepSeek Chat
- DeepSeek Coder
- DeepSeek Reasoner (R1)

## 📞 Destek

Herhangi bir sorun yaşarsanız veya öneriniz varsa lütfen bize bildirin!

## 🐛 Düzeltilen Sorunlar

### Chat Taşma Sorunu
- Uzun mesajlar artık chat alanı dışına taşmıyor
- `word-wrap`, `word-break`, `overflow-wrap` CSS özellikleri eklendi
- Mesajlar otomatik olarak satır kaydırma yapıyor
- Horizontal scroll sadece gerektiğinde görünüyor

### Tekrarlı Proje Tarama
- Proje bilgisi artık **sadece ilk açılışta** gösteriliyor
- Her sidebar açılışında tekrar tarama yapılmıyor
- `hasShownWelcome` flag'i ile kontrol ediliyor
- Sohbet temizlendiğinde flag sıfırlanıyor

### Sohbet Geçmişi Korunması
- Artık **hiçbir tıklama sohbeti silmiyor**
- `retainContextWhenHidden: true` ile webview korunuyor
- Workspace state kullanılarak kalıcı depolama
- Sadece manuel "Sohbeti Temizle" butonu ile silinebilir

---

**Son Güncelleme:** 2026-01-22 (v2 - Sorun Düzeltmeleri)
**Versiyon:** 0.0.1
**Geliştirici:** BestAgent Team
