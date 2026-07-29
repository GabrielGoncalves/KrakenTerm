import { useState, useEffect, useRef } from 'react';
import { StartTerminal, WriteToTerminal, ResizeTerminal, ListDirectory, DownloadFile, UploadFile, ChangePermissions, ReadFileContent, WriteFileContent } from "../wailsjs/go/main/App";import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime";
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './App.css';

// Ícones SVG
const IconFolder = () => <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>;
const IconFile = () => <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>;
const IconBack = () => <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const IconRefresh = () => <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>;
const IconUpload = () => <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>;

function App() {
    const [host, setHost] = useState("172.16.234.50");
    const [port, setPort] = useState("22");
    const [user, setUser] = useState("");
    const [password, setPassword] = useState("");
    const [isConnected, setIsConnected] = useState(false);

    const [files, setFiles] = useState<any[]>([]);
    const [currentPath, setCurrentPath] = useState("");
    const [inputPath, setInputPath] = useState("");

    // --- ESTADOS DO MENU E MODAIS ---
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, file: null as any });
    const [showPropModal, setShowPropModal] = useState(false);
    const [showPermModal, setShowPermModal] = useState(false);
    const [newOctal, setNewOctal] = useState("");
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [editorContent, setEditorContent] = useState("");
    const [editingFile, setEditingFile] = useState<any>(null);

    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);

    // Formata o tamanho do arquivo para leitura humana (Bytes, KB, MB)
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Converte a string "-rw-r--r--" do servidor para um número octal (ex: "644")
    const parseModeToOctal = (modeStr: string) => {
        if (!modeStr || modeStr.length < 10) return "644"; 
        const u = (modeStr[1]==='r'?4:0) + (modeStr[2]==='w'?2:0) + (modeStr[3]==='x'?1:0);
        const g = (modeStr[4]==='r'?4:0) + (modeStr[5]==='w'?2:0) + (modeStr[6]==='x'?1:0);
        const o = (modeStr[7]==='r'?4:0) + (modeStr[8]==='w'?2:0) + (modeStr[9]==='x'?1:0);
        return `${u}${g}${o}`;
    };

    // Converte o octal "644" de volta para "rw-r--r--" para mostrar na tela
    const getModeString = (octal: string) => {
        const chars = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
        const o = octal.padStart(3, '0');
        return (chars[parseInt(o[0])] || '---') + (chars[parseInt(o[1])] || '---') + (chars[parseInt(o[2])] || '---');
    };

    // Alterna o checkbox usando a lógica Bitwise (XOR)
    const handleCheckbox = (entityIndex: number, permValue: number) => {
        let digits = newOctal.padStart(3, '0').split('').map(Number);
        digits[entityIndex] ^= permValue; 
        setNewOctal(digits.join(''));
    };

    const loadFiles = (path: string) => {
        ListDirectory(path).then((fileList) => {
            setFiles(fileList || []);
            setCurrentPath(path);
            setInputPath(path === "" ? "~/" : path); 
        }).catch((err) => {
            alert("Erro ao ler diretório: " + err);
        });
    };

    const connect = () => setIsConnected(true);

    useEffect(() => {
        if (isConnected && terminalRef.current) {
            const term = new Terminal({
                cursorBlink: true,
                fontFamily: '"Consolas", "Courier New", monospace',
                fontSize: 16,
                theme: { background: '#1e1e1e', foreground: '#ffffff', cursor: '#ebebeb' }
            });
            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            fitAddon.fit();
            xtermRef.current = term;

            ResizeTerminal(term.cols, term.rows);

            term.onData((data) => WriteToTerminal(data));
            EventsOn("terminal-data", (data) => term.write(data));
            EventsOn("ssh-disconnected", () => setIsConnected(false));

            const handleResize = () => {
                fitAddon.fit();
                ResizeTerminal(term.cols, term.rows);
            };
            window.addEventListener('resize', handleResize);

            StartTerminal(host, port, user, password)
                .then(() => loadFiles(""))
                .catch((erro) => {
                    alert("Erro ao conectar: " + erro);
                    setIsConnected(false);
                });

            return () => {
                EventsOff("terminal-data");
                EventsOff("ssh-disconnected");
                term.dispose();
                window.removeEventListener('resize', handleResize);
            };
        }
    }, [isConnected]);

    const handleFileDoubleClick = (file: any) => {
        if (file.isDir) {
            let base = currentPath === "" ? "." : currentPath;
            if (base === "~/") base = "."; 
            const newPath = base === "/" ? `/${file.name}` : `${base}/${file.name}`;
            loadFiles(newPath);
        } else {
            handleDownload(file);
        }
    };

    const handleDownload = (file: any) => {
        if (file.isDir) return; 
        const filePath = currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;
        DownloadFile(filePath, file.name)
            .then(resultado => alert(resultado))
            .catch(err => alert("Erro: " + err));
    };

    const handleUpload = () => {
        UploadFile(currentPath)
            .then(resultado => {
                alert(resultado);
                loadFiles(currentPath);
            })
            .catch(err => alert("Erro: " + err));
    };

    const handleGoBack = () => {
        let cleanedPath = currentPath.replace(/\/$/, "");
        if (cleanedPath === "" || cleanedPath === "~" || cleanedPath === "/") {
            if (cleanedPath !== "/") loadFiles("/");
            return;
        }
        const lastSlashIndex = cleanedPath.lastIndexOf("/");
        if (lastSlashIndex <= 0) {
            loadFiles("/");
        } else {
            loadFiles(cleanedPath.substring(0, lastSlashIndex));
        }
    };

    const handleRightClick = (e: React.MouseEvent, file: any) => {
        e.preventDefault(); 
        setContextMenu({ visible: true, x: e.pageX, y: e.pageY, file: file });
    };

    const closeContextMenu = () => {
        if (contextMenu.visible) setContextMenu({ ...contextMenu, visible: false });
    };

    const applyPermissions = () => {
        if (!contextMenu.file || !newOctal) return;
        
        let base = currentPath === "" ? "." : currentPath;
        if (base === "~/") base = "."; 
        const targetPath = base === "/" ? `/${contextMenu.file.name}` : `${base}/${contextMenu.file.name}`;

        const octalNumber = parseInt(newOctal, 8);

        ChangePermissions(targetPath, octalNumber)
            .then(() => {
                setShowPermModal(false);
                loadFiles(currentPath); 
            })
            .catch(err => alert("Erro ao alterar permissões: " + err));
    };

    // --- FUNÇÕES DO EDITOR DE TEXTO ---
    const handleEditFile = (file: any) => {
        let base = currentPath === "" ? "." : currentPath;
        if (base === "~/") base = "."; 
        const targetPath = base === "/" ? `/${file.name}` : `${base}/${file.name}`;

        ReadFileContent(targetPath)
            .then(content => {
                setEditorContent(content);
                setEditingFile(file);
                setShowEditorModal(true);
                closeContextMenu(); // Fecha o menu direito ao abrir o editor
            })
            .catch(err => alert("Erro ao ler arquivo (talvez seja um binário ou sem permissão): " + err));
    };

    const saveEditedFile = () => {
        if (!editingFile) return;

        let base = currentPath === "" ? "." : currentPath;
        if (base === "~/") base = "."; 
        const targetPath = base === "/" ? `/${editingFile.name}` : `${base}/${editingFile.name}`;

        WriteFileContent(targetPath, editorContent)
            .then(() => {
                alert("Arquivo salvo com sucesso!");
                setShowEditorModal(false);
                loadFiles(currentPath);
            })
            .catch(err => alert("Erro ao salvar arquivo: " + err));
    };

    return (
        <div id="App" onClick={closeContextMenu} style={{ textAlign: 'left', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e', color: 'white', position: 'relative' }}>
            {!isConnected ? (
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: 'auto', marginTop: '50px' }}>
                    <h2 style={{fontWeight: 500}}>Nova Sessão SSH</h2>
                    <input style={inputStyle} value={host} onChange={e => setHost(e.target.value)} placeholder="Host" />
                    <input style={inputStyle} value={port} onChange={e => setPort(e.target.value)} placeholder="Porta" />
                    <input style={inputStyle} value={user} onChange={e => setUser(e.target.value)} placeholder="Usuário" />
                    <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" />
                    <button className="btn-primary" style={buttonStyle} onClick={connect}>Conectar</button>
                </div>
            ) : (
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div style={{ width: '260px', backgroundColor: '#252526', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
                        
                        <div style={{ padding: '8px 12px', backgroundColor: '#333333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#cccccc' }}>EXPLORER</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button title="Voltar" className="icon-btn" onClick={handleGoBack}><IconBack /></button>
                                <button title="Atualizar" className="icon-btn" onClick={() => loadFiles(currentPath)}><IconRefresh /></button>
                                <button title="Upload" className="icon-btn" onClick={handleUpload}><IconUpload /></button>
                            </div>
                        </div>

                        <div style={{ padding: '6px', backgroundColor: '#2d2d30', borderBottom: '1px solid #1e1e1e' }}>
                            <input 
                                type="text"
                                value={inputPath}
                                onChange={(e) => setInputPath(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadFiles(inputPath)}
                                placeholder="Caminho..."
                                style={{ width: '100%', padding: '6px', boxSizing: 'border-box', backgroundColor: '#3c3c3c', color: '#e5e5e5', border: '1px solid #555', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                            />
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                            {files.map((file, index) => (
                                <div 
                                    key={index} 
                                    className="file-item"
                                    onDoubleClick={() => handleFileDoubleClick(file)}
                                    onContextMenu={(e) => handleRightClick(e, file)}
                                    style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        {/* Ícones com Cores Vibrantes (Amarelo Ouro para Pastas, Azul Ciano para Arquivos) */}
                                        <span style={{ color: file.isDir ? '#F5B041' : '#4AC9FF', display: 'flex' }}>
                                            {file.isDir ? <IconFolder /> : <IconFile />}
                                        </span>
                                        {/* Fonte mais clara e nítida para melhor contraste */}
                                        <span style={{ fontSize: '13px', color: '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {file.name}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 10px 10px 15px' }}>
                        <div ref={terminalRef} style={{ flex: 1, width: '100%', height: '100%' }} />
                    </div>
                </div>
            )}

            {/* --- MENU DE CONTEXTO --- */}
            {contextMenu.visible && contextMenu.file && (
                <div style={{
                    position: 'absolute',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    backgroundColor: '#252526',
                    border: '1px solid #454545',
                    borderRadius: '4px',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    padding: '4px 0',
                    zIndex: 1000,
                    minWidth: '150px'
                }}>
                    {!contextMenu.file.isDir && (
                        <div className="context-menu-item" onClick={() => handleDownload(contextMenu.file)}>
                            Baixar Arquivo
                        </div>
                    )}
                    {!contextMenu.file.isDir && (
                        <div className="context-menu-item" onClick={() => handleEditFile(contextMenu.file)}>
                            Editar Arquivo...
                        </div>
                    )}
                    <div className="context-menu-item" onClick={() => { 
                        setNewOctal(parseModeToOctal(contextMenu.file.mode)); 
                        setShowPermModal(true); 
                    }}>
                        Alterar Permissões...
                    </div>
                    <div className="context-menu-item" onClick={() => setShowPropModal(true)}>
                        Propriedades
                    </div>
                </div>
            )}

            {/* --- MODAL DO EDITOR DE TEXTO --- */}
            {showEditorModal && editingFile && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ width: '80%', height: '85vh', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e', border: '1px solid #333' }}>
                        
                        {/* Cabeçalho do Editor */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', color: '#ccc' }}>
                                Editando: <strong style={{ color: '#fff' }}>{editingFile.name}</strong>
                            </h3>
                            <span style={{ fontSize: '12px', color: '#666' }}>{currentPath}</span>
                        </div>

                        {/* Área de Texto (Textarea) */}
                        <textarea 
                            value={editorContent}
                            onChange={(e) => setEditorContent(e.target.value)}
                            spellCheck={false}
                            style={{ 
                                flex: 1, 
                                backgroundColor: '#1e1e1e', 
                                color: '#d4d4d4', 
                                fontFamily: '"Consolas", "Courier New", monospace', 
                                fontSize: '14px', 
                                padding: '10px', 
                                border: 'none', 
                                outline: 'none', 
                                resize: 'none',
                                lineHeight: '1.5'
                            }}
                        />

                        {/* Rodapé com Botões */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '15px', borderTop: '1px solid #333' }}>
                            <button 
                                onClick={() => setShowEditorModal(false)} 
                                style={{...buttonStyle, backgroundColor: '#444', minWidth: '100px'}}
                            >
                                Cancelar
                            </button>
                            <button 
                                className="btn-primary" 
                                onClick={saveEditedFile} 
                                style={{...buttonStyle, backgroundColor: '#007ACC', minWidth: '100px'}}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL DE PROPRIEDADES --- */}
            {showPropModal && contextMenu.file && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 style={{ marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px' }}>Propriedades</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                            <p><strong>Nome:</strong> {contextMenu.file.name}</p>
                            <p><strong>Tipo:</strong> {contextMenu.file.isDir ? 'Pasta de Arquivos' : 'Arquivo'}</p>
                            <p><strong>Tamanho:</strong> {formatBytes(contextMenu.file.size)}</p>
                            <p><strong>Permissões:</strong> {contextMenu.file.mode}</p>
                            <p><strong>Modificado em:</strong> {contextMenu.file.modTime}</p>
                        </div>
                        <div style={{ textAlign: 'right', marginTop: '20px' }}>
                            <button className="btn-primary" onClick={() => setShowPropModal(false)} style={buttonStyle}>Fechar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL DE PERMISSÕES (VISUAL AVANÇADO) --- */}
            {showPermModal && contextMenu.file && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ width: '400px' }}>
                        <h3 style={{ marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px', fontSize: '16px' }}>
                            Permissões para "{contextMenu.file.name}"
                        </h3>
                        
                        <div style={{ margin: '15px 0', textAlign: 'center', fontSize: '15px' }}>
                            Permissões: <strong style={{ letterSpacing: '2px', backgroundColor: '#1e1e1e', padding: '4px 10px', borderRadius: '4px', border: '1px solid #333' }}>
                                {getModeString(newOctal)}
                            </strong>
                        </div>

                        <div style={{ backgroundColor: '#1e1e1e', padding: '20px 15px', borderRadius: '6px', margin: '15px 0', border: '1px solid #333' }}>
                            {[
                                { label: 'User:', idx: 0 },
                                { label: 'Group:', idx: 1 },
                                { label: 'Other:', idx: 2 }
                            ].map(row => {
                                const digit = parseInt(newOctal.padStart(3, '0')[row.idx] || '0', 10);
                                return (
                                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ width: '80px', fontWeight: 'bold' }}>{row.label}</span>
                                        <label style={{ width: '90px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input type="checkbox" checked={(digit & 4) !== 0} onChange={() => handleCheckbox(row.idx, 4)} /> Read
                                        </label>
                                        <label style={{ width: '90px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input type="checkbox" checked={(digit & 2) !== 0} onChange={() => handleCheckbox(row.idx, 2)} /> Write
                                        </label>
                                        <label style={{ width: '90px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input type="checkbox" checked={(digit & 1) !== 0} onChange={() => handleCheckbox(row.idx, 1)} /> Execute
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0' }}>
                            <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Octal mode:</label>
                            <input 
                                type="text" 
                                value={newOctal} 
                                onChange={(e) => setNewOctal(e.target.value.replace(/[^0-7]/g, ''))} 
                                maxLength={3}
                                style={{ padding: '6px 10px', width: '60px', backgroundColor: '#1e1e1e', color: 'white', border: '1px solid #555', borderRadius: '4px', textAlign: 'center', fontSize: '14px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
                            <button className="btn-primary" onClick={applyPermissions} style={{...buttonStyle, backgroundColor: '#3498db', width: '110px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center'}}>
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                Apply
                            </button>
                            <button onClick={() => setShowPermModal(false)} style={{...buttonStyle, backgroundColor: '#e74c3c', width: '110px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center'}}>
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const inputStyle = { padding: '10px', borderRadius: '6px', border: '1px solid #444', backgroundColor: '#333', color: 'white', outline: 'none' };
const buttonStyle = { padding: '8px 16px', borderRadius: '4px', border: 'none', backgroundColor: '#007ACC', color: 'white', cursor: 'pointer', fontWeight: 'bold' };

export default App;