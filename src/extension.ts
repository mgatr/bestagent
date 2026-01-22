import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('BestAgent is now active!');

    // Register the webview provider
    const provider = new ClineViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'cline-assistant.chatView',
            provider
        )
    );

    // Register command to open chat
    context.subscriptions.push(
        vscode.commands.registerCommand('cline-assistant.openChat', () => {
            vscode.commands.executeCommand('workbench.view.extension.cline-assistant');
        })
    );
}

export function deactivate() {}

class ClineViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private conversationHistory: Array<{ role: string; content: string }> = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    private async callAI(settings: any, message: string): Promise<string> {
        const { apiKey, model, apiEndpoint } = settings;

        // Add message to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: message
        });

        // Determine which provider to use based on model
        if (model.startsWith('gpt-')) {
            return await this.callOpenAI(apiKey, model, apiEndpoint || 'https://api.openai.com/v1');
        } else if (model.startsWith('claude-')) {
            return await this.callAnthropic(apiKey, model);
        } else if (model.startsWith('deepseek-')) {
            return await this.callDeepSeek(apiKey, model);
        } else if (model.startsWith('gemini-')) {
            return await this.callGemini(apiKey, model);
        } else {
            throw new Error('Desteklenmeyen model türü');
        }
    }

    private async callOpenAI(apiKey: string, model: string, endpoint: string): Promise<string> {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: this.conversationHistory,
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API Hatası: ${response.status}`);
        }

        const data: any = await response.json();
        const assistantMessage = data.choices[0].message.content;

        // Add assistant response to history
        this.conversationHistory.push({
            role: 'assistant',
            content: assistantMessage
        });

        return assistantMessage;
    }

    private async callAnthropic(apiKey: string, model: string): Promise<string> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                messages: this.conversationHistory,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API Hatası: ${response.status}`);
        }

        const data: any = await response.json();
        const assistantMessage = data.content[0].text;

        // Add assistant response to history
        this.conversationHistory.push({
            role: 'assistant',
            content: assistantMessage
        });

        return assistantMessage;
    }

    private async callDeepSeek(apiKey: string, model: string): Promise<string> {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: this.conversationHistory,
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API Hatası: ${response.status}`);
        }

        const data: any = await response.json();
        const assistantMessage = data.choices[0].message.content;

        // Add assistant response to history
        this.conversationHistory.push({
            role: 'assistant',
            content: assistantMessage
        });

        return assistantMessage;
    }

    private async callGemini(apiKey: string, model: string): Promise<string> {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: this.conversationHistory[this.conversationHistory.length - 1].content
                    }]
                }]
            })
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API Hatası: ${response.status}`);
        }

        const data: any = await response.json();
        const assistantMessage = data.candidates[0].content.parts[0].text;

        // Add assistant response to history
        this.conversationHistory.push({
            role: 'assistant',
            content: assistantMessage
        });

        return assistantMessage;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    const userMessage = data.value;
                    const settings = data.settings;

                    // Echo back the message
                    webviewView.webview.postMessage({
                        type: 'addMessage',
                        message: {
                            role: 'user',
                            content: userMessage
                        }
                    });

                    // Show loading state
                    webviewView.webview.postMessage({
                        type: 'setLoading',
                        value: true
                    });

                    try {
                        // Call AI API
                        const response = await this.callAI(settings, userMessage);

                        webviewView.webview.postMessage({
                            type: 'addMessage',
                            message: {
                                role: 'assistant',
                                content: response
                            }
                        });
                    } catch (error: any) {
                        webviewView.webview.postMessage({
                            type: 'addMessage',
                            message: {
                                role: 'assistant',
                                content: `❌ Hata: ${error.message || 'API çağrısı başarısız oldu.'}`
                            }
                        });
                    } finally {
                        webviewView.webview.postMessage({
                            type: 'setLoading',
                            value: false
                        });
                    }
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BestAgent</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            height: 100vh;
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
            position: relative;
        }

        .settings-btn {
            position: fixed;
            top: 12px;
            right: 12px;
            z-index: 100;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 6px;
            cursor: pointer;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .settings-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .settings-btn:active {
            transform: scale(0.95);
        }

        .settings-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.6);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.2s ease;
        }

        .settings-modal.show {
            display: flex;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }

        .settings-content {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            animation: slideUp 0.3s ease;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        @keyframes slideUp {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .settings-header h2 {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .close-btn {
            background: none;
            border: none;
            padding: 4px;
            cursor: pointer;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s ease;
        }

        .close-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .settings-section {
            margin-bottom: 20px;
        }

        .settings-label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 8px;
        }

        .settings-input,
        .settings-select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 6px;
            font-family: inherit;
            font-size: 13px;
            transition: all 0.2s ease;
        }

        .settings-input:focus,
        .settings-select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px rgba(14, 99, 156, 0.2);
        }

        .settings-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
            line-height: 1.4;
        }

        .save-btn {
            width: 100%;
            padding: 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            margin-top: 8px;
        }

        .save-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .save-btn:active {
            transform: translateY(0);
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 56px 16px 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .message {
            display: flex;
            flex-direction: column;
            gap: 8px;
            animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(15px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message-header {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            padding-left: 4px;
        }

        .message-content {
            padding: 12px 16px;
            border-radius: 12px;
            line-height: 1.6;
            font-size: var(--vscode-font-size);
            font-family: var(--vscode-font-family);
            position: relative;
        }

        .message.user .message-content {
            background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
            color: var(--vscode-button-foreground);
            border-radius: 12px 12px 2px 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        }

        .message.assistant .message-content {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 12px 12px 12px 2px;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }

        .input-container {
            padding: 16px 20px 20px;
            background-color: var(--vscode-sideBar-background);
        }

        .input-wrapper {
            display: flex;
            gap: 12px;
            align-items: flex-end;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            border: 1.5px solid var(--vscode-input-border);
            border-radius: 14px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }

        .input-wrapper:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px rgba(14, 99, 156, 0.12), 0 4px 16px rgba(0, 0, 0, 0.12);
        }

        textarea {
            flex: 1;
            min-height: 22px;
            max-height: 120px;
            padding: 8px 4px;
            border: none;
            background-color: transparent;
            color: var(--vscode-input-foreground);
            resize: none;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            line-height: 1.5;
        }

        textarea:focus {
            outline: none;
        }

        textarea::placeholder {
            color: var(--vscode-input-placeholderForeground);
            opacity: 0.7;
        }

        #sendButton {
            padding: 0;
            width: 38px;
            height: 38px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        #sendButton:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: scale(1.03);
        }

        #sendButton:active {
            transform: scale(0.97);
        }

        #sendButton:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        button:not(#sendButton) {
            padding: 10px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        button:not(#sendButton):hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        button:not(#sendButton):active {
            transform: translateY(0);
        }

        button:not(#sendButton):disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            padding: 32px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.6;
        }

        .empty-state h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        .empty-state p {
            font-size: 13px;
            line-height: 1.5;
        }

        /* Scrollbar styling */
        .chat-container::-webkit-scrollbar {
            width: 10px;
        }

        .chat-container::-webkit-scrollbar-track {
            background: var(--vscode-editor-background);
        }

        .chat-container::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 5px;
        }

        .chat-container::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        /* Loading indicator */
        .loading-indicator {
            display: none;
            padding: 12px;
            gap: 8px;
            align-items: center;
        }

        .loading-indicator.show {
            display: flex;
        }

        .loading-dots {
            display: flex;
            gap: 4px;
        }

        .loading-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--vscode-button-background);
            animation: bounce 1.4s infinite ease-in-out both;
        }

        .loading-dot:nth-child(1) {
            animation-delay: -0.32s;
        }

        .loading-dot:nth-child(2) {
            animation-delay: -0.16s;
        }

        @keyframes bounce {
            0%, 80%, 100% {
                transform: scale(0.8);
                opacity: 0.5;
            }
            40% {
                transform: scale(1);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <button class="settings-btn" id="settingsBtn" title="Ayarlar">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="3" cy="8" r="1.5"/>
            <circle cx="8" cy="8" r="1.5"/>
            <circle cx="13" cy="8" r="1.5"/>
        </svg>
    </button>

    <!-- Settings Modal -->
    <div class="settings-modal" id="settingsModal">
        <div class="settings-content">
            <div class="settings-header">
                <h2>⚙️ Ayarlar</h2>
                <button class="close-btn" id="closeBtn">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                    </svg>
                </button>
            </div>

            <div class="settings-section">
                <label class="settings-label">🔑 API Key</label>
                <input
                    type="password"
                    class="settings-input"
                    id="apiKeyInput"
                    placeholder="sk-... (OpenAI, Anthropic vb.)"
                />
                <p class="settings-description">
                    API anahtarınızı girin. Güvenli olarak localStorage'da saklanacaktır.
                </p>
            </div>

            <div class="settings-section">
                <label class="settings-label">🤖 AI Modeli</label>
                <select class="settings-select" id="modelSelect">
                    <option value="">Model seçin...</option>
                    <optgroup label="OpenAI">
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </optgroup>
                    <optgroup label="Anthropic">
                        <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                        <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                        <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                    </optgroup>
                    <optgroup label="Google">
                        <option value="gemini-pro">Gemini Pro</option>
                        <option value="gemini-pro-vision">Gemini Pro Vision</option>
                    </optgroup>
                    <optgroup label="DeepSeek">
                        <option value="deepseek-chat">DeepSeek Chat</option>
                        <option value="deepseek-coder">DeepSeek Coder</option>
                        <option value="deepseek-reasoner">DeepSeek Reasoner (R1)</option>
                    </optgroup>
                </select>
                <p class="settings-description">
                    Kullanmak istediğiniz AI modelini seçin. Kullandıkça ödeme yapacaksınız.
                </p>
            </div>

            <div class="settings-section">
                <label class="settings-label">🌐 API Endpoint (Opsiyonel)</label>
                <input
                    type="text"
                    class="settings-input"
                    id="apiEndpointInput"
                    placeholder="https://api.openai.com/v1"
                />
                <p class="settings-description">
                    Varsayılan: OpenAI endpoint. Kendi API endpoint'inizi kullanabilirsiniz.
                </p>
            </div>

            <button class="save-btn" id="saveBtn">💾 Kaydet</button>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h2>Hoş Geldiniz!</h2>
            <p>Bir şey sormak için aşağıdaki metin kutusuna yazın ve Enter'a basın.</p>
        </div>
        <div class="loading-indicator" id="loadingIndicator">
            <div class="loading-dots">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
            <span style="font-size: 12px; color: var(--vscode-descriptionForeground);">AI yanıt yazıyor...</span>
        </div>
    </div>

    <div class="input-container">
        <div class="input-wrapper">
            <textarea
                id="messageInput"
                placeholder="Mesajınızı yazın..."
                rows="1"
            ></textarea>
            <button id="sendButton" title="Gönder">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M15.854 7.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708-.708L14.293 8.5H.5a.5.5 0 0 1 0-1h13.793L8.146 1.354a.5.5 0 1 1 .708-.708l7 7z"/>
                </svg>
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeBtn = document.getElementById('closeBtn');
        const saveBtn = document.getElementById('saveBtn');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const modelSelect = document.getElementById('modelSelect');
        const apiEndpointInput = document.getElementById('apiEndpointInput');
        const loadingIndicator = document.getElementById('loadingIndicator');

        // Load saved settings
        const state = vscode.getState() || {};
        if (state.apiKey) apiKeyInput.value = state.apiKey;
        if (state.model) modelSelect.value = state.model;
        if (state.apiEndpoint) apiEndpointInput.value = state.apiEndpoint;

        // Settings modal handlers
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('show');
        });

        closeBtn.addEventListener('click', () => {
            settingsModal.classList.remove('show');
        });

        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('show');
            }
        });

        saveBtn.addEventListener('click', () => {
            const settings = {
                apiKey: apiKeyInput.value.trim(),
                model: modelSelect.value,
                apiEndpoint: apiEndpointInput.value.trim() || 'https://api.openai.com/v1'
            };

            // Save to state
            vscode.setState(settings);

            // Show success message
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✅ Kaydedildi!';
            saveBtn.style.backgroundColor = '#4caf50';

            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.backgroundColor = '';
                settingsModal.classList.remove('show');
            }, 1500);
        });

        // Auto-resize textarea
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) return;

            // Check if API key and model are set
            const currentState = vscode.getState() || {};
            if (!currentState.apiKey || !currentState.model) {
                // Show error message in chat
                const emptyState = chatContainer.querySelector('.empty-state');
                if (emptyState) {
                    emptyState.remove();
                }

                addMessageToChat({
                    role: 'assistant',
                    content: '⚠️ Lütfen önce ayarlardan API anahtarınızı ve AI modelini yapılandırın.'
                });
                return;
            }

            // Clear empty state on first message
            const emptyState = chatContainer.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }

            // Send message to extension with settings
            vscode.postMessage({
                type: 'sendMessage',
                value: message,
                settings: currentState
            });

            // Clear input
            messageInput.value = '';
            messageInput.style.height = 'auto';
            messageInput.focus();
        }

        // Send on Enter (Shift+Enter for new line)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendButton.addEventListener('click', sendMessage);

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'addMessage':
                    addMessageToChat(message.message);
                    break;
                case 'setLoading':
                    if (message.value) {
                        loadingIndicator.classList.add('show');
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    } else {
                        loadingIndicator.classList.remove('show');
                    }
                    break;
            }
        });

        function addMessageToChat(message) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${message.role}\`;

            const header = document.createElement('div');
            header.className = 'message-header';
            header.textContent = message.role === 'user' ? '👤 Siz' : '🤖 Assistant';

            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = message.content;

            messageDiv.appendChild(header);
            messageDiv.appendChild(content);
            chatContainer.appendChild(messageDiv);

            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    </script>
</body>
</html>`;
    }
}
