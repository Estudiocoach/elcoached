import React, { useState, useEffect, FormEvent } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { Poll, Question } from '@/src/types';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase-utils';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, ChevronRight, Play, LogOut, Layers, Loader2 } from 'lucide-react';

interface ParticipantViewProps {
  pollId: string;
  onExit?: () => void;
}

export function ParticipantView({ pollId, onExit }: ParticipantViewProps) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingPoll, setLoadingPoll] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [name, setName] = useState('');
  const [participantCode, setParticipantCode] = useState('');
  const [isUnirseed, setIsUnirseed] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isPreparingSession, setIsPreparingSession] = useState(false);
  const [preparingStep, setPreparingStep] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [hasRevealedDestiny, setHasRevealedDestiny] = useState(false);
  
  const [responseText, setResponseText] = useState('');
  const [responseValue, setResponseValue] = useState<string | number>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedAt, setLastSubmittedAt] = useState(0);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const [completedQuestionIds, setCompletedQuestionIds] = useState<Set<string>>(new Set());
  const [myResponses, setMyResponses] = useState<any[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`completed_questions_${pollId}`);
      if (saved) {
        setCompletedQuestionIds(new Set(JSON.parse(saved)));
      }
    } catch (e) {
      console.warn("localStorage is blocked or disabled in this environment:", e);
    }
  }, [pollId]);

  const markQuestionAsCompleted = (qId: string) => {
    const updated = new Set(completedQuestionIds);
    updated.add(qId);
    setCompletedQuestionIds(updated);
    try {
      localStorage.setItem(`completed_questions_${pollId}`, JSON.stringify(Array.from(updated)));
    } catch (e) {
      console.warn("localStorage is blocked or disabled in this environment:", e);
    }
    setResponseText('');
    setResponseValue('');
  };

  useEffect(() => {
    const pollRef = doc(db, 'polls', pollId);
    return onSnapshot(pollRef, (snapshot) => {
      if (snapshot.exists()) {
        setPoll({ id: snapshot.id, ...snapshot.data() } as Poll);
      }
      setLoadingPoll(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `polls/${pollId}`);
      setLoadingPoll(false);
    });
  }, [pollId]);

  useEffect(() => {
    const q = query(collection(db, 'polls', pollId, 'questions'), orderBy('order'));
    return onSnapshot(q, (snapshot) => {
      setQuestions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
      setLoadingQuestions(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `polls/${pollId}/questions`);
      setLoadingQuestions(false);
    });
  }, [pollId]);

  // Load saved session on mount
  useEffect(() => {
    try {
      const savedName = localStorage.getItem(`participant_name_${pollId}`);
      const savedCode = localStorage.getItem(`participant_code_${pollId}`);
      if (savedName && savedCode) {
        setName(savedName);
        setParticipantCode(savedCode);
        setIsUnirseed(true);
      }
    } catch (e) {
      console.warn("localStorage is blocked or disabled in this environment:", e);
    }
  }, [pollId]);

  // Track answered questions by unique participantCode
  useEffect(() => {
    if (!isUnirseed || !participantCode) return;
    const q = query(
      collection(db, 'polls', pollId, 'responses'),
      where('participantCode', '==', participantCode)
    );
    return onSnapshot(q, (snapshot) => {
      const answeredIds = new Set(snapshot.docs.map(doc => doc.data().questionId as string));
      setAnsweredQuestionIds(answeredIds);
      setMyResponses(snapshot.docs.map(doc => doc.data()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `polls/${pollId}/responses`);
    });
  }, [pollId, isUnirseed, participantCode]);

  const activeQuestion = questions.find(q => 
    !completedQuestionIds.has(q.id) && 
    (!answeredQuestionIds.has(q.id) || q.type === 'brainstorm' || q.type === 'word-cloud' || q.type === 'guess-name' || q.type === 'complete-sequence')
  );

  useEffect(() => {
    if (activeQuestion) {
      setHasRevealedDestiny(false);
    }
  }, [activeQuestion]);

  const handleJoin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || isGeneratingCode) return;

    // Force keyboad close on mobile to prevent resize reflow animations from stalling or breaking layout transitions
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setIsGeneratingCode(true);
    setIsPreparingSession(true);
    setJoinError(null);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      setPreparingStep('Generando código único...');
      await sleep(400);

      // Generate random 7-digit numeric code (Kahoot style)
      const code = Math.floor(1000000 + Math.random() * 9000000).toString();

      setPreparingStep('Registrando participante...');
      await sleep(400);

      // Register in Firestore and await it
      await setDoc(doc(db, 'polls', pollId, 'participants', code), {
        name: name.trim(),
        code: code,
        createdAt: Date.now()
      });

      setPreparingStep('Sincronizando base de datos...');
      await sleep(400);

      // Save to state and localStorage
      setParticipantCode(code);
      try {
        localStorage.setItem(`participant_name_${pollId}`, name.trim());
        localStorage.setItem(`participant_code_${pollId}`, code);
      } catch (e) {
        console.warn("localStorage is blocked or disabled in this environment:", e);
      }

      // Mark as joined so the queries and active listeners boot up
      setIsUnirseed(true);

      setPreparingStep('Conectando sesión en vivo...');
      await sleep(600); // Give Firebase snapshot listeners time to initiate and sync

      setPreparingStep('¡Preparación completada!');
      await sleep(300);

      // Transition to welcome screen
      setShowWelcomeScreen(true);

    } catch (err) {
      console.error('Error registering participant:', err);
      setJoinError('Error al conectar con la sesión. Por favor, inténtalo de nuevo.');
      setIsPreparingSession(false);
    } finally {
      setIsGeneratingCode(false);
      setIsPreparingSession(false);
    }
  };

  const submitResponse = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if ((!responseText.trim() && !responseValue) || isSubmitting || !activeQuestion) return;

    // Word cloud validations
    if (activeQuestion.type === 'word-cloud') {
      const trimmed = responseText.trim();
      const hasSpaces = trimmed.split(/\s+/).length > 1;
      if (hasSpaces || !trimmed) {
        alert("Por favor, ingresa una sola palabra sin espacios.");
        return;
      }
      const myWords = myResponses.filter(r => r.questionId === activeQuestion.id);
      if (myWords.length >= 30) {
        alert("Has alcanzado el límite máximo de 30 palabras.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'polls', pollId, 'responses'), {
        pollId,
        questionId: activeQuestion.id,
        participantName: name || 'Anonymous',
        participantCode: participantCode || '', // Regido por códigos únicos de 7 números
        text: responseText,
        value: responseValue || responseText,
        createdAt: Date.now()
      });
      setResponseText('');
      setResponseValue('');
      setLastSubmittedAt(Date.now());
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `polls/${pollId}/responses`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingPoll || loadingQuestions) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isPreparingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 text-center"
        >
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-100">
            <Loader2 className="w-10 h-10 animate-spin" />
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 mb-2 leading-tight">
            Preparando Sesión
          </h2>
          <p className="text-slate-500 font-medium italic mb-6">
            Asegurando que todo esté listo para jugar...
          </p>

          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-center gap-3">
              <span className="text-sm font-bold text-indigo-600 animate-pulse">
                {preparingStep}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <motion.div 
                key={preparingStep}
                initial={{ width: '10%' }}
                animate={{ 
                  width: preparingStep.includes('Generando') ? '30%' : 
                         preparingStep.includes('Registrando') ? '60%' : 
                         preparingStep.includes('Sincronizando') ? '80%' : 
                         preparingStep.includes('Conectando') ? '95%' : '100%' 
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="h-full bg-indigo-600 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (poll?.status === 'draft') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 text-center"
        >
          <div className="w-16 h-16 bg-yellow-400 rounded-2xl flex items-center justify-center text-white mb-8 shadow-lg shadow-yellow-100 mx-auto">
            <Play className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2 leading-tight">Session Starting Soon</h1>
          <p className="text-slate-500 font-medium italic">Please wait while the organizer prepares the presentation.</p>
        </motion.div>
      </div>
    );
  }

  if (showWelcomeScreen) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 text-center"
        >
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-100">
            <Layers className="w-10 h-10 animate-pulse" />
          </div>
          
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2">
            ¡Bienvenido!
          </h1>
          <p className="text-2xl font-semibold text-indigo-600 mb-8">
            ¿Listo para Empezar?
          </p>

          {poll?.type === 'challenge' ? (
            <p className="text-slate-600 mb-8 font-medium leading-relaxed text-base">
              Hola <strong className="text-slate-800 font-bold">{name}</strong> estas jugando una sesion privada, si respondes bien quien te invito tiene una prenda, y si respondes mal, vos tenes que cumplir su prenda ¿Estas listo?
            </p>
          ) : (
            <p className="text-slate-500 mb-8 font-medium leading-relaxed">
              Hola <strong className="text-slate-800 font-bold">{name}</strong>, ya estás registrado. Haz clic en el botón de abajo para ver y responder las preguntas de la sesión.
            </p>
          )}

          <button 
            onClick={() => {
              setShowWelcomeScreen(false);
              setIsUnirseed(true);
            }}
            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            Comenzar
            <ChevronRight className="w-6 h-6" />
          </button>
        </motion.div>
      </div>
    );
  }

  if (!isUnirseed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200"
        >
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-8 shadow-lg shadow-indigo-100">
            <User className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2 leading-tight">Unirse a la Sesión</h1>
          <p className="text-slate-500 mb-8 font-medium italic">¡Bienvenido a {poll?.title || 'la sesión'}!</p>
          
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleJoin();
            }}
            className="space-y-6"
          >
            {joinError && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm font-semibold text-center">
                {joinError}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Identifícate</label>
              <div className="relative">
                <input 
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ingresa tu nombre"
                  required
                  disabled={isGeneratingCode}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all font-bold placeholder:text-slate-300 disabled:opacity-50"
                />
              </div>
            </div>
            <button 
              type="submit"
              disabled={isGeneratingCode || !name.trim()}
              className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
            >
              {isGeneratingCode ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generando código...</span>
                </>
              ) : (
                <>
                  <span>Entrar a la Sesión</span>
                  <ChevronRight className="w-6 h-6" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 font-sans">
      <header className="max-w-2xl mx-auto mb-10 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-[0.2em]">Sesión en Vivo</span>
          <h2 className="text-xl font-extrabold text-slate-800 truncate flex-1">{poll?.title}</h2>
        </div>
        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden shadow-inner">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.8 }}
            className="h-full bg-indigo-600"
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto">
        {poll?.status === 'closed' ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 mb-6 text-center"
          >
            <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-rose-100 mx-auto">
              <User className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Sesión Cerrada</h3>
            <p className="text-slate-500 font-medium">El administrador ha cerrado esta sesión. Ya no se aceptan más respuestas.</p>
          </motion.div>
        ) : !activeQuestion ? (
          (() => {
            if (poll?.type === 'challenge') {
              if (!hasRevealedDestiny) {
                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-indigo-200 mb-6 text-center"
                  >
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500 mb-6 mx-auto border-4 border-indigo-100">
                      <span className="text-3xl">🔮</span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">¡Felicidades!</h3>
                    <p className="text-slate-600 font-semibold text-lg mb-8 leading-relaxed">
                      Respondiste todas las preguntas ¿Estas listo para revelar tu destino?
                    </p>
                    <button 
                      onClick={() => setHasRevealedDestiny(true)}
                      className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                      REVELAR
                    </button>
                  </motion.div>
                );
              }

              let errors = 0;
              let totalEvaluated = 0;
              questions.forEach(q => {
                if (q.correctAnswer) {
                  const resp = myResponses.find(r => r.questionId === q.id);
                  if (resp) {
                    totalEvaluated++;
                    if (String(resp.value).trim().toLowerCase() !== String(q.correctAnswer).trim().toLowerCase()) {
                      errors++;
                    }
                  }
                }
              });

              if (errors > 0) {
                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-rose-200 mb-6 text-center"
                  >
                    <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mb-6 mx-auto border-4 border-rose-100">
                      <span className="text-3xl">⚠️</span>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">¡Has fallado!</h3>
                    <p className="text-slate-500 font-medium text-lg mb-8">Tuviste {errors} {errors === 1 ? 'error' : 'errores'} en el desafío.</p>
                    <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                      <p className="text-sm font-bold text-rose-500 uppercase tracking-widest mb-2">Prenda para ti</p>
                      <p className="text-xl font-black text-rose-900 leading-tight">Ahora tienes que {poll.penaltyParticipant || 'cumplir la prenda'}</p>
                    </div>
                  </motion.div>
                );
              } else if (totalEvaluated > 0) {
                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-emerald-200 mb-6 text-center"
                  >
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-6 mx-auto border-4 border-emerald-100">
                      <span className="text-3xl">🎉</span>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">¡Perfección!</h3>
                    <p className="text-slate-500 font-medium text-lg mb-8">Has respondido correctamente a todas las preguntas.</p>
                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                      <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest mb-2">Prenda para el Admin</p>
                      <p className="text-xl font-black text-emerald-900 leading-tight">Felicidades, ahora el admin tiene {poll.penaltyAdmin || 'la prenda'}</p>
                    </div>
                  </motion.div>
                );
              }
            }
            
            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 mb-6 text-center"
              >
                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-100 mx-auto">
                  <Send className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">¡Al día!</h3>
                <p className="text-slate-500 font-medium">Has respondido todas las preguntas disponibles. Gracias por participar.</p>
              </motion.div>
            );
          })()
        ) : (
          (() => {
            const myResponse = myResponses.find(r => r.questionId === activeQuestion.id);
            const hasResponded = !!myResponse;
            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200 mb-6"
              >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                <Send className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-black text-slate-900">
                {activeQuestion.text}
              </h3>
            </div>
            
            <div className="space-y-6">
              {activeQuestion.type === 'text' && (
                <textarea 
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="¿Qué te gustaría compartir?"
                  className="w-full px-6 py-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all min-h-[160px] resize-none font-medium placeholder:text-slate-300"
                />
              )}

              {activeQuestion.type === 'open-ended' && (
                <div className="space-y-2">
                  <textarea 
                    value={responseText}
                    onChange={(e) => {
                      if (e.target.value.length <= 250) {
                        setResponseText(e.target.value);
                      }
                    }}
                    placeholder="Escribe tu respuesta abierta aquí (máximo 250 caracteres)..."
                    className="w-full px-6 py-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all min-h-[160px] resize-none font-bold placeholder:text-slate-300 text-slate-800"
                  />
                  <div className="text-right text-xs font-black text-slate-400">
                    {responseText.length} / 250 caracteres
                  </div>
                </div>
              )}

              {activeQuestion.type === 'brainstorm' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <textarea 
                      value={responseText}
                      onChange={(e) => {
                        if (e.target.value.length <= 75) {
                          setResponseText(e.target.value);
                        }
                      }}
                      placeholder="Escribe una idea innovadora (máximo 75 caracteres)..."
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all min-h-[100px] resize-none font-bold placeholder:text-slate-300 text-slate-800"
                    />
                    <div className="text-right text-xs font-black text-slate-400">
                      {responseText.length} / 75 caracteres
                    </div>
                  </div>

                  {(() => {
                    const myIdeas = myResponses.filter(r => r.questionId === activeQuestion.id);
                    if (myIdeas.length === 0) return null;
                    return (
                      <div className="pt-4 border-t border-slate-100 space-y-2 text-left">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tus ideas enviadas ({myIdeas.length}):</span>
                        <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto">
                          {myIdeas.map((idea, i) => (
                            <div key={i} className="px-3.5 py-2.5 bg-indigo-50/50 border border-indigo-100/50 rounded-xl text-xs font-bold text-indigo-950">
                              "{idea.text || idea.value}"
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeQuestion.type === 'word-cloud' && (
                <div className="space-y-4">
                  {(() => {
                    const myWords = myResponses.filter(r => r.questionId === activeQuestion.id);
                    const isLimitReached = myWords.length >= 30;
                    
                    const trimmed = responseText.trim();
                    const hasMultipleWords = trimmed.split(/\s+/).length > 1;

                    return (
                      <div className="space-y-4">
                        <div className="space-y-2 text-left">
                          <input 
                            type="text"
                            value={responseText}
                            onChange={(e) => {
                              if (e.target.value.length <= 30) {
                                setResponseText(e.target.value);
                              }
                            }}
                            placeholder={isLimitReached ? "Límite de 30 palabras alcanzado" : "Escribe una sola palabra (máximo 30 caracteres)..."}
                            disabled={isLimitReached}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all font-bold placeholder:text-slate-300 text-slate-800 disabled:opacity-50"
                          />
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-black text-indigo-600">
                              Palabras enviadas: {myWords.length} / 30
                            </span>
                            <span className="font-black text-slate-400">
                              {responseText.length} / 30 caracteres
                            </span>
                          </div>
                          
                          {trimmed && hasMultipleWords && (
                            <p className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-100 animate-pulse">
                              ⚠️ Por favor, ingresa una sola palabra sin espacios.
                            </p>
                          )}
                        </div>

                        {myWords.length > 0 && (
                          <div className="pt-4 border-t border-slate-100 space-y-2 text-left">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tus palabras enviadas:</span>
                            <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                              {myWords.map((word, i) => (
                                <span key={i} className="px-2.5 py-1 bg-purple-50 border border-purple-100 rounded-lg text-xs font-black text-purple-700 uppercase">
                                  {word.text || word.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeQuestion.type === 'multiple-choice' && (
                <div className="grid grid-cols-1 gap-3">
                  {activeQuestion.options?.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setResponseValue(option)}
                      className={`w-full p-4 rounded-2xl text-left font-bold transition-all border-2 ${
                        responseValue === option 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                          : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {activeQuestion.type === 'four-options' && (
                <div className="grid grid-cols-1 gap-3">
                  {(() => {
                    const letters = ['A', 'B', 'C', 'D'];
                    const badgeStyles = [
                      'bg-indigo-100 text-indigo-700 border-indigo-200',
                      'bg-emerald-100 text-emerald-700 border-emerald-200',
                      'bg-rose-100 text-rose-700 border-rose-200',
                      'bg-amber-100 text-amber-700 border-amber-200'
                    ];
                    return activeQuestion.options?.slice(0, 4).map((option, idx) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setResponseValue(option)}
                        className={`w-full p-4 rounded-2xl text-left font-black transition-all border-2 flex items-center gap-4 ${
                          responseValue === option 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                            : 'bg-slate-50 border-transparent text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black border text-sm shrink-0 ${
                          responseValue === option 
                            ? 'bg-white text-indigo-600 border-white shadow-inner' 
                            : badgeStyles[idx] || badgeStyles[0]
                        }`}>
                          {letters[idx]}
                        </span>
                        <span className="text-base font-bold line-clamp-2">{option}</span>
                      </button>
                    ));
                  })()}
                </div>
              )}

              {activeQuestion.type === 'true-false' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setResponseValue('Verdadero')}
                    className={`p-6 rounded-3xl text-center font-black transition-all border-2 flex flex-col items-center justify-center gap-3 min-h-[120px] ${
                      responseValue === 'Verdadero' 
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl scale-[1.02]' 
                        : 'bg-emerald-50/30 border-emerald-100/50 text-emerald-800 hover:bg-emerald-50/50'
                    }`}
                  >
                    <span className="text-2xl">✓</span>
                    <span className="text-lg font-black uppercase tracking-wider">Verdadero</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResponseValue('Falso')}
                    className={`p-6 rounded-3xl text-center font-black transition-all border-2 flex flex-col items-center justify-center gap-3 min-h-[120px] ${
                      responseValue === 'Falso' 
                        ? 'bg-rose-600 border-rose-600 text-white shadow-xl scale-[1.02]' 
                        : 'bg-rose-50/30 border-rose-100/50 text-rose-800 hover:bg-rose-50/50'
                    }`}
                  >
                    <span className="text-2xl">✗</span>
                    <span className="text-lg font-black uppercase tracking-wider">Falso</span>
                  </button>
                </div>
              )}

              {activeQuestion.type === 'comparison' && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'A', label: 'Opción A', img: activeQuestion.optionAImage },
                    { id: 'B', label: 'Opción B', img: activeQuestion.optionBImage }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setResponseValue(opt.id)}
                      className={`flex flex-col items-center gap-4 p-4 rounded-[2rem] transition-all border-4 ${
                        responseValue === opt.id 
                          ? 'bg-indigo-50 border-indigo-600 shadow-xl scale-[1.02]' 
                          : 'bg-slate-50 border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="w-full aspect-square bg-white rounded-2xl overflow-hidden flex items-center justify-center border border-slate-100 shadow-inner">
                        {opt.img ? (
                          <div 
                            className="w-full h-full p-2"
                            dangerouslySetInnerHTML={{ 
                              __html: opt.img.includes('<img') 
                                ? opt.img 
                                : `<img src="${opt.img}" class="w-full h-full object-contain" />` 
                            }}
                          />
                        ) : (
                          <span className="text-4xl font-black text-slate-200">{opt.id}</span>
                        )}
                      </div>
                      <span className={`text-sm font-black uppercase tracking-widest ${responseValue === opt.id ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {activeQuestion.type === 'rating' && (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="flex flex-wrap justify-center gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setResponseValue(num)}
                        className={`w-12 h-12 rounded-xl font-black text-lg flex items-center justify-center transition-all ${
                          responseValue === num
                            ? 'bg-yellow-400 text-white scale-110 shadow-lg'
                            : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                    Califica de 1 (Malo) a 10 (Excelente)
                  </p>
                </div>
              )}

              {activeQuestion.type === 'guess-name' && (
                <div className="space-y-6 text-left">
                  <div className="w-full h-64 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center relative">
                    {activeQuestion.imageUrl ? (
                      <img 
                        src={activeQuestion.imageUrl} 
                        alt="Guess Name" 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-slate-300 text-sm font-bold">Sin imagen de referencia</div>
                    )}
                  </div>

                  {hasResponded ? (
                    (() => {
                      const userGuess = String(myResponse?.value || myResponse?.text || '').trim();
                      const isCorrect = userGuess.toLowerCase() === String(activeQuestion.correctAnswer || '').trim().toLowerCase();
                      
                      return (
                        <div className="space-y-4">
                          <div className={`p-6 rounded-2xl border-2 text-center font-black ${isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                            <span className="text-3xl block mb-2">{isCorrect ? '🎉 ¡CORRECTO!' : '✗ INCORRECTO'}</span>
                            <p className="text-sm font-bold">Tu respuesta: <strong className="uppercase">"{userGuess}"</strong></p>
                            {!isCorrect && (
                              <p className="mt-3 pt-3 border-t border-rose-100 text-xs font-black text-rose-600 uppercase tracking-wider">
                                La respuesta correcta es: <strong className="text-sm font-black underline">{activeQuestion.correctAnswer}</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Escribe el nombre correcto</label>
                      <input 
                        type="text"
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Tu respuesta..."
                        required
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all font-bold placeholder:text-slate-300 text-slate-800 uppercase"
                      />
                    </div>
                  )}
                </div>
              )}

              {activeQuestion.type === 'complete-sequence' && (
                <div className="space-y-6 text-left">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Secuencia de elementos</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {activeQuestion.sequenceItems?.map((item, idx) => {
                        const isMissing = idx === activeQuestion.sequenceMissingIndex;
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            {idx > 0 && <span className="text-slate-300 text-sm font-black shrink-0">➔</span>}
                            <span className={`px-3 py-2 text-xs font-extrabold rounded-xl shrink-0 border ${isMissing ? 'bg-indigo-50 border-dashed border-indigo-300 text-indigo-700 animate-pulse' : 'bg-white border-slate-100 text-slate-600'}`}>
                              {isMissing ? 'FALTANTE' : item}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {hasResponded ? (
                    (() => {
                      const userGuess = String(myResponse?.value || myResponse?.text || '').trim();
                      const isCorrect = userGuess.toLowerCase() === String(activeQuestion.correctAnswer || '').trim().toLowerCase();
                      
                      return (
                        <div className="space-y-4">
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Resultado de la secuencia</p>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              {activeQuestion.sequenceItems?.map((item, idx) => {
                                const isMissing = idx === activeQuestion.sequenceMissingIndex;
                                return (
                                  <div key={idx} className="flex items-center gap-2">
                                    {idx > 0 && <span className="text-slate-300 text-sm font-black shrink-0">➔</span>}
                                    <span className={`px-3 py-2 text-xs font-black rounded-xl shrink-0 border-2 ${isMissing ? (isCorrect ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800') : 'bg-white border-slate-200 text-slate-400'}`}>
                                      {isMissing ? `[ ${userGuess} ]` : item}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className={`p-6 rounded-2xl border-2 text-center font-black ${isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                            <span className="text-3xl block mb-2">{isCorrect ? '🎉 ¡CORRECTO!' : '✗ INCORRECTO'}</span>
                            {!isCorrect && (
                              <p className="text-xs font-black uppercase tracking-wider">
                                La palabra correcta era: <strong className="text-sm font-black underline">{activeQuestion.correctAnswer}</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Completa la variable faltante</label>
                      <input 
                        type="text"
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Escribe el elemento faltante..."
                        required
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all font-bold placeholder:text-slate-300 text-slate-800 uppercase"
                      />
                    </div>
                  )}
                </div>
              )}

              {(!hasResponded || activeQuestion.type === 'brainstorm' || activeQuestion.type === 'word-cloud') && (
                <button 
                  type="button"
                  onClick={() => submitResponse()}
                  disabled={
                    isSubmitting ||
                    (activeQuestion.type === 'word-cloud' && (
                      !responseText.trim() ||
                      responseText.trim().split(/\s+/).length > 1 ||
                      myResponses.filter(r => r.questionId === activeQuestion.id).length >= 30
                    )) ||
                    (activeQuestion.type !== 'word-cloud' && !responseText.trim() && !responseValue)
                  }
                  className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 active:scale-[0.98] shadow-lg shadow-indigo-100"
                >
                  {isSubmitting 
                    ? 'Enviando...' 
                    : activeQuestion.type === 'comparison' 
                    ? 'Confirmar Voto' 
                    : activeQuestion.type === 'brainstorm'
                    ? 'Enviar idea'
                    : activeQuestion.type === 'word-cloud'
                    ? 'Enviar palabra'
                    : 'Enviar'}
                  <Send className="w-5 h-5" />
                </button>
              )}

              {(activeQuestion.type === 'brainstorm' || activeQuestion.type === 'word-cloud' || hasResponded) && (
                <button
                  type="button"
                  onClick={() => markQuestionAsCompleted(activeQuestion.id)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 mt-2"
                >
                  Siguiente pregunta ➔
                </button>
              )}
            </div>
          </motion.div>
            );
          })()
        )}

        <AnimatePresence>
          {lastSubmittedAt > 0 && Date.now() - lastSubmittedAt < 5000 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 text-center font-bold shadow-sm"
            >
              ¡Mensaje enviado! Mira la pantalla principal.
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-20">
        <div className="bg-slate-900/95 backdrop-blur-xl p-5 rounded-[2rem] border border-white/10 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">
              {name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Código: {participantCode}</p>
              <p className="font-extrabold text-white text-lg tracking-tight leading-tight">{name}</p>
            </div>
          </div>
          <button 
            onClick={() => setShowExitConfirm(true)}
            className="p-3 bg-white/10 text-white rounded-xl hover:bg-white/20 hover:text-red-400 transition-colors"
            title="Salir de la sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </footer>

      {/* Modal de Confirmación de Salida Personalizado */}
      <AnimatePresence>
        {showExitConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white p-8 rounded-[2rem] max-w-sm w-full border border-slate-200 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <LogOut className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 mb-2">¿Salir de la sesión?</h3>
              <p className="text-slate-500 mb-8 font-medium text-sm leading-relaxed">
                Se borrará tu código de acceso único y tendrás que registrarte de nuevo para ver o responder las preguntas.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors active:scale-[0.98]"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowExitConfirm(false);
                    try {
                      localStorage.removeItem(`participant_name_${pollId}`);
                      localStorage.removeItem(`participant_code_${pollId}`);
                    } catch (e) {
                      console.warn("localStorage is blocked or disabled in this environment:", e);
                    }
                    setName('');
                    setParticipantCode('');
                    setIsUnirseed(false);
                    setShowWelcomeScreen(false);
                    if (onExit) {
                      onExit();
                    }
                  }}
                  className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-red-100 transition-colors active:scale-[0.98]"
                >
                  Salir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
