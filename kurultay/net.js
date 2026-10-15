/* Kurultay — online play through the artifact's shared database.
   games/{code}               small record for the lobby list: seats, status, whose turn
   games/{code}/state/current the full game state; only the player whose turn it is writes it */
(function () {
  'use strict';
  const CC = window.CC;
  const Net = { db: null, user: null, uid: null, canWrite: null, checked: false, games: [], game: null };
  CC.Net = Net;
  const App = () => CC.App;
  const esc = (s) => CC.App.esc(s);
  const swatch = (c) => CC.App.swatch(c);
  const colorHex = (i) => CC.COLORS[i % CC.COLORS.length].hex;

  Net.ready = (async () => {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return false;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return false;
      const uid = await user.id();
      if (!uid) return false;
      Net.db = db; Net.user = user; Net.uid = uid;
      try { Net.canWrite = await user.can('data.write'); } catch (e) { Net.canWrite = null; }
      return true;
    } catch (e) { return false; }
  })().then((ok) => { Net.checked = true; if (Net.setupEl && Net.setupEl.isConnected) Net.renderSetup(Net.setupEl, Net.setupCfg, Net.startConfig); return ok; });

  function makeCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }
  const metaRef = (code) => Net.db.collection('games').doc(code);
  const stateRef = (code) => Net.db.collection('games').doc(code).collection('state').doc('current');
  const writeBlocked = () => Net.canWrite === false;
  const noWriteText = 'You can watch, but your access to this page is view-only. Ask its owner for Contributor access (or an Editor invite) to play.';

  // ------------------------------------------------------------ setup screen box
  Net.renderSetup = function (el, cfg, startConfig) {
    Net.setupEl = el; Net.setupCfg = cfg; Net.startConfig = startConfig;
    if (!Net.checked) { el.innerHTML = '<h3>Play online</h3><p class="estimate"><span class="spin"></span> Checking for online play…</p>'; return; }
    if (!Net.db) {
      // away from claude.ai: browser-to-browser play with a room code
      if (CC.P2P) { CC.P2P.renderSetup(el, cfg, startConfig); return; }
      el.innerHTML = '<h3>Play online</h3><p class="estimate">Online play is not available here.</p>';
      return;
    }
    el.innerHTML = `<h3>Play online with friends</h3>
      <p class="estimate">Set up the houses above first. Each <b>Human</b> house becomes a seat a friend can take; you sit in the first one. Friends open this same page on claude.ai and join from the list below.</p>
      ${writeBlocked() ? `<p class="err">${noWriteText}</p>` : '<div class="setup-foot" style="justify-content:flex-start"><button type="button" class="btn" data-net="host">Host an online game</button></div>'}
      <h3 style="margin-top:16px">Games on this page</h3><ul class="games" id="games-list"></ul>`;
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-net]');
        if (!b || b.disabled) return;
        if (b.dataset.net === 'host') hostGame();
        else if (b.dataset.net === 'open') openGame(b.dataset.code);
      });
    }
    subscribeList();
    renderList();
  };

  function subscribeList() {
    if (Net.listUnsub) return;
    Net.listUnsub = Net.db.collection('games').orderBy('updated', 'desc').limit(25).onSnapshot((snap) => {
      Net.games = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      renderList();
    }, () => { Net.listUnsub = null; });
  }

  function renderList() {
    const ul = Net.setupEl && Net.setupEl.querySelector('#games-list');
    if (!ul) return;
    const rows = Net.games.filter((g) => g.status !== 'gone').map((g) => {
      const seats = g.seats || [];
      const humans = seats.filter((s) => !s.ai);
      const taken = humans.filter((s) => s.uid).length;
      const mine = seats.some((s) => s.uid === Net.uid);
      const age = timeAgo(g.updated);
      let meta, label;
      if (g.status === 'lobby') { meta = `Gathering · ${taken} of ${humans.length} seats taken`; label = mine ? 'Open lobby' : 'Join'; }
      else if (g.status === 'playing') { meta = g.info || 'In progress'; label = mine ? 'Resume' : 'Watch'; }
      else { meta = g.info || 'Finished'; label = 'View'; }
      return `<li><div><b>${esc(g.name || g.id)}</b> <span class="meta">· ${g.id}${mine ? ' · your seat' : ''}</span><div class="meta">${esc(meta)} · ${age}</div></div>
        <button type="button" class="btn small" data-net="open" data-code="${esc(g.id)}">${label}</button></li>`;
    });
    ul.innerHTML = rows.length ? rows.join('') : '<li><span class="meta">No games yet. Host one, then tell your friends to open this page.</span></li>';
  }

  function timeAgo(ms) {
    if (!ms) return '';
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
  }

  async function hostGame() {
    const cfg = Net.startConfig();
    const humans = cfg.players.map((p, i) => (p.ai ? -1 : i)).filter((i) => i >= 0);
    if (!humans.length) { App().hint('Mark at least one house as Human to play online.'); return; }
    const code = makeCode();
    const seats = cfg.players.map((p, i) => ({ name: p.name, color: p.color, ai: p.ai, flag: p.flag || null, uid: i === humans[0] ? Net.uid : null }));
    const now = Date.now();
    try {
      await metaRef(code).set({
        name: `${seats[humans[0]].name}'s realm`, status: 'lobby', host: Net.uid, seats,
        settings: { size: cfg.size, map: cfg.map || 'realm', rounds: cfg.rounds, timer: cfg.timer, seed: cfg.seed == null ? null : cfg.seed },
        created: now, updated: now, info: '',
      });
    } catch (e) { App().hint(e && e.code === 'quota_exceeded' ? 'This page has too many saved games. Finish or delete some first.' : 'Could not create the game. Check that you can edit this page.'); return; }
    openGame(code);
  }

  // ------------------------------------------------------------ joining a game
  function openGame(code) {
    leaveGame();
    App().closeAllModals();
    const g = Net.game = { code, meta: null, rev: 0, lastWriter: null, writing: false, dirty: false, inGame: false, metaKey: '' };
    const ov = App().modal('<div id="lobby"><h2>Opening the game…</h2><p class="lead"><span class="spin"></span> Fetching the realm.</p></div>', { wide: true, dismiss: false });
    g.lobbyEl = ov.querySelector('#lobby');
    g.lobbyEl.addEventListener('click', onLobbyClick);
    g.unsubMeta = metaRef(code).onSnapshot((snap) => onMeta(g, snap), () => App().hint('Lost the connection to this game.'));
  }

  function onMeta(g, snap) {
    if (Net.game !== g) return;
    if (!snap.exists) {
      if (!g.inGame && g.lobbyEl) g.lobbyEl.innerHTML = '<h2>This game is gone</h2><p class="lead">The host cancelled it.</p><div class="modal-actions"><button class="btn primary" type="button" data-lobby="back">Back</button></div>';
      return;
    }
    g.meta = snap.data();
    if (g.meta.status === 'lobby') { renderLobby(g); return; }
    if (!g.unsubState) {
      g.unsubState = stateRef(g.code).onSnapshot((s) => onState(g, s), () => App().hint('Lost the connection to this game.'));
    }
    if (g.inGame) App().renderAll();
  }

  function onState(g, snap) {
    if (Net.game !== g || !snap.exists) return;
    const d = snap.data();
    if (!g.inGame) {
      g.inGame = true; g.rev = d.rev; g.lastWriter = d.lastBy; g.updated = d.updated;
      let st;
      try { st = CC.deserialize(d.save); } catch (e) { App().hint('This game could not be loaded.'); return; }
      App().closeAllModals();
      App().startLoaded(st, session);
      watchStalledAI(g, d);
      return;
    }
    if (snap.metadata && snap.metadata.hasPendingWrites) return;
    const newer = d.rev > g.rev || (d.rev === g.rev && d.lastBy !== Net.uid && d.lastBy !== g.lastWriter);
    if (!newer || g.writing) return;
    g.rev = d.rev; g.lastWriter = d.lastBy; g.updated = d.updated;
    let st;
    try { st = CC.deserialize(d.save); } catch (e) { return; }
    App().replaceState(st);
    watchStalledAI(g, d);
  }

  // If the player who should run the computer's turn has gone quiet, the host takes over.
  function watchStalledAI(g, d) {
    clearTimeout(g.aiTimer);
    const st = App().st;
    if (!st || st.over || !st.players[st.cur].ai || !g.meta || g.meta.host !== Net.uid || g.lastWriter === Net.uid) return;
    const rev = g.rev;
    g.aiTimer = setTimeout(() => {
      if (Net.game !== g || g.rev !== rev || !App().st.players[App().st.cur].ai) return;
      g.lastWriter = Net.uid;
      App().beginTurn();
    }, 16000);
  }

  function renderLobby(g) {
    const el = g.lobbyEl, d = g.meta;
    if (!el) return;
    const host = d.host === Net.uid;
    const mine = d.seats.some((s) => s.uid === Net.uid);
    const prefName = (App().load('banners-borders-prefs-v1') || {}).onlineName || '';
    const rows = d.seats.map((s, i) => {
      const who = s.ai ? 'Computer' : s.uid ? (s.uid === Net.uid ? 'You' : 'Taken') : 'Open seat';
      let btn = '';
      if (!s.ai && !s.uid && !writeBlocked()) btn = `<button type="button" class="btn small primary" data-lobby="take" data-i="${i}">Take this seat</button>`;
      else if (s.uid === Net.uid && !host) btn = `<button type="button" class="btn small" data-lobby="release" data-i="${i}">Give up seat</button>`;
      if (s.uid === Net.uid) btn = `<button type="button" class="btn small" data-lobby="flag" data-i="${i}">${s.flag ? 'Redraw flag' : 'Draw flag'}</button>` + btn;
      const markHtml = CC.validFlag(s.flag) && App().flagTag ? App().flagTag(s.flag, colorHex(s.color)) : swatch(colorHex(s.color));
      return `<li><div>${markHtml} <b>${esc(s.name)}</b><div class="meta">${who}</div></div>${btn}</li>`;
    }).join('');
    const sizeName = { small: 'Small', normal: 'Normal', large: 'Large' }[d.settings.size] || 'Normal';
    el.innerHTML = `<h2>${esc(d.name)}</h2>
      <p class="lead">Game code <b>${esc(g.code)}</b> · ${sizeName} ${d.settings.map === 'world' ? 'Known World' : ''} map · ${d.settings.rounds ? d.settings.rounds + ' rounds' : 'no round limit'}${d.settings.timer ? ` · ${d.settings.timer}s turns` : ''}. Friends open this page on claude.ai, find the game under “Games on this page” and take a seat.</p>
      ${!mine && !writeBlocked() ? `<div class="field"><label for="join-name">Your house name</label><input id="join-name" type="text" maxlength="24" value="${esc(prefName)}" placeholder="Keep the seat's name"></div>` : ''}
      ${writeBlocked() ? `<p class="err">${noWriteText}</p>` : ''}
      <ul class="games">${rows}</ul>
      ${host ? `<p class="estimate" style="margin-top:12px">Open seats still empty when you start are played by the computer.</p>
        <div class="modal-actions"><button type="button" class="btn warn" data-lobby="cancel">Cancel game</button><button type="button" class="btn" data-lobby="back">Back</button><button type="button" class="btn primary" data-lobby="start">Start game</button></div>`
      : `<p class="estimate" style="margin-top:12px"><span class="spin"></span> Waiting for the host to start.</p><div class="modal-actions"><button type="button" class="btn" data-lobby="back">Back</button></div>`}`;
  }

  async function onLobbyClick(e) {
    const b = e.target.closest('[data-lobby]');
    const g = Net.game;
    if (!b || b.disabled || !g) return;
    const act = b.dataset.lobby;
    if (act === 'back') { leaveGame(); App().closeAllModals(); App().showSetup(); return; }
    b.disabled = true;
    try {
      if (act === 'take') {
        const input = g.lobbyEl.querySelector('#join-name');
        const name = input ? input.value.trim() : '';
        if (name) App().store('banners-borders-prefs-v1', Object.assign(App().load('banners-borders-prefs-v1') || {}, { onlineName: name }));
        await editSeats(g, (seats) => {
          const s = seats[+b.dataset.i];
          if (s.ai || s.uid) return 'That seat was just taken.';
          s.uid = Net.uid;
          if (name) s.name = name.slice(0, 24);
          const myFlag = (App().load('banners-borders-prefs-v1') || {}).onlineFlag;
          if (CC.validFlag(myFlag)) s.flag = myFlag;
          return null;
        });
      } else if (act === 'flag') {
        const i = +b.dataset.i, seat = g.meta.seats[i];
        const f = await App().editFlag(seat.flag, colorHex(seat.color));
        if (f !== undefined) {
          App().store('banners-borders-prefs-v1', Object.assign(App().load('banners-borders-prefs-v1') || {}, { onlineFlag: f }));
          await editSeats(g, (seats) => { if (seats[i].uid !== Net.uid) return 'That is not your seat.'; seats[i].flag = f; return null; });
        }
      } else if (act === 'release') {
        await editSeats(g, (seats) => { const s = seats[+b.dataset.i]; if (s.uid === Net.uid) s.uid = null; return null; });
      } else if (act === 'cancel') {
        await metaRef(g.code).delete();
        leaveGame(); App().closeAllModals(); App().showSetup();
      } else if (act === 'start') {
        await startHosted(g);
      }
    } catch (err) {
      App().hint('That did not go through. Check your connection and access, then try again.');
    } finally { b.disabled = false; }
  }

  // Seat changes go through a short lease so two friends cannot grab the same seat.
  async function editSeats(g, fn) {
    const ref = metaRef(g.code);
    const lease = await ref.acquire({ holder: Net.uid, ttlMs: 5000 });
    if (!lease.acquired) { App().hint('Someone else is joining right now. Try again in a moment.'); return; }
    const snap = await ref.get();
    if (!snap.exists) return;
    const d = snap.data();
    if (d.status !== 'lobby') { App().hint('The game has already started.'); return; }
    const seats = JSON.parse(JSON.stringify(d.seats));
    const err = fn(seats);
    if (err) { App().hint(err); return; }
    await ref.update({ seats, updated: Date.now() });
  }

  async function startHosted(g) {
    const d = g.meta;
    const seats = d.seats.map((s) => Object.assign({}, s, { ai: s.ai || !s.uid }));
    const st = CC.newGame({
      players: seats.map((s) => ({ name: s.name, color: s.color, ai: s.ai, flag: s.flag || null })),
      size: d.settings.size, map: d.settings.map, rounds: d.settings.rounds, timer: d.settings.timer, seed: d.settings.seed == null ? undefined : d.settings.seed,
    });
    const now = Date.now();
    await stateRef(g.code).set({ save: CC.serialize(st), rev: 1, lastBy: Net.uid, updated: now });
    g.rev = 1; g.lastWriter = Net.uid;
    await metaRef(g.code).update({ seats, status: 'playing', updated: now, info: turnInfo(st) });
  }

  function turnInfo(st) {
    if (st.over) return `Won by ${st.players[st.over.winner].name}`;
    return `Round ${st.round} · ${st.players[st.cur].name}'s turn`;
  }

  // ------------------------------------------------------------ in-game session
  function queueWrite() {
    const g = Net.game;
    if (!g || !g.inGame) return;
    g.rev++; g.lastWriter = Net.uid; g.dirty = true; g.updated = Date.now();
    if (g.writing) return;
    g.writing = true;
    (async () => {
      let retried = false;
      while (g.dirty && Net.game === g) {
        g.dirty = false;
        const st = App().st;
        const body = { save: CC.serialize(st), rev: g.rev, lastBy: Net.uid, updated: Date.now() };
        try {
          await stateRef(g.code).set(body);
          const key = `${st.turnNo}:${st.over ? 'over' : 'playing'}`;
          if (key !== g.metaKey) {
            g.metaKey = key;
            await metaRef(g.code).update({ status: st.over ? 'over' : 'playing', info: turnInfo(st), updated: Date.now() });
          }
        } catch (e) {
          if (e && e.code === 'unavailable' && !retried) { retried = true; g.dirty = true; await new Promise((r) => setTimeout(r, 800 + Math.random() * 800)); continue; }
          App().hint(e && e.code === 'invalid_argument' ? 'Your move could not be saved online: this page is view-only for you.' : 'Your move could not be saved online. Check your connection.');
          break;
        }
      }
      g.writing = false;
    })();
  }

  function leaveGame() {
    const g = Net.game;
    if (!g) return;
    clearTimeout(g.aiTimer);
    if (g.unsubMeta) g.unsubMeta();
    if (g.unsubState) g.unsubState();
    Net.game = null;
    if (App().online === session) App().online = null;
  }

  const session = {
    isMine: (p) => { const g = Net.game; return !!(g && g.meta && g.meta.seats[p] && g.meta.seats[p].uid === Net.uid); },
    runsAI: () => { const g = Net.game; return !!g && g.lastWriter === Net.uid; },
    push: queueWrite,
    leave: () => { leaveGame(); },
    seatBadge: (p) => (session.isMine(p) ? '<span class="cpu">YOU</span>' : ''),
    panelExtra: () => {
      const g = Net.game, st = App().st;
      if (!g || !g.meta || !st) return '';
      const host = g.meta.host === Net.uid;
      const waitedMs = Date.now() - (g.updated || Date.now());
      const limit = (st.settings.timer ? st.settings.timer * 1000 + 30000 : 180000);
      let html = `<p class="hint-text">Online game <b>${esc(g.code)}</b>. The map updates as soon as they move.</p>`;
      if (host && !st.players[st.cur].ai) html += `<div class="actions"><button type="button" class="btn small warn" data-act="noop" id="skip-turn" ${waitedMs < limit ? 'disabled' : ''}>Skip this turn</button></div>
        <p class="hint-text">As host you can skip a turn after ${Math.round(limit / 60000 * 10) / 10} minutes without a move.</p>`;
      return html;
    },
    menuExtra: () => {
      const g = Net.game;
      return `<p class="lead">Online game <b>${g ? esc(g.code) : ''}</b>. Every move is saved online, so you can close this page and resume from “Games on this page”.</p>`;
    },
    bindMenu: () => {},
  };

  // host-only skip button lives in the side panel
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#skip-turn')) return;
    const g = Net.game, st = App().st;
    if (!g || !st || g.meta.host !== Net.uid || st.over) return;
    CC.log(st, `${st.players[st.cur].name}'s turn was skipped by the host.`, 'warn', [st.cur]);
    st.players[st.cur].seen = st.logSeq;
    CC.endTurn(st);
    g.lastWriter = Net.uid;
    queueWrite();
    App().beginTurn();
  });
  setInterval(() => { if (Net.game && Net.game.inGame && document.getElementById('skip-turn')) App().renderAll(); }, 20000);
})();
