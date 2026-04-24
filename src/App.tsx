import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Navigation } from './components/Navigation';
import { DriftTree } from './components/DriftTree';
import { type Fragment, type Connection } from './lib/supabase';
import { storage } from './lib/storage';
import { generateEmbedding, analyzeConnection, synthesizeThoughts, clusterThoughts, type SynthesisResult } from './services/geminiService';
import { cn } from '@/lib/utils';
import { ArrowRight, Mic, MicOff, ChevronDown, ChevronUp, Trash2, AlertCircle, Sparkles, Info, Link2, X, Calendar } from 'lucide-react';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const PageWrapper = ({ children, title, subtitle, className, centered = true }: { children: React.ReactNode, title: string, subtitle?: string, className?: string, centered?: boolean }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    className={cn(
      "flex flex-col items-center w-full p-8 text-center overflow-y-auto h-full", 
      centered && "justify-center",
      className
    )}
  >
    <div className="space-y-4 w-full">
      <span className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-semibold">MindDrift</span>
      <h1 className="text-5xl md:text-6xl font-serif text-glow leading-tight italic">
        {title}
      </h1>
      {subtitle && (
        <p className="text-white/40 text-sm max-w-[240px] mx-auto mt-4 font-light leading-relaxed">
          {subtitle}
        </p>
      )}
      <div className="w-12 h-[1px] bg-white/20 mx-auto mt-8" />
      {children}
    </div>
  </motion.div>
);

const CapturePage = () => {
  const [thought, setThought] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const [toasts, setToasts] = useState<{ id: string, message: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addToast = (message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    textareaRef.current?.focus();

      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = navigator.language || 'en-US';

        recog.onresult = (event: any) => {
          let interimTranscript = '';
          let currentFinal = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              currentFinal += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (currentFinal) {
            setThought(prev => prev + (prev ? ' ' : '') + currentFinal);
          }
        };

      recog.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMsg("Microphone access denied. Please allow camera/microphone permissions in your browser and try again.");
        } else {
          setErrorMsg(`Voice input error: ${event.error}`);
        }
        setTimeout(() => setErrorMsg(null), 5000);
      };
      
      recog.onend = () => {
        setIsListening(false);
      };

      setRecognition(recog);
    }
  }, []);

  const toggleListening = () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  const handleSend = async () => {
    if (!thought.trim() || isSending || isAnimating) return;
    
    setIsAnimating(true);
    
    // Wait for animation to finish (600ms)
    setTimeout(async () => {
      setIsSending(true);
      
      const newFragment: Fragment = {
        id: crypto.randomUUID(),
        user_id: 'local-user',
        content: thought,
        embedding: null,
        created_at: new Date().toISOString()
      };

      // 1. Save to local storage
      storage.saveFragment(newFragment);
      
      const weeklyCount = storage.getWeeklyCount();
      addToast(`This is your ${weeklyCount}th record this week.`);
      setTimeout(() => addToast("Your thought tree is growing 🌱"), 1000);
      
      // 2. Background AI Processing
      processAI(newFragment);
      
      setThought('');
      setIsSending(false);
      setIsAnimating(false);
      setShowSuccess(true);
      
      setTimeout(() => {
        setShowSuccess(false);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }, 2000);
    }, 600);
  };

  const processAI = async (newFragment: Fragment) => {
    try {
      // a. Generate embedding
      const embedding = await generateEmbedding(newFragment.content);
      storage.updateFragment(newFragment.id, { embedding });

      // b. Find connections with recent fragments (last 10)
      const recentFragments = storage.getFragments()
        .filter(f => f.id !== newFragment.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      if (recentFragments.length > 0) {
        for (const other of recentFragments) {
          const analysis = await analyzeConnection(newFragment.content, other.content);
          if (analysis && analysis.strength > 0.4) {
            const newConnection: Connection = {
              id: crypto.randomUUID(),
              fragment_a_id: newFragment.id,
              fragment_b_id: other.id,
              reasoning: analysis.reasoning,
              strength: analysis.strength,
              created_at: new Date().toISOString()
            };
            storage.saveConnection(newConnection);
            
            // Show connection toast
            const daysAgo = Math.floor((new Date().getTime() - new Date(other.created_at).getTime()) / (1000 * 60 * 60 * 24));
            const timeDesc = daysAgo === 0 ? "earlier today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
            addToast(`Linked to a thought from ${timeDesc}: ${analysis.reasoning}`);
            break; // Just show one connection toast to avoid spamming
          }
        }
      }
    } catch (err) {
      console.error('AI Processing failed:', err);
    }
  };

  return (
    <PageWrapper 
      title={showSuccess ? "Saved" : "Capture"}
      subtitle={!showSuccess ? "Record your scattered thoughts with zero friction." : undefined}
    >
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 w-full max-w-[320px] pointer-events-none space-y-2 px-6">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, x: 20 }}
              className="glass px-4 py-2 text-[10px] uppercase tracking-wider text-white/70 border border-white/10 shadow-2xl text-center pointer-events-auto"
            >
              <div className="flex items-center justify-center gap-2">
                <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                {toast.message}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-12 w-full max-w-[320px] mx-auto">
        <AnimatePresence mode="wait">
          {!showSuccess ? (
            <motion.div 
              key="input-area"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              <div className="relative group">
                <textarea
                  ref={textareaRef}
                  value={thought}
                  onChange={(e) => setThought(e.target.value)}
                  placeholder="What's on your mind?"
                  className={cn(
                    "w-full bg-transparent border-none text-center text-base md:text-lg font-light focus:ring-0 placeholder:text-white/10 resize-none min-h-[160px] outline-none transition-all duration-300",
                    isAnimating && "animate-fly-away"
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                
                <AnimatePresence>
                  {thought && !isAnimating && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={() => {
                        setThought('');
                        setTimeout(() => textareaRef.current?.focus(), 10);
                      }}
                      className="absolute right-2 top-0 p-2 text-white/20 hover:text-white/60 transition-colors z-10"
                    >
                      <X size={18} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] uppercase tracking-wider font-semibold justify-center"
                  >
                    <AlertCircle size={14} />
                    {errorMsg}
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="flex flex-col items-center gap-8">
                <div className="flex justify-center gap-6">
                  <button
                    onClick={toggleListening}
                    disabled={!SpeechRecognition}
                    title={!SpeechRecognition ? "Speech recognition not supported" : "Voice Input"}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                      !SpeechRecognition ? "bg-white/5 text-white/10 cursor-not-allowed" : 
                      isListening ? "bg-primary text-white scale-110" : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                    )}
                  >
                    {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  <button 
                    onClick={handleSend}
                    disabled={!thought.trim() || isSending || isAnimating}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 relative bg-primary shadow-[0_0_20px_rgba(255,78,0,0.4)]",
                      (!thought.trim() || isSending || isAnimating) ? "opacity-20 scale-90 grayscale cursor-not-allowed" : "opacity-100 scale-100 hover:scale-110 active:scale-95 shadow-[0_0_30px_rgba(255,78,0,0.6)]"
                    )}
                  >
                    {isSending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <ArrowRight size={20} className="text-white" />
                    )}
                  </button>
                </div>
                
                {!SpeechRecognition && (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[10px] text-white/20 uppercase tracking-widest">Voice input not supported</p>
                    <button className="text-[9px] text-primary/60 uppercase tracking-tighter hover:text-primary transition-colors flex items-center gap-1">
                      <Sparkles size={10} />
                      Access AI Speech-to-Text
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="success-message"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center gap-6 py-12"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-[0_0_30px_rgba(255,78,0,0.2)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <p className="text-white/40 text-[10px] uppercase tracking-[0.3em] font-medium">Drifted into the cloud</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Liquid Metal Voice Animation */}
        <AnimatePresence>
          {isListening && (
            <div className="fixed inset-0 flex items-center justify-center z-[100] bg-black/10 backdrop-blur-[2px]">
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ 
                  opacity: 1, 
                  scale: [1, 1.1, 0.95, 1.05, 1],
                }}
                exit={{ opacity: 0, scale: 0.5 }}
                onClick={toggleListening}
                className="relative w-64 h-64 flex items-center justify-center cursor-pointer pointer-events-auto"
              >
                {/* Liquid Metal Blobs */}
                <motion.div
                  animate={{
                    rotate: 360,
                    scale: [1, 1.1, 0.9, 1.1, 1],
                  }}
                  transition={{
                    rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                    scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                  }}
                  className="absolute inset-0 bg-primary/30 blur-2xl animate-blob opacity-60"
                />
                
                <motion.div
                  className="w-48 h-48 bg-primary/40 backdrop-blur-3xl border border-primary/50 shadow-[0_0_80px_rgba(255,78,0,0.5)] animate-blob flex flex-col items-center justify-center relative overflow-hidden"
                  animate={{
                    scale: [1, 1.05, 0.98, 1.02, 1],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  {/* Internal Highlight for Metallic look */}
                  <div className="absolute top-[-20%] left-[-20%] w-[150%] h-[150%] bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                  
                  <motion.div
                    animate={{
                      height: [12, 32, 12, 24, 16],
                      opacity: [0.5, 1, 0.5, 0.8, 0.5]
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="w-1.5 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                  />
                  <span className="mt-4 text-[10px] uppercase tracking-[0.5em] text-white font-bold text-center pl-1 drop-shadow-md">
                    Listening
                  </span>
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </PageWrapper>
  );
};

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

const StreamCard = ({ 
  fragment, 
  connections, 
  onDelete 
}: { 
  fragment: Fragment, 
  connections: Connection[], 
  onDelete: (id: string) => void 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [isSwiped, setIsSwiped] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const handleLongPressStart = () => {
    const timer = setTimeout(() => {
      setShowConfirm(true);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  return (
    <div className="relative group">
      {/* Delete Button (revealed on swipe) */}
      <div className="absolute inset-0 flex justify-end items-center pr-8 rounded-[1.5rem] bg-destructive/20 overflow-hidden">
        <button 
          onClick={() => setShowConfirm(true)}
          className="w-12 h-12 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg transform transition-transform duration-300 hover:scale-110"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Main Card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50) {
            setIsSwiped(true);
          } else {
            setIsSwiped(false);
          }
        }}
        animate={{ x: isSwiped ? -100 : 0 }}
        onPointerDown={handleLongPressStart}
        onPointerUp={handleLongPressEnd}
        onPointerLeave={handleLongPressEnd}
        className="glass p-8 rounded-[1.5rem] text-left relative hover:bg-white/[0.12] transition-colors duration-500 cursor-grab active:cursor-grabbing z-10 w-full"
      >
        <div className="space-y-4">
          <div className="flex justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAI(!showAI);
              }}
              className={cn(
                "p-2 transition-colors",
                showAI ? "text-primary" : "text-white/40 hover:text-white/70"
              )}
            >
              <Info size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-2 text-white/40 hover:text-primary transition-colors"
            >
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>

          <div className="relative">
            <motion.div
              animate={{ height: isExpanded ? 'auto' : 'auto' }}
              className={cn(
                "relative transition-all duration-500 ease-in-out",
                !isExpanded && "line-clamp-4"
              )}
            >
              <p className="text-sm md:text-base font-light leading-relaxed text-white/90">
                {fragment.content}
              </p>
            </motion.div>
            
            {!isExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none" />
            )}
          </div>
          
          {/* Connections (Hidden by default, shown via Info button) */}
          <AnimatePresence>
            {showAI && connections.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-2 space-y-3 overflow-hidden"
              >
                <div className="h-[1px] bg-white/5 w-full my-2" />
                <div className="flex flex-wrap gap-2">
                  {connections.slice(0, 3).map(conn => (
                    <div key={conn.id} className="px-4 py-2 rounded-full bg-white/5 border border-white/10 flex items-center gap-2 group/conn hover:bg-white/10 transition-colors">
                      <div className="w-1 h-1 rounded-full bg-primary/60 group-hover/conn:bg-primary transition-colors" />
                      <p className="text-[10px] text-white/40 italic font-serif leading-tight group-hover/conn:text-white/60 transition-colors">
                        {conn.reasoning}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <div className="w-1 h-1 rounded-full bg-primary" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-semibold">
                {formatRelativeTime(fragment.created_at)}
              </span>
            </div>
            
            {connections.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/40">
                <Link2 size={10} />
                <span className="text-[10px] font-bold tracking-wider">{connections.length}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass p-8 rounded-[1.5rem] max-w-[320px] w-full text-center space-y-6 border border-white/10"
            >
              <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mx-auto">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-serif italic text-white/90">Delete Fragment?</h3>
                <p className="text-xs text-white/40 leading-relaxed">This action cannot be undone. Your thought will drift away forever.</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-full bg-white/5 text-white/60 text-xs uppercase tracking-widest hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    onDelete(fragment.id);
                    setShowConfirm(false);
                  }}
                  className="flex-1 py-3 rounded-full bg-destructive text-white text-xs uppercase tracking-widest hover:bg-destructive/80 transition-colors shadow-lg shadow-destructive/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StreamPage = () => {
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);

  const fetchData = () => {
    const fragData = storage.getFragments()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    const connData = storage.getConnections();
    
    setFragments(fragData);
    setConnections(connData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = (id: string) => {
    storage.deleteFragment(id);
    fetchData();
  };

  const getConnectionsForFragment = (fragmentId: string) => {
    return connections.filter(c => c.fragment_a_id === fragmentId || c.fragment_b_id === fragmentId);
  };

  // Group fragments by Year and Month for the timeline
  const timelineGroups = useMemo(() => {
    const groups: { [key: string]: { year: number, month: number, firstId: string } } = {};
    fragments.forEach(f => {
      const date = new Date(f.created_at);
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${month}`;
      if (!groups[key]) {
        groups[key] = { year, month, firstId: f.id };
      }
    });
    return Object.values(groups).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [fragments]);

  const scrollToFragment = (id: string) => {
    const element = document.getElementById(`fragment-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShowTimeline(false);
    }
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <PageWrapper 
      title="Stream" 
      subtitle="Your scattered thoughts, flowing across time."
      centered={false}
    >
      <div className="aurora-bg">
        <div className="aurora-inner" />
      </div>

      {/* Floating Timeline Toggle */}
      <div className="fixed right-6 top-24 z-50">
        <button
          onClick={() => setShowTimeline(!showTimeline)}
          className={cn(
            "w-12 h-12 rounded-full glass flex items-center justify-center transition-all duration-500",
            showTimeline ? "bg-primary text-white" : "text-white/40 hover:text-white"
          )}
        >
          <Calendar size={20} />
        </button>
      </div>

      {/* Timeline Sidebar/Overlay */}
      <AnimatePresence>
        {showTimeline && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTimeline(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-64 glass-dark z-[70] p-8 border-l border-white/10 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xs uppercase tracking-[0.3em] text-white/40 font-bold">Timeline</h3>
                <button onClick={() => setShowTimeline(false)} className="text-white/20 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-8">
                {timelineGroups.length > 0 ? (
                  timelineGroups.map((group, idx) => (
                    <div key={`${group.year}-${group.month}`} className="space-y-2">
                      {/* Year Header if it's the first month of that year in the list */}
                      {(idx === 0 || timelineGroups[idx - 1].year !== group.year) && (
                        <div className="text-[10px] text-primary font-bold tracking-[0.2em] uppercase mb-4">
                          {group.year}
                        </div>
                      )}
                      <button
                        onClick={() => scrollToFragment(group.firstId)}
                        className="w-full text-left group flex items-center gap-3 py-1"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-white/10 group-hover:bg-primary transition-colors" />
                        <span className="text-sm font-light text-white/40 group-hover:text-white transition-colors">
                          {monthNames[group.month]}
                        </span>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/20 italic">No history yet.</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="mt-4 w-full max-w-[400px] mx-auto space-y-6 pb-32">
        {loading ? (
          <div className="py-20 flex justify-center w-full">
            <div className="w-8 h-8 border-2 border-white/10 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {fragments.map((fragment, index) => (
              <motion.div
                key={fragment.id}
                id={`fragment-${fragment.id}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ 
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1] 
                }}
                className="w-full"
              >
                <StreamCard 
                  fragment={fragment} 
                  connections={getConnectionsForFragment(fragment.id)}
                  onDelete={handleDelete}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        {!loading && fragments.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-20 text-center w-full"
          >
            <p className="text-white/20 italic font-serif">The stream is quiet...</p>
          </motion.div>
        )}
      </div>
    </PageWrapper>
  );
};

const TreePage = ({ clusterData, setClusterData }: { clusterData: any, setClusterData: any }) => {
  const [fragments, setFragments] = useState<Fragment[]>(storage.getFragments());
  const [connections, setConnections] = useState<Connection[]>(storage.getConnections());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // Refresh local data in case background processing changed it
    setFragments(storage.getFragments());
    setConnections(storage.getConnections());
  }, []);

  const selectedFragment = fragments.find(f => f.id === selectedId);
  const relatedConnections = connections
    .filter(c => c.fragment_a_id === selectedId || c.fragment_b_id === selectedId)
    .sort((a, b) => b.strength - a.strength);

  const getRelatedFragment = (conn: Connection) => {
    const otherId = conn.fragment_a_id === selectedId ? conn.fragment_b_id : conn.fragment_a_id;
    return fragments.find(f => f.id === otherId);
  };

  const latestFragmentId = fragments.length > 0 
    ? [...fragments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].id 
    : null;

  return (
    <div className="w-full h-full relative bg-[#080810]">
      <DriftTree 
        fragments={fragments} 
        connections={connections} 
        clusterData={clusterData}
        onNodeClick={(id) => setSelectedId(id)}
        latestId={latestFragmentId}
        title="Tree"
        subtitle="The evolving structure of your drifting consciousness"
        fragmentsCount={fragments.length}
        driftsCount={connections.length}
      />

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedId && selectedFragment && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[70] max-w-[480px] mx-auto glass-dark rounded-t-[2.5rem] border-t border-white/10 p-8 pb-12 max-h-[85vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
              
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">Fragment Detail</span>
                  <h2 className="text-2xl font-serif italic text-white/90">Insight</h2>
                </div>
                <button 
                  onClick={() => setSelectedId(null)}
                  className="p-2 rounded-full bg-white/5 text-white/40 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                  <p className="text-sm md:text-base font-light leading-relaxed text-white/90 italic font-serif">
                    "{selectedFragment.content}"
                  </p>
                </div>

                {relatedConnections.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-[1px] flex-1 bg-white/10" />
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-semibold">Related Drifts</span>
                      <div className="h-[1px] flex-1 bg-white/10" />
                    </div>

                    <div className="space-y-4">
                      {relatedConnections.slice(0, 5).map((conn, idx) => {
                        const related = getRelatedFragment(conn);
                        if (!related) return null;
                        return (
                          <motion.div 
                            key={conn.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="glass p-6 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-primary font-bold uppercase tracking-widest">Priority {idx + 1}</span>
                              <div className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary font-bold">
                                {Math.round(conn.strength * 100)}%
                              </div>
                            </div>
                            <p className="text-sm text-white/80 font-light leading-relaxed">
                              {related.content}
                            </p>
                            <div className="pt-2 border-t border-white/5">
                              <p className="text-[10px] text-white/40 italic font-serif">
                                {conn.reasoning}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const SynthesisPage = () => {
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [result, setResult] = useState<SynthesisResult | null>(null);
  const [history, setHistory] = useState<(SynthesisResult & { created_at: string, id: string })[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(storage.getSyntheses());
  }, []);

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    setError(null);
    try {
      const allFragments = storage.getFragments();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentThoughts = allFragments
        .filter(f => new Date(f.created_at) >= sevenDaysAgo)
        .map(f => f.content);

      if (recentThoughts.length === 0) {
        setError("No thoughts recorded in the last 7 days.");
        setIsSynthesizing(false);
        return;
      }

      const synthesis = await synthesizeThoughts(recentThoughts);
      if (synthesis) {
        setResult(synthesis);
        storage.saveSynthesis(synthesis);
        setHistory(storage.getSyntheses());
      } else {
        setError("Failed to synthesize thoughts. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <PageWrapper 
      title="Synthesis" 
      subtitle="Uncover the hidden patterns within your drifting mind."
      centered={false}
    >
      <div className="mt-12 w-full max-w-[480px] mx-auto px-4 space-y-12 pb-32">
        <div className="flex flex-col items-center gap-8">
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Atmospheric Loading State */}
            <AnimatePresence>
              {isSynthesizing && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {/* Central Sphere */}
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 0.8, 0.5],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="w-24 h-24 rounded-full bg-primary/20 blur-2xl"
                  />
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute w-16 h-16 rounded-full border border-primary/30 shadow-[0_0_40px_rgba(255,78,0,0.3)]"
                  />
                  
                  {/* Orbital Rings */}
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4 + i * 2, repeat: Infinity, ease: "linear" }}
                      className="absolute border border-white/5 rounded-full"
                      style={{
                        width: `${100 + i * 40}px`,
                        height: `${100 + i * 40}px`,
                        opacity: 0.1 + i * 0.05,
                        transform: `rotateX(${45 + i * 15}deg) rotateY(${15 + i * 10}deg)`,
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={handleSynthesize}
              disabled={isSynthesizing}
              className={cn(
                "group relative z-10 w-32 h-32 rounded-full glass-dark flex flex-col items-center justify-center gap-2 transition-all duration-700 overflow-hidden",
                isSynthesizing ? "scale-90 opacity-40" : "hover:scale-110 hover:shadow-[0_0_50px_rgba(255,78,0,0.2)]"
              )}
            >
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <Sparkles size={24} className={cn("text-primary transition-transform duration-700", isSynthesizing && "animate-pulse")} />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/60">
                {isSynthesizing ? "Merging" : "Synthesize"}
              </span>
            </button>
          </div>
        </div>

        {error && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-destructive text-xs text-center font-medium uppercase tracking-widest"
          >
            {error}
          </motion.p>
        )}

        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Text Version */}
              <div className="glass p-8 rounded-[1.5rem] text-left space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles size={14} />
                  <span className="text-[10px] uppercase tracking-[0.3em] font-bold">Insight</span>
                </div>
                <div className="text-sm md:text-base font-light leading-relaxed text-white/80 space-y-4">
                  {result.text.split('\n\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>

              {/* Tag Version */}
              <div className="space-y-4">
                <span className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-bold block text-center">Core Themes</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {result.keywords.map((tag, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] uppercase tracking-widest font-semibold"
                    >
                      {tag}
                    </motion.span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {history.length > 0 && (
          <div className="space-y-6 pt-8 border-t border-white/5">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-4 group"
            >
              <h3 className="text-xs uppercase tracking-widest text-white/20 font-semibold group-hover:text-white/40 transition-colors">Previous Syntheses</h3>
              <div className={cn("text-white/20 transition-transform duration-300", showHistory && "rotate-180")}>
                <ChevronDown size={16} />
              </div>
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-6 overflow-hidden"
                >
                  {history.map((item) => (
                    <button 
                      key={item.id} 
                      onClick={() => {
                        setResult(item);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="w-full text-left glass p-6 rounded-[1.5rem] space-y-4 opacity-60 hover:opacity-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/40 uppercase tracking-widest">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-white/70 line-clamp-3 font-light leading-relaxed">
                        {item.text}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {item.keywords.slice(0, 3).map((kw, i) => (
                          <span key={i} className="text-[10px] text-primary/60">#{kw}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};

const LandingPage = ({ onEnter }: { onEnter: () => void }) => (
  <PageWrapper 
    title="MindDrift" 
    subtitle="A private sanctuary for your scattered thoughts. Everything stays in your browser."
  >
    <div className="mt-16">
      <button
        onClick={onEnter}
        className="group relative px-8 py-4 glass-dark rounded-full overflow-hidden transition-all duration-500 hover:scale-105 active:scale-95"
      >
        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-center gap-3">
          <span className="text-sm uppercase tracking-[0.3em] font-medium text-white/80 group-hover:text-white transition-colors">
            Enter your space
          </span>
          <ArrowRight size={16} className="text-primary group-hover:translate-x-1 transition-transform duration-500" />
        </div>
      </button>
    </div>
  </PageWrapper>
);

const AnimatedRoutes = ({ clusterData, setClusterData }: { clusterData: any, setClusterData: any }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <div key={location.pathname} className="w-full">
        <Routes location={location}>
          <Route path="/" element={<CapturePage />} />
          <Route path="/stream" element={<StreamPage />} />
          <Route path="/synthesis" element={<SynthesisPage />} />
          <Route path="/tree" element={<TreePage clusterData={clusterData} setClusterData={setClusterData} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AnimatePresence>
  );
};

export default function App() {
  const [hasEntered, setHasEntered] = useState<boolean | null>(null);
  const [clusterData, setClusterData] = useState<any>(storage.getClusterData());

  useEffect(() => {
    setHasEntered(storage.hasEntered());
  }, []);

  // Background clustering when fragments change or on load
  useEffect(() => {
    if (hasEntered === null) return;
    
    const fragments = storage.getFragments();
    const cached = storage.getClusterData();
    
    // Only re-cluster if we have enough fragments AND (no cache OR fragment count changed)
    // This is a simple heuristic; a better one would check IDs.
    if (fragments.length >= 3 && (!cached || cached.fragmentCount !== fragments.length)) {
      clusterThoughts(fragments.map(f => ({ id: f.id, content: f.content })))
        .then(data => {
          const dataWithMeta = { ...data, fragmentCount: fragments.length };
          setClusterData(dataWithMeta);
          storage.saveClusterData(dataWithMeta);
        });
    } else if (cached && !clusterData) {
      setClusterData(cached);
    }
  }, [hasEntered]);

  const handleEnter = () => {
    storage.setEntered(true);
    setHasEntered(true);
  };

  if (hasEntered === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Router>
      <div className="max-w-[480px] mx-auto h-screen bg-background relative overflow-hidden flex flex-col">
        <div className="atmosphere" />
        <main className="flex-1 relative overflow-hidden">
          {hasEntered ? <AnimatedRoutes clusterData={clusterData} setClusterData={setClusterData} /> : <LandingPage onEnter={handleEnter} />}
        </main>
        {hasEntered && <Navigation />}
      </div>
    </Router>
  );
}



