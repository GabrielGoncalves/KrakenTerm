package main

import (
	"context"
	"fmt"
	"time"
	"io"
	"os"
	"path/filepath"
	
	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// App struct
type App struct {
	ctx        context.Context
	sshClient  *ssh.Client
	sshSession *ssh.Session
	sshStdin   io.WriteCloser
	sftpClient *sftp.Client
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// StartTerminal conecta ao SSH, pede um terminal e começa a transmitir os dados
func (a *App) StartTerminal(host, port, user, password string) error {
	config := &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         5 * time.Second,
	}

	address := fmt.Sprintf("%s:%s", host, port)
	client, err := ssh.Dial("tcp", address, config)
	if err != nil {
		return fmt.Errorf("falha ao discar: %w", err)
	}
	a.sshClient = client

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return fmt.Errorf("Falha ao iniciar sftp %w", err)
	}
	a.sftpClient = sftpClient

	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("falha ao criar sessão: %w", err)
	}
	a.sshSession = session

	// 1. Pede o Pseudo-Terminal (xterm)
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,     // Habilita o eco
		ssh.TTY_OP_ISPEED: 14400, // Velocidade de entrada
		ssh.TTY_OP_OSPEED: 14400, // Velocidade de saída
	}
	if err := session.RequestPty("xterm-256color", 24, 80, modes); err != nil {
		return fmt.Errorf("falha ao pedir pty: %w", err)
	}
	session.Setenv("TERM", "xterm-256color")

	// 2. Conecta as "mangueiras" de entrada e saída
	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}
	a.sshStdin = stdin

	stdout, err := session.StdoutPipe()
	if err != nil {
		return err
	}
	// Redireciona o erro para a mesma saída
	session.StderrPipe() 

	// 3. Inicia o Shell do servidor
	if err := session.Shell(); err != nil {
		return fmt.Errorf("falha ao iniciar shell: %w", err)
	}

	// 4. Cria uma rotina em background para ler o servidor e enviar para o React
	go func() {
		buf := make([]byte, 1024)
		
		// O loop for continua rodando infinitamente enquanto a conexão estiver ativa
		for {
			n, err := stdout.Read(buf)
			
			if err != nil {
				// 1. Fecha a sessão do terminal
				if a.sshSession != nil {
					a.sshSession.Close()
				}		
				// 2. Fecha o cliente SFTP (NOVO)
				if a.sftpClient != nil {
					a.sftpClient.Close()
				}
				// 3. Fecha a conexão principal do SSH (NOVO)
				if a.sshClient != nil {
					a.sshClient.Close()
				}
				runtime.EventsEmit(a.ctx, "ssh-disconnected", nil) 
				return
			}
			runtime.EventsEmit(a.ctx, "terminal-data", string(buf[:n]))
		}
	}()

	return nil
}

func (a *App) WriteToTerminal(data string) {
	if a.sshStdin != nil {
		_, err := a.sshStdin.Write([]byte(data))
		if err != nil {
			return 
		}
	}
}

func (a *App) ResizeTerminal(cols int, rows int) {
	if a.sshSession != nil {
		err := a.sshSession.WindowChange(rows, cols)
		if err != nil {
			fmt.Println("Erro ao redimensionar terminal:", err)
		}
	}
}

type FileInfo struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	Mode    string `json:"mode"`
	ModTime string `json:"modTime"`
}

func (a *App) ListDirectory(path string) ([]FileInfo, error) {
	if a.sftpClient == nil {
		return nil, fmt.Errorf("cliente SFTP não conectado")
	}

	if path == "" {
		var err error
		path, err = a.sftpClient.Getwd()
		if err != nil {
			path = "/"
		}
	}

	arquivos, err := a.sftpClient.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("erro ao ler diretório: %w", err)
	}

	var lista []FileInfo
	for _, arq := range arquivos {
		lista = append(lista, FileInfo{
			Name:    arq.Name(),
			Size:    arq.Size(),
			IsDir:   arq.IsDir(),
			Mode:    arq.Mode().String(),
			ModTime: arq.ModTime().Format("02/01/2006 15:04"),
		})
	}

	return lista, nil
}

func (a *App) DownloadFile(remotePath string, fileName string) (string, error) {
	if a.sftpClient == nil {
		return "", fmt.Errorf("sftp não conectado")
	}

	options := runtime.SaveDialogOptions{
		DefaultFilename: fileName,
		Title:           "Salvar arquivo baixado como...",
	}
	localPath, err := runtime.SaveFileDialog(a.ctx, options)
	if err != nil || localPath == "" {
		return "Download cancelado.", nil 
	}

	remoteFile, err := a.sftpClient.Open(remotePath)
	if err != nil {
		return "", fmt.Errorf("erro ao abrir arquivo remoto: %w", err)
	}
	defer remoteFile.Close()

	localFile, err := os.Create(localPath)
	if err != nil {
		return "", fmt.Errorf("erro ao criar arquivo local: %w", err)
	}
	defer localFile.Close()

	bytesTransferidos, err := io.Copy(localFile, remoteFile)
	if err != nil {
		return "", fmt.Errorf("erro durante a transferência: %w", err)
	}
	return fmt.Sprintf("Sucesso! %d bytes baixados.", bytesTransferidos), nil
}

func (a *App) UploadFile(remoteDir string) (string, error) {
	if a.sftpClient == nil {
		return "", fmt.Errorf("sftp não conectado")
	}

	options := runtime.OpenDialogOptions{
		Title: "Selecione o arquivo para enviar",
	}
	localPath, err := runtime.OpenFileDialog(a.ctx, options)
	if err != nil || localPath == "" {
		return "Upload cancelado.", nil
	}

	localFile, err := os.Open(localPath)
	if err != nil {
		return "", fmt.Errorf("erro ao abrir arquivo local: %w", err)
	}
	defer localFile.Close()

	fileName := filepath.Base(localPath)
	remoteDestPath := filepath.ToSlash(filepath.Join(remoteDir, fileName))
	remoteFile, err := a.sftpClient.Create(remoteDestPath)
	if err != nil {
		return "", fmt.Errorf("erro ao criar arquivo no servidor: %w", err)
	}
	defer remoteFile.Close()
	bytesTransferidos, err := io.Copy(remoteFile, localFile)
	if err != nil {
		return "", fmt.Errorf("erro durante a transferência: %w", err)
	}

	return fmt.Sprintf("Sucesso! Arquivo %s enviado (%d bytes).", fileName, bytesTransferidos), nil
}

func (a *App) ChangePermissions(remotePath string, octalMode uint32) error {
	if a.sftpClient == nil {
		return fmt.Errorf("sftp não conectado")
	}

	mode := os.FileMode(octalMode)
	err := a.sftpClient.Chmod(remotePath, mode)
	if err != nil {
		return fmt.Errorf("erro ao alterar permissões: %w", err)
	}

	return nil
}

func (a *App) ReadFileContent(remotePath string) (string, error) {
	if a.sftpClient == nil {
		return "", fmt.Errorf("sftp não conectado")
	}

	file, err := a.sftpClient.Open(remotePath)
	if err != nil {
		return "", fmt.Errorf("erro ao abrir arquivo remoto: %w", err)
	}
	defer file.Close()
	conteudo, err := io.ReadAll(file)
	if err != nil {
		return "", fmt.Errorf("erro ao ler o arquivo: %w", err)
	}

	return string(conteudo), nil
}

func (a *App) WriteFileContent(remotePath string, content string) error {
	if a.sftpClient == nil {
		return fmt.Errorf("sftp não conectado")
	}

	file, err := a.sftpClient.OpenFile(remotePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
	if err != nil {
		return fmt.Errorf("erro ao abrir arquivo para escrita: %w", err)
	}
	defer file.Close()
	_, err = file.Write([]byte(content))
	if err != nil {
		return fmt.Errorf("erro ao salvar o arquivo: %w", err)
	}

	return nil
}