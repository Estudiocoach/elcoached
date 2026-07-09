import { useState, useEffect, FormEvent } from 'react';
import { AdminPollManager } from './components/AdminPollManager';
import { ParticipantView } from './components/ParticipantView';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, LayoutDashboard, UserCircle, Mail, Lock, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';

export default function App() {
  const [pollId, setPollId] = useState<string | null>(null);
  const [mode, setMode] = useState<'selection' | 'admin' | 'participant'>('selection');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Email login states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Join code states
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [resolvingCode, setResolvingCode] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    // Para asegurar que la app comience totalmente desde 0 (cerrada la sesión) la primera vez que se carga en esta sesión de navegador
    const hasResetAuth = sessionStorage.getItem('has_reset_auth_v3');
    if (!hasResetAuth) {
      signOut(auth).then(() => {
        sessionStorage.setItem('has_reset_auth_v3', 'true');
      }).catch((err) => {
        console.error('Error reset auth:', err);
      });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const checkUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('pollId');
      if (id && id !== pollId) {
        setPollId(id);
        setMode('participant');
      }
    };

    // Check on mount
    checkUrl();

    // Listen to history navigation
    window.addEventListener('popstate', checkUrl);
    
    // Also poll every 500ms to catch parent website iframe updates / hash changes
    const interval = setInterval(checkUrl, 500);

    return () => {
      window.removeEventListener('popstate', checkUrl);
      clearInterval(interval);
    };
  }, [pollId]);

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      setMode('admin');
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('Por favor ingresa tu correo y contraseña.');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      setMode('admin');
    } catch (error: any) {
      console.error('Auth error:', error);
      let friendlyMessage = 'Ocurrió un error al autenticar.';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        friendlyMessage = 'Correo o contraseña incorrectos.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMessage = 'El formato del correo es inválido.';
      } else if (error.code === 'auth/weak-password') {
        friendlyMessage = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (error.code === 'auth/email-already-in-use') {
        friendlyMessage = 'Este correo ya está registrado.';
      }
      setAuthError(friendlyMessage);
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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white p-8 md:p-10 rounded-[2rem] shadow-xl border border-slate-200 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full">
                <UserCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {isSignUp ? 'Crear Cuenta Admin' : 'Panel de Administrador'}
              </h2>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">
                {isSignUp 
                  ? 'Regístrate para comenzar a diseñar tus eventos interactivos.' 
                  : 'Inicia sesión para crear y moderar encuestas en tiempo real.'}
              </p>
            </div>

            {authError && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-start gap-3 text-sm"
              >
                <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                <span>{authError}</span>
              </motion.div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <Mail className="w-5 h-5" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="ejemplo@correo.com"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-slate-900 text-sm transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                    Contraseña
                  </label>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-slate-900 text-sm transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                {authLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>{isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}</span>
                )}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError(null);
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {isSignUp 
                  ? '¿Ya tienes una cuenta? Inicia Sesión' 
                  : '¿No tienes cuenta? Regístrate aquí'}
              </button>
            </div>

            <div className="relative flex items-center justify-center py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <span className="relative bg-white px-3 text-xs uppercase text-slate-400 font-bold tracking-wider">
                o continuar con
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-3.5 px-4 bg-white border border-slate-200 hover:border-indigo-600 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.642 1.053 14.97 0 12 0 7.354 0 3.307 2.67 1.258 6.56l3.924 3.01c.026-.065.056-.13.084-.195z"
                />
                <path
                  fill="#4285F4"
                  d="M16.04 15.345c-1.077.733-2.433 1.164-4.04 1.164-2.855 0-5.274-1.928-6.136-4.526l-3.93 3.03A11.952 11.952 0 0 0 12 24c3.236 0 6.136-1.073 8.355-2.918l-3.924-3.003c-1.042.664-2.39 1.109-3.95 1.109-.136 0-.268-.014-.4-.018z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.904 11.983c0-.682.12-1.336.314-1.955l-3.923-3.01A11.918 11.918 0 0 0 0 12c0 1.773.39 3.455 1.077 4.968l3.925-3.03c-.2-.619-.314-1.282-.314-1.955z"
                />
                <path
                  fill="#34A853"
                  d="M12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.642 1.053 14.97 0 12 0c-1.1 0-2.17.15-3.19.43l3.22 3.22a7.11 7.11 0 0 1 1.97-.24h.02c1.69 0 3.218.6 4.418 1.582l3.51-3.51c-.13-.13-.268-.255-.407-.377L16.418 6.49c-1.2-.982-2.727-1.582-4.418-1.582z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.275c0-.825-.075-1.613-.213-2.375H12v4.5h6.48c-.28 1.448-1.1 2.675-2.325 3.5l3.924 3.004c2.296-2.114 3.611-5.219 3.611-8.629z"
                />
              </svg>
              <span>Google</span>
            </button>

            <button
              onClick={() => {
                setMode('selection');
                setAuthError(null);
              }}
              className="w-full py-3.5 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all border border-slate-200 flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Inicio</span>
            </button>
          </div>
        </div>
      );
    }
    return <AdminPollManager user={user} onSignOut={handleSignOut} />;
  }

  if (mode === 'participant' && pollId) {
    return (
      <ParticipantView 
        pollId={pollId} 
        onExit={() => {
          setPollId(null);
          setMode('selection');
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('pollId');
            window.history.replaceState({}, '', url.pathname + url.search);
          } catch (e) {
            console.error('Failed to clear pollId param:', e);
          }
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-100 rounded-full text-sm font-bold text-slate-800 border border-slate-200"
          >
            <Layers className="w-4 h-4" />
            coached
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
            {user ? (
              <div className="space-y-3">
                <button 
                  onClick={() => setMode('admin')}
                  className="w-full p-6 bg-white border border-indigo-100 hover:border-indigo-600 hover:bg-slate-50/50 rounded-xl transition-all group text-left flex items-center gap-5 shadow-sm"
                >
                  <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                    <LayoutDashboard className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-lg truncate">{`Panel de ${user.displayName || 'Administrador'}`}</h3>
                    <p className="text-sm text-slate-500 truncate">{user.email}</p>
                  </div>
                </button>
                <div className="flex justify-end gap-3 px-1">
                  <button
                    onClick={async () => {
                      try {
                        const provider = new GoogleAuthProvider();
                        provider.setCustomParameters({ prompt: 'select_account' });
                        await signOut(auth);
                        await signInWithPopup(auth, provider);
                        setMode('admin');
                      } catch (error) {
                        console.error('Error switching account:', error);
                      }
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100/80 px-3 py-1.5 rounded-lg border border-indigo-100"
                  >
                    Iniciar con otra cuenta
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg border border-slate-200"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setMode('admin')}
                className="w-full p-6 bg-white border border-slate-200 hover:border-indigo-600 hover:bg-slate-50 rounded-xl transition-all group text-left flex items-center gap-5 shadow-sm"
              >
                <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                  <LayoutDashboard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Administrador del Evento</h3>
                  <p className="text-sm text-slate-500">Gestiona preguntas y ve las respuestas</p>
                </div>
              </button>
            )}

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

                  <div className="space-y-3">
                    <div className="relative">
                      <input 
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) => {
                          setJoinCodeInput(e.target.value);
                          if (joinError) setJoinError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && joinCodeInput.trim() && !resolvingCode) {
                            resolveJoinCode(joinCodeInput);
                          }
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
                        type="button"
                        onClick={() => resolveJoinCode(joinCodeInput)}
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
                  </div>
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
    </div>
  );
}
