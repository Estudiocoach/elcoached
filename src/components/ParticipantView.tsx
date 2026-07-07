import { useState, useEffect, FormEvent } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { Poll, Question } from '@/src/types';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase-utils';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, ChevronRight, Play, LogOut, Sparkles } from 'lucide-react';

interface ParticipantViewProps {
  pollId: string;
}

export function ParticipantView({ pollId }: ParticipantViewProps) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingPoll, setLoadingPoll] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [name, setName] = useState('');
  const [participantCode, setParticipantCode] = useState('');
  const [isUnirseed, setIsUnirseed] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  
  const [responseText, setResponseText] = useState('');
  const [responseValue, setResponseValue] = useState<string | number>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedAt, setLastSubmittedAt] = useState(0);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `polls/${pollId}/responses`);
    });
  }, [pollId, isUnirseed, participantCode]);

  const activeQuestion = questions.find(q => !answeredQuestionIds.has(q.id));

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isGeneratingCode) return;

    setIsGeneratingCode(true);
    try {
      let code = '';
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 15) {
        // Generate random 7-digit numeric code like in Kahoot
        code = Math.floor(1000000 + Math.random() * 9000000).toString();
        const partDocRef = doc(db, 'polls', pollId, 'participants', code);
        const snap = await getDoc(partDocRef);
        if (!snap.exists()) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new Error('No se pudo generar un código único.');
      }

      // Register participant in Firestore
      await setDoc(doc(db, 'polls', pollId, 'participants', code), {
        name: name.trim(),
        code: code,
        createdAt: Date.now()
      });

      // Save to state and localStorage
      setParticipantCode(code);
      try {
        localStorage.setItem(`participant_name_${pollId}`, name.trim());
        localStorage.setItem(`participant_code_${pollId}`, code);
      } catch (e) {
        console.warn("localStorage is blocked or disabled in this environment:", e);
      }
      
      // Show welcome screen step
      setShowWelcomeScreen(true);
    } catch (err) {
      console.error('Error registering participant:', err);
      alert('Error al conectar con la sesión. Inténtalo de nuevo.');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const submitResponse = async (e: FormEvent) => {
    e.preventDefault();
    if ((!responseText.trim() && !responseValue) || isSubmitting || !activeQuestion) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'polls', pollId, 'responses'), {
        pollId,
        questionId: activeQuestion.id,
        participantName: name || 'Anonymous',
        participantCode: participantCode || '', // Regido por códigos únicos de 7 números
        text: responseText,
        value: responseValue,
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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 text-center"
        >
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-100">
            <Sparkles className="w-10 h-10 animate-bounce" />
          </div>
          
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2">
            ¡Bienvenido!
          </h1>
          <p className="text-2xl font-semibold text-indigo-600 mb-8">
            ¿Listo para Empezar?
          </p>

          <p className="text-slate-500 mb-8 font-medium leading-relaxed">
            Hola <strong className="text-slate-800 font-bold">{name}</strong>, ya estás registrado. Haz clic en el botón de abajo para ver y responder las preguntas de la sesión.
          </p>

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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200"
        >
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-8 shadow-lg shadow-indigo-100">
            <User className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2 leading-tight">Unirse a la Sesión</h1>
          <p className="text-slate-500 mb-8 font-medium italic">¡Bienvenido a {poll?.title || 'la sesión'}!</p>
          
          <form onSubmit={handleJoin} className="space-y-6">
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
        ) : (
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
            
            <form onSubmit={submitResponse} className="space-y-6">
              {activeQuestion.type === 'text' && (
                <textarea 
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="¿Qué te gustaría compartir?"
                  className="w-full px-6 py-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all min-h-[160px] resize-none font-medium placeholder:text-slate-300"
                />
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

              <button 
                disabled={(!responseText.trim() && !responseValue) || isSubmitting}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 active:scale-[0.98] shadow-lg shadow-indigo-100"
              >
                {isSubmitting ? 'Enviando...' : activeQuestion.type === 'comparison' ? 'Confirmar Voto' : 'Enviar'}
                <Send className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
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
            onClick={() => {
              if (confirm('¿Deseas salir de la sesión? Se borrará tu código de acceso.')) {
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
              }
            }}
            className="p-3 bg-white/10 text-white rounded-xl hover:bg-white/20 hover:text-red-400 transition-colors"
            title="Salir de la sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
