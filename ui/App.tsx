import { useState, useEffect, useRef } from "react";
import { Play, Send, Bot, User, Webhook, Loader2, ChevronRight, ChevronDown, Bug, X } from "lucide-react";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [streamingStep, setStreamingStep] = useState<any | null>(null);
  const [streamingSteps, setStreamingSteps] = useState<any[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingStep]);

  const createSession = async () => {
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      setSessionId(data.sessionId);
    } catch (e) {
      console.error(e);
    }
  };

  const connectStream = () => {
    if (!sessionId) return;
    
    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as any;
      if (data.type === "step") {
         setStreamingStep(data.step);
         if (data.steps) setStreamingSteps(data.steps);
      } else if (data.type === "chat_done") {
         setStreamingStep(null);
         setStreamingSteps([]);
         setMessages(prev => [...prev, { role: "assistant", content: data.result, steps: data.steps }]);
      }
    };

    return () => {
      es.close();
    };
  };

  useEffect(() => {
    const cleanup = connectStream();
    return cleanup;
  }, [sessionId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;
    const msg = input.trim();
    setInput("");
    
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    
    await fetch(`/api/sessions/${sessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });
    
    // Refresh debug data if open
    if (debugOpen) fetchDebugData(sessionId);
  };

  const fetchDebugData = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      setDebugData(await res.json());
    } catch(e) {
      console.error("Failed to load debug data", e);
    }
  };

  const toggleDebug = () => {
    if (!debugOpen) fetchDebugData(sessionId!);
    setDebugOpen(!debugOpen);
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
         <div className="bg-muted p-8 rounded-xl border border-border flex flex-col items-center gap-4 max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center text-accent mb-2">
               <Bot size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Agent Webapp</h1>
            <p className="text-sm text-muted-foreground mb-4">Start a new session to intereact with the agentic harness in a more functional way.</p>
            <button onClick={createSession} className="bg-accent hover:bg-blue-600 text-white font-medium py-3 px-6 rounded-lg w-full flex items-center justify-center gap-2 transition-colors">
               <Play size={18} />
               Start Session
            </button>
         </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background max-w-6xl mx-auto border-x border-border">
      <header className="h-14 border-b border-border flex items-center px-4 justify-between bg-background/80 backdrop-blur sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-2 font-semibold">
           <Bot className="text-accent" size={20} />
           <span>Session <span className="text-muted-foreground font-mono font-normal text-xs">{sessionId}</span></span>
        </div>
        <button 
           onClick={toggleDebug} 
           className={`p-2 rounded hover:bg-muted transition-colors ${debugOpen ? 'text-accent' : 'text-muted-foreground'}`}
        >
           <Bug size={18} />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 border-r border-transparent">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            {messages.map((m, i) => (
               <MessageRow key={i} message={m} />
            ))}
            
            {streamingSteps.length > 0 && (
               <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex flex-shrink-0 items-center justify-center text-accent mt-1">
                     <Bot size={16} />
                  </div>
                  <div className="flex flex-col gap-2 max-w-[85%] w-full">
                     <StepsDisclosure steps={streamingSteps} defaultOpen={true} />
                     {streamingStep && (
                        <StreamingStatus step={streamingStep} />
                     )}
                  </div>
               </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 bg-background">
            <form onSubmit={sendMessage} className="relative flex items-center max-w-4xl mx-auto">
               <input 
                  type="text" 
                  value={input}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                  placeholder="Message agent..." 
                  className="w-full bg-muted border border-border rounded-xl py-4 pl-4 pr-12 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-sm"
               />
               <button type="submit" disabled={!input.trim()} className="absolute right-2 p-2 bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-accent transition-colors">
                  <Send size={18} />
               </button>
            </form>
          </div>
        </div>

        {debugOpen && (
           <div className="w-80 lg:w-96 flex-shrink-0 border-l border-border bg-background flex flex-col h-full font-mono text-xs z-10 shadow-xl overflow-y-auto hidden md:flex">
              <div className="p-3 border-b border-border font-sans font-bold flex justify-between items-center bg-muted/30">
                 <span>Debug Inspector</span>
                 <button onClick={() => setDebugOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={16} />
                 </button>
              </div>
              
              {debugData ? (
                 <div className="p-4 flex flex-col gap-6">
                    <section>
                       <h3 className="text-muted-foreground mb-2 font-bold uppercase tracking-wider text-[10px]">System Prompt</h3>
                       <div className="bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap leading-relaxed">
                          {debugData.systemPrompt}
                       </div>
                    </section>
                    
                    <section>
                       <h3 className="text-muted-foreground mb-2 font-bold uppercase tracking-wider text-[10px]">Raw History ({debugData.history.length})</h3>
                       <div className="flex flex-col gap-2">
                          {debugData.history.map((h: any, i: number) => (
                             <div key={i} className="bg-muted p-3 rounded group cursor-pointer hover:border-accent border border-transparent transition-colors">
                                <div className="text-accent mb-1 font-bold">{h.role}</div>
                                <div className="line-clamp-3 overflow-hidden leading-relaxed text-muted-foreground group-hover:line-clamp-none transition-all">{h.content}</div>
                                {h.steps && <div className="mt-2 text-blue-400">{h.steps.length} steps</div>}
                             </div>
                          ))}
                       </div>
                    </section>
                 </div>
              ) : (
                 <div className="p-4 text-muted-foreground flex items-center justify-center h-40">
                    <Loader2 className="animate-spin" size={16} />
                 </div>
              )}
           </div>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: any }) {
   if (message.role === "user") {
      return (
         <div className="flex justify-end">
            <div className="bg-muted px-4 py-3 rounded-2xl rounded-tr-sm max-w-[80%] text-sm">
               {message.content}
            </div>
         </div>
      )
   }

   return (
      <div className="flex gap-4">
         <div className="w-8 h-8 rounded-full bg-accent/20 flex flex-shrink-0 items-center justify-center text-accent mt-1">
            <Bot size={16} />
         </div>
         <div className="flex flex-col gap-2 max-w-[85%]">
            {message.steps && message.steps.length > 0 && (
               <StepsDisclosure steps={message.steps} />
            )}
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
               {message.content}
            </div>
         </div>
      </div>
   )
}

function StepsDisclosure({ steps, defaultOpen = false }: { steps: any[], defaultOpen?: boolean }) {
   const [open, setOpen] = useState(defaultOpen);
   
   return (
      <div className="text-xs border border-border rounded-lg overflow-hidden bg-background">
         <button 
           onClick={() => setOpen(!open)}
           className="flex items-center gap-2 w-full p-2 bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
         >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="font-medium">View detailed steps ({steps.length})</span>
         </button>
         {open && (
            <div className="p-3 flex flex-col gap-3 border-t border-border">
               {steps.map((s: any, i: number) => (
                  <div key={i} className="flex gap-2 text-muted-foreground">
                     <Webhook size={14} className="mt-0.5 flex-shrink-0" />
                     <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">
                           {s.kind} {s.toolName && <span className="text-accent ml-1 font-mono">{s.toolName}</span>}
                        </span>
                        {s.args && <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto text-muted-foreground">{JSON.stringify(s.args, null, 2)}</pre>}
                        {s.thinking && <div className="italic text-muted-foreground break-words whitespace-pre-wrap">{s.thinking}</div>}
                        {s.result && <div className="text-foreground bg-muted/40 p-2 rounded line-clamp-3 overflow-hidden">{s.result}</div>}
                     </div>
                  </div>
               ))}
            </div>
         )}
      </div>
   )
}

function StreamingStatus({ step }: { step: any }) {
   return (
      <div className="flex gap-4 opacity-80">
         <div className="w-8 h-8 rounded-full bg-accent/10 flex flex-shrink-0 items-center justify-center text-accent mt-1 animate-pulse">
            <Loader2 className="animate-spin" size={16} />
         </div>
         <div className="flex flex-col gap-1 py-1 text-sm bg-muted/30 px-3 py-2 rounded-xl text-muted-foreground">
            <div className="flex items-center gap-2 font-medium">
               <span>Agent is thinking...</span>
               {step.toolName && <span className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{step.toolName}</span>}
            </div>
         </div>
      </div>
   )
}
