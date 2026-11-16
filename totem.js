// totem.js - Lógica Dedicada do Totem Kiosk do Kumon Onpoint
const TotemState = {
  students: [],
  teachers: [],
  attendances: [],
  teacherAttendances: [],
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

function isDevAccount(nameOrEmail) {
  if (!nameOrEmail) return false;
  const str = String(nameOrEmail).toLowerCase().trim();
  if (str === 'kotundashed.kiomi@gmail.com') return true;
  if (str === 'dev joão' || str === 'dev joao' || str.startsWith('dev ')) return true;
  return false;
}

function initTotemFirestoreListeners() {
  if (!KumonFirebase.db) return;

  // 1. Alunos em tempo real (Ordenados em ordem alfabética)
  KumonFirebase.db.collection('kumon_students')
    .onSnapshot((snapshot) => {
      TotemState.students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      TotemState.students.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
    }, err => console.error('Erro ao ouvir alunos no Totem:', err));

  // 2. Frequência / Presença dos alunos hoje
  const todayStr = getTodayDateStr();
  KumonFirebase.db.collection('kumon_attendance')
    .where('date', '==', todayStr)
    .onSnapshot((snapshot) => {
      TotemState.attendances = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateTotemCounters();
    }, err => console.error('Erro ao ouvir presenças no Totem:', err));

  // 3. Professores Oficiais cadastrados (kumon_teachers)
  KumonFirebase.db.collection('kumon_teachers')
    .onSnapshot((snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => t.isRegistered && !isDevAccount(t.email) && !isDevAccount(t.nickname));

      // Garante teacherId no formato PROF-XXXX
      let nextId = 1;
      list.forEach((t) => {
        if (!t.teacherId) {
          t.teacherId = `PROF-${String(nextId).padStart(4, '0')}`;
        }
        nextId++;
      });
      TotemState.teachers = list;
    }, err => console.error('Erro ao ouvir professores no Totem:', err));

  // 4. Ponto dos Professores hoje (kumon_teacher_attendance)
  KumonFirebase.db.collection('kumon_teacher_attendance')
    .where('date', '==', todayStr)
    .onSnapshot((snapshot) => {
      TotemState.teacherAttendances = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateTotemCounters();
    }, err => console.error('Erro ao ouvir ponto de professores no Totem:', err));
}

function updateTotemCounters() {
  const inRoom = TotemState.attendances.filter(a => a.status === 'in');
  const teachersInRoom = (TotemState.teacherAttendances || []).filter(a => a.status === 'in');

  const liveCountEl = document.getElementById('totemLiveCount');
  const todayCountEl = document.getElementById('totemTodayCount');
  const teacherCountEl = document.getElementById('totemTeacherCount');
  const teacherStatPill = document.getElementById('totemTeacherStatPill');

  if (liveCountEl) liveCountEl.textContent = inRoom.length;
  if (todayCountEl) todayCountEl.textContent = TotemState.attendances.length;
  if (teacherCountEl) teacherCountEl.textContent = teachersInRoom.length;
  if (teacherStatPill) {
    teacherStatPill.style.display = teachersInRoom.length > 0 ? 'inline-flex' : 'none';
  }
}

let isSwitchingTotemCamera = false;

// Inicializa a câmera do Totem — Sempre prioriza a traseira e abre automaticamente
async function initTotemCamera() {
  const btnSwitch = document.getElementById('btnTotemSwitchCam');
  btnSwitch?.removeEventListener('click', switchTotemCamera);
  btnSwitch?.addEventListener('click', switchTotemCamera);

  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length) {
      TotemState.availableCameras = devices;

      // Prioriza câmera traseira/ambiente (back/rear/traseira/environment)
      const backCam = devices.find(d => {
        const lbl = (d.label || '').toLowerCase();
        return lbl.includes('back') || 
               lbl.includes('rear') || 
               lbl.includes('traseira') || 
               lbl.includes('environment') || 
               lbl.includes('ambiente') ||
               lbl.includes('externa');
      });

      // Se achou traseira usa ela; senão pega a última (na maioria dos dispositivos móveis a traseira é a última)
      TotemState.currentCameraId = backCam ? backCam.id : devices[devices.length - 1].id;

      if (devices.length > 1 && btnSwitch) {
        btnSwitch.style.display = 'inline-flex';
      }

      await startTotemCamera();
    } else {
      // Fallback: tenta iniciar diretamente com facingMode environment
      await startTotemCamera();
    }
  } catch (e) {
    console.warn('Erro ao buscar câmeras do totem, tentando modo padrão:', e);
    await startTotemCamera();
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

    // Sempre prioriza a câmera traseira (environment)
    const camConfig = TotemState.currentCameraId 
      ? TotemState.currentCameraId 
      : { facingMode: { ideal: "environment" } };

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
    TotemState.isCameraActive = false;
    showCameraPlaceholder('Câmera indisponível ou permissão pendente. Use o ID manual 👇');
  }
}

async function stopTotemCamera() {
  if (!TotemState.html5QrCode) return;
  try {
    if (TotemState.isCameraActive) {
      await TotemState.html5QrCode.stop();
    }
  } catch (e) {
    console.warn('Aviso ao parar câmera do totem:', e);
  } finally {
    TotemState.isCameraActive = false;
  }
}

async function switchTotemCamera() {
  if (isSwitchingTotemCamera) return;
  if (!TotemState.availableCameras || TotemState.availableCameras.length < 2) {
    // Se ainda não tinha lista completa de câmeras, tenta buscar agora
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 1) {
        TotemState.availableCameras = devices;
      } else {
        return;
      }
    } catch (e) {
      return;
    }
  }

  isSwitchingTotemCamera = true;
  const btnSwitch = document.getElementById('btnTotemSwitchCam');
  if (btnSwitch) {
    btnSwitch.disabled = true;
    btnSwitch.textContent = '⏳ Invertendo...';
  }

  try {
    const currentIdx = TotemState.availableCameras.findIndex(d => d.id === TotemState.currentCameraId);
    const nextIdx = (currentIdx + 1) % TotemState.availableCameras.length;
    TotemState.currentCameraId = TotemState.availableCameras[nextIdx].id;

    // Para o stream anterior e aguarda 350ms para liberação limpa do hardware pelo navegador
    await stopTotemCamera();
    await new Promise(res => setTimeout(res, 350));

    // Reinicia com a nova câmera
    await startTotemCamera();
  } catch (err) {
    console.error('Erro ao inverter câmera no totem:', err);
  } finally {
    isSwitchingTotemCamera = false;
    if (btnSwitch) {
      btnSwitch.disabled = false;
      btnSwitch.textContent = '🔄 Alternar Câmera';
    }
  }
}

// Digitação manual por ID (Aluno KUM-XXXX ou Professor PROF-XXXX)
function initTotemManualInput() {
  const form = document.getElementById('formTotemManualId');
  const input = document.getElementById('inputTotemManualId');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    let val = (input?.value || '').trim();
    if (!val) return;

    // Se o usuário digitou prefixos de professor (ex: p1, prof-1, prof1)
    if (/^[pP](\d+)$/.test(val)) {
      const num = val.replace(/^[pP]/, '');
      val = `PROF-${num.padStart(4, '0')}`;
    } else if (/^[pP][rR][oO][fF]-?(\d+)$/.test(val)) {
      const match = val.match(/^[pP][rR][oO][fF]-?(\d+)$/);
      val = `PROF-${match[1].padStart(4, '0')}`;
    } else if (/^\d+$/.test(val)) {
      // Se digitou apenas números (ex: "1" ou "3"), auto-formata para "KUM-0001" (aluno)
      val = `KUM-${val.padStart(4, '0')}`;
    }

    handleTotemScan(val, 'manual');
    if (input) input.value = '';
  });
}

// Processa o ponto no Totem (Check-in / Check-out tanto para Alunos quanto para Professores)
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

  const todayStr = getTodayDateStr();
  const timeStr = getCurrentTimeStr();

  // 1. VERIFICAÇÃO DE PROFESSOR / ORIENTADOR
  const teacher = (TotemState.teachers || []).find(t => 
    (t.teacherId && t.teacherId.toUpperCase() === cleanId) ||
    (t.email && t.email.toUpperCase() === cleanId) ||
    (t.id && t.id.toUpperCase() === cleanId)
  );

  if (teacher) {
    const openTeacherRecord = (TotemState.teacherAttendances || []).find(a => 
      (a.teacherId === teacher.teacherId || (teacher.email && a.email === teacher.email)) && 
      a.date === todayStr && 
      a.status === 'in'
    );

    if (openTeacherRecord) {
      // --- SAÍDA DO PROFESSOR ---
      const diffSec = calcDurationSec(openTeacherRecord.checkInTime, timeStr);
      if (diffSec < 20) {
        unlockTotemAfterDelay(1500);
        return;
      }

      const durationMin = calcDurationMin(openTeacherRecord.checkInTime, timeStr);

      if (KumonFirebase.db && openTeacherRecord.id) {
        await KumonFirebase.db.collection('kumon_teacher_attendance').doc(openTeacherRecord.id).update({
          checkOutTime: timeStr,
          durationMinutes: durationMin,
          status: 'out',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      if (window.kumonAudio) window.kumonAudio.playCheckOut();
      showTotemTeacherSuccess(teacher, 'out', openTeacherRecord.checkInTime, timeStr, durationMin);
      unlockTotemAfterDelay(3500);
      return;
    } else {
      // --- ENTRADA DO PROFESSOR ---
      const newTeacherRecord = {
        teacherId: teacher.teacherId,
        teacherName: teacher.nickname || teacher.fullName || 'Orientador(a)',
        fullName: teacher.fullName || teacher.nickname || 'Orientador(a)',
        email: teacher.email || '',
        photo: teacher.photoBase64 || '',
        date: todayStr,
        checkInTime: timeStr,
        checkOutTime: null,
        durationMinutes: null,
        status: 'in',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (KumonFirebase.db) {
        await KumonFirebase.db.collection('kumon_teacher_attendance').add(newTeacherRecord);
      }

      if (window.kumonAudio) window.kumonAudio.playCheckIn();
      showTotemTeacherSuccess(teacher, 'in', timeStr, null, null);
      unlockTotemAfterDelay(3500);
      return;
    }
  }

  // 2. VERIFICAÇÃO DE ALUNO
  const student = TotemState.students.find(s => s.kumonId.toUpperCase() === cleanId);
  if (!student) {
    if (window.kumonAudio) window.kumonAudio.playAlert();
    showTotemError(`Código "${cleanId}" não cadastrado (Aluno ou Professor).`);
    unlockTotemAfterDelay(3000);
    return;
  }

  // Verifica se o aluno já tem registro em aberto hoje
  const openRecord = TotemState.attendances.find(a => 
    a.kumonId === student.kumonId && 
    a.date === todayStr && 
    a.status === 'in'
  );

  if (openRecord) {
    // --- REGISTRAR SAÍDA DO ALUNO ---
    const diffSec = calcDurationSec(openRecord.checkInTime, timeStr);
    if (diffSec < 20) {
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
    // --- REGISTRAR ENTRADA DO ALUNO ---
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

// Modal de feedback de sucesso para ALUNOS
function showTotemSuccess(student, type, checkInTime, checkOutTime, durationMinutes) {
  const overlay = document.getElementById('totemFeedbackOverlay');
  overlay?.querySelector('.totem-feedback-popup')?.classList.remove('is-teacher');

  const avatarEl = document.getElementById('totemSuccessAvatar');
  const badgeEl = document.getElementById('totemSuccessBadge');
  const nameEl = document.getElementById('totemSuccessName');
  const idEl = document.getElementById('totemSuccessId');
  const detailEl = document.getElementById('totemSuccessDetail');
  const subjectsEl = document.getElementById('totemSuccessSubjects');

  if (avatarEl) {
    if (student.photo) {
      avatarEl.innerHTML = `<img src="${student.photo}" alt="${student.name}" style="width: 76px; height: 76px; border-radius: 50%; object-fit: cover; border: 3px solid #0B2545; box-shadow: 2px 2px 0px #0B2545;">`;
    } else {
      avatarEl.textContent = student.avatar || (student.isAdult ? '🧑' : '👦');
    }
  }

  const kcBadgeHtml = student.isKumonConnect
    ? `<span class="badge-kc" title="Kumon Connect - Tablet" style="display: inline-flex; align-items: center; gap: 4px; background: #FFE600; color: #0B2545; border: 2px solid #0B2545; border-radius: 999px; padding: 2px 8px; font-size: 0.75rem; font-weight: 800; vertical-align: middle; margin-left: 6px; box-shadow: 1.5px 1.5px 0px #0B2545;"><img src="assets/onpoint.png" alt="KC" style="width: 14px; height: 14px; object-fit: contain;">KC</span>`
    : '';

  if (nameEl) nameEl.innerHTML = `${student.name} ${kcBadgeHtml}`;
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

// Modal de feedback de sucesso EXCLUSIVO para PROFESSORES / ORIENTADORES
function showTotemTeacherSuccess(teacher, type, checkInTime, checkOutTime, durationMinutes) {
  const overlay = document.getElementById('totemFeedbackOverlay');
  overlay?.querySelector('.totem-feedback-popup')?.classList.add('is-teacher');

  const avatarEl = document.getElementById('totemSuccessAvatar');
  const badgeEl = document.getElementById('totemSuccessBadge');
  const nameEl = document.getElementById('totemSuccessName');
  const idEl = document.getElementById('totemSuccessId');
  const detailEl = document.getElementById('totemSuccessDetail');
  const subjectsEl = document.getElementById('totemSuccessSubjects');

  if (avatarEl) {
    if (teacher.photoBase64) {
      avatarEl.innerHTML = `<img src="${teacher.photoBase64}" alt="${teacher.nickname || teacher.fullName}" style="width: 76px; height: 76px; border-radius: 50%; object-fit: cover; border: 3px solid #FFD13B; box-shadow: 0 0 12px rgba(255, 209, 59, 0.45);">`;
    } else {
      avatarEl.textContent = teacher.gender === 'Masculino' ? '👨‍🏫' : '👩‍🏫';
    }
  }

  const teacherName = teacher.nickname || teacher.fullName || 'Professor(a)';
  if (nameEl) nameEl.innerHTML = `${teacherName} <span style="font-size: 0.88rem; color: #D97706; vertical-align: middle;">⭐</span>`;
  if (idEl) idEl.textContent = `ID: ${teacher.teacherId} • Equipe Pedagógica`;

  if (type === 'in') {
    if (badgeEl) {
      badgeEl.className = 'totem-popup-badge-teacher-in';
      badgeEl.textContent = '⭐ PONTO DO ORIENTADOR • ENTRADA';
    }
    if (detailEl) detailEl.innerHTML = `👋 Bom trabalho na unidade hoje!<br>Horário de Entrada: <strong>${checkInTime}</strong>`;
  } else {
    if (badgeEl) {
      badgeEl.className = 'totem-popup-badge-teacher-out';
      badgeEl.textContent = '⭐ PONTO DO ORIENTADOR • SAÍDA';
    }
    const h = Math.floor(durationMinutes / 60);
    const m = durationMinutes % 60;
    const durStr = h > 0 ? `${h}h ${m}m trabalhadas` : `${m} min trabalhados`;
    if (detailEl) detailEl.innerHTML = `👏 Excelente descanso! Até a próxima aula.<br>Entrada: <strong>${checkInTime}</strong> • Saída: <strong>${checkOutTime}</strong> (${durStr})`;
  }

  if (subjectsEl) {
    subjectsEl.innerHTML = `
      <span style="display:inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 800; font-size: 0.75rem; background: #FEF3C7; color: #92400E; border: 1.5px solid #D97706;">⭐ Orientador Oficial Google</span>
      <span style="display:inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 800; font-size: 0.75rem; background: #0B2545; color: #FFD13B; border: 1.5px solid #FFD13B;">🎓 Ponto Registrado</span>
    `;
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
  const overlay = document.getElementById('totemFeedbackOverlay');
  overlay?.classList.remove('active');
  overlay?.querySelector('.totem-feedback-popup')?.classList.remove('is-teacher');
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
