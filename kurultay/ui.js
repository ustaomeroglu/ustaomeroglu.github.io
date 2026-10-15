/* Kurultay — game UI: input, panels, turn flow, modals, local saves. */
(function () {
  'use strict';
  const CC = window.CC, UN = CC.UNITS, RULES = CC.RULES;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SAVE_KEY = 'banners-borders-save-v1';
  const PREF_KEY = 'banners-borders-prefs-v1';

  const App = {
    st: null, R: null, online: null, sel: null, plan: null, busy: false, hover: -1,
    endArmed: 0, timerEnd: 0, timerId: 0, token: 0, prefs: { aiSpeed: 'normal' },
  };
  CC.App = App;

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function load(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  // ------------------------------------------------------------ helpers
  const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
  const pct = (p) => Math.round(p * 100) + '%';
  const oddsClass = (p) => (p >= 0.7 ? 'good' : p >= 0.45 ? 'mid' : 'bad');
  function compText(u) {
    const parts = [];
    UN.forEach((d, k) => { if (u[k]) parts.push(`${u[k]} ${(u[k] > 1 ? d.name : d.one).toLowerCase()}`); });
    return parts.join(', ') || 'nobody';
  }
  const swatch = (c, extra) => `<span class="swatch" style="--c:${c}${extra ? ';' + extra : ''}"></span>`;
  // a house's mark: its drawn flag when it has one, else its colour
  const flagUrls = new Map();
  function flagUrl(flag, hex) {
    const key = hex + flag;
    if (!flagUrls.has(key)) { const cv = CC.flagImage && CC.flagImage(flag, hex); flagUrls.set(key, cv ? cv.toDataURL() : ''); }
    return flagUrls.get(key);
  }
  const flagTag = (flag, hex, cls) => `<img class="flagmark ${cls || ''}" alt="" src="${flagUrl(flag, hex)}">`;
  const mark = (st, owner) => { const f = CC.flagOf(st, owner), hex = CC.colorOf(st, owner); return f ? flagTag(f, hex) : swatch(hex); };
  const Sfx = CC.Sfx || { play() {}, setOn() {}, setVolume() {} };
  const sfx = (name, o) => Sfx.play(name, o);
  // Attributes for a control that stays hoverable when unavailable, so its tip can say why.
  function gate(ok, why, tipOk) {
    if (ok) return tipOk ? `data-tip="${esc(tipOk)}"` : '';
    return `aria-disabled="true" data-tip="${esc(`<span class="why">${esc(why)}</span>`)}"`;
  }
  const tip = (html) => `data-tip="${esc(html)}"`;
  const tipFn = (key) => `data-tipfn="${key}"`;
  function plainText(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; }
  function humanCount() { return App.st.players.filter((p) => !p.ai).length; }
  const canMove = (a) => CC.marchLeft(a) > 0;
  const stepsText = (a) => { const left = CC.movesLeft(a), full = a.sea ? RULES.transportMP : CC.armyStats(a.u).mp; return `${left} of ${full} ${a.sea ? 'sea move' : 'step'}${full === 1 ? '' : 's'} left`; };

  // may this browser act for player p right now?
  function controls(p) {
    const s = App.st;
    if (!s || s.over || App.busy || s.cur !== p || s.players[p].ai) return false;
    return App.online ? App.online.isMine(p) : true;
  }
  const myTurn = () => !!App.st && controls(App.st.cur);

  let hintTimer = 0;
  function hint(text) {
    const el = $('#hint');
    el.textContent = text; el.classList.add('show');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function commit() {
    if (App.online) App.online.push();
    else if (App.st) store(SAVE_KEY, { save: CC.serialize(App.st), at: Date.now() });
    renderAll();
  }

  // ------------------------------------------------------------ rendering
  let drawQueued = false;
  function drawMap() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; paintMap(); });
  }
  function paintMap() {
    const R = App.R, s = App.st;
    if (!R || !s) return;
    R.ov.readyOwner = myTurn() ? s.cur : -99;
    R.ov.selArmy = App.sel && App.sel.kind === 'army' ? App.sel.id : null;
    R.ov.selTile = !App.sel ? null : App.sel.kind === 'tile' ? App.sel.i : App.sel.kind === 'city' ? s.cities[App.sel.id].tile : null;
    R.ov.hover = App.hover >= 0 ? App.hover : null;
    R.ov.coach = Coach.on ? Coach.marks : null;
    R.ov.zoc = App.plan && myTurn() ? App.plan.zoc : null;
    R.ov.routes = App.routes || [];
    const fl = App.sel && App.sel.kind === 'fleet' ? CC.getFleet(s, App.sel.id) : null;
    R.ov.selFleet = fl ? fl.id : null;
    const myFleet = fl && fl.owner === s.cur && myTurn();
    R.ov.fleetReach = myFleet ? CC.fleetReach(s, fl.id).dist : null;
    R.ov.targets = myFleet ? CC.bombardTargets(s, fl.id) : null;
    const sa = App.sel && App.sel.kind === 'army' ? CC.getArmy(s, App.sel.id) : null;
    const mySea = !!(sa && sa.sea && sa.owner === s.cur && myTurn());
    if (mySea) {
      const sr = CC.seaReach(s, sa.id);
      R.ov.fleetReach = sr.dist;
      R.ov.landing = CC.movesLeft(sa) > 0 ? CC.landingSpots(s, sa.id, sr) : null;
    } else R.ov.landing = null;
    R.ov.course = myFleet || mySea ? App.course : null; R.ov.courseOk = App.courseOk;
    if (Coach.on) placeCoach();
    if (App.plan && App.plan.res) {
      R.ov.plan = App.plan.res; R.ov.reach = { dist: App.plan.reachDist, mp: App.plan.mp }; R.ov.planColor = CC.colorOf(s, s.cur);
    } else { R.ov.plan = null; R.ov.reach = null; }
    R.draw();
  }

  // every house's trade routes, recomputed after each action (drawn as dashed lines)
  function computeRoutes() {
    const s = App.st, out = [];
    if (!s) return out;
    for (const p of s.players) {
      if (!p.alive) continue;
      for (const r of CC.tradeRoutes(s, p.id)) {
        if (r.kind !== 'market' && r.partner < p.id) continue; // draw each agreement once
        let blockAt = null;
        if (r.blockedBy != null) blockAt = r.path.find((i) => { const f = CC.fleetAt(s, i); const a = CC.armyAt(s, i); return (f && f.owner === r.blockedBy) || (a && a.owner === r.blockedBy); });
        out.push(Object.assign({ owner: p.id, color: CC.colorOf(s, p.id), blockAt }, r));
      }
    }
    return out;
  }

  function renderAll() {
    App.routes = computeRoutes();
    renderTop(); renderPanel(); renderRealm(); renderChronicle(); renderStatus(); drawMap();
    if (tipFor && !tipFor.isConnected) hideUiTip();
  }
  let panelQueued = false;
  function renderPanelSoon() {
    if (panelQueued) return;
    panelQueued = true;
    requestAnimationFrame(() => { panelQueued = false; renderPanel(); renderStatus(); });
  }

  function renderTop() {
    const s = App.st, el = $('#topstats'), end = $('#btn-end');
    if (!s) { el.innerHTML = ''; end.setAttribute('aria-disabled', 'true'); return; }
    const p = s.players[s.cur], inc = CC.income(s, s.cur), mine = myTurn();
    el.innerHTML = `
      <div class="stat" ${tipFn('round')}><small>Round</small><b>${s.round}${s.maxRounds ? ' / ' + s.maxRounds : ''}</b></div>
      <div class="turnchip" ${tipFn('turn')}>${mark(s, s.cur)}<span class="name">${esc(p.name)}</span>${p.ai ? '<span class="tag">CPU</span>' : ''}</div>
      <div class="stat" ${tipFn('treasury')}><small>Treasury</small><b>${p.gold} <span class="${inc.net >= 0 ? 'pos' : 'neg'}">${signed(inc.net)}</span></b></div>
      <div class="stat" ${tipFn('orders')}><small>Orders</small><b>${p.orders} / ${CC.ordersPerTurn(s, s.cur)}</b></div>
      ${s.settings.timer && mine ? `<div class="stat timer" id="timer" ${tip('Time left in this turn. When it runs out, your turn ends by itself.')}><small>Time</small><b>–</b></div>` : ''}`;
    const armed = App.endArmed > Date.now();
    if (mine) { end.removeAttribute('aria-disabled'); end.dataset.tip = 'Finish your turn and let the next house play. Shortcut: E'; }
    else { end.setAttribute('aria-disabled', 'true'); end.dataset.tip = `<span class="why">${s.over ? 'The game is over.' : App.busy ? `${esc(p.name)} is moving. Wait for your turn.` : 'Wait for your turn.'}</span>`; }
    end.textContent = armed ? 'Really end turn?' : 'End turn';
    end.classList.toggle('armed', armed);
    updateTimer();
  }

  function renderStatus() {
    const el = $('#status'), s = App.st;
    if (!s) { el.textContent = ''; return; }
    const p = s.players[s.cur];
    if (s.over) el.textContent = 'The game is over.';
    else if (App.busy) el.innerHTML = `<span class="spin"></span> ${esc(p.name)} is on the march…`;
    else if (App.online && !myTurn()) el.innerHTML = `<span class="spin"></span> Waiting for ${esc(p.name)}`;
    else if (App.plan) el.innerHTML = 'Drag to paint · right-drag or drag a painted tile to erase · <b>Shift</b>-click sets where the army stops · paint onto another of your armies to join it';
    else el.textContent = '';
  }

  function renderRealm() {
    const s = App.st, el = $('#realm');
    if (!s) { el.innerHTML = ''; return; }
    const me = s.cur, mine = myTurn();
    el.innerHTML = s.players.map((p) => {
      const m = CC.summary(s, p.id);
      let dip = '';
      if (p.id !== me && p.alive && s.players[me].alive) {
        const until = CC.peaceUntil(s, me, p.id);
        const pays = s.dip.tributes.filter((t) => t.from === me && t.to === p.id), gets = s.dip.tributes.filter((t) => t.from === p.id && t.to === me);
        if (until) dip += `<span class="cpu peace" ${tip(`At peace with ${esc(s.players[me].name)} until the end of round ${until}. Neither side can march into the other's land.`)}>PEACE · R${until}</span>`;
        for (const t of gets) dip += `<span class="cpu" ${tip(`Pays you ${t.amount} gold a turn, ${t.left} more time${t.left === 1 ? '' : 's'}.`)}>+${t.amount}/T</span>`;
        for (const t of pays) dip += `<span class="cpu" ${tip(`You pay them ${t.amount} gold a turn, ${t.left} more time${t.left === 1 ? '' : 's'}.`)}>−${t.amount}/T</span>`;
        if (mine && !s.over) dip += `<button type="button" class="btn small dealbtn" data-dip="${p.id}" ${tip(`Propose a deal to ${esc(p.name)}: gold, tribute or peace`)}>Deal</button>`;
      }
      return `<li class="${p.id === s.cur && !s.over ? 'cur' : ''} ${p.alive ? '' : 'dead'}">${mark(s, p.id)}
        <span class="nm">${esc(p.name)}${p.ai ? '<span class="cpu">CPU</span>' : ''}${App.online ? App.online.seatBadge(p.id) : ''}</span><span class="sc" ${tip(scoreTip(m))}>${m.score}</span>
        <span class="facts">${p.alive ? `${m.cities} town${m.cities === 1 ? '' : 's'} · ${m.tiles} land · ${m.soldiers} soldiers · ${p.gold} gold` : `Fell in round ${p.elimRound}`}${dip ? `<span class="diprow">${dip}</span>` : ''}</span></li>`;
    }).join('');
  }

  function scoreTip(m) {
    const S = RULES.score;
    return `<b>Score ${m.score}</b><table class="tiptab"><tr><td>Land ${m.tiles} × ${S.tile}</td><td>${m.tiles * S.tile}</td></tr>
      <tr><td>Farms ${m.farms} × ${S.farm}</td><td>${m.farms * S.farm}</td></tr><tr><td>Mines ${m.mines} × ${S.mine}</td><td>${m.mines * S.mine}</td></tr>
      <tr><td>Towns ${m.cities} × ${S.city}</td><td>${m.cities * S.city}</td></tr></table>`;
  }

  // live tips, computed when hovered
  const TIPS = {
    round() {
      const s = App.st;
      if (!s.maxRounds) return `<b>Round ${s.round}</b><br>No round limit: play until one house remains.`;
      const left = s.maxRounds - s.round;
      return `<b>Round ${s.round} of ${s.maxRounds}</b><br>${left ? `${left} more round${left > 1 ? 's' : ''} after this one.` : 'This is the last round.'} When the last round ends, the highest score wins.`;
    },
    turn() { const s = App.st, p = s.players[s.cur]; return myTurn() ? '<b>Your turn.</b> Recruit, build and march, then press End turn.' : `<b>${esc(p.name)}</b> ${p.ai ? '(computer) is moving.' : 'is playing their turn.'}`; },
    treasury() {
      const s = App.st, p = s.cur, P = s.players[p], inc = CC.income(s, p);
      const towns = s.cities.filter((c) => c.owner === p).map((c) => `<tr><td>${esc(c.name)}${c.capital ? ' (capital)' : ''}${c.market ? `, market ${c.market}` : ''}</td><td>+${(c.capital ? RULES.capitalIncome : RULES.cityIncome) + c.market * RULES.marketIncome}</td></tr>`).join('');
      let farms = 0, rf = 0, mines = 0;
      for (const t of s.tiles) if (t.owner === p) { if (t.b === 'farm') { farms++; if (t.river) rf++; } else if (t.b === 'mine') mines++; }
      const u = CC.Z();
      for (const a of s.armies) if (a.owner === p) a.u.forEach((n, k) => { u[k] += n; });
      const trade = inc.routes.map((r) => `<tr class="${r.ok ? '' : 'neg'}"><td>${r.kind === 'market' ? `Market: ${esc(r.name)}` : `Trade with ${esc(r.name)}${r.bonus ? ` (${r.base} + ${r.bonus} from markets)` : ''}`}${r.ok ? '' : r.noHarbor ? ' (no harbor)' : r.noRoute ? ' (no route)' : ` (blocked by ${esc(CC.nameOf(s, r.blockedBy))})`}</td><td>${r.ok ? '+' + r.value : '0'}</td></tr>`).join('');
      return `<b>${P.gold} gold in the treasury</b><table class="tiptab">${towns}
        <tr><td>Farms: ${farms}${rf ? ` (${rf} by a river)` : ''}</td><td>+${inc.farms}</td></tr>
        <tr><td>Gold mines: ${mines}</td><td>+${inc.mines}</td></tr>
        ${trade}
        <tr class="neg"><td>Troops: ${CC.sum(u)} soldiers</td><td>−${inc.troops}</td></tr>
        ${inc.ships ? `<tr class="neg"><td>Warships: ${inc.ships} × ${RULES.shipUpkeep}</td><td>−${inc.shipUpkeep}</td></tr>` : ''}
        ${inc.outposts ? `<tr class="neg"><td>Outposts: ${inc.outposts} × ${RULES.outpostUpkeep}</td><td>−${inc.outpostUpkeep}</td></tr>` : ''}
        <tr class="sum"><td>Next turn</td><td>${signed(inc.net)}</td></tr></table>`;
    },
    orders() {
      const s = App.st, P = s.players[s.cur], max = CC.ordersPerTurn(s, s.cur);
      return `<b>${P.orders} of ${max} marching orders left</b><br>Each march into land you don't hold uses one. Moving inside your own land is free. You get ${RULES.ordersBase} + 1 per town you hold (max ${RULES.ordersMax}).`;
    },
    farms() {
      const fs = CC.farmSlots(App.st, App.st.cur);
      return `<b>${fs.farms} of ${fs.max} farms built</b><br>You may build 1 farm per ${RULES.tilesPerFarm} tiles you hold. You hold ${fs.tiles} tiles. Farms go on plains or by rivers and pay +${RULES.farmIncome} gold a turn (+${RULES.riverFarmBonus} by a river).`;
    },
    capacity() { return `A force seizes 1 tile plus 1 for every 2 soldiers (knights count double), up to ${RULES.capMax}. Tiles you already hold are free.`; },
    range() { return `Each army walks ${RULES.baseMP} steps a turn (${RULES.cavalryMP} if only knights) and may split them over several marches. Your own land costs 1 a tile; outside it plains cost 1, forest, hills and rivers 2 or more. Large armies are slower: −1 step from 16 soldiers, −2 from 31. Winning a battle costs 1 to 4 steps (less when you heavily outnumber the enemy); losing one ends its moves for the turn. Next to an enemy town or outpost an army may only attack it or turn back.`; },
  };

  function renderChronicle() {
    const s = App.st, el = $('#chron');
    if (!s) { el.innerHTML = ''; return; }
    el.innerHTML = s.log.slice(-40).reverse().map((e) => `<li class="${e.kind}"><span class="r">R${e.r}</span><span>${esc(e.text)}</span></li>`).join('');
  }

  // ------------------------------------------------------------ side panel
  // One thing at a time: the selected army, town, fleet or tile, or else a short summary of the turn.
  function renderPanel() {
    const el = $('#panel'), s = App.st;
    if (!s) { el.innerHTML = ''; return; }
    const sel = App.sel;
    let html;
    if (sel && sel.kind === 'army' && CC.getArmy(s, sel.id)) html = panelArmy(CC.getArmy(s, sel.id));
    else if (sel && sel.kind === 'fleet' && CC.getFleet(s, sel.id)) html = panelFleet(CC.getFleet(s, sel.id));
    else if (sel && sel.kind === 'city') html = panelCity(s.cities[sel.id]);
    else if (sel && sel.kind === 'tile') html = panelTile(sel.i);
    else html = panelIdle();
    el.innerHTML = html;
    coachTick();
  }

  function closeBtn() { return '<button class="btn small ghost" data-act="deselect" type="button" aria-label="Close">✕</button>'; }
  const chip = (label, value, tipAttr, cls) => `<span class="chip ${cls || ''}" ${tipAttr || ''}><small>${label}</small><b>${value}</b></span>`;
  const head = (color, title, sub, owner) => `<div class="pane-head">${owner != null && App.st && CC.flagOf(App.st, owner) ? mark(App.st, owner) : swatch(color)}<h2>${title}</h2>${closeBtn()}</div>${sub ? `<p class="sub">${sub}</p>` : ''}`;

  function panelIdle() {
    const s = App.st, p = s.players[s.cur];
    if (s.over) {
      return `<div class="pane-head"><h2>The chronicle is closed</h2></div><p class="sub">${esc(s.players[s.over.winner].name)} won the realm.</p>
        <div class="actions"><button class="btn primary" type="button" data-act="show-over">Final standings</button><button class="btn" type="button" data-act="new-game">New game</button></div>`;
    }
    if (!myTurn()) {
      const why = App.busy ? 'is making their moves' : App.online ? 'is playing their turn' : 'is thinking';
      return `<div class="pane-head">${mark(s, s.cur)}<h2>${esc(p.name)}</h2><span class="tag">${p.ai ? 'CPU' : 'Their turn'}</span></div>
        <p class="sub"><span class="spin"></span> ${esc(p.name)} ${why}…</p>${App.online ? App.online.panelExtra() : ''}`;
    }
    const inc = CC.income(s, s.cur), fs = CC.farmSlots(s, s.cur);
    const armies = s.armies.filter((a) => a.owner === s.cur && canMove(a));
    const fleets = s.fleets.filter((f) => f.owner === s.cur && (CC.fleetMovesLeft(f) > 0 || !f.fired));
    const offers = s.dip.offers.filter((o) => o.to === s.cur).length;
    const rows = armies.map((a) => `<li><button type="button" data-act="sel-army" data-id="${a.id}" ${tip(`${compText(a.u)}. ${stepsText(a)}.`)}>${mark(s, a.owner)}<b>${CC.sum(a.u)}</b><span class="meta">${esc(CC.placeName(s, a.tile))} · ${CC.movesLeft(a)} step${CC.movesLeft(a) === 1 ? '' : 's'}</span></button></li>`)
      .concat(fleets.map((f) => `<li><button type="button" data-act="sel-fleet" data-id="${f.id}" ${tip(`${f.n} warship${f.n === 1 ? '' : 's'}. ${CC.fleetMovesLeft(f)} moves left${f.fired ? ', guns fired' : ', guns ready'}.`)}>${shipGlyph(CC.colorOf(s, f.owner))}<b>${f.n}</b><span class="meta">at sea · ${CC.fleetMovesLeft(f)} moves</span></button></li>`)).join('');
    return `<div class="pane-head">${mark(s, s.cur)}<h2>${esc(p.name)}</h2><span class="tag gilt">Your turn</span></div>
      <div class="chips">${chip('Gold', `${p.gold} <span class="${inc.net >= 0 ? 'pos' : 'neg'}">${signed(inc.net)}</span>`, tipFn('treasury'))}${chip('Orders', `${p.orders}/${CC.ordersPerTurn(s, s.cur)}`, tipFn('orders'))}${chip('Farms', `${fs.farms}/${fs.max}`, tipFn('farms'))}${inc.trade ? chip('Trade', `+${inc.trade}`, tipFn('treasury')) : ''}</div>
      ${offers ? `<div class="actions"><button class="btn primary" type="button" data-act="offers">${offers} offer${offers === 1 ? '' : 's'} waiting</button></div>` : ''}
      <h3>Ready to move</h3>
      ${rows ? `<ul class="list">${rows}</ul>` : '<p class="hint-text">Nothing left to move. Recruit, build, or end your turn.</p>'}
      <p class="hint-text">Click to command · right-click to inspect · <kbd>N</kbd> next · <kbd>E</kbd> end turn</p>`;
  }

  function unitList(u) {
    return `<div class="unitlist">${UN.map((d, k) => (u[k] ? `<span ${tip(`${d.desc} Attack ${d.att} · defense ${d.def}.`)}><b>${u[k]}</b> ${u[k] > 1 ? d.name : d.one}</span>` : '')).join('')}</div>`;
  }

  function panelArmy(a) {
    const s = App.st, color = CC.colorOf(s, a.owner);
    const title = a.owner < 0 ? 'Rebel garrison' : a.owner === s.cur ? `Army · ${CC.sum(a.u)}` : `${esc(CC.nameOf(s, a.owner))} · ${CC.sum(a.u)}`;
    if (a.sea) return panelTransport(a);
    const top = head(color, title, esc(CC.placeName(s, a.tile)), a.owner);
    const pl = App.plan;
    if (!pl || pl.armyId !== a.id) {
      let note = '';
      if (a.owner === s.cur && myTurn() && !canMove(a)) note = `<p class="hint-text">${a.landed ? 'Landed from the sea: marches again next turn.' : (a.used || 0) >= CC.SPENT ? 'Lost a battle: done for this turn.' : 'No steps left this turn.'}</p>`;
      const land = a.owner === s.cur && myTurn() && !CC.cityAt(s, a.tile) ? `<div class="actions"><button class="btn small" type="button" data-act="land" data-i="${a.tile}">This land</button></div>` : '';
      return top + unitList(a.u) + note + land;
    }
    const r = pl.res, P = s.players[s.cur];
    const mov = CC.movable(a);
    const steppers = UN.map((d, k) => (mov[k] ? `<div class="unit-row"><div class="nm" ${tip(`${d.desc} Attack ${d.att} · defense ${d.def}.`)}>${d.name}</div>
      <div class="stepper"><button type="button" data-act="det" data-k="${k}" data-d="-1" ${gate(pl.u[k] > 0, `No ${d.name.toLowerCase()} are marching.`, `Keep one ${d.one.toLowerCase()} behind`)} aria-label="Fewer ${d.name}">−</button><output>${pl.u[k]}/${mov[k]}</output><button type="button" data-act="det" data-k="${k}" data-d="1" ${gate(pl.u[k] < mov[k], `All ${mov[k]} ${d.name.toLowerCase()} who can move are already marching.`, `Send one more ${d.one.toLowerCase()}`)} aria-label="More ${d.name}">+</button></div></div>` : '')).join('');
    const over = r.newTiles > r.cap;
    const battles = r.battles.map((b) => `<li><button type="button" data-act="focus" data-i="${b.tile}" ${tip(`Your strength ${b.A.toFixed(1)} against their ${b.D.toFixed(1)}, then each side rolls 2d6 for luck (×0.70 to ×1.30).`)}>${mark(s, b.owner)}${esc(CC.placeName(s, b.tile))}<span class="meta">${CC.sum(b.u) + b.militia} <span class="pill ${oddsClass(b.p)}">${pct(b.p)}</span></span></button></li>`).join('');
    const err = r.region.length ? r.errors.filter((e) => !/^Paint/.test(e))[0] : null;
    const town = CC.cityAt(s, a.tile);
    let board = '';
    if (town && town.owner === s.cur && CC.isCoastal(s, town.tile)) {
      const e = CC.canEmbark(s, a.id, pl.u);
      board = `<button class="btn" type="button" data-act="embark" ${gate(e.ok, e.reason, `Put ${CC.sum(pl.u)} soldier${CC.sum(pl.u) === 1 ? '' : 's'} aboard ships for ${CC.embarkCost(pl.u)} gold. At sea they sail ${RULES.transportMP} tiles a turn, but warships can sink them.`)}>Board ships · ${CC.embarkCost(pl.u)}g</button>`;
    }
    return top + `
      <div class="units">${steppers}</div>
      <div class="quick"><button class="btn small" type="button" data-act="det-all" ${tip('Send the whole army')}>All</button><button class="btn small" type="button" data-act="det-half" ${tip('Send half, keep half here')}>Half</button><button class="btn small" type="button" data-act="det-one" ${tip('Send one soldier: enough to claim an empty tile or guard a farm')}>One</button></div>
      <div class="chips">${chip('Land', `${r.newTiles}/${r.cap}`, tipFn('capacity'), over ? 'bad' : '')}${chip('Steps', `${r.mp}/${r.mpMax}`, tipFn('range'), r.bad.size ? 'bad' : '')}${chip('Order', r.newTiles ? `1 of ${P.orders}` : 'free', tipFn('orders'))}${r.battles.length ? chip('Fatigue', `−${r.fatigue}`, tip('A won battle costs 1 to 4 extra steps; losing one ends the turn.')) : ''}</div>
      ${r.battles.length ? `<ul class="list">${battles}</ul>${r.battles.length > 1 ? `<p class="hint-text">Win them all ≈ <span class="pill ${oddsClass(r.pAll)}">${pct(r.pAll)}</span></p>` : ''}` : ''}
      ${r.region.length ? `<p class="sub small">Ends at ${esc(CC.placeName(s, r.dest))}${r.destMoved ? ' (turns back out of the zone)' : ''}${r.usesSea ? ' · by ship' : ''}</p>` : '<p class="hint-text">Paint tiles on the map to march. Paint onto another of your armies to join it.</p>'}
      ${err ? `<p class="err">${esc(err)}</p>` : ''}
      <div class="actions"><button class="btn primary" type="button" data-act="march" ${gate(r.valid, r.errors[0] || 'Paint tiles on the map first.', 'Go (Enter)')}>${r.battles.length ? 'Attack' : r.newTiles ? 'March and claim' : 'March'}</button>
        <button class="btn" type="button" data-act="clear" ${gate(r.region.length, 'Nothing painted yet.', 'Erase the painted tiles (Esc)')}>Clear</button>
        ${!CC.cityAt(s, a.tile) ? `<button class="btn" type="button" data-act="land" data-i="${a.tile}" ${tip('Build on the tile this army stands on')}>Land</button>` : ''}${board}</div>`;
  }

  function panelTransport(a) {
    const s = App.st, own = a.owner === s.cur && myTurn();
    const top = head(CC.colorOf(s, a.owner), `${own ? 'Army' : esc(CC.nameOf(s, a.owner))} at sea · ${CC.sum(a.u)}`, 'Aboard ships', a.owner);
    if (!own) return top + unitList(a.u) + '<p class="hint-text">Soldiers at sea barely fight back. Sail a warship onto them to sink them.</p>';
    const danger = s.fleets.some((f) => f.owner !== a.owner && CC.atWar(s, a.owner, f.owner) && CC.hexDist(s, f.tile, a.tile) <= RULES.fleetMP + 1);
    const left = CC.movesLeft(a);
    return top + unitList(a.u) + `
      <div class="chips">${chip('Moves', `${left}/${RULES.transportMP}`, tip('Ships carry an army farther than it can march.'), left ? '' : 'bad')}</div>
      <p class="hint-text">${left ? 'Click the sea to sail · a gold-outlined shore to land. Landing ends this army\'s turn and claims the tile.' : 'No moves left this turn.'}</p>
      ${danger ? '<p class="err">Enemy warships can reach these ships. Soldiers at sea barely fight back.</p>' : ''}`;
  }

  const sendN = (f) => (App.fleetN && App.fleetN.id === f.id ? Math.max(1, Math.min(f.n, App.fleetN.n)) : f.n);
  function shipGlyph(color) { return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 10h12l-2 3H4z" fill="#5a3d22" stroke="#1d1812"/><path d="M8 2v8" stroke="#1d1812"/><path d="M8.5 2.5Q13 6 8.5 9.5z" fill="${color}" stroke="#1d1812" stroke-width=".8"/></svg>`; }

  function panelFleet(f) {
    const s = App.st, own = f.owner === s.cur && myTurn();
    const top = head(CC.colorOf(s, f.owner), `${own ? 'Fleet' : esc(CC.nameOf(s, f.owner))} · ${f.n} warship${f.n === 1 ? '' : 's'}`, 'At sea', f.owner);
    if (!own) return top + `<p class="hint-text">Sail one of your fleets onto it to attack.</p>`;
    const targets = CC.bombardTargets(s, f.id);
    const post = (s._posts || []).find((p) => p.tile === f.tile);
    const tlist = targets.map((i) => { const a = CC.armyAt(s, i); return `<li><button type="button" data-act="bombard" data-i="${i}" ${tip(`Each ship rolls 2d6 and kills a soldier on ${CC.cityAt(s, i) ? RULES.bombardWallHit : RULES.bombardHit}+${CC.cityAt(s, i) ? ' (behind walls)' : ''}. They cannot shoot back.`)}>${mark(s, a.owner)}${esc(CC.placeName(s, i))}<span class="meta">${CC.sum(a.u)} soldiers</span></button></li>`; }).join('');
    return top + `
      ${f.n > 1 && CC.fleetMovesLeft(f) ? (() => { const k = sendN(f); return `<div class="units"><div class="unit-row"><div class="nm" ${tip('Send part of the fleet; the rest stay here as their own fleet. Small fleets (up to ' + RULES.riverShips + ' ships) can sail up rivers.')}>Ships sailing</div>
        <div class="stepper"><button type="button" data-act="fdet" data-d="-1" ${gate(k > 1, 'At least one ship sails.', 'Keep one more ship here')} aria-label="Fewer ships">−</button><output>${k}/${f.n}</output><button type="button" data-act="fdet" data-d="1" ${gate(k < f.n, 'The whole fleet is sailing.', 'Send one more ship')} aria-label="More ships">+</button></div></div></div>
        <div class="quick"><button class="btn small" type="button" data-act="fdet-all" ${tip('Sail with the whole fleet')}>All</button><button class="btn small" type="button" data-act="fdet-half" ${tip('Send half, keep half here')}>Half</button><button class="btn small" type="button" data-act="fdet-one" ${tip('Send a single ship')}>One</button></div>`; })() : ''}
      <div class="chips">${chip('Moves', `${CC.fleetMovesLeft(f)}/${RULES.fleetMP}`)}${chip('Guns', f.fired ? 'fired' : 'ready', '', f.fired ? 'bad' : '')}${post ? chip('Market', `+${post.value}`, tip(`Holding ${post.name}. It pays while the sea route home is open.`)) : ''}</div>
      <p class="hint-text">${CC.fleetMovesLeft(f) || !f.fired ? 'Click a sea tile or river to sail · an enemy ship to attack · a red-marked army on the shore to bombard.' : 'Done for this turn.'}</p>
      ${tlist ? `<h3>Bombard</h3><ul class="list">${tlist}</ul>` : ''}`;
  }

  function panelCity(c) {
    const s = App.st, own = c.owner === s.cur && myTurn(), color = CC.colorOf(s, c.owner);
    const g = CC.armyAt(s, c.tile);
    const D = CC.powers([1], g ? g.u : CC.Z(), 1 + c.walls, CC.battleCtx(s, c.tile, false)).D;
    const inc = c.owner < 0 ? 0 : (c.capital ? RULES.capitalIncome : RULES.cityIncome) + c.market * RULES.marketIncome;
    const owner = c.owner < 0 ? 'Rebel town' : c.owner === s.cur ? (c.capital ? 'Your capital' : 'Your town') : esc(CC.nameOf(s, c.owner));
    let html = head(color, esc(c.name), owner, c.owner);
    const built = ['harbor', 'stables', 'barracks', 'foundry'].filter((k) => c[k]).map((k) => k[0].toUpperCase() + k.slice(1)).join(' · ');
    html += `<div class="chips">${chip('Walls', c.walls, tip(`Defenders ×${RULES.walls.mult[c.walls]}. Archers on walls fight twice as hard.`))}${chip('Defense', D.toFixed(1), tip('What an attacker must beat before dice.'))}${c.owner >= 0 ? chip('Gold', `+${inc}`) : ''}</div>
      <p class="sub small">${g ? compText(g.u) : 'No garrison'} + ${1 + c.walls} militia${built ? ` · ${built}` : ''}</p>`;
    const tr = CC.training(c);
    if (c.owner === s.cur && (CC.sum(tr.u) || tr.ships)) {
      // what is in training, each kind with a refund button while it is still your turn
      const rows = UN.map((d, k) => [k, tr.u[k], tr.u[k] === 1 ? d.one : d.name, d.cost]).filter((x) => x[1])
        .concat(tr.ships ? [['ships', tr.ships, tr.ships === 1 ? 'Warship' : 'Warships', RULES.shipCost]] : []);
      html += `<h3 ${tip('Recruits train for a turn. They join the garrison, ready to march, at the start of your next turn. If the town falls first, they are lost.')}>In training · ready next turn</h3><div class="buy-list">${rows.map(([k, n, name, cost]) => `<div class="buy"><div class="nm">${n} ${name}</div>
        ${own ? `<div class="btns"><button class="btn small" type="button" data-act="untrain" data-k="${k}" data-n="1" ${tip(`Cancel one and get ${cost} gold back`)}>−1</button>${n > 1 ? `<button class="btn small" type="button" data-act="untrain" data-k="${k}" ${tip(`Cancel all ${n} and get ${cost * n} gold back`)}>Cancel all</button>` : ''}</div>` : ''}</div>`).join('')}</div>`;
    }
    if (!own) return html;
    if (g && canMove(g)) html += `<div class="actions"><button class="btn primary" type="button" data-act="sel-army" data-id="${g.id}">Command the garrison</button></div>`;
    const tab = App.cityTab || 'recruit';
    html += `<div class="seg tabs2"><button type="button" data-act="ctab" data-tab="recruit" aria-pressed="${tab === 'recruit'}">Recruit</button><button type="button" data-act="ctab" data-tab="build" aria-pressed="${tab === 'build'}">Build</button></div>`;
    if (tab === 'recruit') {
      const left = CC.recruitCap(c) - c.recruited;
      html += `<p class="sub small">${left} of ${CC.recruitCap(c)} recruits left this turn</p><div class="buy-list">`;
      UN.forEach((d, k) => {
        const r1 = CC.canRecruit(s, s.cur, c.id, k, 1);
        const n5 = Math.min(5, Math.max(1, left));
        const r5 = CC.canRecruit(s, s.cur, c.id, k, n5);
        html += `<div class="buy"><div class="nm" ${tip(`${d.desc} Attack ${d.att} · defense ${d.def} · upkeep ${d.upkeep}.`)}>${d.name} <span class="cost">${d.cost}g</span></div>
          <div class="btns"><button class="btn small" type="button" data-act="recruit" data-k="${k}" data-n="1" ${gate(r1.ok, r1.reason, `Train 1 for ${r1.cost} gold, ready next turn`)}>+1</button>
          ${n5 > 1 ? `<button class="btn small" type="button" data-act="recruit" data-k="${k}" data-n="${n5}" ${gate(r5.ok, r5.reason, `Train ${n5} for ${r5.cost} gold, ready next turn`)}>+${n5}</button>` : ''}</div></div>`;
      });
      if (CC.isCoastal(s, c.tile)) {
        const w = CC.canRecruitShips(s, s.cur, c.id, 1);
        html += `<div class="buy"><div class="nm" ${tip(`Warships fight at sea, hold distant markets, block trade routes and bombard armies on the shore. Attack ${RULES.shipAtt} · defense ${RULES.shipDef} · upkeep ${RULES.shipUpkeep}.`)}>Warship <span class="cost">${RULES.shipCost}g</span></div>
          <div class="btns"><button class="btn small" type="button" data-act="ships" data-n="1" ${gate(w.ok, w.reason, `Build a warship for ${w.cost} gold, at sea next turn`)}>+1</button></div></div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="buy-list">';
      const ups = [
        ['walls', 'Walls', `Level ${c.walls + 1}: defenders ×${RULES.walls.mult[Math.min(3, c.walls + 1)]}, +2 recruits a turn`],
        ['market', 'Market', `Level ${c.market + 1}: +${RULES.marketIncome} gold every turn, and +${RULES.marketTrade} on each of your trade agreements (up to +${RULES.marketTradeMax} each)`],
        ['harbor', 'Harbor', 'Launch warships; armies board ships here; home port for trade'],
        ['barracks', 'Barracks', 'Train swordsmen here'],
        ['stables', 'Stables', 'Train knights here'],
        ['foundry', 'Foundry', 'Cast cannons here'],
      ];
      for (const [kind, name, desc] of ups) {
        if (kind === 'harbor' && !CC.isCoastal(s, c.tile)) continue;
        const info = CC.upgradeInfo(s, s.cur, c.id, kind);
        const done = info.max != null && info.level >= info.max;
        const lvl = kind === 'walls' || kind === 'market' ? ` ${info.level}/${info.max}` : '';
        html += `<div class="buy"><div class="nm" ${tip(done ? info.reason : desc)}>${name}${lvl}${done ? ' <span class="ok">✓</span>' : ` <span class="cost">${info.cost}g</span>`}</div>
          ${done ? '' : `<button class="btn small" type="button" data-act="upgrade" data-kind="${kind}" ${gate(info.ok, info.reason, `${desc}. ${info.cost} gold.`)}>Build</button>`}</div>`;
      }
      html += '</div>';
    }
    return html;
  }

  function panelTile(i) {
    const s = App.st, t = s.tiles[i], T = CC.TERRAIN[t.t];
    const a = CC.armyAt(s, i);
    const owner = t.owner >= 0 ? (t.owner === s.cur ? 'Your land' : esc(CC.nameOf(s, t.owner))) : T.passable ? 'Unclaimed' : t.t === 'water' ? 'Open water' : 'Impassable';
    let html = head(t.owner >= 0 ? CC.colorOf(s, t.owner) : '#8d877c', `${T.name}${t.river ? ' · river' : ''}`, owner);
    const bits = [];
    if (t.gold) bits.push('gold deposit');
    if (t.b === 'farm') bits.push(`farm +${RULES.farmIncome + (t.river ? RULES.riverFarmBonus : 0)}`);
    if (t.b === 'mine') bits.push(`mine +${RULES.mineIncome}`);
    if (t.b === 'tower') bits.push('outpost');
    if (T.passable) html += `<div class="chips">${chip('Defense', `×${(T.def * (t.b === 'tower' ? RULES.outpostDef : t.b === 'farm' || t.b === 'mine' ? RULES.structureDef : 1)).toFixed(2)}`)}${chip('Step cost', T.cost + (t.river ? 1 : 0), tip('Outside your land. Your own land always costs 1.'))}</div>`;
    if (bits.length) html += `<p class="sub small">${bits.join(' · ')}</p>`;
    if (a && a.owner === s.cur && myTurn() && canMove(a)) html += `<div class="actions"><button class="btn" type="button" data-act="sel-army" data-id="${a.id}">Command this army</button></div>`;
    html += buildSection(i);
    return html;
  }

  // what can be built on tile i
  function buildSection(i) {
    const s = App.st, t = s.tiles[i];
    if (!(t.owner === s.cur && myTurn()) || t.b) return '';
    const fs = CC.farmSlots(s, s.cur);
    const opts = [
      ['farm', 'Farm', `+${RULES.farmIncome + (t.river ? RULES.riverFarmBonus : 0)} gold a turn. ${fs.farms} of ${fs.max} farms allowed (1 per ${RULES.tilesPerFarm} land).`],
      ['mine', 'Gold mine', `+${RULES.mineIncome} gold a turn.`],
      ['outpost', 'Outpost', `Enemies on the 6 tiles around it may only attack it or turn back. ${RULES.outpostMilitia} militia, soldiers here fight ×${RULES.outpostDef}. Upkeep ${RULES.outpostUpkeep}.`],
      ['castle', 'Castle', `A new town: +${RULES.cityIncome} gold a turn, recruits, walls, +1 marching order.`],
    ];
    let html = '<h3>Build here</h3><div class="buy-list">';
    for (const [kind, name, desc] of opts) {
      if (kind === 'mine' && !t.gold) continue;
      if (kind === 'farm' && t.gold) continue;
      const r = CC.canBuild(s, s.cur, i, kind);
      html += `<div class="buy"><div class="nm" ${tip(desc)}>${name} <span class="cost">${r.cost}g</span></div>
        <button class="btn small" type="button" data-act="build" data-kind="${kind}" data-tile="${i}" ${gate(r.ok, r.reason, `${desc} ${r.cost} gold.`)}>Build</button></div>`;
    }
    return html + '</div>';
  }

  function denied(b) {
    sfx('deny');
    hint(plainText(b.dataset.tip || '') || 'Not available right now.');
  }

  function onPanelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    if (b.getAttribute('aria-disabled') === 'true') { denied(b); return; }
    const s = App.st, act = b.dataset.act;
    if (act === 'deselect') select(null);
    else if (act === 'sel-army') { select({ kind: 'army', id: +b.dataset.id }); const a = CC.getArmy(s, +b.dataset.id); if (a) ensureVisible(a.tile); }
    else if (act === 'sel-fleet') { select({ kind: 'fleet', id: +b.dataset.id }); const f = CC.getFleet(s, +b.dataset.id); if (f) ensureVisible(f.tile); }
    else if (act === 'land') select({ kind: 'tile', i: +b.dataset.i });
    else if (act === 'ctab') { App.cityTab = b.dataset.tab; renderPanel(); }
    else if (act === 'focus') { App.R.glideTo(+b.dataset.i); App.R.pulse(+b.dataset.i); }
    else if (act === 'show-over') showGameOver();
    else if (act === 'new-game') showSetup();
    else if (act === 'offers') reviewOffers();
    else if (!myTurn()) return;
    else if (act === 'det' || act === 'det-all' || act === 'det-half' || act === 'det-one') {
      const pl = App.plan, a = CC.getArmy(s, pl.armyId);
      const mov = CC.movable(a);
      if (act === 'det') { const k = +b.dataset.k; pl.u[k] = Math.max(0, Math.min(mov[k], pl.u[k] + +b.dataset.d)); }
      else if (act === 'det-all') pl.u = mov;
      else if (act === 'det-half') pl.u = mov.map((n) => Math.ceil(n / 2));
      else { const k = [0, 1, 3, 2, 4].find((x) => mov[x] > 0); pl.u = CC.Z(); if (k != null) pl.u[k] = 1; }
      refreshPlan(); renderAll();
    } else if (act === 'march') march();
    else if (act === 'embark') boardShips();
    else if (act === 'clear') clearPlan();
    else if (act.startsWith('fdet')) {
      const f = App.sel && App.sel.kind === 'fleet' && CC.getFleet(s, App.sel.id);
      if (!f) return;
      const k = sendN(f);
      const n = act === 'fdet' ? k + +b.dataset.d : act === 'fdet-all' ? f.n : act === 'fdet-half' ? Math.ceil(f.n / 2) : 1;
      App.fleetN = { id: f.id, n: Math.max(1, Math.min(f.n, n)) };
      tipTile = -2; renderAll();
    }
    else if (act === 'bombard') fireAt(+b.dataset.i);
    else if (act === 'recruit') {
      const r = CC.recruit(s, s.cur, App.sel.id, +b.dataset.k, +b.dataset.n);
      if (!r.ok) { sfx('deny'); hint(r.reason); } else { sfx('recruit'); App.R.pulse(s.cities[App.sel.id].tile, CC.colorOf(s, s.cur)); commit(); hint('In training: they join the garrison at the start of your next turn.'); }
    } else if (act === 'untrain') {
      const k = b.dataset.k === 'ships' ? 'ships' : +b.dataset.k;
      const r = CC.cancelTraining(s, s.cur, App.sel.id, k, b.dataset.n ? +b.dataset.n : null);
      if (!r.ok) { sfx('deny'); hint(r.reason); } else { sfx('coins', { n: Math.min(6, 1 + Math.round(r.refund / 15)) }); commit(); hint(`Cancelled: ${r.refund} gold back in the treasury.`); }
    } else if (act === 'ships') {
      const r = CC.recruitShips(s, s.cur, App.sel.id, +b.dataset.n);
      if (!r.ok) { sfx('deny'); hint(r.reason); } else { sfx('waves'); App.R.pulse(s.cities[App.sel.id].tile, CC.colorOf(s, s.cur)); commit(); hint('The shipwrights are at work: the warship puts to sea at the start of your next turn.'); }
    } else if (act === 'upgrade') {
      const r = CC.upgrade(s, s.cur, App.sel.id, b.dataset.kind);
      if (!r.ok) { sfx('deny'); hint(r.reason); } else { sfx('upgrade'); App.R.pulse(s.cities[App.sel.id].tile, '#ffd77a'); commit(); }
    } else if (act === 'build') {
      const tile = b.dataset.tile != null ? +b.dataset.tile : App.sel.i;
      const r = CC.build(s, s.cur, tile, b.dataset.kind);
      if (!r.ok) { sfx('deny'); hint(r.reason); }
      else {
        sfx(b.dataset.kind === 'castle' ? 'upgrade' : 'build');
        App.R.pulse(tile, '#ffd77a');
        if (b.dataset.kind === 'castle') App.sel = { kind: 'city', id: s.tiles[tile].city };
        commit();
      }
    }
  }

  // ------------------------------------------------------------ selection and orders
  function select(sel) {
    if (sel) {
      const s = App.st;
      const tile = sel.kind === 'army' ? (CC.getArmy(s, sel.id) || {}).tile : sel.kind === 'fleet' ? (CC.getFleet(s, sel.id) || {}).tile : sel.kind === 'city' ? s.cities[sel.id].tile : sel.i;
      const a = sel.kind === 'army' && CC.getArmy(s, sel.id);
      sfx(a && a.owner === s.cur && myTurn() && canMove(a) ? 'select' : sel.kind === 'fleet' ? 'waves' : sel.kind === 'city' ? 'town' : 'click');
      if (sel.kind !== 'tile' && sel.kind !== 'city') setSideTab('turn');
      App.R.pulse(tile, a ? CC.colorOf(s, a.owner) : '#fff6dc');
    }
    App.sel = sel; App.plan = null; App.course = null; App.fleetN = null;
    if (sel) setSideTab('turn');
    if (sel && sel.kind === 'army') {
      const a = CC.getArmy(App.st, sel.id);
      if (!a) App.sel = null;
      else if (controls(a.owner) && canMove(a) && !a.sea) { App.plan = { armyId: a.id, u: CC.movable(a), region: [], dest: a.tile }; refreshPlan(true); }
    }
    tipTile = -2;
    renderPanel(); renderStatus(); drawMap();
  }

  function refreshPlan(forceReach) {
    const pl = App.plan, s = App.st;
    const a = pl && CC.getArmy(s, pl.armyId);
    if (!a) { App.plan = null; return; }
    pl.res = CC.planCampaign(s, pl.armyId, pl.u, pl.region, pl.dest);
    pl.dest = pl.res.dest;
    const u = CC.sum(pl.u) ? pl.u : a.u;
    // What may be painted is what the army could reach if it attacked every enemy on the way.
    // Zone tiles painted without their owner turn red, and the plan explains why.
    pl.mp = CC.movesLeft(a, u);
    pl.reachDist = CC.reach(s, pl.armyId, u, pl.region, true).dist;
    pl.zoc = CC.zocTiles(s, a.owner, new Set(pl.region));
    tipTile = -2;
  }

  function clearPlan() {
    const pl = App.plan;
    if (!pl) return;
    pl.region = []; pl.dest = CC.getArmy(App.st, pl.armyId).tile;
    refreshPlan(); renderAll();
  }

  // why tile i cannot be painted right now, or null when it can
  function paintBlock(i) {
    const pl = App.plan, s = App.st, a = CC.getArmy(s, pl.armyId), t = s.tiles[i];
    if (!CC.passable(s, i)) return t.t === 'water' ? 'Armies cannot march on water. In a town with a harbor they can board ships.' : 'Mountains cannot be crossed.';
    if (pl.mp <= 0) return 'This army has no steps left this turn.';
    if (t.owner >= 0 && t.owner !== a.owner && CC.atPeace(s, a.owner, t.owner)) return `You are at peace with ${CC.nameOf(s, t.owner)} until round ${CC.peaceUntil(s, a.owner, t.owner)}. You cannot march into their land.`;
    if (!(pl.reachDist[i] <= pl.mp)) return `Too far: this army has ${pl.mp} step${pl.mp === 1 ? '' : 's'} left this turn.`;
    if (t.owner !== a.owner) {
      const cap = CC.landLeft(a, pl.u), full = CC.armyStats(pl.u).cap;
      if (!full) return 'Choose who marches first.';
      const fresh = pl.region.filter((x) => s.tiles[x].owner !== a.owner).length;
      if (fresh >= cap) return cap < full ? `This force can seize ${cap} more tile${cap === 1 ? '' : 's'} this turn (it already took ${a.took}).` : `This force can seize ${cap} tile${cap > 1 ? 's' : ''}. Send more soldiers to seize more.`;
      if (!(s.players[a.owner].orders > 0)) return 'No marching orders left this turn. Moving inside your own land is still free.';
    }
    return null;
  }

  // returns true when the painted region changed. stroke: shared state of one drag, so a refusal is said once.
  function applyPaint(i, mode, stroke) {
    const pl = App.plan, s = App.st;
    if (!pl) return false;
    const a = CC.getArmy(s, pl.armyId);
    const at = pl.region.indexOf(i);
    if (mode === 'remove') {
      if (at < 0) return false;
      pl.region.splice(at, 1);
      if (pl.dest === i) pl.dest = pl.region.length ? pl.region[pl.region.length - 1] : a.tile;
      sfx('erase');
      return true;
    }
    if (at >= 0 || i === a.tile) return false;
    const why = paintBlock(i);
    if (why) {
      if (!stroke || !stroke.denied) { hint(why); sfx('deny'); }
      if (stroke) stroke.denied = true;
      return false;
    }
    pl.region.push(i); pl.dest = i;
    sfx('paint');
    // painting an enemy opens its zone at once, so a drag can carry on past it
    if (CC.zocSources(s, a.owner).has(i)) refreshPlan();
    return true;
  }

  // tile path from the army's start to `tile`, following a route table
  function chainTo(prev, origin, tile) {
    const path = [];
    for (let j = tile, g = 0; j >= 0 && j !== origin && g < 300; j = prev[j], g++) path.push(j);
    path.push(origin);
    return path.reverse();
  }
  function marchRoute(prev, rep) {
    if (rep.halted && rep.battles.length) {
      const go = chainTo(prev, rep.origin, rep.battles[rep.battles.length - 1].tile);
      return rep.end >= 0 ? go.concat(go.slice(0, -1).reverse()) : go;
    }
    return chainTo(prev, rep.origin, rep.end >= 0 ? rep.end : rep.origin);
  }
  async function playMarch(rep, prev, color, speed, vol) {
    const route = marchRoute(prev, rep);
    const n = CC.sum(rep.sent);
    const knights = rep.sent[0] === 0 && rep.sent[1] === 0 && rep.sent[2] > 0;
    const dur = Math.max(0.45, Math.min(1.6, 0.15 * (route.length - 1))) * (speed || 1);
    if (route.length > 1) sfx(knights ? 'gallop' : 'march', { dur, vol: vol == null ? 1 : vol });
    await App.R.animateMarch(route, color, rep.sent, rep.halted ? rep.origin : rep.end, speed);
    if (rep.captured.length) {
      App.R.ov.flash = { tiles: rep.captured.slice(), color, alpha: 0.9 };
      drawMap();
      setTimeout(() => { if (App.R.ov.flash && App.R.ov.flash.tiles === rep.captured) { App.R.ov.flash = null; drawMap(); } }, 450);
    }
  }

  async function march() {
    const pl = App.plan, s = App.st;
    if (!pl || !pl.res || !myTurn()) return;
    if (!pl.res.valid) { sfx('deny'); hint(pl.res.errors[0] || 'Paint tiles on the map first.'); return; }
    const prev = pl.res.prev, color = CC.colorOf(s, s.cur);
    const rep = CC.executeCampaign(s, pl.armyId, pl.u, pl.region, pl.dest);
    if (rep.error) { sfx('deny'); hint(rep.error); return; }
    App.plan = null; App.sel = null;
    commit();
    App.animating = true;
    await playMarch(rep, prev, color, 1, 1);
    App.animating = false;
    if (rep.battles.length) await showBattleReport(rep);
    else if (rep.captured.length) hint(`Claimed ${rep.captured.length} tile${rep.captured.length > 1 ? 's' : ''}.`);
    if (s.over) { showGameOver(); return; }
    const again = rep.end >= 0 && CC.armyAt(s, rep.end);
    if (again && again.owner === s.cur && canMove(again) && myTurn()) hint(`This army has ${stepsText(again)}. Click its banner to march again.`);
  }

  function nextArmy() {
    const s = App.st;
    if (!myTurn()) return;
    const idle = s.armies.filter((a) => a.owner === s.cur && canMove(a));
    if (!idle.length) { hint('No army has steps left this turn.'); return; }
    const curId = App.sel && App.sel.kind === 'army' ? App.sel.id : null;
    const k = idle.findIndex((a) => a.id === curId);
    const a = idle[(k + 1) % idle.length];
    select({ kind: 'army', id: a.id });
    ensureVisible(a.tile);
  }

  function ensureVisible(tile) {
    const R = App.R, p = R.center(tile), sc = R.toScreen(p.x, p.y);
    if (sc.x < 60 || sc.y < 60 || sc.x > R.view.w - 60 || sc.y > R.view.h - 60) R.glideTo(tile);
  }

  // ------------------------------------------------------------ map input
  let spaceHeld = false;
  function setupInput() {
    const cv = App.R.cv, R = App.R;
    const ptrs = new Map();
    let drag = null, pinch = null;
    const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    function strokeTo(x, y, first) {
      const fx = first ? x : drag.lx, fy = first ? y : drag.ly;
      const step = Math.max(4, (R.S * R.cam.z) / 3);
      const n = Math.max(1, Math.ceil(Math.hypot(x - fx, y - fy) / step));
      let changed = false;
      for (let k = 0; k <= n; k++) {
        const i = R.pick(fx + ((x - fx) * k) / n, fy + ((y - fy) * k) / n);
        if (i < 0 || i === drag.lastTile) continue;
        drag.lastTile = i;
        if (applyPaint(i, drag.mode, drag)) changed = true;
      }
      if (changed) { refreshPlan(); drawMap(); renderPanelSoon(); }
    }

    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      if (!App.st) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const p = local(e);
      ptrs.set(e.pointerId, p);
      hideTip();
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        drag = null;
        return;
      }
      drag = { id: e.pointerId, x0: p.x, y0: p.y, lx: p.x, ly: p.y, button: e.button, shift: e.shiftKey, touch: e.pointerType === 'touch', mode: null, lastTile: -1 };
      // touch: a long press inspects, like a right-click
      if (drag.touch) { const d = drag; d.lp = setTimeout(() => { if (drag === d && !d.mode) { d.mode = 'inspect'; const i = R.pick(d.x0, d.y0); if (i >= 0) showInspect(i, d.x0, d.y0, R.shipAt(d.x0, d.y0)); } }, 550); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!App.st) return;
      const p = local(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        R.pan(mx - pinch.mx, my - pinch.my); R.zoomAt(mx, my, d / pinch.d);
        pinch = { d, mx, my };
        drawMap();
        return;
      }
      if (!drag) {
        if (e.pointerType === 'mouse') {
          const i = R.pick(p.x, p.y);
          if (i !== App.hover) { App.hover = i; drawMap(); }
          showTip(i, p, R.bannerAt(p.x, p.y), R.shipAt(p.x, p.y));
        }
        return;
      }
      if (drag.id !== e.pointerId) return;
      if (!drag.mode && Math.hypot(p.x - drag.x0, p.y - drag.y0) > (drag.touch ? 10 : 5)) {
        const painting = App.plan && myTurn() && !spaceHeld && (drag.button === 0 || drag.button === 2);
        if (painting) {
          const i0 = R.pick(drag.x0, drag.y0);
          drag.mode = drag.button === 2 || App.plan.region.includes(i0) ? 'remove' : 'add';
          strokeTo(drag.x0, drag.y0, true);
        } else { drag.mode = 'pan'; cv.classList.add('grab'); hideTip(); }
      }
      if (drag.mode === 'pan') { R.pan(p.x - drag.lx, p.y - drag.ly); drawMap(); }
      else if (drag.mode) strokeTo(p.x, p.y, false);
      drag.lx = p.x; drag.ly = p.y;
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
      if (!drag || drag.id !== e.pointerId) return;
      clearTimeout(drag.lp);
      cv.classList.remove('grab');
      tipTile = -2;
      if (!drag.mode && e.type === 'pointerup') clickAt(drag.x0, drag.y0, drag.button, drag.shift || e.shiftKey);
      else if (drag.mode && drag.mode !== 'pan' && drag.mode !== 'inspect') renderAll();
      drag = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!drag && App.hover !== -1) { App.hover = -1; drawMap(); } hideTip(); });
    cv.addEventListener('wheel', (e) => {
      if (!App.st) return;
      e.preventDefault();
      const p = local(e);
      const notched = !e.ctrlKey && e.deltaX === 0 && (e.deltaMode === 1 || (Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY)));
      if (e.ctrlKey || e.metaKey || notched) {
        const k = e.ctrlKey ? 0.012 : 0.0016;
        R.zoomAt(p.x, p.y, Math.exp(-e.deltaY * k * (e.deltaMode === 1 ? 20 : 1)));
      } else R.pan(-e.deltaX, -e.deltaY);
      hideTip();
      drawMap();
    }, { passive: false });

    $('#z-in').addEventListener('click', () => { R.zoomAt(R.view.w / 2, R.view.h / 2, 1.3); drawMap(); });
    $('#z-out').addEventListener('click', () => { R.zoomAt(R.view.w / 2, R.view.h / 2, 1 / 1.3); drawMap(); });
    $('#z-fit').addEventListener('click', () => { R.fit(); drawMap(); });
  }

  function clickAt(x, y, button, shift) {
    const s = App.st, R = App.R;
    const i = R.pick(x, y), bid = R.bannerAt(x, y), sid = R.shipAt(x, y);
    const pl = App.plan;
    hideInspect();
    // right-click inspects whatever is there (and erases a painted tile while planning a march)
    if (button === 2) {
      if (pl && myTurn() && i >= 0 && pl.region.includes(i)) { applyPaint(i, 'remove'); refreshPlan(); renderAll(); return; }
      if (i >= 0) showInspect(i, x, y, sid);
      return;
    }
    // a selected fleet of yours: sail, attack or bombard
    const fl = App.sel && App.sel.kind === 'fleet' ? CC.getFleet(s, App.sel.id) : null;
    if (fl && fl.owner === s.cur && myTurn() && i >= 0) {
      if (sid != null && sid !== fl.id) {
        const other = CC.getFleet(s, sid);
        if (other && other.owner === s.cur) { select({ kind: 'fleet', id: sid }); return; }
      }
      const ram = s.tiles[i].t === 'water' && CC.planFleet(s, fl.id, i, sendN(fl)).valid; // sailing onto soldiers at sea beats a volley
      if (CC.bombardTargets(s, fl.id).includes(i) && !ram) { fireAt(i); return; }
      if ((s.tiles[i].t === 'water' || s.tiles[i].river) && i !== fl.tile) { sail(i); return; }
    }
    // a selected army of yours at sea: sail or land
    const sa = App.sel && App.sel.kind === 'army' ? CC.getArmy(s, App.sel.id) : null;
    if (sa && sa.sea && sa.owner === s.cur && myTurn() && i >= 0 && i !== sa.tile) {
      const other = sid != null ? CC.getFleet(s, sid) : bid != null && bid !== sa.id ? CC.getArmy(s, bid) : null;
      if (other && other.owner === s.cur) { select({ kind: sid != null ? 'fleet' : 'army', id: other.id }); return; }
      const plan = CC.planSail(s, sa.id, i);
      if (plan.valid) { sailTroops(i); return; }
      const c = CC.cityAt(s, i);
      if (!(c && c.owner === s.cur)) { sfx('deny'); hint(plan.errors[0]); return; }
    }
    if (sid != null && !(pl && myTurn() && pl.region.length)) { select({ kind: 'fleet', id: sid }); return; }
    if (pl && myTurn()) {
      const army = CC.getArmy(s, pl.armyId);
      if (shift && i >= 0 && (pl.region.includes(i) || i === army.tile)) { pl.dest = i; refreshPlan(); renderAll(); return; }
      if (!pl.region.length) {
        // nothing painted yet: clicks on other pieces switch what is selected (drag onto them to join them)
        const other = bid != null && bid !== pl.armyId && CC.getArmy(s, bid);
        if (other && other.owner === s.cur) { select({ kind: 'army', id: bid }); return; }
        if (i < 0) return;
        if (i === army.tile) { if (!CC.cityAt(s, i)) select({ kind: 'tile', i }); return; }
        // your own town: march into it when the army can get there, otherwise open it
        const c = CC.cityAt(s, i);
        if (c && c.owner === s.cur && paintBlock(i)) { select({ kind: 'city', id: c.id }); return; }
      }
      if (i >= 0 && i !== army.tile && applyPaint(i, pl.region.includes(i) ? 'remove' : 'add')) { refreshPlan(); renderAll(); }
      return;
    }
    if (i < 0) { select(null); return; }
    // clicking the tile of the army already selected switches to the land view (and back again)
    const selArmy = App.sel && App.sel.kind === 'army' && CC.getArmy(s, App.sel.id);
    if (selArmy && selArmy.tile === i && !CC.cityAt(s, i)) { select({ kind: 'tile', i }); return; }
    if (bid != null) { select({ kind: 'army', id: bid }); return; }
    const c = CC.cityAt(s, i);
    if (c) { select({ kind: 'city', id: c.id }); return; }
    const a = CC.armyAt(s, i);
    if (a) { select({ kind: 'army', id: a.id }); return; }
    select({ kind: 'tile', i });
  }

  // cursors: a banner to plant for marching or claiming, a crossed banner for erasing, a sword where a battle would be fought
  const FLAG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M5 30V4" stroke="#1d1812" stroke-width="3.4" stroke-linecap="round"/><path d="M5 30V4" stroke="#d7a646" stroke-width="1.4" stroke-linecap="round"/><path d="M6 4.5h17l-4.5 5.5 4.5 5.5H6z" fill="#f3e2b3" stroke="#1d1812" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8.5h7" stroke="#a8823a" stroke-width="1.4"/></svg>';
  const FLAG_X = FLAG.replace('</svg>', '<circle cx="22" cy="23" r="6.5" fill="#df6248" stroke="#1d1812" stroke-width="1.4"/><path d="M19 23h6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>');
  const SWORD = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M3 3l3.5 0.5L21 18l-3 3L3.5 6.5z" fill="#e8e4da" stroke="#1d1812" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 5l14.5 14.5" stroke="#9a948a" stroke-width="1"/><path d="M15.5 24.5l9-9" stroke="#1d1812" stroke-width="3.6" stroke-linecap="round"/><path d="M15.5 24.5l9-9" stroke="#d7a646" stroke-width="1.8" stroke-linecap="round"/><path d="M21 21l5 5" stroke="#1d1812" stroke-width="3.4" stroke-linecap="round"/><path d="M21 21l5 5" stroke="#7a5428" stroke-width="1.6" stroke-linecap="round"/><circle cx="27.5" cy="27.5" r="2.3" fill="#d7a646" stroke="#1d1812" stroke-width="1.3"/></svg>';
  const cursorUrl = (svg, x, y, fb) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fb}`;
  const CURSORS = { paint: cursorUrl(FLAG, 5, 30, 'pointer'), erase: cursorUrl(FLAG_X, 5, 30, 'pointer'), attack: cursorUrl(SWORD, 3, 3, 'pointer'), no: 'not-allowed', hand: 'pointer', arrow: 'default' };

  // what a click on tile i (or banner bid) would do right now
  // what a click on tile i (or banner bid) would do right now
  function hoverAction(i, bid, sid) {
    const s = App.st, pl = App.plan;
    if (i < 0) return { cursor: 'arrow' };
    const t = s.tiles[i];
    App.course = null;
    const fl = App.sel && App.sel.kind === 'fleet' ? CC.getFleet(s, App.sel.id) : null;
    if (fl && fl.owner === s.cur && myTurn()) {
      if (CC.bombardTargets(s, fl.id).includes(i) && !(t.t === 'water' && CC.planFleet(s, fl.id, i, sendN(fl)).valid)) { const a = CC.armyAt(s, i); return { cursor: 'attack', line: `Bombard ${CC.sum(a.u)} soldiers: each of your ${fl.n} ship${fl.n === 1 ? '' : 's'} kills one on ${CC.cityAt(s, i) ? RULES.bombardWallHit : RULES.bombardHit}+ with 2d6. They cannot shoot back.`, cls: 'mid' }; }
      if ((t.t === 'water' || t.river) && i !== fl.tile) {
        const plan = CC.planFleet(s, fl.id, i, sendN(fl));
        App.course = plan.path.length ? [fl.tile].concat(plan.path) : null; App.courseOk = plan.valid;
        drawMap();
        if (!plan.valid) return { cursor: 'no', line: plan.errors[0], cls: 'bad' };
        const post = (s._posts || []).find((p) => p.tile === i), mate = CC.fleetAt(s, i);
        if (plan.battle && plan.battle.transport) return { cursor: 'attack', line: `Fall on ${plan.battle.n} soldiers at sea: ${pct(plan.battle.p)} chance to win. Most of them would drown.`, cls: oddsClass(plan.battle.p) };
        if (plan.battle) return { cursor: 'attack', line: `Attack ${plan.battle.n} enemy warship${plan.battle.n === 1 ? '' : 's'}: ${pct(plan.battle.p)} chance to win.`, cls: oddsClass(plan.battle.p) };
        if (mate && mate.owner === s.cur) return { cursor: 'paint', line: `Sail here and join this fleet (${plan.path.length} moves).` };
        return { cursor: 'paint', line: post ? `Sail to ${post.name} (${plan.path.length} moves). A fleet here earns +${post.value} gold a turn while its sea route home is open.` : `Sail here (${plan.path.length} move${plan.path.length === 1 ? '' : 's'}).` };
      }
    }
    const sa = App.sel && App.sel.kind === 'army' ? CC.getArmy(s, App.sel.id) : null;
    if (sa && sa.sea && sa.owner === s.cur && myTurn()) {
      if (i === sa.tile) return { cursor: 'arrow', line: 'Your soldiers are aboard here.' };
      const plan = CC.planSail(s, sa.id, i);
      App.course = plan.path.length ? [sa.tile].concat(plan.path) : null; App.courseOk = plan.valid;
      drawMap();
      if (!plan.valid) return { cursor: 'no', line: plan.errors[0], cls: 'bad' };
      if (plan.land) return { cursor: 'paint', line: `Land here (${plan.path.length} move${plan.path.length === 1 ? '' : 's'})${plan.claims ? ' and claim the tile' : ''}. Landing ends this army's turn.` };
      const danger = s.fleets.some((f) => f.owner !== sa.owner && CC.atWar(s, sa.owner, f.owner) && CC.hexDist(s, f.tile, i) <= RULES.fleetMP + 1);
      return { cursor: 'paint', line: `Sail here (${plan.path.length} move${plan.path.length === 1 ? '' : 's'}).${danger ? ' Enemy warships could reach you here.' : ''}`, cls: danger ? 'mid' : '' };
    }
    if (sid != null && !(pl && pl.region.length)) {
      const f = CC.getFleet(s, sid);
      if (f) return { cursor: 'hand', line: f.owner === s.cur && myTurn() ? `Click to command this fleet (${CC.fleetMovesLeft(f)} moves${f.fired ? '' : ', guns ready'}).` : `${f.n} warship${f.n === 1 ? '' : 's'} of ${CC.nameOf(s, f.owner)}.` };
    }
    if (pl && myTurn()) {
      const army = CC.getArmy(s, pl.armyId);
      if (!army) return { cursor: 'arrow' };
      const other = bid != null && bid !== pl.armyId && CC.getArmy(s, bid);
      if (!pl.region.length && other && other.owner === s.cur) return { cursor: 'hand', line: 'Click to command this army instead, or drag your path onto it to join it.' };
      if (i === army.tile) return { cursor: 'arrow', line: 'Your army stands here. Paint the tiles it should march to.' };
      if (pl.region.includes(i)) {
        if (pl.res && pl.res.bad.has(i)) return { cursor: 'erase', line: `${pl.res.errors.find((e) => /zone|range/.test(e)) || 'This painted tile cannot be reached.'} Click to erase it.`, cls: 'bad' };
        return { cursor: 'erase', line: 'Click or drag to erase this tile.' };
      }
      const why = paintBlock(i);
      if (why) return { cursor: 'no', line: why, cls: 'bad' };
      const df = CC.defenderAt(s, i, s.cur);
      if (df) {
        const u = CC.sum(pl.u) ? pl.u : army.u;
        const o = CC.odds(u, df.u, df.militia, CC.battleCtx(s, i, false));
        return { cursor: 'attack', line: `Battle here: ${pct(o.p)} chance to win against ${CC.sum(df.u) + df.militia} defenders${df.tower ? ' at the outpost' : ''}.`, cls: oddsClass(o.p) };
      }
      const mate = CC.armyAt(s, i);
      if (t.b === 'city' && t.owner === s.cur) return { cursor: 'paint', line: 'Click to march into this town and join its garrison.' };
      if (mate && mate.owner === s.cur && !mate.sea) return { cursor: 'paint', line: `Paint here to march in and join this army (${CC.sum(mate.u)} soldiers).` };
      if (pl.zoc && pl.zoc.has(i)) return { cursor: 'paint', line: 'Enemy zone: your army may claim this tile and turn back, or go on to attack the town or outpost next to it. It cannot cut across or stop here.', cls: 'mid' };
      return { cursor: 'paint', line: t.owner === s.cur ? 'Paint to march through your land (free).' : 'Paint to claim this tile.' };
    }
    if (bid != null) {
      const a = CC.getArmy(s, bid);
      if (!a) return { cursor: 'arrow' };
      if (a.owner === s.cur && myTurn()) return { cursor: 'hand', line: canMove(a) ? `Click to give this army orders (${stepsText(a)}).` : 'This army is done for this turn.' };
      return { cursor: 'hand', line: 'Click for details.' };
    }
    if (t.t === 'colony') return { cursor: 'arrow', line: 'Colonial land: no army can go there. Keep a warship at one of its trading posts to earn its gold.' };
    if (!CC.passable(s, i)) return { cursor: 'arrow', line: (s._posts || []).some((q) => q.tile === i) ? 'Send a warship here to trade.' : '' };
    const c = CC.cityAt(s, i);
    if (c) return { cursor: 'hand', line: c.owner === s.cur && myTurn() ? 'Click to recruit and improve this town.' : 'Click for details.' };
    if (t.owner === s.cur && myTurn()) return { cursor: 'hand', line: t.b ? 'Click for details.' : 'Click to build here.' };
    return { cursor: 'hand', line: 'Click for details.' };
  }

  let tipTile = -2, tipBanner = null;
  function showTip(i, p, bid, sid) {
    const tip = $('#tip'), s = App.st;
    const cv = $('#map');
    if (i < 0 || !s) { hideTip(); cv.style.cursor = CURSORS.arrow; return; }
    if (i !== tipTile || bid !== tipBanner) {
      tipTile = i; tipBanner = bid;
      const act = hoverAction(i, bid, sid);
      cv.style.cursor = CURSORS[act.cursor] || 'default';
      const t = s.tiles[i], T = CC.TERRAIN[t.t], c = CC.cityAt(s, i), a = CC.armyAt(s, i);
      let html = c ? `<b>${esc(c.name)}</b> <span class="muted">· walls ${c.walls}</span><br>` : '';
      html += `<b>${T.name}</b>${t.river ? ' · river' : ''}${t.gold ? ' · gold deposit' : ''}`;
      if (T.passable) html += `<br><span class="muted">${t.owner >= 0 ? esc(CC.nameOf(s, t.owner)) : c ? 'Rebels' : 'Unclaimed'}</span>`;
      if (t.b === 'farm') html += `<br>Farm · +${RULES.farmIncome + (t.river ? RULES.riverFarmBonus : 0)} gold`;
      if (t.b === 'mine') html += `<br>Gold mine · +${RULES.mineIncome} gold`;
      if (t.b === 'tower') html += `<br>Outpost · controls the 6 tiles around it`;
      if (a) html += `<br>${CC.sum(a.u)} soldiers${a.sea ? ' aboard ships' : ''}: ${compText(a.u)}`;
      const f = CC.fleetAt(s, i);
      if (f) html += `<br>${f.n} warship${f.n === 1 ? '' : 's'} of ${esc(CC.nameOf(s, f.owner))}`;
      const post = (s._posts || []).find((q) => q.tile === i);
      if (post) html += `<br><b>${esc(post.name)}</b>${post.colony ? ` (${esc(post.colony)})` : ''}: a trading post worth +${post.value} gold a turn to whoever docks a warship here. The gold sails home along the sea lanes.`;
      else if (s._laneNb && s._laneNb.has(i)) html += '<br><span class="muted">Sea lane: a trade route. An enemy warship here cuts the trade that sails through.</span>';
      if (T.passable && T.def !== 1) html += `<br><span class="muted">Defenders ×${T.def}</span>`;
      if (act.line) html += `<div class="act ${act.cls || ''}">${esc(act.line)}</div>`;
      tip.innerHTML = html;
    }
    tip.hidden = false;
    const wrap = $('#mapwrap').getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(p.x + 16, wrap.width - w - 8) + 'px';
    tip.style.top = (p.y + 18 + h > wrap.height ? p.y - h - 10 : p.y + 18) + 'px';
  }
  function hideTip() { const t = $('#tip'); if (t) t.hidden = true; tipTile = -2; }

  // ------------------------------------------------------------ fleets
  async function sail(dest) {
    const s = App.st, f = CC.getFleet(s, App.sel.id);
    const plan = CC.planFleet(s, f.id, dest, sendN(f));
    if (!plan.valid) { sfx('deny'); hint(plan.errors[0]); return; }
    const color = CC.colorOf(s, f.owner), n = plan.n, from = f.tile;
    const rep = CC.moveFleet(s, f.id, dest, plan.n);
    App.fleetN = null;
    if (rep.error) { sfx('deny'); hint(rep.error); return; }
    App.course = null;
    commit();
    sfx('waves');
    await App.R.animateMarch([from].concat(plan.path.slice(0, rep.battle && (rep.battle.transport || !rep.battle.win) ? -1 : undefined)), color, n, rep.end, 0.8, 'ship');
    if (rep.battle) await showNavalReport(rep);
    const still = CC.getFleet(s, f.id);
    if (still) { App.sel = { kind: 'fleet', id: still.id }; renderAll(); }
    else select(null);
    const post = (s._posts || []).find((p) => p.tile === rep.end);
    if (post && rep.fleet != null) hint(`Your fleet holds ${post.name}: +${post.value} gold a turn while the route home stays open.`);
    else if (rep.split && still) hint(`${n} ship${n === 1 ? '' : 's'} sailed off; ${still.n} stay${still.n === 1 ? 's' : ''} here, still selected.`);
  }

  function boardShips() {
    const s = App.st, pl = App.plan;
    if (!pl) return;
    const r = CC.embark(s, pl.armyId, pl.u);
    if (!r.ok) { sfx('deny'); hint(r.reason); return; }
    sfx('waves');
    App.plan = null;
    commit();
    const t = CC.getArmy(s, r.army);
    App.R.pulse(t.tile, CC.colorOf(s, t.owner));
    select({ kind: 'army', id: t.id });
    hint(`Aboard for ${r.cost} gold. Click the sea to sail, or a gold-outlined shore to land.`);
  }
  // animate transports along the water, then the soldiers stepping ashore
  async function playSail(rep, color, speed) {
    const landed = rep.land ? CC.getArmy(App.st, rep.army) : null;
    const u = landed ? landed.u : (CC.getArmy(App.st, rep.army) || { u: [1] }).u;
    const water = [rep.origin].concat(rep.land ? rep.path.slice(0, -1) : rep.path);
    sfx('waves', { vol: 0.7 });
    await App.R.animateMarch(water, color, u, rep.end, speed, 'transport');
    if (rep.land) { sfx('march', { dur: 0.45 }); await App.R.animateMarch([water[water.length - 1], rep.end], color, u, rep.end, speed); }
  }
  async function sailTroops(dest) {
    const s = App.st, a = CC.getArmy(s, App.sel.id);
    const rep = CC.sailArmy(s, a.id, dest);
    if (rep.error) { sfx('deny'); hint(rep.error); return; }
    App.course = null;
    App.sel = rep.land ? { kind: 'army', id: rep.army } : App.sel;
    commit();
    App.animating = true;
    await playSail(rep, CC.colorOf(s, rep.me), 0.8);
    App.animating = false;
    if (rep.land) { App.R.ov.flash = { tiles: rep.captured.slice(), color: CC.colorOf(s, rep.me), alpha: 0.9 }; drawMap(); setTimeout(() => { App.R.ov.flash = null; drawMap(); }, 450); }
    hint(rep.land ? `Landed${rep.captured.length ? ' and claimed the shore' : ''}. This army marches again next turn.` : `${CC.movesLeft(a)} move${CC.movesLeft(a) === 1 ? '' : 's'} left at sea.`);
    renderAll();
  }

  function fireAt(tile) {
    const s = App.st, f = CC.getFleet(s, App.sel.id);
    const r = CC.bombard(s, f.id, tile);
    if (r.error) { sfx('deny'); hint(r.error); return; }
    sfx('cannon', { n: f.n });
    App.R.pulse(tile, '#f06e46');
    commit();
    hint(`Bombardment: rolls ${r.rolls.join(', ')} (need ${r.need}+). ${r.kills} soldier${r.kills === 1 ? '' : 's'} fell.`);
  }

  function showNavalReport(rep) {
    return new Promise((resolve) => {
      const s = App.st, b = rep.battle;
      const side = (owner, before, after, dice, eff, what) => `<div class="side"><h4>${mark(s, owner)}${esc(CC.nameOf(s, owner))}</h4>
        <div class="row"><span>${what || 'Warships'}</span><span>${before} → ${after}${before - after ? ` <span class="loss">−${before - after}</span>` : ''}</span></div>
        <div class="dice">${dieHtml(dice[0])}${dieHtml(dice[1])}</div><div class="row total reveal"><span>Fighting strength</span><span>${eff.toFixed(1)}</span></div></div>`;
      const m = modal(`<h2>Sea battle</h2><article class="battle"><header><h3>Battle at sea</h3><span class="tag">Odds before battle ${pct(b.odds)}</span></header>
        <div class="sides">${side(rep.me, b.att, b.attAfter, b.ad, b.Ae)}<div class="vs">vs</div>${side(b.defender, b.def, b.defAfter, b.dd, b.De, b.transport ? 'Soldiers aboard' : '')}</div>
        <div class="verdict ${b.win ? 'win' : 'loss'} reveal">${b.transport ? (b.win ? `Your warships fell on the transports: ${b.def - b.defAfter} soldiers drowned${b.defAfter ? '' : ' and none survived'}.` : 'The soldiers fought your ships off.') : b.win ? (b.fate === 'fled' ? 'Your fleet won the sea. The survivors fled to their home harbor.' : 'Your fleet won the sea. The enemy ships went down.') : rep.end < 0 ? 'The enemy fleet held. Your ships went down.' : 'The enemy fleet held. Yours fell back.'}</div></article>
        <div class="modal-actions"><button class="btn primary" type="button" data-close>Continue</button></div>`, { wide: true, onClose: resolve });
      sfx('cannon', { n: 4 });
      animateDice(m).then(() => sfx(b.win ? 'victory' : 'defeat'));
    });
  }

  // ------------------------------------------------------------ right-click inspection
  function showInspect(i, x, y, sid) {
    const s = App.st, t = s.tiles[i], T = CC.TERRAIN[t.t], el = $('#inspect');
    const c = CC.cityAt(s, i), a = CC.armyAt(s, i), f = sid != null ? CC.getFleet(s, sid) : CC.fleetAt(s, i);
    const post = (s._posts || []).find((q) => q.tile === i);
    const who = (o) => (o < 0 ? 'Rebels' : esc(CC.nameOf(s, o)));
    let html = '';
    if (c) {
      const D = CC.powers([1], a ? a.u : CC.Z(), 1 + c.walls, CC.battleCtx(s, i, false)).D;
      const built = ['harbor', 'stables', 'barracks', 'foundry'].filter((k) => c[k]).map((k) => k[0].toUpperCase() + k.slice(1));
      html += `<h3>${mark(s, c.owner)} ${esc(c.name)}</h3><p class="muted">${c.owner < 0 ? 'Rebel town' : who(c.owner) + (c.capital ? ' · capital' : '')}</p>
        <table class="tiptab"><tr><td>Walls</td><td>level ${c.walls} (×${RULES.walls.mult[c.walls]})</td></tr><tr><td>Market</td><td>level ${c.market}</td></tr>
        <tr><td>Buildings</td><td>${built.join(', ') || 'none'}</td></tr><tr><td>Militia</td><td>${1 + c.walls}</td></tr>
        ${c.owner >= 0 ? `<tr><td>Income</td><td>+${(c.capital ? RULES.capitalIncome : RULES.cityIncome) + c.market * RULES.marketIncome}</td></tr>` : ''}
        <tr class="sum"><td>Defense strength</td><td>${D.toFixed(1)}</td></tr></table>`;
    } else html += `<h3>${T.name}${t.river ? ' · river' : ''}</h3><p class="muted">${t.owner >= 0 ? who(t.owner) : T.passable ? 'Unclaimed' : t.t === 'water' ? 'Water' : t.t === 'colony' ? 'Colonial land, reached only by ship' : 'Impassable'}${t.gold ? ' · gold deposit' : ''}${t.b === 'farm' ? ' · farm' : t.b === 'mine' ? ' · gold mine' : t.b === 'tower' ? ' · outpost' : ''}</p>`;
    if (a) {
      html += `<h4>${c ? 'Garrison' : a.sea ? 'Aboard ships: army' : 'Army'} of ${who(a.owner)} · ${CC.sum(a.u)}</h4><table class="tiptab">${UN.map((d, k) => (a.u[k] ? `<tr><td>${d.name}</td><td>${a.u[k]}</td></tr>` : '')).join('')}
        ${a.owner === s.cur ? `<tr><td>${a.sea ? 'Sea moves left' : 'Steps left'}</td><td>${CC.movesLeft(a)}</td></tr>` : ''}</table>`;
    }
    if (f) html += `<h4>Fleet of ${who(f.owner)}</h4><table class="tiptab"><tr><td>Warships</td><td>${f.n}</td></tr>${f.owner === s.cur ? `<tr><td>Moves left</td><td>${CC.fleetMovesLeft(f)}</td></tr><tr><td>Guns</td><td>${f.fired ? 'fired' : 'ready'}</td></tr>` : ''}</table>`;
    if (post) html += `<h4>${esc(post.name)}</h4><p class="muted">A distant market: +${post.value} gold a turn to the house whose warship holds it, while the sea route home stays open.</p>`;
    if (T.passable && !c) html += `<p class="muted">Defenders here ×${T.def}${t.b === 'tower' ? ` · outpost ×${RULES.outpostDef}` : (t.b === 'farm' || t.b === 'mine') ? ` · palisade ×${RULES.structureDef}` : ''}</p>`;
    el.innerHTML = html;
    el.hidden = false;
    const wrap = $('#mapwrap').getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(x + 12, wrap.width - el.offsetWidth - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(y + 12, wrap.height - el.offsetHeight - 8)) + 'px';
    hideTip();
    sfx('click');
  }
  function hideInspect() { const el = $('#inspect'); if (el) el.hidden = true; }

  // ------------------------------------------------------------ side tabs and statistics
  function setSideTab(tab) {
    App.sideTab = tab;
    document.querySelectorAll('#sidetabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('#panel').hidden = tab !== 'turn';
    $('#realmcard').hidden = tab !== 'realm';
    $('#chroncard').hidden = tab !== 'chron';
  }

  function showStats() {
    const s = App.st;
    if (!s) return;
    const cols = [
      ['name', 'House'], ['score', 'Score'], ['cities', 'Towns'], ['tiles', 'Land'], ['farms', 'Farms'], ['mines', 'Mines'], ['gold', 'Gold'], ['income', 'Income'], ['trade', 'Trade'],
      ['soldiers', 'Soldiers'], ['strength', 'Attack'], ['knights', 'Knights'], ['cannons', 'Cannons'], ['ships', 'Warships'], ['won', 'Battles won'],
    ];
    const rows = s.players.map((p) => {
      const m = CC.summary(s, p.id), inc = CC.income(s, p.id);
      return { id: p.id, alive: p.alive, name: p.name, score: m.score, cities: m.cities, tiles: m.tiles, farms: m.farms, mines: m.mines, gold: p.gold, income: inc.net, trade: inc.trade,
        soldiers: m.soldiers, strength: m.strength, knights: m.units[2], cannons: m.units[4], ships: m.ships, won: p.stats.won };
    });
    let sortKey = App.statsSort || 'score', dir = -1;
    const m = modal('<h2>The houses compared</h2><p class="lead">Click a column to sort.</p><div class="table-wrap"><table class="rank stats" id="stats"></table></div><div class="modal-actions"><button class="btn primary" type="button" data-close>Close</button></div>', { wide: true });
    const draw = () => {
      const sorted = rows.slice().sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : a[sortKey] - b[sortKey]) * dir);
      m.querySelector('#stats').innerHTML = `<thead><tr>${cols.map(([k, l]) => `<th><button type="button" data-sort="${k}" aria-sort="${k === sortKey ? (dir < 0 ? 'descending' : 'ascending') : 'none'}">${l}${k === sortKey ? (dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${sorted.map((r) => `<tr class="${r.id === s.cur ? 'cur' : ''} ${r.alive ? '' : 'dead'}">${cols.map(([k]) => `<td>${k === 'name' ? `${mark(s, r.id)} ${esc(r.name)}` : k === 'income' ? signed(r[k]) : r[k]}</td>`).join('')}</tr>`).join('')}</tbody>`;
    };
    m.querySelector('#stats').addEventListener('click', (e) => {
      const th = e.target.closest('th'), b = th && th.querySelector('[data-sort]');
      if (!b) return;
      if (b.dataset.sort === sortKey) dir = -dir; else { sortKey = b.dataset.sort; dir = sortKey === 'name' ? 1 : -1; }
      App.statsSort = sortKey;
      draw();
    });
    draw();
  }

  // ------------------------------------------------------------ modals
  function modal(html, opt) {
    opt = opt || {};
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${opt.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    $('#layer').appendChild(ov);
    let done = false;
    const close = (v) => { if (done) return; done = true; ov.remove(); if (opt.onClose) opt.onClose(v); };
    ov.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) close(c.dataset.close || undefined);
      else if (e.target === ov && opt.dismiss !== false) close();
    });
    ov._close = close;
    ov._dismiss = opt.dismiss !== false;
    setTimeout(() => { const f = ov.querySelector('.primary, [data-close], button'); if (f) f.focus(); }, 30);
    return ov;
  }
  function closeTopModal() { const l = $('#layer').lastElementChild; if (l && l._close && l._dismiss) l._close(); }
  function closeAllModals() { for (const l of [...$('#layer').children]) if (l._close) l._close(); }

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieHtml = (n) => `<span class="die" data-v="${n}" aria-label="${n}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<i class="${PIPS[n].includes(k) ? 'on' : ''}"></i>`).join('')}</span>`;
  function setDie(el, n) { el.querySelectorAll('i').forEach((p, k) => p.classList.toggle('on', PIPS[n].includes(k))); }
  // roll the dice for a moment, then reveal totals and the verdict; resolves when settled
  function animateDice(root) {
    return new Promise((resolve) => {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { resolve(); return; }
      const box = root.querySelector('.modal');
      box.classList.add('rolling');
      const dice = [...root.querySelectorAll('.die')];
      dice.forEach((d) => d.classList.add('rolling'));
      const id = setInterval(() => dice.forEach((d) => setDie(d, 1 + Math.floor(Math.random() * 6))), 70);
      setTimeout(() => {
        clearInterval(id);
        dice.forEach((d) => { d.classList.remove('rolling'); setDie(d, +d.dataset.v); });
        box.classList.remove('rolling');
        resolve();
      }, 1150);
    });
  }

  function battleCard(b) {
    const s = App.st;
    const title = b.cityName ? `Siege of ${b.cityName}` : `Battle of ${b.place}`;
    const side = (role, owner, before, after, militia, base, mods, dice, L, eff, kMult) => {
      const rows = UN.map((d, k) => (before[k] ? `<div class="row"><span>${d.name}</span><span>${before[k]} → ${after[k]}${before[k] - after[k] ? ` <span class="loss">−${before[k] - after[k]}</span>` : ''}</span></div>` : '')).join('');
      return `<div class="side"><h4>${mark(s, owner)}${esc(CC.nameOf(s, owner))}</h4>
        <div class="row"><span>${role}</span><span></span></div>${rows}
        ${militia ? `<div class="row"><span>Town militia</span><span>${militia}</span></div>` : ''}
        <div class="row"><span>Base strength</span><span>${base.toFixed(1)}</span></div>
        ${kMult != null && before[2] && kMult < 0.999 ? `<div class="row"><span>Knights' charge</span><span>×${kMult.toFixed(2)}</span></div>` : ''}
        ${kMult != null && before[3] && b.pw.swordMult > 1.001 ? `<div class="row"><span>Swords vs spears</span><span>×${b.pw.swordMult.toFixed(2)}</span></div>` : ''}
        ${kMult != null && before[4] && b.pw.cannonMult > 1 ? `<div class="row"><span>Cannons vs walls</span><span>×${b.pw.cannonMult}</span></div>` : ''}
        ${mods.map((m) => `<div class="row"><span>${esc(m.label)}</span><span>×${m.mult}</span></div>`).join('')}
        <div class="dice">${dieHtml(dice[0])}${dieHtml(dice[1])}</div>
        <div class="row"><span>Luck (${dice[0] + dice[1]})</span><span>×${L.toFixed(2)}</span></div>
        <div class="row total reveal"><span>Fighting strength</span><span>${eff.toFixed(1)}</span></div></div>`;
    };
    let verdict;
    if (b.attackerWins) {
      const fled = b.routedTo >= 0 && b.routedTo != null ? `The survivors fled to ${esc(s.cities[b.routedTo].name)}.` : CC.sum(b.defAfter) ? 'The few survivors scattered.' : 'The defenders were wiped out.';
      verdict = `<div class="verdict win reveal">${esc(CC.nameOf(s, b.attacker))} won. ${fled} The fighting cost ${b.fatigue} step${b.fatigue === 1 ? '' : 's'} of marching.</div>`;
    } else verdict = `<div class="verdict loss reveal">${esc(CC.nameOf(s, b.defender))} held the line. The attackers fell back.</div>`;
    return `<article class="battle"><header><h3>${esc(title)}</h3><span class="tag">Odds before battle ${pct(b.odds)}</span></header>
      <div class="sides">${side('Attacker', b.attacker, b.att, b.attAfter, 0, b.pw.aBase, b.pw.aMods, b.ad, b.La, b.Ae, b.pw.kMult)}<div class="vs">vs</div>
      ${side('Defender', b.defender, b.def, b.defAfter, b.militia, b.pw.dBase, b.pw.dMods, b.dd, b.Ld, b.De, null)}</div>${verdict}</article>`;
  }

  function showBattleReport(rep) {
    return new Promise((resolve) => {
      const s = App.st;
      const n = rep.captured.length;
      const towns = rep.cities.map((id) => esc(s.cities[id].name)).join(', ');
      const foot = `${n ? `Seized ${n} tile${n > 1 ? 's' : ''}${towns ? `, including ${towns}` : ''}.` : 'No land was taken.'} ${rep.halted ? 'Survivors marched back to where they started.' : ''}`;
      const m = modal(`<h2>${rep.battles.length > 1 ? 'Campaign report' : 'Battle report'}</h2>${rep.battles.map(battleCard).join('')}
        <p class="lead reveal">${foot}</p><div class="modal-actions"><button class="btn primary" type="button" data-close>Continue</button></div>`, { wide: true, onClose: resolve });
      sfx('battle', { dur: 1.7 });
      animateDice(m).then(() => sfx(rep.halted ? 'defeat' : rep.cities.length ? 'capture' : 'victory'));
    });
  }

  function eventsFor(p) {
    const s = App.st, P = s.players[p];
    return s.log.filter((e) => e.n >= (P.seen || 0) && e.p !== p && (e.who.includes(p) || e.kind === 'elim' || e.kind === 'city'));
  }

  function showHandoff() {
    return new Promise((resolve) => {
      const s = App.st, p = s.players[s.cur];
      const lines = eventsFor(s.cur).slice(-8).map((e) => `<li>${esc(e.text)}</li>`).join('');
      modal(`<div class="pane-head">${swatch(CC.colorOf(s, s.cur), 'width:30px;height:30px;border-radius:999px')}<h2>${esc(p.name)}, your turn</h2></div>
        <p class="lead">Round ${s.round}${s.maxRounds ? ' of ' + s.maxRounds : ''}. You have ${p.gold} gold (${signed(p.lastIncome)} this turn) and ${p.orders} marching orders.</p>
        ${lines ? `<h3>Since your last turn</h3><ul class="summary-list">${lines}</ul>` : ''}
        <div class="modal-actions"><button class="btn primary" type="button" data-close>Begin turn</button></div>`, { onClose: resolve, dismiss: false });
    });
  }

  function showGameOver() {
    const s = App.st, o = s.over;
    if (!o) return;
    closeAllModals();
    sfx('fanfare');
    const w = s.players[o.winner];
    const rows = o.ranking.map((r, k) => {
      const p = s.players[r.id];
      return `<tr><td>${k + 1}</td><td>${mark(s, r.id)} ${esc(p.name)}${p.alive ? '' : ' <span class="tag">fallen</span>'}</td><td><b>${r.score}</b></td><td>${r.cities}</td><td>${r.tiles}</td><td>${r.farms}</td><td>${r.mines}</td><td>${p.stats.won}</td></tr>`;
    }).join('');
    modal(`<h2>${esc(w.name)} ${o.reason === 'conquest' ? 'conquers the realm' : 'holds the greatest realm'}</h2>
      <p class="lead">${o.reason === 'conquest' ? 'Every rival house has fallen.' : `The chronicle closes after round ${o.round}.`} Score: 1 per land tile, ${RULES.score.farm} per farm, ${RULES.score.mine} per mine, ${RULES.score.city} per town.</p>
      <div class="table-wrap"><table class="rank"><thead><tr><th>#</th><th>House</th><th>Score</th><th>Towns</th><th>Land</th><th>Farms</th><th>Mines</th><th>Battles won</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="modal-actions"><button class="btn" type="button" data-close>View the map</button><button class="btn primary" type="button" data-close="new">New game</button></div>`,
    { wide: true, onClose: (v) => { if (v === 'new') { if (App.online) App.online.leave(); showSetup(); } } });
  }

  function showRules() {
    modal(`<h2>How to play</h2><p class="lead">Grow from one castle into a realm. The game ends after the last round, or when a single house remains.</p>
      <div class="rules">
        <section><h3>Your turn</h3><ul><li>Collect gold from <b>towns, farms and mines</b>, minus army upkeep.</li><li>Recruit and build in any order.</li><li>Give each army one march. Press <b>End turn</b> when done.</li></ul></section>
        <section><h3>Marching and conquest</h3><ul><li>Click a banner, choose who marches, then <b>paint tiles</b> on the map. Any shape works. Paint onto another of your armies (or your town) to join it there.</li><li>Recruits and warships take a turn to train: paid now, they appear in their town at the start of your next turn, ready to move. Until then you can cancel them in the town's panel for a full refund.</li><li>A force seizes up to <b>1 + soldiers/2</b> tiles (knights count double, max ${RULES.capMax}).</li><li>Each army has ${RULES.baseMP} steps a turn (knights alone ${RULES.cavalryMP}) and may split them over several marches. Forest, hills and rivers cost 2 outside your land; your own roads always cost 1. The land it may seize is a budget for the whole turn too.</li><li><b>Zones of control:</b> every town, castle and outpost not yours controls the 6 tiles around it (armies hold only their own tile). An army that steps onto one of those tiles may only attack the town or outpost, or turn back the way it came: it cannot cut across or end its march there. Painting the enemy is how you attack. Your own land is never controlled.</li><li>Winning a battle costs extra steps: 1 for a rout, up to 4 for an even fight, so a big army crushing a small one can keep marching. Losing a battle ends the army's moves for the turn.</li><li>Large armies are a little slower: −1 step from 16 soldiers, −2 from 31.</li><li>Each march into land you don't hold uses a <b>marching order</b>: 2 + 1 per town, max ${RULES.ordersMax}.</li></ul></section>
        <section><h3>Battles</h3><ul><li>Enemies standing in your painted land fight you, nearest first.</li><li>Strength = soldiers × unit power × terrain, walls and river modifiers × luck.</li><li>Luck is 2d6 for each side: 2 gives ×0.70, 7 gives ×1.00, 12 gives ×1.30.</li><li>The loser loses at least half its troops and flees. The winner's losses shrink as the gap widens.</li></ul></section>
        <section><h3>Units</h3><ul>${UN.map((d) => `<li><b>${d.name}</b> ${d.cost}g · att ${d.att} · def ${d.def}. ${esc(d.desc)}</li>`).join('')}<li>Upkeep each turn: ${UN.map((d) => `${d.name.toLowerCase()} ${d.upkeep}`).join(', ')}.</li></ul></section>
        <section><h3>Sea and trade</h3><ul><li>A town with a <b>Harbor</b> launches <b>warships</b> (${RULES.shipCost}g, ${RULES.shipUpkeep} a turn). Click a fleet, then a sea tile to sail up to ${RULES.fleetMP} tiles, faster than anything on land; fleets of up to ${RULES.riverShips} ships can also sail up rivers. Choose how many ships sail in the fleet's panel to split it; sail onto your own ships to join them again. Sail onto an enemy fleet to fight, or onto enemy soldiers at sea to sink them.</li><li>Once a turn a fleet can <b>bombard</b> an enemy army on the shore next to it: each ship kills a soldier on ${RULES.bombardHit}+ with 2d6 (${RULES.bombardWallHit}+ behind walls), and they cannot shoot back.</li><li><b>Trading posts</b> sit far out at sea (on the Known World, one off each colonial land). Keep a warship on one to earn its gold every turn. The faint dotted <b>sea lanes</b> are the trade routes: the gold sails home along them, then to your nearest harbor, and the route lights up in your colour.</li><li>An enemy warship anywhere on a route cuts the whole income, as does an enemy army on a caravan road. Peace partners never block.</li><li><b>Trade agreements</b> (in Deal, needs peace) pay both houses every turn along a caravan or sea route between your towns. Every market level you own adds +${RULES.marketTrade} gold to each of your agreements (up to +${RULES.marketTradeMax} each).</li></ul></section>
        <section><h3>Land and economy</h3><ul><li>One <b>farm</b> per ${RULES.tilesPerFarm} tiles you hold, on plains or rivers: +${RULES.farmIncome} gold (+${RULES.riverFarmBonus} by a river).</li><li><b>Mines</b> on gold deposits: +${RULES.mineIncome} gold.</li><li>Captured farms and mines change hands. Post soldiers on them to defend them (×${RULES.structureDef} palisade).</li></ul></section>
        <section><h3>Towns, walls and ships</h3><ul><li>Towns give gold, recruits and orders. Your capital gives ${RULES.capitalIncome}, other towns ${RULES.cityIncome}.</li><li><b>Walls</b> multiply defense up to ×${RULES.walls.mult[3]}. A captured town loses one wall level.</li><li>In a town with a <b>harbor</b>, armies can <b>board ships</b> (${RULES.embarkBase}g + ${RULES.embarkPer}g a soldier). Afloat they sail ${RULES.transportMP} tiles a turn and land on any open shore, which ends their turn. They cannot fight at sea: warships that catch them drown most of them.</li><li>Found new <b>castles</b> for ${RULES.castleCost} gold on your land, ${RULES.castleMinDist}+ tiles from any town.</li><li><b>Outposts</b> (${RULES.outpostCost} gold, ${RULES.outpostUpkeep} a turn) control the 6 tiles around them. ${RULES.outpostMilitia} militia defend them, soldiers posted there fight ×${RULES.outpostDef}, and a captured outpost is burned.</li><li>A house that loses every town is out.</li></ul></section>
        <section><h3>Diplomacy</h3><ul><li>Press <b>Deal</b> next to a house in the Realm list to offer gold now, gold every turn for ${RULES.tributeTurns} turns (tribute), and peace.</li><li><b>Peace</b> lasts ${RULES.peaceRounds} rounds and cannot be broken: neither side may march into the other's land, and their zones stop hindering each other.</li><li>Computer houses answer at once; people answer at the start of their turn. Unanswered offers lapse after a round.</li></ul></section>
        <section><h3>Controls</h3><ul><li>Drag: paint, or pan when nothing is selected. Right-drag erases. Shift-click sets where the army stops. Right-click inspects.</li><li>With an army selected, clicking another of your armies selects that one instead; to join them, paint the path onto it.</li><li>Touch screens: long-press to inspect.</li><li>Scroll or two fingers to pan. Pinch, ctrl+scroll or the +/− buttons to zoom.</li><li><b>N</b> next army · <b>Enter</b> march · <b>Esc</b> clear · <b>E</b> end turn</li></ul></section>
      </div><div class="modal-actions"><button class="btn primary" type="button" data-close>Back to the map</button></div>`, { wide: true });
  }

  function showMenu() {
    const s = App.st;
    const speeds = [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']];
    const m = modal(`<h2>Menu</h2>
      <div class="field" style="margin-top:14px"><label>Computer turn speed</label><div class="seg" id="speed-seg">${speeds.map(([k, l]) => `<button type="button" data-speed="${k}" aria-pressed="${App.prefs.aiSpeed === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><label for="vol">Sound volume</label><input type="range" id="vol" min="0" max="1" step="0.05" value="${Sfx.vol}"></div>
      ${App.online ? App.online.menuExtra() : '<p class="lead">This game saves itself in this browser after every action.</p>'}
      <div class="modal-actions"><button class="btn" type="button" data-close="tutorial">Tutorial</button><button class="btn" type="button" data-close="rules">Rules</button><button class="btn" type="button" data-close="new">${s ? 'New game' : 'Set up a game'}</button><button class="btn primary" type="button" data-close>Close</button></div>`,
    { onClose: (v) => { if (v === 'rules') showRules(); else if (v === 'tutorial') { if (App.online) App.online.leave(); startTutorial(); } else if (v === 'new') { if (App.online) App.online.leave(); showSetup(); } } });
    m.querySelector('#speed-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]');
      if (!b) return;
      App.prefs.aiSpeed = b.dataset.speed;
      store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { aiSpeed: App.prefs.aiSpeed }));
      m.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    m.querySelector('#vol').addEventListener('input', (e) => {
      Sfx.setVolume(+e.target.value);
      if (!Sfx.on) { Sfx.setOn(true); renderSoundBtn(); }
      store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { volume: +e.target.value, sound: true }));
    });
    m.querySelector('#vol').addEventListener('change', () => sfx('coins', { n: 2 }));
    if (App.online) App.online.bindMenu(m);
  }

  // ------------------------------------------------------------ diplomacy
  function showDiplomacy(q) {
    const s = App.st, me = s.cur, P = s.players[me], Q = s.players[q];
    const until = CC.peaceUntil(s, me, q);
    const rel = CC.relations(s, me).find((r) => r.id === q);
    const status = until ? `At peace until the end of round ${until}.` : 'At war: either side may attack the other.';
    const tribs = [...rel.gets.map((t) => `They pay you ${t.amount} gold a turn (${t.left} more).`), ...rel.pays.map((t) => `You pay them ${t.amount} gold a turn (${t.left} more).`)].join(' ');
    const m = modal(`<div class="pane-head">${swatch(CC.colorOf(s, q), 'width:24px;height:24px;border-radius:999px')}<h2>Deal with ${esc(Q.name)}</h2></div>
      <p class="lead">${status} ${tribs} They hold ${Q.gold} gold, you hold ${P.gold}.</p>
      <div class="dip-grid">
        <fieldset><legend>You give</legend>
          <div class="field"><label for="dip-gg">Gold now</label><input id="dip-gg" type="number" min="0" max="${P.gold}" step="5" value="0"></div>
          <div class="field"><label for="dip-gp">Gold each turn, for ${RULES.tributeTurns} turns</label><input id="dip-gp" type="number" min="0" max="${RULES.tributeMax}" value="0"></div>
        </fieldset>
        <fieldset><legend>You ask for</legend>
          <div class="field"><label for="dip-ag">Gold now</label><input id="dip-ag" type="number" min="0" step="5" value="0"></div>
          <div class="field"><label for="dip-ap">Gold each turn, for ${RULES.tributeTurns} turns</label><input id="dip-ap" type="number" min="0" max="${RULES.tributeMax}" value="0"></div>
        </fieldset>
      </div>
      <label class="check"><input id="dip-trade" type="checkbox" ${CC.hasTrade(s, me, q) ? 'disabled' : ''}> ${CC.hasTrade(s, me, q) ? 'You already trade with them.' : 'Trade agreement: both houses earn gold every turn along a caravan or sea route between your towns, while at peace. An enemy army or ship on the route blocks it.'}</label>
      <label class="check"><input id="dip-peace" type="checkbox" ${until ? '' : 'checked'}> ${until ? 'Extend the peace' : 'Make peace'} for ${RULES.peaceRounds} rounds: neither side may march into the other's land, and their zones stop hindering you.</label>
      <p class="estimate" id="dip-note">${Q.ai ? 'Computer houses answer at once.' : `${esc(Q.name)} will answer at the start of their turn.`} An unanswered offer lapses after a round.</p>
      <div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" id="dip-send">Send offer</button></div>`);
    m.querySelector('#dip-send').addEventListener('click', () => {
      const v = (id) => +m.querySelector(id).value || 0;
      const raw = { from: me, to: q, giveGold: v('#dip-gg'), givePer: v('#dip-gp'), getGold: v('#dip-ag'), getPer: v('#dip-ap'), peace: m.querySelector('#dip-peace').checked, trade: m.querySelector('#dip-trade').checked };
      const r = CC.proposeOffer(s, raw);
      const note = m.querySelector('#dip-note');
      if (!r.ok) { sfx('deny'); note.innerHTML = `<span class="err">${esc(r.reason)}</span>`; return; }
      if (Q.ai) {
        const ans = CC.ai.respond(s, r.offer.id);
        m._close();
        commit();
        if (ans && ans.accepted) { sfx(r.offer.peace ? 'bell' : 'coins', { n: 4 }); hint(`${Q.name} accepted: ${CC.describeOffer(s, r.offer)}.`); }
        else { sfx('deny'); hint(`${Q.name} turned your offer down.`); }
      } else {
        m._close(); sfx('click'); commit();
        hint(`Offer sent. ${Q.name} will answer at the start of their turn.`);
      }
    });
  }

  // offers waiting for the current player, one window each
  async function reviewOffers() {
    const s = App.st;
    for (const o of s.dip.offers.filter((x) => x.to === s.cur)) {
      const choice = await new Promise((resolve) => {
        modal(`<div class="pane-head">${swatch(CC.colorOf(s, o.from), 'width:24px;height:24px;border-radius:999px')}<h2>${esc(s.players[o.from].name)} proposes a deal</h2></div>
          <p class="lead">${esc(CC.describeOffer(s, o))}.</p>
          <p class="estimate">You hold ${s.players[s.cur].gold} gold, they hold ${s.players[o.from].gold}. ${o.peace ? `Peace would last until the end of round ${s.round + RULES.peaceRounds}; neither side could march into the other's land.` : ''}</p>
          <div class="modal-actions"><button class="btn" type="button" data-close="no">Decline</button><button class="btn primary" type="button" data-close="yes">Accept</button></div>`,
        { onClose: (v) => resolve(v), dismiss: false });
      });
      const r = CC.answerOffer(s, o.id, choice === 'yes');
      if (choice === 'yes') { if (r.ok) sfx(o.peace ? 'bell' : 'coins', { n: 4 }); else { sfx('deny'); hint(r.reason); } }
      commit();
    }
  }


  // ------------------------------------------------------------ flag editor
  // Paint a FLAG_W x FLAG_H banner. Resolves with the design, null to go back to a plain colour, or undefined on cancel.
  const INK_NAMES = ['House colour', 'Black', 'Parchment', 'Gold', 'Red', 'Blue', 'Green', 'Purple'];
  const FLAG_PATTERNS = {
    Plain: () => 0,
    Cross: (x, y) => (x === 7 || x === 8 || y === 4 || y === 5 ? 1 : 0),
    Nordic: (x, y) => (x === 4 || x === 5 || y === 4 || y === 5 ? 1 : 0),
    Saltire: (x, y) => (Math.abs(x * 10 / 16 - y) < 1.1 || Math.abs((15 - x) * 10 / 16 - y) < 1.1 ? 1 : 0),
    Quarters: (x, y) => ((x < 8) === (y < 5) ? 1 : 0),
    Stripes: (x, y) => (Math.floor(y / 2) % 2 ? 1 : 0),
    Pale: (x) => (x >= 5 && x <= 10 ? 1 : 0),
    Chevron: (x, y) => (y >= 9 - Math.abs(x - 7.5) * 0.9 ? 1 : 0),
    Border: (x, y) => (x === 0 || y === 0 || x === 15 || y === 9 ? 1 : 0),
  };
  function editFlag(initial, hex) {
    return new Promise((resolve) => {
      const W = CC.FLAG_W, H = CC.FLAG_H, pal = CC.flagPalette(hex);
      const cells = (CC.validFlag(initial) ? initial : '0'.repeat(W * H)).split('').map(Number);
      let ink = 3, tool = 'brush', result;
      const m = modal(`<h2>Draw your flag</h2><p class="lead">Paint it cell by cell. It flies over your towns and on every army's banner.</p>
        <div class="flag-ed"><canvas id="fe-cv" width="${W * 22}" height="${H * 22}" aria-label="Flag drawing area"></canvas>
          <div class="fe-side">
            <div class="fe-inks">${pal.map((c, k) => `<button type="button" class="fe-ink" data-ink="${k}" style="background:${c}" aria-label="${INK_NAMES[k]}" ${tip(INK_NAMES[k])}></button>`).join('')}</div>
            <div class="seg fe-tools"><button type="button" data-tool="brush" aria-pressed="true">Brush</button><button type="button" data-tool="fill" aria-pressed="false">Fill</button></div>
            <p class="sub small">Start from a pattern (in the colour you picked):</p>
            <div class="fe-pats">${Object.keys(FLAG_PATTERNS).map((k) => `<button type="button" class="btn small" data-pat="${k}">${k}</button>`).join('')}</div>
          </div></div>
        <div class="modal-actions"><button class="btn ghost" type="button" data-close="plain">No flag, just my colour</button><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-close="use">Use this flag</button></div>`,
      { wide: true, onClose: (v) => resolve(v === 'use' ? (cells.some((c) => c) ? cells.join('') : null) : v === 'plain' ? null : undefined) });
      const cv = m.querySelector('#fe-cv'), g = cv.getContext('2d');
      const paint = () => {
        const cw = cv.width / W, ch = cv.height / H;
        cells.forEach((c, k) => { g.fillStyle = pal[c]; g.fillRect((k % W) * cw, ((k / W) | 0) * ch, cw, ch); });
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
        g.beginPath();
        for (let x = 1; x < W; x++) { g.moveTo(x * cw + 0.5, 0); g.lineTo(x * cw + 0.5, cv.height); }
        for (let y = 1; y < H; y++) { g.moveTo(0, y * ch + 0.5); g.lineTo(cv.width, y * ch + 0.5); }
        g.stroke();
      };
      const markInk = () => m.querySelectorAll('.fe-ink').forEach((b) => b.classList.toggle('on', +b.dataset.ink === ink));
      const cellAt = (e) => { const r = cv.getBoundingClientRect(); const x = Math.floor(((e.clientX - r.left) / r.width) * W), y = Math.floor(((e.clientY - r.top) / r.height) * H); return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1; };
      const fill = (k) => {
        const from = cells[k]; if (from === ink) return;
        const q = [k]; cells[k] = ink;
        while (q.length) {
          const i = q.pop(), x = i % W, y = (i / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (nx >= 0 && ny >= 0 && nx < W && ny < H && cells[j] === from) { cells[j] = ink; q.push(j); } }
        }
      };
      let down = false;
      cv.addEventListener('pointerdown', (e) => { const k = cellAt(e); if (k < 0) return; down = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } if (tool === 'fill') fill(k); else cells[k] = ink; paint(); sfx('paint'); });
      cv.addEventListener('pointermove', (e) => { if (!down || tool !== 'brush') return; const k = cellAt(e); if (k >= 0 && cells[k] !== ink) { cells[k] = ink; paint(); } });
      const up = () => { down = false; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ink], [data-tool], [data-pat]');
        if (!b) return;
        if (b.dataset.ink != null) { ink = +b.dataset.ink; markInk(); }
        else if (b.dataset.tool) { tool = b.dataset.tool; m.querySelectorAll('[data-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
        else { const f = FLAG_PATTERNS[b.dataset.pat], a = ink || 2; cells.forEach((_, k) => { cells[k] = f(k % W, (k / W) | 0) ? a : 0; }); paint(); }
      });
      markInk(); paint();
    });
  }

  // ------------------------------------------------------------ setup screen
  function defaultSeats() {
    return [0, 1, 2, 3].map((i) => ({ name: CC.HOUSE_NAMES[i], color: i, ai: i !== 0 }));
  }

  function showSetup() {
    closeAllModals();
    App.token++; App.busy = false; stopTimer();
    const prefs = load(PREF_KEY) || {};
    const cfg = {
      seats: Array.isArray(prefs.seats) && prefs.seats.length >= 2 ? prefs.seats.slice(0, 8) : defaultSeats(),
      size: prefs.size || 'normal', map: prefs.map || 'realm', rounds: prefs.rounds != null ? prefs.rounds : 15, timer: prefs.timer || 0, seed: '',
    };
    const saved = load(SAVE_KEY);
    const firstVisit = !saved && !(prefs && prefs.tutStep != null);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="setup" role="dialog" aria-modal="true" aria-labelledby="setup-title"></div>';
    $('#layer').appendChild(ov);
    ov._close = () => ov.remove();
    ov._dismiss = !!App.st;
    ov.addEventListener('click', (e) => { if (e.target === ov && App.st) ov.remove(); });
    const box = ov.firstElementChild;

    function estimate() {
      const humans = cfg.seats.filter((x) => !x.ai).length, cpus = cfg.seats.length - humans;
      if (!cfg.rounds) return 'No round limit: play until one house remains.';
      const mins = Math.round(cfg.rounds * (humans * 0.85 + cpus * 0.1));
      return `About ${Math.max(5, Math.round(mins / 5) * 5)} minutes for ${humans} human${humans === 1 ? '' : 's'} at a brisk pace.`;
    }
    function draw() {
      const savedInfo = saved && saved.save ? `Round ${saved.save.round}, ${saved.save.players.length} houses` : '';
      box.innerHTML = `
        <div class="setup-hero">
          <svg width="64" height="72" viewBox="0 0 30 34" aria-hidden="true"><path d="M3 2h24v14c0 8-6 13-12 16C9 29 3 24 3 16z" fill="#d7a646" stroke="#2a1e08" stroke-width="1.2"/><path d="M15 6v22M7 12h16" stroke="#2a1e08" stroke-width="2"/></svg>
          <div><h1 id="setup-title">Kurultay</h1><p>Paint the borders you want, then fight for them. Turn-based conquest for 2 to 8 rulers around one screen, against the computer, or online.</p></div>
        </div>
        <div class="setup-grid">
          <section>
            <h3>Houses</h3>
            <div id="seats">${cfg.seats.map((x, i) => `<div class="seat">
                <button type="button" class="colorbtn" data-act="color" data-i="${i}" style="background:${CC.COLORS[x.color].hex}" aria-label="Change colour, now ${CC.COLORS[x.color].name}"></button>
                <button type="button" class="flagbtn" data-act="flag" data-i="${i}" aria-label="Draw the flag of house ${i + 1}" ${tip(x.flag ? 'Redraw this flag' : 'Draw a flag for this house')}>${CC.validFlag(x.flag) ? flagTag(x.flag, CC.COLORS[x.color].hex, 'big') : '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 18V2" stroke="currentColor" stroke-width="1.8"/><path d="M5 3h11l-3 3.5 3 3.5H5z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'}</button>
                <input type="text" id="seat-name-${i}" value="${esc(x.name)}" maxlength="24" data-i="${i}" aria-label="Name of house ${i + 1}">
                <div class="seg"><button type="button" data-act="human" data-i="${i}" aria-pressed="${!x.ai}">Human</button><button type="button" data-act="cpu" data-i="${i}" aria-pressed="${x.ai}">CPU</button></div>
                <button type="button" class="btn small ghost seat-x" data-act="remove" data-i="${i}" ${cfg.seats.length <= 2 ? 'disabled' : ''} aria-label="Remove house ${i + 1}">✕</button>
              </div>`).join('')}</div>
            <button type="button" class="btn small" data-act="add" ${cfg.seats.length >= 8 ? 'disabled' : ''}>Add a house</button>
          </section>
          <section>
            <h3>The realm</h3>
            <div class="field"><label for="opt-map">Map</label><select id="opt-map">${[['realm', 'Random realm: a new land every game'], ['world', 'Known World: Europe and the Mediterranean']].map(([k, l]) => `<option value="${k}" ${cfg.map === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="opt-size">Map size</label><select id="opt-size">${[['small', 'Small: close quarters'], ['normal', 'Normal'], ['large', 'Large: room to grow']].map(([k, l]) => `<option value="${k}" ${cfg.size === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="opt-rounds">Length</label><select id="opt-rounds">${[[10, '10 rounds'], [15, '15 rounds'], [20, '20 rounds'], [30, '30 rounds'], [0, 'Until one house remains']].map(([k, l]) => `<option value="${k}" ${cfg.rounds === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="opt-timer">Turn timer</label><select id="opt-timer">${[[0, 'Off'], [60, '60 seconds'], [90, '90 seconds'], [120, '2 minutes'], [180, '3 minutes']].map(([k, l]) => `<option value="${k}" ${cfg.timer === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="opt-seed">Map seed (optional)</label><input id="opt-seed" inputmode="numeric" placeholder="Random" value="${esc(cfg.seed)}"></div>
          </section>
        </div>
        <div class="setup-foot"><span class="estimate">${estimate()}</span>
          <button type="button" class="btn ${firstVisit ? 'primary' : ''}" data-act="tutorial">Learn to play · 5 min</button>
          ${savedInfo ? `<button type="button" class="btn" data-act="continue">Continue saved game · ${savedInfo}</button>` : ''}
          <button type="button" class="btn ${firstVisit ? '' : 'primary'}" data-act="start">Start game</button></div>
        <div class="online-box" id="online-box"></div>`;
      if (App.online && App.online.renderSetup) App.online.renderSetup($('#online-box', box), cfg, startConfig);
      else if (CC.Net && CC.Net.renderSetup) CC.Net.renderSetup($('#online-box', box), cfg, startConfig);
    }
    function startConfig() {
      const seedTxt = String(cfg.seed || '').trim();
      return { players: cfg.seats.map((x) => ({ name: x.name.trim() || 'Nameless house', color: x.color, ai: x.ai, flag: CC.validFlag(x.flag) ? x.flag : null })), size: cfg.size, map: cfg.map, rounds: cfg.rounds, timer: cfg.timer, seed: seedTxt ? (parseInt(seedTxt, 10) >>> 0) || hashStr(seedTxt) : undefined };
    }
    function savePrefs() { store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { seats: cfg.seats, size: cfg.size, map: cfg.map, rounds: cfg.rounds, timer: cfg.timer })); }
    box.addEventListener('input', (e) => {
      if (e.target.dataset.i != null && e.target.type === 'text') { cfg.seats[+e.target.dataset.i].name = e.target.value; savePrefs(); }
      if (e.target.id === 'opt-seed') cfg.seed = e.target.value;
    });
    box.addEventListener('change', (e) => {
      if (e.target.id === 'opt-size') cfg.size = e.target.value;
      if (e.target.id === 'opt-map') cfg.map = e.target.value;
      if (e.target.id === 'opt-rounds') cfg.rounds = +e.target.value;
      if (e.target.id === 'opt-timer') cfg.timer = +e.target.value;
      savePrefs();
      const est = $('.estimate', box); if (est) est.textContent = estimate();
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const i = +b.dataset.i, act = b.dataset.act;
      if (act === 'color') {
        const used = new Set(cfg.seats.map((x) => x.color));
        let c = cfg.seats[i].color;
        for (let k = 0; k < 8; k++) { c = (c + 1) % 8; if (!used.has(c)) break; }
        cfg.seats[i].color = c;
      } else if (act === 'flag') {
        editFlag(cfg.seats[i].flag, CC.COLORS[cfg.seats[i].color].hex).then((f) => {
          if (f === undefined) return;
          cfg.seats[i].flag = f;
          // remember the last flag a person drew, for seats taken in online games
          if (!cfg.seats[i].ai) store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { onlineFlag: f }));
          savePrefs(); draw();
        });
        return;
      } else if (act === 'human') cfg.seats[i].ai = false;
      else if (act === 'cpu') cfg.seats[i].ai = true;
      else if (act === 'remove') cfg.seats.splice(i, 1);
      else if (act === 'add') {
        const used = new Set(cfg.seats.map((x) => x.color));
        const color = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !used.has(c));
        const name = CC.HOUSE_NAMES.find((n) => !cfg.seats.some((x) => x.name === n)) || `House ${cfg.seats.length + 1}`;
        cfg.seats.push({ name, color, ai: true });
      } else if (act === 'tutorial') {
        ov.remove();
        startTutorial();
        return;
      } else if (act === 'continue') {
        try { const st = CC.deserialize(saved.save); ov.remove(); startLoaded(st, null); } catch (err) { hint('That save could not be loaded.'); }
        return;
      } else if (act === 'start') {
        if (!cfg.seats.some((x) => !x.ai)) { /* all-CPU games are allowed: you watch */ }
        ov.remove();
        startLoaded(CC.newGame(startConfig()), null);
        return;
      } else return;
      savePrefs(); draw();
    });
    draw();
  }

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ------------------------------------------------------------ turn flow
  // Load a game state and run whatever comes next. online: the session object, or null for a local game.
  function startLoaded(st, online) {
    App.token++;
    App.st = st; App.online = online || null; App.busy = false; App.sel = null; App.plan = null;
    App.R.setState(st);
    App.R.fit();
    App.fitted = true;
    if (!online) store(SAVE_KEY, { save: CC.serialize(st), at: Date.now() });
    const tutStep = (load(PREF_KEY) || {}).tutStep || 0;
    if (!online && st.settings.tutorial && !st.over && tutStep < STEPS.length) coachStart(tutStep); else coachStop();
    renderAll();
    beginTurn();
  }

  // Replace the state with a newer copy (online sync) without restarting the flow.
  function replaceState(st) {
    const prevCur = App.st ? App.st.cur : -1, prevTurn = App.st ? App.st.turnNo : -1;
    App.st = st;
    App.R.setState(st);
    if (App.plan && !CC.getArmy(st, App.plan.armyId)) App.plan = null;
    if (App.plan) refreshPlan(true);
    renderAll();
    if (st.turnNo !== prevTurn || st.cur !== prevCur) beginTurn();
    else if (st.over) showGameOver();
  }

  async function beginTurn() {
    const s = App.st, token = App.token;
    stopTimer();
    App.sel = null; App.plan = null; $('#map').classList.remove('paint');
    renderAll();
    if (s.over) { showGameOver(); return; }
    const p = s.players[s.cur];
    if (p.ai) {
      if (!App.online || App.online.runsAI()) { await sleep(60); if (token === App.token && App.st === s) await runAI(token); }
      return;
    }
    if (App.online && !App.online.isMine(s.cur)) return;
    sfx('horn');
    if (App.online || humanCount() > 1 || eventsFor(s.cur).length) await showHandoff();
    if (token !== App.token || App.st !== s) return;
    if (p.lastIncome > 0) sfx('coins', { n: Math.min(8, 2 + Math.round(p.lastIncome / 10)) });
    if (s.dip.offers.some((o) => o.to === s.cur)) await reviewOffers();
    if (token !== App.token || App.st !== s) return;
    const cap = s.cities.find((c) => c.owner === s.cur && c.capital) || s.cities.find((c) => c.owner === s.cur);
    if (cap) ensureVisible(cap.tile);
    startTimer();
    renderAll();
  }

  async function runAI(token) {
    const s = App.st;
    App.busy = true; renderAll();
    const delay = { slow: 700, normal: 340, fast: 90, instant: 0 }[App.prefs.aiSpeed] || 0;
    const color = CC.colorOf(s, s.cur);
    const speed = { slow: 1.1, normal: 0.75, fast: 0.4, instant: 0 }[App.prefs.aiSpeed] || 0;
    for (const step of CC.ai.aiTurn(s)) {
      if (token !== App.token) return;
      if (App.online && step.report) App.online.push();
      if (step.kind === 'sail' && delay) {
        const rep = step.report;
        const f = CC.fleetAt(s, rep.end);
        const path = rep.battle && (rep.battle.transport || !rep.battle.win) ? rep.path.slice(0, -1) : rep.path;
        await App.R.animateMarch([rep.origin].concat(path), color, f ? f.n : 1, rep.end, speed, 'ship');
        if (rep.battle) sfx('cannon', { n: 3, vol: rep.battle.defender >= 0 && !s.players[rep.battle.defender].ai ? 0.9 : 0.5 });
        continue;
      }
      if (step.kind === 'sail-army' && delay) {
        await playSail(step.report, color, speed);
        continue;
      }
      if (step.kind === 'embark' && delay) {
        sfx('waves', { vol: 0.5 });
        App.R.pulse(step.report.tile, color);
        await sleep(delay * 0.5);
        continue;
      }
      if (step.kind === 'bombard' && delay) {
        sfx('cannon', { n: 3, vol: s.players[step.report.owner] && !s.players[step.report.owner].ai ? 0.9 : 0.4 });
        App.R.pulse(step.report.tile, '#f06e46');
        await sleep(delay * 0.6);
        continue;
      }
      if (step.region && delay) {
        const rep = step.report;
        App.R.ov.flash = { tiles: step.region.slice(), color, alpha: 0.6 };
        renderAll();
        const dj = CC.dijkstra(s, s.cur, rep.origin, (i) => CC.passable(s, i), { limit: 60, naval: CC.isHarborTile(s, rep.origin, s.cur) });
        const hitsHuman = rep.battles.some((b) => b.defender >= 0 && !s.players[b.defender].ai);
        await playMarch(rep, dj.prev, color, speed, 0.35);
        if (rep.battles.length) sfx('battle', { dur: 0.9, small: true, vol: hitsHuman ? 0.9 : 0.4 });
        await sleep(delay * (rep.battles.length ? 1.2 : 0.4));
        if (token !== App.token) return;
        App.R.ov.flash = null;
      }
    }
    await sleep(delay ? 120 : 0);
    if (token !== App.token) return;
    App.R.ov.flash = null;
    App.busy = false;
    finishTurn();
  }

  function finishTurn() {
    const s = App.st;
    stopTimer();
    if (!s.players[s.cur].ai) sfx('bell');
    App.endArmed = 0; App.plan = null; App.sel = null;
    s.players[s.cur].seen = s.logSeq;
    CC.endTurn(s);
    commit();
    const token = App.token;
    setTimeout(() => { if (token === App.token) beginTurn(); }, 0);
  }

  function onEndTurn() {
    if (!myTurn()) { if (App.st && !App.busy) { sfx('deny'); hint(plainText($('#btn-end').dataset.tip || 'Wait for your turn.')); } return; }
    const s = App.st, P = s.players[s.cur];
    const idle = s.armies.filter((a) => a.owner === s.cur && !(a.used > 0)).length;
    if (idle && P.orders === CC.ordersPerTurn(s, s.cur) && App.endArmed < Date.now()) {
      App.endArmed = Date.now() + 3000;
      sfx('deny');
      renderTop();
      hint('You have not marched yet this turn. Press again to end it anyway.');
      setTimeout(renderTop, 3100);
      return;
    }
    finishTurn();
  }

  function startTimer() {
    stopTimer();
    const t = App.st && App.st.settings.timer;
    if (!t || !myTurn()) return;
    App.timerEnd = Date.now() + t * 1000;
    App.timerId = setInterval(updateTimer, 250);
    updateTimer();
  }
  function stopTimer() { clearInterval(App.timerId); App.timerEnd = 0; }
  function updateTimer() {
    const el = $('#timer');
    if (!el || !App.timerEnd) return;
    const left = Math.max(0, Math.ceil((App.timerEnd - Date.now()) / 1000));
    el.querySelector('b').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    el.classList.toggle('low', left <= 15);
    if (left <= 0 && myTurn()) { stopTimer(); closeAllModals(); hint('Time is up. Your turn has ended.'); finishTurn(); }
  }

  // ------------------------------------------------------------ tutorial coach
  // A short practice game on a fixed map: one rival, a weak rebel town five tiles from your capital.
  const TUT_SEED = 21, TUT_TOWN = 'Dragonmere';
  const Coach = { on: false, step: 0, base: null, marks: [] };

  function startTutorial() {
    store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { tutStep: 0 }));
    closeAllModals();
    const st = CC.newGame({
      players: [{ name: 'House Varn', color: 0, ai: false }, { name: 'House Aldane', color: 1, ai: true }],
      size: 'small', rounds: 10, seed: TUT_SEED, tutorial: true, gen: 1,
    });
    // keep the first battle winnable: the practice town has a single rebel spearman
    const town = st.cities.find((c) => c.name === TUT_TOWN);
    const g = town && CC.armyAt(st, town.tile);
    if (g) g.u = CC.normU([1]);
    startLoaded(st, null);
  }

  const tutCap = () => { const s = App.st, c = s.cities.find((x) => x.owner === 0 && x.capital) || s.cities.find((x) => x.owner === 0); return c ? c.tile : -1; };
  function tutTown() {
    const s = App.st, cap = tutCap();
    return s.cities.find((c) => c.name === TUT_TOWN && c.owner !== 0) ||
      s.cities.filter((c) => c.owner !== 0).sort((a, b) => CC.hexDist(s, a.tile, cap) - CC.hexDist(s, b.tile, cap))[0] || null;
  }
  function tutArmy() {
    const s = App.st;
    const sel = App.plan && CC.getArmy(s, App.plan.armyId);
    if (sel && sel.owner === 0) return sel;
    return s.armies.filter((a) => a.owner === 0 && canMove(a)).sort((x, y) => CC.sum(y.u) - CC.sum(x.u))[0] || null;
  }
  // first tiles on the road from the army to the town that it can claim this turn
  function tutPathTiles(all) {
    const s = App.st, town = tutTown(), army = tutArmy();
    if (!town || !army) return town ? [town.tile] : [];
    const dj = CC.dijkstra(s, 0, army.tile, (i) => CC.passable(s, i), { limit: 60, naval: false });
    const path = [];
    for (let j = town.tile; j !== army.tile && j >= 0; j = dj.prev[j]) path.push(j);
    path.reverse();
    if (all) return path;
    const st = CC.armyStats(army.u);
    return path.filter((i) => s.tiles[i].owner !== 0 && dj.dist[i] <= st.mp && s.tiles[i].b !== 'city').slice(0, Math.min(3, st.cap));
  }
  function tutFarmTile() {
    const s = App.st, cap = tutCap();
    let best = -1, bd = Infinity;
    for (let i = 0; i < s.tiles.length; i++) {
      if (!CC.canBuild(s, 0, i, 'farm').ok && !(s.tiles[i].owner === 0 && s.tiles[i].t === 'plains' && !s.tiles[i].b && !s.tiles[i].gold)) continue;
      const d = CC.hexDist(s, i, cap);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  const tutSoldiers = () => CC.summary(App.st, 0).soldiers;
  const tutP = () => App.st.players[0];

  const STEPS = [
    { title: 'Welcome to your realm', next: 'Show me',
      body: () => 'You are <b>House Varn</b>, in red. The castle with the gold crown is your capital, and everything inside the red border is your land. Every turn you <b>claim land</b>, <b>build</b>, <b>recruit</b> and <b>fight</b>. This short game walks you through all four.',
      marks: () => [tutCap()] },
    { title: 'Pick up your army',
      body: () => 'Click the <b>red banner</b> on your castle. The number on it is how many soldiers stand there. (Clicking the castle and then <b>Command the garrison</b> works too.)',
      done: () => { const a = App.plan && CC.getArmy(App.st, App.plan.armyId); return !!(a && a.owner === 0); },
      marks: () => [tutCap()] },
    { title: 'Paint the land you want',
      body: () => `Now <b>click or drag across the gold outline</b>, just outside your border, on the road toward ${esc(TUT_TOWN)}. Painted tiles get a hatch, and the flag marks where your army will stop. Darkened tiles are too far to reach this turn. Forests, hills and rivers slow an army down, so it only gets this far today.`,
      done: () => !!(App.plan && App.plan.res && App.plan.res.newTiles >= 1) || tutP().stats.taken > 0,
      marks: () => tutPathTiles(false) },
    { title: 'March!',
      body: () => 'The panel on the right shows how many tiles this army can seize (more soldiers, more land) and that this march uses one of your <b>marching orders</b>. Press <b>March and claim</b>, or hit Enter.',
      done: () => tutP().stats.taken > 0,
      glow: '[data-act="march"]', marks: () => [] },
    { title: 'Build a farm',
      body: () => 'Farms pay gold every turn. Click the <b>green plains tile</b> outlined in gold inside your border, then press <b>Build</b> next to Farm. You may build 1 farm per 5 tiles you hold, so more land means more farms.',
      done: () => CC.summary(App.st, 0).farms >= 1,
      glow: '[data-act="build"][data-kind="farm"]', marks: () => [tutFarmTile()] },
    { title: 'Recruit soldiers',
      body: () => 'Click your <b>castle</b>, then press <b>+5</b> next to Spearmen. Soldiers cost gold now and a little upkeep every turn. They train for a turn and join your garrison at the start of your next turn.',
      done: () => tutSoldiers() + CC.trainingOf(App.st, 0) > Coach.base.soldiers,
      glow: '[data-act="recruit"][data-k="0"]', marks: () => [tutCap()] },
    { title: 'End your turn',
      body: () => 'Press <b>End turn</b> at the top right. Your rival, House Aldane, moves somewhere far away. Then you collect gold from your castle and farms, and get fresh marching orders.',
      done: () => App.st.round > Coach.base.round && myTurn(),
      glow: '#btn-end', marks: () => [] },
    { title: `Take ${TUT_TOWN}`,
      body: () => `The grey castle outlined in gold is <b>${esc(TUT_TOWN)}</b>, held by rebels. Towns give gold, recruits and an extra marching order. Click your army at the ford, then <b>paint a path that ends on the town</b>. The swords marker shows your chance to win. The town sits on a hill behind a river, which helps its defenders, so check the odds before you attack. Green is good; red means bring more soldiers first.`,
      done: () => tutP().stats.won + tutP().stats.lost > Coach.base.battles,
      marks: () => { const t = tutTown(); return t ? [t.tile] : []; } },
    { title: 'You know the basics', next: 'Finish',
      body: () => `${tutP().stats.won ? 'Victory! ' : 'Battles are numbers plus dice, and this one went against you. '}From here, keep the loop going: claim land, put farms on plains and <b>mines on gold deposits</b> (the gold diamonds), post soldiers on them as guards, and take towns. Each town's panel has walls, markets, harbors for ships, and stables for knights. Most points after round 10 wins. <b>Rules</b> at the top has the details.`,
      marks: () => [] },
  ];

  // keep the coach card off the tiles it points at: flip it to the bottom-left when they would be hidden
  function placeCoach() {
    const el = $('#coach'), R = App.R;
    if (!el || el.hidden || !Coach.marks.length) return;
    const wrap = $('#mapwrap').getBoundingClientRect();
    const box = { w: el.offsetWidth, h: el.offsetHeight };
    const topRight = { x0: wrap.width - box.w - 10, y0: 10, x1: wrap.width - 10, y1: 10 + box.h };
    const hidden = Coach.marks.some((i) => {
      if (i < 0) return false;
      const p = R.center(i), sc = R.toScreen(p.x, p.y), pad = R.S * R.cam.z;
      return sc.x + pad > topRight.x0 && sc.x - pad < topRight.x1 && sc.y + pad > topRight.y0 && sc.y - pad < topRight.y1;
    });
    el.classList.toggle('low', hidden);
  }

  function coachBase() {
    const s = App.st, P = s.players[0];
    return { taken: P.stats.taken, soldiers: tutSoldiers(), battles: P.stats.won + P.stats.lost, round: s.round };
  }
  function coachStart(step) {
    Coach.on = true; Coach.step = step || 0; Coach.base = coachBase();
    $('#mapwrap').classList.add('coaching');
    // start close to home so the outlined tiles are easy to see
    const R = App.R, cap = tutCap();
    if (cap >= 0) { R.cam.z = Math.min(2.2, R.cam.z * 1.9); R.clamp(); R.focus(cap); }
    coachFocus();
  }
  function coachStop() {
    Coach.on = false; Coach.marks = [];
    $('#mapwrap').classList.remove('coaching');
    const el = $('#coach'); if (el) el.hidden = true;
    document.querySelectorAll('.coach-glow').forEach((x) => x.classList.remove('coach-glow'));
    drawMap();
  }
  function coachAdvance() {
    Coach.step++;
    sfx('coins', { n: 2 });
    store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { tutStep: Coach.step }));
    if (Coach.step >= STEPS.length) { coachStop(); return; }
    Coach.base = coachBase();
    coachFocus();
  }
  function coachFocus() {
    const step = STEPS[Coach.step];
    const marks = step && step.marks ? step.marks() : [];
    if (marks.length && marks[0] >= 0) ensureVisible(marks[0]);
  }
  // called after every panel render: notice finished steps, refresh the card, outlines and glow
  function coachTick() {
    if (!Coach.on || !App.st) return;
    if (App.st.over) { coachStop(); return; }
    let step = STEPS[Coach.step];
    for (let guard = 0; step && step.done && guard < STEPS.length; guard++) {
      if (!step.done()) break;
      coachAdvance();
      if (!Coach.on) return;
      step = STEPS[Coach.step];
    }
    Coach.marks = step.marks ? step.marks() : [];
    const el = $('#coach');
    el.hidden = false;
    el.innerHTML = `<div class="coach-top"><span class="coach-dots" aria-label="Tutorial step ${Coach.step + 1} of ${STEPS.length}">${STEPS.map((_, k) => `<i class="${k <= Coach.step ? 'on' : ''}"></i>`).join('')}</span>
        <button class="btn small ghost" type="button" data-coach="exit">Exit tutorial</button></div>
      <h3>${step.title}</h3><p>${step.body()}</p>
      <div class="coach-actions">${step.next ? `<button class="btn small primary" type="button" data-coach="next">${step.next}</button>` : '<button class="btn small ghost" type="button" data-coach="next">Skip this step</button>'}</div>`;
    document.querySelectorAll('.coach-glow').forEach((x) => x.classList.remove('coach-glow'));
    if (step.glow) document.querySelectorAll(step.glow).forEach((x) => x.classList.add('coach-glow'));
    placeCoach();
  }

  // ------------------------------------------------------------ hover tips
  let uiTip = null, tipFor = null, tipTimer = 0;
  function setupTips() {
    uiTip = document.createElement('div');
    uiTip.id = 'uitip'; uiTip.setAttribute('role', 'tooltip'); uiTip.hidden = true;
    document.body.appendChild(uiTip);
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const el = e.target.closest && e.target.closest('[data-tip], [data-tipfn]');
      if (el === tipFor) return;
      hideUiTip();
      if (!el) return;
      tipFor = el;
      tipTimer = setTimeout(() => showUiTip(el), el.closest('#topbar') ? 120 : 260);
    });
    document.addEventListener('pointerdown', hideUiTip, true);
    document.addEventListener('scroll', hideUiTip, true);
    // focus shows the same tip for keyboard players
    document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip], [data-tipfn]'); if (el && el.matches(':focus-visible')) { tipFor = el; showUiTip(el); } });
    document.addEventListener('focusout', hideUiTip);
  }
  function showUiTip(el) {
    if (!el.isConnected || !App.st && el.dataset.tipfn) return;
    let html = el.dataset.tip;
    if (el.dataset.tipfn && TIPS[el.dataset.tipfn]) { try { html = TIPS[el.dataset.tipfn](); } catch (e) { html = ''; } }
    if (!html) return;
    uiTip.innerHTML = html; uiTip.hidden = false;
    const r = el.getBoundingClientRect(), w = uiTip.offsetWidth, h = uiTip.offsetHeight;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = r.top - h - 8;
    uiTip.style.left = x + 'px'; uiTip.style.top = Math.max(8, y) + 'px';
  }
  function hideUiTip() { clearTimeout(tipTimer); tipFor = null; if (uiTip) uiTip.hidden = true; }

  function renderSoundBtn() {
    const b = $('#btn-sound');
    if (!b) return;
    b.setAttribute('aria-pressed', String(Sfx.on));
    b.setAttribute('aria-label', Sfx.on ? 'Sound on' : 'Sound off');
    b.dataset.tip = Sfx.on ? 'Sound is on. Click to mute.' : 'Sound is off. Click to turn it on.';
    b.classList.toggle('muted', !Sfx.on);
  }

  // ------------------------------------------------------------ boot
  function boot(data) {
    const prefs = load(PREF_KEY);
    if (prefs && prefs.aiSpeed) App.prefs.aiSpeed = prefs.aiSpeed;
    if (prefs && prefs.sound === false) Sfx.setOn(false);
    if (prefs && typeof prefs.volume === 'number') Sfx.setVolume(prefs.volume);
    App.R = new CC.Renderer($('#map'));
    App.R.onFrame = paintMap;
    setupTips();
    renderSoundBtn();
    $('#btn-sound').addEventListener('click', () => {
      Sfx.setOn(!Sfx.on);
      store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { sound: Sfx.on }));
      renderSoundBtn(); hideUiTip();
      sfx('click');
    });
    // every button gives a soft click; unavailable ones are handled where they are used
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest && e.target.closest('.btn, .seg button, .stepper button, .list button, .colorbtn');
      if (b && b.getAttribute('aria-disabled') !== 'true' && !b.disabled && b.id !== 'btn-sound') sfx('click');
    }, true);
    const wrap = $('#mapwrap');
    const fitNow = () => {
      const r = wrap.getBoundingClientRect();
      App.R.resize(Math.max(50, r.width), Math.max(50, r.height));
      if (App.st && !App.fitted) { App.R.fit(); App.fitted = true; }
      paintMap();
    };
    new ResizeObserver(fitNow).observe(wrap);
    fitNow();
    setupInput();
    $('#panel').addEventListener('click', onPanelClick);
    $('#sidetabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { setSideTab(b.dataset.tab); sfx('click'); } });
    $('#btn-stats').addEventListener('click', showStats);
    setSideTab('turn');
    $('#realm').addEventListener('click', (e) => { const b = e.target.closest('[data-dip]'); if (b && myTurn()) showDiplomacy(+b.dataset.dip); });
    $('#coach').addEventListener('click', (e) => {
      const b = e.target.closest('[data-coach]');
      if (!b) return;
      if (b.dataset.coach === 'exit') { store(PREF_KEY, Object.assign(load(PREF_KEY) || {}, { tutStep: STEPS.length })); coachStop(); }
      else { coachAdvance(); renderAll(); }
    });
    $('#btn-end').addEventListener('click', onEndTurn);
    $('#btn-help').addEventListener('click', showRules);
    $('#btn-menu').addEventListener('click', showMenu);
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if ($('#layer').children.length) { if (e.key === 'Escape') closeTopModal(); return; }
      if (!App.st) return;
      const R = App.R;
      if (e.key === ' ') { spaceHeld = true; e.preventDefault(); }
      else if (e.key === 'Escape') { hideInspect(); if (App.plan && App.plan.region.length) clearPlan(); else select(null); }
      else if (e.key === 'Enter') march();
      else if (e.key === 'n' || e.key === 'N') nextArmy();
      else if (e.key === 'e' || e.key === 'E') onEndTurn();
      else if (e.key === '+' || e.key === '=') { R.zoomAt(R.view.w / 2, R.view.h / 2, 1.25); drawMap(); }
      else if (e.key === '-' || e.key === '_') { R.zoomAt(R.view.w / 2, R.view.h / 2, 0.8); drawMap(); }
      else {
        const d = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60], a: [60, 0], d: [-60, 0], w: [0, 60], s: [0, -60] }[e.key];
        if (d) { R.pan(d[0], d[1]); drawMap(); e.preventDefault(); }
      }
    });
    document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceHeld = false; });
    window.addEventListener('blur', () => { spaceHeld = false; });
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
      try { window.claude.hot.snapshot(() => ({ save: App.st && !App.online ? CC.serialize(App.st) : null })); } catch (e) { /* optional */ }
    }
    if (data && data.save) {
      try { startLoaded(CC.deserialize(data.save), null); return; } catch (e) { /* fall through to setup */ }
    }
    // an invite link goes straight to the name prompt for the online lobby
    if (CC.P2P && CC.P2P.boot && CC.P2P.boot()) return;
    showSetup();
  }

  Object.assign(App, { editFlag, flagTag, startTutorial, startLoaded, replaceState, renderAll, modal, hint, esc, showSetup, closeAllModals, controls, myTurn, beginTurn, finishTurn, store, load, swatch });

  const go = () => (window.claude && window.claude.hot && window.claude.hot.ready ? window.claude.hot.ready(boot) : boot((window.claude && window.claude.hot && window.claude.hot.data) || {}));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
