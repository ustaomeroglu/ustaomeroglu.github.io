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

  // ------------------------------------------------------------ setup screen box
  P2P.renderSetup = function (el, cfg, startConfig) {
    P2P.setupEl = el; P2P.startConfig = startConfig;
    const prefs = load(PREF_KEY) || {};
    const hosted = load(HOST_KEY), joined = load(JOIN_KEY);
    const linkCode = (new URLSearchParams(location.search).get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    el.innerHTML = `<h3>Play online with friends</h3>
      <p class="estimate">No accounts needed. Set up the houses above: every <b>Human</b> house is a seat, and you sit in the first one. Host a game and send your friends the link; their browsers connect straight to yours, so keep this tab open while you play.</p>
      <div class="setup-foot" style="justify-content:flex-start;flex-wrap:wrap;gap:8px">
        <button type="button" class="btn ${linkCode ? '' : 'primary'}" data-p2p="host">Host an online game</button>
        ${hosted && hosted.code && hosted.save ? `<button type="button" class="btn" data-p2p="resume">Resume hosting ${esc(hosted.code)}</button>` : ''}
        ${joined && joined.code && joined.code !== linkCode ? `<button type="button" class="btn" data-p2p="rejoin">Rejoin ${esc(joined.code)}</button>` : ''}
      </div>
      <div class="field" style="margin-top:12px"><label for="p2p-code">Join a friend's game</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="p2p-code" type="text" maxlength="5" placeholder="Room code" value="${esc(linkCode)}" style="width:120px;text-transform:uppercase">
        <input id="p2p-name" type="text" maxlength="24" placeholder="Your house name" value="${esc(prefs.onlineName || '')}" style="flex:1;min-width:140px">
        <button type="button" class="btn ${linkCode ? 'primary' : ''}" data-p2p="join">Join</button></div></div>`;
    // arriving from an invite link: bring the join box into view, ready for a name
    if (linkCode && !P2P.linkShown) { P2P.linkShown = true; setTimeout(() => { el.scrollIntoView({ block: 'center' }); const n = el.querySelector('#p2p-name'); if (n) n.focus(); }, 80); }
    if (!el._p2p) {
      el._p2p = true;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-p2p]');
        if (!b || b.disabled) return;
        const act = b.dataset.p2p;
        if (act === 'host') hostNew();
        else if (act === 'resume') resumeHost();
        else if (act === 'rejoin') join((load(JOIN_KEY) || {}).code, (load(PREF_KEY) || {}).onlineName || '');
        else if (act === 'join') {
          const code = (el.querySelector('#p2p-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const name = (el.querySelector('#p2p-name').value || '').trim();
          if (code.length !== 5) { App().hint('Room codes have 5 letters and digits.'); return; }
          if (name) store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { onlineName: name }));
          join(code, name);
        }
      });
    }
  };

  // a lobby window: the room code, the link, the seats
  function lobbyModal(title) {
    const ov = App().modal(`<div id="p2p-lobby"><h2>${esc(title)}</h2><p class="lead"><span class="spin"></span> Connecting…</p></div>`, { wide: true, dismiss: false });
    const el = ov.querySelector('#p2p-lobby');
    el.addEventListener('click', onLobbyClick);
    return el;
  }
  function renderLobby() {
    const g = P2P.game;
    if (!g || !g.lobbyEl || g.started) return;
    const host = P2P.role === 'host', me = myId();
    const rows = g.seats.map((s, i) => {
      const who = s.ai ? 'Computer' : s.uid === me ? (host ? 'You (host)' : 'You') : s.uid ? (s.online === false ? 'Joined (offline)' : 'Joined') : 'Open seat';
      const mark = CC.validFlag(s.flag) && App().flagTag ? App().flagTag(s.flag, colorHex(s.color)) : App().swatch(colorHex(s.color));
      return `<li><div>${mark} <b>${esc(s.name)}</b><div class="meta">${who}</div></div></li>`;
    }).join('');
    const link = joinLink(P2P.code);
    g.lobbyEl.innerHTML = `<h2>${host ? 'Your online game' : 'Joined'} · <span style="letter-spacing:2px">${esc(P2P.code)}</span></h2>
      ${host ? `<p class="lead">Send your friends this link. They open it, type a name and press Join.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input readonly value="${esc(link)}" style="flex:1;min-width:200px" id="p2p-link"><button type="button" class="btn" data-lobby="copy">Copy link</button></div>` : '<p class="lead"><span class="spin"></span> Waiting for the host to start the game.</p>'}
      <ul class="games" style="margin-top:12px">${rows}</ul>
      ${host ? `<p class="estimate">Open seats still empty when you start are played by the computer.</p>` : ''}
      <div class="modal-actions"><button type="button" class="btn" data-lobby="leave">${host ? 'Cancel' : 'Leave'}</button>${host ? '<button type="button" class="btn primary" data-lobby="start">Start game</button>' : ''}</div>`;
  }
  function onLobbyClick(e) {
    const b = e.target.closest('[data-lobby]');
    if (!b) return;
    const act = b.dataset.lobby;
    if (act === 'copy') {
      const inp = P2P.game.lobbyEl.querySelector('#p2p-link');
      const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done, () => { inp.select(); document.execCommand('copy'); done(); });
      else { inp.select(); document.execCommand('copy'); done(); }
    } else if (act === 'leave') { leave(); App().closeAllModals(); App().showSetup(); }
    else if (act === 'start') startHosted();
  }

  // ------------------------------------------------------------ host
  async function hostNew() {
    const cfg = P2P.startConfig();
    const me = myId(), firstHuman = cfg.players.findIndex((p) => !p.ai);
    if (firstHuman < 0) { App().hint('Mark at least one house as Human to play online.'); return; }
    const seats = cfg.players.map((p, i) => ({ name: p.name, color: p.color, ai: p.ai, flag: p.flag || null, uid: i === firstHuman ? me : null }));
    await openHost(makeCode(), { seats, settings: cfg, started: false, save: null, rev: 0 });
  }
  async function resumeHost() {
    const h = load(HOST_KEY);
    if (!h) return;
    await openHost(h.code, { seats: h.seats, settings: h.settings, started: true, save: h.save, rev: h.rev || 1 });
  }
  async function openHost(code, game) {
    leave();
    P2P.role = 'host'; P2P.code = code;
    const g = P2P.game = Object.assign({ conns: new Map(), lobbyEl: null }, game);
    if (!g.started) g.lobbyEl = lobbyModal('Hosting');
    else App().hint('Reopening your game…');
    try { P2P.peer = await openPeer(PREFIX + code); }
    catch (e) {
      if (g.lobbyEl) g.lobbyEl.innerHTML = `<h2>Could not open the room</h2><p class="lead">${e && e.type === 'unavailable-id' ? 'That room is still open in another tab or browser. Close it, wait a few seconds, then try again.' : 'The connection service did not answer. Check your internet connection and try again.'}</p><div class="modal-actions"><button class="btn primary" type="button" data-lobby="leave">Back</button></div>`;
      else App().hint('Could not reopen the room. Try again in a few seconds.');
      return;
    }
    P2P.peer.on('connection', (conn) => {
      conn.on('data', (m) => onHostData(conn, m));
      conn.on('close', () => { for (const s of g.seats) if (s.conn === conn) { s.online = false; s.conn = null; } renderLobby(); if (g.started) App().renderAll(); });
    });
    P2P.peer.on('disconnected', () => { try { P2P.peer.reconnect(); } catch (e) { /* retry on next action */ } });
    if (g.started) { App().closeAllModals(); App().startLoaded(CC.deserialize(g.save), session); }
    else renderLobby();
  }
  function lobbyMsg() { const g = P2P.game; return { t: 'lobby', code: P2P.code, started: g.started, seats: g.seats.map(({ conn, ...s }) => s) }; }
  function broadcast(msg, except) { for (const s of P2P.game.seats) if (s.conn && s.conn !== except) send(s.conn, msg); }
  function onHostData(conn, m) {
    const g = P2P.game;
    if (!g || !m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      let i = g.seats.findIndex((s) => s.uid === m.cid);
      if (i < 0 && !g.started) {
        i = g.seats.findIndex((s) => !s.ai && !s.uid);
        if (i >= 0) {
          g.seats[i].uid = m.cid;
          if (m.name) g.seats[i].name = String(m.name).slice(0, 24);
          if (CC.validFlag(m.flag)) g.seats[i].flag = m.flag;
        }
      }
      if (i >= 0) { g.seats[i].conn = conn; g.seats[i].online = true; }
      else (g.watchers = g.watchers || []).push(conn);
      send(conn, { t: 'welcome', seat: i });
      send(conn, lobbyMsg());
      if (g.started) send(conn, { t: 'state', save: CC.serialize(App().st), rev: g.rev });
      broadcast(lobbyMsg(), conn);
      renderLobby();
      if (g.started) App().renderAll();
    } else if (m.t === 'state' && g.started) {
      // a move from the player whose turn it is: keep it if it is new, and pass it on
      const seat = g.seats.findIndex((s) => s.conn === conn);
      if (seat < 0 || !(m.rev > g.rev)) return;
      let st;
      try { st = CC.deserialize(m.save); } catch (e) { return; }
      g.rev = m.rev;
      App().replaceState(st);
      saveHosted();
      for (const s of g.seats) if (s.conn && s.conn !== conn) send(s.conn, m);
      for (const w of g.watchers || []) send(w, m);
    }
  }
  function startHosted() {
    const g = P2P.game;
    for (const s of g.seats) if (!s.ai && !s.uid) s.ai = true;
    const cfg = g.settings;
    const st = CC.newGame({ players: g.seats.map((s) => ({ name: s.name, color: s.color, ai: s.ai, flag: s.flag || null })), size: cfg.size, map: cfg.map, rounds: cfg.rounds, timer: cfg.timer, seed: cfg.seed });
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

  // ------------------------------------------------------------ guest
  async function join(code, name) {
    if (!code) return;
    leave();
    P2P.role = 'guest'; P2P.code = code;
    const g = P2P.game = { seats: [], seat: -1, rev: 0, started: false, lobbyEl: lobbyModal(`Joining ${code}`), conn: null, inGame: false };
    store(JOIN_KEY, { code, at: Date.now() });
    try { P2P.peer = await openPeer(null); }
    catch (e) { g.lobbyEl.innerHTML = '<h2>Could not connect</h2><p class="lead">The connection service did not answer. Check your internet connection and try again.</p><div class="modal-actions"><button class="btn primary" type="button" data-lobby="leave">Back</button></div>'; return; }
    connectToHost(name);
  }
  function connectToHost(name) {
    const g = P2P.game;
    if (!g || P2P.role !== 'guest') return;
    const conn = P2P.peer.connect(PREFIX + P2P.code, { reliable: true });
    g.conn = conn;
    const giveUp = setTimeout(() => {
      if (conn.open || P2P.game !== g) return;
      if (!g.inGame && g.lobbyEl) g.lobbyEl.innerHTML = `<h2>No game at ${esc(P2P.code)}</h2><p class="lead">Check the code, and make sure the host has the game open in their browser.</p><div class="modal-actions"><button class="btn primary" type="button" data-lobby="leave">Back</button></div>`;
      else retry(name);
    }, 12000);
    conn.on('open', () => { clearTimeout(giveUp); g.online = true; send(conn, { t: 'hello', cid: myId(), name, flag: (load(PREF_KEY) || {}).onlineFlag || null }); if (g.inGame) App().renderAll(); });
    conn.on('data', (m) => onGuestData(m));
    conn.on('close', () => { if (P2P.game !== g) return; g.online = false; if (g.inGame) { App().hint('Lost the host. Reconnecting…'); App().renderAll(); } retry(name); });
  }
  function retry(name) {
    const g = P2P.game;
    clearTimeout(g && g.retryTimer);
    if (g && P2P.role === 'guest') g.retryTimer = setTimeout(() => { if (P2P.game === g && !g.online) connectToHost(name); }, 4000);
  }
  function onGuestData(m) {
    const g = P2P.game;
    if (!g || !m || typeof m !== 'object') return;
    if (m.t === 'welcome') g.seat = m.seat;
    else if (m.t === 'lobby') { g.seats = m.seats; g.started = m.started; if (!g.inGame) renderLobby(); else App().renderAll(); }
    else if (m.t === 'state') {
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
      if (P2P.role === 'host') { broadcast(msg); for (const w of g.watchers || []) send(w, msg); saveHosted(); }
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
