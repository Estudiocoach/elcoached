import React, { useState, useEffect } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { Poll, Question, Response, QuestionType, UserProfile } from '@/src/types';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase-utils';
import { QRCodeDisplay } from './QRCodeDisplay';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, Plus, Trash2, Play, Users, MessageSquare, ArrowUp, ArrowDown, Edit2, Save, X, Eye, Settings, ChevronLeft, ChevronRight, Maximize, Minimize, LogOut, UserPlus, Share2, Layers, Menu, User as UserIcon } from 'lucide-react';
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
  const [newPollType, setNewPollType] = useState<'event' | 'challenge'>('event');
  const [newPollPenaltyParticipant, setNewPollPenaltyParticipant] = useState('');
  const [newPollPenaltyAdmin, setNewPollPenaltyAdmin] = useState('');
  const [questions, setPreguntas] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'dashboard' | 'settings' | 'users' | 'trash'>('list');
  const [viewMode, setViewMode] = useState<'editor' | 'live' | 'participants'>('editor');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Question Creation state
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('text');
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(['', '']);
  const [newQuestionCorrectAnswer, setNewQuestionCorrectAnswer] = useState<string>('');
  const [optionAImage, setOptionAImage] = useState('');
  const [optionBImage, setOptionBImage] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [groupingResponseId, setGroupingResponseId] = useState<string | null>(null);
  const [newGroupNameInput, setNewGroupNameInput] = useState('');

  // New states for Guess Name and Complete Sequence
  const [guessNameImageUrl, setGuessNameImageUrl] = useState('');
  const [guessNameCorrectAnswer, setGuessNameCorrectAnswer] = useState('');
  const [sequenceItemsInput, setSequenceItemsInput] = useState('');
  const [sequenceMissingIndexInput, setSequenceMissingIndexInput] = useState<number>(0);
  const [revealLiveAnswer, setRevealLiveAnswer] = useState(false);

  // Deletion and Trash states
  const [pollToDelete, setPollToDelete] = useState<Poll | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pollToPermanentDelete, setPollToPermanentDelete] = useState<Poll | null>(null);
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false);

  useEffect(() => {
    setRevealLiveAnswer(false);
  }, [activePoll?.currentQuestionId]);

  const handleTypeChange = (type: QuestionType) => {
    setNewQuestionType(type);
    if (type === 'four-options') {
      setNewQuestionOptions(['', '', '', '']);
    } else if (type === 'multiple-choice') {
      setNewQuestionOptions(['', '']);
    } else if (type === 'true-false') {
      setNewQuestionOptions(['Verdadero', 'Falso']);
    } else {
      setNewQuestionOptions(['', '']);
    }
  };

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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribeProfile();
  }, [user]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snapshot) => {
        setAllUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
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
      const payload: any = {
        title: newPollTítulo,
        createdAt: Date.now(),
        status: 'active',
        showQR: true,
        creatorId: user.uid,
        type: newPollType
      };
      
      if (newPollType === 'challenge') {
        payload.penaltyParticipant = newPollPenaltyParticipant;
        payload.penaltyAdmin = newPollPenaltyAdmin;
      }
      
      const docRef = await addDoc(collection(db, 'polls'), payload);
      
      const joinCode = docRef.id.slice(0, 7).toUpperCase();
      
      // Update the poll document with the joinCode field
      await updateDoc(doc(db, 'polls', docRef.id), {
        joinCode: joinCode
      });

      // Write to the joinCodes mapping for single-get lookup capability
      await setDoc(doc(db, 'joinCodes', joinCode), {
        pollId: docRef.id,
        createdAt: payload.createdAt
      });

      setNewPollTítulo('');
      setNewPollType('event');
      setNewPollPenaltyParticipant('');
      setNewPollPenaltyAdmin('');
      setActivePollId(docRef.id);
      setView('dashboard');
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
    let options: string[] = [];
    if (newQuestionType === 'multiple-choice' || newQuestionType === 'four-options') {
      options = newQuestionOptions.map(o => o.trim()).filter(o => o);
    } else if (newQuestionType === 'true-false') {
      options = ['Verdadero', 'Falso'];
    }

    let seqItems: string[] = [];
    let correctAns = '';
    if (newQuestionType === 'complete-sequence') {
      seqItems = sequenceItemsInput.split(',').map(item => item.trim()).filter(item => item);
      correctAns = seqItems[sequenceMissingIndexInput] || '';
    } else if (newQuestionType === 'guess-name') {
      correctAns = guessNameCorrectAnswer.trim();
    } else if (['multiple-choice', 'true-false', 'four-options'].includes(newQuestionType)) {
      correctAns = newQuestionCorrectAnswer;
    }

    try {
      await addDoc(collection(db, 'polls', pollId, 'questions'), {
        pollId,
        text,
        type: newQuestionType,
        options,
        optionAImage: newQuestionType === 'comparison' ? optionAImage : '',
        optionBImage: newQuestionType === 'comparison' ? optionBImage : '',
        imageUrl: newQuestionType === 'guess-name' ? guessNameImageUrl.trim() : '',
        correctAnswer: correctAns,
        sequenceItems: seqItems,
        sequenceMissingIndex: newQuestionType === 'complete-sequence' ? sequenceMissingIndexInput : 0,
        order: questions.length + 1
      });
      setNewQuestionOptions(['', '']);
      setOptionAImage('');
      setOptionBImage('');
      setGuessNameImageUrl('');
      setGuessNameCorrectAnswer('');
      setSequenceItemsInput('');
      setSequenceMissingIndexInput(0);
      setNewQuestionCorrectAnswer('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `polls/${pollId}/questions`);
    }
  };

  const deleteResponse = async (pollId: string, responseId: string) => {
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'polls', pollId, 'responses', responseId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `polls/${pollId}/responses/${responseId}`);
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

  const deletePollToTrash = async (poll: Poll) => {
    try {
      await updateDoc(doc(db, 'polls', poll.id), {
        isDeleted: true,
        deletedAt: Date.now()
      });
      if (activePollId === poll.id) {
        setActivePollId(null);
        setView('list');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${poll.id}`);
    }
  };

  const restorePollFromTrash = async (poll: Poll) => {
    try {
      await updateDoc(doc(db, 'polls', poll.id), {
        isDeleted: false,
        deletedAt: null
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${poll.id}`);
    }
  };

  const permanentlyDeletePoll = async (poll: Poll) => {
    try {
      if (poll.joinCode) {
        try {
          await deleteDoc(doc(db, 'joinCodes', poll.joinCode));
        } catch (e) {
          console.error("Error deleting joinCode mapping:", e);
        }
      }
      await deleteDoc(doc(db, 'polls', poll.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `polls/${poll.id}`);
    }
  };

  const updateQuestion = async (pollId: string, questionId: string, updates: Partial<Question>) => {
    try {
      if (updates.type === 'true-false') {
        updates.options = ['Verdadero', 'Falso'];
      } else if (updates.type === 'four-options') {
        updates.options = ['Opción A', 'Opción B', 'Opción C', 'Opción D'];
      }
      await updateDoc(doc(db, 'polls', pollId, 'questions', questionId), updates);
      setEditingQuestionId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${pollId}/questions/${questionId}`);
    }
  };

  const groupIdea = async (pollId: string, responseId: string, groupName: string) => {
    try {
      await updateDoc(doc(db, 'polls', pollId, 'responses', responseId), {
        group: groupName.trim()
      });
      setGroupingResponseId(null);
      setNewGroupNameInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${pollId}/responses/${responseId}`);
    }
  };

  const ungroupIdea = async (pollId: string, responseId: string) => {
    try {
      await updateDoc(doc(db, 'polls', pollId, 'responses', responseId), {
        group: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `polls/${pollId}/responses/${responseId}`);
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
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans overflow-hidden relative">
      {/* Sidebar Backdrop for Mobile */}
      {isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-25 lg:hidden cursor-default w-full h-full border-none outline-none"
          aria-label="Cerrar menú"
        />
      )}

      {/* Sidebar */}
      <aside className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 fixed lg:relative inset-y-0 left-0 z-30 shrink-0 
        ${isSidebarOpen ? 'translate-x-0 w-64 shadow-2xl lg:shadow-none' : '-translate-x-full lg:translate-x-0 w-64 lg:w-20'}
      `}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
          <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight whitespace-nowrap">
              coached
            </h1>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0 mx-auto"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-2">
          <button 
            onClick={() => setView('list')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold transition-all ${view === 'list' || view === 'dashboard' || view === 'create' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'} ${!isSidebarOpen && 'justify-center'}`}
            title="Eventos"
          >
            <LayoutDashboard className="w-5 h-5 shrink-0" />
            <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>Eventos</span>
          </button>
          
          {profile?.role === 'admin' && (
            <button 
              onClick={() => setView('users')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold transition-all ${view === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'} ${!isSidebarOpen && 'justify-center'}`}
              title="Usuarios"
            >
              <Users className="w-5 h-5 shrink-0" />
              <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>Usuarios</span>
            </button>
          )}

          <button 
            onClick={() => setView('trash')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold transition-all ${view === 'trash' ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'} ${!isSidebarOpen && 'justify-center'}`}
            title="Papelera"
          >
            <Trash2 className="w-5 h-5 shrink-0" />
            <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>Papelera</span>
          </button>

          <button 
            onClick={() => setView('settings')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold transition-all ${view === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'} ${!isSidebarOpen && 'justify-center'}`}
            title="Ajustes"
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>Ajustes</span>
          </button>
        </div>

        <div className="p-4 border-t border-slate-200">
          <div className={`flex items-center gap-3 mb-4 overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'opacity-100 h-auto' : 'opacity-0 h-0 m-0'}`}>
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{profile?.displayName || user.displayName}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{profile?.role || 'User'}</p>
            </div>
          </div>
          <button 
            onClick={onSignOut}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold transition-all text-slate-500 hover:bg-red-50 hover:text-red-600 ${!isSidebarOpen && 'justify-center'}`}
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile Header Bar */}
        <div className="lg:hidden h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-25">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-sm font-black text-slate-800 tracking-tight">coached</span>
          </div>
          <div className="w-10"></div> {/* Spacer for symmetry */}
        </div>

        {view === 'dashboard' && activePoll && (
          <div className="hidden sm:flex absolute top-4 right-8 z-50 flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-md border border-slate-200">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-sm font-bold text-slate-600">
              {new Set(responses.map(r => r.participantCode || r.participantName)).size} Participantes
            </span>
          </div>
        )}
        {view === 'list' ? (
          <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight mb-2">Panel Principal</h2>
                  <p className="text-slate-500 font-medium text-sm lg:text-lg">Bienvenido de nuevo. Aquí tienes un resumen de tus actividades.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button 
                    onClick={() => {
                      setNewPollType('event');
                      setView('create');
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Nuevo Evento
                  </button>
                  <button 
                    onClick={() => {
                      setNewPollType('challenge');
                      setView('create');
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Nuevo Desafío
                  </button>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <LayoutDashboard className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">Total Eventos</p>
                    <p className="text-3xl font-black text-slate-900">{polls.filter(p => !p.isDeleted).length}</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Play className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">Eventos Activos</p>
                    <p className="text-3xl font-black text-slate-900">{polls.filter(p => !p.isDeleted && p.status === 'active').length}</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Users className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">Participantes</p>
                    <p className="text-3xl font-black text-slate-900">{new Set(responses.map(r => r.participantCode || r.participantName)).size}</p>
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-black text-slate-900 tracking-tight mb-6 flex items-center gap-2">
                Tus Eventos
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-sm font-bold">{polls.filter(p => !p.isDeleted).length}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {polls.filter(p => !p.isDeleted).map(poll => (
                  <motion.div
                    key={poll.id}
                    layoutId={poll.id}
                    className="group bg-white p-6 rounded-[2rem] border border-slate-200 hover:border-indigo-600 hover:shadow-xl transition-all text-left flex flex-col h-full relative overflow-hidden cursor-pointer"
                    onClick={() => { setActivePollId(poll.id); setView('dashboard'); }}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 z-10">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setPollToDelete(poll); setShowDeleteConfirm(true); }}
                        className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        title="Mover a papelera"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="mb-6 flex justify-between items-start">
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 ${poll.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {poll.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                        {poll.status === 'active' ? 'En Vivo' : 'Cerrado'}
                      </div>
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <Play className="w-5 h-5 ml-0.5" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors leading-tight">{poll.title}</h3>
                    <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100">
                      <p className="text-sm text-slate-500 font-bold flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        {new Date(poll.createdAt).toLocaleDateString()}
                      </p>
                      <div className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity font-bold text-sm flex items-center gap-1">
                        Abrir
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {polls.filter(p => !p.isDeleted).length === 0 && (
                <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-400 shadow-inner">
                    <Layers className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2">Aún no hay eventos</h3>
                  <p className="text-slate-500 mb-8 max-w-sm mx-auto text-lg">Comienza creando tu primera sesión interactiva para interactuar con tu audiencia.</p>
                  <div className="flex items-center justify-center gap-3">
                    <button 
                      onClick={() => {
                        setNewPollType('event');
                        setView('create');
                      }}
                      className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Crear mi primer evento
                    </button>
                    <button 
                      onClick={() => {
                        setNewPollType('challenge');
                        setView('create');
                      }}
                      className="px-8 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 flex items-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Crear mi primer desafío
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : view === 'trash' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Papelera</h2>
                  <p className="text-slate-500 font-medium">Eventos eliminados recientemente</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {polls.filter(p => p.isDeleted).map(poll => (
                  <motion.div
                    key={poll.id}
                    layoutId={poll.id}
                    className="group bg-white p-6 rounded-[2rem] border border-slate-200 hover:border-rose-600 hover:shadow-xl transition-all text-left flex flex-col h-full relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                      <button 
                        onClick={() => restorePollFromTrash(poll)}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors"
                        title="Restaurar"
                      >
                        Restaurar
                      </button>
                      <button 
                        onClick={() => { setPollToPermanentDelete(poll); setShowPermanentDeleteConfirm(true); }}
                        className="w-8 h-8 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-100 transition-colors"
                        title="Eliminar permanentemente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mb-4">
                      <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-rose-100 text-rose-700">
                        Eliminado
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{poll.title}</h3>
                    <p className="text-sm text-slate-400 font-medium mt-auto flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {new Date(poll.createdAt).toLocaleDateString()}
                    </p>
                  </motion.div>
                ))}
              </div>

              {polls.filter(p => p.isDeleted).length === 0 && (
                <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <Trash2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">La papelera está vacía</h3>
                  <p className="text-slate-500">No hay eventos eliminados recientemente</p>
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
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Información del Sistema</h3>
                  <div className="space-y-2 text-[11px] text-slate-500 font-medium tracking-wide">
                    <div className="flex justify-between">
                      <span>PROJECT:</span>
                      <strong className="text-slate-700">coached</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>SESSION:</span>
                      <strong className="text-slate-700">{activePoll?.id || 'STANDBY'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>CREATOR:</span>
                      <strong className="text-indigo-500 uppercase">{polls.find(p => p.id === activePoll?.id)?.creatorId === user.uid ? 'YOU' : 'OTHER'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>ESTADO DEL SISTEMA:</span>
                      <span className="text-emerald-600 font-black uppercase">Operativo</span>
                    </div>
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
          <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 overflow-y-auto">
            <div className="max-w-lg w-full bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 my-auto">
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-black text-slate-900 mb-2">Nueva Sesión</h2>
                <p className="text-slate-500 font-medium">Configura tu sesión interactiva en vivo.</p>
              </div>

              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Tipo de Sesión</label>
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={() => setNewPollType('event')}
                      className={`p-5 rounded-2xl font-bold text-sm transition-all border-2 text-left flex items-start gap-4 ${newPollType === 'event' ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl ${newPollType === 'event' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        📅
                      </div>
                      <div className="flex-1">
                        <div className="font-black text-sm mb-0.5 text-slate-800">Evento en Vivo</div>
                        <p className="text-xs font-semibold text-slate-400 leading-normal">Sesión interactiva en vivo con votaciones, preguntas y nubes de palabras.</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setNewPollType('challenge')}
                      className={`p-5 rounded-2xl font-bold text-sm transition-all border-2 text-left flex items-start gap-4 ${newPollType === 'challenge' ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl ${newPollType === 'challenge' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        🔥
                      </div>
                      <div className="flex-1">
                        <div className="font-black text-sm mb-0.5 text-slate-800">Desafío Privado (con prenda)</div>
                        <p className="text-xs font-semibold text-slate-400 leading-normal">Preguntas con aciertos y errores donde se asigna una prenda al perdedor.</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Título de la Sesión</label>
                  <input 
                    type="text" 
                    value={newPollTítulo}
                    onChange={(e) => setNewPollTítulo(e.target.value)}
                    placeholder="ej. Reunión Anual de Estrategia"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white outline-none transition-all font-medium text-slate-900"
                  />
                </div>

                {newPollType === 'challenge' && (
                  <div className="space-y-4 p-6 bg-amber-50/50 border border-amber-100 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⚖️</span>
                      <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Prendas del Desafío</h4>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1.5">Si fallas alguna tenes que...</label>
                      <input 
                        type="text" 
                        value={newPollPenaltyParticipant}
                        onChange={(e) => setNewPollPenaltyParticipant(e.target.value)}
                        placeholder="si falla tiene que"
                        className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1.5">Si acertas todas tengo que</label>
                      <input 
                        type="text" 
                        value={newPollPenaltyAdmin}
                        onChange={(e) => setNewPollPenaltyAdmin(e.target.value)}
                        placeholder="Si aciertas todas tengo que"
                        className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                )}

                <button 
                  onClick={createPoll}
                  className={`w-full py-5 text-white rounded-2xl font-black text-lg transition-all shadow-lg hover:shadow-xl active:scale-[0.98] ${newPollType === 'challenge' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200/50' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200/50'}`}
                >
                  Crear {newPollType === 'challenge' ? 'Desafío' : 'Evento'}
                </button>
              </div>
            </div>
          </div>
        ) : activePoll && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
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
                    onClick={() => { setPollToDelete(activePoll); setShowDeleteConfirm(true); }}
                    className="px-4 py-2 rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center gap-2 bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    title="Mover a papelera"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar
                  </button>
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
                                  
                                  {question.type === 'guess-name' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                      <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">URL de la Imagen</label>
                                        <input 
                                          type="text"
                                          id={`edit-image-${question.id}`}
                                          defaultValue={question.imageUrl}
                                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none font-bold"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Respuesta Correcta</label>
                                        <input 
                                          type="text"
                                          id={`edit-correct-${question.id}`}
                                          defaultValue={question.correctAnswer}
                                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none font-bold"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {question.type === 'complete-sequence' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                      <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Elementos (por comas)</label>
                                        <input 
                                          type="text"
                                          id={`edit-seq-items-${question.id}`}
                                          defaultValue={question.sequenceItems?.join(', ')}
                                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none font-bold"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Índice Oculto (0, 1, 2...)</label>
                                        <input 
                                          type="number"
                                          id={`edit-seq-missing-${question.id}`}
                                          defaultValue={question.sequenceMissingIndex}
                                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none font-bold"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-3">
                                    <select 
                                      id={`edit-type-${question.id}`}
                                      defaultValue={question.type}
                                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none cursor-pointer font-black"
                                    >
                                      <option value="text">Respuesta Abierta (Estándar)</option>
                                      <option value="open-ended">Preguntas Abiertas (hasta 250 caracteres)</option>
                                      <option value="brainstorm">Lluvia de Ideas (hasta 75 caracteres)</option>
                                      <option value="word-cloud">Nube de Palabras (una sola palabra)</option>
                                      <option value="multiple-choice">Opción Múltiple (Dinámica)</option>
                                      <option value="four-options">4 Opciones (A, B, C, D)</option>
                                      <option value="true-false">Verdadero o Falso</option>
                                      <option value="rating">Calificación (1-10)</option>
                                      <option value="comparison">Comparación A vs B</option>
                                      <option value="guess-name">Adivina su nombre (Imagen + Entrada)</option>
                                      <option value="complete-sequence">Completa la secuencia</option>
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
                                          
                                          const updates: Partial<Question> = { 
                                            text: textInput.value,
                                            type: typeInput.value as QuestionType
                                          };

                                          if (question.type === 'guess-name') {
                                            const imgInput = document.getElementById(`edit-image-${question.id}`) as HTMLInputElement;
                                            const corrInput = document.getElementById(`edit-correct-${question.id}`) as HTMLInputElement;
                                            if (imgInput) updates.imageUrl = imgInput.value.trim();
                                            if (corrInput) updates.correctAnswer = corrInput.value.trim();
                                          } else if (question.type === 'complete-sequence') {
                                            const seqInput = document.getElementById(`edit-seq-items-${question.id}`) as HTMLInputElement;
                                            const missingInput = document.getElementById(`edit-seq-missing-${question.id}`) as HTMLInputElement;
                                            if (seqInput) {
                                              const items = seqInput.value.split(',').map(item => item.trim()).filter(item => item);
                                              updates.sequenceItems = items;
                                              const mIndex = Number(missingInput?.value || 0);
                                              updates.sequenceMissingIndex = mIndex;
                                              updates.correctAnswer = items[mIndex] || '';
                                            }
                                          }

                                          updateQuestion(activePoll.id, question.id, updates);
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
                                          <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-medium rounded-md border border-indigo-100 font-bold">
                                            {opt}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    {question.type === 'guess-name' && (
                                      <div className="mt-2 flex items-center gap-3 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                                        {question.imageUrl ? (
                                          <img src={question.imageUrl} alt="Guess" className="w-12 h-12 rounded-lg object-cover border border-slate-200" referrerPolicy="no-referrer" />
                                        ) : (
                                          <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-400">Sin img</div>
                                        )}
                                        <div>
                                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Respuesta correcta</p>
                                          <p className="text-xs font-extrabold text-emerald-600 uppercase">{question.correctAnswer}</p>
                                        </div>
                                      </div>
                                    )}

                                    {question.type === 'complete-sequence' && (
                                      <div className="mt-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Secuencia de elementos</p>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {question.sequenceItems?.map((item, idx) => {
                                            const isMissing = idx === question.sequenceMissingIndex;
                                            return (
                                              <React.Fragment key={idx}>
                                                {idx > 0 && <span className="text-slate-300 text-xs font-black">➔</span>}
                                                <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${isMissing ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm' : 'bg-white text-slate-600 border border-slate-100'}`}>
                                                  {isMissing ? `[🔍 ${item}]` : item}
                                                </span>
                                              </React.Fragment>
                                            );
                                          })}
                                        </div>
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
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
            {viewMode === 'editor' && (
              <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white p-6 flex flex-col shrink-0 overflow-y-auto shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20">
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
                        onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                        className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <option value="text">Respuesta Abierta (Estándar)</option>
                        <option value="open-ended">Preguntas Abiertas (hasta 250 caracteres)</option>
                        <option value="brainstorm">Lluvia de Ideas (hasta 75 caracteres)</option>
                        <option value="word-cloud">Nube de Palabras (una sola palabra)</option>
                        <option value="multiple-choice">Opción Múltiple (Dinámica)</option>
                        <option value="four-options">4 Opciones (A, B, C, D)</option>
                        <option value="true-false">Verdadero o Falso</option>
                        <option value="rating">Calificación (1-10)</option>
                        <option value="comparison">Comparación A vs B</option>
                        <option value="guess-name">Adivina su nombre (Imagen + Entrada)</option>
                        <option value="complete-sequence">Completa la secuencia</option>
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
                      {newQuestionType === 'guess-name' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">URL de la Imagen</label>
                            <input 
                              type="text"
                              value={guessNameImageUrl}
                              onChange={(e) => setGuessNameImageUrl(e.target.value)}
                              placeholder="https://ejemplo.com/imagen.jpg o URL"
                              required
                              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Respuesta Correcta</label>
                            <input 
                              type="text"
                              value={guessNameCorrectAnswer}
                              onChange={(e) => setNewQuestionCorrectAnswer(e.target.value)}
                              placeholder="Nombre exacto a adivinar..."
                              required
                              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white font-bold"
                            />
                          </div>
                        </div>
                      )}
                      {newQuestionType === 'complete-sequence' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Elementos (separados por coma)</label>
                            <input 
                              type="text"
                              value={sequenceItemsInput}
                              onChange={(e) => {
                                setSequenceItemsInput(e.target.value);
                                setSequenceMissingIndexInput(0);
                              }}
                              placeholder="Fase 1, Fase 2, Fase 3, Fase 4"
                              required
                              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white font-bold"
                            />
                            <p className="text-[9px] text-slate-400 mt-1 ml-1 leading-normal font-bold uppercase tracking-wider">Escribe la serie en orden.</p>
                          </div>
                          
                          {(() => {
                            const items = sequenceItemsInput.split(',').map(item => item.trim()).filter(item => item);
                            if (items.length === 0) return null;
                            return (
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1 font-bold">Elemento Oculto a Completar</label>
                                <select
                                  value={sequenceMissingIndexInput}
                                  onChange={(e) => setSequenceMissingIndexInput(Number(e.target.value))}
                                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 font-black hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                  {items.map((item, idx) => (
                                    <option key={idx} value={idx}>
                                      {idx + 1}. {item} (Se ocultará)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()}
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
                      {newQuestionType === 'four-options' && (
                        <div className="space-y-2">
                          {['A', 'B', 'C', 'D'].map((letter, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm border border-indigo-100 shrink-0">
                                {letter}
                              </span>
                              <input 
                                value={newQuestionOptions[i] || ''}
                                onChange={(e) => {
                                  const newOpts = [...newQuestionOptions];
                                  newOpts[i] = e.target.value;
                                  setNewQuestionOptions(newOpts);
                                }}
                                placeholder={`Opción ${letter}`}
                                required
                                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 hover:bg-slate-100 transition-colors focus:bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {newQuestionType === 'true-false' && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                          <span>✓</span>
                          <span>Esta pregunta mostrará dos opciones fijas para los participantes: Verdadero y Falso.</span>
                        </div>
                      )}
                      {newQuestionType === 'brainstorm' && (
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-800 text-xs font-semibold flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 font-black">
                            <span>💡</span>
                            <span>Lluvia de Ideas (Brainstorming)</span>
                          </div>
                          <p className="text-slate-600 font-medium">Los participantes pueden enviar múltiples ideas de hasta 75 caracteres. En la pantalla grande podrás agrupar las ideas parecidas en categorías personalizadas en tiempo real.</p>
                        </div>
                      )}
                      {newQuestionType === 'word-cloud' && (
                        <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl text-purple-800 text-xs font-semibold flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 font-black">
                            <span>☁️</span>
                            <span>Nube de Palabras</span>
                          </div>
                          <p className="text-slate-600 font-medium">Los participantes pueden enviar palabras individuales de hasta 30 caracteres. Se mostrará una nube interactiva con los términos más votados con mayor tamaño.</p>
                        </div>
                      )}
                      {newQuestionType === 'open-ended' && (
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-blue-800 text-xs font-semibold flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 font-black">
                            <span>💬</span>
                            <span>Preguntas Abiertas (hasta 250 caracteres)</span>
                          </div>
                          <p className="text-slate-600 font-medium">Los participantes pueden escribir respuestas detalladas de hasta 250 caracteres. Se visualizarán en la pantalla grande como tarjetas elegantes con animación de entrada.</p>
                        </div>
                      )}
                    </div>
                    {activePoll.type === 'challenge' && ['multiple-choice', 'true-false', 'four-options'].includes(newQuestionType) && (
                      <div className="pt-4 border-t border-slate-100">
                        <label className="block text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Seleccionar Respuesta Correcta</label>
                        <select 
                          value={newQuestionCorrectAnswer}
                          onChange={(e) => setNewQuestionCorrectAnswer(e.target.value)}
                          className="w-full px-4 py-2.5 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-amber-50 font-black hover:bg-amber-100 transition-colors cursor-pointer text-amber-800"
                        >
                          <option value="">Seleccione la opción correcta...</option>
                          {newQuestionType === 'true-false' ? (
                            <>
                              <option value="Verdadero">Verdadero</option>
                              <option value="Falso">Falso</option>
                            </>
                          ) : (
                            newQuestionOptions.filter(opt => opt.trim() !== '').map((opt, idx) => (
                              <option key={idx} value={opt}>{opt}</option>
                            ))
                          )}
                        </select>
                      </div>
                    )}
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
            )}
          </div>
        )}
      </main>

      <footer className="h-10 bg-white border-t border-slate-200 flex items-center px-8 shrink-0 text-[11px] text-slate-400 font-medium tracking-wide">
      </footer>

      <AnimatePresence>
        {viewMode === 'live' && activePoll && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-50 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden"
          >
            <div className="shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col items-center justify-center p-6 lg:p-8 relative overflow-hidden w-full lg:w-[420px]">
              <div className="w-full flex-1 flex flex-col items-center justify-center max-w-sm lg:max-w-none mx-auto py-4 lg:py-0">
                <div className="mb-4 lg:mb-8 p-4 lg:p-6 bg-slate-50 rounded-[2rem] shadow-inner">
                  <QRCodeDisplay url={joinUrl} size={180} />
                </div>
                <h3 className="text-xl lg:text-3xl font-black text-slate-900 mb-2 tracking-tighter text-center leading-tight">ÚNETE A LA<br/>CONVERSACIÓN</h3>
                <p className="text-sm lg:text-lg text-indigo-600 font-bold text-center break-all mb-4 lg:mb-8">{joinUrl.replace('https://', '')}</p>
                <div className="w-full bg-slate-50 rounded-xl p-3 lg:p-4 text-center">
                  <p className="text-xs lg:text-sm font-bold text-slate-700">Escanea el código para participar</p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col p-6 lg:p-8 overflow-y-auto bg-slate-50 relative min-h-[450px] lg:min-h-0">
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
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'four-options' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      const totalVotes = qResponses.length;
                      const letters = ['A', 'B', 'C', 'D'];
                      const colors = [
                        { text: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100', fill: 'bg-indigo-500/10', circle: 'bg-indigo-600' },
                        { text: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', fill: 'bg-emerald-500/10', circle: 'bg-emerald-600' },
                        { text: 'text-rose-600', bg: 'bg-rose-50 border-rose-100', fill: 'bg-rose-500/10', circle: 'bg-rose-600' },
                        { text: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', fill: 'bg-amber-500/10', circle: 'bg-amber-600' }
                      ];
                      
                      return currentQ?.options?.slice(0, 4).map((option, idx) => {
                        const votes = qResponses.filter(r => r.value === option).length;
                        const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                        const colorSet = colors[idx] || colors[0];
                        
                        return (
                          <motion.div 
                            key={option}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden flex flex-col justify-between min-h-[160px]"
                          >
                            <div className="relative z-10 flex items-start justify-between">
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 ${colorSet.circle} text-white font-black text-xl rounded-2xl flex items-center justify-center shadow-md`}>
                                  {letters[idx]}
                                </div>
                                <span className="text-xl font-black text-slate-800 line-clamp-2 max-w-[220px]">{option}</span>
                              </div>
                              <div className="text-right">
                                <span className={`text-4xl font-black ${colorSet.text} block leading-none`}>{votes}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{votes === 1 ? 'voto' : 'votos'}</span>
                              </div>
                            </div>
                            
                            <div className="relative z-10 mt-6 flex justify-between items-end">
                              <span className="text-sm font-bold text-slate-400">Progreso</span>
                              <span className={`text-xl font-black ${colorSet.text}`}>{percentage}%</span>
                            </div>

                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className={`absolute bottom-0 left-0 top-0 ${colorSet.fill} -z-10`}
                            />
                          </motion.div>
                        );
                      });
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'true-false' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      const totalVotes = qResponses.length;
                      
                      const votesTrue = qResponses.filter(r => r.value === 'Verdadero' || r.value === 'true' || r.value === true).length;
                      const votesFalse = qResponses.filter(r => r.value === 'Falso' || r.value === 'false' || r.value === false).length;
                      
                      const percentTrue = totalVotes > 0 ? Math.round((votesTrue / totalVotes) * 100) : 0;
                      const percentFalse = totalVotes > 0 ? Math.round((votesFalse / totalVotes) * 100) : 0;
                      
                      return (
                        <>
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-[2.5rem] shadow-xl border-2 border-emerald-50 p-8 flex flex-col justify-between overflow-hidden relative group min-h-[220px]"
                          >
                            <div className="relative z-10 flex justify-between items-start">
                              <div>
                                <span className="px-4 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-black rounded-full uppercase tracking-wider">
                                  Verdadero
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-6xl font-black text-emerald-600 block leading-none">{votesTrue}</span>
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{votesTrue === 1 ? 'Voto' : 'Votos'}</span>
                              </div>
                            </div>
                            <div className="relative z-10 mt-8 flex justify-between items-end">
                              <span className="text-slate-400 font-bold">Porcentaje de votos</span>
                              <span className="text-4xl font-black text-emerald-600">{percentTrue}%</span>
                            </div>
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${percentTrue}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="absolute bottom-0 left-0 right-0 bg-emerald-500/5 -z-10"
                            />
                          </motion.div>

                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="bg-white rounded-[2.5rem] shadow-xl border-2 border-rose-50 p-8 flex flex-col justify-between overflow-hidden relative group min-h-[220px]"
                          >
                            <div className="relative z-10 flex justify-between items-start">
                              <div>
                                <span className="px-4 py-1.5 bg-rose-50 text-rose-700 text-xs font-black rounded-full uppercase tracking-wider">
                                  Falso
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-6xl font-black text-rose-600 block leading-none">{votesFalse}</span>
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{votesFalse === 1 ? 'Voto' : 'Votos'}</span>
                              </div>
                            </div>
                            <div className="relative z-10 mt-8 flex justify-between items-end">
                              <span className="text-slate-400 font-bold">Porcentaje de votos</span>
                              <span className="text-4xl font-black text-rose-600">{percentFalse}%</span>
                            </div>
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${percentFalse}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="absolute bottom-0 left-0 right-0 bg-rose-500/5 -z-10"
                            />
                          </motion.div>
                        </>
                      );
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'rating' ? (
                  <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col gap-8 w-full">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      const totalVotes = qResponses.length;
                      
                      const scoreCounts = Array(10).fill(0);
                      qResponses.forEach(r => {
                        const val = Number(r.value);
                        if (val >= 1 && val <= 10) {
                          scoreCounts[val - 1]++;
                        }
                      });
                      
                      const maxVotes = Math.max(...scoreCounts, 1);
                      const averageRating = totalVotes > 0 
                        ? (qResponses.reduce((sum, r) => sum + Number(r.value || 0), 0) / totalVotes).toFixed(1)
                        : '0.0';
                        
                      return (
                        <>
                          {/* Stats Header */}
                          <div className="flex flex-wrap gap-6 items-center justify-between pb-6 border-b border-slate-100">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-yellow-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-yellow-100">
                                <span className="text-2xl font-black">★</span>
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Calificación Promedio</h4>
                                <div className="flex items-baseline gap-1.5 leading-none">
                                  <span className="text-3xl font-black text-slate-900 leading-none">{averageRating}</span>
                                  <span className="text-xs font-bold text-slate-400">/ 10</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-8">
                              <div className="text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block leading-none mb-1.5">Total Votos</span>
                                <span className="text-3xl font-black text-indigo-600 leading-none">{totalVotes}</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* 10-Bar Chart */}
                          <div className="flex h-64 items-end gap-1.5 md:gap-3 pt-10 px-2 select-none w-full">
                            {scoreCounts.map((count, index) => {
                              const score = index + 1;
                              const percentageHeight = maxVotes > 0 ? (count / maxVotes) * 100 : 0;
                              
                              return (
                                <div key={score} className="flex-1 flex flex-col items-center h-full justify-end relative group">
                                  {/* Vote count bubble */}
                                  <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: count > 0 ? 1 : 0.2, y: 0 }}
                                    className={`absolute -top-8 px-1.5 py-0.5 rounded-lg text-[10px] font-black text-center ${count > 0 ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300'}`}
                                  >
                                    {count}
                                  </motion.div>
                                  
                                  {/* Bar */}
                                  <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-full flex items-end overflow-hidden relative">
                                    <motion.div 
                                      initial={{ height: 0 }}
                                      animate={{ height: `${percentageHeight}%` }}
                                      transition={{ type: "spring", stiffness: 100, damping: 15 }}
                                      className={`w-full rounded-b-xl ${count > 0 ? 'bg-gradient-to-t from-indigo-500 to-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-slate-100'}`}
                                    />
                                  </div>
                                  
                                  {/* Score Label */}
                                  <span className={`mt-2 text-xs md:text-sm font-black transition-colors ${count > 0 ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}>
                                    {score}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'brainstorm' ? (
                  <div className="flex flex-col gap-8 py-4 w-full text-left">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      
                      const ungrouped = qResponses.filter(r => !r.group);
                      const grouped = qResponses.filter(r => r.group);
                      const groups = Array.from(new Set(grouped.map(r => r.group).filter(Boolean))) as string[];
                      
                      const colors = [
                        { bg: 'bg-indigo-50/70 border-indigo-200', text: 'text-indigo-800', badge: 'bg-indigo-600 text-white', pill: 'bg-indigo-100 text-indigo-700' },
                        { bg: 'bg-emerald-50/70 border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-600 text-white', pill: 'bg-emerald-100 text-emerald-700' },
                        { bg: 'bg-amber-50/70 border-amber-200', text: 'text-amber-800', badge: 'bg-amber-600 text-white', pill: 'bg-amber-100 text-amber-700' },
                        { bg: 'bg-pink-50/70 border-pink-200', text: 'text-pink-800', badge: 'bg-pink-600 text-white', pill: 'bg-pink-100 text-pink-700' },
                        { bg: 'bg-sky-50/70 border-sky-200', text: 'text-sky-800', badge: 'bg-sky-600 text-white', pill: 'bg-sky-100 text-sky-700' },
                        { bg: 'bg-violet-50/70 border-violet-200', text: 'text-violet-800', badge: 'bg-violet-600 text-white', pill: 'bg-violet-100 text-violet-700' }
                      ];

                      return (
                        <div className="space-y-8 w-full">
                          {/* Ungrouped Ideas */}
                          <div>
                            <div className="flex items-center gap-3 mb-4">
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 animate-pulse" />
                              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                                Ideas Recibidas ({ungrouped.length})
                              </h4>
                            </div>
                            
                            {ungrouped.length === 0 ? (
                              <div className="p-8 border-2 border-dashed border-slate-100 rounded-[2rem] text-center text-slate-300 font-bold text-base">
                                Esperando ideas de los participantes...
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <AnimatePresence mode="popLayout">
                                  {ungrouped.map((idea) => {
                                    const isGrouping = groupingResponseId === idea.id;
                                    return (
                                      <motion.div
                                        key={idea.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                        className="bg-white p-5 rounded-2xl border border-slate-100 shadow-md hover:shadow-lg transition-all flex flex-col justify-between min-h-[140px] relative overflow-hidden"
                                      >
                                        {!isGrouping ? (
                                          <>
                                            <p className="text-slate-800 font-bold text-lg leading-snug mb-4">
                                              "{idea.text || idea.value}"
                                            </p>
                                            <div className="flex items-center justify-between mt-auto gap-2">
                                              <span className="text-xs font-black text-slate-400 uppercase tracking-wider truncate max-w-[150px]">
                                                👤 {idea.participantName}
                                              </span>
                                              <button
                                                onClick={() => {
                                                  setGroupingResponseId(idea.id);
                                                  setNewGroupNameInput('');
                                                }}
                                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-black rounded-lg transition-colors flex items-center gap-1 shrink-0"
                                              >
                                                <span>📂</span> Agrupar
                                              </button>
                                            </div>
                                          </>
                                        ) : (
                                          <div className="space-y-3 flex flex-col justify-between h-full w-full z-10 text-left">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Agrupar Idea</span>
                                              <button 
                                                onClick={() => setGroupingResponseId(null)}
                                                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-50"
                                              >
                                                <X className="w-4 h-4" />
                                              </button>
                                            </div>
                                            
                                            {/* Existing Groups */}
                                            {groups.length > 0 && (
                                              <div className="space-y-1">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Elegir existente:</p>
                                                <div className="flex flex-wrap gap-1 max-h-[70px] overflow-y-auto">
                                                  {groups.map((g) => (
                                                    <button
                                                      key={g}
                                                      onClick={() => groupIdea(activePoll.id, idea.id, g)}
                                                      className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-[11px] font-bold text-slate-700 rounded-md transition-colors truncate max-w-[120px]"
                                                    >
                                                      {g}
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                            
                                            {/* New Group input */}
                                            <div className="space-y-1.5">
                                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nuevo grupo:</p>
                                              <div className="flex gap-1.5">
                                                <input
                                                  type="text"
                                                  value={newGroupNameInput}
                                                  onChange={(e) => setNewGroupNameInput(e.target.value)}
                                                  placeholder="Nombre..."
                                                  className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-md bg-slate-50 outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && newGroupNameInput.trim()) {
                                                      groupIdea(activePoll.id, idea.id, newGroupNameInput);
                                                    }
                                                  }}
                                                />
                                                <button
                                                  onClick={() => {
                                                    if (newGroupNameInput.trim()) {
                                                      groupIdea(activePoll.id, idea.id, newGroupNameInput);
                                                    }
                                                  }}
                                                  className="px-2 py-1 bg-indigo-600 text-white rounded-md text-xs font-black hover:bg-indigo-700 transition-colors shrink-0"
                                                >
                                                  Crear
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </motion.div>
                                    );
                                  })}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>

                          {/* Grouped Categories */}
                          {groups.length > 0 && (
                            <div>
                              <div className="flex items-center gap-3 mb-4">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                                  Ideas Agrupadas / Categorías ({groups.length})
                                </h4>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {groups.map((groupName, idx) => {
                                  const groupColor = colors[idx % colors.length] || colors[0];
                                  const groupCards = grouped.filter(r => r.group === groupName);
                                  
                                  return (
                                    <motion.div
                                      key={groupName}
                                      initial={{ opacity: 0, y: 15 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className={`rounded-3xl border-2 ${groupColor.bg} p-6 shadow-md flex flex-col gap-4 relative`}
                                    >
                                      <div className="flex items-center justify-between border-b border-slate-200/30 pb-3">
                                        <div className="flex items-center gap-2">
                                          <span className={`px-2.5 py-1 ${groupColor.badge} text-[10px] font-black rounded-lg uppercase tracking-wider`}>
                                            Grupo {idx + 1}
                                          </span>
                                          <h5 className="font-black text-slate-900 text-base">{groupName}</h5>
                                        </div>
                                        <span className={`text-xs font-black ${groupColor.pill} px-2 py-0.5 rounded-full`}>
                                          {groupCards.length} {groupCards.length === 1 ? 'idea' : 'ideas'}
                                        </span>
                                      </div>
                                      
                                      <div className="flex flex-col gap-2.5 max-h-[250px] overflow-y-auto pr-1">
                                        <AnimatePresence mode="popLayout">
                                          {groupCards.map((card) => (
                                            <motion.div
                                              key={card.id}
                                              layout
                                              initial={{ opacity: 0, x: -10 }}
                                              animate={{ opacity: 1, x: 0 }}
                                              exit={{ opacity: 0, x: 10 }}
                                              className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex items-start justify-between gap-3 group/item hover:border-indigo-100 text-left"
                                            >
                                              <div className="flex flex-col gap-1 flex-1 min-w-0">
                                                <p className="text-slate-800 font-bold text-sm leading-snug">
                                                  "{card.text || card.value}"
                                                </p>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                  👤 {card.participantName}
                                                </span>
                                              </div>
                                              <button
                                                onClick={() => ungroupIdea(activePoll.id, card.id)}
                                                className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition-colors md:opacity-0 group-hover/item:opacity-100 shrink-0"
                                                title="Quitar del grupo"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </motion.div>
                                          ))}
                                        </AnimatePresence>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'word-cloud' ? (
                  <div className="flex flex-col gap-6 py-4 w-full">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      
                      // Calculate word frequency
                      const wordCounts: { [key: string]: { text: string; count: number } } = {};
                      qResponses.forEach(r => {
                        const rawWord = String(r.value || r.text || '').trim();
                        if (!rawWord) return;
                        const key = rawWord.toLowerCase();
                        if (wordCounts[key]) {
                          wordCounts[key].count++;
                        } else {
                          wordCounts[key] = { text: rawWord, count: 1 };
                        }
                      });
                      
                      const wordsArray = Object.values(wordCounts).sort((a, b) => b.count - a.count);
                      const maxCount = Math.max(...wordsArray.map(w => w.count), 1);
                      const totalWords = qResponses.length;

                      const colors = [
                        'text-indigo-500 hover:text-indigo-600',
                        'text-emerald-500 hover:text-emerald-600',
                        'text-rose-500 hover:text-rose-600',
                        'text-amber-500 hover:text-amber-600',
                        'text-sky-500 hover:text-sky-600',
                        'text-purple-500 hover:text-purple-600',
                        'text-violet-500 hover:text-violet-600',
                        'text-teal-500 hover:text-teal-600',
                      ];

                      const getWordStyle = (count: number, text: string) => {
                        const ratio = count / maxCount;
                        let sizeClass = 'text-base font-semibold opacity-70';
                        if (ratio > 0.8) {
                          sizeClass = 'text-4xl md:text-6xl font-black scale-105';
                        } else if (ratio > 0.5) {
                          sizeClass = 'text-2xl md:text-4xl font-extrabold opacity-95';
                        } else if (ratio > 0.25) {
                          sizeClass = 'text-lg md:text-2xl font-bold opacity-85';
                        }
                        
                        let colorClass = 'text-slate-600';
                        if (ratio > 0.8) {
                          colorClass = 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 animate-pulse';
                        } else {
                          let hash = 0;
                          for (let i = 0; i < text.length; i++) {
                            hash = text.charCodeAt(i) + ((hash << 5) - hash);
                          }
                          colorClass = colors[Math.abs(hash) % colors.length];
                        }

                        return `${sizeClass} ${colorClass}`;
                      };

                      if (totalWords === 0) {
                        return (
                          <div className="p-12 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center text-slate-300 font-bold text-lg">
                            Esperando palabras de los participantes...
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-6 w-full">
                          {/* Stats Header */}
                          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                              Nube de Palabras en Vivo
                            </span>
                            <div className="flex gap-4 text-xs font-black text-indigo-600 bg-indigo-50 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                              <span>{wordsArray.length} Palabras Únicas</span>
                              <span>•</span>
                              <span>{totalWords} Envíos</span>
                            </div>
                          </div>

                          {/* Cloud Canvas */}
                          <div className="bg-slate-50/50 border border-slate-100 rounded-[2.5rem] p-10 min-h-[350px] flex flex-wrap gap-x-8 gap-y-5 items-center justify-center relative overflow-hidden select-none">
                            <AnimatePresence mode="popLayout">
                              {wordsArray.map((item, idx) => (
                                <motion.span
                                  key={item.text}
                                  layout
                                  initial={{ opacity: 0, scale: 0.4 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.4 }}
                                  className={`inline-block transition-transform duration-300 hover:scale-110 cursor-default uppercase ${getWordStyle(item.count, item.text)}`}
                                  title={`${item.count} votos`}
                                >
                                  {item.text}
                                  {item.count > 1 && (
                                    <span className="ml-1 text-[10px] font-black tracking-normal px-1.5 py-0.5 bg-slate-200/60 rounded-full text-slate-600 align-super leading-none">
                                      {item.count}
                                    </span>
                                  )}
                                </motion.span>
                              ))}
                            </AnimatePresence>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'guess-name' ? (
                  <div className="flex flex-col lg:flex-row gap-8 py-4 w-full text-left items-stretch">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      
                      const correctGuesses = qResponses.filter(r => 
                        String(r.value || r.text || '').trim().toLowerCase() === String(currentQ?.correctAnswer || '').trim().toLowerCase()
                      ).length;
                      
                      const incorrectGuesses = qResponses.length - correctGuesses;
                      const pctCorrect = qResponses.length > 0 ? Math.round((correctGuesses / qResponses.length) * 100) : 0;
                      
                      return (
                        <>
                          {/* Left Panel: Image and Reveal Correct Answer */}
                          <div className="flex-1 bg-white p-8 rounded-[3.5rem] shadow-xl border-4 border-slate-50 flex flex-col justify-between min-h-[450px]">
                            <div>
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-black rounded-full uppercase tracking-widest mb-4 inline-block">
                                Imagen de Referencia
                              </span>
                              <div className="w-full h-80 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center relative mb-6">
                                {currentQ?.imageUrl ? (
                                  <img 
                                    src={currentQ.imageUrl} 
                                    alt="Guess Su Nombre" 
                                    className="w-full h-full object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="text-slate-300 text-sm font-bold">No hay imagen configurada</div>
                                )}
                              </div>
                            </div>
                            
                            <div className="border-t border-slate-100 pt-6">
                              <div className="flex items-center justify-between gap-4">
                                <button
                                  onClick={() => setRevealLiveAnswer(!revealLiveAnswer)}
                                  className={`px-6 py-3 rounded-2xl text-xs font-black tracking-wider uppercase transition-all shadow-md ${revealLiveAnswer ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                >
                                  {revealLiveAnswer ? 'Ocultar respuesta' : 'Revelar respuesta'}
                                </button>
                                
                                <AnimatePresence>
                                  {revealLiveAnswer && (
                                    <motion.div 
                                      initial={{ opacity: 0, scale: 0.9, x: 20 }}
                                      animate={{ opacity: 1, scale: 1, x: 0 }}
                                      exit={{ opacity: 0, scale: 0.9, x: 20 }}
                                      className="flex-1 bg-emerald-50 border border-emerald-200 px-5 py-3 rounded-2xl text-right"
                                    >
                                      <span className="text-[10px] font-black text-emerald-500 uppercase tracking-wider block leading-none mb-1">Nombre correcto</span>
                                      <span className="text-xl font-black text-emerald-700 uppercase tracking-tight">{currentQ?.correctAnswer}</span>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </div>

                          {/* Right Panel: Feed & Stats */}
                          <div className="w-full lg:w-[460px] flex flex-col gap-6">
                            {/* Stats */}
                            <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-2 border-slate-50 flex flex-col justify-between">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Estadísticas en tiempo real</span>
                              <div className="grid grid-cols-2 gap-4 text-center">
                                <div className="bg-emerald-50 border border-emerald-100/50 p-4 rounded-2xl">
                                  <span className="text-4xl font-black text-emerald-600 leading-none">{correctGuesses}</span>
                                  <span className="text-[10px] font-bold text-emerald-700 block uppercase tracking-wider mt-1">Aciertos</span>
                                </div>
                                <div className="bg-rose-50 border border-rose-100/50 p-4 rounded-2xl">
                                  <span className="text-4xl font-black text-rose-500 leading-none">{incorrectGuesses}</span>
                                  <span className="text-[10px] font-bold text-rose-600 block uppercase tracking-wider mt-1">Fallos</span>
                                </div>
                              </div>
                              {qResponses.length > 0 && (
                                <div className="mt-4">
                                  <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-1.5">
                                    <span>Tasa de éxito</span>
                                    <span className="text-indigo-600 font-black">{pctCorrect}%</span>
                                  </div>
                                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${pctCorrect}%` }} />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Live Feed */}
                            <div className="flex-1 bg-white p-6 rounded-[2.5rem] shadow-xl border-2 border-slate-50 flex flex-col min-h-[250px] max-h-[350px]">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Intentos recientes</span>
                              <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                                <AnimatePresence mode="popLayout">
                                  {qResponses.length === 0 ? (
                                    <div className="text-center text-slate-300 font-bold py-12 text-sm">Esperando respuestas...</div>
                                  ) : (
                                    qResponses.map((r, idx) => {
                                      const isCorrect = String(r.value || r.text || '').trim().toLowerCase() === String(currentQ?.correctAnswer || '').trim().toLowerCase();
                                      return (
                                        <motion.div 
                                          key={r.id}
                                          initial={{ opacity: 0, y: 10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-left ${isCorrect ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/30 border-rose-100'}`}
                                        >
                                          <div className="min-w-0">
                                            <p className="text-[10px] font-black text-slate-400 font-bold">👤 {r.participantName}</p>
                                            <p className={`text-sm font-black uppercase ${isCorrect ? 'text-emerald-700' : 'text-slate-700'}`}>"{r.value || r.text}"</p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100/50 text-rose-700'}`}>
                                              {isCorrect ? 'Correcto' : 'Fallo'}
                                            </span>
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteResponse(activePoll.id, r.id);
                                              }}
                                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                              title="Eliminar respuesta"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </motion.div>
                                      );
                                    })
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'complete-sequence' ? (
                  <div className="flex flex-col gap-8 py-4 w-full text-left">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      
                      const correctGuesses = qResponses.filter(r => 
                        String(r.value || r.text || '').trim().toLowerCase() === String(currentQ?.correctAnswer || '').trim().toLowerCase()
                      ).length;
                      const pctCorrect = qResponses.length > 0 ? Math.round((correctGuesses / qResponses.length) * 100) : 0;
                      
                      return (
                        <>
                          {/* Upper Panel: Sequence Chain visualization */}
                          <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border-4 border-slate-50 flex flex-col justify-between">
                            <div>
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-black rounded-full uppercase tracking-widest mb-6 inline-block">
                                Cadena de la secuencia
                              </span>
                              
                              <div className="flex flex-wrap items-center justify-center gap-4 py-8 bg-slate-50 rounded-3xl border border-slate-100 px-6">
                                {currentQ?.sequenceItems?.map((item, idx) => {
                                  const isMissing = idx === currentQ.sequenceMissingIndex;
                                  return (
                                    <React.Fragment key={idx}>
                                      {idx > 0 && (
                                        <span className="text-indigo-400 text-2xl font-black shrink-0">➔</span>
                                      )}
                                      <motion.div 
                                        layout
                                        className={`px-6 py-4 rounded-2xl border-2 shrink-0 flex flex-col items-center justify-center min-w-[120px] transition-all duration-500 shadow-sm ${isMissing ? (revealLiveAnswer ? 'bg-emerald-50 border-emerald-300 scale-105 shadow-emerald-100' : 'bg-indigo-50/50 border-dashed border-indigo-300 scale-95') : 'bg-white border-slate-200'}`}
                                      >
                                        <span className="text-[10px] font-bold text-slate-400 mb-1">POSICIÓN {idx + 1}</span>
                                        {isMissing ? (
                                          <AnimatePresence mode="wait">
                                            {revealLiveAnswer ? (
                                              <motion.span 
                                                key="correct"
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                className="text-base font-black text-emerald-700 uppercase"
                                              >
                                                {item}
                                              </motion.span>
                                            ) : (
                                              <motion.span 
                                                key="missing"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="text-lg font-black text-indigo-500 tracking-widest"
                                              >
                                                ? ? ?
                                              </motion.span>
                                            )}
                                          </AnimatePresence>
                                        ) : (
                                          <span className="text-base font-extrabold text-slate-700">{item}</span>
                                        )}
                                      </motion.div>
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-6">
                              <button
                                onClick={() => setRevealLiveAnswer(!revealLiveAnswer)}
                                className={`px-6 py-3 rounded-2xl text-xs font-black tracking-wider uppercase transition-all shadow-md ${revealLiveAnswer ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                              >
                                {revealLiveAnswer ? 'Ocultar elemento' : 'Revelar elemento'}
                              </button>
                              
                              <div className="flex gap-4 text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl">
                                <span>{qResponses.length} RESPUESTAS</span>
                                <span>•</span>
                                <span>{pctCorrect}% ACIERTO</span>
                              </div>
                            </div>
                          </div>

                          {/* Lower Panel: Guesses List */}
                          <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-2 border-slate-50 flex flex-col min-h-[250px]">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Feed en vivo de participantes</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              <AnimatePresence mode="popLayout">
                                {qResponses.length === 0 ? (
                                  <div className="col-span-full text-center text-slate-300 font-bold py-12">Esperando respuestas en tiempo real...</div>
                                ) : (
                                  qResponses.map((r) => {
                                    const isCorrect = String(r.value || r.text || '').trim().toLowerCase() === String(currentQ?.correctAnswer || '').trim().toLowerCase();
                                    return (
                                      <motion.div 
                                        key={r.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className={`p-4 rounded-2xl border text-left flex items-center justify-between gap-3 ${isCorrect ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/30 border-rose-100'}`}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-[9px] font-black text-slate-400">👤 {r.participantName}</p>
                                          <p className={`text-sm font-black uppercase truncate ${isCorrect ? 'text-emerald-700' : 'text-slate-600'}`}>
                                            {r.value || r.text}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className={`w-2 h-2 rounded-full ${isCorrect ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteResponse(activePoll.id, r.id);
                                            }}
                                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            title="Eliminar respuesta"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </motion.div>
                                    );
                                  })
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id))?.type === 'open-ended' ? (
                  <div className="grid gap-6 auto-rows-min grid-cols-1 md:grid-cols-2 lg:grid-cols-3 py-4 w-full text-left">
                    {(() => {
                      const currentQ = questions.find(q => q.id === (activePoll.currentQuestionId || questions[0]?.id));
                      const qResponses = responses.filter(r => r.questionId === currentQ?.id);
                      
                      if (qResponses.length === 0) {
                        return (
                          <div className="col-span-full p-12 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center text-slate-300 font-bold text-lg w-full">
                            Esperando respuestas abiertas de los participantes...
                          </div>
                        );
                      }

                      return (
                        <AnimatePresence mode="popLayout">
                          {qResponses
                            .sort((a, b) => b.createdAt - a.createdAt)
                            .map((response, idx) => (
                              <motion.div 
                                key={response.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                                transition={{ 
                                  type: "spring", 
                                  stiffness: 260, 
                                  damping: 25 
                                }}
                                className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-100/40 border-2 border-slate-50 flex flex-col justify-between min-h-[150px] relative overflow-hidden group hover:border-indigo-100 transition-all"
                              >
                                <p className="text-slate-800 font-extrabold leading-relaxed text-lg mb-4">
                                  "{response.text || response.value}"
                                </p>
                                <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-auto">
                                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest truncate max-w-[150px]">
                                    👤 {response.participantName}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-300">
                                      #{qResponses.length - idx}
                                    </span>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteResponse(activePoll.id, response.id);
                                      }}
                                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                      title="Eliminar respuesta"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                        </AnimatePresence>
                      );
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
                          className="group bg-white p-6 rounded-3xl shadow-xl shadow-indigo-100/40 border-2 border-indigo-50 flex flex-col min-h-[140px] relative overflow-hidden"
                        >
                          <motion.div 
                            initial={{ opacity: 0.6, scale: 0.8 }}
                            animate={{ opacity: 0, scale: 2 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute inset-0 bg-indigo-200 z-0 pointer-events-none rounded-3xl"
                          />
                          <div className="relative z-10">
                            <div className="absolute -top-2 -right-2 z-20">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteResponse(activePoll.id, response.id);
                                }}
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                                title="Eliminar respuesta"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
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

      <AnimatePresence>
        {showDeleteConfirm && pollToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100"
            >
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Mover a la papelera</h2>
              <p className="text-slate-500 mb-8">
                ¿Estás seguro que deseas mover el evento <strong className="text-slate-900">{pollToDelete.title}</strong> a la papelera? Podrás restaurarlo más tarde si lo deseas.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setPollToDelete(null); }}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deletePollToTrash(pollToDelete);
                    setShowDeleteConfirm(false);
                    setPollToDelete(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
                >
                  Mover a papelera
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPermanentDeleteConfirm && pollToPermanentDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-2 border-rose-100"
            >
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-rose-600 mb-2">Eliminar permanentemente</h2>
              <p className="text-slate-600 mb-8 font-medium">
                Esta acción <strong className="text-slate-900">no se puede deshacer</strong>. Se eliminará el evento "{pollToPermanentDelete.title}" y todos sus datos de forma permanente.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => { setShowPermanentDeleteConfirm(false); setPollToPermanentDelete(null); }}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    permanentlyDeletePoll(pollToPermanentDelete);
                    setShowPermanentDeleteConfirm(false);
                    setPollToPermanentDelete(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
                >
                  Eliminar evento
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
