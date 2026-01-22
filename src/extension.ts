import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('BestAgent is now active!');

    // Register the webview provider
    const provider = new ClineViewProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'cline-assistant.chatView',
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true // Keep webview state when hidden
                }
            }
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
    private _context: vscode.ExtensionContext;
    private conversationHistory: Array<{ role: string; content: string }> = [];
    private hasShownWelcome: boolean = false;

    constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._context = context;
        // Load conversation history from context
        this.conversationHistory = context.workspaceState.get('conversationHistory', []);
        // Check if we've shown welcome before
        this.hasShownWelcome = context.workspaceState.get('hasShownWelcome', false);
    }

    private async getWorkspaceInfo(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return 'Açık workspace yok.';
        }

        let info = '📁 Workspace Bilgileri:\n\n';

        for (const folder of workspaceFolders) {
            info += `📂 ${folder.name} (${folder.uri.fsPath})\n\n`;

            // Get open files
            const openFiles = vscode.window.visibleTextEditors
                .map(editor => editor.document.uri.fsPath)
                .filter(filePath => filePath.startsWith(folder.uri.fsPath));

            if (openFiles.length > 0) {
                info += '📄 Açık Dosyalar:\n';
                openFiles.forEach(file => {
                    const relativePath = path.relative(folder.uri.fsPath, file);
                    info += `  - ${relativePath}\n`;
                });
                info += '\n';
            }

            // Get project structure (main files and folders)
            try {
                const files = await vscode.workspace.fs.readDirectory(folder.uri);
                const mainFiles = files
                    .filter(([name, type]) => !name.startsWith('.') && name !== 'node_modules')
                    .slice(0, 20); // Limit to first 20 items

                if (mainFiles.length > 0) {
                    info += '📋 Ana Dosyalar/Klasörler:\n';
                    mainFiles.forEach(([name, type]) => {
                        const icon = type === vscode.FileType.Directory ? '📁' : '📄';
                        info += `  ${icon} ${name}\n`;
                    });
                }
            } catch (error) {
                info += '⚠️ Dosya listesi okunamadı.\n';
            }
        }

        return info;
    }

    private async searchInProject(query: string): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return '❌ Açık workspace yok.';
        }

        let results = `🔍 Arama Sonuçları: "${query}"\n\n`;

        try {
            // Use VS Code's built-in search
            const searchResults = await vscode.workspace.findFiles(
                `**/*${query}*`,
                '**/node_modules/**',
                50
            );

            if (searchResults.length === 0) {
                results += '❌ Sonuç bulunamadı.\n';
            } else {
                results += `✅ ${searchResults.length} dosya bulundu:\n\n`;
                searchResults.forEach(uri => {
                    const relativePath = vscode.workspace.asRelativePath(uri);
                    results += `  📄 ${relativePath}\n`;
                });
            }
        } catch (error: any) {
            results += `❌ Arama hatası: ${error.message}\n`;
        }

        return results;
    }

    private async saveProjectAnalysis(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return '❌ Açık workspace yok.';
        }

        const workspaceInfo = await this.getWorkspaceInfo();
        let analysis = `# Proje Analizi - ${new Date().toLocaleString('tr-TR')}\n\n`;
        analysis += workspaceInfo + '\n\n';
        analysis += `## Sohbet Geçmişi\n\n`;

        this.conversationHistory.forEach((msg, index) => {
            const role = msg.role === 'user' ? '👤 Kullanıcı' : '🤖 AI';
            analysis += `### ${index + 1}. ${role}\n${msg.content}\n\n`;
        });

        try {
            const agentsPath = path.join(workspaceFolders[0].uri.fsPath, 'agents.md');
            fs.writeFileSync(agentsPath, analysis, 'utf-8');
            return `✅ Analiz başarıyla kaydedildi: agents.md`;
        } catch (error: any) {
            return `❌ Kaydetme hatası: ${error.message}`;
        }
    }

    private async callAI(settings: any, message: string): Promise<string> {
        const { apiKey, model, apiEndpoint } = settings;

        // Check for special commands
        if (message.toLowerCase().includes('workspace') || message.toLowerCase().includes('proje bilgisi') || message.toLowerCase().includes('proje yapısı')) {
            const workspaceInfo = await this.getWorkspaceInfo();
            message = `${message}\n\n${workspaceInfo}`;
        }

        // Check if user is trying to search for a file (look for file extensions or search keywords)
        const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py', '.java', '.go', '.rs', '.md'];
        const searchKeywords = ['ara', 'bul', 'dosya', 'search', 'find', 'file'];
        const hasFileExtension = fileExtensions.some(ext => message.toLowerCase().includes(ext));
        const hasSearchKeyword = searchKeywords.some(keyword => message.toLowerCase().includes(keyword));

        if (hasFileExtension || (hasSearchKeyword && message.split(' ').length <= 5)) {
            // Extract the search term (remove common words)
            const searchTerm = message
                .replace(/ara|bul|dosya|search|find|file|where|nerede/gi, '')
                .trim()
                .split(' ')[0]; // Take first word

            if (searchTerm) {
                const searchResults = await this.searchInProject(searchTerm);
                return searchResults;
            }
        }

        // Add message to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: message
        });

        // Save to workspace state
        await this._context.workspaceState.update('conversationHistory', this.conversationHistory);

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

        // Save to workspace state
        await this._context.workspaceState.update('conversationHistory', this.conversationHistory);

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

        // Save to workspace state
        await this._context.workspaceState.update('conversationHistory', this.conversationHistory);

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

        // Save to workspace state
        await this._context.workspaceState.update('conversationHistory', this.conversationHistory);

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

        // Save to workspace state
        await this._context.workspaceState.update('conversationHistory', this.conversationHistory);

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

        // Load conversation history first, then show workspace info only once
        setTimeout(async () => {
            if (this.conversationHistory.length === 0 && !this.hasShownWelcome) {
                // First time - show workspace info
                const workspaceInfo = await this.getWorkspaceInfo();
                const welcomeMessage = {
                    role: 'assistant',
                    content: `🚀 BestAgent Aktif!\n\n${workspaceInfo}`
                };

                this.conversationHistory.push(welcomeMessage);
                await this._context.workspaceState.update('conversationHistory', this.conversationHistory);
                await this._context.workspaceState.update('hasShownWelcome', true);
                this.hasShownWelcome = true;

                webviewView.webview.postMessage({
                    type: 'addMessage',
                    message: welcomeMessage
                });
            } else if (this.conversationHistory.length > 0) {
                // Restore previous conversation
                webviewView.webview.postMessage({
                    type: 'loadHistory',
                    history: this.conversationHistory
                });
            }
        }, 500);

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

                case 'getWorkspaceInfo':
                    const workspaceInfo = await this.getWorkspaceInfo();
                    webviewView.webview.postMessage({
                        type: 'addMessage',
                        message: {
                            role: 'assistant',
                            content: workspaceInfo
                        }
                    });
                    break;

                case 'searchProject':
                    const searchQuery = data.value;
                    const searchResults = await this.searchInProject(searchQuery);
                    webviewView.webview.postMessage({
                        type: 'addMessage',
                        message: {
                            role: 'assistant',
                            content: searchResults
                        }
                    });
                    break;

                case 'saveAnalysis':
                    const saveResult = await this.saveProjectAnalysis();
                    webviewView.webview.postMessage({
                        type: 'addMessage',
                        message: {
                            role: 'assistant',
                            content: saveResult
                        }
                    });
                    break;

                case 'clearChat':
                    this.conversationHistory = [];
                    this.hasShownWelcome = false;
                    await this._context.workspaceState.update('conversationHistory', []);
                    await this._context.workspaceState.update('hasShownWelcome', false);
                    webviewView.webview.postMessage({
                        type: 'chatCleared'
                    });
                    break;

                case 'loadHistory':
                    // Send conversation history back to webview
                    webviewView.webview.postMessage({
                        type: 'loadHistory',
                        history: this.conversationHistory
                    });
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

        .toolbar {
            position: fixed;
            top: 8px;
            right: 8px;
            z-index: 1000;
            display: flex;
            gap: 6px;
        }

        .toolbar-btn {
            background: var(--vscode-button-background);
            border: none;
            padding: 8px;
            cursor: pointer;
            color: var(--vscode-button-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s ease;
            width: 32px;
            height: 32px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .toolbar-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: scale(1.05);
        }

        .toolbar-btn:active {
            transform: scale(0.95);
        }

        .toolbar-btn svg {
            pointer-events: none;
            width: 16px;
            height: 16px;
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
            overflow-x: hidden;
            padding: 56px 16px 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-width: 100%;
        }

        .message {
            display: flex;
            flex-direction: column;
            gap: 8px;
            animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            max-width: 100%;
            width: 100%;
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
            word-wrap: break-word;
            word-break: break-word;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            max-width: 100%;
            overflow-x: auto;
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
    <div class="toolbar">
        <button class="toolbar-btn" id="settingsBtn" title="Ayarlar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="3" cy="8" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <circle cx="13" cy="8" r="1.5"/>
            </svg>
        </button>
        <button class="toolbar-btn" id="searchBtn" title="🔍 Dosya Ara">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
        </button>
    </div>

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

            <div class="settings-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--vscode-panel-border);">
                <label class="settings-label">⚡ Hızlı İşlemler</label>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
                    <button class="save-btn" id="showWorkspaceBtn" style="background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);">
                        📁 Workspace Bilgisi Göster
                    </button>
                    <button class="save-btn" id="saveAnalysisBtn" style="background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);">
                        💾 Analizi agents.md'ye Kaydet
                    </button>
                    <button class="save-btn" id="clearChatBtn" style="background-color: #d32f2f; color: white;">
                        🗑️ Sohbeti Temizle
                    </button>
                </div>
            </div>
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
        const searchBtn = document.getElementById('searchBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeBtn = document.getElementById('closeBtn');
        const saveBtn = document.getElementById('saveBtn');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const modelSelect = document.getElementById('modelSelect');
        const apiEndpointInput = document.getElementById('apiEndpointInput');
        const loadingIndicator = document.getElementById('loadingIndicator');
        const showWorkspaceBtn = document.getElementById('showWorkspaceBtn');
        const saveAnalysisBtn = document.getElementById('saveAnalysisBtn');
        const clearChatBtn = document.getElementById('clearChatBtn');

        // Load saved settings
        const state = vscode.getState() || {};
        if (state.apiKey) apiKeyInput.value = state.apiKey;
        if (state.model) modelSelect.value = state.model;
        if (state.apiEndpoint) apiEndpointInput.value = state.apiEndpoint;

        // Load conversation history on startup
        vscode.postMessage({ type: 'loadHistory' });

        // Search button handler - show in chat
        searchBtn.addEventListener('click', () => {
            // Clear empty state if present
            const emptyState = chatContainer.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }

            // Add a system message asking for search query
            addMessageToChat({
                role: 'assistant',
                content: '🔍 Proje araması yapmak için dosya adını mesaj olarak yazın.\nÖrnek: "Button.tsx" veya "api" gibi...'
            });

            // Focus on input
            messageInput.focus();
        });

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

        // Quick action buttons
        showWorkspaceBtn.addEventListener('click', () => {
            settingsModal.classList.remove('show');
            vscode.postMessage({ type: 'getWorkspaceInfo' });
        });

        saveAnalysisBtn.addEventListener('click', () => {
            settingsModal.classList.remove('show');
            vscode.postMessage({ type: 'saveAnalysis' });
        });

        clearChatBtn.addEventListener('click', () => {
            if (confirm('Sohbet geçmişini silmek istediğinizden emin misiniz?')) {
                settingsModal.classList.remove('show');
                vscode.postMessage({ type: 'clearChat' });
            }
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
                case 'loadHistory':
                    // Clear empty state and load messages
                    const emptyState = chatContainer.querySelector('.empty-state');
                    if (emptyState && message.history && message.history.length > 0) {
                        emptyState.remove();
                    }
                    if (message.history && message.history.length > 0) {
                        message.history.forEach(msg => addMessageToChat(msg));
                    }
                    break;
                case 'chatCleared':
                    // Clear all messages and show empty state
                    chatContainer.innerHTML = \`
                        <div class="empty-state">
                            <div class="empty-state-icon">💬</div>
                            <h2>Hoş Geldiniz!</h2>
                            <p>Bir şey sormak için aşağıdaki metin kutusuna yazın ve Enter'a basın.</p>
                        </div>
                    \`;
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
