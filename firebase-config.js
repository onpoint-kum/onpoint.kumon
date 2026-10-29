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

  // Login com Google: Nativo no Android (sem Chrome) / Popup na Web
  async loginWithGoogle() {
    if (!this.auth) {
      this.init();
    }
    if (!this.auth) throw new Error('Firebase Auth não disponível.');

    // 1. Verifica se está rodando dentro do App Android Nativo (Capacitor)
    const isCapacitorNative = Boolean(
      window.Capacitor && (
        (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.Capacitor.getPlatform() === 'android'
      )
    );

    const googleAuthPlugin = window.Capacitor?.Plugins?.GoogleAuth;

    if (isCapacitorNative && googleAuthPlugin) {
      console.log('Kumon Onpoint: Executando login Google nativo embutido no Android...');
      try {
        // Inicializa com o Client ID Web do Firebase
        try {
          await googleAuthPlugin.initialize({
            clientId: '1018160708137-4lg2h422et0rbrvfi8162a4bctkn8s4b.apps.googleusercontent.com',
            scopes: ['profile', 'email'],
            grantOfflineAccess: true
          });
        } catch (initErr) {
          console.warn('Aviso na inicialização do GoogleAuth:', initErr);
        }

        // Abre o seletor nativo de contas do sistema Android (sem abrir Chrome!)
        const googleUser = await googleAuthPlugin.signIn();
        console.log('Login Google nativo obteve usuário:', googleUser?.email);

        const idToken = googleUser?.authentication?.idToken || googleUser?.idToken;
        if (!idToken) {
          throw new Error('Não foi possível obter a credencial nativa do Google.');
        }

        // Credencia o usuário no Firebase com o ID Token nativo retornado pelo Android
        const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
        const result = await this.auth.signInWithCredential(credential);
        return result.user;
      } catch (nativeErr) {
        console.error('Falha no login Google nativo:', nativeErr);
        const errMsg = String(nativeErr?.message || nativeErr || '');
        if (errMsg.includes('cancel') || errMsg.includes('12501')) {
          throw new Error('Login cancelado pelo usuário.');
        }
        // Se der erro de configuração (ex: 10 / DEVELOPER_ERROR), tenta fallback para web popup
        console.warn('Tentando fallback para popup web...', nativeErr);
      }
    }

    // 2. Fluxo Web padrão (Navegador desktop, Vercel ou fallback)
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

    // Desconecta da sessão nativa do Google Play Services no Android se aplicável
    if (window.Capacitor?.Plugins?.GoogleAuth) {
      try {
        await window.Capacitor.Plugins.GoogleAuth.signOut();
      } catch (e) {
        console.warn('Aviso ao deslogar da conta Google nativa:', e);
      }
    }

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
