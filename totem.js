// totem.js - Lógica Dedicada do Totem Kiosk do Kumon Onpoint
const TotemState = {
  students: [],
  attendances: [],
  html5QrCode: null,
  isCameraActive: false,
  isProcessingScan: false,
  recentScans: new Map(),
  currentCameraId: null,
  availableCameras: []
};

document.addEventListener('DOMContentLoaded', async () => {
  initTotemClock();
  initTotemModalDismiss();
  initTotemAuth();
});

// Relógio e Data ao Vivo Compactos (Não estoura telas estreitas)
function initTotemClock() {
  const clockEl = document.getElementById('totemLiveClock');
  const dateEl = document.getElementById('totemLiveDate');

  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    if (clockEl) clockEl.textContent = `${h}:${m}:${s}`;

    if (dateEl) {
      const day = String(now.getDate()).padStart(2, '0');
      const wName = weekdays[now.getDay()];
      const mName = months[now.getMonth()];
      dateEl.textContent = `${wName}, ${day} ${mName}`;
    }
  }

  update();
  setInterval(update, 1000);
}

// Fechamento rápido de modais ao tocar na tela
function initTotemModalDismiss() {
  document.getElementById('totemFeedbackOverlay')?.addEventListener('click', resetTotemFeedbackToIdle);
  document.getElementById('totemErrorOverlay')?.addEventListener('click', resetTotemFeedbackToIdle);
}

// Inicialização e autenticação no Totem
function initTotemAuth() {
  KumonFirebase.init();
  const authModal = document.getElementById('totemAuthModalOverlay');
  const btnGoogleLogin = document.getElementById('btnTotemGoogleLogin');

  btnGoogleLogin?.addEventListener('click', async () => {
    try {
      await KumonFirebase.loginWithGoogle();
    } catch (e) {
      alert('Erro ao conectar com Google: ' + (e.message || e));
    }
  });

  document.getElementById('btnGoTeacherArea')?.addEventListener('click', () => {
    sessionStorage.setItem('kumon_teacher_mode', 'true');
  });

  KumonFirebase.onAuthChange(async ({ user }) => {
    if (user) {
      authModal?.classList.remove('active');
      const statusEl = document.getElementById('totemFirebaseStatus');
      if (statusEl) statusEl.textContent = 'Totem Conectado';
      initTotemFirestoreListeners();
      initTotemCamera();
      initTotemManualInput();
    } else {
      authModal?.classList.add('active');
      const statusEl = document.getElementById('totemFirebaseStatus');
      if (statusEl) statusEl.textContent = 'Aguardando Ativação';
    }
  });
}

function initTotemFirestoreListeners() {
  if (!KumonFirebase.db) return;

  // 1. Alunos em tempo real
  KumonFirebase.db.collection('kumon_students')
    .onSnapshot((snapshot) => {
      TotemState.students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }, err => console.error('Erro ao ouvir alunos no Totem:', err));

  // 2. Frequência / Presença de hoje
  const todayStr = getTodayDateStr();
  KumonFirebase.db.collection('kumon_attendance')
    .where('date', '==', todayStr)
    .onSnapshot((snapshot) => {
      TotemState.attendances = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateTotemCounters();
    }, err => console.error('Erro ao ouvir presenças no Totem:', err));
}

function updateTotemCounters() {
  const inRoom = TotemState.attendances.filter(a => a.status === 'in');
  const liveCountEl = document.getElementById('totemLiveCount');
  const todayCountEl = document.getElementById('totemTodayCount');

  if (liveCountEl) liveCountEl.textContent = inRoom.length;
  if (todayCountEl) todayCountEl.textContent = TotemState.attendances.length;
}

// Inicializa a câmera do Totem
async function initTotemCamera() {
  const btnSwitch = document.getElementById('btnTotemSwitchCam');
  btnSwitch?.addEventListener('click', switchTotemCamera);

  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length) {
      TotemState.availableCameras = devices;
      // Prefere câmera frontal se disponível para tablets, ou a primeira encontrada
      const frontCam = devices.find(d => 
        d.label.toLowerCase().includes('front') || 
        d.label.toLowerCase().includes('user') ||
        d.label.toLowerCase().includes('frontal')
      );
      TotemState.currentCameraId = frontCam ? frontCam.id : devices[0].id;

      if (devices.length > 1 && btnSwitch) {
        btnSwitch.style.display = 'inline-flex';
      }

      startTotemCamera();
    } else {
      showCameraPlaceholder('Nenhuma câmera encontrada. Use o ID manual 👇');
    }
  } catch (e) {
    console.warn('Erro ao buscar câmeras do totem:', e);
    showCameraPlaceholder('Câmera indisponível. Use o ID manual 👇');
  }
}

function showCameraPlaceholder(text) {
  const placeholder = document.getElementById('totemCamPlaceholder');
  if (placeholder) {
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<span style="font-size: 1.8rem; display: block; margin-bottom: 6px;">📷</span>${text}`;
  }
}

async function startTotemCamera() {
  if (TotemState.isCameraActive) return;
  try {
    if (!TotemState.html5QrCode) {
      TotemState.html5QrCode = new Html5Qrcode("reader");
    }

    const config = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const edge = Math.max(160, Math.floor(minEdge * 0.72));
        return { width: edge, height: edge };
      },
      aspectRatio: 1.0
    };

    const camConfig = TotemState.currentCameraId 
      ? TotemState.currentCameraId 
      : { facingMode: "user" };

    await TotemState.html5QrCode.start(
      camConfig,
      config,
      (decodedText) => handleTotemScan(decodedText, 'camera'),
      () => {}
    );

    TotemState.isCameraActive = true;
    const placeholder = document.getElementById('totemCamPlaceholder');
    if (placeholder) placeholder.style.display = 'none';

  } catch (err) {
    console.error('Erro ao iniciar câmera no Totem:', err);
    showCameraPlaceholder('Permissão de câmera negada. Use o ID manual 👇');
  }
}

async function stopTotemCamera() {
  if (!TotemState.isCameraActive || !TotemState.html5QrCode) return;
  try {
    await TotemState.html5QrCode.stop();
    TotemState.isCameraActive = false;
  } catch (e) {}
}

async function switchTotemCamera() {
  if (TotemState.availableCameras.length < 2) return;
  const currentIdx = TotemState.availableCameras.findIndex(d => d.id === TotemState.currentCameraId);
  const nextIdx = (currentIdx + 1) % TotemState.availableCameras.length;
  TotemState.currentCameraId = TotemState.availableCameras[nextIdx].id;

  if (TotemState.isCameraActive) {
    await stopTotemCamera();
    await startTotemCamera();
  }
}

// Digitação manual por KumonID
function initTotemManualInput() {
  const form = document.getElementById('formTotemManualId');
  const input = document.getElementById('inputTotemManualId');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    let val = (input?.value || '').trim();
    if (!val) return;

    // Se o usuário digitou apenas números (ex: "1" ou "3"), auto-formata para "KUM-0001"
    if (/^\d+$/.test(val)) {
      val = `KUM-${val.padStart(4, '0')}`;
    }

    handleTotemScan(val, 'manual');
    if (input) input.value = '';
  });
}

// Processa o ponto no Totem (Check-in / Check-out com feedback imediato)
async function handleTotemScan(scannedId, source = 'manual') {
  if (!scannedId) return;
  const cleanId = scannedId.trim().toUpperCase();

  if (TotemState.isProcessingScan) return;

  const now = Date.now();
  const lastScan = TotemState.recentScans.get(cleanId) || 0;
  if (source === 'camera' && (now - lastScan < 8000)) {
    return; // Cooldown de 8 segundos para a mesma leitura consecutiva
  }

  TotemState.isProcessingScan = true;
  TotemState.recentScans.set(cleanId, now);

  const guide = document.getElementById('totemScanGuide');
  if (guide) guide.classList.add('totem-scan-success-flash');

  const unlockTotemAfterDelay = (ms = 3500) => {
    setTimeout(() => {
      TotemState.isProcessingScan = false;
      if (guide) guide.classList.remove('totem-scan-success-flash');
      resetTotemFeedbackToIdle();
    }, ms);
  };

  // Encontra o aluno
  const student = TotemState.students.find(s => s.kumonId.toUpperCase() === cleanId);
  if (!student) {
    if (window.kumonAudio) window.kumonAudio.playAlert();
    showTotemError(`KumonID "${cleanId}" não encontrado.`);
    unlockTotemAfterDelay(3000);
    return;
  }

  const todayStr = getTodayDateStr();
  const timeStr = getCurrentTimeStr();

  // Verifica se o aluno já tem registro em aberto hoje
  const openRecord = TotemState.attendances.find(a => 
    a.kumonId === student.kumonId && 
    a.date === todayStr && 
    a.status === 'in'
  );

  if (openRecord) {
    // --- REGISTRAR SAÍDA ---
    const diffSec = calcDurationSec(openRecord.checkInTime, timeStr);
    if (diffSec < 20) {
      // Evita saída instantânea acidental logo após a entrada
      unlockTotemAfterDelay(1500);
      return;
    }

    const durationMin = calcDurationMin(openRecord.checkInTime, timeStr);

    if (KumonFirebase.db && openRecord.id) {
      await KumonFirebase.db.collection('kumon_attendance').doc(openRecord.id).update({
        checkOutTime: timeStr,
        durationMinutes: durationMin,
        status: 'out',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    if (window.kumonAudio) window.kumonAudio.playCheckOut();
    showTotemSuccess(student, 'out', openRecord.checkInTime, timeStr, durationMin);
    unlockTotemAfterDelay(3500);

  } else {
    // --- REGISTRAR ENTRADA ---
    const newRecord = {
      kumonId: student.kumonId,
      studentName: student.name,
      subjects: student.subjects || [],
      date: todayStr,
      checkInTime: timeStr,
      checkOutTime: null,
      durationMinutes: null,
      status: 'in',
      teacherName: student.orientador || 'Orientador(a)',
      homeworkStatus: 'Pendente',
      homeworkNote: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (KumonFirebase.db) {
      await KumonFirebase.db.collection('kumon_attendance').add(newRecord);
    }

    if (window.kumonAudio) window.kumonAudio.playCheckIn();
    showTotemSuccess(student, 'in', timeStr, null, null);
    unlockTotemAfterDelay(3500);
  }
}

// Modal de feedback de sucesso (Check-in / Check-out)
function showTotemSuccess(student, type, checkInTime, checkOutTime, durationMinutes) {
  const overlay = document.getElementById('totemFeedbackOverlay');
  const avatarEl = document.getElementById('totemSuccessAvatar');
  const badgeEl = document.getElementById('totemSuccessBadge');
  const nameEl = document.getElementById('totemSuccessName');
  const idEl = document.getElementById('totemSuccessId');
  const detailEl = document.getElementById('totemSuccessDetail');
  const subjectsEl = document.getElementById('totemSuccessSubjects');

  if (avatarEl) avatarEl.textContent = student.avatar || (student.isAdult ? '🧑' : '👦');
  if (nameEl) nameEl.textContent = student.name;
  if (idEl) idEl.textContent = `ID: ${student.kumonId}`;

  if (type === 'in') {
    if (badgeEl) {
      badgeEl.className = 'totem-popup-badge-in';
      badgeEl.textContent = '🟢 ENTRADA REGISTRADA!';
    }
    if (detailEl) detailEl.innerHTML = `👋 Seja muito bem-vindo(a)!<br>Horário de Entrada: <strong>${checkInTime}</strong>`;
  } else {
    if (badgeEl) {
      badgeEl.className = 'totem-popup-badge-out';
      badgeEl.textContent = '🔴 SAÍDA REGISTRADA!';
    }
    if (detailEl) detailEl.innerHTML = `Até a próxima aula! 👋<br>Entrada: <strong>${checkInTime}</strong> • Saída: <strong>${checkOutTime}</strong> (${durationMinutes} min de aula)`;
  }

  if (subjectsEl) {
    subjectsEl.innerHTML = (student.subjects || []).map(s => {
      let bg = '#E0F2FE';
      let col = '#0284C7';
      if (s === 'Português') { bg = '#FEF3C7'; col = '#B45309'; }
      else if (s === 'Inglês') { bg = '#FFEDD5'; col = '#C2410C'; }
      return `<span style="display:inline-block; padding: 2px 8px; border-radius: 999px; font-weight: 800; font-size: 0.75rem; background: ${bg}; color: ${col}; border: 1.5px solid #0B2545;">${s}</span>`;
    }).join('');
  }

  overlay?.classList.add('active');
}

// Modal de erro
function showTotemError(msg) {
  const overlay = document.getElementById('totemErrorOverlay');
  const msgEl = document.getElementById('totemErrorMessage');
  if (msgEl) msgEl.textContent = msg;
  overlay?.classList.add('active');
}

// Reseta e esconde os modais de feedback
function resetTotemFeedbackToIdle() {
  document.getElementById('totemFeedbackOverlay')?.classList.remove('active');
  document.getElementById('totemErrorOverlay')?.classList.remove('active');
}

// Utilitários de data e hora
function getTodayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCurrentTimeStr() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function calcDurationSec(time1, time2) {
  if (!time1 || !time2) return 0;
  const [h1, m1, s1 = 0] = time1.split(':').map(Number);
  const [h2, m2, s2 = 0] = time2.split(':').map(Number);
  return Math.max(0, ((h2 * 3600) + (m2 * 60) + s2) - ((h1 * 3600) + (m1 * 60) + s1));
}

function calcDurationMin(time1, time2) {
  const sec = calcDurationSec(time1, time2);
  return Math.max(1, Math.round(sec / 60));
}
