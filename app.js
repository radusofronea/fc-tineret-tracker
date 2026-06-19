/* ===================== Storage ===================== */
const STORAGE_KEY = 'fcYouthTrackerData_v1';

function loadPlayers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function savePlayers(players) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}
let PLAYERS = loadPlayers();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ===================== Constants ===================== */
const POSITIONS = ['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'];

const POTENTIAL_TEXT_OPTIONS = [
  { value: 'club_since', label: 'At the club since 20XX', range: '< 80' },
  { value: 'great_potential', label: 'Showing Great Potential', range: '80-84' },
  { value: 'exciting_prospect', label: 'An Exciting Prospect', range: '85-89' },
  { value: 'special_potential', label: 'Has Potential To Be Special', range: '90+' },
];

const MONTH_NAMES = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','noi','dec'];

/* ===================== Router ===================== */
let CURRENT_VIEW = { name: 'list' };
let OPEN_MODAL = null; // {type, playerId}

function navigate(view) {
  CURRENT_VIEW = view;
  OPEN_MODAL = null;
  render();
}

/* ===================== Helpers ===================== */
function getPlayer(id) {
  return PLAYERS.find(p => p.id === id);
}
function latestSnapshot(player) {
  return player.snapshots[player.snapshots.length - 1];
}
function firstSnapshot(player) {
  return player.snapshots[0];
}
function isPromoted(player) {
  return player.snapshots.some(s => s.stage === 'club');
}
function firstClubSnapshot(player) {
  return player.snapshots.find(s => s.stage === 'club');
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ro-RO', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtMoney(v) {
  if (v === undefined || v === null || v === '') return '-';
  const n = Number(v);
  if (n >= 1000000) {
    let s = (n / 1000000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${s} M €`;
  }
  return `${Math.round(n / 1000)} K €`;
}
function splitMoney(v) {
  if (v === undefined || v === null || v === '') return { amount: '', unit: 'K' };
  const n = Number(v);
  if (n >= 1000000) {
    let s = (n / 1000000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return { amount: s, unit: 'M' };
  }
  return { amount: String(Math.round(n / 1000)), unit: 'K' };
}
function moneyFromForm(fd) {
  const amount = fd.get('marketValueAmount');
  if (!amount) return null;
  const unit = fd.get('marketValueUnit');
  return Number(amount) * (unit === 'M' ? 1000000 : 1000);
}
function fmtGameDate(year, month) {
  if (!year) return null;
  if (month) return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
  return String(year);
}
function potentialTextLabel(value) {
  const o = POTENTIAL_TEXT_OPTIONS.find(o => o.value === value);
  return o ? o.label : value;
}
function deltaSpan(diff, unit) {
  if (diff === null || diff === undefined || isNaN(diff)) return '';
  if (diff === 0) return `<span class="delta flat">= ${unit || ''}</span>`;
  const cls = diff > 0 ? 'up' : 'down';
  const sign = diff > 0 ? '+' : '';
  return `<span class="delta ${cls}">${sign}${diff}${unit || ''}</span>`;
}

/* ===================== Render root ===================== */
function render() {
  const app = document.getElementById('app');
  let html = '';
  if (CURRENT_VIEW.name === 'list') html = renderList();
  else if (CURRENT_VIEW.name === 'add') html = renderAddForm();
  else if (CURRENT_VIEW.name === 'detail') html = renderDetail(CURRENT_VIEW.id);
  app.innerHTML = html;

  if (OPEN_MODAL) {
    app.insertAdjacentHTML('beforeend', renderModal(OPEN_MODAL));
  }

  attachHandlers();
  if (CURRENT_VIEW.name === 'detail' && !OPEN_MODAL) {
    drawChart(getPlayer(CURRENT_VIEW.id));
  }
}

/* ===================== List view ===================== */
function renderList() {
  const filter = CURRENT_VIEW.filter || 'all';
  let players = PLAYERS.slice().sort((a, b) => {
    const la = latestSnapshot(a), lb = latestSnapshot(b);
    return lb.date.localeCompare(la.date);
  });
  if (filter === 'youth') players = players.filter(p => !isPromoted(p));
  if (filter === 'club') players = players.filter(p => isPromoted(p));

  const counts = {
    all: PLAYERS.length,
    youth: PLAYERS.filter(p => !isPromoted(p)).length,
    club: PLAYERS.filter(p => isPromoted(p)).length,
  };

  let cards = '';
  if (players.length === 0) {
    cards = `<div class="empty">Niciun jucător aici încă.<br>Apasă + pentru a adăuga primul jucător de tineret.</div>`;
  } else {
    cards = players.map(p => {
      const last = latestSnapshot(p);
      const promoted = isPromoted(p);
      return `
      <div class="card player-card" data-action="open" data-id="${p.id}">
        <div class="pos-badge">${p.position}</div>
        <div class="player-info">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="sub">Vârstă ${last.age} · ${last.potentialExact ? 'POT real ' + last.potentialExact : 'POT ' + p.potentialRange}</div>
          <span class="chip ${promoted ? 'promoted' : 'youth'}">${promoted ? potentialTextLabel(last.potentialText) || 'La echipa mare' : 'La tineret'}</span>
        </div>
        <div class="player-stats">
          <div class="ovr">${last.ovr}</div>
          <div class="sub">OVR</div>
        </div>
      </div>`;
    }).join('');
  }

  return `
    <div class="topbar">
      <h1>⚽ FC Tineret Tracker</h1>
    </div>
    <div class="tabs">
      <div class="tab ${filter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">Toți (${counts.all})</div>
      <div class="tab ${filter === 'youth' ? 'active' : ''}" data-action="filter" data-filter="youth">Tineret (${counts.youth})</div>
      <div class="tab ${filter === 'club' ? 'active' : ''}" data-action="filter" data-filter="club">Echipa mare (${counts.club})</div>
    </div>
    ${cards}
    <button class="fab" data-action="add">+</button>
  `;
}

/* ===================== Add player form ===================== */
function renderAddForm() {
  const months = MONTH_NAMES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');

  return `
    <div class="topbar">
      <button class="back" data-action="back">← Înapoi</button>
      <h2 style="margin:0;">Jucător nou (tineret)</h2>
      <span></span>
    </div>
    <form id="add-form">
      <label>Nume</label>
      <input type="text" name="name" required placeholder="ex: João Silva">

      <div class="row2">
        <div>
          <label>Poziție</label>
          <select name="position">
            ${POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Vârstă</label>
          <input type="number" name="age" required min="14" max="22" placeholder="17">
        </div>
      </div>

      <div class="row2">
        <div>
          <label>OVR</label>
          <input type="number" name="ovr" required min="40" max="99" placeholder="62">
        </div>
      </div>

      <label>Potențial (interval inițial)</label>
      <div class="row2">
        <div><input type="number" name="potentialMin" min="40" max="99" placeholder="ex: 70"></div>
        <div><input type="number" name="potentialMax" min="40" max="99" placeholder="ex: 94"></div>
      </div>

      <label>Potențial real tineret</label>
      <input type="number" name="potentialExact" min="40" max="99" placeholder="opțional">
      <div class="hint">Cifra exactă, dacă a apărut deja dintr-un meci de tineret. Acest câmp nu apare în grafic.</div>

      <label>Când l-ai găsit, în joc (opțional)</label>
      <div class="row2">
        <div>
          <select name="gameMonth">
            <option value="">Luna (opțional)</option>
            ${months}
          </select>
        </div>
        <div><input type="number" name="gameYear" min="2000" max="2100" placeholder="Anul, ex: 2026"></div>
      </div>
      <div class="hint">Util ca să vezi mai târziu evoluția pe ani de joc. Poți lăsa liber dacă nu mai știi.</div>

      <div class="form-actions">
        <button type="button" class="btn secondary full" data-action="back">Anulează</button>
        <button type="submit" class="btn full">Salvează</button>
      </div>
    </form>
  `;
}

/* ===================== Detail view ===================== */
function renderDetail(id) {
  const player = getPlayer(id);
  if (!player) {
    navigate({ name: 'list' });
    return '';
  }
  const last = latestSnapshot(player);
  const first = firstSnapshot(player);
  const promoted = isPromoted(player);
  const promo = firstClubSnapshot(player);
  const prev = player.snapshots.length > 1 ? player.snapshots[player.snapshots.length - 2] : null;

  const ovrDeltaTotal = last.ovr - first.ovr;
  const ageDeltaTotal = last.age - first.age;
  const ovrDeltaYear = prev ? last.ovr - prev.ovr : null;
  const ageDeltaYear = prev ? last.age - prev.age : null;

  let marketValueBlock = '';
  if (promoted) {
    const lastMV = [...player.snapshots].reverse().find(s => s.marketValue !== undefined && s.marketValue !== null && s.marketValue !== '');
    const prevMV = [...player.snapshots].reverse().filter(s => s.marketValue !== undefined && s.marketValue !== null && s.marketValue !== '');
    const mvDelta = prevMV.length > 1 ? (Number(prevMV[0].marketValue) - Number(prevMV[1].marketValue)) : null;
    marketValueBlock = `
      <div class="stat-box">
        <div class="label">Valoare de piață</div>
        <div class="value">${lastMV ? fmtMoney(lastMV.marketValue) : '-'}</div>
        ${mvDelta !== null ? deltaSpan(mvDelta > 0 ? Math.round(mvDelta) : Math.round(mvDelta), '') : ''}
      </div>
      <div class="stat-box">
        <div class="label">Potențial (text)</div>
        <div class="value" style="font-size:0.95rem;">${potentialTextLabel(last.potentialText) || '-'}</div>
      </div>
    `;
  }

  const history = player.snapshots.slice().reverse().map((s, idx) => {
    const isFirst = idx === player.snapshots.length - 1;
    const stageLabel = s.stage === 'club' ? 'Echipa mare' : 'Tineret';
    let details = `Vârstă ${s.age} · OVR ${s.ovr}`;
    if (s.potentialExact) details += ` · Potențial real tineret ${s.potentialExact}`;
    if (s.stage === 'club') {
      if (s.potentialText) details += ` · ${potentialTextLabel(s.potentialText)}`;
      if (s.marketValue) details += ` · ${fmtMoney(s.marketValue)}`;
    }
    const gameDate = fmtGameDate(s.gameYear, s.gameMonth);
    const whenLabel = gameDate ? gameDate : `${fmtDate(s.date)} <span class="hint" style="margin:0;display:inline;">(an de joc necunoscut)</span>`;
    return `
      <div class="history-item">
        <div class="when">${isFirst ? 'Descoperit' : (s.isPromotion ? 'Promovat la echipa mare' : 'Actualizare')} · ${whenLabel} <span class="chip ${s.stage === 'club' ? 'promoted' : 'youth'}" style="margin-top:0;">${stageLabel}</span></div>
        <div class="details">${details}</div>
        <div class="hint" style="margin-top:2px;">adăugat în aplicație: ${fmtDate(s.date)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="topbar">
      <button class="back" data-action="back">← Înapoi</button>
      <span></span>
    </div>
    <div class="detail-header">
      <div class="pos-badge">${player.position}</div>
      <div>
        <div class="name">${escapeHtml(player.name)}</div>
        <div class="sub">${promoted ? 'La echipa mare' : 'La tineret'} · Descoperit ${fmtDate(first.date)}</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-box">
        <div class="label">Vârstă</div>
        <div class="value">${last.age}</div>
        ${ageDeltaYear !== null ? deltaSpan(ageDeltaYear, ' an. trec.') : ''}
      </div>
      <div class="stat-box">
        <div class="label">OVR</div>
        <div class="value">${last.ovr}</div>
        ${ovrDeltaYear !== null ? deltaSpan(ovrDeltaYear, ' an. trec.') : ''}
      </div>
      <div class="stat-box">
        <div class="label">Potențial real tineret</div>
        <div class="value">${last.potentialExact || '-'}</div>
        <div class="hint" style="margin:0;">interval inițial: ${player.potentialRange}</div>
      </div>
      <div class="stat-box">
        <div class="label">Total (de la descoperire)</div>
        <div class="value">${deltaSpan(ovrDeltaTotal, ' OVR')}</div>
        <div class="hint" style="margin:0;">în ${ageDeltaTotal} ani</div>
      </div>
      ${marketValueBlock}
    </div>

    <div class="chart-wrap">
      <canvas id="evo-chart" height="180"></canvas>
    </div>

    <div class="actions-row">
      ${!promoted ? `<button class="btn full" data-action="open-modal" data-modal="promote" data-id="${player.id}">Promovează la echipa mare</button>` : ''}
      <button class="btn ${promoted ? 'full' : 'secondary'}" data-action="open-modal" data-modal="update" data-id="${player.id}">Actualizare anuală</button>
    </div>
    <div class="actions-row">
      <button class="btn danger full" data-action="delete" data-id="${player.id}">Șterge jucător</button>
    </div>

    <div class="section-title"><h3>Istoric</h3></div>
    ${history}
  `;
}

/* ===================== Modal: promote / update ===================== */
function renderModal(modal) {
  const player = getPlayer(modal.playerId);
  const last = latestSnapshot(player);
  const months = MONTH_NAMES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');

  if (modal.type === 'promote') {
    return `
    <div class="modal-overlay" data-action="close-modal">
      <div class="modal" data-stop="1">
        <h2>Promovează la echipa mare</h2>
        <div class="sub">${escapeHtml(player.name)} — introdu datele curente</div>
        <form id="modal-form" data-kind="promote">
          <div class="row2">
            <div><label>Vârstă</label><input type="number" name="age" required value="${last.age}"></div>
            <div><label>OVR</label><input type="number" name="ovr" required value="${last.ovr}"></div>
          </div>
          <label>Potențial real tineret (dacă a apărut)</label>
          <input type="number" name="potentialExact" value="${last.potentialExact || ''}">

          <label>Potențial (text, la echipa mare)</label>
          <select name="potentialText">
            ${POTENTIAL_TEXT_OPTIONS.map(o => `<option value="${o.value}">${o.label} (${o.range})</option>`).join('')}
          </select>

          <label>Valoare de piață la transfer</label>
          <div class="row2">
            <div><input type="number" name="marketValueAmount" min="0" step="0.01" placeholder="ex: 450 sau 1.2"></div>
            <div>
              <select name="marketValueUnit">
                <option value="K">K (mii €)</option>
                <option value="M">M (milioane €)</option>
              </select>
            </div>
          </div>

          <label>Luna/anul din joc al promovării (opțional)</label>
          <div class="row2">
            <div>
              <select name="gameMonth">
                <option value="">Luna (opțional)</option>
                ${months}
              </select>
            </div>
            <div><input type="number" name="gameYear" min="2000" max="2100" placeholder="Anul, ex: 2027"></div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn secondary full" data-action="close-modal">Anulează</button>
            <button type="submit" class="btn full">Confirmă</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (modal.type === 'update') {
    const promoted = isPromoted(player);
    const mv = splitMoney(lastMarketValue(player));
    return `
    <div class="modal-overlay" data-action="close-modal">
      <div class="modal" data-stop="1">
        <h2>Actualizare anuală</h2>
        <div class="sub">${escapeHtml(player.name)} — ${fmtDate(new Date().toISOString())}</div>
        <form id="modal-form" data-kind="update">
          <div class="row2">
            <div><label>Vârstă</label><input type="number" name="age" required value="${last.age}"></div>
            <div><label>OVR</label><input type="number" name="ovr" required value="${last.ovr}"></div>
          </div>
          <label>Potențial real tineret</label>
          <input type="number" name="potentialExact" value="${last.potentialExact || ''}">

          ${promoted ? `
          <label>Potențial (text)</label>
          <select name="potentialText">
            ${POTENTIAL_TEXT_OPTIONS.map(o => `<option value="${o.value}" ${last.potentialText === o.value ? 'selected' : ''}>${o.label} (${o.range})</option>`).join('')}
          </select>
          <label>Valoare de piață curentă</label>
          <div class="row2">
            <div><input type="number" name="marketValueAmount" min="0" step="0.01" value="${mv.amount}"></div>
            <div>
              <select name="marketValueUnit">
                <option value="K" ${mv.unit === 'K' ? 'selected' : ''}>K (mii €)</option>
                <option value="M" ${mv.unit === 'M' ? 'selected' : ''}>M (milioane €)</option>
              </select>
            </div>
          </div>
          ` : ''}

          <label>Luna/anul din joc al acestei actualizări (opțional)</label>
          <div class="row2">
            <div>
              <select name="gameMonth">
                <option value="">Luna (opțional)</option>
                ${months}
              </select>
            </div>
            <div><input type="number" name="gameYear" min="2000" max="2100" placeholder="Anul"></div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn secondary full" data-action="close-modal">Anulează</button>
            <button type="submit" class="btn full">Salvează</button>
          </div>
        </form>
      </div>
    </div>`;
  }
  return '';
}
function lastMarketValue(player) {
  const s = [...player.snapshots].reverse().find(s => s.marketValue);
  return s ? s.marketValue : '';
}

/* ===================== Chart ===================== */
let CHART_INSTANCE = null;
function drawChart(player) {
  const canvas = document.getElementById('evo-chart');
  if (!canvas) return;
  if (CHART_INSTANCE) { CHART_INSTANCE.destroy(); CHART_INSTANCE = null; }
  const labels = player.snapshots.map(s => {
    const gameDate = fmtGameDate(s.gameYear, s.gameMonth);
    return `${gameDate || fmtDate(s.date)} (${s.age}a)`;
  });
  const ovrData = player.snapshots.map(s => s.ovr);

  CHART_INSTANCE = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'OVR',
          data: ovrData,
          borderColor: '#3ddc84',
          backgroundColor: 'rgba(61,220,132,.15)',
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#eef0f4' } },
      },
      scales: {
        x: { ticks: { color: '#8d93a3' }, grid: { color: '#2a2f3a' } },
        y: { ticks: { color: '#8d93a3' }, grid: { color: '#2a2f3a' } },
      },
    },
  });
}

/* ===================== Event handling ===================== */
function attachHandlers() {
  const app = document.getElementById('app');

  app.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      const action = el.dataset.action;
      if (action === 'open') {
        navigate({ name: 'detail', id: el.dataset.id });
      } else if (action === 'add') {
        navigate({ name: 'add' });
      } else if (action === 'back') {
        navigate({ name: 'list', filter: CURRENT_VIEW.filter });
      } else if (action === 'filter') {
        navigate({ name: 'list', filter: el.dataset.filter });
      } else if (action === 'open-modal') {
        OPEN_MODAL = { type: el.dataset.modal, playerId: el.dataset.id };
        render();
      } else if (action === 'close-modal') {
        if (e.target === el) { OPEN_MODAL = null; render(); }
      } else if (action === 'delete') {
        if (confirm('Ștergi acest jucător și tot istoricul lui?')) {
          PLAYERS = PLAYERS.filter(p => p.id !== el.dataset.id);
          savePlayers(PLAYERS);
          navigate({ name: 'list' });
        }
      }
    });
  });

  const modalContent = app.querySelector('.modal');
  if (modalContent) {
    modalContent.addEventListener('click', e => e.stopPropagation());
  }

  const addForm = document.getElementById('add-form');
  if (addForm) {
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(addForm);
      const potentialExactRaw = fd.get('potentialExact');
      const potMin = fd.get('potentialMin') || 70;
      const potMax = fd.get('potentialMax') || 94;
      const player = {
        id: uid(),
        position: fd.get('position'),
        name: fd.get('name').trim(),
        potentialRange: `${potMin}-${potMax}`,
        snapshots: [{
          date: new Date().toISOString(),
          age: Number(fd.get('age')),
          ovr: Number(fd.get('ovr')),
          potentialExact: potentialExactRaw ? Number(potentialExactRaw) : null,
          gameYear: fd.get('gameYear') ? Number(fd.get('gameYear')) : null,
          gameMonth: fd.get('gameMonth') ? Number(fd.get('gameMonth')) : null,
          stage: 'youth',
        }],
      };
      PLAYERS.push(player);
      savePlayers(PLAYERS);
      navigate({ name: 'detail', id: player.id });
    });
  }

  const modalForm = document.getElementById('modal-form');
  if (modalForm) {
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(modalForm);
      const kind = modalForm.dataset.kind;
      const player = getPlayer(OPEN_MODAL.playerId);
      const potentialExactRaw = fd.get('potentialExact');

      const snapshot = {
        date: new Date().toISOString(),
        age: Number(fd.get('age')),
        ovr: Number(fd.get('ovr')),
        potentialExact: potentialExactRaw ? Number(potentialExactRaw) : null,
        gameYear: fd.get('gameYear') ? Number(fd.get('gameYear')) : null,
        gameMonth: fd.get('gameMonth') ? Number(fd.get('gameMonth')) : null,
      };

      if (kind === 'promote') {
        snapshot.stage = 'club';
        snapshot.isPromotion = true;
        snapshot.potentialText = fd.get('potentialText');
        snapshot.marketValue = moneyFromForm(fd);
      } else {
        const promoted = isPromoted(player);
        snapshot.stage = promoted ? 'club' : 'youth';
        if (promoted) {
          snapshot.potentialText = fd.get('potentialText');
          snapshot.marketValue = moneyFromForm(fd);
        }
      }

      player.snapshots.push(snapshot);
      savePlayers(PLAYERS);
      OPEN_MODAL = null;
      navigate({ name: 'detail', id: player.id });
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ===================== Init ===================== */
render();
