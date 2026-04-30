// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let state = {
  config: null,
  managers: [],
  currentManager: null,
  currentShift: 'morning',
  tasks: { morning: [], night: [] },
  completions: [],
  shiftLogs: [],
  completionSigner: null
};
let lastMidnightReset = null;
let logFilterDate = null;
let justToggledId = null;

const DEFAULT_TASKS = {
  morning: [
    { id: 'm1', name: 'Clean all stations', section: 'Cleaning' },
    { id: 'm2', name: 'Mop floors', section: 'Cleaning' },
    { id: 'm3', name: 'Wash dishes', section: 'Cleaning' },
    { id: 'm4', name: 'Side prep', section: 'Food Prep' },
    { id: 'm5', name: 'Fill up all stations', section: 'Food Prep' },
    { id: 'm6', name: 'Change trash bag', section: 'Cleaning' },
    { id: 'm7', name: 'Complete red book', section: 'Manager' },
  ],
  night: [
    { id: 'n1', name: 'Clean all stations', section: 'Cleaning' },
    { id: 'n2', name: 'Mop floors', section: 'Cleaning' },
    { id: 'n3', name: 'Wash dishes & sanitize', section: 'Cleaning' },
    { id: 'n4', name: 'Restock for morning', section: 'Stocking' },
    { id: 'n5', name: 'Take out trash', section: 'Closing' },
    { id: 'n6', name: 'Check equipment & log issues', section: 'Closing' },
    { id: 'n7', name: 'Complete red book from WorkPulse', section: 'Manager' },
  ]
};

const DEFAULT_CONFIG = {};

// ── PERSIST ──
// Tasks are always sourced from code (DEFAULT_TASKS), never from localStorage.
// Only completions, shiftLogs, and managers are persisted.
function save() {
  localStorage.setItem('dd_state', JSON.stringify({
    managers:   state.managers,
    completions: state.completions,
    shiftLogs:  state.shiftLogs
  }));
}

function load() {
  const raw = localStorage.getItem('dd_state');
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.managers))   state.managers   = saved.managers;
      if (Array.isArray(saved.completions)) state.completions = saved.completions;
      if (Array.isArray(saved.shiftLogs))  state.shiftLogs  = saved.shiftLogs;
    } catch(e) {}
  }
}

function ensureDefaults() {
  state.config = {};
  // Tasks always come from code — never from localStorage
  state.tasks.morning = DEFAULT_TASKS.morning.map(t => ({ ...t }));
  state.tasks.night   = DEFAULT_TASKS.night.map(t => ({ ...t }));
  if (!state.managers.length) state.managers = [{ id: 'mgr1', name: 'Manager', role: 'Manager' }];
}

// ── TIME HELPERS ──
function fmt12(h, m) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function timeToMins(t) {
  const [h,m] = t.split(':').map(Number);
  return h * 60 + m;
}
function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function fmtTimeNow() {
  const n = new Date();
  return fmt12(n.getHours(), n.getMinutes());
}

// ── CLOCK ──
function startClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  el.textContent = fmtTimeNow();
  setInterval(() => { if (el) el.textContent = fmtTimeNow(); }, 10000);
}

// ══════════════════════════════════════════
// ROUTING
// ══════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ══════════════════════════════════════════
// THEME
// ══════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('dd_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtns(saved);
}

function toggleTheme(event) {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';

  const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dd_theme', next);
    updateThemeBtns(next);
  };

  if (!document.startViewTransition) { applyTheme(); return; }

  const btn = event?.currentTarget || event?.target;
  const rect = btn?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width  / 2 : window.innerWidth  / 2;
  const y = rect ? rect.top  + rect.height / 2 : window.innerHeight / 2;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const root = document.documentElement;
  root.style.setProperty('--vt-x', x + 'px');
  root.style.setProperty('--vt-y', y + 'px');
  root.style.setProperty('--vt-r', r + 'px');

  document.startViewTransition(applyTheme);
}

function updateThemeBtns(theme) {
  const icon = theme === 'dark' ? '☀' : '🌙';
  ['theme-btn-main', 'theme-btn-admin', 'theme-btn-checkin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
}

function init() {
  load();
  ensureDefaults();
  initTheme();
  scheduleMidnightReset();
  logFilterDate = new Date().toISOString().slice(0,10);
  goCheckin();
}

function goCheckin() {
  state.currentManager = null;
  state.completionSigner = null;
  selectedShift = null;
  detectShift();
  renderCheckin();
  showScreen('checkin-screen');
}

function showMain() { showScreen('main-screen'); renderMain(); }
function showAdmin() { showScreen('admin-screen'); renderAdmin(); }

// ══════════════════════════════════════════
// SHIFT DETECTION
// ══════════════════════════════════════════
function detectShift() {
  // No automatic shift detection by time; shift is selected manually.
}

// ══════════════════════════════════════════
// CHECK-IN
// ══════════════════════════════════════════
let selectedShift = null;

function renderCheckin() {
  if (!state.config) return;
  document.getElementById('checkin-shift-label').textContent =
    selectedShift ? (selectedShift === 'morning' ? 'Morning Shift' : 'Night Shift') : 'Select a Shift';

  const opts = [
    { id: 'morning', label: 'Morning Shift', icon: '☀️', desc: 'Opening duties & daily prep' },
    { id: 'night',   label: 'Night Shift',   icon: '🌙', desc: 'Closing duties & restocking' }
  ];

  const list = document.getElementById('manager-list');
  list.className = 'shift-option-list';
  list.innerHTML = opts.map(opt => {
    const sel = selectedShift === opt.id ? 'selected' : '';
    return `
      <button class="shift-option-btn ${sel}" id="shift-${opt.id}" onclick="selectShift('${opt.id}')">
        <div class="shift-icon">${opt.icon}</div>
        <div class="shift-option-info">
          <div class="shift-option-name">${opt.label}</div>
          <div class="shift-option-desc">${opt.desc}</div>
        </div>
      </button>`;
  }).join('');

  document.getElementById('checkin-confirm-btn').classList.toggle('ready', !!selectedShift);
}

function selectShift(shift) {
  selectedShift = shift;
  document.querySelectorAll('.shift-option-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById('shift-' + shift);
  if (btn) btn.classList.add('selected');
  document.getElementById('checkin-shift-label').textContent = shift === 'morning' ? 'Morning Shift' : 'Night Shift';
  document.getElementById('checkin-confirm-btn').classList.add('ready');
}

function confirmCheckin() {
  const shift = selectedShift || state.currentShift;
  state.currentShift = shift;
  if (!state.managers.length) state.managers = [{ id: 'mgr1', name: 'Manager', role: 'Manager' }];
  state.currentManager = state.currentManager || state.managers[0];
  save();
  showMain();
  startClock();
  scheduleReminders();
}

// ══════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════
function renderMain() {
  if (!state.config) return;
  const manager = state.currentManager || state.managers[0] || { name: '—' };
  document.getElementById('header-manager').textContent = manager.name;

  const shift = state.currentShift;
  document.getElementById('tab-morning').className = `shift-tab ${shift==='morning'?'active':'inactive'}`;
  document.getElementById('tab-night').className   = `shift-tab ${shift==='night'?'active':'inactive'}`;

  const tasks = state.tasks[shift] || [];
  const today = new Date().toDateString();
  const doneIds = new Set(
    state.completions
      .filter(c => c.shift === shift && c.date === today)
      .map(c => c.taskId)
  );
  const total = tasks.length;
  const done  = [...doneIds].filter(id => tasks.find(t=>t.id===id)).length;
  const pct   = total ? Math.round((done/total)*100) : 0;
  const circumference = 2 * Math.PI * 22;
  const dash = circumference * (1 - pct/100);

  const sections = {};
  tasks.forEach(t => {
    if (!sections[t.section]) sections[t.section] = [];
    sections[t.section].push(t);
  });

  // Shift timing is not displayed; users select the shift manually.

  let html = `
    <div class="progress-banner">
      <div class="prog-ring">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--border)" stroke-width="5"/>
          <circle cx="28" cy="28" r="22" fill="none" stroke="#FF6B00" stroke-width="5"
            stroke-dasharray="${circumference}" stroke-dashoffset="${dash}"
            stroke-linecap="round"/>
        </svg>
        <div class="prog-ring-label">${pct}%</div>
      </div>
      <div class="prog-info">
        <div class="prog-title">${shift==='morning'?'Morning':'Night'} checklist</div>
        <div class="prog-sub">${done} of ${total} tasks complete</div>
      </div>
      <div class="prog-manager">
        <div class="prog-manager-name">${manager.name}</div>
        <div class="prog-manager-time">Checked in ${fmtTimeNow()}</div>
      </div>
    </div>
  `;



  Object.entries(sections).forEach(([section, stasks]) => {
    html += `<div class="section-label">${section}</div><div class="task-list">`;
    stasks.forEach(t => {
      const isDone = doneIds.has(t.id);
      const isJustChecked = justToggledId === t.id;
      const comp = state.completions.find(c => c.taskId===t.id && c.shift===shift && c.date===today);
      html += `
        <div class="task-item ${isDone?'completed':''}" onclick="toggleTask('${t.id}', event)">
          <div class="task-check ${isJustChecked?'pop':''}"><span class="checkmark">✓</span></div>
          <div class="task-content">
            <div class="task-name">${t.name}</div>
            ${isDone ? `<div class="task-meta">Done by ${comp.manager} at ${comp.time}</div>` : ''}
          </div>
          ${isDone ? `<div class="task-time-badge">${comp.time}</div>` : ''}
        </div>`;
    });
    html += `</div>`;
  });

  document.getElementById('app-body').innerHTML = html;

  const allDone = done === total && total > 0;
  const completeBtn = document.getElementById('complete-btn');
  completeBtn.textContent = allDone ? '✅ All Done!' : 'Mark Shift Complete';
  completeBtn.className = `btn-complete ${allDone ? 'done' : ''}`;

  const signatureEl = document.getElementById('signature-note');
  if (signatureEl) {
    if (state.completionSigner) {
      signatureEl.textContent = `Signed by ${state.completionSigner}`;
      signatureEl.classList.remove('hidden');
    } else {
      signatureEl.textContent = '';
      signatureEl.classList.add('hidden');
    }
  }
}

function switchShift(shift) {
  state.currentShift = shift;
  save();
  renderMain();
}

function toggleTask(taskId, event) {
  const today = new Date().toDateString();
  const shift = state.currentShift;
  const tasks = state.tasks[shift] || [];
  const prevDone = state.completions.filter(c => c.shift === shift && c.date === today).length;
  const existing = state.completions.findIndex(c => c.taskId===taskId && c.shift===shift && c.date===today);
  const isChecking = existing < 0;

  if (existing >= 0) {
    state.completions.splice(existing, 1);
  } else {
    state.completions.push({
      taskId,
      shift,
      date: today,
      manager: (state.currentManager || state.managers[0] || { name: '—' }).name,
      time: fmtTimeNow(),
      timestamp: Date.now()
    });
  }

  if (event) spawnRipple(event.clientX, event.clientY, isChecking);

  justToggledId = isChecking ? taskId : null;
  save();
  renderMain();
  setTimeout(() => { justToggledId = null; }, 500);

  const newDone = state.completions.filter(c => c.shift === shift && c.date === today).length;
  if (newDone === tasks.length && prevDone !== tasks.length) {
    if (event) setTimeout(() => spawnConfetti(event.clientX, event.clientY), 80);
    showCompletionSignatureModal();
  }
}

function spawnRipple(x, y, isCheck) {
  const el = document.createElement('div');
  el.className = 'task-ripple' + (isCheck ? ' task-ripple-check' : '');
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

function spawnConfetti(x, y) {
  const colors = ['#FF6B00','#FFD000','#FF4466','#44BB77','#4499FF','#FF88CC','#AA66FF'];
  for (let i = 0; i < 10; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    const angle = (i / 18) * 360 + Math.random() * 18;
    const dist  = 55 + Math.random() * 60;
    dot.style.cssText = `
      left:${x}px; top:${y}px;
      background:${colors[i % colors.length]};
      --dx:${Math.cos(angle * Math.PI / 180) * dist}px;
      --dy:${Math.sin(angle * Math.PI / 180) * dist}px;
      --dur:${0.55 + Math.random() * 0.25}s;
      width:${5 + Math.random() * 5}px;
      height:${5 + Math.random() * 5}px;
    `;
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 900);
  }
}

function showCompletionSignatureModal() {
  const warning = document.getElementById('completion-warning');
  if (warning) {
    warning.classList.remove('visible');
    warning.textContent = '';
  }
  document.getElementById('complete-modal-sub').textContent = 'All tasks are complete. Please sign off before the screenshot is taken.';
  document.getElementById('complete-signer-input').value = '';
  document.getElementById('complete-modal').classList.remove('hidden');
}

function setCompletionWarning(message) {
  const warning = document.getElementById('completion-warning');
  if (!warning) return;
  warning.textContent = message;
  warning.classList.add('visible');
}

function hideCompletionWarning() {
  const warning = document.getElementById('completion-warning');
  if (!warning) return;
  warning.classList.remove('visible');
  warning.textContent = '';
}

function submitCompletionSignature() {
  const nameInput = document.getElementById('complete-signer-input');
  const signer = nameInput.value.trim();
  if (!signer) {
    alert('Please enter your name to sign off.');
    return;
  }
  state.completionSigner = signer;
  save();
  closeModal('complete-modal');
  renderMain();
  const shift = state.currentShift;
  const filename = `${shift}-complete-${signer.replace(/\s+/g, '_')}-${Date.now()}.jpg`;
  captureScreenshot(filename).then(dataUrl => {
    if (dataUrl) {
      const now = new Date();
      state.shiftLogs.push({
        id: `log_${Date.now()}`,
        date: now.toDateString(),
        dateIso: now.toISOString().slice(0,10),
        shift,
        signer,
        time: fmtTimeNow(),
        timestamp: Date.now(),
        completed: state.tasks[shift]?.length || 0,
        total: state.tasks[shift]?.length || 0,
        screenshot: dataUrl,
        filename
      });
      save();
    }
    downloadScreenshot(dataUrl, filename);
    goCheckin();
  });
}

function captureScreenshot(filename) {
  const target = document.body;
  if (!target || typeof html2canvas !== 'function') return Promise.resolve(null);
  return html2canvas(target, {backgroundColor: null}).then(canvas => {
    return canvas.toDataURL('image/jpeg', 0.65);
  });
}

function downloadScreenshot(dataUrl, filename) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function markShiftComplete() {
  const today = new Date().toDateString();
  const shift = state.currentShift;
  const tasks = state.tasks[shift] || [];
  const done = state.completions.filter(c => c.shift===shift && c.date===today).length;
  if (tasks.length === 0) {
    setCompletionWarning('No tasks are available for this shift yet.');
    return;
  }
  if (done === tasks.length) {
    hideCompletionWarning();
    showCompletionSignatureModal();
  } else {
    setCompletionWarning(`Please finish all tasks before signing off. ${done} of ${tasks.length} completed.`);
  }
}

// ══════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════
function setLogFilterDate(value) {
  logFilterDate = value;
  renderAdmin();
}

function renderAdmin() {
  const cfg = state.config || {};
  const now = new Date();
  const selectedDate = logFilterDate || now.toISOString().slice(0,10);
  const filteredLogs = state.shiftLogs
    .filter(l => {
      const entryDateIso = l.dateIso || new Date(l.date).toISOString().slice(0,10);
      return entryDateIso === selectedDate;
    })
    .sort((a,b) => b.timestamp - a.timestamp);

  function renderLogSection(logs) {
    if (!logs.length) {
      return `
        <div class="admin-row"><div class="admin-row-label" style="color: var(--text3);">No logs for this date.</div></div>
      `;
    }
    return logs.map(log => `
      <div class="log-entry">
        <div class="log-entry-top">
          <div class="log-entry-title">${log.shift.charAt(0).toUpperCase() + log.shift.slice(1)} shift</div>
          <div class="log-entry-time">${log.time}</div>
        </div>
        <div class="log-entry-meta">${log.signer} · ${log.completed}/${log.total} tasks · ${log.date}</div>
        ${log.screenshot ? `<img class="log-screenshot-thumb" src="${log.screenshot}" alt="Shift screenshot">` : ''}
      </div>
    `).join('');
  }

  let html = `
    <div class="admin-section">
      <div class="admin-section-header">Shift Logs</div>
      <div class="admin-row">
        <label class="admin-row-label" for="log-date-filter">Filter date</label>
        <input type="date" id="log-date-filter" class="log-filter-input" value="${selectedDate}" onchange="setLogFilterDate(this.value)">
      </div>
      ${renderLogSection(filteredLogs)}
    </div>

    <div class="admin-section">
      <div class="admin-section-header">Danger Zone</div>
      <div class="admin-row">
        <button onclick="resetSetup()" style="color:var(--danger);background:none;border:none;font-family:inherit;font-size:14px;cursor:pointer;padding:0;font-weight:500;">Reset all data</button>
      </div>
    </div>
  `;

  document.getElementById('admin-body').innerHTML = html;
}

function deleteManager(id) {
  state.managers = state.managers.filter(m => m.id !== id);
  save();
  renderAdmin();
}


function resetSetup() {
  if (confirm('Reset all store data? This cannot be undone.')) {
    localStorage.removeItem('dd_state');
    location.reload();
  }
}

// ══════════════════════════════════════════
// REMINDERS / SOUND
// ══════════════════════════════════════════
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.25);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.25 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.5);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.6);
    });
  } catch(e) {}
}

function resetAtMidnight() {
  const now = new Date();
  const today = now.toDateString();
  if (now.getHours() !== 0 || now.getMinutes() !== 0) return;
  if (lastMidnightReset === today) return;
  lastMidnightReset = today;

  state.completions = [];
  state.currentManager = null;
  state.completionSigner = null;
  selectedShift = null;
  save();
  ensureDefaults();
  goCheckin();
}

function scheduleMidnightReset() {
  resetAtMidnight();
  setInterval(resetAtMidnight, 60000);
}

function scheduleReminders() {
  // Timing-based reminders are disabled because shift timing varies by location.
}

// ══════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════
init();
