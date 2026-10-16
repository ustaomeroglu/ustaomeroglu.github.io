/* Kurultay — computer opponents. A generator yields after each action so the UI can animate it. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const { RULES, UNITS } = CC;
  const sum = CC.sum;

  const Z = CC.Z;
  // field attack strength, with knights counted a little short (spears, terrain) and cannons barely at all
  const attackPower = (u) => { let a = 0; UNITS.forEach((d, k) => { a += (u[k] || 0) * d.att * (d.mounted ? 0.75 : d.siege ? 0.5 : 1); }); return a; };

  // Enemy strength that could hit this tile next turn (rebels never march).
  function threatTo(st, me, tile) {
    let t = 0;
    for (const a of st.armies) {
      if (a.owner < 0 || a.owner === me) continue;
      const d = CC.hexDist(st, a.tile, tile);
      if (d <= 6) t += attackPower(a.u) * (d <= 3 ? 1 : 0.7);
    }
    return t;
  }

  function cityDefense(st, c, u) {
    return CC.powers([1, 0, 0], u, 1 + c.walls, CC.battleCtx(st, c.tile, false)).D;
  }

  // Units an army in a city keeps home so the city can survive the threat around it.
  function keepForDefense(st, me, army) {
    const c = CC.cityAt(st, army.tile);
    if (!c) return Z();
    const need = threatTo(st, me, army.tile) * 1.2;
    const minKeep = c.capital ? 2 : 1;
    const keep = Z();
    for (let guard = 0; guard < 200; guard++) {
      if (sum(keep) >= minKeep && cityDefense(st, c, keep) >= need) break;
      const k = [1, 0, 3, 2, 4].find((x) => keep[x] < army.u[x]);
      if (k == null) break;
      keep[k]++;
    }
    return keep;
  }

  // soldiers free to march: not kept home for defense, and not recruited this turn
  function availOf(a, keep) { const mov = CC.movable(a); return a.u.map((n, k) => Math.max(0, Math.min(mov[k], n - keep[k]))); }

  function tileValue(st, me, i) {
    const t = st.tiles[i];
    if (t.owner === me || CC.atPeace(st, me, t.owner)) return 0;
    let v = t.owner >= 0 ? 3 : 2;
    if (t.b === 'city') v += st.cities[t.city].owner >= 0 ? 75 : 50;
    else if (t.b === 'mine') v += 26;
    else if (t.b === 'farm') v += 15;
    else if (t.b === 'tower') v += 9;
    else if (t.gold) v += 18;
    if (t.t === 'plains' || t.river) v += 0.8;
    return v;
  }

  // Smallest detachment whose land capacity covers `need` tiles, spearmen first.
  function minimalForce(avail, need) {
    const f = Z();
    for (const k of [0, 1, 3, 2]) {
      while (f[k] < avail[k] && CC.armyStats(f).cap < need) f[k]++;
      if (CC.armyStats(f).cap >= need) break;
    }
    return CC.armyStats(f).cap >= need ? f : null;
  }

  // Greedily add cheap, undefended neighbouring tiles until the capacity is used up.
  function extend(st, me, army, force, region) {
    const mp = CC.movesLeft(army, force), cap = CC.landLeft(army, force);
    const set = new Set(region);
    let used = region.filter((i) => st.tiles[i].owner !== me).length;
    for (let guard = 0; guard < 20 && used < cap; guard++) {
      const dj = CC.dijkstra(st, me, army.tile, (i) => CC.passable(st, i) && (st.tiles[i].owner === me || set.has(i)),
        { limit: mp, naval: CC.isHarborTile(st, army.tile, me), zoc: CC.zocFor(st, me, set) });
      const zone = CC.zocTiles(st, me, set);
      let best = -1, bv = 0;
      for (let i = 0; i < st.tiles.length; i++) {
        if (!(dj.dist[i] < mp) || (zone.has(i) && i !== army.tile)) continue;
        for (const j of st._nb[i]) {
          if (set.has(j) || !CC.passable(st, j) || st.tiles[j].owner === me) continue;
          if (dj.dist[i] + CC.stepCost(st, me, j) > mp) continue;
          if (CC.defenderAt(st, j, me)) continue;
          const v = tileValue(st, me, j) - CC.stepCost(st, me, j) * 0.2;
          if (v > bv) { bv = v; best = j; }
        }
      }
      if (best < 0) break;
      set.add(best); region.push(best); used++;
    }
    return region;
  }

  function militaryOptions(st, me) {
    const options = [];
    for (const army of st.armies) {
      if (army.owner !== me || army.sea || CC.movesLeft(army) <= 0) continue;
      const keep = keepForDefense(st, me, army);
      const avail = availOf(army, keep);
      if (!sum(avail)) continue;
      const full = { mp: CC.movesLeft(army, avail), cap: CC.landLeft(army, avail) };
      if (full.mp <= 0) continue;
      const harbor = CC.isHarborTile(st, army.tile, me);
      // routes for claiming land go around every enemy zone; routes to an enemy may cross that enemy's own zone
      const dj = CC.dijkstra(st, me, army.tile, (i) => CC.passable(st, i), { limit: full.mp, naval: harbor, zoc: CC.zocFor(st, me, null) });
      const free = CC.dijkstra(st, me, army.tile, (i) => CC.passable(st, i), { limit: full.mp, naval: harbor });
      const sources = CC.zocSources(st, me);
      const attackRoute = new Map();
      for (const t of sources.keys()) {
        if (!(free.dist[t] <= full.mp)) continue;
        attackRoute.set(t, CC.dijkstra(st, me, army.tile, (i) => CC.passable(st, i), { limit: full.mp, naval: harbor, zoc: CC.zocFor(st, me, new Set([t])) }));
      }
      const evaluate = (force, region, dest) => {
        const plan = CC.planCampaign(st, army.id, force, region, dest);
        if (!plan.valid) return null;
        let gain = 0;
        for (const x of plan.order) gain += tileValue(st, me, x);
        for (const b of plan.battles) gain += sum(b.u) * 2.5;
        const risk = sum(force) * 3.5;
        const minP = plan.battles.some((b) => b.city >= 0) ? 0.62 : 0.58;
        if (plan.battles.length && plan.pAll < minP) return null;
        const score = plan.pAll * gain - (1 - plan.pAll) * risk - sum(force) * 0.05;
        return { score, armyId: army.id, u: force, region, dest, plan };
      };
      // pass 1: score the straight path to every reachable prize
      const cands = [];
      for (let i = 0; i < st.tiles.length; i++) {
        const route = attackRoute.get(i) || dj;
        if (!(route.dist[i] <= full.mp) || i === army.tile) continue;
        if (tileValue(st, me, i) < 2) continue;
        const path = [];
        for (let j = i; j !== army.tile && j >= 0; j = route.prev[j]) path.push(j);
        path.reverse();
        const need = path.filter((x) => st.tiles[x].owner !== me).length;
        if (need > full.cap) continue;
        const fights = path.some((x) => CC.defenderAt(st, x, me));
        const force = fights ? avail.slice() : minimalForce(avail, Math.min(full.cap, need + 3) + (army.took || 0));
        if (!force) continue;
        const o = evaluate(force, path, i);
        if (o) cands.push(o);
      }
      cands.sort((a, b) => b.score - a.score);
      // pass 2: fill spare land capacity for the few best, keep the winner
      let bestHere = null;
      for (const c of cands.slice(0, 4)) {
        const o = evaluate(c.u, extend(st, me, army, c.u, c.region.slice()), c.dest) || c;
        if (o.score > 1 && (!bestHere || o.score > bestHere.score)) bestHere = o;
      }
      if (bestHere) options.push(bestHere);
    }
    return options.sort((a, b) => b.score - a.score);
  }

  // Idle armies march through home territory toward the nearest prize to gather for later.
  function stagingMove(st, me) {
    const targets = st.cities.filter((c) => c.owner !== me).map((c) => c.tile);
    if (!targets.length) return null;
    for (const army of st.armies) {
      if (army.owner !== me || army.sea || CC.movesLeft(army) <= 0) continue;
      const keep = keepForDefense(st, me, army);
      const avail = availOf(army, keep);
      if (sum(avail) < 4) continue;
      const nearest = (tile) => Math.min(...targets.map((x) => CC.hexDist(st, x, tile)));
      const here = nearest(army.tile);
      const mp = CC.movesLeft(army, avail);
      const dj = CC.dijkstra(st, me, army.tile, (i) => CC.passable(st, i) && st.tiles[i].owner === me, { limit: mp, naval: false, zoc: CC.zocFor(st, me, null) });
      let best = -1, bd = here;
      for (let i = 0; i < st.tiles.length; i++) {
        if (!(dj.dist[i] <= mp) || i === army.tile) continue;
        const d = nearest(i);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0 && bd < here) return { armyId: army.id, u: avail, region: [best], dest: best };
    }
    return null;
  }

  function landTargetsReachable(st, me) {
    // Is there any land we do not own that can be walked to from our territory?
    const seen = new Uint8Array(st.tiles.length), q = [];
    for (let i = 0; i < st.tiles.length; i++) if (st.tiles[i].owner === me) { seen[i] = 1; q.push(i); }
    for (let h = 0; h < q.length; h++)
      for (const j of st._nb[q[h]]) {
        if (seen[j] || !CC.passable(st, j)) continue;
        if (st.tiles[j].owner !== me) return true;
      }
    return false;
  }

  function economy(st, me) {
    const P = st.players[me];
    const late = st.maxRounds && st.round > st.maxRounds - 3;
    // mines first, then farms on the safest fertile ground
    for (let i = 0; i < st.tiles.length; i++) if (st.tiles[i].owner === me && st.tiles[i].gold && !st.tiles[i].b) CC.build(st, me, i, 'mine');
    // strategic buildings come before farms, or farms would soak up every coin
    if (!late && st.round >= 3) {
      const towns = st.cities.filter((c) => c.owner === me);
      const capTown = towns.find((c) => c.capital) || towns[0];
      if (capTown && !towns.some((c) => c.barracks)) {
        const bInfo = CC.upgradeInfo(st, me, capTown.id, 'barracks');
        if (bInfo.ok && P.gold >= bInfo.cost + 10) CC.upgrade(st, me, capTown.id, 'barracks');
      }
      if (capTown && st.round >= 5 && !towns.some((c) => c.foundry)) {
        const goal = chooseGoal(st, me);
        const fInfo = CC.upgradeInfo(st, me, capTown.id, 'foundry');
        if (goal && goal.walls >= 1 && fInfo.ok && P.gold >= fInfo.cost + 20) CC.upgrade(st, me, capTown.id, 'foundry');
      }
      // a harbor and a few warships when there are markets to hold
      const posts = st._posts || [];
      if (posts.length) {
        const coastal = towns.find((c) => c.harbor) || towns.find((c) => CC.isCoastal(st, c.tile));
        if (coastal && !coastal.harbor && st.round >= 3 && P.gold >= RULES.harborCost + 5) CC.upgrade(st, me, coastal.id, 'harbor');
        const kind = nextShip(st, me);
        if (coastal && coastal.harbor && kind && P.gold >= CC.shipCostOf(kind) + 5) CC.recruitShips(st, me, coastal.id, 1, kind);
      }
      if (capTown && !towns.some((c) => c.stables)) {
        const sInfo = CC.upgradeInfo(st, me, capTown.id, 'stables');
        if (sInfo.ok && P.gold >= sInfo.cost + 10) CC.upgrade(st, me, capTown.id, 'stables');
      }
      // outposts on the border, in front of farms and mines, facing rivals
      let outposts = 0, land = 0;
      for (const t of st.tiles) if (t.owner === me) { land++; if (t.b === 'tower') outposts++; }
      if (P.gold >= RULES.outpostCost + 15 && outposts < Math.floor(land / 14)) {
        let best = -1, bv = 0;
        for (let i = 0; i < st.tiles.length; i++) {
          if (!CC.canBuild(st, me, i, 'outpost').ok) continue;
          let v = 0;
          for (const j of st._nb[i]) {
            const o = st.tiles[j].owner;
            if (o >= 0 && o !== me) v += 3; else if (o < 0 && CC.passable(st, j)) v += 0.5;
            if (o === me && (st.tiles[j].b === 'farm' || st.tiles[j].b === 'mine')) v += 2;
          }
          if (v > bv) { bv = v; best = i; }
        }
        if (best >= 0 && bv >= 3) CC.build(st, me, best, 'outpost');
      }
    }
    for (let guard = 0; guard < 12 && !late; guard++) {
      if (P.gold < RULES.farmCost + 6) break;
      let best = -1, bv = -Infinity;
      for (let i = 0; i < st.tiles.length; i++) {
        if (!CC.canBuild(st, me, i, 'farm').ok) continue;
        let danger = 0;
        for (const j of st._nb[i]) if (st.tiles[j].owner !== me && st.tiles[j].owner >= 0) danger++;
        const v = (st.tiles[i].river ? 3 : 0) - danger;
        if (v > bv) { bv = v; best = i; }
      }
      if (best < 0) break;
      CC.build(st, me, best, 'farm');
    }
    const mine = st.cities.filter((c) => c.owner === me);
    for (const c of mine) {
      const threat = threatTo(st, me, c.tile);
      const garrison = CC.armyAt(st, c.tile);
      if (threat > 0 && cityDefense(st, c, garrison ? garrison.u : Z()) < threat * 1.2 && c.walls < 3) {
        const info = CC.upgradeInfo(st, me, c.id, 'walls');
        if (info.ok && P.gold >= info.cost + 15) CC.upgrade(st, me, c.id, 'walls');
      }
    }
    if (!late) {
      const cap = mine.find((c) => c.capital) || mine[0];
      if (cap) {
        const m = CC.upgradeInfo(st, me, cap.id, 'market');
        if (m.ok && P.gold >= m.cost + 35 && (!st.maxRounds || st.round <= st.maxRounds - 5)) CC.upgrade(st, me, cap.id, 'market');
      }
      if (!mine.some((c) => c.harbor) && !landTargetsReachable(st, me)) {
        const coastal = mine.find((c) => CC.isCoastal(st, c.tile));
        if (coastal) CC.upgrade(st, me, coastal.id, 'harbor');
      }
      if (P.gold >= RULES.castleCost + 50) {
        let best = -1, bv = -Infinity;
        for (let i = 0; i < st.tiles.length; i++) {
          if (!CC.canBuild(st, me, i, 'castle').ok) continue;
          let free = 0;
          for (const j of CC.disk(st.W, st.H, i, 3, st._wrap)) if (CC.passable(st, j) && st.tiles[j].owner !== me) free++;
          if (free > bv) { bv = free; best = i; }
        }
        if (best >= 0) CC.build(st, me, best, 'castle');
      }
    }
  }

  // gold kept back from recruiting for the next harbor or warship, when there are markets to win
  function savings(st, me) {
    const posts = st._posts || [];
    if (!posts.length || st.round < 3) return 0;
    const towns = st.cities.filter((c) => c.owner === me);
    const coastal = towns.find((c) => c.harbor) || towns.find((c) => CC.isCoastal(st, c.tile));
    if (!coastal) return 0;
    if (!coastal.harbor) return RULES.harborCost;
    const kind = nextShip(st, me);
    return kind ? CC.shipCostOf(kind) : 0;
  }
  // the next ship to build while there are trading posts: a warship or two to guard, merchant ships to trade
  function nextShip(st, me) {
    const posts = st._posts || [];
    let war = 0, merchants = 0;
    for (const f of st.fleets) if (f.owner === me) { if (CC.isMerchant(f)) merchants += f.n; else war += f.n; }
    if (war + merchants >= Math.min(5, posts.length + 1)) return null;
    if (war < 1) return 'war';
    if (merchants < Math.min(3, posts.length)) return 'merchant';
    return war < 2 ? 'war' : null;
  }

  function recruitAll(st, me) {
    const P = st.players[me];
    const keepBack = savings(st, me);
    const inc = CC.income(st, me);
    let upkeepRoom = inc.gross - inc.upkeep - 3; // keep income positive
    const mine = st.cities.filter((c) => c.owner === me);
    const tryRecruit = (c, k) => {
      if (UNITS[k].upkeep > upkeepRoom) return false;
      if (!CC.recruit(st, me, c.id, k, 1).ok) return false;
      upkeepRoom -= UNITS[k].upkeep;
      return true;
    };
    // 1) defend threatened cities, archers on walls
    for (const c of mine) {
      const threat = threatTo(st, me, c.tile);
      for (let guard = 0; guard < 20; guard++) {
        const g = CC.armyAt(st, c.tile);
        if (cityDefense(st, c, g ? g.u : Z()) >= threat * 1.2) break;
        if (!tryRecruit(c, c.walls >= 1 ? 1 : 0) && !tryRecruit(c, 0)) break;
      }
    }
    // 2) build an attack force in the city closest to something worth taking
    const targets = st.cities.filter((c) => c.owner !== me).map((c) => c.tile);
    const sorted = mine.slice().sort((a, b) => {
      const da = Math.min(99, ...targets.map((x) => CC.hexDist(st, x, a.tile)));
      const db = Math.min(99, ...targets.map((x) => CC.hexDist(st, x, b.tile)));
      return da - db;
    });
    for (const c of sorted) {
      for (let guard = 0; guard < 20; guard++) {
        if (P.gold < 5 + keepBack) break;
        const g = CC.armyAt(st, c.tile);
        const u = g ? g.u : Z();
        const n = sum(u) || 1;
        const goal = chooseGoal(st, me);
        let k = 0;
        if (c.foundry && goal && goal.walls >= 1 && u[4] < 2 && P.gold >= UNITS[4].cost + 10) k = 4;
        else if (c.stables && u[2] / n < 0.2 && P.gold >= UNITS[2].cost) k = 2;
        else if (c.barracks && u[3] / n < 0.3 && P.gold >= UNITS[3].cost) k = 3;
        else if (u[1] / n < 0.2 && P.gold >= UNITS[1].cost) k = 1;
        if (!tryRecruit(c, k) && !(k !== 0 && tryRecruit(c, 0))) break;
      }
    }
  }

  // ---- campaign goal: one town to besiege, one main army to do it
  function cityDefensePower(st, c) {
    const g = CC.armyAt(st, c.tile);
    return CC.powers([1, 0, 0], g ? g.u : Z(), 1 + c.walls, CC.battleCtx(st, c.tile, false)).D;
  }

  function chooseGoal(st, me) {
    const anchors = st.armies.filter((a) => a.owner === me).map((a) => a.tile)
      .concat(st.cities.filter((c) => c.owner === me).map((c) => c.tile));
    let best = null, bs = -Infinity;
    for (const c of st.cities) {
      if (c.owner === me) continue;
      const dist = Math.min(...anchors.map((x) => CC.hexDist(st, x, c.tile)));
      if (dist > 12) continue;
      const value = (c.owner >= 0 ? 75 : 50) + (c.capital ? 25 : 0);
      const s = value / (cityDefensePower(st, c) + 4) / (dist + 3);
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  function mainArmy(st, me) {
    let best = null, bp = 0;
    for (const a of st.armies) {
      if (a.owner !== me || a.sea || CC.movesLeft(a) <= 0) continue;
      const keep = keepForDefense(st, me, a);
      const avail = availOf(a, keep);
      const p = attackPower(avail);
      if (p > bp) { bp = p; best = { army: a, avail }; }
    }
    return best;
  }

  // March the main army along the shortest path toward the goal; strike only with good odds.
  function goalMove(st, me, goal) {
    const m = mainArmy(st, me);
    if (!m || !goal) return null;
    const { army, avail } = m;
    const capLeft = CC.landLeft(army, avail);
    const harbor = CC.isHarborTile(st, army.tile, me);
    // route around other enemies' zones; the goal itself may be attacked
    const dj = CC.dijkstra(st, me, army.tile, (i) => CC.passable(st, i), { limit: 80, naval: harbor, zoc: CC.zocFor(st, me, new Set([goal.tile])) });
    if (!(dj.dist[goal.tile] < Infinity)) return null;
    const path = [];
    for (let j = goal.tile; j !== army.tile && j >= 0; j = dj.prev[j]) path.push(j);
    path.reverse();
    const ready = attackPower(avail) >= cityDefensePower(st, goal) * 1.3;
    const region = [];
    let fresh = 0;
    for (const j of path) {
      if (dj.dist[j] > CC.movesLeft(army, avail)) break;
      if (j === goal.tile && !ready) break;
      if (!ready && CC.hexDist(st, j, goal.tile) < 2) break;
      if (st.tiles[j].owner !== me) { if (fresh + 1 > capLeft) break; fresh++; }
      region.push(j);
      if (j === goal.tile) break;
    }
    if (!region.length) return null;
    const plan = CC.planCampaign(st, army.id, avail, region, region[region.length - 1]);
    if (!plan.valid) {
      // out of orders or blocked: fall back to the part of the path inside our own land
      const own = [];
      for (const j of region) { if (st.tiles[j].owner !== me) break; own.push(j); }
      if (!own.length) return null;
      const p2 = CC.planCampaign(st, army.id, avail, own, own[own.length - 1]);
      return p2.valid ? { armyId: army.id, u: avail, region: own, dest: own[own.length - 1] } : null;
    }
    if (plan.battles.length && plan.pAll < 0.62) return null;
    return { armyId: army.id, u: avail, region, dest: region[region.length - 1] };
  }

  // Spare troops walk home roads to join the main army.
  function gatherMoves(st, me, mainId) {
    const main = CC.getArmy(st, mainId);
    if (!main) return [];
    const moves = [];
    for (const a of st.armies) {
      if (a.owner !== me || a.sea || CC.movesLeft(a) <= 0 || a.id === mainId) continue;
      const keep = keepForDefense(st, me, a);
      const avail = availOf(a, keep);
      if (sum(avail) < 2) continue;
      const mp = CC.movesLeft(a, avail);
      const dj = CC.dijkstra(st, me, a.tile, (i) => CC.passable(st, i) && st.tiles[i].owner === me, { limit: mp, naval: false, zoc: CC.zocFor(st, me, null) });
      let best = -1, bd = CC.hexDist(st, a.tile, main.tile);
      for (let i = 0; i < st.tiles.length; i++) {
        if (!(dj.dist[i] <= mp) || i === a.tile) continue;
        const d = CC.hexDist(st, i, main.tile);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) moves.push({ armyId: a.id, u: avail, region: [best], dest: best });
    }
    return moves;
  }

  function* run(st, me, mv, kind) {
    const rep = CC.executeCampaign(st, mv.armyId, mv.u, mv.region, mv.dest);
    if (!rep.error) yield { kind, report: rep, region: mv.region };
    return !rep.error;
  }

  // ---- diplomacy
  function might(st, p) {
    let m = 0;
    for (const a of st.armies) if (a.owner === p) m += attackPower(a.u);
    return m + 10 * st.cities.filter((c) => c.owner === p).length;
  }
  function bordering(st, a, b) {
    for (let i = 0; i < st.tiles.length; i++) if (st.tiles[i].owner === a && st._nb[i].some((j) => st.tiles[j].owner === b)) return true;
    return false;
  }
  // how much an offer is worth to house `me`, which would receive it
  function offerValue(st, me, o) {
    const turns = st.maxRounds ? Math.max(1, Math.min(RULES.tributeTurns, st.maxRounds - st.round + 1)) : RULES.tributeTurns;
    let v = o.giveGold + o.givePer * turns * 0.8 - o.getGold - o.getPer * turns;
    if (o.trade) v += 3 * turns;
    if (o.peace && !CC.atPeace(st, me, o.from)) {
      const mine = might(st, me), theirs = might(st, o.from);
      if (!bordering(st, me, o.from)) v += 5;
      else if (theirs > mine * 1.3) v += 45;      // they could crush us: peace is precious
      else if (mine > theirs * 1.6) v -= 35;      // we could take their land
      else v += st.players.some((x) => x.id !== me && x.id !== o.from && CC.atPeace(st, me, x.id)) ? -10 : 4;
    }
    return v;
  }
  function respond(st, id) {
    const o = st.dip.offers.find((x) => x.id === id);
    if (!o) return null;
    const accept = offerValue(st, o.to, o) >= 0 && st.players[o.to].gold >= o.getGold;
    return Object.assign(CC.answerOffer(st, id, accept), { accepted: accept });
  }
  // now and then, a computer house offers peace when weaker or demands tribute when much stronger
  function propose(st, me) {
    if ((st.turnNo + me) % 3 !== 0) return;
    const P = st.players[me], mine = might(st, me);
    for (const q of st.players) {
      if (q.id === me || !q.alive || CC.atPeace(st, me, q.id) || !bordering(st, me, q.id)) continue;
      const theirs = might(st, q.id);
      let raw = null;
      if (theirs > mine * 1.4) raw = { from: me, to: q.id, peace: true, giveGold: Math.min(25, Math.floor(P.gold / 3)) };
      else if (mine > theirs * 2 && st.round >= 4) raw = { from: me, to: q.id, peace: true, getPer: Math.min(10, Math.max(3, Math.round(theirs / 6))) };
      else if (st.round >= 4 && mine < theirs * 1.2 && theirs < mine * 1.2 && !st.players.some((x) => x.id !== me && CC.atPeace(st, me, x.id))) raw = { from: me, to: q.id, peace: true, trade: true };
      if (!raw) continue;
      const r = CC.proposeOffer(st, raw);
      if (r.ok && q.ai) respond(st, r.offer.id);   // computer houses answer at once; humans on their turn
      return;
    }
  }

  // ---- by sea: when the goal cannot be walked to, the main army sails from a harbor and lands near it
  // go by sea when the goal cannot be walked to, or the walk is far longer than the crossing
  function preferSea(st, me, goal) {
    const m = mainArmy(st, me);
    if (!m || !goal) return false;
    const walk = CC.dijkstra(st, me, m.army.tile, (i) => CC.passable(st, i), { limit: 200, naval: false }).dist[goal.tile];
    if (walk === Infinity) return true;
    const coastal = CC.isCoastal(st, goal.tile) || st._nb[goal.tile].some((j) => CC.isCoastal(st, j));
    return coastal && st.cities.some((c) => c.owner === me && c.harbor) && walk > Math.max(14, 2.2 * CC.hexDist(st, m.army.tile, goal.tile));
  }
  function enemyShipsNear(st, me, tile, r) {
    return st.fleets.some((f) => f.owner !== me && CC.atWar(st, me, f.owner) && CC.hexDist(st, f.tile, tile) <= r);
  }
  function* seaCampaign(st, me, goal) {
    const m = mainArmy(st, me);
    if (!m || !goal) return;
    const { army, avail } = m;
    if (attackPower(avail) < cityDefensePower(st, goal) * 1.3 || sum(avail) < 4) return;
    const P = st.players[me];
    const harbors = st.cities.filter((c) => c.owner === me && c.harbor);
    if (!harbors.length) {
      // build a harbor in the coastal town nearest the goal
      const coast = st.cities.filter((c) => c.owner === me && CC.isCoastal(st, c.tile)).sort((a, b) => CC.hexDist(st, a.tile, goal.tile) - CC.hexDist(st, b.tile, goal.tile))[0];
      if (coast && CC.upgradeInfo(st, me, coast.id, 'harbor').ok) CC.upgrade(st, me, coast.id, 'harbor');
      return;
    }
    const here = CC.cityAt(st, army.tile);
    if (!here || here.owner !== me || !here.harbor) {
      // walk through home land toward the nearest harbor
      const mp = CC.movesLeft(army, avail);
      const dj = CC.dijkstra(st, me, army.tile, (i) => CC.passable(st, i) && st.tiles[i].owner === me, { limit: mp, naval: false, zoc: CC.zocFor(st, me, null) });
      const hb = harbors.sort((a, b) => CC.hexDist(st, a.tile, army.tile) - CC.hexDist(st, b.tile, army.tile))[0];
      let best = -1, bd = CC.hexDist(st, army.tile, hb.tile);
      for (let i = 0; i < st.tiles.length; i++) if (dj.dist[i] <= mp && i !== army.tile && CC.hexDist(st, i, hb.tile) < bd) { bd = CC.hexDist(st, i, hb.tile); best = i; }
      if (best >= 0) yield* run(st, me, { armyId: army.id, u: avail, region: [best], dest: best }, 'move');
      return;
    }
    if (enemyShipsNear(st, me, army.tile, RULES.fleetMP)) return; // wait for clear water
    const ok = CC.canEmbark(st, army.id, avail);
    if (!ok.ok || P.gold < ok.cost + 10) return;
    const r = CC.embark(st, army.id, avail);
    if (r.ok) yield { kind: 'embark', report: { tile: here.tile, army: r.army } };
  }
  // transports sail toward the nearest town worth taking and land close to it
  function* transportTurn(st, me, goal) {
    for (const t of st.armies.filter((a) => a.owner === me && a.sea)) {
      if (!CC.getArmy(st, t.id) || CC.movesLeft(t) <= 0) continue;
      const targets = st.cities.filter((c) => c.owner !== me && !CC.atPeace(st, me, c.owner));
      const target = goal && goal.owner !== me ? goal.tile : targets.length ? targets.sort((a, b) => CC.hexDist(st, a.tile, t.tile) - CC.hexDist(st, b.tile, t.tile))[0].tile : null;
      // every shore tile within reach where the army could land
      const reach = CC.seaReach(st, t.id);
      let land = -1, ld = Infinity;
      const tried = new Set();
      for (let w = 0; w < st.tiles.length; w++) {
        if (!(reach.dist[w] >= 0) || reach.dist[w] >= reach.left) continue;
        for (const j of st._nb[w]) {
          if (tried.has(j) || CC.isWater(st, j)) continue;
          tried.add(j);
          if (!CC.planSail(st, t.id, j).valid) continue;
          const d = target == null ? 0 : CC.hexDist(st, j, target) + (st.tiles[j].owner === me ? 0.5 : 0);
          if (d < ld) { ld = d; land = j; }
        }
      }
      let sea = -1, sd = target == null ? Infinity : CC.hexDist(st, t.tile, target);
      if (target != null) for (let i = 0; i < st.tiles.length; i++) {
        if (!(reach.dist[i] > 0) || CC.vesselAt(st, i)) continue;
        const d = CC.hexDist(st, i, target) + (enemyShipsNear(st, me, i, 2) ? 6 : 0);
        if (d < sd) { sd = d; sea = i; }
      }
      const dest = land >= 0 && (ld <= 3 || sea < 0 || ld <= sd) ? land : sea >= 0 ? sea : land;
      if (dest < 0) continue;
      const rep = CC.sailArmy(st, t.id, dest);
      if (!rep.error) yield { kind: 'sail-army', report: rep };
    }
  }

  // ---- fleets: bombard the shore, sink weaker fleets, hold free markets
  function* fleetTurn(st, me) {
    for (const f of st.fleets.filter((x) => x.owner === me)) {
      if (!CC.getFleet(st, f.id)) continue;
      const fire = () => {
        const targets = CC.bombardTargets(st, f.id).sort((a, b) => sum(CC.armyAt(st, b).u) - sum(CC.armyAt(st, a).u));
        if (targets.length) return CC.bombard(st, f.id, targets[0]);
        return null;
      };
      let b = fire();
      if (b && !b.error) yield { kind: 'bombard', report: b };
      if (CC.fleetMovesLeft(f) <= 0) continue;
      const reach = CC.fleetReach(st, f.id);
      let dest = -1;
      // an enemy fleet we can beat
      for (const g of st.fleets) {
        if (g.owner === me || !(reach.dist[g.tile] > 0) || !CC.atWar(st, me, g.owner)) continue;
        if (CC.navalOdds(CC.shipPow(f), CC.shipPow(g)).p >= (CC.isMerchant(f) ? 0.85 : 0.65)) { dest = g.tile; break; }
      }
      // soldiers caught at sea
      if (dest < 0) for (const a of st.armies) {
        if (!a.sea || a.owner === me || !(reach.dist[a.tile] > 0) || !CC.atWar(st, me, a.owner)) continue;
        if (CC.transportOdds(CC.shipPow(f), a.u).p >= 0.6) { dest = a.tile; break; }
      }
      // otherwise the nearest free market, or the water closest to it
      const posts = (st._posts || []).filter((p) => !CC.fleetAt(st, p.tile) && p.tile !== f.tile);
      const onPost = (st._posts || []).some((p) => p.tile === f.tile);
      if (dest < 0 && posts.length && !onPost) {
        const post = posts.sort((a, b) => CC.hexDist(st, a.tile, f.tile) - CC.hexDist(st, b.tile, f.tile))[0];
        if (reach.dist[post.tile] > 0) dest = post.tile;
        else {
          let bd = CC.hexDist(st, f.tile, post.tile);
          for (let i = 0; i < st.tiles.length; i++) if (reach.dist[i] > 0 && !CC.fleetAt(st, i) && CC.hexDist(st, i, post.tile) < bd) { bd = CC.hexDist(st, i, post.tile); dest = i; }
        }
      }
      // the computer cuts the trade of every house it is at war with
      if (!CC.isMerchant(f)) f.block = st.players.filter((P) => P.alive && P.id !== me && CC.atWar(st, me, P.id)).map((P) => P.id);
      if (dest < 0) continue;
      const rep = CC.moveFleet(st, f.id, dest);
      if (rep.error) continue;
      yield { kind: 'sail', report: rep };
      if (CC.getFleet(st, f.id) && !CC.getFleet(st, f.id).fired) { b = fire(); if (b && !b.error) yield { kind: 'bombard', report: b }; }
    }
  }

  function* aiTurn(st) {
    const me = st.cur;
    // offers waiting for this computer house are answered first
    for (const o of st.dip.offers.filter((x) => x.to === me)) respond(st, o.id);
    economy(st, me);
    recruitAll(st, me);
    propose(st, me);
    yield { kind: 'economy' };
    const goal = chooseGoal(st, me);
    // 1) good fights first: towns and enemy stacks we can beat
    for (let step = 0; step < 8 && !st.over; step++) {
      const best = militaryOptions(st, me).find((o) => o.plan.battles.length);
      if (!best) break;
      if (!(yield* run(st, me, best, 'campaign'))) break;
    }
    // 2) the main army closes on the goal
    let mainId = -1;
    if (!st.over) {
      const gm = preferSea(st, me, goal) ? null : goalMove(st, me, goal);
      if (gm) { mainId = gm.armyId; yield* run(st, me, gm, 'campaign'); }
      else { const m = mainArmy(st, me); if (m) mainId = m.army.id; if (preferSea(st, me, goal)) yield* seaCampaign(st, me, goal); }
    }
    // 3) small detachments claim open land with the orders left
    for (let step = 0; step < 8 && !st.over; step++) {
      const best = militaryOptions(st, me).find((o) => o.armyId !== mainId || o.plan.battles.length);
      if (!best) break;
      if (!(yield* run(st, me, best, 'campaign'))) break;
    }
    // 4) everyone else regroups on the main army (or wherever it now stands)
    if (!st.over) {
      const main = st.armies.find((a) => a.owner === me && a.id === mainId && !a.sea) ||
        st.armies.filter((a) => a.owner === me && !a.sea).sort((x, y) => sum(y.u) - sum(x.u))[0];
      if (main) for (const mv of gatherMoves(st, me, main.id)) { if (st.over) break; yield* run(st, me, mv, 'move'); }
    }
    if (!st.over) yield* fleetTurn(st, me);
    if (!st.over) yield* transportTurn(st, me, goal);
    for (let step = 0; step < 4 && !st.over; step++) {
      const mv = stagingMove(st, me);
      if (!mv) break;
      if (!(yield* run(st, me, mv, 'move'))) break;
    }
    if (!st.over) { economy(st, me); recruitAll(st, me); }
    yield { kind: 'done' };
  }

  CC.ai = { respond, offerValue, aiTurn, threatTo, tileValue, militaryOptions, sea: { preferSea, seaCampaign, transportTurn } };
})(typeof window !== 'undefined' ? window : globalThis);
