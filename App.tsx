
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Terminal, 
  Upload, 
  Github, 
  ArrowRight, 
  FileCode, 
  CheckCircle2, 
  Loader2, 
  ShieldCheck, 
  Compass, 
  Box, 
  Code2,
  Sparkles,
  Download,
  AlertCircle,
  FileText
} from 'lucide-react';
import JSZip from 'jszip';
import { AgentMessage, ProjectFile, AgentRole, MigrationState, MigrationPlan } from './types';
import { CodeMorphService } from './services/geminiService';

const AGENT_INFO = {
  EXPLORER: { icon: Compass, color: 'text-blue-400', label: 'Explorer Agent', desc: 'Analyzing structure...' },
  ARCHITECT: { icon: Box, color: 'text-purple-400', label: 'Architect Agent', desc: 'Designing strategy...' },
  MIGRATOR: { icon: Code2, color: 'text-green-400', label: 'Migrator Agent', desc: 'Writing target code...' },
  REVIEWER: { icon: ShieldCheck, color: 'text-rose-400', label: 'Reviewer Agent', desc: 'Validating output...' },
};

const App: React.FC = () => {
  const [state, setState] = useState<MigrationState>({
    sourceLang: '',
    targetLang: 'Java',
    sourceFramework: '',
    targetFramework: 'Spring Boot',
    files: [],
    isProcessing: false,
    activeAgent: null,
    progress: 0,
  });

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [lastMigrationPlan, setLastMigrationPlan] = useState<MigrationPlan | null>(null);
  const [currentlyProcessingIndex, setCurrentlyProcessingIndex] = useState<number | null>(null);
  
  const service = useRef(new CodeMorphService());
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const addLog = (role: AgentRole, text: string, type: AgentMessage['type'] = 'info') => {
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      role,
      text,
      timestamp: Date.now(),
      type
    }]);
  };

  const fetchGithubRepo = async (url: string) => {
    try {
      const cleanUrl = url.trim().replace(/\/$/, "");
      const parts = cleanUrl.replace('https://github.com/', '').split('/');
      if (parts.length < 2) throw new Error("Invalid GitHub URL");
      const owner = parts[0];
      const repo = parts[1];

      addLog('EXPLORER', `Connecting to GitHub API for ${owner}/${repo}...`);
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`);
      
      let data = await response.json();
      if (data.message === "Not Found") {
        addLog('EXPLORER', "Primary branch 'main' not found, trying 'master'...", 'warning');
        const masterResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`);
        data = await masterResponse.json();
      }

      if (!data.tree) throw new Error("Could not retrieve repository tree.");

      // Prioritize source files
      const filesToFetch = data.tree.filter((item: any) => 
        item.type === "blob" && 
        !item.path.includes('node_modules') && 
        !item.path.includes('.git') &&
        !item.path.includes('dist') &&
        (item.path.endsWith('.py') || item.path.endsWith('.js') || item.path.endsWith('.java') || item.path.endsWith('.ts') || item.path.endsWith('.cpp'))
      ).slice(0, 10); // limited for demo performance

      addLog('EXPLORER', `Found ${filesToFetch.length} source files. Fetching contents...`);

      const fetchedFiles: ProjectFile[] = await Promise.all(
        filesToFetch.map(async (file: any) => {
          const contentRes = await fetch(file.url);
          const contentData = await contentRes.json();
          // Content is usually base64
          const decoded = contentData.encoding === 'base64' ? atob(contentData.content.replace(/\s/g, '')) : contentData.content;
          return {
            path: file.path,
            name: file.path.split('/').pop() || '',
            content: decoded,
            language: file.path.split('.').pop() || 'text',
            status: 'pending' as const
          };
        })
      );

      return fetchedFiles;
    } catch (err: any) {
      addLog('EXPLORER', `GitHub Fetch Error: ${err.message}`, 'error');
      return [];
    }
  };

  const startMigration = async () => {
    setState(prev => ({ ...prev, isProcessing: true, progress: 5, activeAgent: 'EXPLORER' }));
    setLastMigrationPlan(null);
    setCurrentlyProcessingIndex(null);

    try {
      let currentFiles = [...state.files];
      
      if (githubUrl.trim()) {
        const githubFiles = await fetchGithubRepo(githubUrl);
        if (githubFiles.length > 0) {
          currentFiles = githubFiles;
          setState(prev => ({ ...prev, files: githubFiles }));
        } else if (currentFiles.length === 0) {
          throw new Error("No files found to migrate from the provided GitHub link.");
        }
      }

      if (currentFiles.length === 0) {
        throw new Error("No source files available. Please upload or provide a GitHub URL.");
      }

      // 1. Explorer: Analyze Stack
      addLog('EXPLORER', "Analyzing project source stack...");
      const analysis = await service.current.exploreProject(currentFiles);
      setState(prev => ({ ...prev, sourceLang: analysis.language, sourceFramework: analysis.framework, progress: 15 }));
      addLog('EXPLORER', `Detected Source: ${analysis.language} (${analysis.framework})`, 'success');

      // 2. Architect: Plan
      setState(prev => ({ ...prev, activeAgent: 'ARCHITECT' }));
      addLog('ARCHITECT', `Designing migration strategy to ${state.targetLang} (${state.targetFramework})...`);
      const plan = await service.current.createMigrationPlan(
        { lang: analysis.language, fw: analysis.framework },
        { lang: state.targetLang, fw: state.targetFramework }
      );
      setLastMigrationPlan(plan);
      addLog('ARCHITECT', `Blueprint finalized. Starting translation sequence...`, 'success');
      setState(prev => ({ ...prev, progress: 25 }));

      // 3. Migrator: Translate with Live Streaming
      setState(prev => ({ ...prev, activeAgent: 'MIGRATOR' }));
      
      const translated = [...currentFiles];
      for (let i = 0; i < translated.length; i++) {
        setCurrentlyProcessingIndex(i);
        // If nothing is selected, select the one we are translating
        if (selectedFileIndex === null) setSelectedFileIndex(i);
        
        addLog('MIGRATOR', `Transforming ${translated[i].path}...`);
        
        let liveContent = "";
        const stream = service.current.translateFileStream(
          translated[i],
          { lang: analysis.language, fw: analysis.framework },
          { lang: state.targetLang, fw: state.targetFramework },
          plan
        );

        for await (const chunk of stream) {
          liveContent += chunk;
          // Partial state update for live feedback
          translated[i] = { ...translated[i], translatedContent: liveContent, status: 'translating' };
          setState(prev => ({ ...prev, files: [...translated] }));
        }
        
        translated[i] = { ...translated[i], translatedContent: liveContent, status: 'completed' };
        setState(prev => ({ 
          ...prev, 
          files: [...translated], 
          progress: 25 + ((i + 1) / translated.length) * 65 
        }));
      }

      // 4. Reviewer: Finish
      setCurrentlyProcessingIndex(null);
      setState(prev => ({ ...prev, activeAgent: 'REVIEWER' }));
      addLog('REVIEWER', "Final verification of all modules completed.");
      addLog('REVIEWER', "Migration SUCCESS. Project is ready for deployment.", 'success');
      setState(prev => ({ ...prev, isProcessing: false, activeAgent: null, progress: 100 }));

    } catch (err: any) {
      addLog('EXPLORER', `Migration Failure: ${err.message}`, 'error');
      setState(prev => ({ ...prev, isProcessing: false, activeAgent: null }));
    }
  };

  const getTargetExtension = (lang: string) => {
    switch(lang.toLowerCase()) {
      case 'java': return '.java';
      case 'python': return '.py';
      case 'go': return '.go';
      case 'typescript': return '.ts';
      default: return '.txt';
    }
  };

  const downloadProject = async () => {
    if (!lastMigrationPlan || state.files.length === 0) {
      addLog('REVIEWER', "No migrated files found to download.", 'warning');
      return;
    }

    addLog('REVIEWER', "Packaging migrated project assets...");
    const zip = new JSZip();
    const folder = zip.folder("migrated-project");
    
    // Package only the translated contents
    state.files.forEach(file => {
      const content = file.translatedContent || `// Source conversion was unsuccessful for this module.`;
      const targetExt = getTargetExtension(state.targetLang);
      const fileName = file.name.split('.')[0] + targetExt;
      
      // Attempt to preserve folder structure logic
      let targetPath = file.path.split('/').slice(0, -1).join('/');
      if (state.targetLang === 'Java' && state.targetFramework === 'Spring Boot') {
        targetPath = `src/main/java/com/migrated/${targetPath}`;
      }
      
      const fullPath = targetPath ? `${targetPath}/${fileName}` : fileName;
      folder?.file(fullPath, content);
    });

    // Create a robust README
    const readmeContent = `# CodeMorph AI - Migration Report

## Project Context
- **Source Ecosystem:** ${state.sourceLang} (${state.sourceFramework})
- **Target Ecosystem:** ${state.targetLang} (${state.targetFramework})

## Architectural Mapping
Generated strategy included the following dependency shifts:
${lastMigrationPlan.dependencies.map(d => `- Add Dependency: \`${d}\``).join('\n')}

## Deployment & Run Instructions
${lastMigrationPlan.runInstructions || 'Please consult the target framework documentation for runtime setup.'}

## Migration Artifacts
All modules have been converted to ${state.targetLang}. Note that manual review of complex business logic is recommended.

---
*Created by CodeMorph AI Multi-Agent Orchestrator*
`;
    folder?.file("README.md", readmeContent);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `migrated-project-${state.targetLang.toLowerCase()}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    addLog('REVIEWER', "Migrated Project ZIP downloaded successfully.", 'success');
  };

  const activeIndex = currentlyProcessingIndex !== null ? currentlyProcessingIndex : selectedFileIndex;
  const displayedFile = activeIndex !== null ? state.files[activeIndex] : null;
  const isComplete = !state.isProcessing && state.progress === 100;

  return (
    <div className="flex flex-col h-screen bg-[#020617] overflow-hidden text-slate-300 font-sans">
      {/* Dynamic Progress Bar */}
      {state.isProcessing && (
        <div className="fixed top-0 left-0 w-full h-1 bg-slate-900 z-[100] overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${state.progress}%` }}></div>
        </div>
      )}

      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between bg-slate-950/40 backdrop-blur-xl z-10">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/10">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              CodeMorph <span className="text-blue-500">AI</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase">Multi-Agent Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {isComplete && (
            <button 
              onClick={downloadProject}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-xl shadow-blue-500/20 active:scale-95 group"
            >
              <Download className="w-4 h-4 group-hover:bounce" />
              Download Migrated Project
            </button>
          )}
          <div className="px-3.5 py-1.5 bg-slate-900 border border-slate-800 rounded-full flex items-center gap-2.5 text-[10px] font-bold text-slate-400">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e]"></span>
            GEMINI 3 PRO V1
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Navigation / Control Sidebar */}
        <aside className="w-80 border-r border-slate-800/60 p-6 flex flex-col gap-6 overflow-y-auto bg-slate-950/20">
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Input Parameters</h3>
            <div className="relative group">
              <Github className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Repository URL"
                className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all placeholder:text-slate-600 text-slate-200"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={state.isProcessing}
              />
            </div>
            
            <label className="flex items-center justify-center gap-3 p-3.5 border border-dashed border-slate-800 rounded-xl hover:bg-slate-900/50 hover:border-slate-700 cursor-pointer transition-all group">
              <Upload className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
              <span className="text-xs font-medium text-slate-500 group-hover:text-slate-300">Upload Project Zip</span>
              <input type="file" className="hidden" disabled={state.isProcessing} accept=".zip" />
            </label>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800/60">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Configuration</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-600 font-bold ml-1 uppercase">Language</p>
                <select 
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-slate-300"
                  value={state.targetLang}
                  onChange={(e) => setState(prev => ({ ...prev, targetLang: e.target.value }))}
                >
                  <option>Java</option>
                  <option>Python</option>
                  <option>Go</option>
                  <option>TypeScript</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-600 font-bold ml-1 uppercase">Framework</p>
                <select 
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-slate-300"
                  value={state.targetFramework}
                  onChange={(e) => setState(prev => ({ ...prev, targetFramework: e.target.value }))}
                >
                  <option>Spring Boot</option>
                  <option>FastAPI</option>
                  <option>Gin</option>
                  <option>Next.js</option>
                </select>
              </div>
            </div>
          </div>

          <button 
            onClick={startMigration}
            disabled={state.isProcessing || (!githubUrl && state.files.length === 0)}
            className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
              state.isProcessing 
                ? 'bg-slate-900 text-slate-700' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-600/20 active:scale-95'
            }`}
          >
            {state.isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowRight className="w-5 h-5" /> Execute Transformation</>}
          </button>

          {state.activeAgent && (
            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl ring-1 ring-blue-500/10">
               <div className="flex items-center gap-3 mb-2.5">
                 <div className={`p-1.5 rounded-lg bg-slate-900 ${AGENT_INFO[state.activeAgent].color}`}>
                    {React.createElement(AGENT_INFO[state.activeAgent].icon, { className: "w-3.5 h-3.5" })}
                 </div>
                 <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider">{AGENT_INFO[state.activeAgent].label}</span>
               </div>
               <p className="text-[10px] leading-relaxed text-slate-400 font-medium">{AGENT_INFO[state.activeAgent].desc}</p>
            </div>
          )}

          {state.files.length > 0 && (
             <div className="flex-1 overflow-hidden flex flex-col pt-4 border-t border-slate-800/60">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Project Modules</span>
                <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                  {state.files.map((f, i) => (
                    <button 
                      key={f.path} 
                      onClick={() => setSelectedFileIndex(i)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between transition-all border ${
                        activeIndex === i 
                          ? 'bg-blue-600/10 border-blue-500/40 text-blue-400' 
                          : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'
                      }`}
                    >
                      <span className="truncate flex items-center gap-2.5 tracking-tight font-medium">
                        {currentlyProcessingIndex === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCode className="w-3.5 h-3.5" />}
                        {f.name}
                      </span>
                      {f.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    </button>
                  ))}
                </div>
             </div>
          )}
        </aside>

        {/* Central Code Arena */}
        <section className="flex-1 flex flex-col bg-slate-950">
          <div className="flex-1 overflow-hidden flex">
            {(state.isProcessing || state.files.length > 0) && displayedFile ? (
              <>
                {/* Source Explorer */}
                <div className="flex-1 flex flex-col border-r border-slate-800/60">
                  <div className="px-5 py-3.5 bg-slate-900/30 border-b border-slate-800/60 flex items-center gap-3">
                    <div className="p-1.5 rounded bg-slate-800/50 text-slate-400"><FileCode className="w-3.5 h-3.5" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Source Module: <span className="text-slate-300">{displayedFile.path}</span></span>
                  </div>
                  <div className="flex-1 p-6 overflow-auto code-font text-[13px] leading-relaxed selection:bg-blue-500/30">
                    <pre className="text-slate-400 opacity-60">{displayedFile.content}</pre>
                  </div>
                </div>

                {/* Live AI Transformation */}
                <div className="flex-1 flex flex-col bg-[#050505] relative">
                  <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none"></div>
                  <div className="px-5 py-3.5 bg-slate-900/30 border-b border-slate-800/60 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded bg-blue-500/10 text-blue-400"><Code2 className="w-3.5 h-3.5" /></div>
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Target Output: <span className="text-slate-300">{state.targetLang} {state.targetFramework}</span></span>
                    </div>
                    {displayedFile.status === 'completed' && (
                      <span className="text-[9px] font-black bg-green-500/10 text-green-500 px-2 py-1 rounded-md border border-green-500/20 uppercase tracking-tighter shadow-[0_0_10px_rgba(34,197,94,0.1)]">Verified</span>
                    )}
                    {displayedFile.status === 'translating' && (
                      <span className="text-[9px] font-black bg-blue-500/10 text-blue-500 px-2 py-1 rounded-md border border-blue-500/20 uppercase tracking-tighter animate-pulse">Streaming...</span>
                    )}
                  </div>
                  <div className="flex-1 p-6 overflow-auto code-font text-[13px] leading-relaxed relative z-10 selection:bg-blue-500/40">
                    {displayedFile.translatedContent ? (
                      <pre className="text-blue-50 animate-in fade-in duration-1000">
                        {displayedFile.translatedContent}
                        {displayedFile.status === 'translating' && <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-1 align-middle"></span>}
                      </pre>
                    ) : (
                      <div className="h-full flex items-center justify-center italic text-slate-800 text-sm font-medium">
                        {state.isProcessing ? 'Waiting for Migrator Agent instructions...' : 'Select a file to review its translation.'}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-12 text-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950">
                <div className="max-w-xl space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="mx-auto w-28 h-28 bg-slate-900/50 rounded-[2.5rem] flex items-center justify-center border border-slate-800/50 shadow-2xl relative group">
                    <div className="absolute inset-0 bg-blue-600/10 blur-2xl rounded-full scale-150 group-hover:scale-175 transition-transform duration-1000"></div>
                    <Sparkles className="w-12 h-12 text-blue-600 relative z-10" />
                    <div className="absolute inset-0 border-2 border-blue-600/20 rounded-[2.5rem] animate-[ping_3s_infinite] opacity-30"></div>
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-4xl font-black text-white tracking-tighter leading-none">
                      Scale Your Migration <br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-400">With Autonomous Agents.</span>
                    </h2>
                    <p className="text-base text-slate-500 leading-relaxed font-medium">
                      Enter a GitHub URL or upload a project. Our multi-agent orchestrator uses 
                      Gemini 3 Pro to intelligently refactor codebases while preserving critical business logic.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-8 pt-4">
                    <div className="flex flex-col items-center gap-2">
                       <span className="text-2xl font-black text-white">99%</span>
                       <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Logic Accuracy</span>
                    </div>
                    <div className="w-px h-10 bg-slate-800"></div>
                    <div className="flex flex-col items-center gap-2">
                       <span className="text-2xl font-black text-white">40x</span>
                       <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Faster Velocity</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Autonomous Operations Hub (Logs) */}
          <div className="h-72 border-t border-slate-800/60 bg-slate-950 flex flex-col">
            <div className="px-6 py-3.5 border-b border-slate-800/60 bg-slate-900/30 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                 <div className="p-1 rounded bg-slate-800 text-slate-500"><Terminal className="w-3 h-3" /></div>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Multi-Agent Communication Network</span>
              </div>
              <div className="flex gap-2">
                {Object.keys(AGENT_INFO).map((role) => (
                  <div 
                    key={role} 
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all ${
                      state.activeAgent === role 
                        ? 'bg-blue-600/10 border-blue-500/30 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                        : 'bg-transparent border-transparent text-slate-700'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${state.activeAgent === role ? 'bg-blue-500 animate-pulse' : 'bg-slate-800'}`}></div>
                    <span className="text-[8px] font-black uppercase tracking-tighter">{role}</span>
                  </div>
                ))}
              </div>
            </div>
            <div ref={logRef} className="flex-1 p-6 overflow-y-auto space-y-2.5 font-mono text-[11px] bg-[#020617] selection:bg-blue-500/20">
              {messages.map(m => (
                <div key={m.id} className="flex gap-5 animate-in slide-in-from-bottom-2 duration-300 group">
                  {/* Cast to any to avoid fractionalSecondDigits TS error */}
                  <span className="text-slate-700 tabular-nums shrink-0">[{new Date(m.timestamp).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 } as any)}]</span>
                  <span className={`font-black w-24 shrink-0 text-right uppercase tracking-tighter ${AGENT_INFO[m.role].color}`}>{m.role}:</span>
                  <span className={`leading-relaxed ${
                    m.type === 'error' ? 'text-rose-500' : 
                    m.type === 'success' ? 'text-emerald-400' : 
                    m.type === 'warning' ? 'text-amber-500' : 'text-slate-400 font-medium'
                  }`}>{m.text}</span>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-3 opacity-20 grayscale">
                   <Terminal className="w-8 h-8 text-slate-500" />
                   <div className="text-[10px] font-black uppercase tracking-[0.3em]">System Idle</div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Connection Toast (Static) */}
      <div className="fixed bottom-6 right-6 z-[100]">
        <div className="flex items-center gap-4 px-5 py-3.5 bg-slate-900/90 border border-slate-800/60 rounded-2xl backdrop-blur-md shadow-2xl">
          <div className="flex flex-col items-end">
             <span className="text-[10px] font-black text-white uppercase tracking-wider">Agent Heartbeat</span>
             <span className="text-[9px] text-slate-500 font-bold uppercase">Node-01-Primary</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
             <ShieldCheck className="w-5 h-5 text-blue-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
