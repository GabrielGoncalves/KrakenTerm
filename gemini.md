# Contexto do Projeto: Clone do MobaXterm (Cross-Platform)

## 1. Visão Geral
Estamos desenvolvendo um aplicativo desktop cross-platform (Mac/Windows/Linux) utilizando o framework **Wails** (Backend em **Go** e Frontend em **React + TypeScript**). O objetivo é criar um cliente SSH/SFTP com interface dividida (Flexbox), semelhante ao MobaXterm e inspirado no visual do VS Code.

## 2. Tecnologias Utilizadas
*   **Backend:** Go (pacotes `golang.org/x/crypto/ssh`, `github.com/pkg/sftp`, pacote `os` e `io`).
*   **Frontend:** React, TypeScript, CSS puro.
*   **Emulador de Terminal:** `xterm.js` com `@xterm/addon-fit`.

## 3. Estado Atual e Funcionalidades Implementadas
*   **Terminal SSH:** PTY (`xterm-256color`) funcional, responsivo e com cores injetadas via tema do xterm.
*   **SFTP Explorer:** Lista arquivos com ícones coloridos (Pastas em #F5B041, Arquivos em #4AC9FF) e navegação via barra de endereços ou clique.
*   **Upload/Download:** Integração com janelas nativas do SO via backend do Wails (`runtime.SaveFileDialog` e `runtime.OpenFileDialog`).
*   **Menu de Contexto (Botão Direito):** 
    *   Visualização de Propriedades do arquivo.
    *   Alteração de Permissões (Chmod) via Modal Avançado (suporta input Octal e Checkboxes Bitwise integrados).
    *   Edição Direta de Arquivos (Leitura e Escrita usando `os.O_TRUNC`) via modal flutuante com `<textarea>`.
*   **Design:** Paleta Deep Dark (Fundos `#181818` e `#141414`), barra de rolagem customizada flutuante e botões com hover.

## 4. Próximos Passos (Para a nova IA)
1. Implementar um sistema para salvar/lembrar os dados de login (Host e Usuário) na tela inicial.
2. Refinar tratamentos de erro de rede e timeout do SSH.

---

## 5. Código Fonte Atualizado

### A) `frontend/src/App.css`
```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: #181818; }
::-webkit-scrollbar-thumb { background: #424242; border: 2px solid #181818; border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
input:focus, button:focus { outline: 1px solid #007ACC; }
.icon-btn { background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: #cccccc; display: flex; align-items: center; justify-content: center; transition: background-color 0.1s; }
.icon-btn:hover { background-color: #333333; color: #ffffff; }
.file-item { border-left: 2px solid transparent; transition: background-color 0.1s; }
.file-item:hover { background-color: #2a2d2e; }
.icon-btn-download { background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; opacity: 0; transition: opacity 0.2s; color: #cccccc; }
.file-item:hover .icon-btn-download { opacity: 1; }
.icon-btn-download:hover { background-color: #4d4d4d; color: #ffffff; }
.context-menu-item { padding: 8px 15px; font-size: 13px; color: #cccccc; cursor: pointer; transition: background-color 0.1s; }
.context-menu-item:hover { background-color: #007ACC; color: #ffffff; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 2000; }
.modal-content { background-color: #181818; border: 1px solid #333333; border-radius: 6px; padding: 20px; width: 350px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); color: #cccccc; }
.modal-content p { margin: 4px 0; }

Funções mapeadas no Backend Go (app.go)
As seguintes funções estão expostas para o frontend:

StartTerminal(host, port, user, password) -> Inicia SSH e SFTP (xterm-256color).

WriteToTerminal(data string) -> Escreve no stdin do PTY.

ResizeTerminal(cols, rows int) -> Atualiza window size no SSH.

ListDirectory(path string) -> Retorna array de structs com: name, isDir, size, mode, modTime.

DownloadFile(remotePath, fileName string) -> Abre SaveDialog nativo e usa io.Copy.

UploadFile(remoteDir string) -> Abre OpenDialog nativo e usa io.Copy.

ChangePermissions(remotePath string, octalMode uint32) -> Aplica sftpClient.Chmod.

ReadFileContent(remotePath string) -> Retorna string lida.

WriteFileContent(remotePath, content string) -> Salva usando os.O_WRONLY|os.O_CREATE|os.O_TRUNC.

C) frontend/src/App.tsx (Trechos críticos do UI)
O App.tsx gerencia estados globais para o terminal, modals e menu de contexto.
O xterm.js está configurado com o seguinte tema de base:

TypeScript
const term = new Terminal({
    cursorBlink: true,
    fontFamily: '"Consolas", "Courier New", monospace',
    fontSize: 14,
    theme: { 
        background: '#181818', 
        foreground: '#F0F0F0', // Cor do texto principal atualizada
        cursor: '#007ACC',
        black: '#1e1e1e', red: '#f14c4c', green: '#23d18b', yellow: '#f5f543', 
        blue: '#3b8eea', magenta: '#d670d6', cyan: '#29b8db', white: '#e5e5e5'
    }
});
O design dos ícones da lista de SFTP foi atualizado para cores vibrantes (Amarelo para Pastas, Ciano para Arquivos):

TypeScript
<span style={{ color: file.isDir ? '#F5B041' : '#4AC9FF', display: 'flex' }}>
    {file.isDir ? <IconFolder/> : <IconFile/>}
</span>
<span style={{ fontSize: '13px', color: '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
    {file.name}
</span>