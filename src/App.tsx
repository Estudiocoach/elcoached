import React, { useState, useEffect } from 'react';
import { AdminPollManager } from './components/AdminPollManager';
import { ParticipantView } from './components/ParticipantView';
import { auth, db } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  User, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, LayoutDashboard, UserCircle, Mail, Lock, Chrome, X, AlertCircle } from 'lucide-react';

export default function App() {
  const [pollId, setPollId] = useState<string | null>(null);
  const [mode, setMode] = useState<'selection' | 'admin' | 'participant'>('selection');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Admin Auth States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Join code states
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [resolvingCode, setResolvingCode] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (mode === 'admin' && !user && !loading) {
      setMode('selection');
      setShowAuthModal(true);
    }
  }, [mode, user, loading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('pollId');
    if (id) {
      setPollId(id);
      setMode('participant');
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setMode('admin');
      setShowAuthModal(false);
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        setAuthError('Error al iniciar sesión con Google.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
      setMode('admin');
      setShowAuthModal(false);
    } catch (err: any) {
      console.error('Error with email auth:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setAuthError('Correo o contraseña incorrectos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('Este correo ya está registrado.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('La contraseña debe tener al menos 6 caracteres.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('El formato del correo es inválido.');
      } else {
        setAuthError('Error de autenticación. Inténtalo de nuevo.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
    setMode('selection');
  };

  const resolveJoinCode = async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    
    setResolvingCode(true);
    setJoinError(null);
    
    try {
      let matchedPollId: string | null = null;
      
      // Step 1: Direct single-document lookup in joinCodes mapping
      const joinDocRef = doc(db, 'joinCodes', normalized);
      const joinDocSnap = await getDoc(joinDocRef);
      
      if (joinDocSnap.exists()) {
        matchedPollId = joinDocSnap.data().pollId;
      } else {
        // Step 2: Check if the user entered the original full 20-character poll ID directly
        const pollDocRef = doc(db, 'polls', code.trim());
        const pollDocSnap = await getDoc(pollDocRef);
        if (pollDocSnap.exists()) {
          matchedPollId = pollDocSnap.id;
        } else {
          // Step 3: Direct indexed query on 'joinCode' field (fallback)
          const q = query(collection(db, 'polls'), where('joinCode', '==', normalized));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            matchedPollId = querySnapshot.docs[0].id;
          }
        }
      }
      
      if (matchedPollId) {
        setPollId(matchedPollId);
        setMode('participant');
      } else {
        setJoinError('Código de sesión no encontrado. Por favor, verifica el código.');
      }
    } catch (err) {
      console.error('Error resolving join code:', err);
      setJoinError('Error al conectar con la sesión. Inténtalo de nuevo.');
    } finally {
      setResolvingCode(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (mode === 'admin') {
    if (!user) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      );
    }
    return <AdminPollManager user={user} onSignOut={handleSignOut} />;
  }

  if (mode === 'participant' && pollId) {
    return <ParticipantView pollId={pollId} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans relative overflow-hidden">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
        <div className="space-y-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 rounded-full text-sm font-bold text-indigo-700 border border-indigo-100"
          >
            <Sparkles className="w-4 h-4" />
            COACHED!
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]"
          >
            Involucra a tu <br />
            <span className="text-indigo-600">audiencia hoy.</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-slate-600 max-w-md leading-relaxed"
          >
            La forma profesional de organizar sesiones interactivas para eventos.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-10 rounded-[2rem] shadow-xl border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-800 mb-8">Consola de Acceso</h2>
          
          <div className="space-y-4">
            <button 
              onClick={() => {
                if (user) {
                  setMode('admin');
                } else {
                  setAuthError(null);
                  setIsSignUp(false);
                  setAuthEmail('');
                  setAuthPassword('');
                  setShowAuthModal(true);
                }
              }}
              className="w-full p-6 bg-white border border-slate-200 hover:border-indigo-600 hover:bg-slate-50 rounded-xl transition-all group text-left flex items-center gap-5 shadow-sm"
            >
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{user ? `Panel de ${user.displayName?.split(' ')[0] || 'Administrador'}` : 'Administrador del Evento'}</h3>
                <p className="text-sm text-slate-500">Gestiona preguntas y ve las respuestas</p>
              </div>
            </button>

            <div className="relative py-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-400 font-bold tracking-widest">o participa</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!showJoinInput ? (
                <motion.button 
                  key="join-btn"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onClick={() => {
                    setShowJoinInput(true);
                    setJoinError(null);
                  }}
                  className="w-full p-6 bg-slate-900 border border-transparent hover:bg-slate-800 rounded-xl transition-all group text-left flex items-center gap-5 shadow-lg"
                >
                  <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                    <UserCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white text-lg">Unirse como Participante</h3>
                    <p className="text-sm text-slate-400">Envía tus respuestas en tiempo real</p>
                  </div>
                </motion.button>
              ) : (
                <motion.div 
                  key="join-input-section"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full p-6 bg-slate-950 rounded-2xl border border-slate-800 text-left space-y-4 shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                      <UserCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">Unirse como Participante</h3>
                      <p className="text-xs text-slate-400">Introduce el código de 7 caracteres o ID</p>
                    </div>
                  </div>

                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      resolveJoinCode(joinCodeInput);
                    }}
                    className="space-y-3"
                  >
                    <div className="relative">
                      <input 
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) => {
                          setJoinCodeInput(e.target.value);
                          if (joinError) setJoinError(null);
                        }}
                        placeholder="ej. ABC1234"
                        maxLength={30}
                        required
                        disabled={resolvingCode}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-lg tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all uppercase text-center"
                      />
                    </div>

                    {joinError && (
                      <p className="text-xs text-rose-400 font-medium bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg leading-relaxed">
                        {joinError}
                      </p>
                    )}

                    <div className="flex gap-2.5 pt-1">
                      <button 
                        type="button"
                        onClick={() => {
                          setShowJoinInput(false);
                          setJoinCodeInput('');
                          setJoinError(null);
                        }}
                        disabled={resolvingCode}
                        className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit"
                        disabled={resolvingCode || !joinCodeInput.trim()}
                        className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2"
                      >
                        {resolvingCode ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Buscando...</span>
                          </>
                        ) : (
                          <span>Entrar</span>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="mt-10 pt-6 border-t border-slate-50 flex items-center justify-center gap-4">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
              Infraestructura en la Nube Online
            </p>
          </div>
        </motion.div>
      </div>

      {/* Modern High-Polish Authentication Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 relative overflow-hidden text-left"
            >
              {/* Close Button */}
              <button 
                onClick={() => setShowAuthModal(false)}
                className="absolute top-6 right-6 p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-4 border border-indigo-100">
                  <LayoutDashboard className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Acceso Administrador</h3>
                <p className="text-sm text-slate-500 mt-1 font-medium">Gestiona preguntas y ve las respuestas</p>
              </div>

              {/* Login/Signup Tabs */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setAuthError(null);
                  }}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all cursor-pointer ${!isSignUp ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setAuthError(null);
                  }}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all cursor-pointer ${isSignUp ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Registrarse
                </button>
              </div>

              {/* Auth Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="admin@ejemplo.com"
                      required
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all font-medium placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all font-medium placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {authError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2.5 text-rose-600 text-xs font-bold"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-4.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer"
                >
                  {authLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : isSignUp ? (
                    'Crear Cuenta'
                  ) : (
                    'Ingresar con Correo'
                  )}
                </button>
              </form>

              <div className="relative py-6 my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-slate-400 font-bold tracking-widest">o con Google</span>
                </div>
              </div>

              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full py-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded-2xl font-black text-sm transition-all shadow-sm flex items-center justify-center gap-3 cursor-pointer"
              >
                <Chrome className="w-5 h-5 text-indigo-600" />
                Continuar con Google
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
