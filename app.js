// app.js - Lógica Principal do Kumon Onpoint com Firebase, Auth Google e QR Code

// Estado da Aplicação
const State = {
  currentUser: null,
  currentTeacher: null,
  students: [],
  subjects: [],
  attendances: [],
  html5QrCode: null,
  isCameraActive: false,
  selectedStudentForCard: null,
  liveTimerInterval: null,
  isAudioOn: true,
  isPinUnlocked: false,
  currentPinInput: ""
};

const MASTER_UNIT_KEY = "onpoint-teacher-00#MVN";

// ==========================================================================
// 1. GERADOR DE ABREVIAÇÃO FOFA & PREFIXO (TIO / TIA)
// ==========================================================================
function getTeacherPrefix(gender) {
  if (gender === 'Feminino') return 'Tia';
  if (gender === 'Masculino') return 'Tio';
  return 'Prof.';
}

function generateCuteNickname(fullName, gender) {
  if (!fullName) return '';
  const prefix = getTeacherPrefix(gender);
  const firstName = fullName.trim().split(' ')[0];
  const lower = firstName.toLowerCase();

  // Dicionário de abreviações fofas comuns brasileiras
  const cuteMap = {
    'isabela': 'Isa', 'isabella': 'Isa', 'isabelle': 'Isa',
    'mariana': 'Mari', 'marina': 'Mari', 'marianne': 'Mari',
    'camila': 'Cami', 'kamila': 'Cami',
    'juliana': 'Ju', 'julia': 'Ju', 'julyana': 'Ju',
    'beatriz': 'Bia',
    'gabriela': 'Gabi', 'gabriella': 'Gabi', 'gabriel': 'Gabi',
    'rafaela': 'Rafa', 'rafaella': 'Rafa', 'rafael': 'Rafa',
    'fernanda': 'Fê',
    'leticia': 'Lê', 'letícia': 'Lê',
    'larissa': 'Lari',
    'carolina': 'Carol', 'caroline': 'Carol',
    'amanda': 'Manda',
    'patricia': 'Pati', 'patrícia': 'Pati',
    'natalia': 'Nati', 'natália': 'Nati',
    'sofia': 'Sofi', 'sophia': 'Sofi',
    'vitoria': 'Vic', 'vitória': 'Vic',
    'lucas': 'Lu', 'lucca': 'Lu',
    'matheus': 'Theus', 'mateus': 'Theus',
    'leonardo': 'Léo',
    'felipe': 'Lipe',
    'thiago': 'Thi', 'tiago': 'Thi',
    'guilherme': 'Gui',
    'bruno': 'Bru',
    'rodrigo': 'Rô',
    'eduardo': 'Edu',
    'gustavo': 'Guto',
    'marcelo': 'Celo',
    'pedro': 'Pedrinho'
  };

  const cuteName = cuteMap[lower] || firstName;
  return `${prefix} ${cuteName}`;
}

// ==========================================================================
// 2. GERADOR AUTOMÁTICO DE KUMONID (SEMPRE PREFIXO "KUM-")
// ==========================================================================
function generateNextKumonId(studentsList) {
  let maxNum = 0;
  studentsList.forEach(s => {
    if (s.kumonId && s.kumonId.startsWith('KUM-')) {
      const numPart = parseInt(s.kumonId.replace('KUM-', ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  });
  const nextNum = maxNum + 1;
  return `KUM-${String(nextNum).padStart(4, '0')}`;
}

// ==========================================================================
// 3. INICIALIZAÇÃO & AUTENTICAÇÃO COM FIREBASE
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initUIEventListeners();
  initSplashScreen();

  // Inicializa o Firebase
  const fbOk = KumonFirebase.init();
  if (!fbOk) {
    console.warn('Firebase não inicializou, operando em modo offline.');
    loadOfflineFallback();
    return;
  }

  // Observa mudanças no login do Google
  KumonFirebase.onAuthChange(async ({ user, teacher }) => {
    if (user) {
      State.currentUser = user;
      State.currentTeacher = teacher;

      if (!teacher || !teacher.isRegistered || !teacher.pinCode) {
        // Primeiro acesso: exige chave da unidade + criação do PIN
        showAppDashboard(false);
        openTeacherProfileModal(true);
      } else {
        updateTeacherHeaderUI(teacher);
        if (!State.isPinUnlocked) {
          showPinLockModal();
        } else {
          showAppDashboard(true);
        }
      }

      // Conecta aos dados em tempo real no Firestore
      initFirestoreListeners();
    } else {
      State.currentUser = null;
      State.currentTeacher = null;
      State.isPinUnlocked = false;
      State.currentPinInput = "";
      hidePinLockModal();
      showLoginScreen();
    }
  });
});

function initSplashScreen() {
  const splash = document.getElementById('kumonSplashScreen');
  if (!splash) return;

  // Toca o som de boas-vindas do Kumon
  playWelcomeSound();

  // Fecha a splash screen após 2.4 segundos
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 600);
  }, 2400);
}

function playWelcomeSound() {
  try {
    const welcomeAudio = new Audio('assets/kumon-welcomesound.mp3');
    welcomeAudio.volume = 0.85;
    const playPromise = welcomeAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Se a política do navegador bloquear autoplay sem clique, toca no primeiro clique
        const unlock = () => {
          welcomeAudio.play().catch(() => {});
          document.removeEventListener('click', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
      });
    }
  } catch (e) {
    console.warn('Erro ao tocar som de boas-vindas:', e);
  }
}

function showLoginScreen() {
  document.getElementById('authHeroSection').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  hidePinLockModal();
  if (State.html5QrCode && State.isCameraActive) {
    stopCamera();
  }
}

function showAppDashboard(visible = true) {
  document.getElementById('authHeroSection').style.display = 'none';
  document.getElementById('appContainer').style.display = visible ? 'flex' : 'none';
}

function showPinLockModal() {
  const modal = document.getElementById('pinLockModalOverlay');
  if (!modal) return;
  const teacher = State.currentTeacher;
  const nickname = teacher ? (teacher.nickname || teacher.fullName) : 'Professor(a)';
  
  document.getElementById('pinGreetingText').textContent = `Olá, ${nickname}! Digite seu PIN de 4 dígitos:`;
  const avatarEl = document.getElementById('pinTeacherAvatar');
  if (avatarEl && teacher) {
    avatarEl.textContent = teacher.gender === 'Masculino' ? '👨‍🏫' : '👩‍🏫';
  }

  State.currentPinInput = "";
  updatePinDots();
  modal.classList.add('active');
  showAppDashboard(false);
}

function hidePinLockModal() {
  const modal = document.getElementById('pinLockModalOverlay');
  if (modal) modal.classList.remove('active');
}

function updatePinDots() {
  const len = State.currentPinInput.length;
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pindot-${i}`);
    if (dot) {
      if (i < len) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    }
  }
}

function handlePinDigit(digit) {
  if (State.currentPinInput.length >= 4) return;
  State.currentPinInput += digit;
  updatePinDots();
  if (window.kumonAudio) window.kumonAudio.playClick();

  if (State.currentPinInput.length === 4) {
    setTimeout(verifyPinSubmission, 150);
  }
}

function handlePinBackspace() {
  if (State.currentPinInput.length > 0) {
    State.currentPinInput = State.currentPinInput.slice(0, -1);
    updatePinDots();
    if (window.kumonAudio) window.kumonAudio.playClick();
  }
}

function handlePinClear() {
  State.currentPinInput = "";
  updatePinDots();
  if (window.kumonAudio) window.kumonAudio.playClick();
}

function verifyPinSubmission() {
  const expectedPin = State.currentTeacher ? State.currentTeacher.pinCode : null;
  if (State.currentPinInput === expectedPin) {
    // PIN correto!
    State.isPinUnlocked = true;
    hidePinLockModal();
    showAppDashboard(true);
    if (window.kumonAudio) window.kumonAudio.playCheckIn();
  } else {
    // PIN incorreto
    if (window.kumonAudio) window.kumonAudio.playAlert();
    alert('PIN de 4 dígitos incorreto! Tente novamente.');
    State.currentPinInput = "";
    updatePinDots();
  }
}

function updateTeacherHeaderUI(teacher) {
  const greetingEl = document.getElementById('headerTeacherGreeting');
  const avatarEl = document.getElementById('headerTeacherAvatar');
  const cardTeacherLabel = document.getElementById('cardTeacherLabel');

  const nickname = teacher.nickname || generateCuteNickname(teacher.fullName, teacher.gender);
  greetingEl.textContent = `Oi, ${nickname}! 👋`;
  
  if (teacher.gender === 'Masculino') {
    avatarEl.textContent = '👨‍🏫';
  } else {
    avatarEl.textContent = '👩‍🏫';
  }

  if (cardTeacherLabel) {
    cardTeacherLabel.textContent = `ORIENTAÇÃO: ${nickname.toUpperCase()}`;
  }
}

// ==========================================================================
// 4. SINCRONIZAÇÃO EM TEMPO REAL COM O FIRESTORE
// ==========================================================================
function initFirestoreListeners() {
  if (!KumonFirebase.db) return;
  KumonFirebase.cleanupListeners();

  // 1. Matérias do Kumon
  const unsubSubjects = KumonFirebase.db.collection('kumon_subjects')
    .onSnapshot((snapshot) => {
      State.subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderSubjects();
      updateSubjectsFilter();
      renderStudentFormSubjectChecks();
      updateBadges();
    }, (error) => console.error('Erro ao ouvir matérias:', error));
  KumonFirebase.unsubscribers.push(unsubSubjects);

  // 2. Alunos do Kumon
  const unsubStudents = KumonFirebase.db.collection('kumon_students')
    .orderBy('kumonId', 'asc')
    .onSnapshot((snapshot) => {
      State.students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderStudentsList();
      renderQuickTestChips();
      updateCardStudentSelect();
      updateBadges();
      updateAutoKumonIdDisplay();
    }, (error) => console.error('Erro ao ouvir alunos:', error));
  KumonFirebase.unsubscribers.push(unsubStudents);

  // 3. Frequência / Ponto
  const todayStr = getTodayDateString();
  const unsubAttendance = KumonFirebase.db.collection('kumon_attendance')
    .where('date', '==', todayStr)
    .onSnapshot((snapshot) => {
      State.attendances = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderLiveStudents();
      renderHistoryTable();
      updateBadges();
      if (State.selectedStudentForCard) {
        updateCardStats(State.selectedStudentForCard.kumonId);
      }
    }, (error) => console.error('Erro ao ouvir frequência:', error));
  KumonFirebase.unsubscribers.push(unsubAttendance);
}

// Utilitário para desenvolvedor esvaziar coleções se necessário
window.clearKumonDatabase = async function() {
  if (!KumonFirebase.db) return;
  const collections = ['kumon_students', 'kumon_subjects', 'kumon_attendance'];
  for (const colName of collections) {
    const snap = await KumonFirebase.db.collection(colName).get();
    const batch = KumonFirebase.db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  console.log('Banco de dados Kumon Onpoint esvaziado com sucesso!');
};

// Fallback caso usuário queira testar 100% offline
function loadOfflineFallback() {
  showAppDashboard();
  State.subjects = [];
  State.students = [];
  renderSubjects();
  renderStudentsList();
  renderQuickTestChips();
  updateCardStudentSelect();
  updateBadges();
}

// ==========================================================================
// 5. BATIMENTO DE PONTO (ENTRADA / SAÍDA VIA TOTEM OU MANUAL)
// ==========================================================================
async function handleCheckInOut(scannedId) {
  if (!scannedId) return;
  const cleanId = scannedId.trim().toUpperCase();

  // Busca o aluno correspondente
  const student = State.students.find(s => s.kumonId.toUpperCase() === cleanId);
  if (!student) {
    if (window.kumonAudio) window.kumonAudio.playAlert();
    renderFeedbackError(`KumonID "${cleanId}" não encontrado no cadastro.`);
    return;
  }

  const todayStr = getTodayDateString();
  const timeStr = getCurrentTimeString();

  // Verifica se o aluno já tem um registro aberto hoje (sem saída)
  const openRecord = State.attendances.find(a => 
    a.kumonId === student.kumonId && 
    a.date === todayStr && 
    a.status === 'in'
  );

  if (openRecord) {
    // --- REGISTRAR SAÍDA ---
    const checkInTime = openRecord.checkInTime;
    const durationMinutes = calculateDurationInMinutes(checkInTime, timeStr);

    if (KumonFirebase.db && openRecord.id) {
      await KumonFirebase.db.collection('kumon_attendance').doc(openRecord.id).update({
        checkOutTime: timeStr,
        durationMinutes: durationMinutes,
        status: 'out',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      openRecord.checkOutTime = timeStr;
      openRecord.durationMinutes = durationMinutes;
      openRecord.status = 'out';
      renderLiveStudents();
      renderHistoryTable();
      updateBadges();
    }

    if (window.kumonAudio) window.kumonAudio.playCheckOut();
    renderFeedbackSuccess(student, 'out', openRecord.checkInTime, timeStr, durationMinutes);

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
      teacherName: student.orientador || (State.currentTeacher ? State.currentTeacher.nickname : 'Orientadora')
    };

    if (KumonFirebase.db) {
      const docRef = await KumonFirebase.db.collection('kumon_attendance').add({
        ...newRecord,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      newRecord.id = docRef.id;
    } else {
      newRecord.id = 'att-' + Date.now();
      State.attendances.push(newRecord);
      renderLiveStudents();
      renderHistoryTable();
      updateBadges();
    }

    if (window.kumonAudio) window.kumonAudio.playCheckIn();
    renderFeedbackSuccess(student, 'in', timeStr, null, null);
  }
}

// Feedback visual do ponto
function renderFeedbackSuccess(student, type, checkInTime, checkOutTime, durationMinutes) {
  const container = document.getElementById('feedbackCard');
  container.className = `feedback-card ${type === 'in' ? 'success-in' : 'success-out'}`;

  const subjectsBadgesHtml = (student.subjects || []).map(s => {
    const subjObj = State.subjects.find(sub => sub.name === s);
    const bg = subjObj ? subjObj.color : '#E2E8F0';
    return `<span class="subject-badge" style="background:${bg};">${s}</span>`;
  }).join(' ');

  let timeHtml = '';
  let quote = '';

  if (type === 'in') {
    timeHtml = `
      <div class="feedback-time-box">
        <div class="time-row">
          <span>Horário de Entrada:</span>
          <strong>${checkInTime}</strong>
        </div>
      </div>
    `;
    quote = '✨ "Todo dia é uma nova oportunidade de aprender e evoluir!"';
  } else {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const durFormatted = hours > 0 ? `${hours}h ${mins}min` : `${mins} minutos`;

    timeHtml = `
      <div class="feedback-time-box">
        <div class="time-row">
          <span>Entrada:</span>
          <span>${checkInTime}</span>
        </div>
        <div class="time-row">
          <span>Saída:</span>
          <span>${checkOutTime}</span>
        </div>
        <div class="time-duration-highlight">
          ⏱️ Tempo em Sala: ${durFormatted}
        </div>
      </div>
    `;
    quote = '🌟 "Excelente esforço nos estudos de hoje! Até a próxima aula!"';
  }

  container.innerHTML = `
    <div class="student-avatar-big">${student.avatar || '👦'}</div>
    <div class="feedback-status-badge ${type === 'in' ? 'status-in' : 'status-out'}">
      ${type === 'in' ? '✅ ENTRADA REGISTRADA' : '🏁 SAÍDA REGISTRADA'}
    </div>
    <div class="feedback-student-name">${student.name}</div>
    <div class="feedback-student-id">KumonID: ${student.kumonId}</div>
    <div class="feedback-subjects">${subjectsBadgesHtml}</div>
    ${timeHtml}
    <div class="motivational-quote">${quote}</div>
  `;

  // Volta automaticamente para a tela de espera após 8 segundos
  if (State.feedbackResetTimer) clearTimeout(State.feedbackResetTimer);
  State.feedbackResetTimer = setTimeout(resetFeedbackCardToIdle, 8000);
}

function renderFeedbackError(message) {
  const container = document.getElementById('feedbackCard');
  container.className = 'feedback-card';
  container.style.borderColor = 'var(--kumon-red)';
  container.style.background = '#FEF2F2';
  container.innerHTML = `
    <div style="font-size: 3rem; margin-bottom: 8px;">⚠️</div>
    <div class="feedback-status-badge" style="background:var(--kumon-red); color:#fff;">KUMONID NÃO ENCONTRADO</div>
    <p style="font-size: 0.95rem; margin-top: 10px; font-weight: 700; color: #991B1B;">${message}</p>
    <p style="font-size: 0.8rem; color: var(--kumon-gray-muted); margin-top: 8px;">
      Verifique se o aluno está cadastrado na aba "Alunos" ou tente novamente.
    </p>
  `;

  if (State.feedbackResetTimer) clearTimeout(State.feedbackResetTimer);
  State.feedbackResetTimer = setTimeout(resetFeedbackCardToIdle, 5000);
}

function resetFeedbackCardToIdle() {
  const container = document.getElementById('feedbackCard');
  if (!container) return;
  container.className = 'feedback-card empty-state';
  container.style = '';

  const countPresent = State.attendances.filter(a => a.date === getTodayDateString() && a.status === 'in').length;
  const todayCount = State.attendances.filter(a => a.date === getTodayDateString()).length;

  container.innerHTML = `
    <div style="font-size: 3.2rem; margin-bottom: 8px;">👋</div>
    <h3 style="font-family: var(--font-heading); font-size: 1.3rem; color: var(--kumon-navy); margin-bottom: 6px;">Pronto para registrar!</h3>
    <p style="font-size: 0.88rem; color: var(--kumon-gray-muted); max-width: 250px; text-align: center; margin-bottom: 16px;">
      Aproxime o QR Code do aluno na câmera ou digite o KumonID ao lado.
    </p>

    <div class="totem-status-pill">
      <span class="status-pulse-dot"></span>
      <span>Totem Ativo • Pronto</span>
    </div>

    <!-- Mini Resumo da Unidade em Tempo Real -->
    <div class="totem-mini-stats">
      <div class="totem-stat-box">
        <span class="totem-stat-number" id="totemLiveCount">${countPresent}</span>
        <span class="totem-stat-label">Em Sala Agora</span>
      </div>
      <div class="totem-stat-box">
        <span class="totem-stat-number" id="totemTodayCount">${todayCount}</span>
        <span class="totem-stat-label">Presenças Hoje</span>
      </div>
    </div>
  `;
}

// ==========================================================================
// 6. CÂMERA & SCANNER QR CODE (HTML5-QRCODE)
// ==========================================================================
async function toggleCamera() {
  if (State.isCameraActive) {
    await stopCamera();
  } else {
    await startCamera();
  }
}

async function startCamera() {
  const btn = document.getElementById('btnToggleCamera');
  const btnText = document.getElementById('cameraBtnText');
  const btnIcon = document.getElementById('cameraBtnIcon');

  try {
    if (!State.html5QrCode) {
      State.html5QrCode = new Html5Qrcode("reader");
    }

    const config = {
      fps: 10,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0
    };

    btnText.textContent = 'Iniciando...';

    await State.html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        // Leitura bem-sucedida do QR Code
        handleCheckInOut(decodedText);
      },
      () => {
        // Scanning frame erro silencioso normal
      }
    );

    State.isCameraActive = true;
    btnText.textContent = 'Parar Câmera';
    btnIcon.textContent = '⏹️';
    btn.className = 'btn-neo btn-danger';
  } catch (err) {
    console.error('Erro ao abrir câmera:', err);
    btnText.textContent = 'Iniciar Câmera';
    btnIcon.textContent = '📹';
    btn.className = 'btn-neo btn-primary';
    alert('Não foi possível acessar a câmera. Você também pode digitar o KumonID manualmente abaixo!');
  }
}

async function stopCamera() {
  if (State.html5QrCode && State.isCameraActive) {
    try {
      await State.html5QrCode.stop();
    } catch (e) {
      console.warn('Erro ao parar câmera:', e);
    }
  }
  State.isCameraActive = false;
  const btn = document.getElementById('btnToggleCamera');
  document.getElementById('cameraBtnText').textContent = 'Iniciar Câmera';
  document.getElementById('cameraBtnIcon').textContent = '📹';
  btn.className = 'btn-neo btn-primary';
}

// ==========================================================================
// 7. CARTEIRINHA DIGITAL DO ALUNO (ESTILO CRACÁ ELGALY COM QR CODE)
// ==========================================================================
function updateCardStudentSelect() {
  const select = document.getElementById('selectCardStudent');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '';

  if (State.students.length === 0) {
    select.innerHTML = '<option value="">Nenhum aluno cadastrado</option>';
    document.getElementById('cardStudentName').textContent = 'Nenhum Aluno';
    document.getElementById('cardStudentId').textContent = 'ID: KUM-0000';
    document.getElementById('cardAvatar').textContent = '👤';
    document.getElementById('cardSubjects').innerHTML = '<span style="color:var(--kumon-gray-muted); font-size:0.8rem;">Sem matérias vinculadas</span>';
    document.getElementById('cardQrContainer').innerHTML = '<div style="font-size:0.75rem; color:var(--kumon-gray-muted); padding:20px 10px; text-align:center;">Cadastre um aluno na aba "Alunos" para gerar sua carteirinha!</div>';
    const statAtt = document.getElementById('cardStatAttendances');
    if (statAtt) statAtt.textContent = '0 Aulas';
    const statStatus = document.getElementById('cardStatStatus');
    if (statStatus) statStatus.innerHTML = '<span style="color:var(--kumon-gray-muted);">⚪ Aguardando alunos</span>';
    return;
  }

  State.students.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.kumonId;
    opt.textContent = `${st.kumonId} • ${st.name}`;
    select.appendChild(opt);
  });

  if (currentVal && State.students.some(s => s.kumonId === currentVal)) {
    select.value = currentVal;
  } else {
    select.value = State.students[0].kumonId;
  }

  renderStudentCard(select.value);
}

function renderStudentCard(kumonId) {
  const student = State.students.find(s => s.kumonId === kumonId);
  if (!student) return;
  State.selectedStudentForCard = student;

  document.getElementById('cardStudentName').textContent = student.name;
  document.getElementById('cardStudentId').textContent = `ID: ${student.kumonId}`;
  document.getElementById('cardAvatar').textContent = student.avatar || '👦';

  // Atualiza orientador no rodapé da carteirinha
  const cardTeacherLabel = document.getElementById('cardTeacherLabel');
  if (cardTeacherLabel) {
    const orientador = student.orientador || (State.currentTeacher ? State.currentTeacher.nickname : 'UNIDADE KUMON');
    cardTeacherLabel.textContent = `ORIENTAÇÃO: ${orientador.toUpperCase()}`;
  }

  // Badges das Matérias
  const cardSubjectsEl = document.getElementById('cardSubjects');
  cardSubjectsEl.innerHTML = (student.subjects || []).map(s => {
    const subjObj = State.subjects.find(sub => sub.name === s);
    const bg = subjObj ? subjObj.color : '#E2E8F0';
    return `<span class="subject-badge" style="background:${bg};">${s}</span>`;
  }).join(' ');

  // Gera o QR Code oficial com o KumonID
  const qrContainer = document.getElementById('cardQrContainer');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: student.kumonId,
    width: 140,
    height: 140,
    colorDark: "#0B2545",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  updateCardStats(student.kumonId);
}

function printAllStudentCardsBatch() {
  if (State.students.length === 0) {
    alert('Nenhum aluno cadastrado para imprimir carteirinhas.');
    return;
  }

  const container = document.getElementById('printBatchContainer');
  if (!container) return;
  container.innerHTML = '';
  container.className = 'print-cards-grid';
  container.style.display = 'grid';

  const teacherLabel = State.currentTeacher ? State.currentTeacher.nickname.toUpperCase() : 'ORIENTADOR(A)';

  State.students.forEach((st, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'kumon-id-card';
    cardEl.style.margin = '10px auto';
    cardEl.style.width = '300px';

    const subjectsHtml = (st.subjects || []).map(s => {
      const subjObj = State.subjects.find(sub => sub.name === s);
      const bg = subjObj ? subjObj.color : '#E2E8F0';
      return `<span class="subject-badge" style="background:${bg}; font-size:0.75rem;">${s}</span>`;
    }).join(' ');

    const qrDivId = `batch-qr-${idx}`;

    cardEl.innerHTML = `
      <div class="card-top-bar">
        <img src="assets/onpoint.png" alt="Kumon Onpoint" class="card-logo-img-main">
        <span class="card-unit-label">KUMON ONPOINT</span>
      </div>
      <div class="card-body-content">
        <div class="card-avatar-wrap">${st.avatar || '👦'}</div>
        <div class="card-student-name">${st.name}</div>
        <div class="card-student-id-badge">ID: ${st.kumonId}</div>
        <div class="feedback-subjects">${subjectsHtml}</div>
        <div class="card-qr-box" id="${qrDivId}"></div>
        <div style="font-size: 0.72rem; color: var(--kumon-gray-muted); font-weight: 700;">Totem de Ponto</div>
      </div>
      <div class="card-footer-strip">
        <span>ORIENTAÇÃO: ${(st.orientador || teacherLabel).toUpperCase()}</span>
        <span>ANO 2026</span>
      </div>
    `;

    container.appendChild(cardEl);

    // Gera o QR Code para este aluno no lote
    new QRCode(document.getElementById(qrDivId), {
      text: st.kumonId,
      width: 120,
      height: 120,
      colorDark: "#0B2545",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  });

  // Oculta visualização normal temporariamente na impressão e dispara print
  setTimeout(() => {
    window.print();
    // Limpa após impressão
    setTimeout(() => {
      container.style.display = 'none';
      container.innerHTML = '';
    }, 1000);
  }, 400);
}

function updateCardStats(kumonId) {
  // Quantidade de presenças no mês
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthAttendances = State.attendances.filter(a => a.kumonId === kumonId && a.date.startsWith(currentMonthStr)).length;
  
  const statAttendances = document.getElementById('cardStatAttendances');
  if (statAttendances) statAttendances.textContent = `${monthAttendances} Aulas`;

  // Status atual (em sala ou fora)
  const isPresent = State.attendances.some(a => a.kumonId === kumonId && a.date === getTodayDateString() && a.status === 'in');
  const statStatus = document.getElementById('cardStatStatus');
  if (statStatus) {
    if (isPresent) {
      statStatus.innerHTML = '<span style="color:var(--kumon-green);">🟢 Em Sala de Estudos</span>';
    } else {
      statStatus.innerHTML = '<span style="color:var(--kumon-gray-muted);">⚪ Fora da Sala</span>';
    }
  }
}

// ==========================================================================
// 8. LISTAGEM DE ALUNOS PRESENTES AGORA (AO VIVO COM CRONÔMETRO)
// ==========================================================================
function renderLiveStudents() {
  const container = document.getElementById('liveStudentsGrid');
  const emptyState = document.getElementById('emptyLiveState');
  if (!container || !emptyState) return;

  const activeStudents = State.attendances.filter(a => a.date === getTodayDateString() && a.status === 'in');

  if (activeStudents.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = activeStudents.map(record => {
    const student = State.students.find(s => s.kumonId === record.kumonId) || {
      avatar: '🧑',
      name: record.studentName
    };

    const mins = calculateDurationInMinutes(record.checkInTime, getCurrentTimeString());
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    const durText = hours > 0 ? `${hours}h ${m}m` : `${m} min`;

    return `
      <div class="live-card">
        <div class="live-card-top">
          <div class="live-avatar">${student.avatar || '👦'}</div>
          <div class="live-info">
            <div class="live-name">${record.studentName}</div>
            <div style="font-size: 0.8rem; font-weight: 800; color: var(--kumon-blue-dark);">${record.kumonId}</div>
            <div class="live-timer" data-checkin="${record.checkInTime}">
              ⏱️ ${durText} em sala (Entrou às ${record.checkInTime})
            </div>
          </div>
        </div>
        <button class="btn-neo btn-warning btn-sm" onclick="handleCheckInOut('${record.kumonId}')" style="width: 100%; font-size: 0.85rem; padding: 6px;">
          🏁 Registrar Saída
        </button>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// 9. GERENCIAMENTO DE ALUNOS (CADASTRO COM KUMONID AUTOMÁTICO & REMOÇÃO)
// ==========================================================================
function renderStudentsList() {
  const tbody = document.getElementById('studentsTableBody');
  const filterVal = (document.getElementById('filterStudentList')?.value || '').toLowerCase();
  if (!tbody) return;

  const filtered = State.students.filter(s => 
    s.name.toLowerCase().includes(filterVal) || 
    s.kumonId.toLowerCase().includes(filterVal)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 24px; color: var(--kumon-gray-muted);">
          Nenhum aluno encontrado.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(st => {
    const subjectsBadges = (st.subjects || []).map(s => {
      const subjObj = State.subjects.find(sub => sub.name === s);
      const bg = subjObj ? subjObj.color : '#E2E8F0';
      return `<span class="subject-badge" style="background:${bg};">${s}</span>`;
    }).join(' ');

    const orientadorNome = st.orientador || (State.currentTeacher ? State.currentTeacher.nickname : 'A Definir');

    return `
      <tr>
        <td style="font-size: 1.8rem; width: 60px; text-align: center;">${st.avatar || '👦'}</td>
        <td>
          <strong>${st.name}</strong>
          ${st.age ? `<span style="font-size:0.78rem; color:var(--kumon-gray-muted);"> (${st.age} anos)</span>` : ''}
          <div style="margin-top: 3px;">
            <span class="brand-badge" style="background:var(--kumon-soft-bg); border:1.5px solid var(--kumon-border); font-size:0.74rem; color:var(--kumon-navy); padding: 1px 7px;">
              👩‍🏫 Orientador: ${orientadorNome}
            </span>
          </div>
        </td>
        <td><strong style="color:var(--kumon-blue-dark);">${st.kumonId}</strong></td>
        <td>${subjectsBadges || '<span style="color:#94a3b8;">Nenhuma</span>'}</td>
        <td>
          <div>${st.parentName || '-'}</div>
          <div style="font-size: 0.78rem; color: var(--kumon-gray-muted);">${st.parentPhone || ''}</div>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn-neo btn-outline" style="padding: 4px 8px; font-size: 0.8rem;" onclick="openEditStudentModal('${st.id || st.kumonId}')" title="Editar Aluno e Orientador">
            ✏️
          </button>
          <button class="btn-neo btn-outline" style="padding: 4px 10px; font-size: 0.8rem;" onclick="viewStudentCard('${st.kumonId}')" title="Ver Carteirinha">
            🪪 Carteirinha
          </button>
          <button class="btn-neo btn-outline" style="padding: 4px 8px; font-size: 0.8rem; color: var(--kumon-red);" onclick="confirmDeleteStudent('${st.id || st.kumonId}', '${st.name}')" title="Remover Aluno">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateAutoKumonIdDisplay() {
  const el = document.getElementById('displayAutoKumonId');
  if (el) {
    el.textContent = generateNextKumonId(State.students);
  }
}

function populateTeacherSelectInStudentModal() {
  const select = document.getElementById('selectRegisteredTeacher');
  if (!select) return;
  select.innerHTML = '<option value="">Trocar Orientador...</option>';

  const teachersSet = new Set();
  if (State.currentTeacher && State.currentTeacher.nickname) {
    teachersSet.add(State.currentTeacher.nickname);
  }
  State.students.forEach(st => {
    if (st.orientador) teachersSet.add(st.orientador);
  });

  teachersSet.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  select.onchange = () => {
    if (select.value) {
      document.getElementById('studentOrientadorInput').value = select.value;
    }
  };
}

function openNewStudentModal() {
  document.getElementById('studentFormMode').value = 'create';
  document.getElementById('studentFormDocId').value = '';
  document.getElementById('modalStudentTitle').innerHTML = '<span>➕</span> Cadastrar Aluno no Kumon';
  document.getElementById('studentNameInput').value = '';
  document.getElementById('studentAgeInput').value = '';
  document.getElementById('studentParentInput').value = '';
  document.getElementById('studentPhoneInput').value = '';
  
  const defaultOrientador = State.currentTeacher ? State.currentTeacher.nickname : '';
  document.getElementById('studentOrientadorInput').value = defaultOrientador;
  populateTeacherSelectInStudentModal();

  updateAutoKumonIdDisplay();
  renderStudentFormSubjectChecks();
  document.getElementById('studentModalOverlay').classList.add('active');
}

function openEditStudentModal(studentDocId) {
  const student = State.students.find(s => s.id === studentDocId || s.kumonId === studentDocId);
  if (!student) return;

  document.getElementById('studentFormMode').value = 'edit';
  document.getElementById('studentFormDocId').value = student.id || student.kumonId;
  document.getElementById('modalStudentTitle').innerHTML = '<span>✏️</span> Editar Aluno & Orientador';

  document.getElementById('studentNameInput').value = student.name || '';
  document.getElementById('studentAgeInput').value = student.age || '';
  document.getElementById('studentAvatarSelect').value = student.avatar || '👦';
  document.getElementById('studentParentInput').value = student.parentName || '';
  document.getElementById('studentPhoneInput').value = student.parentPhone || '';

  const orientador = student.orientador || (State.currentTeacher ? State.currentTeacher.nickname : '');
  document.getElementById('studentOrientadorInput').value = orientador;
  populateTeacherSelectInStudentModal();

  const displayEl = document.getElementById('displayAutoKumonId');
  if (displayEl) displayEl.textContent = student.kumonId;

  // Renderiza matérias e marca as do aluno
  renderStudentFormSubjectChecks();
  const checkboxes = document.querySelectorAll('input[name="studentSubjectCheck"]');
  checkboxes.forEach(cb => {
    cb.checked = (student.subjects || []).includes(cb.value);
  });

  document.getElementById('studentModalOverlay').classList.add('active');
}

function renderStudentFormSubjectChecks() {
  const container = document.getElementById('studentSubjectsContainer');
  if (!container) return;

  if (State.subjects.length === 0) {
    container.innerHTML = '<span style="color:var(--kumon-red); font-size:0.85rem;">Cadastre matérias na aba "Matérias" primeiro!</span>';
    return;
  }

  container.innerHTML = State.subjects.map((sub, idx) => `
    <label style="display: flex; align-items: center; gap: 6px; font-weight: 700; cursor: pointer; background: #fff; border: 2px solid var(--kumon-border); border-radius: var(--radius-sm); padding: 6px 12px; box-shadow: 2px 2px 0px var(--kumon-border);">
      <input type="checkbox" name="studentSubjectCheck" value="${sub.name}" ${idx === 0 ? 'checked' : ''}>
      <span>${sub.icon || '📚'} ${sub.name}</span>
    </label>
  `).join('');
}

async function saveStudent(e) {
  e.preventDefault();
  const mode = document.getElementById('studentFormMode').value;
  const docId = document.getElementById('studentFormDocId').value;
  const name = document.getElementById('studentNameInput').value.trim();
  const age = document.getElementById('studentAgeInput').value.trim();
  const avatar = document.getElementById('studentAvatarSelect').value;
  const parentName = document.getElementById('studentParentInput').value.trim();
  const parentPhone = document.getElementById('studentPhoneInput').value.trim();
  const orientador = document.getElementById('studentOrientadorInput').value.trim() || (State.currentTeacher ? State.currentTeacher.nickname : 'Orientador(a)');

  // Matérias selecionadas
  const selectedSubjects = Array.from(document.querySelectorAll('input[name="studentSubjectCheck"]:checked')).map(cb => cb.value);

  if (selectedSubjects.length === 0) {
    alert('Por favor, selecione ao menos uma matéria para o aluno!');
    return;
  }

  if (mode === 'edit') {
    const student = State.students.find(s => s.id === docId || s.kumonId === docId);
    const updatedData = {
      name,
      age: age ? parseInt(age, 10) : null,
      avatar,
      subjects: selectedSubjects,
      parentName,
      parentPhone,
      orientador,
      updatedAt: new Date().toISOString()
    };

    if (KumonFirebase.db && student && student.id) {
      await KumonFirebase.db.collection('kumon_students').doc(student.id).update(updatedData);
    } else {
      if (student) {
        Object.assign(student, updatedData);
        renderStudentsList();
        updateCardStudentSelect();
      }
    }
    document.getElementById('studentModalOverlay').classList.remove('active');
    alert(`Aluno(a) "${name}" atualizado(a) com sucesso! Orientador(a): ${orientador}`);
    return;
  }

  // Gera KumonID automático
  const autoId = generateNextKumonId(State.students);

  const studentData = {
    kumonId: autoId,
    name,
    age: age ? parseInt(age, 10) : null,
    avatar,
    subjects: selectedSubjects,
    parentName,
    parentPhone,
    orientador,
    createdAt: new Date().toISOString()
  };

  if (KumonFirebase.db) {
    await KumonFirebase.db.collection('kumon_students').add(studentData);
  } else {
    studentData.id = 'st-' + Date.now();
    State.students.push(studentData);
    renderStudentsList();
    renderQuickTestChips();
    updateCardStudentSelect();
    updateBadges();
  }

  document.getElementById('studentModalOverlay').classList.remove('active');
  if (window.kumonAudio) window.kumonAudio.playCheckIn();
  alert(`Aluno(a) ${name} cadastrado(a) com sucesso com o ID ${autoId}!`);
}

async function confirmDeleteStudent(studentDocId, studentName) {
  const confirmed = confirm(`Tem certeza que deseja remover o(a) aluno(a) "${studentName}" do Kumon?`);
  if (!confirmed) return;

  if (KumonFirebase.db) {
    await KumonFirebase.db.collection('kumon_students').doc(studentDocId).delete();
  } else {
    State.students = State.students.filter(s => (s.id !== studentDocId && s.kumonId !== studentDocId));
    renderStudentsList();
    renderQuickTestChips();
    updateCardStudentSelect();
    updateBadges();
  }
}

function viewStudentCard(kumonId) {
  // Muda para a aba de carteirinha e seleciona o aluno
  switchTab('tab-carteirinha');
  const select = document.getElementById('selectCardStudent');
  if (select) {
    select.value = kumonId;
    renderStudentCard(kumonId);
  }
}

// ==========================================================================
// 10. GERENCIAMENTO DE MATÉRIAS (PROFESSORES ADICIONAM AO SISTEMA)
// ==========================================================================
function renderSubjects() {
  const container = document.getElementById('subjectsGrid');
  if (!container) return;

  if (State.subjects.length === 0) {
    container.innerHTML = '<p style="color:var(--kumon-gray-muted);">Nenhuma matéria cadastrada ainda.</p>';
    return;
  }

  container.innerHTML = State.subjects.map(sub => {
    const studentsInSubject = State.students.filter(st => (st.subjects || []).includes(sub.name)).length;
    return `
      <div class="subject-item-card">
        <div class="subject-item-left">
          <div class="subject-color-tag" style="background:${sub.color || '#93C5FD'};"></div>
          <div>
            <div class="subject-item-title">${sub.icon || '📚'} ${sub.name}</div>
            <div class="subject-item-count">${studentsInSubject} alunos matriculados</div>
          </div>
        </div>
        <button class="btn-neo btn-outline" style="padding: 4px 8px; font-size: 0.8rem; color: var(--kumon-red);" onclick="confirmDeleteSubject('${sub.id}', '${sub.name}')" title="Remover Matéria">
          🗑️
        </button>
      </div>
    `;
  }).join('');
}

function updateSubjectsFilter() {
  const select = document.getElementById('filterSubjectHistory');
  if (!select) return;
  select.innerHTML = '<option value="all">Todas as Matérias</option>' + 
    State.subjects.map(s => `<option value="${s.name}">${s.icon || ''} ${s.name}</option>`).join('');
}

async function saveSubject(e) {
  e.preventDefault();
  const name = document.getElementById('subjectNameInput').value.trim();
  const icon = document.getElementById('subjectIconInput').value.trim() || '📚';
  const color = document.getElementById('subjectColorInput').value;

  if (!name) return;

  if (State.subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    alert('Esta matéria já está cadastrada no sistema!');
    return;
  }

  const subjectData = { name, icon, color };

  if (KumonFirebase.db) {
    await KumonFirebase.db.collection('kumon_subjects').add({
      ...subjectData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    subjectData.id = 'sub-' + Date.now();
    State.subjects.push(subjectData);
    renderSubjects();
    updateSubjectsFilter();
    renderStudentFormSubjectChecks();
  }

  document.getElementById('subjectModalOverlay').classList.remove('active');
  document.getElementById('subjectNameInput').value = '';
}

async function confirmDeleteSubject(subjectDocId, subjectName) {
  const inUse = State.students.some(s => (s.subjects || []).includes(subjectName));
  if (inUse) {
    alert(`A matéria "${subjectName}" não pode ser removida pois há alunos matriculados nela.`);
    return;
  }
  const confirmed = confirm(`Deseja remover a matéria "${subjectName}"?`);
  if (!confirmed) return;

  if (KumonFirebase.db) {
    await KumonFirebase.db.collection('kumon_subjects').doc(subjectDocId).delete();
  } else {
    State.subjects = State.subjects.filter(s => s.id !== subjectDocId);
    renderSubjects();
    updateSubjectsFilter();
    renderStudentFormSubjectChecks();
  }
}

// ==========================================================================
// 11. HISTÓRICO & EXPORTAÇÃO CSV
// ==========================================================================
function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  const searchVal = (document.getElementById('filterSearchHistory')?.value || '').toLowerCase();
  const subjectVal = document.getElementById('filterSubjectHistory')?.value || 'all';

  const filtered = State.attendances.filter(a => {
    const matchesSearch = a.studentName.toLowerCase().includes(searchVal) || a.kumonId.toLowerCase().includes(searchVal);
    const matchesSubject = (subjectVal === 'all') || (a.subjects || []).includes(subjectVal);
    return matchesSearch && matchesSubject;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px; color: var(--kumon-gray-muted);">
          Nenhum registro de ponto encontrado para hoje.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const dur = a.durationMinutes ? `${a.durationMinutes} min` : '-';
    const statusBadge = a.status === 'in' 
      ? '<span class="brand-badge" style="background:#DCFCE7; color:#166534;">EM SALA</span>'
      : '<span class="brand-badge" style="background:#F1F5F9; color:#475569;">CONCLUÍDO</span>';

    const subjectsBadges = (a.subjects || []).map(s => {
      const subjObj = State.subjects.find(sub => sub.name === s);
      const bg = subjObj ? subjObj.color : '#E2E8F0';
      return `<span class="subject-badge" style="background:${bg}; font-size:0.7rem;">${s}</span>`;
    }).join(' ');

    return `
      <tr>
        <td><strong>${formatDisplayDate(a.date)}</strong></td>
        <td><strong>${a.studentName}</strong></td>
        <td><strong style="color:var(--kumon-blue-dark);">${a.kumonId}</strong></td>
        <td>${subjectsBadges}</td>
        <td>${a.checkInTime}</td>
        <td>${a.checkOutTime || '-'}</td>
        <td><strong>${dur}</strong></td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

function exportHistoryCSV() {
  if (State.attendances.length === 0) {
    alert('Não há registros de ponto para exportar hoje.');
    return;
  }

  let csv = '\uFEFFData;KumonID;Aluno;Disciplinas;Entrada;Saída;Tempo (Minutos);Status;Orientador\n';
  State.attendances.forEach(a => {
    const subs = (a.subjects || []).join(', ');
    csv += `"${a.date}";"${a.kumonId}";"${a.studentName}";"${subs}";"${a.checkInTime}";"${a.checkOutTime || ''}";"${a.durationMinutes || ''}";"${a.status}";"${a.teacherName || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Kumon_Onpoint_Frequencia_${getTodayDateString()}.csv`;
  link.click();
}

// ==========================================================================
// 12. CHIPS DE TESTE RÁPIDO & BADGES
// ==========================================================================
function renderQuickTestChips() {
  const container = document.getElementById('quickTestChips');
  if (!container) return;

  if (State.students.length === 0) {
    container.innerHTML = '<span style="color:var(--kumon-gray-muted); font-size:0.78rem;">Nenhum aluno cadastrado ainda.</span>';
    return;
  }

  container.innerHTML = State.students.map(st => `
    <button type="button" class="chip-student" onclick="handleCheckInOut('${st.kumonId}')" title="Clique para bater ponto de ${st.name}">
      ${st.avatar || '👦'} ${st.name.split(' ')[0]} (${st.kumonId})
    </button>
  `).join('');
}

function updateBadges() {
  const badgePresentes = document.getElementById('badgePresentes');
  const badgeTotalAlunos = document.getElementById('badgeTotalAlunos');
  const badgeTotalMaterias = document.getElementById('badgeTotalMaterias');
  const totemLiveCount = document.getElementById('totemLiveCount');
  const totemTodayCount = document.getElementById('totemTodayCount');

  const countPresent = State.attendances.filter(a => a.date === getTodayDateString() && a.status === 'in').length;
  const countToday = State.attendances.filter(a => a.date === getTodayDateString()).length;

  if (badgePresentes) badgePresentes.textContent = countPresent;
  if (badgeTotalAlunos) badgeTotalAlunos.textContent = State.students.length;
  if (badgeTotalMaterias) badgeTotalMaterias.textContent = State.subjects.length;
  if (totemLiveCount) totemLiveCount.textContent = countPresent;
  if (totemTodayCount) totemTodayCount.textContent = countToday;
}

// ==========================================================================
// 13. MODAIS & EVENTOS DE UI
// ==========================================================================
function initUIEventListeners() {
  // Login Google
  document.getElementById('btnGoogleLogin')?.addEventListener('click', async () => {
    try {
      await KumonFirebase.loginWithGoogle();
    } catch (e) {
      console.error('Erro no login Google:', e);
      alert('Erro ao fazer login com Google: ' + (e.message || e));
    }
  });

  // Logout
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (confirm('Deseja realmente sair da sua conta?')) {
      await KumonFirebase.logout();
    }
  });

  // Troca de Abas
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Toggle Câmera Totem
  document.getElementById('btnToggleCamera')?.addEventListener('click', toggleCamera);

  // Form Manual Check
  document.getElementById('formManualCheck')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('inputManualId');
    if (input.value) {
      handleCheckInOut(input.value);
      input.value = '';
    }
  });

  // Select Aluno na Carteirinha
  document.getElementById('selectCardStudent')?.addEventListener('change', (e) => {
    renderStudentCard(e.target.value);
  });

  // Bater ponto a partir da carteirinha
  document.getElementById('btnSimulateCardCheckIn')?.addEventListener('click', () => {
    if (State.selectedStudentForCard) {
      handleCheckInOut(State.selectedStudentForCard.kumonId);
    }
  });

  // Imprimir Carteirinha Individual
  document.getElementById('btnPrintCard')?.addEventListener('click', () => {
    window.print();
  });

  // Imprimir Todas as Carteirinhas em Lote (Formato Crachá A4)
  document.getElementById('btnPrintAllCards')?.addEventListener('click', printAllStudentCardsBatch);

  // Imprimir Relatório
  document.getElementById('btnPrintReport')?.addEventListener('click', () => {
    window.print();
  });

  // Exportar CSV
  document.getElementById('btnExportCSV')?.addEventListener('click', exportHistoryCSV);

  // Perfil do Professor Modal (Abre Mini Perfil)
  document.getElementById('btnTeacherProfilePill')?.addEventListener('click', () => {
    openTeacherMiniProfileModal();
  });
  document.getElementById('btnCloseTeacherMiniProfileModal')?.addEventListener('click', () => {
    document.getElementById('teacherMiniProfileModalOverlay')?.classList.remove('active');
  });
  document.getElementById('btnEditTeacherProfileFromMini')?.addEventListener('click', () => {
    document.getElementById('teacherMiniProfileModalOverlay')?.classList.remove('active');
    openTeacherProfileModal(false);
  });
  document.getElementById('btnLogoutFromMini')?.addEventListener('click', async () => {
    document.getElementById('teacherMiniProfileModalOverlay')?.classList.remove('active');
    if (confirm('Deseja realmente sair da sua conta?')) {
      await KumonFirebase.logout();
    }
  });

  document.getElementById('btnCloseTeacherModal')?.addEventListener('click', () => {
    document.getElementById('teacherModalOverlay').classList.remove('active');
  });
  document.getElementById('formTeacherProfile')?.addEventListener('submit', saveTeacherProfile);

  // Auto sugestão de apelido no perfil do professor
  document.getElementById('btnAutoSuggestNickname')?.addEventListener('click', () => {
    const fullName = document.getElementById('teacherFullName').value;
    const gender = document.getElementById('teacherGender').value;
    document.getElementById('teacherNickname').value = generateCuteNickname(fullName, gender);
  });

  // Aluno Modal
  document.getElementById('btnOpenNewStudentModal')?.addEventListener('click', openNewStudentModal);
  document.getElementById('btnCloseStudentModal')?.addEventListener('click', () => {
    document.getElementById('studentModalOverlay').classList.remove('active');
  });
  document.getElementById('btnCancelStudentModal')?.addEventListener('click', () => {
    document.getElementById('studentModalOverlay').classList.remove('active');
  });
  document.getElementById('formStudent')?.addEventListener('submit', saveStudent);

  // Matéria Modal
  document.getElementById('btnOpenNewSubjectModal')?.addEventListener('click', () => {
    document.getElementById('subjectModalOverlay').classList.add('active');
  });
  document.getElementById('btnCloseSubjectModal')?.addEventListener('click', () => {
    document.getElementById('subjectModalOverlay').classList.remove('active');
  });
  document.getElementById('btnCancelSubjectModal')?.addEventListener('click', () => {
    document.getElementById('subjectModalOverlay').classList.remove('active');
  });
  document.getElementById('formSubject')?.addEventListener('submit', saveSubject);

  // Filtro de alunos em tempo real
  document.getElementById('filterStudentList')?.addEventListener('input', renderStudentsList);

  // Filtros de histórico
  document.getElementById('filterSearchHistory')?.addEventListener('input', renderHistoryTable);
  document.getElementById('filterSubjectHistory')?.addEventListener('change', renderHistoryTable);

  // Áudio Toggle
  document.getElementById('btnAudioToggle')?.addEventListener('click', () => {
    State.isAudioOn = !State.isAudioOn;
    if (window.kumonAudio) window.kumonAudio.enabled = State.isAudioOn;
    document.getElementById('audioIcon').textContent = State.isAudioOn ? '🔊' : '🔇';
  });

  // Atualizar Presentes
  document.getElementById('btnRefreshLive')?.addEventListener('click', renderLiveStudents);

  // Teclado do PIN Lock
  document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const digit = btn.getAttribute('data-digit');
      handlePinDigit(digit);
    });
  });

  document.getElementById('btnPinBackspace')?.addEventListener('click', handlePinBackspace);
  document.getElementById('btnPinClear')?.addEventListener('click', handlePinClear);
  document.getElementById('btnPinLogout')?.addEventListener('click', async () => {
    hidePinLockModal();
    await KumonFirebase.logout();
  });

  // Digitação do PIN via teclado físico
  window.addEventListener('keydown', (e) => {
    const pinModal = document.getElementById('pinLockModalOverlay');
    if (pinModal && pinModal.classList.contains('active')) {
      if (/^[0-9]$/.test(e.key)) {
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBackspace();
      } else if (e.key === 'Escape') {
        handlePinClear();
      }
    }
  });

  // Cronômetro em tempo real para alunos presentes
  setInterval(updateLiveTimers, 30000); // atualiza a cada 30 segundos
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  const pane = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (pane) pane.classList.add('active');

  // Pausa câmera ao sair da aba do totem para economizar bateria
  if (tabId !== 'tab-totem' && State.isCameraActive) {
    stopCamera();
  }
}

function openTeacherMiniProfileModal() {
  const modal = document.getElementById('teacherMiniProfileModalOverlay');
  if (!modal) return;
  const user = State.currentUser;
  const teacher = State.currentTeacher;

  const nickname = (teacher && teacher.nickname) || 'Professor(a)';
  const fullName = (teacher && teacher.fullName) || (user && user.displayName) || 'Orientador(a)';
  const email = (user && user.email) || 'unidade@kumon.com';
  const phone = (teacher && teacher.phone) || 'Não informado';
  const age = (teacher && teacher.age) ? `${teacher.age} anos` : '';
  const gender = (teacher && teacher.gender) || 'Feminino';
  const ageGenderStr = age ? `${age} • ${gender}` : gender;
  const avatar = gender === 'Masculino' ? '👨‍🏫' : '👩‍🏫';

  const avatarEl = document.getElementById('miniProfileAvatar');
  const nickEl = document.getElementById('miniProfileNickname');
  const nameEl = document.getElementById('miniProfileFullName');
  const emailEl = document.getElementById('miniProfileEmail');
  const phoneEl = document.getElementById('miniProfilePhone');
  const ageGenderEl = document.getElementById('miniProfileAgeGender');

  if (avatarEl) avatarEl.textContent = avatar;
  if (nickEl) nickEl.textContent = nickname;
  if (nameEl) nameEl.textContent = fullName;
  if (emailEl) emailEl.textContent = email;
  if (phoneEl) phoneEl.textContent = phone;
  if (ageGenderEl) ageGenderEl.textContent = ageGenderStr;

  modal.classList.add('active');
}

function openTeacherProfileModal(isFirstTime = false) {
  const modal = document.getElementById('teacherModalOverlay');
  const user = State.currentUser;
  const teacher = State.currentTeacher;
  const groupMasterKey = document.getElementById('groupMasterKey');

  document.getElementById('teacherFullName').value = (teacher && teacher.fullName) || (user && user.displayName) || '';
  document.getElementById('teacherGender').value = (teacher && teacher.gender) || 'Feminino';
  document.getElementById('teacherAge').value = (teacher && teacher.age) || '';
  document.getElementById('teacherPhone').value = (teacher && teacher.phone) || '';
  
  if (teacher && teacher.nickname) {
    document.getElementById('teacherNickname').value = teacher.nickname;
  } else {
    const fullName = (user && user.displayName) || '';
    if (fullName) {
      document.getElementById('teacherNickname').value = generateCuteNickname(fullName, document.getElementById('teacherGender').value);
    } else {
      document.getElementById('teacherNickname').value = '';
    }
  }

  // Chave de acesso e PIN
  const isNew = !teacher || !teacher.isRegistered;
  if (groupMasterKey) {
    groupMasterKey.style.display = isNew ? 'block' : 'none';
  }
  document.getElementById('teacherMasterKey').value = '';
  document.getElementById('teacherPinCode').value = (teacher && teacher.pinCode) || '';

  modal.classList.add('active');
}

async function saveTeacherProfile(e) {
  e.preventDefault();
  const fullName = document.getElementById('teacherFullName').value.trim();
  const gender = document.getElementById('teacherGender').value;
  const age = document.getElementById('teacherAge').value.trim();
  const phone = document.getElementById('teacherPhone').value.trim();
  const nickname = document.getElementById('teacherNickname').value.trim() || generateCuteNickname(fullName, gender);
  
  const isNew = !State.currentTeacher || !State.currentTeacher.isRegistered;
  const masterKeyInput = document.getElementById('teacherMasterKey').value.trim();

  // Validação da Chave Master Secreta da Unidade
  if (isNew) {
    if (masterKeyInput !== MASTER_UNIT_KEY) {
      if (window.kumonAudio) window.kumonAudio.playAlert();
      alert('⚠️ Chave Secreta da Unidade incorreta!\nPara prevenir acessos não autorizados, insira a combinação oficial de orientador.');
      return;
    }
  }

  // Validação do PIN de 4 dígitos
  const pinCodeInput = document.getElementById('teacherPinCode').value.trim();
  if (!/^\d{4}$/.test(pinCodeInput)) {
    if (window.kumonAudio) window.kumonAudio.playAlert();
    alert('⚠️ O PIN de segurança deve conter exatamente 4 números (ex: 1234)!');
    return;
  }

  const profileData = {
    fullName,
    gender,
    age: age ? parseInt(age, 10) : null,
    phone,
    nickname,
    pinCode: pinCodeInput,
    isRegistered: true,
    email: State.currentUser ? State.currentUser.email : ''
  };

  if (KumonFirebase.currentUser) {
    await KumonFirebase.saveTeacherProfile(KumonFirebase.currentUser.uid, profileData);
  } else {
    State.currentTeacher = profileData;
  }

  State.isPinUnlocked = true;
  updateTeacherHeaderUI(profileData);
  document.getElementById('teacherModalOverlay').classList.remove('active');
  showAppDashboard(true);

  if (window.kumonAudio) window.kumonAudio.playCheckIn();
  alert(`Cadastro autorizado com sucesso! Bem-vindo(a), ${nickname}!`);
}

function updateLiveTimers() {
  const activeStudents = State.attendances.filter(a => a.date === getTodayDateString() && a.status === 'in');
  if (activeStudents.length > 0) {
    renderLiveStudents();
  }
}

// ==========================================================================
// 14. UTILITÁRIOS DE DATA E HORA
// ==========================================================================
function getTodayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCurrentTimeString() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function calculateDurationInMinutes(startTimeStr, endTimeStr) {
  if (!startTimeStr || !endTimeStr) return 0;
  const [h1, m1] = startTimeStr.split(':').map(Number);
  const [h2, m2] = endTimeStr.split(':').map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60; // Caso cruze meia noite
  return diff;
}

// Expõe funções necessárias para cliques inline no HTML
window.openEditStudentModal = openEditStudentModal;
window.openTeacherMiniProfileModal = openTeacherMiniProfileModal;
window.viewStudentCard = viewStudentCard;
window.confirmDeleteStudent = confirmDeleteStudent;
window.handleCheckInOut = handleCheckInOut;
