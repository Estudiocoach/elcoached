import { useState, useEffect } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Poll, Question, Response, QuestionType, UserProfile } from '@/src/types';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase-utils';
import { QRCodeDisplay } from './QRCodeDisplay';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, Plus, Trash2, Play, Users, MessageSquare, ArrowUp, ArrowDown, Edit2, Save, X, Eye, Settings, ChevronLeft, ChevronRight, Maximize, Minimize, LogOut, UserPlus, Share2, Sparkles } from 'lucide-react';
import { User } from 'firebase/auth';

interface AdminPollManagerProps {
  user: User;
  onSignOut: () => void;
}

export function AdminPollManager({ user, onSignOut }: AdminPollManagerProps) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [activePollId, setActivePollId] = useState<string | null>(null);
  const activePoll = polls.find(p => p.id === activePollId) || null;
  const [newPollTítulo, setNewPollTítulo] = useState('');
  const [questions, setPreguntas] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'dashboard' | 'settings' | 'users'>('list');
  const [viewMode, setViewMode] = useState<'editor' | 'live' | 'participants'>('editor');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Question Creation state
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('text');
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(['', '']);
  const [optionAImage, setOptionAImage] = useState('');
  const [optionBImage, setOptionBImage] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // User Management state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'editor'>('editor');
  const [newUserCompanyId, setNewUserCompanyId] = useState('');

  // Profile Edit state
  const [editLogoHtml, setEditLogoHtml] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    // Fetch or create user profile
    const profileRef = doc(db, 'users', user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        setEditLogoHtml(data.logoHtml || '');
      } else {
        // Initial profile creation
        const newProfile: UserProfile = {
          id: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          role: 'admin',
          createdAt: Date.now()
        };
        await setDoc(profileRef, newProfile);
        setProfile(newProfile);
      }
    });

    return () => unsubscribeProfile();
  }, [user]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snapshot) => {
        setAllUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
      });
    }
  }, [profile]);

  useEffect(() => {
    // Filter polls: show all if admin, or just created by user
    const q = profile?.role === 'admin' 
      ? query(collection(db, 'polls'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'polls'), where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const fetchedPolls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Poll));
      setPolls(fetchedPolls);

      // Auto-register joinCodes for legacy polls that don't have them
      fetchedPolls.forEach(async (poll) => {
        if (!poll.joinCode) {
          const joinCode = poll.id.slice(0, 7).toUpperCase();
          try {
            await updateDoc(doc(db, 'polls', poll.id), { joinCode });
            await setDoc(doc(db, 'joinCodes', joinCode), {
              pollId: poll.id,
              createdAt: poll.createdAt || Date.now()
            });
          } catch (e) {
            console.error('Error auto-populating joinCode:', e);
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'polls');
    });
  }, [profile, user.uid]);

  useEffect(() => {
    if (!activePoll) return;
    
    const q = query(collection(db, 'polls', activePoll.id, 'questions'), orderBy('order'));
    const unsubscribePreguntas = onSnapshot(q, (snapshot) => {
      const fetchedPreguntas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setPreguntas(fetchedPreguntas);
      // Automatically set the last question as active for the participant view if none is set
      if (fetchedPreguntas.length > 0 && !activePoll.currentQuestionId) {
        updateDoc(doc(db, 'polls', activePoll.id), {
          currentQuestionId: fetchedPreguntas[fetchedPreguntas.length - 1].id
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `polls/${activePoll.id}`));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `polls/${activePoll.id}/questions`);
    });

    const r = query(collection(db, 'polls', activePoll.id, 'responses'), orderBy('createdAt', 'desc'));
    const unsubscribeResponses = onSnapshot(r, (snapshot) => {
      setResponses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Response)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `polls/${activePoll.id}/responses`);
    });

    return () => {
      unsubscribePreguntas();
      unsubscribeResponses();
    };
  }, [activePoll]);

  const createPoll = async () => {
    if (!newPollTítulo) return;
    try {
      const docRef = await addDoc(collection(db, 'polls'), {
        title: newPollTítulo,
        createdAt: Date.now(),
        status: 'active',
        showQR: true,
        creatorId: user.uid
      });
      
      const joinCode = docRef.id.slice(0, 7).toUpperCase();
      
      // Update the poll document with the joinCode field
      await updateDoc(doc(db, 'polls', docRef.id), {
        joinCode: joinCode
      });

      // Write to the joinCodes mapping for single-get lookup capability
      await setDoc(doc(db, 'joinCodes', joinCode), {
        pollId: docRef.id,
        createdAt: Date.now()
      });

      setNewPollTítulo('');
      setView('list');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'polls');
    }
  };

  const handleUpdateProfile = async () => {
    if (!profile) return;
    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', profile.id), {
        logoHtml: editLogoHtml
      });
      setView('list');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.id}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail) return;
    try {
      // In a real app, this would be a cloud function or invite system.
      // Here we just add a record to 'users_allowed' with a dummy ID or expect them to sign in.
      // For simplicity, we'll just track that this email is allowed.
      await setDoc(doc(db, 'users_allowed', newUserEmail), {
        email: newUserEmail,
        role: newUserRole,
        companyId: newUserCompanyId,
        invitedBy: user.uid,
        createdAt: Date.now()
      });
      setNewUserEmail('');
      setNewUserCompanyId('');
      alert('Usuario invitado exitosamente (podrá entrar si usa este email)');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users_allowed');
    }
  };

  const toggleQR = async () => {
    if (!activePoll) return;
    try {
      const newShowQR = !activePoll.showQR;
      await updateDoc(doc(db, 'polls', activePoll.id), {
        showQR: newShowQR
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${activePoll.id}`);
    }
  };

  const togglePollStatus = async () => {
    if (!activePoll) return;
    try {
      const newStatus = activePoll.status === 'active' ? 'closed' : 'active';
      await updateDoc(doc(db, 'polls', activePoll.id), {
        status: newStatus
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${activePoll.id}`);
    }
  };

  const addQuestion = async (pollId: string, text: string) => {
    const options = newQuestionType === 'multiple-choice' 
      ? newQuestionOptions.map(o => o.trim()).filter(o => o)
      : [];

    try {
      await addDoc(collection(db, 'polls', pollId, 'questions'), {
        pollId,
        text,
        type: newQuestionType,
        options,
        optionAImage: newQuestionType === 'comparison' ? optionAImage : '',
        optionBImage: newQuestionType === 'comparison' ? optionBImage : '',
        order: questions.length + 1
      });
      setNewQuestionOptions(['', '']);
      setOptionAImage('');
      setOptionBImage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `polls/${pollId}/questions`);
    }
  };

  const deleteQuestion = async (pollId: string, questionId: string) => {
    try {
      // Note: In a real app, you might want to delete responses too
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'polls', pollId, 'questions', questionId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `polls/${pollId}/questions/${questionId}`);
    }
  };

  const updateQuestion = async (pollId: string, questionId: string, updates: Partial<Question>) => {
    try {
      await updateDoc(doc(db, 'polls', pollId, 'questions', questionId), updates);
      setEditingQuestionId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${pollId}/questions/${questionId}`);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const activePollLiveQuestionIndex = activePoll ? questions.findIndex(q => q.id === (activePoll.currentQuestionId || questions[0]?.id)) : -1;

  const goToPrevQuestion = () => {
    if (activePoll && activePollLiveQuestionIndex > 0) {
      updateDoc(doc(db, 'polls', activePoll.id), {
        currentQuestionId: questions[activePollLiveQuestionIndex - 1].id
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `polls/${activePoll.id}`));
    }
  };

  const goToNextQuestion = () => {
    if (activePoll && activePollLiveQuestionIndex < questions.length - 1 && activePollLiveQuestionIndex !== -1) {
      updateDoc(doc(db, 'polls', activePoll.id), {
        currentQuestionId: questions[activePollLiveQuestionIndex + 1].id
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `polls/${activePoll.id}`));
    }
  };

  const moveQuestion = async (pollId: string, question: Question, direction: 'up' | 'down') => {
    const currentIndex = questions.findIndex(q => q.id === question.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const targetQuestion = questions[targetIndex];
    
    try {
      await Promise.all([
        updateDoc(doc(db, 'polls', pollId, 'questions', question.id), { order: targetQuestion.order }),
        updateDoc(doc(db, 'polls', pollId, 'questions', targetQuestion.id), { order: question.order })
      ]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${pollId}/questions`);
    }
  };

  const getBaseUrl = () => {
    let url = window.location.href.split('?')[0];
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  };
  const joinUrl = `${getBaseUrl()}?pollId=${activePoll?.id}`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">
              Coached!
              <span className="text-indigo-600 text-sm font-normal ml-3 border-l border-slate-200 pl-3 uppercase tracking-wider">Admin Console</span>
            </h1>
          </div>
          
          <nav className="flex items-center gap-1 ml-4 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setView('list')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${view === 'list' || view === 'dashboard' || view === 'create' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Eventos
            </button>
            {profile?.role === 'admin' && (
              <button 
                onClick={() => setView('users')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${view === 'users' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Users className="w-4 h-4" />
                Usuarios
              </button>
            )}
            <button 
              onClick={() => setView('settings')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${view === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Settings className="w-4 h-4" />
              Ajustes
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-6">
          {view === 'dashboard' && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-sm font-medium text-slate-600">
                {new Set(responses.map(r => r.participantCode || r.participantName)).size} Participantes
              </span>
            </div>
          )}
          <div className="flex items-center gap-4 pl-6 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900 leading-none">{profile?.displayName || user.displayName}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{profile?.role || 'User'}</p>
            </div>
            <button 
              onClick={onSignOut}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {view === 'list' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Eventos</h2>
                  <p className="text-slate-500 font-medium">Gestiona y lanza tus sesiones interactivas</p>
                </div>
                <button 
                  onClick={() => setView('create')}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                  Nuevo Evento
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {polls.map(poll => (
                  <motion.button
                    key={poll.id}
                    layoutId={poll.id}
                    onClick={() => { setActivePollId(poll.id); setView('dashboard'); }}
                    className="group bg-white p-6 rounded-[2rem] border border-slate-200 hover:border-indigo-600 hover:shadow-xl transition-all text-left flex flex-col h-full relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                        <Play className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mb-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${poll.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {poll.status === 'active' ? 'En Vivo' : 'Cerrado'}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{poll.title}</h3>
                    <p className="text-sm text-slate-400 font-medium mt-auto flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {new Date(poll.createdAt).toLocaleDateString()}
                    </p>
                  </motion.button>
                ))}
              </div>

              {polls.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <LayoutDashboard className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">No hay eventos aún</h3>
                  <p className="text-slate-500 mb-6">Comienza creando tu primera sesión interactiva</p>
                  <button 
                    onClick={() => setView('create')}
                    className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors"
                  >
                    Crear Evento
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : view === 'settings' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Configuración</h2>
                <p className="text-slate-500 font-medium">Personaliza tu perfil y marca</p>
              </div>

              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-black text-slate-700 uppercase tracking-widest mb-2">Información del Usuario</label>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm font-bold text-slate-900">{profile?.displayName || user.displayName}</p>
                      <p className="text-xs text-slate-500">{profile?.email || user.email}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-black text-slate-700 uppercase tracking-widest mb-2">Logo de Marca (HTML)</label>
                    <textarea 
                      value={editLogoHtml}
                      onChange={(e) => setEditLogoHtml(e.target.value)}
                      placeholder='ej. <img src="..." class="h-12" />'
                      className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white h-32"
                    />
                    <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">Este logo aparecerá en el Live Feed de tus eventos</p>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleUpdateProfile}
                      disabled={isSavingProfile}
                      className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-lg hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
                    >
                      {isSavingProfile ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100">
                  <h3 className="text-xs font-black text-red-500 uppercase tracking-widest mb-4">Zona de Peligro</h3>
                  <button 
                    onClick={onSignOut}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 font-bold border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : view === 'users' && profile?.role === 'admin' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gestión de Usuarios</h2>
                  <p className="text-slate-500 font-medium">Administra quién puede acceder a la consola</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-indigo-600" />
                      Invitar Usuario
                    </h3>
                    <div className="space-y-4">
                      <input 
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="email@ejemplo.com"
                        className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50"
                      />
                      <input 
                        type="text"
                        value={newUserCompanyId}
                        onChange={(e) => setNewUserCompanyId(e.target.value)}
                        placeholder="ID Empresa"
                        className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50"
                      />
                      <select 
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'editor')}
                        className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 font-bold"
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button 
                        onClick={handleAddUser}
                        className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
                      >
                        Enviar Invitación
                      </button>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                  {allUsers.map(u => (
                    <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{u.displayName || 'Sin nombre'}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                          <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase">{u.companyId || 'Sin Empresa'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select 
                          value={u.role}
                          onChange={async (e) => {
                            const newRole = e.target.value as 'admin' | 'editor';
                            await updateDoc(doc(db, 'users', u.id), { role: newRole });
                          }}
                          className="text-[10px] font-black uppercase tracking-widest bg-slate-50 border-none rounded-lg px-2 py-1 outline-none cursor-pointer"
                        >
                          <option value="admin">Admin</option>
                          <option value="editor">Editor</option>
                        </select>
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : view === 'create' ? (
          <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
            <div className="max-w-md w-full bg-white p-10 rounded-[2rem] shadow-xl border border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Nuevo Evento</h2>
              <p className="text-slate-500 mb-8">Configura tu sesión interactiva en vivo.</p>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Título del Evento</label>
                  <input 
                    type="text" 
                    value={newPollTítulo}
                    onChange={(e) => setNewPollTítulo(e.target.value)}
                    placeholder="ej. Reunión Anual"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={createPoll}
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                >
                  Crear Evento
                </button>
              </div>
            </div>
          </div>
        ) : activePoll && (
          <>
            <aside className="w-80 border-r border-slate-200 bg-white p-6 flex flex-col shrink-0 overflow-y-auto shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20">
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Añadir Nueva Pregunta</h3>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const input = form.elements.namedItem('question') as HTMLInputElement;
                    if (input.value) {
                      addQuestion(activePoll.id, input.value);
                      input.value = '';
                    }
                  }} className="space-y-4">
                    <div className="flex flex-col gap-3">
                      <select 
                        value={newQuestionType}
                        onChange={(e) => setNewQuestionType(e.target.value as QuestionType)}
                        className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <option value="text">Respuesta Abierta</option>
                        <option value="multiple-choice">Opción Múltiple</option>
                        <option value="rating">Calificación (1-10)</option>
                        <option value="comparison">Comparación A vs B</option>
                      </select>
                      <textarea 
                        name="question"
                        placeholder="Escribe tu pregunta aquí..."
                        required
                        rows={3}
                        className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white"
                      />
                      {newQuestionType === 'comparison' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Opción A (HTML/URL Imagen)</label>
                            <textarea 
                              value={optionAImage}
                              onChange={(e) => setOptionAImage(e.target.value)}
                              placeholder='ej. <img src="..." /> o URL'
                              className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white"
                              rows={2}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Opción B (HTML/URL Imagen)</label>
                            <textarea 
                              value={optionBImage}
                              onChange={(e) => setOptionBImage(e.target.value)}
                              placeholder='ej. <img src="..." /> o URL'
                              className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white"
                              rows={2}
                            />
                          </div>
                        </div>
                      )}
                      {newQuestionType === 'multiple-choice' && (
                        <div className="space-y-2">
                          {newQuestionOptions.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input 
                                value={opt}
                                onChange={(e) => {
                                  const newOpts = [...newQuestionOptions];
                                  newOpts[i] = e.target.value;
                                  setNewQuestionOptions(newOpts);
                                }}
                                placeholder={`Opción ${i + 1}`}
                                required={i < 2}
                                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white"
                              />
                              {i >= 2 && (
                                <button 
                                  type="button"
                                  onClick={() => setNewQuestionOptions(opts => opts.filter((_, idx) => idx !== i))}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button 
                            type="button"
                            onClick={() => setNewQuestionOptions([...newQuestionOptions, ''])}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-2"
                          >
                            <Plus className="w-3 h-3" />
                            Añadir Opción
                          </button>
                        </div>
                      )}
                    </div>
                    <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
                      <Plus className="w-5 h-5" />
                      ADD QUESTION
                    </button>
                  </form>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Quick Actions</h3>
                  <button 
                    onClick={() => {
                      if (questions.length > 0) {
                        updateDoc(doc(db, 'polls', activePoll.id), {
                          currentQuestionId: questions[questions.length - 1].id
                        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `polls/${activePoll.id}`));
                      }
                    }}
                    className="w-full py-3 bg-slate-50 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2 border border-slate-200"
                  >
                    <Eye className="w-4 h-4" />
                    Focus Last Question
                  </button>
                </div>
              </div>
            </aside>

            <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
              {/* Header with Mode Toggle */}
              <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10 relative shadow-sm">
                <div className="flex items-center gap-8">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${activePoll.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {activePoll.status === 'active' ? 'Activa' : 'Cerrada'}
                      </span>
                      <span className="text-slate-400 text-xs font-medium">• {questions.length} preguntas</span>
                      <span className="text-slate-400 text-xs font-medium">• {responses.length} respuestas</span>
                    </div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">
                      {activePoll.title}
                    </h2>
                  </div>

                  {activePoll.status === 'active' && (
                    <div className="hidden md:flex flex-col border-l border-slate-200 pl-8">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Join Code</span>
                      <span className="text-lg font-black text-indigo-600 tracking-widest">{activePoll.id.slice(0, 7).toUpperCase()}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={togglePollStatus}
                    className={`px-4 py-2 rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center gap-2 ${activePoll.status === 'active' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                  >
                    {activePoll.status === 'active' ? 'Cerrar Sesión' : 'Reabrir Sesión'}
                  </button>
                  
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button 
                      onClick={() => setViewMode('editor')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'editor' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Editor
                    </button>
                    <button 
                      onClick={() => setViewMode('live')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'live' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      En Vivo
                    </button>
                    <button 
                      onClick={() => setViewMode('participants' as any)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'participants' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Respuestas
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 scrollbar-hide pb-20">
                <AnimatePresence mode="wait">
                  {viewMode === 'editor' ? (
                    <motion.div 
                      key="editor"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="max-w-4xl mx-auto space-y-6"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Manage Preguntas</h3>
                        <p className="text-sm text-slate-500 font-medium">{questions.length} questions in this series</p>
                      </div>

                      <div className="space-y-4">
                        {questions.map((question, index) => (
                          <motion.div 
                            key={question.id}
                            layout
                            className={`bg-white rounded-2xl border transition-all ${editingQuestionId === question.id ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-xl' : 'border-slate-200 hover:border-slate-300 shadow-sm'}`}
                          >
                            <div className="p-6">
                              {editingQuestionId === question.id ? (
                                <div className="space-y-4">
                                  <input 
                                    autoFocus
                                    defaultValue={question.text}
                                    id={`edit-text-${question.id}`}
                                    className="w-full text-lg font-bold text-slate-900 border-none focus:ring-0 p-0 placeholder-slate-300"
                                    placeholder="Texto de la pregunta..."
                                  />
                                  <div className="flex flex-wrap gap-3">
                                    <select 
                                      id={`edit-type-${question.id}`}
                                      defaultValue={question.type}
                                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none"
                                    >
                                      <option value="text">Long Answer</option>
                                      <option value="multiple-choice">Opción Múltiple</option>
                                      <option value="rating">Calificación (1-10)</option>
                                    </select>
                                    <div className="flex gap-2 ml-auto">
                                      <button 
                                        onClick={() => setEditingQuestionId(null)}
                                        className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                                      >
                                        Cancel
                                      </button>
                                      <button 
                                        onClick={() => {
                                          const textInput = document.getElementById(`edit-text-${question.id}`) as HTMLInputElement;
                                          const typeInput = document.getElementById(`edit-type-${question.id}`) as HTMLSelectElement;
                                          updateQuestion(activePoll.id, question.id, { 
                                            text: textInput.value,
                                            type: typeInput.value as QuestionType
                                          });
                                        }}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-md flex items-center gap-2"
                                      >
                                        <Save className="w-3 h-3" />
                                        Save Changes
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-6">
                                  <div className="flex flex-col items-center gap-1">
                                    <button 
                                      disabled={index === 0}
                                      onClick={() => moveQuestion(activePoll.id, question, 'up')}
                                      className="p-1 text-slate-300 hover:text-indigo-600 disabled:opacity-0"
                                    >
                                      <ArrowUp className="w-4 h-4" />
                                    </button>
                                    <span className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center text-xs font-black text-slate-400">
                                      {index + 1}
                                    </span>
                                    <button 
                                      disabled={index === questions.length - 1}
                                      onClick={() => moveQuestion(activePoll.id, question, 'down')}
                                      className="p-1 text-slate-300 hover:text-indigo-600 disabled:opacity-0"
                                    >
                                      <ArrowDown className="w-4 h-4" />
                                    </button>
                                  </div>
                                  
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase">
                                        {question.type.replace('-', ' ')}
                                      </span>
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-900 leading-tight mb-2">{question.text}</h4>
                                    {question.options && question.options.length > 0 && (
                                      <div className="flex flex-wrap gap-2">
                                        {question.options.map((opt, i) => (
                                          <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-medium rounded-md border border-indigo-100">
                                            {opt}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => setEditingQuestionId(question.id)}
                                      className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        if (confirm('¿Eliminar esta pregunta?')) {
                                          deleteQuestion(activePoll.id, question.id);
                                        }
                                      }}
                                      className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}

                        {questions.length === 0 && (
                          <div className="py-20 bg-white border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center text-slate-300">
                            <Plus className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-lg font-bold">Aún no hay preguntas</p>
                            <p className="text-sm font-medium">Usa la barra lateral para añadir tu primera pregunta</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ) : viewMode === 'participants' ? (
                    <motion.div 
                      key="participants"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="h-full flex flex-col p-8 bg-slate-50 overflow-y-auto"
                    >
                      <div className="mb-8 flex items-center justify-between max-w-5xl mx-auto w-full">
                        <div>
                          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Resumen de Participantes</h2>
                          <p className="text-slate-500 font-medium">{new Set(responses.map(r => r.participantCode || r.participantName)).size} participantes conectados</p>
                        </div>
                      </div>
                      <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Array.from(new Set<string>(responses.map(r => r.participantCode || r.participantName))).map(participantKey => {
                          const participantResponses = responses.filter(r => (r.participantCode || r.participantName) === participantKey);
                          const firstResponse = participantResponses[0];
                          const displayName = firstResponse ? firstResponse.participantName : participantKey;
                          const isNumericCode = /^\d{7}$/.test(participantKey);
                          
                          return (
                            <div key={participantKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100">
                                <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-md uppercase">
                                  {displayName.slice(0, 2)}
                                </div>
                                <div className="flex-1">
                                  <h3 className="text-xl font-bold text-slate-900">{displayName}</h3>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    {isNumericCode && (
                                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded font-mono">
                                        CÓDIGO: {participantKey}
                                      </span>
                                    )}
                                    <span className="text-xs font-medium text-slate-500">{participantResponses.length} respuestas</span>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-4">
                                {participantResponses.map(r => {
                                  const q = questions.find(question => question.id === r.questionId);
                                  return (
                                    <div key={r.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                      <p className="text-xs font-bold text-slate-400 mb-2 truncate">{q?.text || 'Unknown question'}</p>
                                      {r.value && (
                                        <div className="mb-1">
                                          {typeof r.value === 'number' ? (
                                            <div className="flex items-end gap-1">
                                              <span className="text-xl font-black text-indigo-600 leading-none">{r.value}</span>
                                              <span className="text-xs font-bold text-slate-400">/ 10</span>
                                            </div>
                                          ) : (
                                            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded uppercase">
                                              {r.value}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {r.text && <p className="text-sm font-semibold text-slate-800">{r.text}</p>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="h-10 bg-white border-t border-slate-200 flex items-center px-8 shrink-0 text-[11px] text-slate-400 font-medium tracking-wide">
        <div className="flex gap-6">
          <span>PROJECT: <strong className="text-slate-700">COACHED!</strong></span>
          <span>SESSION: <strong className="text-slate-700">{activePoll?.id || 'STANDBY'}</strong></span>
          <span>CREATOR: <strong className="text-indigo-500 uppercase">{polls.find(p => p.id === activePoll?.id)?.creatorId === user.uid ? 'YOU' : 'OTHER'}</strong></span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          ESTADO DEL SISTEMA: <span className="text-emerald-600 font-black uppercase">Operativo</span>
        </div>
      </footer>

      <AnimatePresence>
        {viewMode === 'live' && activePoll && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-50 flex overflow-hidden"
          >
            <div className="shrink-0 bg-white border-r border-slate-200 flex flex-col items-center justify-center p-8 relative overflow-hidden w-[420px]">
              <div className="w-full flex-1 flex flex-col items-center justify-center min-w-[320px]">
                <div className="mb-8 p-6 bg-slate-50 rounded-[2rem] shadow-inner">
                  <QRCodeDisplay url={joinUrl} size={240} />
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter text-center leading-tight">ÚNETE A LA<br/>CONVERSACIÓN</h3>
                <p className="text-lg text-indigo-600 font-bold text-center break-all mb-8">{joinUrl.replace('https://', '')}</p>
                <div className="w-full bg-slate-50 rounded-xl p-4 text-center">
                  <p className="text-sm font-bold text-slate-700">Escanea el código para participar</p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col p-8 overflow-y-auto bg-slate-50 relative">
              {profile?.logoHtml && (
                <div className="absolute top-8 left-8 z-10 p-4 bg-white rounded-2xl shadow-lg border border-slate-100" dangerouslySetInnerHTML={{ __html: profile.logoHtml }} />
              )}
              
              <button 
                onClick={() => setViewMode('editor')}
                className="absolute top-8 right-8 p-3 bg-white border border-slate-200 text-slate-400 rounded-full hover:bg-slate-50 hover:text-red-500 transition-colors shadow-sm z-10"
              >
                <X className="w-6 h-6" />
              </button>
              
              <button 
                onClick={toggleFullscreen}
                className="absolute top-8 right-24 p-3 bg-white border border-slate-200 text-slate-400 rounded-full hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm z-10"
              >
                {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
              </button>

              <div className="mb-8 flex justify-between items-start max-w-5xl mx-auto w-full pt-16">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded uppercase tracking-wider">Interacción en Vivo</span>
                    <span className="text-slate-400 text-sm font-medium">• {responses.filter(r => r.questionId === (activePoll.currentQuestionId || questions[0]?.id)).length} respuestas</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={goToPrevQuestion}
                      disabled={activePollLiveQuestionIndex <= 0}
                      className="p-2 bg-white border border-slate-200 text-slate-400 rounded-full hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-400 transition-colors shadow-sm shrink-0"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight max-w-2xl">
                      {questions.find(q => q.id === activePoll?.currentQuestionId)?.text || questions[0]?.text || 'Ninguna pregunta activa'}
                    </h2>
                    <button 
                      onClick={goToNextQuestion}
                      disabled={activePollLiveQuestionIndex === -1 || activePollLiveQuestionIndex >= questions.length - 1}
                      className="p-2 bg-white border border-slate-200 text-slate-400 rounded-full hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-400 transition-colors shadow-sm shrink-0"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 max-w-5xl mx-auto w-full pb-16">
                {questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'comparison' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full items-stretch py-8">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      
                      const votesA = qResponses.filter(r => r.value === 'A').length;
                      const votesB = qResponses.filter(r => r.value === 'B').length;
                      
                      return (
                        <>
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white rounded-[3rem] shadow-2xl border-4 border-indigo-50 flex flex-col items-center p-8 overflow-hidden relative group"
                          >
                            <div className="flex-1 flex items-center justify-center w-full mb-8 min-h-[300px]">
                              {currentQ?.optionAImage ? (
                                <div 
                                  className="w-full h-full flex items-center justify-center max-h-[400px] overflow-hidden rounded-2xl"
                                  dangerouslySetInnerHTML={{ 
                                    __html: currentQ.optionAImage.includes('<img') 
                                      ? currentQ.optionAImage 
                                      : `<img src="${currentQ.optionAImage}" class="w-full h-full object-contain" />` 
                                  }}
                                />
                              ) : (
                                <div className="text-8xl font-black text-slate-100">A</div>
                              )}
                            </div>
                            <div className="text-center w-full pt-8 border-t border-slate-100">
                              <span className="text-[120px] font-black text-indigo-600 leading-none block mb-2">{votesA}</span>
                              <span className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">VOTOS OPCIÓN A</span>
                            </div>
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${(votesA / (votesA + votesB || 1)) * 100}%` }}
                              className="absolute bottom-0 left-0 right-0 bg-indigo-500/5 -z-10 transition-all duration-1000"
                            />
                          </motion.div>

                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="bg-white rounded-[3rem] shadow-2xl border-4 border-slate-50 flex flex-col items-center p-8 overflow-hidden relative"
                          >
                            <div className="flex-1 flex items-center justify-center w-full mb-8 min-h-[300px]">
                              {currentQ?.optionBImage ? (
                                <div 
                                  className="w-full h-full flex items-center justify-center max-h-[400px] overflow-hidden rounded-2xl"
                                  dangerouslySetInnerHTML={{ 
                                    __html: currentQ.optionBImage.includes('<img') 
                                      ? currentQ.optionBImage 
                                      : `<img src="${currentQ.optionBImage}" class="w-full h-full object-contain" />` 
                                  }}
                                />
                              ) : (
                                <div className="text-8xl font-black text-slate-100">B</div>
                              )}
                            </div>
                            <div className="text-center w-full pt-8 border-t border-slate-100">
                              <span className="text-[120px] font-black text-rose-500 leading-none block mb-2">{votesB}</span>
                              <span className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">VOTOS OPCIÓN B</span>
                            </div>
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${(votesB / (votesA + votesB || 1)) * 100}%` }}
                              className="absolute bottom-0 left-0 right-0 bg-rose-500/5 -z-10 transition-all duration-1000"
                            />
                          </motion.div>
                        </>
                      );
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'multiple-choice' ? (
                  <div className="space-y-6">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      const totalVotes = qResponses.length;
                      
                      return currentQ?.options?.map((option) => {
                        const votes = qResponses.filter(r => r.value === option).length;
                        const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                        
                        return (
                          <motion.div 
                            key={option}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm relative overflow-hidden"
                          >
                            <div className="relative z-10 flex justify-between items-center">
                              <span className="text-xl font-bold text-slate-800">{option}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-2xl font-black text-indigo-600">{votes}</span>
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">votos</span>
                              </div>
                            </div>
                            <div className="mt-4 h-4 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                              />
                            </div>
                            <div className="mt-2 text-right">
                              <span className="text-xs font-black text-indigo-400">{percentage}%</span>
                            </div>
                          </motion.div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="grid gap-4 auto-rows-min grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    <AnimatePresence mode="popLayout">
                      {responses
                        .filter(r => r.questionId === (activePoll.currentQuestionId || questions[0]?.id))
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .map((response) => (
                        <motion.div 
                          key={response.id}
                          layout
                          initial={{ opacity: 0, scale: 0.5, y: 40, rotateX: -15 }}
                          animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -20 }}
                          transition={{ 
                            type: "spring", 
                            stiffness: 500, 
                            damping: 25,
                            mass: 1
                          }}
                          className="bg-white p-6 rounded-3xl shadow-xl shadow-indigo-100/40 border-2 border-indigo-50 flex flex-col min-h-[140px] relative overflow-hidden"
                        >
                          <motion.div 
                            initial={{ opacity: 0.6, scale: 0.8 }}
                            animate={{ opacity: 0, scale: 2 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute inset-0 bg-indigo-200 z-0 pointer-events-none rounded-3xl"
                          />
                          <div className="relative z-10">
                            {response.value && (
                              <div className="mb-3">
                                {typeof response.value === 'number' ? (
                                  <div className="flex items-end gap-1 mb-1">
                                    <span className="text-4xl font-black text-indigo-600 leading-none">{response.value}</span>
                                    <span className="text-sm font-bold text-slate-400 mb-1">/ 10</span>
                                  </div>
                                ) : (
                                  <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-black rounded-lg uppercase tracking-wide">
                                    {response.value}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-slate-800 font-bold leading-relaxed text-xl">{response.text || response.value}</p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {responses.filter(r => r.questionId === (activePoll.currentQuestionId || questions[0]?.id)).length === 0 && (
                  <div className="flex flex-col items-center justify-center h-[400px] text-slate-300">
                    <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-xl font-bold">Esperando respuestas en vivo...</p>
                    <p className="text-base font-medium mt-2">La audiencia verá esta pregunta en sus dispositivos</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
