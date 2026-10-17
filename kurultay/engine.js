/* Kurultay — engine: map generation, rules and combat.
   Plain JS with no DOM access, so it runs in the browser and in a JS shell for tests. */
(function (root) {
  'use strict';
  const CC = (root.CC = root.CC || {});

  // ---------------------------------------------------------------- constants
  // land: how much ground the unit helps seize; needs: the town building that trains it
  const UNITS = [
    // Strengths from Crusader Kings III's men-at-arms: each unit's fighting value is sqrt(damage x toughness), scaled so
    // spearmen (CK3 pikemen, 22 / 24) are 1.2. Archers = bowmen (25 / 10), swordsmen = armored footmen (32 / 22),
    // knights = armored horsemen (100 / 35). Costs follow CK3's prices, with knights a little cheaper for their charge to
    // stay worth it. Archers keep an edge in defence, more so on walls. The counters (spears against knights and so on)
    // follow CK3's: a countered unit loses up to 45% of its punch.
    { key: 'spear', name: 'Spearmen', one: 'Spearman', cost: 5, upkeep: 0.5, att: 1.2, def: 1.2, land: 1,
      desc: 'Cheap line infantry. A spear wall stops a cavalry charge cold, but swordsmen cut through it.' },
    { key: 'archer', name: 'Archers', one: 'Archer', cost: 4, upkeep: 0.4, att: 0.83, def: 1.05, land: 1,
      desc: 'Cheap and fragile in attack, but their volleys hold a defence, and on town walls they fight ×1.6 harder. Knights ride them down in the open.' },
    { key: 'knight', name: 'Knights', one: 'Knight', cost: 13, upkeep: 1, att: 3.09, def: 3.09, land: 2, mounted: true, needs: 'stables',
      desc: 'Heavy cavalry: they ride down archers and swordsmen and march faster, but a spear wall stops them, and forests, hills and walls slow the charge. Need Stables.' },
    { key: 'sword', name: 'Swordsmen', one: 'Swordsman', cost: 6, upkeep: 0.65, att: 1.39, def: 1.39, land: 1, needs: 'barracks',
      desc: 'Armoured foot soldiers, best in attack: they cut through spear lines, but cavalry rides them down. Need Barracks.' },
    { key: 'cannon', name: 'Cannons', one: 'Cannon', cost: 20, upkeep: 1, att: 1.0, def: 0.4, land: 0, siege: true, needs: 'foundry',
      desc: 'Siege guns: ×4 against towns and ×2.5 against outposts, but weak in the open field. An army with cannons walks 1 step less. Need a Foundry.' },
  ];
  const NU = UNITS.length;
  const Z = () => new Array(NU).fill(0);
  const normU = (u) => UNITS.map((_, k) => Math.max(0, (u && u[k]) | 0));

  const TERRAIN = {
    water: { name: 'Sea', passable: false, cost: 0, def: 1 },
    plains: { name: 'Plains', passable: true, cost: 1, def: 1 },
    // defence from CK3's terrain advantage (+5% damage a point; forest +3, hills +5), as soldier-equivalents: sqrt(1 + 0.05 x points)
    // marching cost outside your land from CK3's movement speeds: forest and hills 80% -> 1.25 steps a tile
    forest: { name: 'Forest', passable: true, cost: 1.25, def: 1.07 },
    hills: { name: 'Hills', passable: true, cost: 1.25, def: 1.12 },
    mountain: { name: 'Mountains', passable: false, cost: 0, def: 1 },
    colony: { name: 'Distant land', passable: false, cost: 0, def: 1 },
    desert: { name: 'Desert', passable: false, cost: 0, def: 1 },
  };

  const RULES = {
    startGold: 70,
    capitalIncome: 18, cityIncome: 9, marketIncome: 5, marketLevels: [5, 6, 8], marketTrade: 1, marketTradeMax: 6, // each market level: +1 gold on every trade agreement, at most +6 each
    farmIncome: 4, riverFarmBonus: 2, mineIncome: 9,
    farmCost: 20, mineCost: 35, castleCost: 300,
    outpostCost: 40, outpostUpkeep: 1, outpostDef: 1.32, outpostMilitia: 2, outpostSpacing: 2,
    tilesPerFarm: 5, castleMinDist: 4,
    // walls as CK3 fort levels: a siege needs 100 + 75 per level, taken as sqrt of the extra effort
    walls: { cost: [40, 70, 110], mult: [1, 1.32, 1.58, 1.8] },
    market: { cost: [30, 50, 75] },
    harborCost: 100, stablesCost: 40, barracksCost: 35, foundryCost: 60,
    swordVsSpear: 0.3, cannonCity: 4, cannonTower: 2.5, cannonSlow: 1,
    recruitBase: 6, recruitPerWall: 2,
    riverAtt: 0.82, amphibAtt: 0.63, // CK3: defender +10 across a river, attacker -30 from the sea
    militiaDef: 1.0, archerWallMult: 1.6, // town militia: between spearmen and archers; archers on walls
    knightVsArcher: 0.4, knightCityMult: 0.6, knightRoughMult: 0.7, knightSpearPenalty: 0.45, knightPikeDef: 0.2,
    baseMP: 5, cavalryMP: 7, navalCost: 3, navalRange: 14, navalHop: false,
    zocArmy: 0, zocTown: 1,  // armies hold only their own tile; towns, castles and outposts the 6 around them
    peaceRounds: 5, tributeTurns: 5, tributeMax: 40,
    sizeSlowEvery: 40, sizeSlowMax: 0,   // armies march at the same pace whatever their size (as in CK3)
    fatigueMin: 0, fatigueMax: 2,        // steps a won battle costs: none for a rout, 2 for an even fight
    capBase: 1, capPer: 2, capMax: 16,
    ordersBase: 2, ordersMax: 6,
    score: { tile: 1, farm: 3, mine: 5, city: 12 },
  };

  const COLORS = [
    { name: 'Crimson', hex: '#d63c3c' },
    { name: 'Azure', hex: '#3b7ddd' },
    { name: 'Gold', hex: '#e9b824' },
    { name: 'Violet', hex: '#9459d8' },
    { name: 'Ember', hex: '#ee7b22' },
    { name: 'Teal', hex: '#1db3a3' },
    { name: 'Rose', hex: '#e2589d' },
    { name: 'Ivory', hex: '#efe8d6' },
  ];
  const REBEL = { name: 'Rebels', hex: '#8d877c' };
  // A drawn flag: FLAG_W x FLAG_H cells, one palette digit each. Colour 0 is always the house colour.
  // Flags drawn before were 16 x 10; they are still accepted and doubled up to the new size.
  const FLAG_W = 32, FLAG_H = 20, OLD_FLAG_W = 16, OLD_FLAG_H = 10;
  const FLAG_INKS = [null, '#1d1812', '#f1e7cc', '#e9b824', '#c62f2f', '#2f5fb3', '#2e7d3a', '#6b3fa0'];
  const validFlag = (f) => typeof f === 'string' && (f.length === FLAG_W * FLAG_H || f.length === OLD_FLAG_W * OLD_FLAG_H) && /^[0-7]+$/.test(f) && /[1-7]/.test(f);
  // any valid flag at the current size
  function fullFlag(f) {
    if (!validFlag(f)) return null;
    if (f.length === FLAG_W * FLAG_H) return f;
    if (fullFlag.memo.has(f)) return fullFlag.memo.get(f);
    let out = '';
    for (let y = 0; y < FLAG_H; y++) for (let x = 0; x < FLAG_W; x++) out += f[((y * OLD_FLAG_H / FLAG_H) | 0) * OLD_FLAG_W + ((x * OLD_FLAG_W / FLAG_W) | 0)];
    fullFlag.memo.set(f, out);
    return out;
  }
  fullFlag.memo = new Map();
  const flagPalette = (hex) => FLAG_INKS.map((c, k) => (k ? c : hex));
  function flagOf(st, owner) { const P = owner >= 0 && st.players[owner]; return P && validFlag(P.flag) ? fullFlag(P.flag) : null; }

  const HOUSE_NAMES = ['House Varn', 'House Aldane', 'House Morrow', 'House Kestrel',
    'House Thorne', 'House Ashby', 'House Corwin', 'House Lyle'];

  const CITY_NAMES = ['Ashford', 'Blackmoor', 'Caerwyn', 'Dunmere', 'Eldham', 'Fallowmere', 'Greywatch',
    'Hollowfen', 'Ironhold', 'Kingsbridge', 'Lindmoor', 'Marrowgate', 'Northwick', 'Oakhaven', 'Pendrake',
    'Quarrybrook', 'Ravenscar', 'Stonebury', 'Thornfield', 'Umberhall', 'Valewood', 'Westmarch', 'Yarrowby',
    'Wolfden', 'Highcliff', 'Brightwater', 'Coldharbour', 'Dragonmere', 'Edgemoor', 'Frostholm', 'Goldcrest',
    'Harrowgate', 'Ivywood', 'Larkspire', 'Mistvale', 'Nettlecombe', 'Oldcastle', 'Redmarsh', 'Saltmere',
    'Tidewater', 'Underhill', 'Wyvernhold', 'Ashenvale', 'Briarwood', 'Cindermoor', 'Duskwall', 'Elmstead',
    'Foxhollow', 'Glenhaven', 'Hawksmoor', 'Kettering', 'Lowmarsh', 'Merrowby', 'Rookhaven', 'Sablecross',
    'Tamsworth', 'Wardenfell', 'Amberley', 'Burnholt', 'Crowmere', 'Dovecote', 'Fennick', 'Gallowmere', 'Hartwell'];

  const SIZES = { small: 0.75, normal: 1, large: 1.3 };   // games saved before map scales were stored
  const SIZE_SCALE = { small: 0.4, normal: 0.6, large: 1 }; // new games: clearly different sizes (saves keep their own scale)

  // ---------------------------------------------------------------- RNG
  function mulberry32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Game RNG keeps its state inside the game state, so saves and online sync stay deterministic.
  function rand(st) {
    st.rng = (st.rng + 0x6d2b79f5) | 0;
    let t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- hex grid (pointy-top, odd rows shifted right)
  // Direction order: E, NE, NW, W, SW, SE.
  const DIRS = [
    [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
    [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]],
  ];

  // wrap: the map is a cylinder, its left and right edges joined
  function buildNeighbors(W, H, wrap) {
    const N = W * H, nb6 = new Array(N), nb = new Array(N);
    for (let i = 0; i < N; i++) {
      const c = i % W, r = (i / W) | 0, d = DIRS[r & 1], six = new Array(6);
      for (let k = 0; k < 6; k++) {
        let nc = c + d[k][0];
        const nr = r + d[k][1];
        if (wrap) nc = (nc + W) % W;
        six[k] = nc >= 0 && nc < W && nr >= 0 && nr < H ? nr * W + nc : -1;
      }
      nb6[i] = six;
      nb[i] = six.filter((x) => x >= 0);
    }
    return { nb6, nb };
  }

  const hexDistCore = (W, a, b, wrap) => hexDistW(W, a, b, wrap), diskCore = (W, H, i, R, wrap) => disk(W, H, i, R, wrap);
  function hexDistW(W, a, b, wrap) {
    const ac = a % W, ar = (a / W) | 0, bc = b % W, br = (b / W) | 0;
    const aq = ac - (ar - (ar & 1)) / 2, bq = bc - (br - (br & 1)) / 2;
    const dq = aq - bq, dr = ar - br;
    const d = (q) => Math.max(Math.abs(q), Math.abs(dr), Math.abs(q + dr));
    return wrap ? Math.min(d(dq), d(dq - W), d(dq + W)) : d(dq);
  }

  function disk(W, H, i, R, wrap) {
    const c0 = i % W, r0 = (i / W) | 0, out = [];
    for (let r = Math.max(0, r0 - R); r <= Math.min(H - 1, r0 + R); r++) {
      const seen = new Set();
      for (let c = c0 - R - 1; c <= c0 + R + 1; c++) {
        const cc = wrap ? (c + W) % W : c;
        if (cc < 0 || cc >= W || seen.has(cc)) continue;
        seen.add(cc);
        const j = r * W + cc;
        if (hexDistW(W, i, j, wrap) <= R) out.push(j);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- noise
  function makeNoise(rng) {
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const val = new Float64Array(256);
    for (let i = 0; i < 256; i++) val[i] = rng();
    const lat = (x, y) => val[perm[(perm[x & 255] + y) & 255]];
    const sm = (t) => t * t * (3 - 2 * t);
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
      const a = lat(xi, yi), b = lat(xi + 1, yi), c = lat(xi, yi + 1), d = lat(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    return function fbm(x, y, oct) {
      let s = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) { s += amp * n2(x * f + o * 17.31, y * f + o * 9.13); norm += amp; amp *= 0.5; f *= 2; }
      return s / norm;
    };
  }

  function components(N, nb, pred) {
    const comp = new Int32Array(N).fill(-1), list = [];
    for (let i = 0; i < N; i++) {
      if (comp[i] >= 0 || !pred(i)) continue;
      const id = list.length, q = [i], members = [];
      comp[i] = id;
      while (q.length) {
        const x = q.pop(); members.push(x);
        for (const y of nb[x]) if (comp[y] < 0 && pred(y)) { comp[y] = id; q.push(y); }
      }
      list.push(members);
    }
    return { comp, list };
  }

  // ---------------------------------------------------------------- map generation
  function mapDims(np, size, gen, kind) {
    // size: a name from SIZES (older games) or the scale factor itself
    const mul = typeof size === 'number' ? size : SIZES[size] || 1;
    const land = (80 * np + 110) * mul;
    if (kind === 'world') {
      // the sketch is twice as wide as it is tall; hex rows are 0.866 high
      // drawn larger than a random realm so the coasts read as Europe, with towns to match
      const aspect = (64 / WORLD_SH) * 0.866;
      // the smallest Known World: 30 rows before gen 6; since then it shrinks and grows with the map size too
      const minH = gen >= 6 ? Math.max(22, Math.round(30 * Math.sqrt(mul / 0.6))) : 30;
      const H = Math.max(minH, Math.round(Math.sqrt((land * 1.45) / WORLD_LAND / aspect)));
      return { W: Math.round(H * aspect), H, mul: mul * 1.35 };
    }
    const total = land / (gen >= 3 ? 0.5 : 0.6);
    const H = Math.max(14, Math.round(Math.sqrt(total / 1.4)));
    const W = Math.max(20, Math.round(total / H));
    return { W, H, mul };
  }

  // gen 1: the original maps (kept so older saves rebuild exactly); gen 2: lakes, inland seas and distant markets;
  // gen 3: more ocean and an inland sea opening onto it through a strait. kind 'world': the Known World sketch.
  const MAP_GEN = 7;
  function generateMap(np, size, seed, gen, kind) {
    for (let k = 0; k < 40; k++) {
      const s = (seed + k * 7919) >>> 0;
      const m = tryGenerate(np, size, s, gen, kind);
      if (m) return m;
    }
    throw new Error('Could not generate a map');
  }

  function tryGenerate(np, size, seed, gen, kind) {
    gen = gen || 1;
    const world = kind === 'world';
    SK = sketchOf(gen);
    const wrap = world && gen < 5; // the Known World was a cylinder before gen 5
    const hexDistW = (W_, a, b) => hexDistCore(W_, a, b, wrap), disk = (W_, H_, i, R) => diskCore(W_, H_, i, R, wrap);
    const rng = mulberry32(seed);
    const { W, H, mul } = world ? mapDims(np, size, gen, 'world') : mapDims(np, size, gen >= 3 ? gen : 1);
    const N = W * H;
    const { nb6, nb } = buildNeighbors(W, H, wrap);
    const n1 = makeNoise(rng), n2 = makeNoise(rng), n3 = makeNoise(rng), n4 = makeNoise(rng);
    const elev = new Float64Array(N), ridge = new Float64Array(N), wood = new Float64Array(N);
    const Hp = H * 0.866;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const i = r * W + c, x = c + 0.5 * (r & 1), y = r * 0.866;
        const nx = x / W - 0.5, ny = y / Hp - 0.5;
        let e = 0.55 * n1(x / 6.5, y / 6.5, 4) + 0.45 * n2(x / 3.2, y / 3.2, 3);
        const box = Math.max(Math.abs(nx), Math.abs(ny)) * 2;
        const rad = Math.sqrt(nx * nx + ny * ny) * 1.6;
        e -= 0.5 * Math.pow(Math.max(box, rad * 0.85), 4);
        elev[i] = e;
        ridge[i] = 1 - Math.abs(n3(x / 6, y / 6, 3) * 2 - 1);
        wood[i] = n4(x / 5, y / 5, 3);
      }

    const t = new Array(N);
    let shape = null;
    if (world) shape = worldShape(W, H, t, rng, nb);
    else {
      const byElev = [...Array(N).keys()].sort((a, b) => elev[a] - elev[b]);
      byElev.forEach((i, k) => { t[i] = k < N * (gen >= 3 ? 0.4 : 0.34) ? 'water' : 'plains'; });
    }
    for (let i = 0; i < N; i++) {
      const c = i % W, r = (i / W) | 0;
      if (c === 0 || r === 0 || c === W - 1 || r === H - 1) t[i] = 'water';
    }
    // tidy: drop tiny islands, fill tiny ponds
    let cc = components(N, nb, (i) => t[i] !== 'water');
    for (const m of cc.list) if (m.length < 6) for (const i of m) t[i] = 'water';
    cc = components(N, nb, (i) => t[i] === 'water');
    for (const m of cc.list) {
      const edge = m.some((i) => { const c = i % W, r = (i / W) | 0; return c === 0 || r === 0 || c === W - 1 || r === H - 1; });
      if (!edge && m.length <= 2) for (const i of m) t[i] = 'plains';
    }

    if (world) { /* the sketch has its own seas */ }
    else if (gen >= 3) { if (!carveSeas(W, H, nb, t, elev, seed)) return null; }
    else if (gen >= 2) carveLakes(W, H, nb, t, elev, seed);

    const land = [];
    for (let i = 0; i < N; i++) if (t[i] !== 'water' && t[i] !== 'colony' && t[i] !== 'desert') land.push(i);
    if (land.length < (60 * np + 60) * mul) return null;
    const rankE = new Float64Array(N);
    [...land].sort((a, b) => elev[a] - elev[b]).forEach((i, k) => { rankE[i] = k / land.length; });
    const relief = [...land].sort((a, b) => (0.4 * rankE[b] + 0.6 * ridge[b]) - (0.4 * rankE[a] + 0.6 * ridge[a]));
    relief.forEach((i, k) => {
      if (shape && shape.range[i]) t[i] = 'mountain';
      else if (shape && shape.peak[i]) t[i] = rng() < 0.55 ? 'mountain' : 'hills';
      else if (k < land.length * (world ? 0.03 : 0.07)) t[i] = 'mountain';
      else if (k < land.length * (world ? 0.16 : 0.21)) t[i] = 'hills';
    });
    const flat = land.filter((i) => t[i] === 'plains').sort((a, b) => wood[b] - wood[a]);
    flat.forEach((i, k) => { if (k < flat.length * 0.3) t[i] = 'forest'; });

    // enclosed pockets of passable land too small to matter become mountains
    const passable = (i) => t[i] !== 'water' && t[i] !== 'mountain' && t[i] !== 'colony' && t[i] !== 'desert';
    cc = components(N, nb, passable);
    for (const m of cc.list) if (m.length < 5) for (const i of m) t[i] = 'mountain';

    // rivers: walk downhill from high ground to the sea
    const river = new Uint8Array(N), rivers = [];
    const sources = land.filter((i) => t[i] === 'hills' || t[i] === 'mountain');
    for (let i = sources.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = sources[i]; sources[i] = sources[j]; sources[j] = x; }
    const want = Math.max(2, Math.round(land.length / 120));
    for (const src of sources) {
      if (rivers.length >= want) break;
      if (disk(W, H, src, 2).some((j) => river[j])) continue;
      const path = [src], seen = new Set([src]);
      let cur = src, ok = false;
      for (let step = 0; step < 22; step++) {
        // never run alongside another river: only touch one where we join it
        const options = nb[cur].filter((j) => !seen.has(j) && t[j] !== 'colony' && t[j] !== 'desert' && (t[j] !== 'mountain' || t[cur] === 'mountain') &&
          (river[j] || t[j] === 'water' || !nb[j].some((x) => river[x] && !seen.has(x))));
        if (!options.length) break;
        options.sort((a, b) => elev[a] - elev[b]);
        const nx = options[0];
        path.push(nx); seen.add(nx);
        if (t[nx] === 'water' || river[nx]) { ok = true; break; }
        cur = nx;
      }
      const landSteps = path.filter((j) => t[j] !== 'water' && t[j] !== 'mountain' && !river[j]).length;
      if (!ok || landSteps < 4) continue;
      for (const j of path) if (t[j] !== 'water' && t[j] !== 'mountain') river[j] = 1;
      rivers.push(path);
    }

    // player starts: spread far apart on the largest landmass when possible
    cc = components(N, nb, passable);
    const main = cc.list.reduce((a, b) => (b.length > a.length ? b : a), []);
    const totalPass = cc.list.reduce((s, m) => s + m.length, 0);
    const mainId = cc.comp[main[0]];
    const passCount = (i, R) => disk(W, H, i, R).filter(passable).length;
    let cands = [];
    for (let i = 0; i < N; i++) {
      const c = i % W, r = (i / W) | 0;
      if (!passable(i) || t[i] === 'hills' || c < 2 || r < 2 || c > W - 3 || r > H - 3) continue;
      if (main.length >= totalPass * 0.6 && cc.comp[i] !== mainId) continue;
      if (passCount(i, 2) >= 14 && passCount(i, 1) >= 6) cands.push(i);
    }
    if (cands.length < np * 3) return null;
    let best = null, bestScore = -1;
    for (let trial = 0; trial < 60; trial++) {
      const set = [cands[Math.floor(rng() * cands.length)]];
      while (set.length < np) {
        let pick = -1, pd = -1;
        for (const c of cands) {
          let d = Infinity;
          for (const s of set) d = Math.min(d, hexDistW(W, c, s));
          d += rng() * 1.5;
          if (d > pd) { pd = d; pick = c; }
        }
        set.push(pick);
      }
      let md = Infinity;
      for (let a = 0; a < set.length; a++) for (let b = a + 1; b < set.length; b++) md = Math.min(md, hexDistW(W, set[a], set[b]));
      if (md > bestScore) { bestScore = md; best = set; }
    }
    if (bestScore < 6) return null;
    const starts = best;

    // neutral (rebel) towns fill the gaps between players
    const nNeutral = Math.max(np + 1, Math.round((np * 1.4 + 2) * mul));
    const cityTiles = starts.slice();
    const neutralCands = [];
    for (let i = 0; i < N; i++) if (passable(i) && passCount(i, 1) >= 5) neutralCands.push(i);
    const neutrals = [];
    for (let k = 0; k < nNeutral; k++) {
      let pick = -1, pd = -1;
      for (const c of neutralCands) {
        let d = Infinity;
        for (const s of cityTiles) d = Math.min(d, hexDistW(W, c, s));
        if (d < 4) continue;
        const sc = d + rng() * 2;
        if (sc > pd) { pd = sc; pick = c; }
      }
      if (pick < 0) break;
      cityTiles.push(pick);
      const walls = [0, 0, 1, 1, 2][Math.floor(rng() * 5)];
      const spear = 1 + Math.floor(rng() * 3) + walls;
      const archer = walls >= 1 ? 1 : Math.floor(rng() * 2);
      neutrals.push({ tile: pick, walls, u: [spear, archer, 0] });
    }

    // gold deposits: outside starting lands, favouring hills
    const gold = new Uint8Array(N);
    const isCity = new Set(cityTiles);
    const nearStart = (i, R) => starts.some((s) => hexDistW(W, s, i) <= R);
    const goldOk = (i) => passable(i) && !isCity.has(i) && !gold[i] && !nb[i].some((j) => gold[j]);
    const nGold = Math.round(land.length / 26);
    const pool = [];
    for (let i = 0; i < N; i++) if (passable(i) && !isCity.has(i) && !nearStart(i, 2)) pool.push(i);
    for (let k = 0, guard = 0; k < nGold && guard < 4000; guard++) {
      const i = pool[Math.floor(rng() * pool.length)];
      const w = t[i] === 'hills' ? 1 : t[i] === 'forest' ? 0.4 : 0.25;
      if (rng() > w || !goldOk(i)) continue;
      gold[i] = 1; k++;
    }
    for (const s of starts) {
      if (disk(W, H, s, 4).some((i) => gold[i] && hexDistW(W, s, i) >= 3)) continue;
      const ring = disk(W, H, s, 4).filter((i) => hexDistW(W, s, i) >= 3 && goldOk(i));
      if (ring.length) gold[ring[Math.floor(rng() * ring.length)]] = 1;
    }

    let names = CITY_NAMES.slice();
    if (world) names = worldNames(W, H, starts.concat(neutrals.map((n) => n.tile)), rng);
    else for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = names[i]; names[i] = names[j]; names[j] = x; }
    const variation = [];
    for (let i = 0; i < N; i++) variation.push(rng());

    let posts = [], regions = [], lanes = [];
    if (world) ({ posts, regions, lanes } = colonyPosts(W, H, nb, t, shape.col, gen >= 6 ? worldPostPick(np, mul, gen >= 7 ? starts.length + neutrals.length : 0) : null));
    else if (gen >= 2) { posts = placeMarkets(W, H, nb, t, np, seed); lanes = realmLanes(W, H, nb, t, posts, seed); }
    if (gen >= 7) for (const p of posts) p.guard = postGuard(p);
    return { W, H, seed, gen, kind: world ? 'world' : 'realm', t, river, gold, elev: Array.from(elev), variation, rivers, starts, neutrals, names, posts, regions, lanes, nb6, nb };
  }

  // ---------------------------------------------------------------- the Known World
  // A stylised Europe, Mediterranean, North Africa, Levant and western Russia on a 64 x 32 sketch. Colonial lands
  // at the left and right edges cannot be entered; ships trade at posts off their coasts.
  const WORLD_LAND = 0.265; // share of the sketch that is open land
  const WORLD = {
    land: [
      [[14, 16], [18, 15.4], [21.5, 15.6], [22.4, 17.4], [20.5, 20.6], [17.5, 21.6], [14.6, 21], [13.8, 18.5]], // Iberia
      [[17.6, 10.8], [20, 10], [23.4, 9.4], [25.6, 11], [26, 15.8], [22.8, 17.6], [19.2, 16.6], [18.4, 14], [16.6, 12.4]], // France
      [[22.4, 9.4], [26, 8.2], [30, 8.4], [33, 7.4], [37.4, 8], [37.6, 14.2], [33, 14.6], [29, 14.4], [25.6, 13.6], [24.2, 10.6]], // Germany and Poland
      [[25.4, 14.4], [29.2, 14.4], [30.4, 16.6], [32.8, 19.6], [32.2, 21.2], [30.8, 20.6], [29.6, 19.4], [27.2, 17.2]], // Italy
      [[29.8, 13.8], [37.6, 13.6], [38.8, 17.6], [37.2, 19.2], [36.4, 22.2], [35.2, 23.8], [33.6, 22.4], [32.6, 19.4], [31, 16.6]], // Balkans and Greece
      [[33, 7.6], [35.6, 2.6], [40, 1.6], [54.6, 1.6], [55.4, 13], [37.6, 13.4]], // Russia
      [[37, 12.4], [47.4, 12.4], [47.4, 18.2], [37, 18.2]], // the Pontic shores, cut by the Black Sea
      [[24.8, 6.6], [26.6, 3.2], [30.6, 1.2], [35.6, 1], [36.4, 2.4], [34.2, 4.2], [32.4, 5.6], [31.6, 8], [29.4, 8.6], [27, 7.8]], // Scandinavia
      [[37.4, 18], [40, 17.4], [46, 16.8], [49.6, 17.4], [49.6, 20.8], [46, 21.6], [41, 22.2], [37.8, 21.2]], // Anatolia
      [[47, 12.6], [55.4, 12.6], [55.6, 20.2], [50, 21], [49.4, 17.6]], // Caucasus and Persia
      [[45.8, 20.6], [49.6, 20.6], [49.8, 25], [48.4, 27.6], [46.6, 27.6], [45.8, 23.2]], // Levant
      [[15, 24.2], [18.4, 23.6], [22, 24.8], [27, 24.2], [30.4, 25.4], [34, 26.6], [38, 27.2], [42, 26.6], [46.6, 26], [48, 27.6], [48, 30], [15, 30]], // North Africa and Egypt
      [[14.6, 5.4], [16.6, 4.4], [17.8, 7], [18.8, 9.6], [17.2, 10.4], [15, 10.2], [15.6, 8]], // Britain
      [[11.8, 7.6], [13.6, 7], [14.2, 8.6], [12.6, 9.8]], // Ireland
      [[24.4, 17.6], [25.6, 17.6], [25.6, 21], [24.4, 21]], // Corsica and Sardinia
      [[28, 22], [31, 22], [30.6, 23.4], [28.4, 23.2]], // Sicily
      [[35, 24.6], [38.4, 24.6], [38.2, 25.4], [35.2, 25.4]], // Crete
      [[43, 22.6], [45.4, 22.6], [45.2, 23.6], [43.2, 23.4]], // Cyprus
    ],
    sea: [
      [[31.6, 5.4], [34.6, 3.4], [36.4, 4.8], [36, 8.4], [33.4, 8.8], [31.8, 7.6]], // Baltic
      [[38.6, 14.4], [41, 13.4], [45, 13.4], [46.6, 14.6], [46, 16.4], [42, 16.8], [39, 16.4]], // Black Sea
      [[38.4, 16], [39.2, 16.2], [38.6, 18.6], [37.6, 18.8]], // Bosporus
      [[51.4, 13.6], [53.6, 13.6], [53.8, 18.6], [51.4, 18.8]], // Caspian
      [[47.8, 27.4], [48.8, 27.4], [51.2, 34.2], [49.6, 34.4]], // Red Sea
      [[18.6, 6], [22.6, 6.6], [24.6, 8.6], [22.4, 9.6], [18.8, 9.4]], // North Sea
      [[15, 12], [18, 11.4], [18.4, 14.6], [15, 15.2]], // Bay of Biscay
    ],
    peaks: [
      [[23.6, 13.6], [29, 13.4], [29.4, 15], [24, 15.2]], // Alps
      [[17.6, 15.6], [21.2, 15.4], [21.2, 16.4], [17.6, 16.6]], // Pyrenees
      [[31.4, 11.2], [35, 11.4], [34.6, 12.6], [31.2, 12.6]], // Carpathians
      [[16, 25.6], [23, 26], [23, 27.2], [16, 27]], // Atlas
      [[46.4, 14.6], [49.6, 14.6], [49.6, 16], [46.4, 16]], // Caucasus
      [[27.6, 2.6], [30.6, 1.8], [31, 4.6], [28.6, 5.6]], // Scandinavian mountains
    ],
    // lands beyond reach; each trading post is a single sea tile (at the sketch point given) where a fleet docks
    colonies: [
      { name: 'The Americas', posts: [['the New World', 14, 8.9, 9.6], ['Brazil', 16, 8.9, 22.6]],
        poly: [[1, 1.6], [7.6, 1.6], [8.4, 6], [6.6, 10], [7.4, 13], [5.8, 15.2], [5, 16.6], [6, 17.6], [7.6, 19.4], [8.4, 23.4], [7, 28], [5.4, 33], [3.6, 38.8], [1, 38.8]] },
      { name: 'Africa', posts: [['the Gold Coast', 15, 16, 34.6], ['Zanzibar', 13, 50, 37]],
        poly: [[7.6, 27.6], [12, 26], [14.8, 28.4], [47.8, 29.2], [47.8, 32.6], [49.6, 34.6], [53.6, 35.2], [51, 37.8], [46, 39.2], [38, 40.6], [33, 40.6], [28.6, 37.8], [24.6, 35.6], [19, 34.2], [13, 33.8], [9.4, 31.6]] },
      { name: 'Arabia', posts: [['Aden', 13, 54.8, 34]], poly: [[50.4, 27.6], [55, 21.8], [57, 24], [56.4, 30], [54.4, 33.4], [51.6, 33.2]] },
      { name: 'India', posts: [['Calicut', 20, 57, 27]], poly: [[57.6, 17.8], [63, 16.8], [63, 36], [61, 38.4], [59.6, 34], [57.6, 27]] },
      { name: 'Cathay', posts: [['Canton', 20, 55.9, 7]], poly: [[57, 1.4], [63, 1.4], [63, 11.4], [58.4, 12], [56.4, 8]] },
    ],
    // narrow seas that must stay open whatever the coastline does
    straits: [[[13.2, 22.9], [16.6, 22.9]], [[39.6, 16], [37.4, 19.8]], [[49.8, 32.8], [51.6, 34.8]]],
    // sea lanes: fixed shipping routes between straits, capes and the trading posts; they share stretches where they meet
    nodes: {
      gib: [14.4, 22.9], medW: [20, 22.6], medC: [26.6, 23.6], medE: [39, 24.2], levant: [44.4, 25], aegean: [37, 21.6], pontus: [42, 15.2],
      atlN: [12.6, 12.4], atlM: [10.6, 17.5], atlS: [11, 24], channel: [19.6, 7.6], baltic: [33.4, 6.6], arcticW: [27, 0.4], arcticE: [55.8, 0.4],
      guinea: [16, 36], capeW: [24, 39.8], cape: [36, 39.8], eastAf: [48, 38.4], red: [49.4, 30], aden: [53, 34.4], arab: [57.2, 31], silk: [56, 14.6], pacific: [0.3, 8],
    },
    lanes: [
      ['gib', 'medW'], ['medW', 'medC'], ['medC', 'medE'], ['medE', 'levant'], ['medE', 'aegean'], ['aegean', 'pontus'],
      ['gib', 'atlS'], ['atlS', 'atlM'], ['atlM', 'atlN'], ['atlN', 'channel'], ['channel', 'baltic'], ['channel', 'arcticW'], ['arcticW', 'arcticE'],
      ['atlN', 'the New World'], ['atlM', 'Brazil'], ['atlS', 'guinea'], ['guinea', 'the Gold Coast'], ['guinea', 'capeW'], ['capeW', 'cape'], ['cape', 'eastAf'],
      ['eastAf', 'Zanzibar'], ['eastAf', 'aden'], ['red', 'aden'], ['aden', 'Aden'], ['aden', 'arab'], ['arab', 'Calicut'], ['Calicut', 'silk'], ['silk', 'Canton'],
      ['arcticE', 'Canton'], ['Canton', 'pacific'], ['pacific', 'the New World'],
    ],
    // towns take the name of the nearest place on the sketch
    places: [
      ['Lisboa', 14.8, 19.4], ['Toledo', 18, 18.4], ['Barcelona', 21.4, 17], ['Sevilla', 16.4, 20.6], ['Leon', 16, 16.6], ['Paris', 21.2, 12], ['Bordeaux', 19.2, 14.6],
      ['Lyon', 22.6, 14.6], ['London', 17, 8.8], ['York', 16.4, 6.6], ['Dublin', 13, 8.2], ['Brugge', 23.4, 10.2], ['Koln', 25, 11.2], ['Hamburg', 27, 9.2],
      ['Praha', 28.6, 11.8], ['Wien', 30.4, 13], ['Krakow', 33.4, 11.4], ['Lubeck', 28.8, 8.8], ['Danzig', 32, 8.6], ['Riga', 34.4, 6], ['Novgorod', 38, 4],
      ['Moskva', 43.4, 6.6], ['Kyiv', 39.6, 10.8], ['Sarai', 50, 9.6], ['Kazan', 49, 4.4], ['Stockholm', 31.4, 4.6], ['Oslo', 27.6, 3.8], ['Roma', 28.6, 18.8],
      ['Venezia', 28.4, 15], ['Milano', 26.4, 15.4], ['Napoli', 30, 20], ['Marseille', 23.4, 17], ['Buda', 32.4, 13.6], ['Beograd', 33.4, 16.2], ['Athenai', 35, 22],
      ['Thessalonike', 35, 19.2], ['Konstantinopolis', 38.2, 18.4], ['Ankara', 42, 19.4], ['Trebizond', 45.2, 17.6], ['Antioch', 46.2, 21], ['Damascus', 47.6, 23.4],
      ['Jerusalem', 47, 25.4], ['Alexandria', 43.4, 27], ['Cairo', 45.6, 28], ['Tunis', 27.2, 25], ['Algiers', 21.4, 25.6], ['Fez', 16.6, 26.2], ['Tripoli', 33, 27.4],
      ['Tbilisi', 48.4, 16.4], ['Tabriz', 50.4, 19.4], ['Kaffa', 42.6, 13], ['Sicilia', 29.4, 22.6], ['Candia', 36.6, 25], ['Nicosia', 44.2, 23], ['Palermo', 28.6, 22.4],
      ['Granada', 18, 20.6], ['Smolensk', 39.6, 7.6], ['Tver', 41.6, 4.6], ['Bergen', 26, 4.6], ['Edinburgh', 15.6, 5.4], ['Pisa', 27, 16.4], ['Ragusa', 32.4, 17.6],
    ],
  };
  function inPoly(poly, x, y) {
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
    return inside;
  }
  // sketch coordinates of a tile, before any wobble
  // gen 4: the colonies become trade theaters across open ocean. Europe ends well short of them, the Atlantic
  // runs open from the Arctic to the Cape, and each distant land has several posts along its coasts.
  const WORLD4 = Object.assign({}, WORLD, {
    land: WORLD.land.map((poly, k) => [
      null, null, null, null, null,
      [[33, 7.6], [35.6, 2.6], [40, 1.6], [50.6, 1.6], [51, 13], [37.6, 13.4]], // Russia, ending at the Volga
      null, null, null,
      [[47, 12.6], [51.4, 12.6], [52, 20.4], [50, 21], [49.4, 17.6]], // Caucasus and Persia
      null,
      [[15, 24.2], [18.4, 23.6], [22, 24.8], [27, 24.2], [30.4, 25.4], [34, 26.6], [38, 27.2], [42, 26.6], [46.6, 26], [48, 27.6], [48, 33.4], [14, 33.4]], // North Africa, Egypt and the Sahara
    ][k] || poly),
    sea: [
      [[31.6, 5.4], [34.6, 3.4], [36.4, 4.8], [36, 8.4], [33.4, 8.8], [31.8, 7.6]], // Baltic
      [[38.6, 14.4], [41, 13.4], [45, 13.4], [46.6, 14.6], [46, 16.4], [42, 16.8], [39, 16.4]], // Black Sea
      [[38.4, 16], [39.2, 16.2], [38.6, 18.6], [37.6, 18.8]], // Bosporus
      [[49.8, 13.4], [51, 13.4], [51, 17.4], [49.9, 17.6]], // Caspian
      [[47.8, 27.4], [48.8, 27.4], [51.2, 34.2], [49.6, 34.4]], // Red Sea
      [[18.6, 6], [22.6, 6.6], [24.6, 8.6], [22.4, 9.6], [18.8, 9.4]], // North Sea
      [[15, 12], [18, 11.4], [18.4, 14.6], [15, 15.2]], // Bay of Biscay
    ],
    peaks: [
      [[23.6, 13.6], [29, 13.4], [29.4, 15], [24, 15.2]], // Alps
      [[17.6, 15.6], [21.2, 15.4], [21.2, 16.4], [17.6, 16.6]], // Pyrenees
      [[31.4, 11.2], [35, 11.4], [34.6, 12.6], [31.2, 12.6]], // Carpathians
      [[16, 25.6], [23, 26], [23, 27.2], [16, 27]], // Atlas
      [[46.4, 14.6], [49.4, 14.6], [49.4, 16], [46.4, 16]], // Caucasus
      [[27.6, 2.6], [30.6, 1.8], [31, 4.6], [28.6, 5.6]], // Scandinavian mountains
    ],
    deserts: [[[13.6, 29.6], [49, 29.2], [49, 33.8], [13.6, 33.8]]], // the Sahara: no army crosses it
    colonies: [
      { name: 'The Americas', posts: [['Newfoundland', 11, 8, 5], ['the Caribbean', 18, 7.4, 14.6], ['Brazil', 16, 7.8, 23.4], ['the River Plate', 12, 7, 33]],
        poly: [[1.4, 1.6], [6.4, 1.6], [7, 6], [5.8, 10], [6.4, 13], [5.2, 16], [6.2, 19.4], [6.8, 23.4], [6, 28], [4.8, 33], [3.4, 38.6], [1.4, 38.6]] },
      { name: 'Africa', posts: [['Senegal', 11, 10.4, 34.6], ['the Gold Coast', 15, 22, 39.4], ['Zanzibar', 13, 52.8, 37]],
        poly: [[11.8, 32.2], [47.6, 32.2], [49, 33.8], [51.8, 35.8], [51.4, 37.4], [46, 38.6], [20, 38.6], [13.4, 37.4], [11.8, 34.8]] },
      { name: 'Arabia', posts: [['Aden', 13, 54.2, 34.2], ['Hormuz', 14, 55, 23.4]], poly: [[53, 27], [54, 24.4], [55.6, 24.6], [55.8, 30], [54.6, 33.2], [53.4, 32.8]] },
      { name: 'India', posts: [['Gujarat', 15, 57.4, 21], ['Calicut', 20, 57.6, 30], ['Bengal', 17, 62.6, 24]], poly: [[58.4, 18.4], [61.6, 17.6], [61.6, 34], [60.4, 37.6], [58.8, 33], [58, 26]] },
      { name: 'Cathay', posts: [['Tartary', 11, 54.6, 4.4], ['Peking', 17, 55, 11], ['Canton', 20, 62.6, 9]], poly: [[56, 1.4], [61.6, 1.4], [61.6, 12.4], [57.6, 13], [55.8, 8.4]] },
    ],
    straits: [[[13.2, 22.9], [16.6, 22.9]], [[39.6, 16], [37.4, 19.8]], [[49.8, 32.8], [51.6, 34.8]], [[7.4, 27], [11.4, 29]], [[52.6, 21.6], [56.4, 22.2]]],
    nodes: {
      gib: [14.4, 22.9], medW: [20, 22.6], medC: [26.6, 23.6], medE: [39, 24.2], levant: [44.4, 25], aegean: [37, 21.6], pontus: [42, 15.2],
      atlN: [10, 10], atlM: [9.6, 17.5], atlS: [10.4, 26], channel: [19.6, 7.6], baltic: [33.4, 6.6], arcticW: [27, 0.4], arcticE: [53.4, 0.4],
      westAf: [9.6, 33], capeW: [24, 39.6], cape: [38, 39.6], eastAf: [55, 38.6], red: [49.4, 30], aden: [54.6, 35.4], indian: [57.4, 34],
      silk: [56.4, 15.4], pacific: [63.4, 16],
    },
    lanes: [
      ['gib', 'medW'], ['medW', 'medC'], ['medC', 'medE'], ['medE', 'levant'], ['medE', 'aegean'], ['aegean', 'pontus'],
      ['gib', 'atlS'], ['atlS', 'atlM'], ['atlM', 'atlN'], ['atlN', 'channel'], ['channel', 'baltic'], ['channel', 'arcticW'], ['arcticW', 'arcticE'],
      ['atlN', 'Newfoundland'], ['atlM', 'the Caribbean'], ['atlS', 'Brazil'], ['atlS', 'westAf'], ['westAf', 'Senegal'], ['westAf', 'the River Plate'],
      ['westAf', 'capeW'], ['capeW', 'the Gold Coast'], ['capeW', 'cape'], ['cape', 'eastAf'], ['eastAf', 'Zanzibar'], ['eastAf', 'aden'], ['red', 'aden'],
      ['aden', 'Aden'], ['aden', 'indian'], ['Hormuz', 'Gujarat'], ['indian', 'Calicut'], ['Calicut', 'Gujarat'], ['Gujarat', 'silk'], ['silk', 'Peking'],
      ['arcticE', 'Tartary'], ['Tartary', 'Peking'], ['arcticE', 'Canton'], ['Canton', 'pacific'], ['pacific', 'Bengal'],
    ],
  });
  // gen 5: the map no longer wraps, and Asia is one landmass as on a real map. The distant lands still cannot be
  // entered: the Urals, the Arabian desert and the deserts of Central Asia stand between them and the playable lands.
  const WORLD5 = Object.assign({}, WORLD4, {
    land: WORLD4.land.concat([
      [[50.2, 1.6], [52.6, 1.6], [52.6, 12.4], [50.6, 13]], // the Urals
      [[51, 12.2], [56.6, 12.2], [56.6, 22.4], [52, 22], [51.6, 20.4]], // the deserts of Central Asia
      [[49.4, 20.6], [52.2, 20.6], [52.6, 24.6], [50.6, 26.2], [49.2, 27.6], [48.6, 27.4], [49.8, 25]], // the Arabian desert
    ]),
    sea: WORLD4.sea.concat([
      [[52.2, 22.2], [55.4, 22.6], [56.4, 23.6], [56.2, 24.8], [55, 25], [52.8, 24]], // Persian Gulf
    ]),
    ranges: [[[50.2, 1.6], [52.6, 1.6], [52.6, 12.4], [50.6, 13]]], // the Urals: mountains no army crosses
    deserts: WORLD4.deserts.concat([
      [[51, 12.2], [56.6, 12.2], [56.6, 22.4], [52, 22], [51.6, 20.4]],
      [[49.4, 20.6], [52.2, 20.6], [52.6, 24.6], [50.6, 26.2], [49.2, 27.6], [48.6, 27.4], [49.8, 25]],
    ]),
    // posts pay well, since each needs a harbor and a warship kept there (2 a turn): the farther from Europe, the richer
    colonies: [
      { name: 'The Americas', poly: WORLD4.colonies[0].poly,
        posts: [['Newfoundland', 11, 8, 5], ['New England', 13, 7.4, 9.6], ['the Caribbean', 18, 7.4, 14.6], ['New Spain', 16, 7.2, 18.8],
          ['Brazil', 16, 7.8, 23.4], ['Bahia', 13, 7.4, 28.2], ['the River Plate', 12, 7, 33]] },
      { name: 'Africa', poly: WORLD4.colonies[1].poly, posts: [['Senegal', 11, 10.4, 34.6], ['the Gold Coast', 15, 22, 39.4], ['Zanzibar', 13, 52.8, 37]] },
      { name: 'Arabia', posts: [['Aden', 13, 53.6, 34.6], ['Hormuz', 14, 56.2, 27.4]],
        poly: [[50, 26.2], [52.4, 24.4], [55.4, 25.4], [55.4, 29.4], [54.4, 33.4], [51.6, 33.8], [49.6, 28]] },
      { name: 'India', posts: [['Gujarat', 15, 57.2, 25.4], ['Calicut', 20, 57.8, 31], ['Bengal', 17, 62.6, 22]],
        poly: [[56.4, 14.4], [61.6, 14.4], [61.6, 24], [60.4, 28], [59.6, 34.4], [58.8, 34.4], [58, 28], [58, 24.4], [56.6, 22.4]] },
      { name: 'Cathay', posts: [['Tartary', 11, 57, 0.4], ['Peking', 17, 62.6, 7], ['Canton', 20, 62.6, 12.6]],
        poly: [[52.4, 1.4], [61.6, 1.4], [61.6, 14.4], [56.4, 14.4], [56.6, 12.2], [52.4, 12.4]] },
    ],
    straits: WORLD4.straits.slice(0, 4).concat([[[55.6, 24.4], [56.8, 27]]]),
    nodes: Object.fromEntries(Object.entries(Object.assign({}, WORLD4.nodes, { indian: [56.8, 34], ceylon: [60.8, 36.4] })).filter(([k]) => k !== 'silk')),
    lanes: [
      ['gib', 'medW'], ['medW', 'medC'], ['medC', 'medE'], ['medE', 'levant'], ['medE', 'aegean'], ['aegean', 'pontus'],
      ['gib', 'atlS'], ['atlS', 'atlM'], ['atlM', 'atlN'], ['atlN', 'channel'], ['channel', 'baltic'], ['channel', 'arcticW'], ['arcticW', 'arcticE'],
      ['atlN', 'Newfoundland'], ['atlN', 'New England'], ['atlM', 'the Caribbean'], ['atlM', 'New Spain'], ['atlS', 'Brazil'], ['atlS', 'Bahia'], ['atlS', 'westAf'],
      ['westAf', 'Senegal'], ['westAf', 'the River Plate'],
      ['westAf', 'capeW'], ['capeW', 'the Gold Coast'], ['capeW', 'cape'], ['cape', 'eastAf'], ['eastAf', 'Zanzibar'], ['eastAf', 'aden'], ['red', 'aden'],
      ['aden', 'Aden'], ['aden', 'indian'], ['indian', 'Hormuz'], ['Hormuz', 'Gujarat'], ['indian', 'Calicut'], ['indian', 'ceylon'], ['ceylon', 'Bengal'],
      ['arcticE', 'Tartary'], ['Tartary', 'Peking'], ['Peking', 'Canton'], ['Canton', 'pacific'], ['pacific', 'Bengal'],
    ],
  });
  const sketchOf = (gen) => (gen >= 5 ? WORLD5 : gen >= 4 ? WORLD4 : WORLD);
  let SK = WORLD; // the sketch in use while a map is generated
  const WORLD_SH = 40; // the sketch is 64 wide and this tall
  const worldXY = (W, H, i) => { const c = i % W, r = (i / W) | 0; return [((c + 0.5 + 0.5 * (r & 1)) / W) * 64, ((r + 0.5) / H) * WORLD_SH]; };
  // fills t with water, plains (land), 'peak' marks and colony land; returns colony index per tile (-1 elsewhere)
  function worldShape(W, H, t, rng, nb) {
    const N = W * H, wx = makeNoise(rng), wy = makeNoise(rng), col = new Int8Array(N).fill(-1), peak = new Uint8Array(N), range = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      let [x, y] = worldXY(W, H, i);
      x += (wx(x / 2.6, y / 2.6, 3) - 0.5) * 0.9; y += (wy(x / 2.6, y / 2.6, 3) - 0.5) * 0.9;
      let kind = 'water';
      const ci = SK.colonies.findIndex((c) => inPoly(c.poly, x, y));
      if (SK.sea.some((p) => inPoly(p, x, y))) { /* inland seas stay water */ }
      else if (ci >= 0) { kind = 'colony'; col[i] = ci; }
      else if (SK.land.some((p) => inPoly(p, x, y))) {
        kind = 'plains';
        if ((SK.deserts || []).some((p) => inPoly(p, x, y))) kind = 'desert';
        else if ((SK.ranges || []).some((p) => inPoly(p, x, y))) range[i] = 1;
        else if (SK.peaks.some((p) => inPoly(p, x, y))) peak[i] = 1;
      }
      t[i] = kind;
    }
    // the straits stay open
    const half = (0.6 * 64) / W;
    const segDist = ([ax, ay], [bx, by], x, y) => { const dx = bx - ax, dy = by - ay, k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(ax + k * dx - x, ay + k * dy - y); };
    for (let i = 0; i < N; i++) {
      const [x, y] = worldXY(W, H, i);
      if (SK.straits.some(([a, b]) => segDist(a, b, x, y) < half)) { t[i] = 'water'; col[i] = -1; peak[i] = 0; range[i] = 0; }
    }
    // each colonial land is one piece: stray scraps go back to the sea
    SK.colonies.forEach((_, ci) => {
      const cc = components(N, nb, (i) => col[i] === ci);
      const big = cc.list.reduce((a, b) => (b.length > a.length ? b : a), []);
      for (const m of cc.list) if (m !== big) for (const i of m) { t[i] = 'water'; col[i] = -1; }
    });
    return { col, peak, range };
  }
  // town names by nearest sketch place; the rest from the usual list
  function worldNames(W, H, tiles, rng) {
    const used = new Set(), out = [];
    for (const i of tiles) {
      const [x, y] = worldXY(W, H, i);
      let best = null, bd = 4.6;
      for (const [n, px, py] of SK.places) { if (used.has(n)) continue; const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = n; } }
      if (best) used.add(best);
      out.push(best);
    }
    const rest = SK.places.map((p) => p[0]).filter((n) => !used.has(n)).concat(CITY_NAMES);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = rest[i]; rest[i] = rest[j]; rest[j] = x; }
    let k = 0;
    return out.map((n) => n || rest[k++]).concat(rest.slice(k));
  }
  // the ocean: water joined to the map's edge
  function oceanMask(W, H, nb, t) {
    const N = W * H, ocean = new Uint8Array(N), q = [0];
    ocean[0] = 1;
    for (let h = 0; h < q.length; h++) for (const j of nb[q[h]]) if (!ocean[j] && t[j] === 'water') { ocean[j] = 1; q.push(j); }
    return ocean;
  }
  // nearest ocean tile to a sketch point (ok: extra test)
  function worldWaterNear(W, H, ocean, x, y, ok) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < W * H; i++) {
      if (!ocean[i] || (ok && !ok(i))) continue;
      const [px, py] = worldXY(W, H, i), d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // one trading post per colony: the ocean tile on its coast nearest the sketch's port
  // gen 6: fewer trading posts for fewer houses and smaller maps (all 18 for 8 houses on a normal map), taken in
  // turn from the western and the eastern distant lands, so both sides of the map keep their share
  const POSTS_WEST = ['the Caribbean', 'the Gold Coast', 'Brazil', 'Newfoundland', 'Senegal', 'the River Plate', 'New Spain', 'New England', 'Bahia'];
  const POSTS_EAST = ['Calicut', 'Canton', 'Aden', 'Bengal', 'Zanzibar', 'Peking', 'Hormuz', 'Gujarat', 'Tartary'];
  // gen 7: in step with the towns on the map at the start (8 houses on a normal map: 19 towns, all 18 posts);
  // gen 6 used the houses and the map size directly
  const POSTS_PER_TOWN = 18 / 19;
  // trading posts pay three quarters of the sketch's value (about one town's gold for a merchant ship)
  const POST_VALUE = 0.75;
  // gen 7: the richest posts are defended by local forts and war canoes, measured in warships. The Asian lands hold
  // two, the best posts elsewhere one; poorer posts are open. A fleet must beat the defences once to trade there.
  const GUARDED_LANDS = new Set(['Arabia', 'India', 'Cathay']);
  const postGuard = (p) => (p.colony ? (GUARDED_LANDS.has(p.colony) ? (p.value >= 11 ? 2 : 1) : p.value >= 12 ? 1 : 0) : p.value >= 12 ? 1 : 0);
  function worldPostPick(np, mul, towns) {
    const all = POSTS_WEST.length + POSTS_EAST.length;
    const want = Math.max(6, Math.min(all, Math.round(towns ? towns * POSTS_PER_TOWN : all * Math.sqrt(np / 8) * Math.pow(mul / (0.6 * 1.35), 0.4))));
    const order = [];
    for (let k = 0; k < Math.max(POSTS_WEST.length, POSTS_EAST.length); k++) order.push(POSTS_WEST[k], POSTS_EAST[k]);
    return new Set(order.filter(Boolean).slice(0, want));
  }
  // keep: names of the posts this map has (null: all). Posts left out still anchor the sea lanes that run past them.
  function colonyPosts(W, H, nb, t, col, keep) {
    const N = W * H, ocean = oceanMask(W, H, nb, t), posts = [], regions = [], postOf = {}, taken = new Set();
    SK.colonies.forEach((c, ci) => {
      const tiles = []; for (let i = 0; i < N; i++) if (col[i] === ci) tiles.push(i);
      if (!tiles.length) return;
      for (const [name, value, px, py] of c.posts) {
        const tile = worldWaterNear(W, H, ocean, px, py, (i) => nb[i].some((j) => col[j] === ci) && !nb[i].some((j) => t[j] !== 'water' && col[j] !== ci) && !taken.has(i));
        if (tile < 0) continue;
        postOf[name] = tile; taken.add(tile);
        if (!keep || keep.has(name)) posts.push({ tile, value: Math.round(value * POST_VALUE), name, colony: c.name });
      }
      let sx = 0, sy = 0; for (const i of tiles) { const [x, y] = worldXY(W, H, i); sx += x; sy += y; }
      sx /= tiles.length; sy /= tiles.length;
      let lab = tiles[0], ld = Infinity; for (const i of tiles) { const [x, y] = worldXY(W, H, i); const d = Math.hypot(x - sx, y - sy); if (d < ld) { ld = d; lab = i; } }
      regions.push({ name: c.name, tile: lab });
    });
    // the lanes of the sketch, joined up on this map
    const node = {};
    for (const [k, [x, y]] of Object.entries(SK.nodes)) node[k] = worldWaterNear(W, H, ocean, x, y);
    Object.assign(node, postOf);
    const pairs = SK.lanes.map(([a, b]) => [node[a], node[b]]).filter(([a, b]) => a >= 0 && b >= 0 && a != null && b != null);
    return { posts, regions, lanes: seaLanes(W, H, nb, t, pairs) };
  }

  // Sea lanes: shortest water paths between pairs of tiles, laid one after another. A lane already at sea is
  // cheap to follow, so later lanes join earlier ones and the network forms shared trunks.
  function seaLanes(W, H, nb, t, pairs) {
    const N = W * H, onLane = new Uint8Array(N), lanes = [];
    const nearLand = (i) => nb[i].some((j) => t[j] !== 'water');
    for (const [from, to] of pairs) {
      if (from === to) continue;
      const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
      dist[from] = 0;
      const open = [from];
      while (open.length) {
        let bi = 0; for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
        const i = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (done[i]) continue;
        done[i] = 1;
        if (i === to) break;
        for (const j of nb[i]) {
          if (t[j] !== 'water' || done[j]) continue;
          const c = (onLane[j] ? 0.35 : 1) + (nearLand(j) && j !== to ? 0.3 : 0);
          if (dist[i] + c < dist[j]) { dist[j] = dist[i] + c; prev[j] = i; open.push(j); }
        }
      }
      if (!done[to]) continue;
      const path = []; for (let j = to; j >= 0; j = prev[j]) path.unshift(j);
      for (const i of path) onLane[i] = 1;
      lanes.push(path);
    }
    return lanes;
  }
  // random maps: lanes join the markets and a ring of ports near the coasts, as a spanning tree
  function realmLanes(W, H, nb, t, posts, seed) {
    const N = W * H, ocean = oceanMask(W, H, nb, t), rng = mulberry32((seed ^ 0x1b873593) >>> 0);
    const coast = new Int32Array(N).fill(-1), q = [];
    for (let i = 0; i < N; i++) if (t[i] !== 'water') { coast[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) for (const j of nb[q[h]]) if (coast[j] < 0) { coast[j] = coast[q[h]] + 1; q.push(j); }
    const cands = []; for (let i = 0; i < N; i++) if (ocean[i] && coast[i] === 2) cands.push(i);
    const nodes = posts.map((p) => p.tile);
    const want = nodes.length + 7;
    while (nodes.length < want && cands.length) {
      let best = -1, bd = -1;
      for (const c of cands) { let d = Infinity; for (const n of nodes) d = Math.min(d, hexDistW(W, c, n)); d += rng() * 0.5; if (d > bd) { bd = d; best = c; } }
      if (best < 0 || bd < 4) break;
      nodes.push(best);
    }
    if (nodes.length < 2) return [];
    // Prim's tree over straight-line distance, shortest links first
    const inTree = [0], pairs = [];
    while (inTree.length < nodes.length) {
      let ba = -1, bb = -1, bd = Infinity;
      for (const a of inTree) for (let b = 0; b < nodes.length; b++) if (!inTree.includes(b)) { const d = hexDistW(W, nodes[a], nodes[b]); if (d < bd) { bd = d; ba = a; bb = b; } }
      inTree.push(bb); pairs.push([nodes[ba], nodes[bb]]);
    }
    return seaLanes(W, H, nb, t, pairs);
  }

  // gen 3: an inland sea in the middle of the land, opening onto the ocean through one strait, sometimes with a
  // second smaller sea joined to it, plus a few lakes. Fails (and the map is retried) if the land falls apart.
  function carveSeas(W, H, nb, t, elev, seed) {
    const rng = mulberry32((seed ^ 0x3c6ef372) >>> 0), N = W * H;
    const xy = (i) => { const c = i % W, r = (i / W) | 0; return [c + 0.5 * (r & 1), r * 0.866]; };
    const coast = new Int32Array(N).fill(-1), q = [];
    for (let i = 0; i < N; i++) if (t[i] === 'water') { coast[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) for (const j of nb[q[h]]) if (coast[j] < 0) { coast[j] = coast[q[h]] + 1; q.push(j); }
    const land = []; for (let i = 0; i < N; i++) if (t[i] !== 'water') land.push(i);
    if (!land.length) return false;
    const deepest = Math.max(...land.map((i) => coast[i]));
    const taken = new Uint8Array(N);
    const grow = (center, size, ang) => {
      const [cx, cy] = xy(center), ax = Math.cos(ang), ay = Math.sin(ang);
      const blob = [center], inBlob = new Set(blob);
      while (blob.length < size) {
        let best = -1, bv = Infinity;
        for (const b of blob) for (const j of nb[b]) {
          if (inBlob.has(j) || t[j] === 'water' || coast[j] < 2 || taken[j]) continue;
          const [x, y] = xy(j), perp = Math.abs((x - cx) * ay - (y - cy) * ax);
          const v = perp * 0.3 + elev[j] * 0.5 + rng() * 0.35;
          if (v < bv) { bv = v; best = j; }
        }
        if (best < 0) break;
        blob.push(best); inBlob.add(best);
      }
      for (const i of blob) t[i] = 'water';
      return blob;
    };
    // a path of land tiles from a body of water to the nearest tile matching `goal`, cut into a strait
    const strait = (from, goal) => {
      const prev = new Int32Array(N).fill(-2), qq = [];
      for (const i of from) { prev[i] = -1; qq.push(i); }
      for (let h = 0; h < qq.length; h++) {
        const i = qq[h];
        for (const j of nb[i]) {
          if (prev[j] !== -2) continue;
          prev[j] = i;
          if (goal(j)) { for (let k = i; k >= 0 && prev[k] !== -1; k = prev[k]) t[k] = 'water'; return true; }
          if (t[j] !== 'water') qq.push(j);
        }
      }
      return false;
    };
    const ocean = (i) => t[i] === 'water' && coast[i] === 0;
    const mids = land.filter((i) => coast[i] >= Math.max(3, Math.round(deepest * 0.55)));
    if (!mids.length) return false;
    const center = mids[Math.floor(rng() * mids.length)];
    const main = grow(center, Math.max(12, Math.round(land.length * (0.09 + rng() * 0.04))), (rng() - 0.5) * 0.9);
    const mainSet = new Set(main);
    if (!strait(main, (j) => ocean(j) && !mainSet.has(j))) return false;
    for (const i of main) for (const j of nb[i]) taken[j] = 1;
    // a second, smaller sea joined to the first, like the Black Sea to the Mediterranean
    if (rng() < 0.55) {
      const near = land.filter((i) => t[i] !== 'water' && coast[i] >= 3 && !taken[i] && main.some((m) => hexDistW(W, m, i) >= 3 && hexDistW(W, m, i) <= 5));
      if (near.length) {
        const second = grow(near[Math.floor(rng() * near.length)], Math.max(5, Math.round(main.length * (0.3 + rng() * 0.2))), rng() * Math.PI);
        strait(second, (j) => mainSet.has(j));
        for (const i of second) for (const j of nb[i]) taken[j] = 1;
      }
    }
    for (const i of main) taken[i] = 1;
    const lakes = 1 + Math.floor(rng() * 3);
    for (let k = 0, guard = 0; k < lakes && guard < 200; guard++) {
      const c = land[Math.floor(rng() * land.length)];
      if (t[c] === 'water' || taken[c] || coast[c] < 3 || nb[c].some((j) => t[j] === 'water')) continue;
      const lake = [c]; t[c] = 'water';
      for (const j of nb[c]) if (lake.length < 2 + Math.floor(rng() * 4) && t[j] !== 'water' && !taken[j] && !nb[j].some((x) => t[x] === 'water' && !lake.includes(x))) { t[j] = 'water'; lake.push(j); }
      for (const i of lake) for (const j of nb[i]) taken[j] = 1;
      k++;
    }
    // the land must still hang together
    const cc = components(N, nb, (i) => t[i] !== 'water');
    const big = cc.list.reduce((a, b) => Math.max(a, b.length), 0), total = cc.list.reduce((a, b) => a + b.length, 0);
    return big >= total * 0.82;
  }

  // Lakes and an inland sea, cut into the interior and kept apart from the ocean by at least one tile of shore.
  function carveLakes(W, H, nb, t, elev, seed) {
    const rng = mulberry32((seed ^ 0x2545f491) >>> 0), N = W * H;
    const coast = new Int32Array(N).fill(-1), q = [];
    for (let i = 0; i < N; i++) if (t[i] === 'water') { coast[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) for (const j of nb[q[h]]) if (coast[j] < 0) { coast[j] = coast[q[h]] + 1; q.push(j); }
    const land = []; for (let i = 0; i < N; i++) if (t[i] !== 'water') land.push(i);
    const taken = new Uint8Array(N);
    const grow = (seedTile, size) => {
      const blob = [seedTile], inBlob = new Set(blob);
      while (blob.length < size) {
        let best = -1, bv = Infinity;
        for (const b of blob) for (const j of nb[b]) {
          if (inBlob.has(j) || t[j] === 'water' || coast[j] < 2 || taken[j]) continue;
          const v = elev[j] + rng() * 0.08;
          if (v < bv) { bv = v; best = j; }
        }
        if (best < 0) break;
        blob.push(best); inBlob.add(best);
      }
      for (const i of blob) { t[i] = 'water'; taken[i] = 1; }
      for (const i of blob) for (const j of nb[i]) taken[j] = 1; // keep a shore between bodies of water
      return blob.length;
    };
    const deep = land.filter((i) => coast[i] >= 4);
    if (deep.length && rng() < 0.8) {
      const c = deep[Math.floor(rng() * deep.length)];
      grow(c, Math.max(10, Math.min(30, Math.round(land.length * 0.05))));
    }
    const lakes = 2 + Math.floor(rng() * 3);
    for (let k = 0, guard = 0; k < lakes && guard < 200; guard++) {
      const c = land[Math.floor(rng() * land.length)];
      if (t[c] === 'water' || taken[c] || coast[c] < 3) continue;
      grow(c, 2 + Math.floor(rng() * 5)); k++;
    }
  }

  // Distant markets: rich trading shores out in the ocean, near the edge of the map.
  const MARKET_NAMES = ['the Spice Isles', 'the Amber Coast', 'the Silk Shore', 'the Ivory Cape', 'the Salt Reach', 'the Pearl Banks'];
  function placeMarkets(W, H, nb, t, np, seed) {
    const rng = mulberry32((seed ^ 0x68e31da4) >>> 0), N = W * H;
    // the ocean is the body of water that touches the map's edge
    const ocean = new Uint8Array(N), q = [0];
    ocean[0] = 1;
    for (let h = 0; h < q.length; h++) for (const j of nb[q[h]]) if (!ocean[j] && t[j] === 'water') { ocean[j] = 1; q.push(j); }
    const edgeDist = (i) => { const c = i % W, r = (i / W) | 0; return Math.min(c, r, W - 1 - c, H - 1 - r); };
    const cands = [];
    for (let i = 0; i < N; i++) if (ocean[i] && edgeDist(i) === 1 && !nb[i].some((j) => t[j] !== 'water')) cands.push(i);
    const want = Math.max(2, Math.min(5, Math.round(np / 2) + 1));
    const posts = [];
    for (let k = 0; k < want && cands.length; k++) {
      let best = -1, bd = -1;
      for (const c of cands) {
        let d = Infinity;
        for (const p of posts) d = Math.min(d, hexDistW(W, c, p.tile));
        d = (posts.length ? d : 50) + rng() * 3;
        if (d > bd) { bd = d; best = c; }
      }
      if (best < 0 || (posts.length && bd < Math.min(W, H) / 3)) break;
      posts.push({ tile: best, value: 9 + Math.floor(rng() * 5), name: MARKET_NAMES[k % MARKET_NAMES.length] });
    }
    return posts;
  }

  // ---------------------------------------------------------------- game setup
  function defineHidden(obj, key, value) {
    Object.defineProperty(obj, key, { value, enumerable: false, writable: true, configurable: true });
  }

  function baseState(map, settings) {
    const st = {
      v: 1, W: map.W, H: map.H, mapSeed: map.seed, settings,
      tiles: [], rivers: map.rivers, cities: [], armies: [], fleets: [], ports: {}, builds: [], occupied: {}, players: [],
      round: 1, maxRounds: settings.rounds || 0, cur: 0, rng: (map.seed ^ 0x5bd1e995) | 0,
      nextId: 1, log: [], logSeq: 0, over: null, turnNo: 0, nameIdx: 0,
      dip: { peace: {}, offers: [], tributes: [], trades: [], nextOffer: 1 },
    };
    for (let i = 0; i < map.W * map.H; i++)
      st.tiles.push({ t: map.t[i], river: !!map.river[i], gold: !!map.gold[i], e: map.elev[i], v: map.variation[i], owner: -1, b: null, city: -1 });
    defineHidden(st, '_nb6', map.nb6);
    defineHidden(st, '_nb', map.nb);
    defineHidden(st, '_names', map.names);
    defineHidden(st, '_map', map);
    defineHidden(st, '_posts', map.posts || []);
    defineHidden(st, '_regions', map.regions || []);
    defineHidden(st, '_lanes', map.lanes || []);
    defineHidden(st, '_wrap', map.kind === 'world' && (map.gen || 1) < 5);
    const laneNb = new Map();
    for (const path of map.lanes || []) for (let k = 0; k < path.length; k++) {
      if (!laneNb.has(path[k])) laneNb.set(path[k], new Set());
      if (k) { laneNb.get(path[k]).add(path[k - 1]); laneNb.get(path[k - 1]).add(path[k]); }
    }
    defineHidden(st, '_laneNb', laneNb);
    return st;
  }

  function newGame(cfg) {
    const np = cfg.players.length;
    const seed = cfg.seed != null ? cfg.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    const gen = cfg.gen || MAP_GEN, kind = cfg.map === 'world' ? 'world' : 'realm';
    const size = cfg.size || 'normal', scale = cfg.scale || (cfg.tutorial ? SIZES[size] : SIZE_SCALE[size] || 1);
    const map = generateMap(np, scale, seed, gen, kind);
    const settings = { np, size, scale, rounds: cfg.rounds || 0, timer: cfg.timer || 0, tutorial: !!cfg.tutorial, gen, map: kind };
    const st = baseState(map, settings);
    st.guards = {};
    for (const p of map.posts || []) if (p.guard) st.guards[p.tile] = p.guard;
    cfg.players.forEach((p, i) => {
      st.players.push({
        id: i, name: p.name || HOUSE_NAMES[i], color: p.color != null ? p.color : i, ai: !!p.ai, flag: fullFlag(p.flag),
        gold: RULES.startGold, alive: true, seen: 0, lastIncome: 0, elimRound: 0, orders: 0,
        stats: { won: 0, lost: 0, taken: 0, cities: 0, slain: 0, fallen: 0 },
      });
    });
    // which house starts where is shuffled, so colours do not always land in the same corner
    const prng = mulberry32((seed ^ 0x51ed270b) >>> 0);
    const order = cfg.fixedStarts ? [...Array(np).keys()] : shuffled([...Array(np).keys()], prng);
    st.nameIdx = np; // the first names belong to the capitals' sites
    const neutrals = () => { for (const n of map.neutrals) { addCity(st, n.tile, -1, { walls: n.walls }); placeArmy(st, -1, n.tile, normU(n.u)); } };
    if (cfg.pickStarts) {
      neutrals();
      // each house chooses its capital from marked sites, in a random order
      settings.pickStarts = true;
      st.phase = 'pick';
      st.pick = { order: shuffled([...Array(np).keys()], prng), idx: 0, sites: startSites(st, map, np), taken: [] };
      st.cur = st.pick.order[0];
      log(st, 'Each house in turn chooses where its capital will stand.', 'info', []);
      return st;
    }
    // capitals are founded in player order (city id = player id); only their sites are shuffled
    for (let p = 0; p < np; p++) { const k = order.indexOf(p); foundCapital(st, p, map.starts[k], st._names[k]); }
    neutrals();
    log(st, `A new age begins. ${np} houses vie for the realm.`, 'info', []);
    startTurn(st);
    return st;
  }

  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function foundCapital(st, p, tile, name) {
    const c = addCity(st, tile, p, { walls: 1, capital: true, name });
    st.players[p].capital = c.id;
    for (const j of disk(st.W, st.H, tile, 2, st._wrap)) {
      const tt = st.tiles[j];
      if (passable(st, j) && tt.owner < 0 && tt.b !== 'city') tt.owner = p;
    }
    placeArmy(st, p, tile, normU([5, 2, 0]));
    return c;
  }
  // starting sites to choose from: the map's own starts plus a few more, well spread out
  function startSites(st, map, np) {
    const sites = map.starts.slice();
    const want = np + Math.max(2, Math.ceil(np * 0.75));
    const towns = st.cities.map((c) => c.tile);
    const room = (i) => disk(st.W, st.H, i, 2, st._wrap).filter((j) => passable(st, j)).length;
    const cands = [];
    for (let i = 0; i < st.tiles.length; i++) {
      const t = st.tiles[i];
      if (!passable(st, i) || t.b || t.t === 'hills' || t.owner >= 0) continue;
      if (towns.some((c) => hexDist(st, c, i) < 3) || room(i) < 14) continue;
      cands.push(i);
    }
    while (sites.length < want) {
      let best = -1, bd = 0;
      for (const c of cands) { let d = Infinity; for (const x of sites) d = Math.min(d, hexDist(st, c, x)); if (d > bd) { bd = d; best = c; } }
      if (best < 0 || bd < 5) break;
      sites.push(best);
    }
    return sites;
  }
  function canPickStart(st, p, tile) {
    const no = (reason) => ({ ok: false, reason });
    if (st.phase !== 'pick') return no('The game has already begun.');
    if (st.pick.order[st.pick.idx] !== p) return no('Wait for your turn to choose.');
    if (!st.pick.sites.includes(tile) || st.pick.taken.includes(tile)) return no('Choose one of the marked sites.');
    if (st.pick.taken.some((t) => hexDist(st, t, tile) < 4)) return no('Too close to another house.');
    return { ok: true };
  }
  function pickStart(st, p, tile) {
    const r = canPickStart(st, p, tile);
    if (!r.ok) return r;
    const k = st._map.starts.indexOf(tile);
    // on the Known World a capital takes the name of the nearest real place to where it was raised
    const world = st.settings.map === 'world';
    const c = foundCapital(st, p, tile, (world && worldPlace(st, tile)) || (k >= 0 ? st._names[k] : null));
    log(st, `${nameOf(st, p)} raised its capital at ${c.name}.`, 'city', [p]);
    st.pick.taken.push(tile);
    st.pick.idx++;
    if (st.pick.idx >= st.pick.order.length) {
      st.phase = 'play'; st.cur = 0;
      log(st, `A new age begins. ${st.players.length} houses vie for the realm.`, 'info', []);
      startTurn(st);
    } else st.cur = st.pick.order[st.pick.idx];
    return { ok: true, city: c.id };
  }
  // on the Known World a new capital takes the nearest place name on the sketch not already in use
  function worldPlace(st, tile) {
    const sk = sketchOf(st.settings.gen || 1), W = st.W, H = st.H;
    const [x, y] = worldXY(W, H, tile), used = new Set(st.cities.map((c) => c.name));
    let best = null, bd = 8;
    for (const [n, px, py] of sk.places) { if (used.has(n)) continue; const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  // the computer takes the free site with the most room and the farthest from rivals
  function aiPickStart(st) {
    const p = st.cur;
    let best = -1, bv = -Infinity;
    for (const t of st.pick.sites) {
      if (!canPickStart(st, p, t).ok) continue;
      const far = st.pick.taken.length ? Math.min(...st.pick.taken.map((x) => hexDist(st, x, t))) : 10;
      const land = disk(st.W, st.H, t, 3, st._wrap).filter((j) => passable(st, j)).length;
      const v = Math.min(far, 12) * 2 + land * 0.3 + rand(st) * 2;
      if (v > bv) { bv = v; best = t; }
    }
    return best >= 0 ? pickStart(st, p, best) : { ok: false, reason: 'No site left.' };
  }

  function addCity(st, tile, owner, opt) {
    const id = st.cities.length;
    const name = opt.name || st._names[st.nameIdx++ % st._names.length];
    const c = { id, tile, name, owner, walls: opt.walls || 0, market: 0, harbor: false, stables: false, capital: !!opt.capital, recruited: 0 };
    st.cities.push(c);
    const t = st.tiles[tile];
    t.b = 'city'; t.city = id; t.owner = owner;
    return c;
  }

  // ---------------------------------------------------------------- basic queries
  const sum = (u) => { let n = 0; for (const x of u) n += x || 0; return n; };
  const passable = (st, i) => TERRAIN[st.tiles[i].t].passable;
  const hexDist = (st, a, b) => hexDistW(st.W, a, b, st._wrap);
  const armyAt = (st, tile) => st.armies.find((a) => a.tile === tile) || null;
  const getArmy = (st, id) => st.armies.find((a) => a.id === id) || null;
  const cityAt = (st, tile) => (st.tiles[tile].b === 'city' ? st.cities[st.tiles[tile].city] : null);
  const isCoastal = (st, tile) => st._nb[tile].some((j) => st.tiles[j].t === 'water');

  function colorOf(st, owner) {
    if (owner < 0) return REBEL.hex;
    return COLORS[st.players[owner].color % COLORS.length].hex;
  }
  function nameOf(st, owner) { return owner < 0 ? 'Rebels' : st.players[owner].name; }

  // used: movement points spent this turn; took: tiles seized this turn. Merged armies keep the larger of each.
  function placeArmy(st, owner, tile, u, used, took) {
    used = used || 0; took = took || 0;
    const ex = armyAt(st, tile);
    if (ex) {
      // the joined army keeps the soldier-weighted average of the steps each part had left
      const leftOf = (uu, uused) => Math.max(0, armyStats(uu).mp - Math.min(uused || 0, armyStats(uu).mp));
      const nEx = sum(ex.u), nIn = sum(u);
      const left = (leftOf(ex.u, ex.used) * nEx + leftOf(u, used) * nIn) / Math.max(1, nEx + nIn);
      ex.u = ex.u.map((n, k) => n + u[k]);
      ex.used = Math.max(0, armyStats(ex.u).mp - Math.floor(left + 1e-9));
      ex.took = Math.max(ex.took || 0, took);
      return ex;
    }
    const a = { id: st.nextId++, owner, tile, u: u.slice(), used, took };
    st.armies.push(a);
    return a;
  }
  const SPENT = 99; // movement after a battle, or after stopping in an enemy's zone of control
  function removeArmy(st, army) { st.armies = st.armies.filter((a) => a !== army); }

  function armyStats(u) {
    const soldiers = sum(u);
    let points = 0, mountedOnly = soldiers > 0, guns = 0;
    UNITS.forEach((d, k) => { const n = u[k] || 0; points += n * d.land; if (n && !d.mounted) mountedOnly = false; if (d.siege) guns += n; });
    const cap = soldiers ? Math.min(RULES.capMax, RULES.capBase + Math.floor(points / RULES.capPer)) : 0;
    const base = mountedOnly ? RULES.cavalryMP : RULES.baseMP;
    // cannons slow an army (any size slowdown is off: sizeSlowMax 0)
    const slow = soldiers ? Math.min(RULES.sizeSlowMax, Math.floor((soldiers - 1) / RULES.sizeSlowEvery)) : 0;
    const gunSlow = guns ? RULES.cannonSlow : 0;
    return { soldiers, cap, mp: Math.max(1, base - slow - gunSlow), slow, gunSlow };
  }

  // soldiers free to march (every soldier on the map; recruits in training are not on the map yet)
  function movable(a) { return a.u.slice(); }
  // steps left for the part of the army that may move at all
  function marchLeft(a) { return sum(movable(a)) ? movesLeft(a) : 0; }
  // movement points left this turn for an army (or a detachment u of it)
  function movesLeft(a, u) { return Math.max(0, (a.sea ? RULES.transportMP : armyStats(u || a.u).mp) - (a.used || 0)); }
  function landLeft(a, u) { return Math.max(0, armyStats(u || a.u).cap - (a.took || 0)); }

  function placeName(st, i) {
    const c = cityAt(st, i);
    if (c) return c.name;
    let best = null, bd = Infinity;
    for (const x of st.cities) { const d = hexDist(st, x.tile, i); if (d < bd) { bd = d; best = x; } }
    const t = st.tiles[i];
    const word = t.t === 'water' ? 'Waters' : t.river ? 'Ford' : t.b === 'mine' ? 'Mine' : t.b === 'farm' ? 'Farms' : t.t === 'forest' ? 'Woods' : t.t === 'hills' ? 'Heights' : 'Fields';
    return best ? `${best.name} ${word}` : `the ${word}`;
  }

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function log(st, text, kind, who) {
    st.log.push({ n: st.logSeq++, r: st.round, p: st.cur, text, kind, who: who || [] });
    if (st.log.length > 160) st.log.splice(0, st.log.length - 160);
  }

  // ---------------------------------------------------------------- movement
  function stepCost(st, me, j) {
    const t = st.tiles[j];
    if (t.owner === me) return 1; // roads through your own lands
    return TERRAIN[t.t].cost; // rivers do not slow a march; they help whoever defends them
  }

  function isHarborTile(st, tile, me) {
    const c = cityAt(st, tile);
    return !!(c && c.owner === me && c.harbor);
  }

  function navalLandings(st, from, range) {
    const seen = new Map(), q = [], out = new Set();
    for (const j of st._nb[from]) if (st.tiles[j].t === 'water' && !seen.has(j)) { seen.set(j, 1); q.push(j); }
    for (let h = 0; h < q.length; h++) {
      const w = q[h], d = seen.get(w);
      for (const j of st._nb[w]) {
        const tt = st.tiles[j];
        if (tt.t === 'water') { if (!seen.has(j) && d < range) { seen.set(j, d + 1); q.push(j); } }
        else if (j !== from && TERRAIN[tt.t].passable) out.add(j);
      }
    }
    return out;
  }

  // Zone of control: towns, castles and outposts control the 6 tiles around them; armies only their own tile.
  // An army that steps onto a zone tile may only attack the zone's owner or turn back the way it came:
  // it cannot cross the zone or end its march inside it. Zones never cover the mover's own land.
  // Returns Map tile -> zone radius.
  function zocSources(st, me) {
    const out = new Map();
    const foe = (o) => o !== me && !atPeace(st, me, o);
    for (const a of st.armies) if (foe(a.owner)) out.set(a.tile, Math.max(out.get(a.tile) || 0, RULES.zocArmy));
    for (const c of st.cities) if (foe(c.owner)) out.set(c.tile, RULES.zocTown);
    for (let i = 0; i < st.tiles.length; i++) if (st.tiles[i].b === 'tower' && foe(st.tiles[i].owner)) out.set(i, RULES.zocTown);
    return out;
  }
  // zoc options for a march whose painted region is `set`: sources inside it are being attacked, so they do not block
  function zocFor(st, me, set) {
    const sources = zocSources(st, me);
    const blocked = new Set();
    for (const t of sources.keys()) if (!set || !set.has(t)) blocked.add(t);
    return { sources, blocked };
  }
  function zoneOf(st, t, r) { return r <= 0 ? [] : r === 1 ? st._nb[t] : disk(st.W, st.H, t, r, st._wrap).filter((j) => j !== t); }
  function zocTiles(st, me, set) {
    const z = zocFor(st, me, set), out = new Set();
    for (const t of z.blocked) for (const j of zoneOf(st, t, z.sources.get(t))) if (!z.sources.has(j) && passable(st, j) && st.tiles[j].owner !== me) out.add(j);
    return out;
  }
  // is `tile` inside an enemy zone? (callers decide whether the tile counts as foreign ground)
  function inZoc(st, me, tile) {
    for (const [t, r] of zocSources(st, me)) if (t !== tile && hexDist(st, t, tile) <= r) return true;
    return false;
  }

  // Dijkstra with a tiny binary heap. Priority = dist*2 + naval so land routes win ties.
  // opts.zoc = { sources, blocked }: tiles next to a blocked source end movement except to attack a source.
  function dijkstra(st, me, start, allow, opts) {
    const N = st.tiles.length, limit = opts.limit;
    const dist = new Float64Array(N).fill(Infinity), naval = new Uint8Array(N), prev = new Int32Array(N).fill(-1);
    const hp = [], hi = [];
    const push = (p, i) => {
      hp.push(p); hi.push(i);
      let k = hp.length - 1;
      while (k > 0) { const pa = (k - 1) >> 1; if (hp[pa] <= hp[k]) break; [hp[pa], hp[k]] = [hp[k], hp[pa]]; [hi[pa], hi[k]] = [hi[k], hi[pa]]; k = pa; }
    };
    const pop = () => {
      const p = hp[0], i = hi[0], lp = hp.pop(), li = hi.pop();
      if (hp.length) {
        hp[0] = lp; hi[0] = li;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < hp.length && hp[l] < hp[m]) m = l;
          if (r < hp.length && hp[r] < hp[m]) m = r;
          if (m === k) break;
          [hp[m], hp[k]] = [hp[k], hp[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m;
        }
      }
      return [p, i];
    };
    let near = null;
    const zoc = opts.zoc;
    if (zoc) { near = new Uint8Array(N); for (const t of zoc.blocked) for (const j of zoneOf(st, t, zoc.sources.get(t))) near[j] = 1; }
    dist[start] = 0; push(0, start);
    if (opts.naval && RULES.navalHop) {
      for (const j of navalLandings(st, start, RULES.navalRange)) {
        if (!allow(j) || RULES.navalCost > limit) continue;
        dist[j] = RULES.navalCost; naval[j] = 1; prev[j] = start; push(dist[j] * 2 + 1, j);
      }
    }
    while (hp.length) {
      const [p, i] = pop();
      const d = dist[i];
      if (p !== d * 2 + naval[i]) continue;
      let stuck = false;
      if (zoc && i !== start) {
        if (zoc.blocked.has(i)) continue; // an unattacked enemy: the march cannot pass through
        stuck = near[i] === 1 && st.tiles[i].owner !== me; // your own land is never controlled
      }
      for (const j of st._nb[i]) {
        if (j === start || !allow(j)) continue;
        if (stuck && !zoc.sources.has(j)) continue; // inside an enemy zone: only an attack may follow
        const nd = d + stepCost(st, me, j);
        if (nd > limit) continue;
        if (nd < dist[j] || (nd === dist[j] && naval[j] && !naval[i])) {
          dist[j] = nd; naval[j] = naval[i]; prev[j] = i; push(nd * 2 + naval[j], j);
        }
      }
    }
    return { dist, naval, prev };
  }

  // Where this army could reach this turn if it painted every tile on the way. region: tiles already painted,
  // so enemies inside it count as attacked. free: ignore zones of control (to explain why a tile is out of reach).
  function reach(st, armyId, u, region, free) {
    const a = getArmy(st, armyId);
    const set = new Set(region || []);
    return dijkstra(st, a.owner, a.tile, (i) => passable(st, i),
      { limit: movesLeft(a, u), naval: isHarborTile(st, a.tile, a.owner), zoc: free ? null : zocFor(st, a.owner, set) });
  }

  // ---------------------------------------------------------------- combat
  const DICE = [];
  for (let s = 2; s <= 12; s++) DICE.push({ s, p: (6 - Math.abs(s - 7)) / 36 });
  const luck = (s) => 0.7 + (s - 2) * 0.06;

  function defenderAt(st, i, me) {
    const t = st.tiles[i];
    if (t.owner === me) return null;
    const army = armyAt(st, i), city = cityAt(st, i), tower = t.b === 'tower';
    if (!army && !city && !tower) return null;
    const militia = city ? 1 + city.walls : tower ? RULES.outpostMilitia : 0;
    return { owner: t.owner, army, city, tower, militia, u: army ? army.u.slice() : Z() };
  }

  function battleCtx(st, i, naval) {
    const t = st.tiles[i], c = cityAt(st, i);
    // only outposts (and towns) help their defenders; farms and mines give no cover
    const structure = t.b === 'tower' ? 'tower' : null;
    return { terrain: t.t, river: t.river, city: c ? { walls: c.walls } : null, structure, amphibious: !!naval };
  }

  function powers(att, def, militia, ctx) {
    const g = (x, k) => (x && x[k]) || 0;
    const dSold = sum(def) + militia;
    const spearShare = dSold ? (g(def, 0) + militia) / dSold : 0;
    const archerShare = dSold ? g(def, 1) / dSold : 0;
    let kMult = (1 - RULES.knightSpearPenalty * spearShare) * (1 + RULES.knightVsArcher * archerShare);
    if (ctx.terrain === 'forest' || ctx.terrain === 'hills') kMult *= RULES.knightRoughMult;
    if (ctx.city) kMult *= RULES.knightCityMult;
    const swordMult = 1 + RULES.swordVsSpear * spearShare;
    const cannonMult = ctx.city ? RULES.cannonCity : ctx.structure === 'tower' ? RULES.cannonTower : 1;
    const amult = [1, 1, kMult, swordMult, cannonMult];
    let aBase = 0;
    UNITS.forEach((d, k) => { aBase += g(att, k) * d.att * (amult[k] || 1); });
    const aMods = [];
    if (ctx.river) aMods.push({ label: 'River crossing', mult: RULES.riverAtt });
    if (ctx.amphibious) aMods.push({ label: 'Landing from ships', mult: RULES.amphibAtt });
    const archerDef = ctx.city ? UNITS[1].def * RULES.archerWallMult : UNITS[1].def;
    // defending knights are also blunted by an attacking line of spearmen
    const aSold = sum(att);
    const dkMult = 1 - RULES.knightPikeDef * (aSold ? g(att, 0) / aSold : 0);
    const dmult = [1, archerDef / UNITS[1].def, dkMult, 1, 1];
    let dBase = militia * RULES.militiaDef;
    UNITS.forEach((d, k) => { dBase += g(def, k) * d.def * (dmult[k] || 1); });
    const dMods = [];
    const td = TERRAIN[ctx.terrain].def;
    if (td !== 1) dMods.push({ label: TERRAIN[ctx.terrain].name, mult: td });
    if (ctx.city && RULES.walls.mult[ctx.city.walls] !== 1) dMods.push({ label: ctx.city.walls ? `Walls level ${ctx.city.walls}` : 'Town palisade', mult: RULES.walls.mult[ctx.city.walls] });
    else if (ctx.structure === 'tower') dMods.push({ label: 'Outpost', mult: RULES.outpostDef });
    const A = aBase * aMods.reduce((m, x) => m * x.mult, 1);
    const D = dBase * dMods.reduce((m, x) => m * x.mult, 1);
    return { A, D, aBase, dBase, aMods, dMods, kMult, dkMult, swordMult, cannonMult, militia };
  }

  // r = winner's effective strength / loser's (>= 1). Lanchester-flavoured attrition.
  function lossFracs(r) {
    const loser = Math.min(1, 0.5 + (0.5 * (r - 1)) / 0.8);
    const lanch = 1 - Math.sqrt(Math.max(0, 1 - 1 / (r * r)));
    return { winner: Math.min(0.7 * lanch, loser * 0.85), loser };
  }

  function odds(att, def, militia, ctx) {
    const pw = powers(att, def, militia, ctx);
    if (pw.D <= 0) return { p: 1, expLoss: 0, pw };
    if (pw.A <= 0) return { p: 0, expLoss: 1, pw };
    let p = 0, el = 0;
    for (const a of DICE)
      for (const d of DICE) {
        const Ae = pw.A * luck(a.s), De = pw.D * luck(d.s);
        if (Ae > De) { const pr = a.p * d.p; p += pr; el += pr * lossFracs(Ae / De).winner; }
      }
    return { p, expLoss: p > 0 ? el / p : 1, pw };
  }

  // steps a won battle costs: the closer the fight (defender vs attacker strength), the more tiring
  function fatigue(A, D) {
    const q = A > 0 ? Math.min(1, D / A) : 1;
    return Math.max(RULES.fatigueMin, Math.min(RULES.fatigueMax, Math.round(RULES.fatigueMax * q)));
  }

  function keepOne(u) {
    for (const k of [2, 3, 0, 1, 4]) if (u[k] > 0) { const o = Z(); o[k] = 1; return o; }
    return Z();
  }
  function applyLoss(st, u, f) {
    if (f >= 1) return Z();
    return u.map((n) => n - Math.min(n, Math.floor(n * f + rand(st))));
  }

  function resolveBattle(st, att, def, militia, ctx) {
    const pw = powers(att, def, militia, ctx);
    const pre = odds(att, def, militia, ctx).p;
    const roll = () => 1 + Math.floor(rand(st) * 6);
    const ad = [roll(), roll()], dd = [roll(), roll()];
    const La = luck(ad[0] + ad[1]), Ld = luck(dd[0] + dd[1]);
    const Ae = pw.A * La, De = pw.D * Ld;
    const attackerWins = Ae > De;
    const r = attackerWins ? Ae / Math.max(De, 1e-6) : De / Math.max(Ae, 1e-6);
    const lf = lossFracs(r);
    let attAfter = applyLoss(st, att, attackerWins ? lf.winner : lf.loser);
    let defAfter = applyLoss(st, def, attackerWins ? lf.loser : lf.winner);
    if (attackerWins && sum(attAfter) === 0) attAfter = keepOne(att);
    if (!attackerWins && sum(def) > 0 && sum(defAfter) === 0) defAfter = keepOne(def);
    return { att: att.slice(), def: def.slice(), militia, pw, ad, dd, La, Ld, Ae, De, attackerWins, odds: pre, attAfter, defAfter, ratio: r };
  }

  // ---------------------------------------------------------------- campaigns
  // region: ordered tile list the player painted; dest: tile where the army ends (defaults to last painted).
  function planCampaign(st, armyId, u, region, dest) {
    const army = getArmy(st, armyId);
    if (!army) return { valid: false, errors: ['That army no longer exists.'], region: [], order: [], battles: [], bad: new Set() };
    const me = army.owner;
    if (army.sea) return { valid: false, errors: ['This army is aboard ships: sail it, or land it on a shore.'], region: [], order: [], battles: [], bad: new Set(), dest: army.tile };
    const mov = movable(army);
    u = UNITS.map((_, k) => Math.max(0, Math.min((u[k] | 0), mov[k] || 0)));
    const stats = armyStats(u);
    const left = movesLeft(army, u), cap = landLeft(army, u);
    const set = new Set(region);
    const errors = [];
    const allowed = (i) => passable(st, i) && (st.tiles[i].owner === me || set.has(i));
    const naval = isHarborTile(st, army.tile, me);
    const dj = dijkstra(st, me, army.tile, allowed, { limit: left, naval, zoc: zocFor(st, me, set) });
    let newTiles = 0;
    const bad = new Set();
    for (const i of region) {
      if (st.tiles[i].owner !== me) newTiles++;
      if (!(dj.dist[i] <= left)) bad.add(i);
    }
    let zocBad = 0;
    if (bad.size) {
      const free = dijkstra(st, me, army.tile, allowed, { limit: left, naval });
      for (const i of bad) if (free.dist[i] <= left) zocBad++;
    }
    if (me !== st.cur) errors.push('It is not your turn.');
    if (stats.soldiers && left <= 0) errors.push((army.used || 0) >= SPENT ? 'This army lost a battle this turn. It can march again next turn.' : 'This army has no movement left this turn.');
    if (!stats.soldiers) errors.push('Send at least one soldier.');
    if (!region.length) errors.push('Paint the tiles you want to march through or conquer.');
    if (newTiles > cap) errors.push(`Too much land: this force can seize ${cap} more tile${cap === 1 ? '' : 's'} this turn, you painted ${newTiles}.`);
    if (zocBad) errors.push('An enemy town or outpost blocks the way: an army entering one of the 6 tiles around it may only attack it or turn back. Paint the town or outpost to attack it, or go around.');
    else if (bad.size) errors.push(`${bad.size} painted tile${bad.size > 1 ? 's are' : ' is'} beyond marching range.`);
    const partner = region.map((i) => st.tiles[i].owner).find((o) => o >= 0 && o !== me && atPeace(st, me, o));
    if (partner != null) errors.push(`You are at peace with ${nameOf(st, partner)} until round ${peaceUntil(st, me, partner)}. You cannot march into their land.`);
    if (newTiles > 0 && !(st.players[me].orders > 0)) errors.push('No marching orders left this turn. Moving inside your own land is still free.');
    if (dest == null || (dest !== army.tile && !set.has(dest))) dest = region.length ? region[region.length - 1] : army.tile;
    // a march may claim tiles inside an enemy zone but must come back out the way it entered
    const zone = zocTiles(st, me, set);
    let destMoved = false;
    // a march that storms a town or castle moves into it instead of turning back
    const town = zone.has(dest) ? region.slice().reverse().find((i) => st.tiles[i].b === 'city' && st.tiles[i].owner !== me && dj.dist[i] <= left) : undefined;
    if (town != null) dest = town;
    for (let guard = 0; zone.has(dest) && dest !== army.tile && guard < 50; guard++) {
      const back = dj.prev[dest];
      if (back < 0) { dest = army.tile; break; }
      dest = back; destMoved = true;
    }
    const pos = new Map(region.map((x, k) => [x, k]));
    const order = region.filter((i) => st.tiles[i].owner !== me && !bad.has(i))
      .sort((a, b) => dj.dist[a] - dj.dist[b] || pos.get(a) - pos.get(b));
    let cur = u.slice(), pAll = 1;
    const battles = [];
    for (const i of order) {
      const df = defenderAt(st, i, me);
      if (!df) continue;
      const o = odds(cur, df.u, df.militia, battleCtx(st, i, dj.naval[i]));
      battles.push({ tile: i, owner: df.owner, u: df.u, militia: df.militia, city: df.city ? df.city.id : -1, tower: !!df.tower, p: o.p, A: o.pw.A, D: o.pw.D });
      pAll *= o.p;
      battles[battles.length - 1].fatigue = fatigue(o.pw.A, o.pw.D);
      cur = cur.map((n) => n * (1 - o.expLoss));
    }
    return {
      armyId, me, origin: army.tile, u, region: region.slice(), dest, order, dist: dj.dist, naval: dj.naval, prev: dj.prev,
      newTiles, cap, mp: left, mpMax: stats.mp, destMoved, soldiers: stats.soldiers, bad, errors, valid: errors.length === 0,
      battles, pAll, fatigue: battles.reduce((n, b) => n + b.fatigue, 0), usesSea: order.some((i) => dj.naval[i]) || (dj.naval[dest] === 1),
    };
  }

  function capture(st, me, i, rep) {
    const t = st.tiles[i];
    const prev = t.owner;
    t.owner = me;
    // land next to an enemy town, castle or outpost is only held while an army stands on it
    if (!st.occupied) st.occupied = {};
    if (prev >= 0 && t.b !== 'city' && t.b !== 'tower') st.occupied[i] = { p: prev, by: me }; else delete st.occupied[i];
    rep.captured.push(i);
    st.players[me].stats.taken++;
    if (t.b === 'port' && st.ports && st.ports[i]) st.ports[i].train = [];
    if (t.b === 'tower') {
      t.b = null;
      (rep.burned = rep.burned || []).push(i);
      log(st, `${nameOf(st, me)} burned ${prev >= 0 ? nameOf(st, prev) + "'s" : 'an'} outpost at ${placeName(st, i)}.`, 'battle', [me, prev]);
    }
    if (t.b === 'city') {
      const c = st.cities[t.city];
      c.owner = me;
      c.train = [];
      c.walls = Math.max(0, c.walls - 1);
      c.capital = false;
      rep.cities.push(c.id);
      st.players[me].stats.cities++;
      log(st, `${nameOf(st, me)} captured ${c.name}${prev >= 0 ? ` from ${nameOf(st, prev)}` : ''}.`, 'city', [me, prev]);
    }
  }

  // is tile i inside the zone of a town, castle or outpost belonging to `owner`?
  function guardedBy(st, i, owner) {
    for (const j of zoneOf(st, i, RULES.zocTown)) {
      const t = st.tiles[j];
      if (t.owner === owner && (t.b === 'city' || t.b === 'tower')) return true;
    }
    return false;
  }
  // at the end of a house's turn, guarded land it took but no longer stands on goes back to its owner
  function releaseOccupied(st, me) {
    if (!st.occupied) return [];
    const back = {};
    for (const k of Object.keys(st.occupied)) {
      const i = +k, o = st.occupied[k], prev = o.p, t = st.tiles[i];
      if (t.owner !== o.by) { delete st.occupied[k]; continue; }
      if (o.by !== me) continue;
      if (!st.players[prev] || !st.players[prev].alive) { delete st.occupied[k]; continue; }
      if (st.armies.some((a) => a.tile === i && a.owner === me)) continue;
      if (!guardedBy(st, i, prev)) { delete st.occupied[k]; continue; }
      t.owner = prev; delete st.occupied[k];
      (back[prev] = back[prev] || []).push(i);
    }
    for (const prev of Object.keys(back))
      log(st, `${nameOf(st, +prev)} took back ${back[prev].length} ${back[prev].length === 1 ? 'tile' : 'tiles'} beside its strongholds once ${nameOf(st, me)} marched off.`, 'info', [me, +prev]);
    return Object.values(back).flat();
  }

  function rout(st, owner, u, fromTile) {
    if (owner < 0) return -1;
    let best = null, bd = Infinity;
    for (const c of st.cities) if (c.owner === owner && c.tile !== fromTile) { const d = hexDist(st, c.tile, fromTile); if (d < bd) { bd = d; best = c; } }
    if (!best) return -1;
    placeArmy(st, owner, best.tile, u);
    return best.id;
  }

  function executeCampaign(st, armyId, u, region, dest) {
    if (st.over) return { error: 'The game is over.' };
    const plan = planCampaign(st, armyId, u, region, dest);
    if (!plan.valid) return { error: plan.errors[0], plan };
    const army = getArmy(st, armyId), me = army.owner, P = st.players[me];
    const origin = army.tile;
    let force = plan.u.slice();
    army.u = army.u.map((n, k) => n - force[k]);
    if (sum(army.u) === 0) removeArmy(st, army);
    const rep = { me, origin, battles: [], captured: [], cities: [], halted: false, end: -1, sent: force.slice(), usedOrder: plan.newTiles > 0 };
    if (rep.usedOrder) P.orders--;
    for (const i of plan.order) {
      const t = st.tiles[i];
      if (t.owner === me) continue;
      const df = defenderAt(st, i, me);
      if (df) {
        const b = resolveBattle(st, force, df.u, df.militia, battleCtx(st, i, plan.naval[i]));
        b.tile = i; b.attacker = me; b.defender = df.owner; b.place = placeName(st, i);
        b.terrain = t.t; b.river = !!t.river; b.tower = !!df.tower;
        b.cityId = df.city ? df.city.id : -1; b.cityName = df.city ? df.city.name : null; b.walls = df.city ? df.city.walls : 0;
        b.fatigue = b.attackerWins ? fatigue(b.Ae, b.De) : SPENT;
        rep.battles.push(b);
        const aLost = sum(force) - sum(b.attAfter), dLost = sum(df.u) - sum(b.defAfter);
        P.stats.slain += dLost; P.stats.fallen += aLost;
        if (df.owner >= 0) { st.players[df.owner].stats.slain += aLost; st.players[df.owner].stats.fallen += dLost; }
        force = b.attAfter;
        if (df.army) df.army.u = b.defAfter;
        const pct = Math.round(b.odds * 100);
        if (!b.attackerWins) {
          rep.halted = true;
          P.stats.lost++;
          if (df.owner >= 0) st.players[df.owner].stats.won++;
          if (df.army && sum(df.army.u) === 0) removeArmy(st, df.army);
          log(st, `${df.owner >= 0 ? nameOf(st, df.owner) : 'Rebels'} held ${b.place} against ${P.name} (${pct}% odds for the attacker). ${count(aLost, 'attacker', 'attackers')} and ${count(dLost, 'defender', 'defenders')} fell.`, 'battle', [me, df.owner]);
          break;
        }
        P.stats.won++;
        if (df.owner >= 0) st.players[df.owner].stats.lost++;
        if (df.army) {
          const surv = df.army.u;
          removeArmy(st, df.army);
          if (sum(surv) > 0) { b.routedTo = rout(st, df.owner, surv, i); b.routed = surv.slice(); }
        }
        log(st, `${P.name} won the battle of ${b.place} against ${df.owner >= 0 ? nameOf(st, df.owner) : 'rebels'} (${pct}% odds). ${count(aLost, 'attacker', 'attackers')} and ${count(dLost, 'defender', 'defenders')} fell.`, 'battle', [me, df.owner]);
      }
      capture(st, me, i, rep);
    }
    if (sum(force) > 0) {
      let end = rep.halted ? origin : plan.dest;
      if (st.tiles[end].owner !== me) end = origin;
      // the march costs as much as its farthest painted tile
      let cost = plan.dist[end] < Infinity ? plan.dist[end] : 0;
      for (const i of plan.region) if (!plan.bad.has(i) && plan.dist[i] < Infinity) cost = Math.max(cost, plan.dist[i]);
      // fighting tires the army; losing, or stopping inside an enemy zone, ends its moves
      rep.fatigue = rep.battles.reduce((n, b) => n + (b.attackerWins ? b.fatigue : 0), 0);
      let used = (army.used || 0) + cost + rep.fatigue;
      // stopping on ground taken this march inside an enemy zone ends the turn; your own old land never does
      if (rep.halted) used = Math.max(used, SPENT);
      placeArmy(st, me, end, force, used, (army.took || 0) + rep.captured.length);
      rep.end = end;
      rep.spent = used >= SPENT;
    }
    const plain = rep.captured.length - rep.cities.length;
    if (!rep.battles.length && rep.captured.length) log(st, `${P.name} claimed ${rep.captured.length} tile${rep.captured.length > 1 ? 's' : ''} of land.`, 'land', [me]);
    else if (plain > 0 && rep.battles.length) log(st, `${P.name} seized ${rep.captured.length} tile${rep.captured.length > 1 ? 's' : ''} in the campaign.`, 'land', [me]);
    checkEliminations(st, me);
    return rep;
  }

  function checkEliminations(st, by) {
    for (const p of st.players) {
      if (!p.alive) continue;
      if (st.cities.some((c) => c.owner === p.id)) continue;
      p.alive = false; p.elimRound = st.round;
      st.armies = st.armies.filter((a) => a.owner !== p.id);
      st.fleets = (st.fleets || []).filter((f) => f.owner !== p.id);
      for (const t of st.tiles) if (t.owner === p.id) { t.owner = -1; if (t.b === 'tower') t.b = null; }
      log(st, `${p.name} has fallen. Their lands slip into anarchy.`, 'elim', [p.id, by]);
    }
    if (!st.over && st.players.filter((p) => p.alive).length <= 1) finishGame(st, 'conquest');
  }

  // ---------------------------------------------------------------- economy
  // a town's own gold: the base, plus each market level (+5, +6, +8)
  function townIncome(c) {
    let g = c.capital ? RULES.capitalIncome : RULES.cityIncome;
    for (let k = 0; k < (c.market || 0); k++) g += RULES.marketLevels[k] || RULES.marketIncome;
    return g;
  }
  function income(st, p) {
    let cities = 0, farms = 0, mines = 0, upkeep = 0;
    for (const c of st.cities) if (c.owner === p) cities += townIncome(c);
    let outposts = 0, ports = 0;
    for (const t of st.tiles) if (t.owner === p) {
      if (t.b === 'farm') farms += RULES.farmIncome + (t.river ? RULES.riverFarmBonus : 0);
      else if (t.b === 'mine') mines += RULES.mineIncome;
      else if (t.b === 'tower') outposts++;
      else if (t.b === 'port') ports++;
    }
    for (const a of st.armies) if (a.owner === p) UNITS.forEach((d, k) => { upkeep += (a.u[k] || 0) * d.upkeep; });
    const troops = Math.ceil(upkeep);
    // soldiers aboard ships also pay for the ships that carry them
    let atSea = 0;
    for (const a of st.armies) if (a.owner === p && a.sea) atSea += sum(a.u);
    const seaUpkeep = Math.ceil(atSea * RULES.seaUpkeep);
    upkeep = troops + outposts * RULES.outpostUpkeep + ports * RULES.portUpkeep + seaUpkeep;
    let ships = 0, merchants = 0;
    for (const f of st.fleets || []) if (f.owner === p) { if (isMerchant(f)) merchants += f.n; else ships += f.n; }
    const shipUpkeep = ships * RULES.shipUpkeep + merchants * RULES.merchantUpkeep;
    upkeep += shipUpkeep;
    const routes = tradeRoutes(st, p);
    const trade = routes.reduce((n, r) => n + (r.ok ? r.value : 0), 0);
    const gross = cities + farms + mines + trade;
    return { cities, farms, mines, trade, routes, gross, upkeep, troops, outposts, outpostUpkeep: outposts * RULES.outpostUpkeep, ports, portUpkeep: ports * RULES.portUpkeep, atSea, seaUpkeep, ships, merchants, shipUpkeep, net: gross - upkeep };
  }

  function farmSlots(st, p) {
    let tiles = 0, farms = 0;
    for (const t of st.tiles) if (t.owner === p) { tiles++; if (t.b === 'farm') farms++; }
    farms += (st.builds || []).filter((b) => b.owner === p && b.kind === 'farm').length; // farms being built count too
    return { tiles, farms, max: Math.floor(tiles / RULES.tilesPerFarm) };
  }

  // ---- construction: building takes RULES.buildTurns turns. Paid now, finished at the start of a later turn.
  const pendingAt = (st, tile) => (st.builds || []).find((b) => b.tile === tile) || null;
  const pendingIn = (st, cityId, kind) => (st.builds || []).find((b) => b.city === cityId && b.kind === kind) || null;
  function queueBuild(st, entry) {
    st.builds = st.builds || [];
    const b = Object.assign({ id: st.nextId++, left: RULES.buildTurns }, entry);
    st.builds.push(b);
    return b;
  }
  // pull down a farm, mine, outpost or port on your own land, to build something else there (no gold back)
  const DISMANTLE = { farm: 'a farm', mine: 'a gold mine', tower: 'an outpost', port: 'a port' };
  function canDismantle(st, p, i) {
    const t = st.tiles[i];
    if (st.cur !== p) return { ok: false, reason: 'Wait for your turn.' };
    if (t.owner !== p) return { ok: false, reason: 'Not your land.' };
    if (!DISMANTLE[t.b]) return { ok: false, reason: 'Nothing here can be pulled down.' };
    const d = t.b === 'port' && st.ports && st.ports[i];
    if (d && (d.train || []).some((e) => e.ships || e.merchants)) return { ok: false, reason: 'Ships are being built here. Cancel them first.' };
    return { ok: true };
  }
  function dismantle(st, p, i) {
    const r = canDismantle(st, p, i);
    if (!r.ok) return r;
    const t = st.tiles[i], was = t.b;
    if (was === 'port' && st.ports) delete st.ports[i];
    t.b = null;
    log(st, `${nameOf(st, p)} pulled down ${DISMANTLE[was]} at ${placeName(st, i)}.`, 'build', [p]);
    return { ok: true, was };
  }
  function cancelBuild(st, p, id) {
    const b = (st.builds || []).find((x) => x.id === id);
    if (!b || b.owner !== p) return { ok: false, reason: 'Nothing like that is being built.' };
    if (st.cur !== p) return { ok: false, reason: 'Wait for your turn.' };
    st.builds = st.builds.filter((x) => x !== b);
    st.players[p].gold += b.cost;
    return { ok: true, refund: b.cost };
  }
  function finishBuilds(st, p) {
    const keep = [];
    for (const b of st.builds || []) {
      if (b.owner !== p) { keep.push(b); continue; }
      b.left--;
      if (b.left > 0) { keep.push(b); continue; }
      if (b.tile != null) {
        const t = st.tiles[b.tile];
        if (t.owner !== p || t.b) continue; // the land was lost meanwhile: the work is lost with it
        if (b.kind === 'castle') { const c = addCity(st, b.tile, p, { walls: 0 }); log(st, `${nameOf(st, p)} founded the castle of ${c.name}.`, 'build', [p]); }
        else { t.b = b.kind === 'outpost' ? 'tower' : b.kind; if (b.kind === 'port') { portOf(st, b.tile); log(st, `${nameOf(st, p)} built a port at ${placeName(st, b.tile)}.`, 'build', [p]); } }
      } else {
        const c = st.cities[b.city];
        if (!c || c.owner !== p) continue;
        if (b.kind === 'walls') c.walls = Math.min(3, c.walls + 1);
        else if (b.kind === 'market') c.market = Math.min(3, c.market + 1);
        else c[b.kind] = true;
      }
    }
    st.builds = keep;
  }

  function canBuild(st, p, i, kind) {
    const t = st.tiles[i], P = st.players[p];
    const cost = kind === 'farm' ? RULES.farmCost : kind === 'mine' ? RULES.mineCost : kind === 'outpost' ? RULES.outpostCost : kind === 'port' ? RULES.portCost : RULES.castleCost;
    const no = (reason) => ({ ok: false, reason, cost });
    if (st.cur !== p) return no('Wait for your turn.');
    if (t.owner !== p) return no('You must control this land.');
    if (t.b) return no('Something is already built here.');
    if (pendingAt(st, i)) return no('Something is already being built here.');
    if (kind === 'farm') {
      if (t.gold) return no('Save gold deposits for a mine.');
      if (!(t.t === 'plains' || t.river)) return no('Farms need plains or a river.');
      const fs = farmSlots(st, p);
      if (fs.farms >= fs.max) return no(`Farm limit reached: 1 farm per ${RULES.tilesPerFarm} tiles you hold (${fs.tiles} tiles allow ${fs.max}).`);
    } else if (kind === 'mine') {
      if (!t.gold) return no('Mines need a gold deposit.');
    } else if (kind === 'castle') {
      if (t.gold) return no('Save gold deposits for a mine.');
      const near = st.cities.find((c) => hexDist(st, c.tile, i) < RULES.castleMinDist);
      if (near) return no(`Too close to ${near.name}. Castles must be ${RULES.castleMinDist}+ tiles apart.`);
      if ((st.builds || []).some((b) => b.kind === 'castle' && hexDist(st, b.tile, i) < RULES.castleMinDist)) return no(`Too close to a castle being built. Castles must be ${RULES.castleMinDist}+ tiles apart.`);
    } else if (kind === 'outpost') {
      if (t.gold) return no('Save gold deposits for a mine.');
      const town = st.cities.find((c) => hexDist(st, c.tile, i) < RULES.outpostSpacing);
      if (town) return no(`${town.name} already guards this ground. Outposts must stand ${RULES.outpostSpacing}+ tiles from towns.`);
      for (let j = 0; j < st.tiles.length; j++) if (st.tiles[j].b === 'tower' && hexDist(st, i, j) < RULES.outpostSpacing) return no(`Too close to another outpost. Outposts must be ${RULES.outpostSpacing}+ tiles apart.`);
    } else if (kind === 'port') {
      if (t.gold) return no('Save gold deposits for a mine.');
      if (!st._nb[i].some((j) => isWater(st, j))) return no('A port must stand on the coast, next to the water.');
    } else return no('Unknown building.');
    if (P.gold < cost) return no(`Needs ${cost} gold.`);
    return { ok: true, cost };
  }

  function build(st, p, i, kind) {
    const r = canBuild(st, p, i, kind);
    if (!r.ok) return r;
    st.players[p].gold -= r.cost;
    const b = queueBuild(st, { owner: p, tile: i, kind, cost: r.cost });
    return Object.assign(r, { pending: true, build: b.id });
  }

  function upgradeInfo(st, p, cityId, kind) {
    const c = st.cities[cityId], P = st.players[p];
    const out = (ok, cost, reason, level, max) => ({ ok, cost, reason, level, max });
    if (!c || c.owner !== p) return out(false, 0, 'Not your city.');
    if (st.cur !== p) return out(false, 0, 'Wait for your turn.');
    let cost, level = 0, max = 1;
    if (kind === 'walls') { level = c.walls; max = 3; if (level >= max) return out(false, 0, 'Walls are at full strength.', level, max); cost = RULES.walls.cost[level]; }
    else if (kind === 'market') { level = c.market; max = 3; if (level >= max) return out(false, 0, 'The market is fully grown.', level, max); cost = RULES.market.cost[level]; }
    else if (kind === 'harbor') { level = c.harbor ? 1 : 0; if (c.harbor) return out(false, 0, 'Harbor built.', 1, 1); if (!isCoastal(st, c.tile)) return out(false, 0, 'Only coastal cities can build a harbor.', 0, 1); cost = RULES.harborCost; }
    else if (kind === 'stables') { level = c.stables ? 1 : 0; if (c.stables) return out(false, 0, 'Stables built.', 1, 1); cost = RULES.stablesCost; }
    else if (kind === 'barracks') { level = c.barracks ? 1 : 0; if (c.barracks) return out(false, 0, 'Barracks built.', 1, 1); cost = RULES.barracksCost; }
    else if (kind === 'foundry') { level = c.foundry ? 1 : 0; if (c.foundry) return out(false, 0, 'Foundry built.', 1, 1); cost = RULES.foundryCost; }
    else return out(false, 0, 'Unknown upgrade.');
    if (pendingIn(st, cityId, kind)) return out(false, cost, 'Already being built: ready next turn.', level, max);
    if (P.gold < cost) return out(false, cost, `Needs ${cost} gold.`, level, max);
    return out(true, cost, '', level, max);
  }

  function upgrade(st, p, cityId, kind) {
    const r = upgradeInfo(st, p, cityId, kind);
    if (!r.ok) return r;
    st.players[p].gold -= r.cost;
    const b = queueBuild(st, { owner: p, city: cityId, kind, cost: r.cost });
    return Object.assign(r, { pending: true, build: b.id });
  }

  const recruitCap = (c) => RULES.recruitBase + RULES.recruitPerWall * c.walls;

  function canRecruit(st, p, cityId, k, n) {
    const c = st.cities[cityId], P = st.players[p];
    const cost = UNITS[k].cost * n;
    const no = (reason) => ({ ok: false, reason, cost });
    if (!c || c.owner !== p) return no('Not your city.');
    if (st.cur !== p) return no('Wait for your turn.');
    const need = UNITS[k].needs;
    if (need && !c[need]) return no(`Build ${{ stables: 'Stables', barracks: 'Barracks', foundry: 'a Foundry' }[need]} here to train ${UNITS[k].name.toLowerCase()}.`);
    const left = recruitCap(c) - c.recruited;
    if (n > left) return no(left > 0 ? `Only ${left} more recruits here this turn.` : 'No more recruits here this turn.');
    if (P.gold < cost) return no(`Needs ${cost} gold.`);
    return { ok: true, cost };
  }

  function recruit(st, p, cityId, k, n) {
    const r = canRecruit(st, p, cityId, k, n);
    if (!r.ok) return r;
    const c = st.cities[cityId];
    st.players[p].gold -= r.cost;
    c.recruited += n;
    const u = Z(); u[k] = n;
    queueTraining(c).u = queueTraining(c).u.map((x, j) => x + u[j]);
    return Object.assign(r, { training: true });
  }

  // Recruits train for RULES.trainTurns turns before they join the garrison (or, for warships, put to sea).
  function queueTraining(c) {
    c.train = c.train || [];
    let e = c.train.find((x) => x.left === RULES.trainTurns);
    if (!e) { e = { left: RULES.trainTurns, u: Z(), ships: 0 }; c.train.push(e); }
    return e;
  }
  function training(c) {
    const u = Z(); let ships = 0;
    let merchants = 0;
    for (const e of c.train || []) { e.u.forEach((n, k) => { u[k] += n; }); ships += e.ships || 0; merchants += e.merchants || 0; }
    return { u, ships, merchants, soonest: (c.train || []).reduce((m, e) => Math.min(m, e.left), Infinity) };
  }
  // call off recruits still in training (unit index k, or 'ships'): the gold comes back in full
  function cancelTraining(st, p, cityId, k, n) {
    const c = st.cities[cityId];
    if (!c || c.owner !== p) return { ok: false, reason: 'Not your town.' };
    if (st.cur !== p) return { ok: false, reason: 'Wait for your turn.' };
    let left = n == null ? Infinity : n, done = 0;
    // newest orders first
    for (const e of (c.train || []).slice().reverse()) {
      if (left <= 0) break;
      const boat = k === 'ships' || k === 'merchants';
      const have = boat ? e[k] || 0 : e.u[k] || 0;
      const take = Math.min(have, left);
      if (!take) continue;
      if (boat) e[k] -= take; else e.u[k] -= take;
      if (e.left === RULES.trainTurns) { if (boat) c.ships = Math.max(0, (c.ships || 0) - take); else c.recruited = Math.max(0, c.recruited - take); }
      left -= take; done += take;
    }
    c.train = (c.train || []).filter((e) => sum(e.u) || e.ships || e.merchants);
    if (!done) return { ok: false, reason: 'Nothing of that kind is in training here.' };
    const refund = done * (k === 'ships' ? RULES.shipCost : k === 'merchants' ? RULES.merchantCost : UNITS[k].cost);
    st.players[p].gold += refund;
    return { ok: true, n: done, refund };
  }
  function trainingOf(st, p) { let n = 0; for (const c of st.cities) if (c.owner === p) { const t = training(c); n += sum(t.u) + t.ships + t.merchants; } return n; }
  // at the start of the owner's turn, finished recruits step out ready to march
  function finishTraining(st, p) {
    for (const k of Object.keys(st.ports || {})) {
      const i = +k, d = st.ports[k];
      if (st.tiles[i].b !== 'port') { delete st.ports[k]; continue; }
      if (st.tiles[i].owner !== p) continue;
      d.ships = 0;
      const keep = [];
      for (const e of d.train || []) {
        e.left--;
        if (e.left > 0) { keep.push(e); continue; }
        let wait = false;
        for (const kind of ['war', 'merchant']) {
          const n = e[trainKey(kind)] || 0;
          if (!n) continue;
          const berth = shipBerth(st, i, p, kind);
          if (berth == null) { wait = true; continue; }
          placeFleet(st, p, berth, n, 0, kind); e[trainKey(kind)] = 0;
        }
        if (wait) { e.left = 0; keep.push(e); }
      }
      d.train = keep;
    }
    for (const c of st.cities) {
      if (c.owner !== p || !c.train || !c.train.length) continue;
      const keep = [];
      for (const e of c.train) {
        e.left--;
        if (e.left > 0) { keep.push(e); continue; }
        if (sum(e.u)) placeArmy(st, p, c.tile, normU(e.u));
        let wait = false;
        for (const kind of ['war', 'merchant']) {
          const n = e[trainKey(kind)] || 0;
          if (!n) continue;
          const berth = shipBerth(st, c.tile, p, kind);
          if (berth == null) { wait = true; continue; }
          placeFleet(st, p, berth, n, 0, kind); e[trainKey(kind)] = 0;
        }
        if (wait) { e.left = 0; e.u = Z(); keep.push(e); log(st, `Enemy ships blockade ${c.name}: its new ships wait in port.`, 'warn', [p]); }
      }
      c.train = keep;
    }
  }

  // ---------------------------------------------------------------- turns & scoring
  function ordersPerTurn(st, p) {
    const cities = st.cities.filter((c) => c.owner === p).length;
    return Math.min(RULES.ordersMax, RULES.ordersBase + cities);
  }

  function startTurn(st) {
    st.turnNo++;
    const p = st.cur, P = st.players[p];
    P.orders = ordersPerTurn(st, p);
    for (const c of st.cities) if (c.owner === p) c.recruited = 0;
    for (const a of st.armies) if (a.owner === p) { a.used = 0; a.took = 0; delete a.landed; }
    for (const f of st.fleets || []) if (f.owner === p) { f.used = 0; f.fired = false; f.stay = stayOf(f) + 1; }
    for (const c of st.cities) if (c.owner === p) c.ships = 0;
    finishTraining(st, p);
    finishBuilds(st, p);
    const inc = income(st, p);
    P.lastIncome = inc.net;
    P.gold += inc.net;
    diplomacyTurn(st, p);
    if (P.gold < 0) {
      let lost = 0;
      for (const a of st.armies) if (a.owner === p) {
        for (let k = 0; k < NU; k++) { const d = Math.ceil((a.u[k] || 0) * 0.15); a.u[k] -= d; lost += d; }
      }
      st.armies = st.armies.filter((a) => sum(a.u) > 0);
      P.gold = 0;
      if (lost) log(st, `${P.name} could not pay the troops. ${lost} soldiers deserted.`, 'warn', [p]);
    }
    return inc;
  }

  // ---------------------------------------------------------------- the sea: fleets, naval battles, bombardment
  Object.assign(RULES, { buildTurns: 1, seaUpkeep: 0.5, portCost: 140, portUpkeep: 1, riverShips: 3, trainTurns: 1, shipCost: 50, shipUpkeep: 2, shipAtt: 2, shipDef: 2, merchantCost: 50, merchantUpkeep: 2, merchantPow: 0.5, postSetup: 1, fleetMP: 9, shipsPerTurn: 2,
    // armies aboard ships: board at an own harbor for gold, sail fast, but are nearly helpless against warships
    transportMP: 8, embarkBase: 5, embarkPer: 1, transportDef: 0.06, transportLoss: 0.6, bombardHit: 7, bombardWallHit: 9 });
  const fleetAt = (st, tile) => (st.fleets || []).find((f) => f.tile === tile) || null;
  // merchant ships: half a warship's strength, no guns, no blockades, but they earn a trading post's full gold
  const isMerchant = (f) => !!f && f.kind === 'merchant';
  const shipPow = (f, n) => (n == null ? f.n : n) * (isMerchant(f) ? RULES.merchantPow : 1);
  const shipCostOf = (kind) => (kind === 'merchant' ? RULES.merchantCost : RULES.shipCost);
  const trainKey = (kind) => (kind === 'merchant' ? 'merchants' : 'ships');
  // turns a fleet has lain at its post (fleets from older saves count as settled)
  // what still defends a trading post (in warships), 0 when it is open
  const guardAt = (st, tile) => (st.guards && st.guards[tile]) || 0;
  const stayOf = (f) => (f.stay == null ? RULES.postSetup + 1 : f.stay);
  const getFleet = (st, id) => (st.fleets || []).find((f) => f.id === id) || null;
  const isWater = (st, i) => st.tiles[i].t === 'water';
  // small fleets (up to RULES.riverShips warships) can also sail up rivers, past anything but foreign towns and troops
  function sailable(st, i, f, n) {
    if (isWater(st, i)) return true;
    const t = st.tiles[i];
    if (!t.river || (n != null ? n : f.n) > RULES.riverShips) return false;
    const c = cityAt(st, i), a = armyAt(st, i);
    return !(c && c.owner !== f.owner) && !(a && a.owner !== f.owner) && !(t.b === 'tower' && t.owner !== f.owner);
  }
  const seaArmyAt = (st, tile) => st.armies.find((a) => a.tile === tile && a.sea) || null;
  const vesselAt = (st, tile) => fleetAt(st, tile) || seaArmyAt(st, tile);
  const atWar = (st, a, b) => a !== b && !(a >= 0 && b >= 0 && atPeace(st, a, b));

  function placeFleet(st, owner, tile, n, used, kind) {
    const ex = fleetAt(st, tile);
    if (ex && ex.owner === owner && isMerchant(ex) === (kind === 'merchant')) { ex.n += n; ex.used = Math.max(ex.used || 0, used || 0); return ex; }
    const f = { id: st.nextId++, owner, tile, n, used: used || 0, fired: false, stay: 0 };
    if (kind === 'merchant') f.kind = 'merchant';
    st.fleets.push(f);
    return f;
  }

  function canRecruitShips(st, p, cityId, n, kind) {
    const c = st.cities[cityId], P = st.players[p];
    const cost = shipCostOf(kind) * n;
    const no = (reason) => ({ ok: false, reason, cost });
    if (!c || c.owner !== p) return no('Not your town.');
    if (st.cur !== p) return no('Wait for your turn.');
    if (!c.harbor) return no('Build a Harbor here to launch warships.');
    if ((c.ships || 0) + n > RULES.shipsPerTurn) return no(`A harbor launches at most ${RULES.shipsPerTurn} ships a turn.`);
    if (shipBerth(st, c.tile, p, kind) == null) return no('Enemy ships blockade this harbor.');
    if (P.gold < cost) return no(`Needs ${cost} gold.`);
    return { ok: true, cost };
  }
  // the water tile where new ships appear: next to an own fleet if there is one, else any free water
  function shipBerth(st, tile, p, kind) {
    const water = st._nb[tile].filter((j) => isWater(st, j));
    const same = (j) => { const f = fleetAt(st, j); return f && f.owner === p && isMerchant(f) === (kind === 'merchant'); };
    const near = water.find(same) ?? water.find((j) => !vesselAt(st, j));
    if (near != null) return near;
    // the water by the harbor is taken by own ships of the other kind: the next ring out, past them
    const mine = water.filter((j) => { const f = fleetAt(st, j); return f && f.owner === p; });
    for (const w of mine) for (const j of st._nb[w]) if (isWater(st, j) && (same(j) || !vesselAt(st, j))) return j;
    return null;
  }
  function recruitShips(st, p, cityId, n, kind) {
    const r = canRecruitShips(st, p, cityId, n, kind);
    if (!r.ok) return r;
    const c = st.cities[cityId], e = queueTraining(c), key = trainKey(kind);
    st.players[p].gold -= r.cost;
    c.ships = (c.ships || 0) + n;
    e[key] = (e[key] || 0) + n;
    return Object.assign(r, { training: true });
  }

  const fleetMovesLeft = (f) => Math.max(0, RULES.fleetMP - (f.used || 0));
  // water routes for a fleet: other fleets block the way; an enemy fleet may be attacked at the end
  // n: how many of the fleet's ships sail (a detachment), default all of them
  function fleetReach(st, fleetId, n) {
    const f = getFleet(st, fleetId);
    const N = st.tiles.length, dist = new Int32Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
    const left = fleetMovesLeft(f);
    dist[f.tile] = 0;
    const q = [f.tile];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (dist[i] >= left) continue;
      const here = vesselAt(st, i);
      if (i !== f.tile && here && here.owner !== f.owner) continue; // cannot sail through other ships
      for (const j of st._nb[i]) {
        if (dist[j] >= 0 || !sailable(st, j, f, n)) continue;
        const there = vesselAt(st, j);
        if (there && there.owner !== f.owner && !atWar(st, f.owner, there.owner)) continue; // peace: keep clear
        dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
      }
    }
    return { dist, prev, left };
  }
  function planFleet(st, fleetId, dest, n) {
    const f = getFleet(st, fleetId);
    if (!f) return { valid: false, errors: ['That fleet is gone.'] };
    n = Math.max(1, Math.min(f.n, n == null ? f.n : n | 0));
    const errors = [];
    if (f.owner !== st.cur) errors.push('It is not your turn.');
    if (!sailable(st, dest, f, n)) errors.push(st.tiles[dest].river && n > RULES.riverShips ? `Too many ships for a river: at most ${RULES.riverShips} warships can sail up one.` : st.tiles[dest].river ? 'Foreign troops or a foreign town hold that stretch of river.' : 'Ships sail on water and rivers.');
    const mate = fleetAt(st, dest);
    if (mate && mate.owner === f.owner && !isWater(st, dest) && mate.n + n > RULES.riverShips) errors.push(`Too crowded: at most ${RULES.riverShips} warships fit on a river.`);
    const r = fleetReach(st, fleetId, n);
    if (fleetMovesLeft(f) <= 0) errors.push('This fleet has no moves left this turn.');
    else if (!(r.dist[dest] > 0)) errors.push('Too far for this fleet this turn.');
    const path = [];
    if (r.dist[dest] > 0) for (let j = dest; j !== f.tile && j >= 0; j = r.prev[j]) path.unshift(j);
    const foe = fleetAt(st, dest), prey = !foe && seaArmyAt(st, dest);
    if (prey && prey.owner === f.owner) errors.push('Your own soldiers are aboard ships there.');
    if (mate && mate.owner === f.owner && isMerchant(mate) !== isMerchant(f)) errors.push('Merchant ships and warships cannot share a tile.');
    const guard = !foe && !prey ? guardAt(st, dest) : 0;
    const battle = foe && foe.owner !== f.owner ? { owner: foe.owner, n: foe.n, merchant: isMerchant(foe), p: navalOdds(shipPow(f, n), shipPow(foe)).p }
      : prey && prey.owner !== f.owner ? { owner: prey.owner, n: sum(prey.u), p: transportOdds(shipPow(f, n), prey.u).p, transport: true }
      : guard ? { owner: -1, n: guard, p: navalOdds(shipPow(f, n), guard).p, guard: true } : null;
    return { valid: !errors.length, errors, path, battle, dest, fleetId, n };
  }
  // a and d in warship-equivalents (shipPow). Luck swings wider at sea than on land: wind and weather.
  const seaLuck = (s) => 0.45 + (s - 2) * 0.11;
  function navalOdds(a, d) {
    const A = a * RULES.shipAtt, D = d * RULES.shipDef;
    let p = 0;
    for (const x of DICE) for (const y of DICE) if (A * seaLuck(x.s) > D * seaLuck(y.s)) p += x.p * y.p;
    return { p, A, D };
  }
  // warships against soldiers crammed into transports: the soldiers barely fight back
  function transportOdds(n, u) {
    const A = n * RULES.shipAtt, D = Math.max(0.01, sum(u) * RULES.transportDef);
    let p = 0;
    for (const x of DICE) for (const y of DICE) if (A * luck(x.s) > D * luck(y.s)) p += x.p * y.p;
    return { p, A, D };
  }
  function harborWaterOf(st, p) {
    for (const h of harborSites(st, p)) { const w = shipBerth(st, h, p); if (w != null) return w; }
    return null;
  }
  // every place a house's ships call home: towns with a harbor, then ports
  function harborSites(st, p) {
    const out = st.cities.filter((c) => c.owner === p && c.harbor).map((c) => c.tile);
    for (const k of Object.keys(st.ports || {})) { const i = +k; if (st.tiles[i].b === 'port' && st.tiles[i].owner === p) out.push(i); }
    return out;
  }
  // A fleet blocks the trade of the houses its owner picks (only houses at war with it).
  function setBlockade(st, fleetId, target, on) {
    const f = getFleet(st, fleetId);
    if (!f || f.owner !== st.cur) return { ok: false, reason: 'It is not your turn.' };
    if (on && isMerchant(f)) return { ok: false, reason: 'Merchant ships cannot blockade.' };
    if (on && !atWar(st, f.owner, target)) return { ok: false, reason: 'You are at peace with them.' };
    const set = new Set(f.block || []);
    if (on) set.add(target); else set.delete(target);
    f.block = [...set];
    if (on) log(st, `${nameOf(st, f.owner)}'s warships blockade the trade of ${nameOf(st, target)}.`, 'battle', [f.owner, target]);
    return { ok: true };
  }
  // the trade routes of other houses that pass through a tile
  function routesThrough(st, tile, me) {
    const out = [];
    for (const P of st.players) {
      if (!P.alive || P.id === me) continue;
      for (const r of tradeRoutes(st, P.id)) if (!r.settling && r.path.includes(tile)) out.push(Object.assign({ owner: P.id }, r));
    }
    return out;
  }
  // ---- ports: a harbor on the coast without a town. Warships are built there and armies board there.
  function portOf(st, i) {
    if (st.tiles[i].b !== 'port') return null;
    st.ports = st.ports || {};
    return (st.ports[i] = st.ports[i] || { ships: 0, train: [] });
  }
  function canPortShips(st, p, i, n, kind) {
    const t = st.tiles[i], P = st.players[p], cost = shipCostOf(kind) * n;
    const no = (reason) => ({ ok: false, reason, cost });
    if (t.b !== 'port' || t.owner !== p) return no('Not your port.');
    if (st.cur !== p) return no('Wait for your turn.');
    const d = portOf(st, i);
    if ((d.ships || 0) + n > RULES.shipsPerTurn) return no(`A port launches at most ${RULES.shipsPerTurn} ships a turn.`);
    if (shipBerth(st, i, p, kind) == null) return no('Enemy ships blockade this port.');
    if (P.gold < cost) return no(`Needs ${cost} gold.`);
    return { ok: true, cost };
  }
  function portShips(st, p, i, n, kind) {
    const r = canPortShips(st, p, i, n, kind);
    if (!r.ok) return r;
    const d = portOf(st, i), e = queueTraining(d), key = trainKey(kind);
    st.players[p].gold -= r.cost;
    d.ships = (d.ships || 0) + n;
    e[key] = (e[key] || 0) + n;
    return Object.assign(r, { training: true });
  }
  function cancelPortShips(st, p, i, n, kind) {
    const d = portOf(st, i), key = trainKey(kind);
    if (!d || st.tiles[i].owner !== p || st.cur !== p) return { ok: false, reason: 'Not your port.' };
    let left = n == null ? Infinity : n, done = 0;
    for (const e of d.train.slice().reverse()) {
      const take = Math.min(e[key] || 0, left);
      if (!take) continue;
      e[key] -= take; left -= take; done += take;
      if (e.left === RULES.trainTurns) d.ships = Math.max(0, (d.ships || 0) - take);
    }
    d.train = d.train.filter((e) => e.ships || e.merchants);
    if (!done) return { ok: false, reason: 'No ships of that kind are being built here.' };
    st.players[p].gold += done * shipCostOf(kind);
    return { ok: true, n: done, refund: done * shipCostOf(kind) };
  }
  // sail n ships of a fleet (all by default); the rest stay where they are as their own fleet
  function moveFleet(st, fleetId, dest, n) {
    const plan = planFleet(st, fleetId, dest, n);
    if (!plan.valid) return { error: plan.errors[0] };
    const f = getFleet(st, fleetId);
    let mover = f;
    if (plan.n < f.n) {
      f.n -= plan.n;
      mover = { id: st.nextId++, owner: f.owner, tile: f.tile, n: plan.n, used: f.used || 0, fired: !!f.fired, block: (f.block || []).slice(), stay: f.stay };
      if (f.kind) mover.kind = f.kind;
      st.fleets.push(mover);
    }
    const rep = sailFleet(st, mover, dest, plan);
    rep.split = mover !== f;
    if (st.fleets.includes(mover)) {
      // a detachment beaten back to where it started rejoins the ships it left there
      const mate = st.fleets.find((x) => x !== mover && x.owner === mover.owner && x.tile === mover.tile && isMerchant(x) === isMerchant(mover));
      if (mate) { mate.n += mover.n; mate.used = Math.max(mate.used || 0, mover.used || 0); mate.fired = mate.fired && mover.fired; st.fleets = st.fleets.filter((x) => x !== mover); rep.fleet = mate.id; }
      else rep.fleet = mover.id;
    } else { const there = fleetAt(st, rep.end); rep.fleet = there && there.owner === mover.owner ? there.id : null; }
    return rep;
  }
  // where a beaten fleet falls back to: the last tile of its course it can stand on (free water, or its own ships of
  // the same kind, which it rejoins), else where it set out from
  function fallBack(st, f, plan, origin) {
    for (let k = plan.path.length - 2; k >= 0; k--) {
      const j = plan.path[k];
      if (seaArmyAt(st, j)) continue;
      const o = (st.fleets || []).find((x) => x !== f && x.tile === j);
      if (!o || (o.owner === f.owner && isMerchant(o) === isMerchant(f))) return j;
    }
    return origin;
  }
  function sailFleet(st, f, dest, plan) {
    const me = f.owner, P = st.players[me];
    const rep = { me, origin: f.tile, path: plan.path, battle: null, end: dest };
    const foe = fleetAt(st, dest);
    f.stay = 0;
    if (foe && foe.owner === me) { st.fleets = st.fleets.filter((x) => x !== f); foe.block = [...new Set((foe.block || []).concat(f.block || []))]; foe.n += f.n; foe.used = Math.max(foe.used, (f.used || 0) + plan.path.length); rep.end = dest; return rep; }
    f.used = (f.used || 0) + plan.path.length;
    const prey = !foe && seaArmyAt(st, dest);
    if (prey) {
      // the fleet closes in and fires; it does not take the transports' place
      const roll = () => 1 + Math.floor(rand(st) * 6);
      const ad = [roll(), roll()], dd = [roll(), roll()];
      const o = transportOdds(shipPow(f), prey.u), n0 = sum(prey.u), ships0 = f.n;
      const Ae = o.A * seaLuck(ad[0] + ad[1]), De = o.D * seaLuck(dd[0] + dd[1]);
      const win = Ae > De, lf = lossFracs(win ? Ae / De : De / Ae);
      prey.u = applyLoss(st, prey.u, win ? Math.max(RULES.transportLoss, lf.loser) : lf.winner);
      const sink = (n, frac) => (frac >= 1 ? n : n - Math.min(n, Math.floor(n * frac + rand(st))));
      const aAfter = win ? f.n : Math.max(0, sink(f.n, lf.loser));
      const dAfter = sum(prey.u);
      f.used = SPENT; f.n = aAfter;
      f.tile = fallBack(st, f, plan, rep.origin);
      if (f.n <= 0) st.fleets = st.fleets.filter((x) => x !== f);
      prey.used = SPENT;
      if (!dAfter) removeArmy(st, prey);
      rep.end = f.n > 0 ? f.tile : -1;
      rep.battle = { att: ships0, attAfter: aAfter, def: n0, defAfter: dAfter, ad, dd, A: o.A, D: o.D, Ae, De, win, odds: o.p, defender: prey.owner, transport: true, fate: dAfter ? 'scattered' : 'sunk' };
      const drowned = n0 - dAfter;
      if (prey.owner >= 0) st.players[prey.owner].stats.fallen += drowned;
      P.stats.slain += drowned;
      if (win) { P.stats.won++; if (st.players[prey.owner]) st.players[prey.owner].stats.lost++; } else { P.stats.lost++; if (st.players[prey.owner]) st.players[prey.owner].stats.won++; }
      log(st, win ? `${P.name}'s warships fell on ${nameOf(st, prey.owner)}'s transports: ${count(drowned, 'soldier', 'soldiers')} drowned${dAfter ? '' : ', none survived'}.`
        : `${nameOf(st, prey.owner)}'s soldiers fought off ${P.name}'s warships from their transports.`, 'battle', [me, prey.owner]);
      return rep;
    }
    const guard = !foe ? guardAt(st, dest) : 0;
    if (guard) {
      // the defences of a trading post: beat them once and the post is open for good
      const post = (st._posts || []).find((x) => x.tile === dest), where = post ? post.name : placeName(st, dest);
      const roll = () => 1 + Math.floor(rand(st) * 6);
      const ad = [roll(), roll()], dd = [roll(), roll()];
      const o = navalOdds(shipPow(f), guard);
      const Ae = o.A * seaLuck(ad[0] + ad[1]), De = o.D * seaLuck(dd[0] + dd[1]);
      const win = Ae > De, lf = lossFracs(win ? Ae / De : De / Ae);
      const sink = (n, frac) => (frac >= 1 ? n : n - Math.min(n, Math.floor(n * frac + rand(st))));
      const aAfter = Math.max(win ? 1 : 0, sink(f.n, win ? lf.winner : lf.loser));
      const dAfter = win ? 0 : Math.max(1, sink(guard, lf.winner));
      rep.battle = { att: f.n, def: guard, attAfter: aAfter, defAfter: dAfter, ad, dd, A: o.A, D: o.D, Ae, De, win, odds: o.p, defender: -1, guard: true, where };
      f.used = SPENT; f.n = aAfter;
      if (win) {
        delete st.guards[dest];
        f.tile = dest;
        P.stats.won++;
        log(st, `${P.name}'s fleet broke the defences of ${where} (${Math.round(o.p * 100)}% odds). The post is open to trade.`, 'battle', [me]);
      } else {
        st.guards[dest] = dAfter;
        P.stats.lost++;
        if (f.n <= 0) st.fleets = st.fleets.filter((x) => x !== f);
        else f.tile = fallBack(st, f, plan, rep.origin);
        rep.end = f.n > 0 ? f.tile : -1;
        log(st, `The defences of ${where} drove off ${P.name}'s fleet (${Math.round(o.p * 100)}% odds for the attacker).`, 'battle', [me]);
      }
      return rep;
    }
    if (foe) {
      const roll = () => 1 + Math.floor(rand(st) * 6);
      const ad = [roll(), roll()], dd = [roll(), roll()];
      const o = navalOdds(shipPow(f), shipPow(foe));
      const Ae = o.A * seaLuck(ad[0] + ad[1]), De = o.D * seaLuck(dd[0] + dd[1]);
      const win = Ae > De, lf = lossFracs(win ? Ae / De : De / Ae);
      const sink = (n, frac) => (frac >= 1 ? n : n - Math.min(n, Math.floor(n * frac + rand(st))));
      const aAfter = Math.max(win ? 1 : 0, sink(f.n, win ? lf.winner : lf.loser));
      const dAfter = Math.max(win ? 0 : 1, sink(foe.n, win ? lf.loser : lf.winner));
      rep.battle = { att: f.n, def: foe.n, attAfter: aAfter, defAfter: dAfter, ad, dd, A: o.A, D: o.D, Ae, De, win, odds: o.p, defender: foe.owner };
      f.used = SPENT;
      if (win) {
        st.fleets = st.fleets.filter((x) => x !== foe);
        rep.battle.fate = 'sunk';
        P.stats.won++; if (st.players[foe.owner]) st.players[foe.owner].stats.lost++;
        // the winner takes the water first, so the beaten ships cannot flee onto it
        f.n = aAfter; f.tile = dest;
        if (dAfter > 0) { const home = harborWaterOf(st, foe.owner); if (home != null && !fleetAt(st, home) && !seaArmyAt(st, home)) { placeFleet(st, foe.owner, home, dAfter, SPENT, foe.kind); rep.battle.fate = 'fled'; } }
        if (rep.battle.fate === 'sunk') rep.battle.defAfter = 0;
        log(st, `${P.name}'s fleet won a sea battle against ${nameOf(st, foe.owner)} (${Math.round(o.p * 100)}% odds).`, 'battle', [me, foe.owner]);
      } else {
        P.stats.lost++; if (st.players[foe.owner]) st.players[foe.owner].stats.won++;
        foe.n = dAfter;
        f.n = aAfter;
        if (f.n <= 0) st.fleets = st.fleets.filter((x) => x !== f);
        else f.tile = fallBack(st, f, plan, rep.origin);
        rep.end = f.n > 0 ? f.tile : -1;
        log(st, `${nameOf(st, foe.owner)}'s fleet held the sea against ${P.name} (${Math.round(o.p * 100)}% odds for the attacker).`, 'battle', [me, foe.owner]);
      }
      return rep;
    }
    f.tile = dest;
    return rep;
  }

  // enemy armies on land next to the fleet, which its guns can reach
  function bombardTargets(st, fleetId) {
    const f = getFleet(st, fleetId);
    if (!f || f.fired || isMerchant(f)) return [];
    const out = [];
    for (const j of st._nb[f.tile]) {
      const a = armyAt(st, j);
      if (a && atWar(st, f.owner, a.owner)) out.push(j);
    }
    return out;
  }
  function bombard(st, fleetId, tile) {
    const f = getFleet(st, fleetId);
    if (!f || f.owner !== st.cur) return { error: 'It is not your turn.' };
    if (f.fired) return { error: 'This fleet has already fired this turn.' };
    if (!bombardTargets(st, fleetId).includes(tile)) return { error: 'No enemy army in range of the guns there.' };
    const a = armyAt(st, tile), walls = !!cityAt(st, tile);
    const need = walls ? RULES.bombardWallHit : RULES.bombardHit;
    let kills = 0;
    const rolls = [];
    for (let k = 0; k < f.n; k++) { const r = 2 + Math.floor(rand(st) * 6) + Math.floor(rand(st) * 6); rolls.push(r); if (r >= need) kills++; }
    kills = Math.min(kills, sum(a.u));
    const lost = Z();
    for (let k = 0; k < kills; k++) {
      // each hit falls on a random soldier
      let pick = Math.floor(rand(st) * sum(a.u));
      for (let u = 0; u < NU; u++) { if (pick < a.u[u]) { a.u[u]--; lost[u]++; break; } pick -= a.u[u]; }
    }
    if (sum(a.u) === 0) removeArmy(st, a);
    f.fired = true;
    if (a.owner >= 0) { st.players[a.owner].stats.fallen += kills; }
    st.players[f.owner].stats.slain += kills;
    log(st, `${nameOf(st, f.owner)}'s warships bombarded ${placeName(st, tile)}: ${count(kills, 'soldier', 'soldiers')} of ${nameOf(st, a.owner)} fell.`, 'battle', [f.owner, a.owner]);
    return { kills, rolls, need, walls, lost, owner: a.owner, tile };
  }

  // ---------------------------------------------------------------- armies at sea
  // An army in one of your harbor towns can pay to board ships. Afloat it sails fast over water but cannot attack;
  // warships that catch it drown most of it. It lands on any open shore tile next to the water, which ends its turn.
  const embarkCost = (u) => RULES.embarkBase + sum(u) * RULES.embarkPer;
  const embarkBerth = (st, tile) => st._nb[tile].find((j) => isWater(st, j) && !vesselAt(st, j)) ?? null;
  function canEmbark(st, armyId, u) {
    const a = getArmy(st, armyId), no = (reason) => ({ ok: false, reason });
    if (!a) return no('That army is gone.');
    const mov = movable(a);
    u = UNITS.map((_, k) => Math.max(0, Math.min((u || mov)[k] | 0, mov[k] || 0)));
    if (a.owner !== st.cur) return no('It is not your turn.');
    if (a.sea) return no('This army is already at sea.');
    const c = cityAt(st, a.tile);
    const port = st.tiles[a.tile].b === 'port' && st.tiles[a.tile].owner === a.owner;
    if (!port && (!c || c.owner !== a.owner || !c.harbor)) return no('Armies board ships in one of your towns with a harbor, or at one of your ports.');
    if (!sum(u)) return no('Choose who boards.');
    if ((a.used || 0) >= SPENT) return no('This army lost a battle this turn.');
    if ((a.used || 0) + 1 >= RULES.transportMP || movesLeft(a, u) <= 0) return no('This army has no steps left this turn.');
    const berth = embarkBerth(st, a.tile);
    if (berth == null) return no('No free water beside the harbor: ships are in the way.');
    const cost = embarkCost(u);
    if (st.players[a.owner].gold < cost) return no(`Ships for ${count(sum(u), 'soldier', 'soldiers')} cost ${cost} gold.`);
    return { ok: true, cost, berth, u };
  }
  function embark(st, armyId, u) {
    const r = canEmbark(st, armyId, u);
    if (!r.ok) return r;
    const a = getArmy(st, armyId);
    st.players[a.owner].gold -= r.cost;
    a.u = a.u.map((n, k) => n - r.u[k]);
    const t = { id: st.nextId++, owner: a.owner, tile: r.berth, u: r.u.slice(), used: (a.used || 0) + 1, took: a.took || 0, sea: true };
    if (!sum(a.u)) removeArmy(st, a);
    st.armies.push(t);
    log(st, `${nameOf(st, t.owner)} put ${count(sum(t.u), 'soldier', 'soldiers')} aboard ships at ${placeName(st, a.tile)}.`, 'move', [t.owner]);
    return Object.assign(r, { army: t.id });
  }
  // water a transport can reach: it passes its own warships but no other vessel
  function seaReach(st, armyId) {
    const a = getArmy(st, armyId);
    const N = st.tiles.length, dist = new Int32Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
    const left = movesLeft(a);
    dist[a.tile] = 0;
    const q = [a.tile];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (dist[i] >= left) continue;
      for (const j of st._nb[i]) {
        if (dist[j] >= 0 || !isWater(st, j)) continue;
        const f = fleetAt(st, j);
        if ((f && f.owner !== a.owner) || seaArmyAt(st, j)) continue;
        dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
      }
    }
    return { dist, prev, left };
  }
  function planSail(st, armyId, dest) {
    const a = getArmy(st, armyId);
    if (!a || !a.sea) return { valid: false, errors: ['That army is not at sea.'], path: [] };
    const errors = [], me = a.owner;
    if (me !== st.cur) errors.push('It is not your turn.');
    const r = seaReach(st, armyId), left = r.left;
    const route = (to) => { const path = []; for (let j = to; j !== a.tile && j >= 0; j = r.prev[j]) path.unshift(j); return path; };
    if (left <= 0) errors.push('These ships have no moves left this turn.');
    if (isWater(st, dest)) {
      if (fleetAt(st, dest) || seaArmyAt(st, dest)) errors.push(fleetAt(st, dest) && fleetAt(st, dest).owner !== me ? 'Transports cannot attack warships.' : 'Another ship is there.');
      else if (guardAt(st, dest)) errors.push('Local defences hold this trading post. Warships must clear them first.');
      else if (!(r.dist[dest] > 0)) errors.push(`Too far: these ships have ${left} move${left === 1 ? '' : 's'} left.`);
      return { valid: !errors.length, errors, path: r.dist[dest] > 0 ? route(dest) : [], land: false, dest };
    }
    // landing: one more move from a water tile next to the shore
    let from = -1;
    for (const w of st._nb[dest]) if (isWater(st, w) && r.dist[w] >= 0 && r.dist[w] < left && (from < 0 || r.dist[w] < r.dist[from])) from = w;
    const why = landBlock(st, me, dest);
    if (why) errors.push(why);
    else if (from < 0 && left > 0) errors.push(`Too far to land there: these ships have ${left} move${left === 1 ? '' : 's'} left.`);
    const path = from >= 0 ? route(from).concat([dest]) : [];
    return { valid: !errors.length, errors, path, land: true, dest, claims: st.tiles[dest].owner !== me };
  }
  // why soldiers cannot come ashore on tile i, or null
  function landBlock(st, me, i) {
    const t = st.tiles[i], c = cityAt(st, i), o = armyAt(st, i);
    if (!passable(st, i)) return 'Mountains: no place to land.';
    if (!st._nb[i].some((w) => isWater(st, w))) return 'Land on a tile beside the water.';
    if (c && c.owner !== me) return 'A walled town cannot be stormed from the boats. Land beside it, then attack next turn.';
    if (o && o.owner !== me) return 'Enemy soldiers hold that beach. Land beside them.';
    if (t.b === 'tower' && t.owner !== me) return 'An outpost guards that shore. Land beside it.';
    if (t.owner >= 0 && t.owner !== me && atPeace(st, me, t.owner)) return `You are at peace with ${nameOf(st, t.owner)}.`;
    return null;
  }
  // every shore tile these transports can land on this turn
  function landingSpots(st, armyId, reach) {
    const a = getArmy(st, armyId), r = reach || seaReach(st, armyId), out = new Set();
    for (let w = 0; w < st.tiles.length; w++) {
      if (!(r.dist[w] >= 0) || r.dist[w] >= r.left) continue;
      for (const j of st._nb[w]) if (!isWater(st, j) && !out.has(j) && !landBlock(st, a.owner, j)) out.add(j);
    }
    return out;
  }
  function sailArmy(st, armyId, dest) {
    const plan = planSail(st, armyId, dest);
    if (!plan.valid) return { error: plan.errors[0] };
    const a = getArmy(st, armyId), me = a.owner;
    const rep = { me, origin: a.tile, path: plan.path, land: plan.land, end: dest, captured: [], cities: [], army: a.id };
    if (!plan.land) { a.tile = dest; a.used = (a.used || 0) + plan.path.length; return rep; }
    removeArmy(st, a);
    if (st.tiles[dest].owner !== me) capture(st, me, dest, rep);
    const landed = placeArmy(st, me, dest, a.u, SPENT, (a.took || 0) + rep.captured.length);
    rep.army = landed.id; landed.landed = true;
    log(st, `${nameOf(st, me)} landed ${count(sum(a.u), 'soldier', 'soldiers')} at ${placeName(st, dest)}.`, 'move', [me]);
    return rep;
  }

  // ---------------------------------------------------------------- trade
  // Routes are fixed paths, drawn on the map. A ship or army of a house at war with the trader standing anywhere on
  // the route cuts the whole income: it does not matter how long the road is or where it is cut.
  function waterRoute(st, from, targets) {
    const N = st.tiles.length, prev = new Int32Array(N).fill(-2), q = [from];
    prev[from] = -1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (targets.has(i)) { const path = []; for (let j = i; j >= 0; j = prev[j]) path.push(j); return path; }
      for (const j of st._nb[i]) if (prev[j] === -2 && isWater(st, j)) { prev[j] = i; q.push(j); }
    }
    return null;
  }
  // from a trading post home: along the sea lanes as far as they help, then the shortest way to the nearest harbor
  function laneRoute(st, from, harbors) {
    const lnb = st._laneNb;
    if (!lnb || !lnb.has(from)) return waterRoute(st, from, harbors);
    const N = st.tiles.length, sd = new Int32Array(N).fill(-1), sprev = new Int32Array(N).fill(-1), q = [];
    for (const h of harbors) { sd[h] = 0; q.push(h); }
    for (let h = 0; h < q.length; h++) for (const j of st._nb[q[h]]) if (sd[j] < 0 && isWater(st, j)) { sd[j] = sd[q[h]] + 1; sprev[j] = q[h]; q.push(j); }
    const ld = new Map([[from, 0]]), lprev = new Map(), lq = [from];
    let best = -1, bv = Infinity;
    for (let h = 0; h < lq.length; h++) {
      const i = lq[h];
      if (sd[i] >= 0 && ld.get(i) + sd[i] * 1.2 < bv) { bv = ld.get(i) + sd[i] * 1.2; best = i; }
      for (const j of lnb.get(i) || []) if (!ld.has(j)) { ld.set(j, ld.get(i) + 1); lprev.set(j, i); lq.push(j); }
    }
    if (best < 0) return waterRoute(st, from, harbors);
    const path = [];
    for (let j = best; j != null; j = lprev.get(j)) path.unshift(j);
    for (let j = sprev[best]; j >= 0; j = sprev[j]) { path.push(j); if (sd[j] === 0) break; }
    return path;
  }
  function landRoute(st, from, to, okTile) {
    const N = st.tiles.length, prev = new Int32Array(N).fill(-2), q = [from];
    prev[from] = -1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === to) { const path = []; for (let j = i; j >= 0; j = prev[j]) path.push(j); return path; }
      for (const j of st._nb[i]) if (prev[j] === -2 && passable(st, j) && (j === to || okTile(j))) { prev[j] = i; q.push(j); }
    }
    return null;
  }
  function blockedBy(st, p, path, skip) {
    for (const i of path) {
      if (i === skip) continue;
      const f = fleetAt(st, i);
      // a warship cuts only the trade its captain chose to block
      if (f && !isMerchant(f) && atWar(st, p, f.owner) && (f.block || []).includes(p)) return f.owner;
      const a = isWater(st, i) ? null : armyAt(st, i);
      if (a && a.owner >= 0 && atWar(st, p, a.owner)) return a.owner;
    }
    return null;
  }
  // every trade route a house has this turn, with its value and whether it is cut
  function tradeRoutes(st, p) {
    const out = [];
    if (p < 0 || !st.players[p] || !st.players[p].alive) return out;
    const harborWater = new Set();
    for (const h of harborSites(st, p)) for (const j of st._nb[h]) if (isWater(st, j)) harborWater.add(j);
    for (const post of st._posts || []) {
      const f = fleetAt(st, post.tile);
      if (!f || f.owner !== p) continue;
      const path = harborWater.size ? laneRoute(st, post.tile, harborWater) : null;
      const by = path ? blockedBy(st, p, path, post.tile) : null;
      const value = isMerchant(f) ? post.value : Math.ceil(post.value / 2), settling = stayOf(f) <= RULES.postSetup;
      out.push({ kind: 'market', name: post.name, value, full: post.value, merchant: isMerchant(f), settling, path: path || [post.tile], noHarbor: !path, blockedBy: by, ok: !!path && by == null && !settling, partner: null });
    }
    // markets help trade: every market level you own adds to each agreement you hold
    const levels = st.cities.reduce((n, c) => n + (c.owner === p ? c.market : 0), 0);
    const marketBonus = Math.min(RULES.marketTradeMax, levels * RULES.marketTrade);
    for (const d of (st.dip && st.dip.trades) || []) {
      if (d.a !== p && d.b !== p) continue;
      const q = d.a === p ? d.b : d.a;
      if (!st.players[q].alive || !atPeace(st, p, q)) continue;
      const r = dealRoute(st, p, q);
      const by = r ? blockedBy(st, p, r.path, -1) : null;
      const base = r ? Math.max(4, Math.min(12, 3 + Math.floor(r.path.length / 2))) : 0;
      const bonus = r ? marketBonus : 0;
      out.push({ kind: r && r.sea ? 'sea' : 'caravan', name: st.players[q].name, value: base + bonus, base, bonus, path: r ? r.path : [], noRoute: !r, blockedBy: by, ok: !!r && by == null, partner: q });
    }
    return out;
  }
  // the shortest caravan road between two houses' towns over open land, or a sea lane between their harbors
  function dealRoute(st, a, b) {
    const ta = st.cities.filter((c) => c.owner === a), tb = st.cities.filter((c) => c.owner === b);
    let best = null;
    for (const x of ta) for (const y of tb) {
      if (best && hexDist(st, x.tile, y.tile) >= best.path.length) continue;
      const path = landRoute(st, x.tile, y.tile, (i) => !cityAt(st, i));
      if (path && (!best || path.length < best.path.length)) best = { path, sea: false };
    }
    if (best) return best;
    const hb = new Set();
    for (const y of tb) if (y.harbor) for (const j of st._nb[y.tile]) if (isWater(st, j)) hb.add(j);
    for (const x of ta) if (x.harbor && hb.size) for (const j of st._nb[x.tile]) if (isWater(st, j)) {
      const path = waterRoute(st, j, hb);
      if (path && (!best || path.length < best.path.length)) best = { path, sea: true };
    }
    return best;
  }

  // ---------------------------------------------------------------- diplomacy
  // Offers bundle gold now, gold per turn (tribute) and a peace treaty. Peace lasts a fixed number of rounds
  // and cannot be broken: partners cannot march into each other's land and their zones do not hinder each other.
  const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  function peaceUntil(st, a, b) {
    if (a < 0 || b < 0 || a === b || !st.dip) return 0;
    const until = st.dip.peace[pairKey(a, b)] || 0;
    return until >= st.round ? until : 0;
  }
  function atPeace(st, a, b) { return peaceUntil(st, a, b) > 0; }

  function cleanOffer(o) {
    const n = (x) => Math.max(0, Math.floor(+x || 0));
    return { from: o.from, to: o.to, giveGold: n(o.giveGold), givePer: Math.min(RULES.tributeMax, n(o.givePer)), getGold: n(o.getGold), getPer: Math.min(RULES.tributeMax, n(o.getPer)), peace: !!o.peace, trade: !!o.trade };
  }
  function checkOffer(st, raw) {
    const o = cleanOffer(raw);
    const A = st.players[o.from], B = st.players[o.to];
    if (!A || !B || o.from === o.to) return { ok: false, reason: 'Choose another house.' };
    if (!A.alive || !B.alive) return { ok: false, reason: 'That house has fallen.' };
    if (st.cur !== o.from) return { ok: false, reason: 'Wait for your turn.' };
    if (!o.giveGold && !o.givePer && !o.getGold && !o.getPer && !o.peace && !o.trade) return { ok: false, reason: 'Put something in the offer.' };
    if (o.trade && !o.peace && !atPeace(st, o.from, o.to)) return { ok: false, reason: 'Trade needs peace: add peace to the offer.' };
    if (o.trade && hasTrade(st, o.from, o.to)) return { ok: false, reason: 'You already trade with them.' };
    if (o.giveGold > A.gold) return { ok: false, reason: `You only have ${A.gold} gold.` };
    if (st.dip.offers.some((x) => x.from === o.from && x.to === o.to)) return { ok: false, reason: `You already have an offer waiting with ${B.name}.` };
    return { ok: true, offer: o };
  }
  function describeOffer(st, o) {
    const A = st.players[o.from].name, B = st.players[o.to].name, parts = [];
    if (o.giveGold) parts.push(`${A} pays ${o.giveGold} gold`);
    if (o.givePer) parts.push(`${A} pays ${o.givePer} gold a turn for ${RULES.tributeTurns} turns`);
    if (o.getGold) parts.push(`${B} pays ${o.getGold} gold`);
    if (o.getPer) parts.push(`${B} pays ${o.getPer} gold a turn for ${RULES.tributeTurns} turns`);
    if (o.peace) parts.push(`peace for ${RULES.peaceRounds} rounds`);
    if (o.trade) parts.push('a trade agreement while at peace');
    return parts.join(', ');
  }
  function proposeOffer(st, raw) {
    const c = checkOffer(st, raw);
    if (!c.ok) return c;
    const o = Object.assign(c.offer, { id: st.dip.nextOffer++, round: st.round });
    st.dip.offers.push(o);
    log(st, `${nameOf(st, o.from)} proposed a deal to ${nameOf(st, o.to)}: ${describeOffer(st, o)}.`, 'dip', [o.from, o.to]);
    return { ok: true, offer: o };
  }
  function answerOffer(st, id, accept) {
    const o = st.dip.offers.find((x) => x.id === id);
    if (!o) return { ok: false, reason: 'That offer is no longer on the table.' };
    st.dip.offers = st.dip.offers.filter((x) => x !== o);
    const A = st.players[o.from], B = st.players[o.to];
    if (!accept) { log(st, `${B.name} declined ${A.name}'s offer.`, 'dip', [o.from, o.to]); return { ok: true, accepted: false }; }
    if (!A.alive || !B.alive) return { ok: false, reason: 'That house has fallen.' };
    if (A.gold < o.giveGold) { log(st, `${A.name} could no longer pay, so the deal with ${B.name} fell through.`, 'dip', [o.from, o.to]); return { ok: false, reason: `${A.name} can no longer pay ${o.giveGold} gold.` }; }
    if (B.gold < o.getGold) return { ok: false, reason: `You need ${o.getGold} gold to accept this.` };
    A.gold += o.getGold - o.giveGold; B.gold += o.giveGold - o.getGold;
    if (o.givePer) st.dip.tributes.push({ from: o.from, to: o.to, amount: o.givePer, left: RULES.tributeTurns });
    if (o.getPer) st.dip.tributes.push({ from: o.to, to: o.from, amount: o.getPer, left: RULES.tributeTurns });
    if (o.peace) st.dip.peace[pairKey(o.from, o.to)] = Math.max(st.dip.peace[pairKey(o.from, o.to)] || 0, st.round + RULES.peaceRounds);
    if (o.trade && !hasTrade(st, o.from, o.to)) (st.dip.trades = st.dip.trades || []).push({ a: o.from, b: o.to });
    log(st, `${A.name} and ${B.name} agreed: ${describeOffer(st, o)}.`, 'dip', [o.from, o.to]);
    return { ok: true, accepted: true };
  }
  function hasTrade(st, a, b) { return ((st.dip && st.dip.trades) || []).some((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a)); }
  function diplomacyTurn(st, p) {
    if (!st.dip) st.dip = { peace: {}, offers: [], tributes: [], nextOffer: 1 };
    // trade agreements end with the peace that carried them
    st.dip.trades = (st.dip.trades || []).filter((d) => atPeace(st, d.a, d.b) && st.players[d.a].alive && st.players[d.b].alive);
    // my unanswered offers from last round lapse
    st.dip.offers = st.dip.offers.filter((o) => !(o.from === p && o.round < st.round) && st.players[o.to].alive && st.players[o.from].alive);
    for (const t of st.dip.tributes) {
      if (t.from !== p || t.left <= 0) continue;
      // an empty (or overdrawn) treasury pays nothing: never a negative tribute
      const pay = Math.max(0, Math.min(t.amount, st.players[p].gold));
      st.players[p].gold -= pay; st.players[t.to].gold += pay; t.left--;
      if (pay > 0) log(st, `${st.players[p].name} paid ${pay} gold of tribute to ${st.players[t.to].name}${t.left ? ` (${t.left} more)` : ' (the last payment)'}.`, 'dip', [p, t.to]);
      else log(st, `${st.players[p].name} could not pay its tribute to ${st.players[t.to].name} this turn${t.left ? ` (${t.left} more)` : ''}.`, 'dip', [p, t.to]);
    }
    st.dip.tributes = st.dip.tributes.filter((t) => t.left > 0 && st.players[t.from].alive && st.players[t.to].alive);
  }
  function relations(st, p) {
    return st.players.filter((q) => q.id !== p).map((q) => ({
      id: q.id, peace: peaceUntil(st, p, q.id),
      pays: st.dip.tributes.filter((t) => t.from === p && t.to === q.id),
      gets: st.dip.tributes.filter((t) => t.from === q.id && t.to === p),
      incoming: st.dip.offers.filter((o) => o.from === q.id && o.to === p),
      outgoing: st.dip.offers.filter((o) => o.from === p && o.to === q.id),
    }));
  }

  function endTurn(st) {
    if (st.over) return;
    releaseOccupied(st, st.cur);
    const n = st.players.length;
    let next = st.cur, wrapped = false;
    for (let k = 0; k < n; k++) {
      next = (next + 1) % n;
      if (next === 0) wrapped = true;
      if (st.players[next].alive) break;
    }
    if (wrapped) st.round++;
    if (st.maxRounds && st.round > st.maxRounds) { st.round = st.maxRounds; finishGame(st, 'rounds'); return; }
    st.cur = next;
    startTurn(st);
  }

  function summary(st, p) {
    let tiles = 0, farms = 0, mines = 0, soldiers = 0;
    for (const t of st.tiles) if (t.owner === p) { tiles++; if (t.b === 'farm') farms++; else if (t.b === 'mine') mines++; }
    const cities = st.cities.filter((c) => c.owner === p).length;
    const units = Z();
    let strength = 0;
    for (const a of st.armies) if (a.owner === p) { soldiers += sum(a.u); a.u.forEach((n, k) => { units[k] += n; strength += n * UNITS[k].att; }); }
    let ships = 0;
    for (const f of st.fleets || []) if (f.owner === p) ships += f.n;
    const S = RULES.score;
    const score = tiles * S.tile + farms * S.farm + mines * S.mine + cities * S.city;
    return { tiles, farms, mines, cities, soldiers, units, strength: Math.round(strength), ships, score, gold: st.players[p].gold };
  }

  function finishGame(st, reason) {
    const ranking = st.players.map((p) => ({ id: p.id, alive: p.alive, ...summary(st, p.id) }))
      .sort((a, b) => (b.alive - a.alive) || (b.score - a.score));
    st.over = { reason, ranking, winner: ranking[0].id, round: st.round };
    log(st, `${st.players[ranking[0].id].name} ${reason === 'conquest' ? 'conquered the realm' : 'leads the realm when the chronicle closes'}.`, 'over', []);
  }

  // ---------------------------------------------------------------- save / load (map regenerates from its seed)
  function serialize(st) {
    return {
      v: 1, mapSeed: st.mapSeed, settings: st.settings,
      own: st.tiles.map((t) => (t.owner < 0 ? '.' : String(t.owner))).join(''),
      bld: st.tiles.map((t) => (t.b === 'farm' ? 'f' : t.b === 'mine' ? 'm' : t.b === 'city' ? 'c' : t.b === 'tower' ? 't' : t.b === 'port' ? 'p' : '.')).join(''),
      ports: st.ports || {}, builds: st.builds || [],
      cities: st.cities, armies: st.armies, fleets: st.fleets || [], players: st.players,
      round: st.round, maxRounds: st.maxRounds, cur: st.cur, rng: st.rng, nextId: st.nextId,
      log: st.log.slice(-120), logSeq: st.logSeq, over: st.over, turnNo: st.turnNo, nameIdx: st.nameIdx, dip: st.dip, phase: st.phase || 'play', pick: st.pick || null, occupied: st.occupied || {}, guards: st.guards || {},
    };
  }

  function deserialize(o) {
    const s = o.settings;
    const map = tryGenerate(s.np, s.scale || s.size, o.mapSeed, s.gen || 1, s.map);
    if (!map || map.W * map.H !== o.own.length) throw new Error('Saved map could not be rebuilt');
    const st = baseState(map, s);
    for (let i = 0; i < st.tiles.length; i++) {
      const t = st.tiles[i], ch = o.own[i], b = o.bld[i];
      t.owner = ch === '.' ? -1 : +ch;
      t.b = b === 'f' ? 'farm' : b === 'm' ? 'mine' : b === 'c' ? 'city' : b === 't' ? 'tower' : b === 'p' ? 'port' : null;
    }
    const clone = (x) => JSON.parse(JSON.stringify(x));
    st.cities = clone(o.cities); st.armies = clone(o.armies); st.players = clone(o.players); st.fleets = clone(o.fleets || []); st.ports = clone(o.ports || {}); st.builds = clone(o.builds || []);
    for (const c of st.cities) st.tiles[c.tile].city = c.id;
    for (const a of st.armies) { if (a.used == null) a.used = a.moved ? SPENT : 0; if (a.took == null) a.took = 0; delete a.moved; a.u = normU(a.u); delete a.fresh; }
    Object.assign(st, { guards: clone(o.guards || {}), occupied: clone(o.occupied || {}), phase: o.phase || 'play', pick: o.pick ? clone(o.pick) : null, round: o.round, maxRounds: o.maxRounds, cur: o.cur, rng: o.rng, nextId: o.nextId, log: clone(o.log || []), logSeq: o.logSeq, over: o.over ? clone(o.over) : null, turnNo: o.turnNo, nameIdx: o.nameIdx, dip: o.dip ? clone(o.dip) : { peace: {}, offers: [], tributes: [], nextOffer: 1 } });
    return st;
  }

  Object.assign(CC, {
    UNITS, NU, Z, normU, TERRAIN, RULES, COLORS, REBEL, FLAG_W, FLAG_H, validFlag, fullFlag, flagPalette, flagOf, HOUSE_NAMES, SIZES, DICE,
    mulberry32, rand, hexDistW, hexDist, disk, mapDims, generateMap, tryGenerate,
    newGame, passable, fatigue, MAP_GEN, guardAt, townIncome, canDismantle, dismantle, isMerchant, shipPow, shipCostOf, stayOf, fleetAt, getFleet, canRecruitShips, recruitShips, fleetReach, fleetMovesLeft, planFleet, moveFleet, navalOdds,
    bombardTargets, bombard, sailable, canPickStart, pickStart, aiPickStart, finishBuilds, setBlockade, cancelBuild, pendingAt, pendingIn, routesThrough, harborSites, portOf, canPortShips, portShips, cancelPortShips, transportOdds, seaArmyAt, vesselAt, embarkCost, canEmbark, embark, seaReach, planSail, sailArmy, landingSpots, isWater, tradeRoutes, hasTrade, atWar, atPeace, peaceUntil, checkOffer, proposeOffer, answerOffer, describeOffer, relations, armyAt, getArmy, cityAt, isCoastal, colorOf, nameOf, armyStats, placeName, sum,
    stepCost, isHarborTile, dijkstra, reach, movesLeft, landLeft, movable, marchLeft, training, trainingOf, cancelTraining, zocSources, zocFor, zocTiles, inZoc, SPENT, defenderAt, battleCtx, powers, odds, lossFracs, luck,
    planCampaign, executeCampaign, income, farmSlots, canBuild, build, upgradeInfo, upgrade,
    recruitCap, canRecruit, recruit, ordersPerTurn, startTurn, endTurn, summary, serialize, deserialize, log,
  });
})(typeof window !== 'undefined' ? window : globalThis);
