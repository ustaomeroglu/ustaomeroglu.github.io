/* Kurultay — online play anywhere, browser to browser (PeerJS / WebRTC).
   The host's browser keeps the game: friends connect to it with a room code, send their moves, and get the
   new state back. No accounts and no server of our own; PeerJS's free broker only introduces the browsers. */
(function () {
  'use strict';
  const CC = window.CC;
  const App = () => CC.App;
  const esc = (s) => CC.App.esc(s);
  const PREFIX = 'kurultay-';
  const PREF_KEY = 'banners-borders-prefs-v1', HOST_KEY = 'kurultay-hosted-v1', JOIN_KEY = 'kurultay-joined-v1';
  const P2P = { peer: null, role: null, code: null, game: null };
  CC.P2P = P2P;

  // ------------------------------------------------------------ plumbing
  const load = (k) => App().load(k), store = (k, v) => App().store(k, v);
  // who this browser is; ?as=name gives a second identity (to try both sides in one browser)
  const AS = (new URLSearchParams(location.search).get('as') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12);
  function myId() {
    const prefs = load(PREF_KEY) || {}, key = 'clientId' + AS;
    if (prefs[key]) return prefs[key];
    const id = 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    store(PREF_KEY, Object.assign(prefs, { [key]: id }));
    return id;
  }
  function makeCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }
  const colorHex = (i) => CC.COLORS[i % CC.COLORS.length].hex;
  const joinLink = (code) => { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('join', code); return u.toString(); };

  // PeerJS is fetched only when someone hosts or joins
  let peerLib = null;
  function loadPeerJS() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (peerLib) return peerLib;
    const urls = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
    peerLib = urls.reduce((p, url) => p.catch(() => new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = url; s.onload = () => (window.Peer ? ok(window.Peer) : bad(new Error('no Peer'))); s.onerror = bad;
      document.head.appendChild(s);
    })), Promise.reject(new Error('start')));
    peerLib.catch(() => { peerLib = null; });
    return peerLib;
  }
  function openPeer(id) {
    return loadPeerJS().then((Peer) => new Promise((ok, bad) => {
      const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      const t = setTimeout(() => bad(new Error('timeout')), 15000);
      peer.on('open', () => { clearTimeout(t); ok(peer); });
      peer.on('error', (e) => { clearTimeout(t); bad(e); });
    }));
  }
  const send = (conn, msg) => { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* the other side will resync */ } };

  // ------------------------------------------------------------ start screen box
  P2P.renderSetup = function (el, cfg, startConfig) {
    P2P.setupEl = el; P2P.startConfig = startConfig;
    const hosted = load(HOST_KEY), joined = load(JOIN_KEY);
    el.innerHTML = `<h3>Play online with friends</h3>
      <p class="estimate">No accounts needed. Host a game, set it up in the lobby and send your friends the link. Their browsers connect straight to yours, so keep your tab open while you play.</p>
      <div class="setup-foot" style="justify-content:flex-start;flex-wrap:wrap;gap:8px">
        <button type="button" class="btn primary" data-p2p="host">Host an online game</button>
        ${hosted && hosted.code && hosted.save ? `<button type="button" class="btn" data-p2p="resume">Resume hosting ${esc(hosted.code)}</button>` : ''}
        ${joined && joined.code ? `<button type="button" class="btn" data-p2p="rejoin">Rejoin ${esc(joined.code)}</button>` : ''}
      </div>
      <div class="field" style="margin-top:12px"><label for="p2p-code">Have a room code?</label>
        <div style="display:flex;gap:8px"><input id="p2p-code" type="text" maxlength="5" placeholder="ABCDE" style="width:120px;text-transform:uppercase"><button type="button" class="btn" data-p2p="code">Join</button></div></div>`;
    if (!el._p2p) {
      el._p2p = true;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-p2p]');
        if (!b || b.disabled) return;
        const act = b.dataset.p2p;
        if (act === 'host') hostNew();
        else if (act === 'resume') resumeHost();
        else if (act === 'rejoin') askName((load(JOIN_KEY) || {}).code);
        else if (act === 'code') {
          const code = (el.querySelector('#p2p-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (code.length !== 5) { App().hint('Room codes have 5 letters and digits.'); return; }
          askName(code);
        }
      });
    }
  };

  // Opening an invite link skips the start screen: a small box in the middle asks for a name.
  P2P.boot = function () {
    if (window.claude && window.claude.use) return false;
    const code = (new URLSearchParams(location.search).get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return false;
    askName(code);
    return true;
  };
  function askName(code) {
    if (!code) return;
    App().closeAllModals();
    const prefs = load(PREF_KEY) || {};
    const m = App().modal(`<div class="join-box"><h2>Join a game of Kurultay</h2>
        <p class="lead">Room <b style="letter-spacing:2px">${esc(code)}</b>. Choose the name of your house; you can change it in the lobby.</p>
        <div class="field"><label for="join-name">Your name</label><input id="join-name" type="text" maxlength="24" autocomplete="nickname" value="${esc(prefs.onlineName || '')}" placeholder="House …"></div>
        <p class="err" id="join-err" hidden></p></div>
      <div class="modal-actions"><button class="btn ghost" type="button" data-close="back">Start screen instead</button><button class="btn primary" type="button" id="join-go">Join the lobby</button></div>`,
    { dismiss: false, onClose: (v) => { if (v === 'back') { history.replaceState(null, '', location.pathname); App().showSetup(); } } });
    const input = m.querySelector('#join-name'), go = m.querySelector('#join-go');
    const submit = () => {
      const name = input.value.trim();
      if (!name) { const er = m.querySelector('#join-err'); er.hidden = false; er.textContent = 'Type a name first.'; input.focus(); return; }
      store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { onlineName: name }));
      join(code, name);
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 60);
  }

  // ------------------------------------------------------------ the lobby (host and friends see the same page)
  const SIZES = [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']];
  const MAPS = [['realm', 'Random realm'], ['world', 'Known World']];
  const ROUNDS = [[10, '10 rounds'], [15, '15 rounds'], [20, '20 rounds'], [30, '30 rounds'], [0, 'Until one house remains']];
  const TIMERS = [[0, 'Off'], [60, '60 seconds'], [90, '90 seconds'], [120, '2 minutes'], [180, '3 minutes']];
  function lobbyModal(title) {
    App().closeAllModals();
    const ov = App().modal(`<div id="p2p-lobby"><h2>${esc(title)}</h2><p class="lead"><span class="spin"></span> Connecting…</p></div>`, { wide: true, dismiss: false });
    const el = ov.querySelector('#p2p-lobby');
    el.addEventListener('click', onLobbyClick);
    el.addEventListener('change', onLobbyChange);
    return el;
  }
  const waitingFor = (g) => g.seats.filter((s) => !s.ai && s.uid && s.uid !== g.hostUid && !s.ready);
  function renderLobby() {
    const g = P2P.game;
    if (!g || !g.lobbyEl || g.started || !g.lobbyEl.isConnected) return;
    const host = P2P.role === 'host', me = myId();
    // keep a half-typed name when the lobby redraws around it
    const active = document.activeElement && g.lobbyEl.contains(document.activeElement) ? { id: document.activeElement.id, v: document.activeElement.value, s: document.activeElement.selectionStart } : null;
    const rows = g.seats.map((s, i) => {
      const mine = s.uid === me, isHost = s.uid === g.hostUid;
      const mark = CC.validFlag(s.flag) && App().flagTag ? App().flagTag(s.flag, colorHex(s.color)) : '';
      const status = s.ai ? '<span class="tag">Computer</span>' : isHost ? '<span class="tag gilt">Host</span>'
        : s.uid ? (s.online === false ? '<span class="tag">Offline</span>' : s.ready ? '<span class="tag ready">Ready ✓</span>' : '<span class="tag">Not ready</span>') : '<span class="tag">Open seat</span>';
      const colorBtn = (host || mine) ? `<button type="button" class="colorbtn" data-lob="color" data-i="${i}" style="background:${colorHex(s.color)}" aria-label="Change colour"></button>` : `<span class="colorbtn" style="background:${colorHex(s.color)}"></span>`;
      const nameEl = mine ? `<input type="text" id="lob-name-${i}" data-lob="name" data-i="${i}" maxlength="24" value="${esc(s.name)}" aria-label="House name">` : `<b class="lob-name">${esc(s.name)}</b>`;
      let ctl = '';
      if (mine && !isHost) ctl = `<button type="button" class="btn small ${s.ready ? '' : 'primary'}" data-lob="ready">${s.ready ? 'Not ready' : 'Ready'}</button>`;
      else if (host && !s.uid) ctl = `<div class="seg"><button type="button" data-lob="open" data-i="${i}" aria-pressed="${!s.ai}">Friend</button><button type="button" data-lob="cpu" data-i="${i}" aria-pressed="${s.ai}">CPU</button></div>`;
      const flagBtn = mine ? `<button type="button" class="flagbtn" data-lob="flag" data-i="${i}" aria-label="Draw your flag">${mark || '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 18V2" stroke="currentColor" stroke-width="1.8"/><path d="M5 3h11l-3 3.5 3 3.5H5z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'}</button>` : `<span class="flagbtn">${mark}</span>`;
      const x = host && !s.uid && g.seats.length > 2 ? `<button type="button" class="btn small ghost" data-lob="remove" data-i="${i}" aria-label="Remove this house">✕</button>` : '<span></span>';
      return `<div class="lob-seat ${mine ? 'me' : ''}">${colorBtn}${flagBtn}<div class="lob-who">${nameEl}${status}</div>${ctl}${x}</div>`;
    }).join('');
    const opt = (key, list) => {
      const v = g.settings[key];
      if (!host) return `<div class="field"><label>${{ map: 'Map', size: 'Map size', rounds: 'Length', timer: 'Turn timer' }[key]}</label><div class="lob-val">${esc((list.find(([k]) => String(k) === String(v)) || ['', String(v)])[1])}</div></div>`;
      return `<div class="field"><label for="lob-${key}">${{ map: 'Map', size: 'Map size', rounds: 'Length', timer: 'Turn timer' }[key]}</label><select id="lob-${key}" data-lob="set" data-key="${key}">${list.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    };
    const waiting = waitingFor(g), open = g.seats.filter((s) => !s.ai && !s.uid).length, friends = g.seats.filter((s) => !s.ai && s.uid && s.uid !== g.hostUid).length;
    const startTip = waiting.length ? `Waiting for ${waiting.map((s) => s.name).join(', ')} to be ready.` : open ? `${open} open seat${open === 1 ? '' : 's'} will be played by the computer.` : 'Everyone is ready.';
    const meSeat = g.seats.find((s) => s.uid === me);
    g.lobbyEl.innerHTML = `<h2>Game lobby · <span style="letter-spacing:2px">${esc(P2P.code)}</span></h2>
      ${host ? `<p class="lead">Send this link to your friends. They type a name and appear here; start when everyone is ready.</p>
        <div class="lob-link"><input readonly value="${esc(joinLink(P2P.code))}" id="p2p-link"><button type="button" class="btn" data-lob="copy">Copy link</button></div>`
      : `<p class="lead">${g.full ? 'The lobby is full: you can watch the game.' : meSeat && meSeat.ready ? '<span class="spin"></span> You are ready. Waiting for the host to start.' : 'Pick your colour and flag, then press <b>Ready</b>.'}</p>`}
      <div class="setup-grid">
        <section><h3>Houses</h3><div class="lob-seats">${rows}</div>
          ${host && g.seats.length < 8 ? '<button type="button" class="btn small" data-lob="add">Add a house</button>' : ''}</section>
        <section><h3>The realm</h3>${opt('map', MAPS)}${opt('size', SIZES)}${opt('rounds', ROUNDS)}${opt('timer', TIMERS)}</section>
      </div>
      <div class="modal-actions"><span class="estimate" style="margin-right:auto">${esc(host ? startTip : `${friends + 1} of ${g.seats.filter((s) => !s.ai).length} human seats taken.`)}</span>
        <button type="button" class="btn" data-lob="leave">${host ? 'Close the lobby' : 'Leave'}</button>
        ${host ? `<button type="button" class="btn primary" data-lob="start" ${waiting.length ? `aria-disabled="true" data-tip="${esc(startTip)}"` : ''}>Start game</button>` : ''}</div>`;
    if (active && active.id) { const el = g.lobbyEl.querySelector('#' + active.id); if (el && 'value' in el) { el.value = active.v; el.focus(); try { el.setSelectionRange(active.s, active.s); } catch (e) { /* selects */ } } }
  }
  function nextColor(g, from) {
    const used = new Set(g.seats.map((s) => s.color));
    let c = from;
    for (let k = 0; k < 8; k++) { c = (c + 1) % 8; if (!used.has(c)) return c; }
    return from;
  }
  // a change to your own seat: the host applies it at once, a friend asks the host
  function changeMine(patch) {
    const g = P2P.game;
    if (P2P.role === 'host') { const s = g.seats.find((x) => x.uid === myId()); if (s) Object.assign(s, patch); hostChanged(); }
    else send(g.conn, Object.assign({ t: 'set' }, patch));
  }
  function onLobbyClick(e) {
    const b = e.target.closest('[data-lob]');
    const g = P2P.game;
    if (!b || !g) return;
    if (b.getAttribute('aria-disabled') === 'true') { App().hint(b.dataset.tip || 'Not yet.'); return; }
    const act = b.dataset.lob, i = +b.dataset.i, host = P2P.role === 'host', s = g.seats[i];
    if (act === 'copy') {
      const inp = g.lobbyEl.querySelector('#p2p-link');
      const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done, () => { inp.select(); document.execCommand('copy'); done(); });
      else { inp.select(); document.execCommand('copy'); done(); }
    } else if (act === 'leave') { if (host) broadcast({ t: 'closed' }); leave(); App().closeAllModals(); history.replaceState(null, '', location.pathname); App().showSetup(); }
    else if (act === 'start' && host) startHosted();
    else if (act === 'ready') { const me = g.seats.find((x) => x.uid === myId()); changeMine({ ready: !(me && me.ready) }); }
    else if (act === 'flag') {
      App().editFlag(s.flag, colorHex(s.color)).then((f) => {
        if (f === undefined) return;
        store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { onlineFlag: f }));
        changeMine({ flag: f });
      });
    } else if (act === 'color') {
      if (s.uid === myId()) changeMine({ color: nextColor(g, s.color) });
      else if (host) { s.color = nextColor(g, s.color); hostChanged(); }
    } else if (!host) return;
    else if (act === 'open') { s.ai = false; s.name = s.name || 'Open seat'; hostChanged(); }
    else if (act === 'cpu') { s.ai = true; hostChanged(); }
    else if (act === 'remove') { g.seats.splice(i, 1); hostChanged(); }
    else if (act === 'add') {
      const name = CC.HOUSE_NAMES.find((n) => !g.seats.some((x) => x.name === n)) || `House ${g.seats.length + 1}`;
      g.seats.push({ name, color: nextColor(g, 0), ai: false, flag: null, uid: null, ready: false });
      hostChanged();
    }
  }
  function onLobbyChange(e) {
    const el = e.target, g = P2P.game;
    if (!g || !el.dataset.lob) return;
    if (el.dataset.lob === 'name') {
      const i = +el.dataset.i, name = el.value.trim().slice(0, 24) || g.seats[i].name;
      if (g.seats[i].uid === myId()) { store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { onlineName: name })); changeMine({ name }); }
      else if (P2P.role === 'host') { g.seats[i].name = name; hostChanged(); }
    } else if (el.dataset.lob === 'set' && P2P.role === 'host') {
      const k = el.dataset.key;
      g.settings[k] = k === 'rounds' || k === 'timer' ? +el.value : el.value;
      hostChanged();
    }
  }

  // ------------------------------------------------------------ host
  async function hostNew() {
    const cfg = P2P.startConfig();
    const me = myId(), prefs = load(PREF_KEY) || {};
    const first = Math.max(0, cfg.players.findIndex((p) => !p.ai));
    // the start screen's houses carry over: you take the first human seat, other human seats wait for friends
    const seats = cfg.players.map((p, i) => ({ name: p.name, color: p.color, ai: i === first ? false : p.ai, flag: i === first ? p.flag || prefs.onlineFlag || null : null, uid: i === first ? me : null, ready: i === first }));
    const settings = { map: cfg.map || 'realm', size: cfg.size || 'normal', rounds: cfg.rounds != null ? cfg.rounds : 15, timer: cfg.timer || 0, seed: cfg.seed };
    await openHost(makeCode(), { seats, settings, started: false, save: null, rev: 0, hostUid: me });
  }
  async function resumeHost() {
    const h = load(HOST_KEY);
    if (!h) return;
    await openHost(h.code, { seats: h.seats, settings: h.settings, started: true, save: h.save, rev: h.rev || 1, hostUid: myId() });
  }
  async function openHost(code, game) {
    leave();
    P2P.role = 'host'; P2P.code = code;
    const g = P2P.game = Object.assign({ lobbyEl: null, watchers: [] }, game);
    if (!g.started) g.lobbyEl = lobbyModal('Opening a lobby');
    else App().hint('Reopening your game…');
    try { P2P.peer = await openPeer(PREFIX + code); }
    catch (e) {
      if (g.lobbyEl) g.lobbyEl.innerHTML = `<h2>Could not open the lobby</h2><p class="lead">${e && e.type === 'unavailable-id' ? 'That room is still open in another tab or browser. Close it, wait a few seconds, then try again.' : 'The connection service did not answer. Check your internet connection and try again.'}</p><div class="modal-actions"><button class="btn primary" type="button" data-lob="leave">Back</button></div>`;
      else App().hint('Could not reopen the room. Try again in a few seconds.');
      return;
    }
    P2P.peer.on('connection', (conn) => {
      conn.on('data', (m) => onHostData(conn, m));
      conn.on('close', () => onHostClose(conn));
    });
    P2P.peer.on('disconnected', () => { try { P2P.peer.reconnect(); } catch (e) { /* retried on the next action */ } });
    if (g.started) { App().closeAllModals(); App().startLoaded(CC.deserialize(g.save), session); }
    else renderLobby();
  }
  function lobbyMsg() { const g = P2P.game; return { t: 'lobby', code: P2P.code, started: g.started, hostUid: g.hostUid, settings: g.settings, seats: g.seats.map(({ conn, ...s }) => s) }; }
  function broadcast(msg, except) {
    const g = P2P.game;
    for (const s of g.seats) if (s.conn && s.conn !== except) send(s.conn, msg);
    for (const w of g.watchers || []) if (w !== except) send(w, msg);
  }
  function hostChanged() { broadcast(lobbyMsg()); renderLobby(); }
  function onHostClose(conn) {
    const g = P2P.game;
    if (!g) return;
    g.watchers = (g.watchers || []).filter((w) => w !== conn);
    for (const s of g.seats) if (s.conn === conn) {
      s.conn = null; s.online = false;
      // before the game starts, a friend who leaves frees the seat for someone else
      if (!g.started) { s.uid = null; s.ready = false; }
    }
    if (g.started) App().renderAll(); else hostChanged();
  }
  function onHostData(conn, m) {
    const g = P2P.game;
    if (!g || !m || typeof m !== 'object') return;
    const seat = g.seats.find((s) => s.conn === conn);
    if (m.t === 'hello') {
      let s = g.seats.find((x) => x.uid === m.cid);
      if (!s && !g.started) {
        s = g.seats.find((x) => !x.ai && !x.uid);
        if (s) {
          Object.assign(s, { uid: m.cid, ready: false });
          if (m.name) s.name = String(m.name).slice(0, 24);
          if (CC.validFlag(m.flag)) s.flag = m.flag;
        }
      }
      if (s) { s.conn = conn; s.online = true; } else g.watchers.push(conn);
      send(conn, lobbyMsg());
      if (g.started) send(conn, { t: 'state', save: CC.serialize(App().st), rev: g.rev });
      else hostChanged();
      if (g.started) App().renderAll();
    } else if (m.t === 'set' && seat && !g.started) {
      if (typeof m.ready === 'boolean') seat.ready = m.ready;
      if (typeof m.name === 'string' && m.name.trim()) seat.name = m.name.trim().slice(0, 24);
      if (m.flag === null || CC.validFlag(m.flag)) seat.flag = m.flag;
      if (Number.isInteger(m.color) && m.color >= 0 && m.color < 8 && !g.seats.some((x) => x !== seat && x.color === m.color)) seat.color = m.color;
      hostChanged();
    } else if (m.t === 'state' && g.started && seat) {
      // a move from the player whose turn it is: keep it if it is new, and pass it on
      if (!(m.rev > g.rev)) return;
      let st;
      try { st = CC.deserialize(m.save); } catch (e) { return; }
      g.rev = m.rev;
      App().replaceState(st);
      saveHosted();
      broadcast(m, conn);
    }
  }
  function startHosted() {
    const g = P2P.game;
    if (waitingFor(g).length) return;
    for (const s of g.seats) if (!s.ai && !s.uid) s.ai = true;
    const c = g.settings;
    const st = CC.newGame({ players: g.seats.map((s) => ({ name: s.name, color: s.color, ai: s.ai, flag: s.flag || null })), size: c.size, map: c.map, rounds: c.rounds, timer: c.timer, seed: c.seed });
    g.started = true; g.rev = 1;
    broadcast(lobbyMsg());
    broadcast({ t: 'state', save: CC.serialize(st), rev: g.rev });
    App().closeAllModals();
    App().startLoaded(st, session);
    saveHosted();
  }
  function saveHosted() {
    const g = P2P.game;
    if (!g || P2P.role !== 'host' || !App().st) return;
    store(HOST_KEY, { code: P2P.code, seats: g.seats.map(({ conn, online, ...s }) => s), settings: g.settings, save: CC.serialize(App().st), rev: g.rev, at: Date.now() });
  }

  // ------------------------------------------------------------ friend
  async function join(code, name) {
    if (!code) return;
    leave();
    P2P.role = 'guest'; P2P.code = code;
    const g = P2P.game = { seats: [], settings: {}, rev: 0, started: false, lobbyEl: lobbyModal(`Joining ${code}`), conn: null, inGame: false, name };
    store(JOIN_KEY, { code, at: Date.now() });
    try { P2P.peer = await openPeer(null); }
    catch (e) { g.lobbyEl.innerHTML = '<h2>Could not connect</h2><p class="lead">The connection service did not answer. Check your internet connection and try again.</p><div class="modal-actions"><button class="btn primary" type="button" data-lob="leave">Back</button></div>'; return; }
    connectToHost();
  }
  function connectToHost() {
    const g = P2P.game;
    if (!g || P2P.role !== 'guest') return;
    const conn = P2P.peer.connect(PREFIX + P2P.code, { reliable: true });
    g.conn = conn;
    const giveUp = setTimeout(() => {
      if (conn.open || P2P.game !== g) return;
      if (!g.inGame && !g.seats.length && g.lobbyEl) g.lobbyEl.innerHTML = `<h2>No game at ${esc(P2P.code)}</h2><p class="lead">Check the link, and make sure the host still has the lobby open.</p><div class="modal-actions"><button class="btn primary" type="button" data-lob="leave">Back</button></div>`;
      else retry();
    }, 12000);
    conn.on('open', () => { clearTimeout(giveUp); g.online = true; send(conn, { t: 'hello', cid: myId(), name: g.name, flag: (load(PREF_KEY) || {}).onlineFlag || null }); if (g.inGame) App().renderAll(); });
    conn.on('data', (m) => onGuestData(m));
    conn.on('close', () => { if (P2P.game !== g) return; g.online = false; if (g.inGame) { App().hint('Lost the host. Reconnecting…'); App().renderAll(); } retry(); });
  }
  function retry() {
    const g = P2P.game;
    clearTimeout(g && g.retryTimer);
    if (g && P2P.role === 'guest' && !g.closed) g.retryTimer = setTimeout(() => { if (P2P.game === g && !g.online) connectToHost(); }, 4000);
  }
  function onGuestData(m) {
    const g = P2P.game;
    if (!g || !m || typeof m !== 'object') return;
    if (m.t === 'lobby') {
      Object.assign(g, { seats: m.seats, settings: m.settings || {}, started: m.started, hostUid: m.hostUid });
      g.full = !m.seats.some((s) => s.uid === myId());
      if (!g.inGame) renderLobby(); else App().renderAll();
    } else if (m.t === 'closed') {
      g.closed = true;
      if (!g.inGame && g.lobbyEl) g.lobbyEl.innerHTML = '<h2>The host closed the lobby</h2><p class="lead">Ask them for a new link.</p><div class="modal-actions"><button class="btn primary" type="button" data-lob="leave">Back</button></div>';
    } else if (m.t === 'state') {
      if (!(m.rev > g.rev) && g.inGame) return;
      let st;
      try { st = CC.deserialize(m.save); } catch (e) { App().hint('This game could not be loaded.'); return; }
      g.rev = m.rev;
      if (!g.inGame) { g.inGame = true; App().closeAllModals(); App().startLoaded(st, session); }
      else App().replaceState(st);
    }
  }

  // ------------------------------------------------------------ the session the game talks to
  let pushTimer = 0;
  function push() {
    const g = P2P.game;
    if (!g || !App().st) return;
    // moves come in bursts (every step of a march, every computer action): send the latest state once things settle
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const st = App().st;
      g.rev++;
      const msg = { t: 'state', save: CC.serialize(st), rev: g.rev };
      if (P2P.role === 'host') { broadcast(msg); saveHosted(); }
      else send(g.conn, msg);
    }, 150);
  }
  function leave() {
    const g = P2P.game;
    if (g) clearTimeout(g.retryTimer);
    P2P.game = null;
    if (P2P.peer) { try { P2P.peer.destroy(); } catch (e) { /* gone */ } }
    P2P.peer = null; P2P.role = null;
    if (App().online === session) App().online = null;
  }
  const seatOf = (p) => { const g = P2P.game; return g && g.seats[p]; };
  const session = {
    isMine: (p) => { const s = seatOf(p); return !!(s && s.uid === myId()); },
    runsAI: () => P2P.role === 'host',
    push,
    leave: () => { if (P2P.role === 'guest') store(JOIN_KEY, null); leave(); },
    seatBadge: (p) => { const s = seatOf(p); if (!s) return ''; if (s.uid === myId()) return '<span class="cpu">YOU</span>'; return !s.ai && s.online === false ? '<span class="cpu">AWAY</span>' : ''; },
    panelExtra: () => {
      const g = P2P.game, st = App().st;
      if (!g || !st) return '';
      let html = `<p class="hint-text">Online game <b>${esc(P2P.code)}</b>. The map updates as soon as they move.</p>`;
      if (P2P.role === 'guest' && !g.online) html += '<p class="err">Lost the host. Reconnecting…</p>';
      const s = seatOf(st.cur);
      if (P2P.role === 'host' && s && !s.ai && s.uid !== myId()) html += `<div class="actions"><button type="button" class="btn small warn" id="p2p-skip">Skip this turn</button></div><p class="hint-text">${s.online === false ? `${esc(s.name)} is offline. ` : ''}As host you can skip a turn that is taking too long.</p>`;
      return html;
    },
    menuExtra: () => `<p class="lead">Online game <b>${esc(P2P.code || '')}</b>. ${P2P.role === 'host' ? 'Your browser holds the game: keep this tab open. If you close it, “Resume hosting” on the start screen brings everyone back.' : 'If you lose the connection, open the link again and press Join.'}</p>
      ${P2P.role === 'host' ? `<p class="lead">Invite link: <input readonly value="${esc(joinLink(P2P.code))}" style="width:100%"></p>` : ''}`,
    bindMenu: () => {},
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#p2p-skip')) return;
    const st = App().st;
    if (P2P.role !== 'host' || !st || st.over) return;
    CC.log(st, `${st.players[st.cur].name}'s turn was skipped by the host.`, 'warn', [st.cur]);
    st.players[st.cur].seen = st.logSeq;
    CC.endTurn(st);
    push();
    App().beginTurn();
  });
  // the host leaving the page drops everyone; ask first
  window.addEventListener('beforeunload', (e) => { if (P2P.role === 'host' && P2P.game && P2P.game.started) { e.preventDefault(); e.returnValue = ''; } });
})();
