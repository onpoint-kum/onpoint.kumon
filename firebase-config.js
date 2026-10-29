// firebase-config.js - Configuração e Serviços do Firebase para o Kumon Onpoint

// Configuração oficial do projeto Firebase Kumon Onpoint
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCKYAYbR_R9FCpwZsese14AxRVihH4Iges",
  authDomain: "kumon-onpoint.firebaseapp.com",
  projectId: "kumon-onpoint",
  storageBucket: "kumon-onpoint.firebasestorage.app",
  messagingSenderId: "1018160708137",
  appId: "1:1018160708137:web:c6d225dd5f467cadf5fa38",
  measurementId: "G-N6WVDM0W7D"
};

// Carrega configuração salva no localStorage ou usa a padrão
function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('kumon_onpoint_firebase_config');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Erro ao carregar config personalizada do Firebase', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

const KumonFirebase = {
  auth: null,
  db: null,
  isInitialized: false,
  currentUser: null,
  currentTeacher: null,
  unsubscribers: [],

  // Inicializa o Firebase
  init() {
    if (typeof firebase === 'undefined') {
      console.warn('SDK do Firebase não foi carregado.');
      return false;
    }

    try {
      const config = getActiveFirebaseConfig();
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      
      // Habilita persistência offline do Firestore se disponível
      this.db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('Persistência offline do Firestore: múltiplas abas abertas.');
        } else if (err.code === 'unimplemented') {
          console.warn('Persistência offline não suportada neste navegador.');
        }
      });

      this.isInitialized = true;
      console.log('Kumon Onpoint: Firebase inicializado com sucesso!');
      return true;
    } catch (e) {
      console.error('Falha ao inicializar Firebase:', e);
      return false;
    }
  },

  // Login com Google via Popup ou Redirecionamento
  async loginWithGoogle() {
    if (!this.auth) {
      this.init();
    }
    if (!this.auth) throw new Error('Firebase Auth não disponível.');

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await this.auth.signInWithPopup(provider);
      return result.user;
    } catch (error) {
      console.warn('Popup falhou ou foi bloqueado, tentando redirect...', error);
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
        return await this.auth.signInWithRedirect(provider);
      }
      throw error;
    }
  },

  // Logout
  async logout() {
    if (!this.auth) return;
    this.cleanupListeners();
    await this.auth.signOut();
    this.currentUser = null;
    this.currentTeacher = null;
  },

  // Observador de estado de autenticação
  onAuthChange(callback) {
    if (!this.auth) this.init();
    if (!this.auth) return;
    
    return this.auth.onAuthStateChanged(async (user) => {
      this.currentUser = user;
      if (user) {
        // Busca perfil do professor no Firestore
        const teacherProfile = await this.getTeacherProfile(user.uid);
        this.currentTeacher = teacherProfile;
        callback({ user, teacher: teacherProfile });
      } else {
        this.currentTeacher = null;
        callback({ user: null, teacher: null });
      }
    });
  },

  // Buscar perfil do professor
  async getTeacherProfile(uid) {
    if (!this.db) return null;
    try {
      const doc = await this.db.collection('kumon_teachers').doc(uid).get();
      if (doc.exists) {
        return { uid, ...doc.data() };
      }
      return null;
    } catch (e) {
      console.error('Erro ao buscar perfil do professor:', e);
      return null;
    }
  },

  // Salvar / atualizar perfil do professor
  async saveTeacherProfile(uid, profileData) {
    if (!this.db) throw new Error('Firestore não inicializado.');
    const dataToSave = {
      ...profileData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await this.db.collection('kumon_teachers').doc(uid).set(dataToSave, { merge: true });
    this.currentTeacher = { uid, ...profileData };
    return this.currentTeacher;
  },

  // Limpa ouvintes em tempo real
  cleanupListeners() {
    this.unsubscribers.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribers = [];
  },

  DEFAULT_CONFIG: DEFAULT_FIREBASE_CONFIG,

  getActiveConfig: getActiveFirebaseConfig,

  saveCustomConfig(configObj) {
    localStorage.setItem('kumon_onpoint_firebase_config', JSON.stringify(configObj));
  },

  resetDefaultConfig() {
    localStorage.removeItem('kumon_onpoint_firebase_config');
  }
};

window.KumonFirebase = KumonFirebase;
