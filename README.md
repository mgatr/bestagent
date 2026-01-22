# BestAgent - VS Code Extension

Modern AI asistan arayüzü ile gerçek zamanlı AI desteği. OpenAI, Anthropic Claude, Google Gemini ve DeepSeek modellerini destekler.

## Kurulum ve Test

### 1. Bağımlılıkları Yükle
```bash
npm install
```

### 2. Compile Et
```bash
npm run compile
```

### 3. Extension'ı Test Et

VS Code'da bu klasörü açın ve **F5** tuşuna basın veya:

1. VS Code'da bu projeyi açın
2. Run and Debug paneline gidin (Ctrl+Shift+D / Cmd+Shift+D)
3. "Run Extension" seçeneğini seçin
4. F5'e basın veya yeşil play butonuna tıklayın

Yeni bir VS Code penceresi açılacak. Bu pencerede:

1. Sol taraftaki Activity Bar'da **💬** (comment) ikonuna tıklayın
2. "BestAgent" paneli açılacak
3. Sağ üstteki dişli ikonuna tıklayarak ayarları açın
4. API anahtarınızı ve kullanmak istediğiniz AI modelini girin
5. Kaydet butonuna tıklayın
6. Artık AI ile sohbet edebilirsiniz!

## API Key Nasıl Alınır?

- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/settings/keys
- **Google Gemini**: https://aistudio.google.com/app/apikey
- **DeepSeek**: https://platform.deepseek.com/api_keys

## Özellikler

✅ Modern ve şık chat arayüzü
✅ Gerçek AI entegrasyonu (kullandıkça öde)
✅ Çoklu AI provider desteği:
   - OpenAI (GPT-4o, GPT-4 Turbo, GPT-3.5)
   - Anthropic Claude (3.5 Sonnet, Opus, Haiku)
   - Google Gemini (Pro, Pro Vision)
   - DeepSeek (Chat, Coder, Reasoner R1)
✅ Konuşma geçmişi takibi
✅ Loading animasyonları
✅ Hata yönetimi
✅ API key güvenliği (localStorage)
✅ Özelleştirilebilir API endpoint
✅ VS Code teması ile uyumlu
✅ Responsive tasarım

## Geliştirme

Watch mode ile geliştirme:
```bash
npm run watch
```

Bu komut TypeScript dosyalarındaki değişiklikleri otomatik olarak compile eder.
# bestagent
