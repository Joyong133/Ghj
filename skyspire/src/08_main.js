// ---------------------------------------------------------------------------
// 게임 흐름: 타이틀, 층 이동, 미궁, 보상, 메뉴, 저장, 입력, VR 세션
// ---------------------------------------------------------------------------
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const INV_MAX = 80;

const Game = {
  fps: 60, saveT: 30, last: 0, shopStock: {},

  async init() {
    loadSettings();
    G.touch = window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    if (G.touch) document.body.classList.add('touch');
    try { R.init(); } catch (e) { console.error(e); return; }
    UI.init();
    if (G.touch) UI.initTouch();
    this.bindInput();
    this.setupXR();
    $('loadtext').textContent = '제 1층을 짓는 중…';
    await nextFrame();
    this.loadFloor(1, 'title');
    this.bindTitle();
    this.showTitle();
    R.renderer.setAnimationLoop((t) => this.frame(t));
    $('loading').hidden = true;
  },

  // ------------------------------------------------------------------ 저장
  newSave(name, hardcore) {
    const w = makeWeapon(1, 0, 'sword'); w.name = '녹슨 한손검';
    const a = makeArmor(1, 0); a.name = '천 코트';
    return {
      v: 1, name, hardcore, created: Date.now(), level: 1, exp: 0, col: 200, statPts: 0, str: 5, agi: 5, vit: 5, hp: null,
      floor: 1, maxFloor: 1, cleared: 0, inv: [w, a], equip: { weapon: w.uid, armor: a.uid }, potions: 5, ores: 0, mats: {},
      skills: { rush: { lv: 1, xp: 0 } }, slots: ['rush', null, null, null], quests: {}, codex: {}, ach: {},
      stats: { kills: 0, deaths: 0, play: 0, bossKills: 0, eliteKills: 0, rareKills: 0, maxPlus: 0, legendaries: 0 },
    };
  },
  normalize(s) {
    const d = this.newSave(s.name || '검사', !!s.hardcore);
    const out = Object.assign(d, s);
    out.stats = Object.assign(d.stats, s.stats || {});
    for (const k of ['skills', 'quests', 'codex', 'ach', 'mats', 'equip']) if (typeof out[k] !== 'object' || !out[k]) out[k] = {};
    if (!Array.isArray(out.inv)) out.inv = [];
    if (!Array.isArray(out.slots) || out.slots.length !== 4) out.slots = ['rush', null, null, null];
    out.floor = clamp(Math.round(out.floor) || 1, 1, MAX_FLOOR);
    out.maxFloor = clamp(Math.max(out.maxFloor || 1, out.floor), 1, MAX_FLOOR);
    if (!out.skills.rush) out.skills.rush = { lv: 1, xp: 0 };
    return out;
  },
  readSave() { const raw = Store.get(SAVE_KEY); if (!raw) return null; try { return this.normalize(JSON.parse(raw)); } catch (e) { return null; } },
  save() {
    const s = G.save; if (!s) return false;
    s.hp = Player.alive ? Math.round(Player.hp) : null;
    s.saved = Date.now();
    return Store.set(SAVE_KEY, JSON.stringify(s));
  },
  autosave() { this.saveT = 0.5; },
  exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(G.save || this.readSave() || {})))); },
  importCode(code) {
    try {
      const s = this.normalize(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
      if (!s.name || !s.level) throw new Error('bad');
      Store.set(SAVE_KEY, JSON.stringify(s));
      return s;
    } catch (e) { return null; }
  },

  // ------------------------------------------------------------------ 타이틀
  bindTitle() {
    $('b-continue').addEventListener('click', () => { const s = this.readSave(); if (s) this.startGame(s); });
    $('b-new').addEventListener('click', () => { $('titlebtns').hidden = true; $('newgame').hidden = false; $('ng-name').focus(); });
    $('ng-back').addEventListener('click', () => { $('titlebtns').hidden = false; $('newgame').hidden = true; });
    $('newgame').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('ng-name').value.trim() || '이름 없는 검사';
      const s = this.newSave(name.slice(0, 12), $('ng-hard').checked);
      Store.set(SAVE_KEY, JSON.stringify(s));
      $('titlebtns').hidden = false; $('newgame').hidden = true;
      this.startGame(s, true);
    });
    $('b-help').addEventListener('click', () => { Sfx.init(); UI.openMenu(() => this.helpMenu()); });
    $('b-import').addEventListener('click', () => { Sfx.init(); UI.openMenu(() => this.importMenu()); });
    $('b-vr').addEventListener('click', () => this.enterVR());
  },
  showTitle() {
    G.state = 'title';
    UI.showHUD(false);
    $('title').hidden = false;
    const s = this.readSave();
    $('b-continue').disabled = !s;
    $('contInfo').textContent = s ? `${s.name} · Lv.${s.level} · 제 ${s.floor}층` : '저장 없음';
    $('b-new').classList.toggle('primary', !s);
    $('b-continue').classList.toggle('primary', !!s);
    Sfx.setMusic('town', THEMES[0]);
  },
  startGame(save, fresh) {
    Sfx.init();
    G.save = save;
    Player.alive = true;
    this.shopStock = {};
    $('title').hidden = true;
    UI.showHUD(true);
    this.loadFloor(save.floor, 'play');
    Player.recalc();
    Player.hp = save.hp ? Math.min(save.hp, Player.maxHp) : Player.maxHp;
    G.state = 'play';
    UI.setFloorLabel();
    if (!G.touch && !G.xr) this.lockPointer();
    if (fresh) {
      setTimeout(() => UI.toast(G.touch ? '왼쪽 원: 이동 · 화면 드래그: 시점 · 공격·검술 버튼으로 싸웁니다' : 'WASD 이동 · 마우스 시점 · 클릭 공격 · 1~4 검술 · E 대화', '#e3c070'), 1200);
      setTimeout(() => UI.toast('마을 의뢰 게시판에서 퀘스트를 받고 잡화상에서 물약을 사 두세요.', '#e3c070'), 4200);
      setTimeout(() => UI.toast('지도의 금색 원이 미궁탑입니다. 보스를 쓰러뜨리면 다음 층이 열립니다.', '#e3c070'), 7600);
    } else UI.toast(`다시 오신 것을 환영합니다, ${save.name}.`);
    this.save();
  },
  toTitle() {
    this.save();
    UI.closeMenu();
    if (World.dungeon) this.exitDungeon(true);
    Ents.clear();
    G.save = null;
    if (Player.sword) Player.sword.pivot.visible = false;
    if (G.floor && G.floor.f !== 1) this.loadFloor(1, 'title');
    UI.boss(null);
    this.showTitle();
  },

  // ------------------------------------------------------------------ 층 이동
  loadFloor(f, mode) {
    Ents.clear(); FX.clearTransient();
    if (World.dungeon) { World.dispose(World.dungeon.group); World.dungeon = null; }
    if (World.field) { World.dispose(World.field.group); World.field.heightTex.dispose(); }
    const F = World.buildFloor(f);
    World.field = F; World.active = F; G.floor = F; G.inDungeon = false;
    R.scene.add(F.group);
    R.applyTheme(F.T, false);
    FX.setWeather(F.T.weather, false);
    G.area = 'town';
    if (mode !== 'title') {
      Player.placeAt(F.spawnPoint.x, F.spawnPoint.z, F.spawnPoint.yaw);
      if (Player.sword) Player.sword.pivot.visible = true;
      G.save.floor = f;
      G.save.maxFloor = Math.max(G.save.maxFloor, f);
      UI.banner(`제 ${f}층`, `${F.townName} · ${F.T.name}`, 3200);
      Sfx.setMusic('town', F.T);
      UI.setFloorLabel();
      UI.boss(null);
    }
  },
  travel(f) {
    $('loading').hidden = false; $('loadtext').textContent = `제 ${f}층으로 이동 중…`;
    Sfx.portal();
    setTimeout(() => { this.loadFloor(f, 'play'); $('loading').hidden = true; this.autosave(); }, 50);
  },
  enterDungeon() {
    const F = G.floor, f = F.f;
    Ents.clear(); FX.clearTransient();
    const D = World.buildDungeon(f);
    World.dungeon = D; World.active = D; G.inDungeon = true;
    F.group.visible = false;
    R.scene.add(D.group);
    R.applyTheme(F.T, true);
    FX.setWeather(null, true);
    G.area = 'dungeon';
    Player.placeAt(D.entry.x, D.entry.z, D.entry.yaw);
    UI.banner('미궁', `제 ${f}층 미궁탑 · 권장 Lv.${BAL.rec(f) + 1}`, 2600);
    Sfx.setMusic('dungeon', F.T); Sfx.portal();
    UI.setFloorLabel();
    // 보스
    const r = new RNG(floorSeed(f) ^ 0xb055);
    const arch = r.pick(F.T.enemies);
    const bossName = `${ARCH[arch].bossTitle} ${makeName(r, SYL_BOSS, 2, 3)}`;
    const e = Ents.spawn(arch, BAL.rec(f) + 2, D.arena.x, D.arena.z + 4, { boss: true, bossName, arena: D.arena });
    e.home.set(D.arena.x, 0, D.arena.z + 4); e.yaw = Math.PI;
    Ents.boss = e;
    D.bossName = bossName;
  },
  exitDungeon(silent) {
    const F = World.field, D = World.dungeon;
    Ents.clear(); FX.clearTransient();
    if (D) World.dispose(D.group);
    World.dungeon = null; World.active = F; G.inDungeon = false;
    F.group.visible = true;
    R.applyTheme(F.T, false);
    FX.setWeather(F.T.weather, false);
    for (const sp of F.spawns) { sp.enemies = []; sp.timer = 0; }
    UI.boss(null);
    if (!silent) {
      G.area = 'field';
      Player.placeAt(F.towerDoor.x, F.towerDoor.z, F.towerDoor.yaw);
      Sfx.setMusic('field', F.T); Sfx.portal();
      UI.setFloorLabel();
    }
  },

  updateArea() {
    const F = G.floor; if (!F) return;
    if (World.active === World.field) {
      const inTown = Math.hypot(Player.pos.x - F.town.x, Player.pos.z - F.town.z) < 33;
      const area = inTown ? 'town' : 'field';
      if (area !== G.area) {
        G.area = area; UI.setFloorLabel(); Sfx.setMusic(area, F.T);
        if (area === 'field') UI.toast(`${F.areaName} · 몬스터가 나타나는 지역입니다.`);
        else UI.toast(`${F.townName}에 들어왔습니다. 안전 지대입니다.`, '#9ae8b0');
      }
    } else if (World.dungeon) {
      const D = World.dungeon;
      const c = World.dungeonCell(D, Player.pos.x, Player.pos.z);
      if (c) D.explored[c[1]][c[0]] = true;
      const A = D.arena;
      const inArena = Math.hypot(Player.pos.x - A.x, Player.pos.z - A.z) < A.r - 1.5;
      const b = Ents.boss;
      if (inArena && b && !b.dead && !b.aggro) {
        b.aggro = true; b.setState('chase');
        UI.boss(b); UI.banner(b.name, `제 ${F.f}층 보스 · Lv.${b.level}`, 3000);
        Sfx.roar(); Player.shake(0.4);
      }
      if (!inArena && b && !b.dead && b.aggro && b.state === 'return') UI.boss(null);
      const area = inArena && b && !b.dead ? 'boss' : 'dungeon';
      if (area !== G.area) { G.area = area; Sfx.setMusic(area, F.T); }
    }
  },

  // ------------------------------------------------------------------ 상호작용
  interact(it) {
    if (G.state !== 'play') return;
    switch (it.kind) {
      case 'npc':
        if (it.role === 'shop') UI.openMenu(() => this.shopMenu());
        if (it.role === 'smith') UI.openMenu(() => this.smithMenu());
        if (it.role === 'quest') UI.openMenu(() => this.questBoard());
        if (it.role === 'inn') UI.openMenu(() => this.innMenu());
        break;
      case 'gate': UI.openMenu(() => this.gateMenu()); break;
      case 'tower': this.enterDungeon(); break;
      case 'exit': this.exitDungeon(); break;
      case 'bossdoor': {
        const D = World.dungeon; D.doorOpen = true; D.doorCol.off = true;
        Sfx.roar(); Player.shake(0.3);
        UI.toast(`문 너머에서 ${D.bossName}의 기척이 느껴진다…`, '#ff9a8a');
        break;
      }
      case 'chest': this.openChest(it.chest); break;
      case 'next': {
        const f = G.floor.f;
        if (f >= MAX_FLOOR) { UI.openMenu(() => this.endingMenu()); break; }
        this.exitDungeon(true);
        this.travel(f + 1);
        break;
      }
    }
  },
  openChest(c) {
    if (c.opened) return;
    c.opened = true;
    const s = G.save, f = G.floor.f, L = BAL.rec(f) + 1;
    c.glow.intensity = 6;
    let t = 0;
    World.dungeon.animated.push((dt) => { t = Math.min(1, t + 0.04); c.lid.rotation.x = -1.9 * easeOut(t); c.glow.intensity = 6 * (1 - t * 0.7); });
    FX.burst(new THREE.Vector3(c.x, 1, c.z), 0xffd070, 40, 5, 0.25, 0.8);
    Sfx.coin(); Sfx.pickup();
    const col = Math.round(BAL.enemyCol(L) * (6 + Math.random() * 6));
    s.col += col;
    const ores = 1 + Math.floor(Math.random() * 3);
    s.ores += ores;
    const msgs = [`${fmt(col)} Col`, `강화 광석 ${ores}개`];
    if (Math.random() < 0.5) { const n = 1 + Math.floor(Math.random() * 2); s.potions += n; msgs.push(`물약 ${n}개`); }
    UI.toast('상자: ' + msgs.join(', '), '#ffd24a');
    if (Math.random() < 0.45) this.giveItem(Math.random() < 0.6 ? makeWeapon(L, rollRarity(2)) : makeArmor(L, rollRarity(2)));
    this.autosave();
  },

  // ------------------------------------------------------------------ 보상
  giveItem(it) {
    const s = G.save;
    if (s.inv.length >= INV_MAX) {
      // 가장 싼 미장착 장비를 자동 판매
      const pool = s.inv.filter((i) => i.uid !== s.equip.weapon && i.uid !== s.equip.armor).sort((a, b) => itemPrice(a) - itemPrice(b));
      const out = pool[0];
      if (out && itemPrice(out) < itemPrice(it)) { s.inv.splice(s.inv.indexOf(out), 1); s.col += Math.round(itemPrice(out) * 0.25); UI.toast(`가방이 가득 차 ${itemLabel(out)}을(를) 팔았습니다.`); }
      else { s.col += Math.round(itemPrice(it) * 0.25); UI.toast(`가방이 가득 차 ${itemLabel(it)}을(를) 팔았습니다.`); return; }
    }
    s.inv.push(it);
    if (it.r === 4) { s.stats.legendaries++; UI.banner('전설 장비!', itemLabel(it), 3000); Sfx.levelUp(); }
    UI.toast(`획득: [${RARITY[it.r].name}] ${itemLabel(it)}`, RARITY[it.r].color);
    Sfx.pickup();
  },
  onKill(e) {
    const s = G.save; if (!s) return;
    const F = G.floor;
    const diff = e.level - s.level;
    const expMul = diff >= 0 ? 1 + Math.min(0.5, diff * 0.05) : Math.max(0.1, 1 + diff * 0.1);
    const kind = e.boss ? 30 : e.elite ? 10 : e.rare ? 5 : e.mini || e.minion ? 0.3 : 1;
    const exp = BAL.enemyExp(e.level) * e.A.hp * kind * expMul;
    const col = Math.round(BAL.enemyCol(e.level) * (e.boss ? 40 : e.elite ? 12 : e.rare ? 10 : e.mini || e.minion ? 0.3 : 1) * (0.8 + Math.random() * 0.4));
    s.col += col;
    const tp = e.center.clone(); tp.y += 0.6;
    FX.text(`+${fmt(exp)} EXP`, tp, '#9fd8ff', 0.36, { life: 1.4, vy: 0.9 });
    Player.gainExp(exp);
    s.stats.kills++;
    const ck = `${F.T.key}:${e.key}`; s.codex[ck] = (s.codex[ck] || 0) + 1;
    if (e.rare) s.stats.rareKills++;
    // 퀘스트
    const Q = floorQuests(F.f);
    const qk = s.quests[Q[0].id];
    if (qk && qk.state === 'active' && e.key === Q[0].arch && !e.mini && !e.minion) { qk.n = Math.min(Q[0].count, qk.n + 1); if (qk.n === Q[0].count) UI.toast(`퀘스트 완료: ${Q[0].title} — 게시판에 보고하세요.`, '#9ae8b0'); }
    if (e.elite) {
      s.stats.eliteKills++;
      const qe = s.quests[Q[2].id];
      if (qe && qe.state === 'active') { qe.n = 1; UI.toast(`퀘스트 완료: ${Q[2].title}`, '#9ae8b0'); }
      if (e.spawnRef) e.spawnRef.timer = 300; // 네임드는 5분 뒤 다시 나타난다
    }
    // 드롭
    const L = e.level;
    if (Math.random() < (e.boss ? 1 : e.elite ? 1 : BAL.dropMat)) {
      const n = e.boss ? 8 : e.elite ? 4 : 1 + (Math.random() < 0.3 ? 1 : 0);
      s.mats[F.T.mat] = (s.mats[F.T.mat] || 0) + n;
      if (Math.random() < 0.35 || e.elite || e.boss) UI.toast(`${F.T.mat} ×${n}`, '#c8d0d8');
    }
    if (Math.random() < (e.boss ? 1 : e.elite ? 1 : BAL.dropOre)) { const n = e.boss ? 4 : e.elite ? 2 : 1; s.ores += n; UI.toast(`강화 광석 ×${n}`, '#c8d0d8'); }
    if (!e.boss && Math.random() < 0.04) { s.potions++; UI.toast('회복 물약 ×1', '#9ae8b0'); }
    if (e.elite) this.giveItem(Math.random() < 0.6 ? makeWeapon(L, Math.max(2, rollRarity(3))) : makeArmor(L, Math.max(2, rollRarity(3))));
    else if (e.rare) this.giveItem(makeWeapon(L, Math.max(1, rollRarity(2))));
    else if (!e.boss && !e.mini && !e.minion && Math.random() < BAL.dropGear) this.giveItem(Math.random() < 0.6 ? makeWeapon(L + Math.round(Math.random() * 2 - 1), rollRarity()) : makeArmor(L, rollRarity()));
    if (e.boss) this.onBossKilled(e);
    this.checkAch();
  },
  onBossKilled(e) {
    const s = G.save, F = G.floor, f = F.f, D = World.dungeon;
    s.stats.bossKills++;
    UI.boss(null);
    const first = f > s.cleared;
    // 막타 보너스
    const r = Math.random() < 0.15 ? 4 : 3;
    const la = Math.random() < 0.6 ? makeWeapon(e.level, r) : makeArmor(e.level, r);
    setTimeout(() => { UI.toast('막타 보너스!', '#ffd24a'); this.giveItem(la); this.giveItem(makeWeapon(e.level, Math.max(2, rollRarity(2)))); }, 1200);
    if (first) { s.cleared = f; s.maxFloor = Math.max(s.maxFloor, Math.min(MAX_FLOOR, f + 1)); }
    UI.banner(f >= MAX_FLOOR ? '부유성 정복' : `제 ${f}층 돌파`, first ? (f >= MAX_FLOOR ? '마지막 문이 열렸습니다' : `제 ${f + 1}층으로 가는 문이 열렸습니다`) : '보스 재처치', 4200);
    Sfx.levelUp(); setTimeout(() => Sfx.portal(), 600);
    Sfx.setMusic('dungeon', F.T);
    // 다음 층 문
    if (D) {
      const A = D.arena;
      const grp = new THREE.Group(); grp.position.set(A.x, 0, A.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 10, 40), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc860, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.3 }));
      ring.position.y = 2.8; grp.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      disc.position.y = 2.8; grp.add(disc);
      const pl = new THREE.PointLight(0xffe0a0, 25, 20, 2); pl.position.y = 3; grp.add(pl);
      D.group.add(grp);
      D.animated.push((t) => { ring.rotation.y = t; disc.rotation.y = t; disc.material.opacity = 0.45 + Math.sin(t * 3) * 0.15; });
      D.interactables.push({ kind: 'next', x: A.x, z: A.z, r: 3.6, label: f >= MAX_FLOOR ? '정상으로' : `제 ${f + 1}층으로 올라가기` });
    }
    this.autosave();
  },
  onPlayerDeath() {
    const s = G.save;
    s.stats.deaths++;
    G.state = 'dead';
    UI.boss(null);
    setTimeout(() => {
      if (s.hardcore) {
        Store.del(SAVE_KEY);
        UI.openMenu(() => ({
          title: '이야기의 끝', sub: `${s.name}은(는) 제 ${G.floor.f}층에서 쓰러졌습니다.`, noBack: true,
          items: [
            { text: `레벨 ${s.level} · 돌파한 층 ${s.cleared} · 처치 ${fmt(s.stats.kills)} · 플레이 ${this.playtime(s.stats.play)}` },
            { text: '하드코어 캐릭터는 되살아날 수 없습니다. 저장 데이터를 지웠습니다.' },
            { label: '타이틀로', onSelect: () => { UI.closeMenu(); G.save = null; this.toTitle(); }, keep: true },
          ],
        }));
      } else {
        const lost = Math.floor(s.col * 0.1);
        s.col -= lost;
        UI.openMenu(() => ({
          title: '쓰러졌습니다', sub: lost ? `${fmt(lost)} Col을 잃었습니다.` : '', noBack: true,
          items: [
            { text: Player.deathCause ? `원인: ${Player.deathCause}` : '레벨을 올리거나 장비를 강화한 뒤 다시 도전하세요. 몬스터 이름 색이 주황·빨강이면 위험합니다.' },
            { label: '마을에서 다시 일어나기', onSelect: () => this.respawn(), keep: true },
          ],
        }));
      }
    }, 1400);
  },
  respawn() {
    UI.closeMenu();
    Player.alive = true; Player.deathCause = null; Player.recalc(); Player.hp = Player.maxHp; Player.act = null;
    if (World.dungeon) this.exitDungeon(true);
    const F = G.floor;
    Player.placeAt(F.spawnPoint.x, F.spawnPoint.z, F.spawnPoint.yaw);
    G.area = 'town'; Sfx.setMusic('town', F.T); UI.setFloorLabel();
    G.state = 'play';
    if (!G.touch && !G.xr) this.lockPointer();
    this.autosave();
  },
  checkAch() {
    const s = G.save; if (!s) return;
    for (const [id, name, desc, fn] of ACHIEVEMENTS) {
      if (s.ach[id]) continue;
      try { if (fn(s)) { s.ach[id] = Date.now(); UI.toast(`업적 달성: ${name} — ${desc}`, '#ffd24a'); } } catch (e) { /* 무시 */ }
    }
  },
  playtime(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; },

  // ------------------------------------------------------------------ 메뉴들
  openMainMenu() {
    if (G.state !== 'play') return;
    const s = G.save;
    UI.openMenu(() => ({
      title: '메뉴', sub: `${s.name} · Lv.${s.level} · 제 ${G.floor.f}층 · ${fmt(s.col)} Col`,
      items: [
        { label: '계속하기', onSelect: () => { UI.closeMenu(); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true },
        { label: '상태 · 능력치', right: s.statPts ? `포인트 ${s.statPts}` : '', onSelect: () => UI.openMenu(() => this.statusMenu()), keep: true },
        { label: '장비 · 가방', right: `${s.inv.length} / ${INV_MAX}`, onSelect: () => UI.openMenu(() => this.invMenu()), keep: true },
        { label: '검술', onSelect: () => UI.openMenu(() => this.skillMenu()), keep: true },
        { label: '퀘스트', onSelect: () => UI.openMenu(() => this.questLog()), keep: true },
        { label: '지도', onSelect: () => UI.openMenu(() => this.mapMenu()), keep: true },
        { label: '도감 · 업적', onSelect: () => UI.openMenu(() => this.codexMenu()), keep: true },
        { label: '설정', onSelect: () => UI.openMenu(() => this.settingsMenu()), keep: true },
        { label: '조작법', onSelect: () => UI.openMenu(() => this.helpMenu()), keep: true },
        { label: '저장하기', onSelect: () => UI.toast(this.save() ? '저장했습니다.' : '이 브라우저에서는 저장할 수 없습니다. 설정에서 저장 코드를 내보내세요.') },
        { label: '저장하고 타이틀로', onSelect: () => this.toTitle(), keep: true },
      ],
    }));
  },
  openMap() { if (G.state === 'play') UI.openMenu(() => this.mapMenu()); },
  mapMenu() {
    const F = G.floor;
    return { title: '지도', sub: World.dungeon ? `제 ${F.f}층 미궁 · 빨간 원이 보스방` : `제 ${F.f}층 · ${F.townName} · 금색 원이 미궁탑`, items: [{ canvas: UI.bigMap() }, { label: '닫기', onSelect: () => UI.closeMenu(), keep: true }] };
  },
  statusMenu() {
    const s = G.save, P = Player, st = s.stats;
    const statItem = (k, label, detail) => ({ label: `${label} ${s[k]}`, detail, right: s.statPts ? '+1' : '', disabled: !s.statPts, onSelect: () => { if (s.statPts > 0) { s[k]++; s.statPts--; P.recalc(); } } });
    return {
      title: '상태', sub: `${s.name}${s.hardcore ? ' · 하드코어' : ''}`, right: `남은 포인트 ${s.statPts}`,
      items: [
        { text: `레벨 ${s.level} · 경험치 ${fmt(s.exp)} / ${fmt(BAL.expNext(s.level))}` },
        { text: `최대 체력 ${fmt(P.maxHp)} · 공격력 ${fmt(P.atk)} · 방어력 ${fmt(P.def)}` },
        { text: `치명타 ${(P.crit * 100).toFixed(1)}% · 검술 재사용 -${(P.cdr * 100).toFixed(1)}% · 이동 속도 +${((P.moveMul - 1) * 100).toFixed(0)}%` },
        { text: '능력치', head: true },
        statItem('str', '힘 STR', '공격력이 포인트당 0.8% 오릅니다.'),
        statItem('agi', '민첩 AGI', '치명타 확률, 공격·이동 속도, 검술 재사용 시간이 좋아집니다.'),
        statItem('vit', '체력 VIT', '최대 체력이 포인트당 0.8% 오릅니다.'),
        { text: '기록', head: true },
        { text: `돌파한 층 ${s.cleared} / ${MAX_FLOOR} · 처치 ${fmt(st.kills)} · 보스 ${st.bossKills} · 네임드 ${st.eliteKills} · 황금 몬스터 ${st.rareKills}` },
        { text: `사망 ${st.deaths} · 플레이 시간 ${this.playtime(st.play)}` },
      ],
    };
  },
  itemDesc(it) {
    if (it.kind === 'weapon') {
      const w = Player.weapon(); const d = itemAtk(it) - (w ? itemAtk(w) : 0);
      return `${WEAPONS[it.type].name} · 공격력 ${fmt(itemAtk(it))} (${d >= 0 ? '+' : ''}${fmt(d)})${it.critB ? ` · 치명 +${it.critB * 100}%` : ''} · Lv.${it.il}`;
    }
    const a = Player.armor(); const d = itemDef(it) - (a ? itemDef(a) : 0);
    return `방어구 · 방어력 ${fmt(itemDef(it))} (${d >= 0 ? '+' : ''}${fmt(d)})${it.hpB ? ` · 체력 +${it.hpB * 100}%` : ''} · Lv.${it.il}`;
  },
  invMenu() {
    const s = G.save, w = Player.weapon(), a = Player.armor();
    const bag = s.inv.filter((i) => i !== w && i !== a).sort((x, y) => (x.kind === y.kind ? itemPower(y) - itemPower(x) : x.kind === 'weapon' ? -1 : 1));
    const mats = Object.entries(s.mats).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' · ');
    return {
      title: '장비 · 가방', sub: `물약 ${s.potions} · 강화 광석 ${s.ores} · ${fmt(s.col)} Col`, right: `${s.inv.length} / ${INV_MAX}`,
      items: [
        { text: '장착 중', head: true },
        w ? { label: itemLabel(w), color: RARITY[w.r].color, detail: this.itemDesc(w).replace(/ \(\+0\)/, ''), right: '무기', onSelect: () => UI.openMenu(() => this.itemMenu(w.uid)), keep: true } : { text: '무기 없음' },
        a ? { label: itemLabel(a), color: RARITY[a.r].color, detail: this.itemDesc(a).replace(/ \(\+0\)/, ''), right: '방어구', onSelect: () => UI.openMenu(() => this.itemMenu(a.uid)), keep: true } : { text: '방어구 없음' },
        { text: mats ? `재료: ${mats}` : '재료 없음' },
        { text: '가방', head: true },
        ...(bag.length ? bag.map((it) => ({ label: itemLabel(it), color: RARITY[it.r].color, detail: this.itemDesc(it), right: RARITY[it.r].name, onSelect: () => UI.openMenu(() => this.itemMenu(it.uid)), keep: true })) : [{ text: '비어 있음. 몬스터와 상자에서 장비를 얻을 수 있습니다.' }]),
      ],
    };
  },
  itemMenu(uid) {
    const s = G.save, it = s.inv.find((i) => i.uid === uid);
    if (!it) return { title: '없는 장비', items: [{ label: '돌아가기', onSelect: () => UI.back(), keep: true }] };
    const eq = s.equip.weapon === uid || s.equip.armor === uid;
    return {
      title: itemLabel(it), sub: `[${RARITY[it.r].name}] ${this.itemDesc(it)}`,
      items: [
        { text: `판매가 ${fmt(itemPrice(it) * 0.25)} Col (잡화상) · 강화 +${it.plus} / 10` },
        { label: eq ? '장착 중' : '장착하기', disabled: eq, onSelect: () => { this.equip(it); UI.back(); }, keep: true },
        { label: '버리기', disabled: eq, detail: '되돌릴 수 없습니다.', onSelect: () => { s.inv.splice(s.inv.indexOf(it), 1); UI.toast(`${itemLabel(it)}을(를) 버렸습니다.`); UI.back(); }, keep: true },
        { label: '돌아가기', onSelect: () => UI.back(), keep: true },
      ],
    };
  },
  equip(it) {
    const s = G.save;
    if (it.kind === 'weapon') s.equip.weapon = it.uid; else s.equip.armor = it.uid;
    Player.recalc();
    Sfx.pickup();
    UI.toast(`장착: ${itemLabel(it)}`, RARITY[it.r].color);
    if (it.kind === 'weapon') {
      const bad = s.slots.filter((id) => id && !skillUsable(id, it.type)).map((id) => SKILLS[id].name);
      if (bad.length) UI.toast(`${WEAPONS[it.type].name}으로는 ${bad.join(', ')}을(를) 쓸 수 없습니다. 검술 메뉴에서 바꾸세요.`, '#ffb08a');
    }
    this.autosave();
  },
  skillMenu() {
    const s = G.save;
    const learned = SKILL_KEYS.filter((id) => s.skills[id]);
    const types = (S) => (S.types === 'all' ? '모든 무기' : S.types.map((t) => WEAPONS[t].name).join('·'));
    return {
      title: '검술', sub: `현재 무기: ${WEAPONS[Player.wtype].name} · 검술은 쓸수록 숙련됩니다`,
      items: [
        { text: '단축키 슬롯', head: true },
        ...[0, 1, 2, 3].map((i) => { const id = s.slots[i]; return { label: `${i + 1}번: ${id ? SKILLS[id].name : '비어 있음'}`, detail: id ? (skillUsable(id, Player.wtype) ? SKILLS[id].desc : '지금 무기로는 쓸 수 없습니다') : '눌러서 검술을 넣으세요', onSelect: () => UI.openMenu(() => this.slotPick(i)), keep: true }; }),
        { text: '익힌 검술', head: true },
        ...learned.map((id) => { const S = SKILLS[id], k = s.skills[id]; return { text: `${S.name} · 숙련 ${k.lv}/10${k.lv < 10 ? ` (${k.xp}/${Math.round(20 * Math.pow(k.lv, 1.6))})` : ''} · 재사용 ${S.cd}초 · ${types(S)}` }; }),
        { text: '아직 익히지 못함', head: true },
        ...SKILL_KEYS.filter((id) => !s.skills[id]).map((id) => ({ text: `${SKILLS[id].name} · 레벨 ${SKILLS[id].lv}에 습득 · ${types(SKILLS[id])}` })),
      ],
    };
  },
  slotPick(i) {
    const s = G.save;
    return {
      title: `${i + 1}번 슬롯`, sub: '넣을 검술을 고르세요',
      items: [
        ...SKILL_KEYS.filter((id) => s.skills[id]).map((id) => ({
          label: SKILLS[id].name, detail: SKILLS[id].desc + (skillUsable(id, Player.wtype) ? '' : ' (지금 무기로는 사용 불가)'),
          right: s.slots.indexOf(id) >= 0 ? `${s.slots.indexOf(id) + 1}번` : '',
          onSelect: () => { const j = s.slots.indexOf(id); if (j >= 0) s.slots[j] = s.slots[i]; s.slots[i] = id; UI.back(); }, keep: true,
        })),
        { label: '비우기', onSelect: () => { s.slots[i] = null; UI.back(); }, keep: true },
      ],
    };
  },
  questDesc(q, f) {
    const T = themeForFloor(f);
    if (q.type === 'kill') return `${T.prefix} ${ARCH[q.arch].name} ${q.count}마리 처치`;
    if (q.type === 'collect') return `${q.mat} ${q.count}개 가져오기 (몬스터가 떨어뜨림)`;
    return '필드 어딘가의 네임드 몬스터 처치 (지도의 빨간 점)';
  },
  questProgress(q) {
    const s = G.save, st = s.quests[q.id];
    if (!st) return 0;
    if (q.type === 'collect') return Math.min(q.count, s.mats[q.mat] || 0);
    return st.n;
  },
  questBoard() {
    const s = G.save, f = G.floor.f, Q = floorQuests(f), L = BAL.rec(f);
    return {
      title: '의뢰 게시판', sub: `제 ${f}층 의뢰 · 보상은 처음 완료할 때 한 번`,
      items: Q.map((q, i) => {
        const st = s.quests[q.id];
        const exp = Math.round(BAL.enemyExp(L) * (6 + i * 3)), col = Math.round(BAL.enemyCol(L) * (12 + i * 6));
        const reward = `보상: ${fmt(exp)} EXP · ${fmt(col)} Col${i === 2 ? ' · 희귀 장비' : ''}`;
        if (!st) return { label: q.title, detail: `${this.questDesc(q, f)} — ${reward}`, right: '수락', onSelect: () => { s.quests[q.id] = { state: 'active', n: 0 }; UI.toast(`퀘스트 수락: ${q.title}`, '#9ae8b0'); } };
        if (st.state === 'claimed') return { label: q.title, detail: '완료한 의뢰', right: '완료', disabled: true, onSelect: () => {} };
        const p = this.questProgress(q), done = p >= q.count;
        return {
          label: q.title, detail: `${this.questDesc(q, f)} · 진행 ${p}/${q.count} — ${reward}`, right: done ? '보고하기' : '진행 중', disabled: !done,
          onSelect: () => {
            if (q.type === 'collect') s.mats[q.mat] -= q.count;
            st.state = 'claimed'; s.col += col; Player.gainExp(exp);
            if (i === 2) this.giveItem(makeWeapon(L, Math.max(2, rollRarity(2))));
            Sfx.coin(); UI.toast(`의뢰 완료: ${q.title} (+${fmt(col)} Col)`, '#9ae8b0'); this.autosave();
          },
        };
      }),
    };
  },
  questLog() {
    const s = G.save;
    const rows = [];
    for (let f = 1; f <= s.maxFloor; f++) for (const q of floorQuests(f)) {
      const st = s.quests[q.id];
      if (!st || st.state === 'claimed') continue;
      rows.push({ text: `제 ${f}층 · ${q.title} — ${this.questDesc(q, f)} · ${this.questProgress(q)}/${q.count}` });
    }
    return { title: '퀘스트', sub: '각 층 마을의 의뢰 게시판에서 받고 보고합니다', items: rows.length ? rows : [{ text: '진행 중인 퀘스트가 없습니다.' }] };
  },
  codexMenu() {
    const s = G.save;
    const done = ACHIEVEMENTS.filter((a) => s.ach[a[0]]).length;
    const rows = [{ text: `업적 ${done} / ${ACHIEVEMENTS.length}`, head: true }];
    for (const [id, name, desc] of ACHIEVEMENTS) rows.push({ label: name, detail: desc, right: s.ach[id] ? '달성' : '', color: s.ach[id] ? '#ffd24a' : undefined, onSelect: () => {}, keep: true });
    const seen = new Set();
    rows.push({ text: `도감 ${Object.keys(s.codex).length}종`, head: true });
    for (let f = 1; f <= Math.min(s.maxFloor, THEMES.length); f++) {
      const T = themeForFloor(f); if (seen.has(T.key)) continue; seen.add(T.key);
      rows.push({ text: `${T.name}: ` + T.enemies.map((k) => { const n = s.codex[`${T.key}:${k}`]; return n ? `${T.prefix} ${ARCH[k].name} ${n}` : '???'; }).join(' · ') });
    }
    return { title: '도감 · 업적', items: rows };
  },
  settingsMenu() {
    const S = G.settings;
    const cyc = (k, list) => { const i = list.indexOf(S[k]); S[k] = list[(i + 1) % list.length]; saveSettings(); Sfx.applyVolume(); };
    const qn = { auto: '자동', low: '낮음', medium: '보통', high: '높음' };
    return {
      title: '설정',
      items: [
        { label: `전체 음량 ${Math.round(S.volume * 100)}%`, onSelect: () => cyc('volume', [0, 0.2, 0.4, 0.6, 0.8, 1]) },
        { label: `음악 ${Math.round(S.music * 100)}%`, onSelect: () => cyc('music', [0, 0.25, 0.5, 0.75, 1]) },
        { label: `마우스 감도 ${S.sens.toFixed(2)}`, onSelect: () => cyc('sens', [0.5, 0.75, 1, 1.25, 1.5, 2]) },
        { label: `세로 시점 반전 ${S.invertY ? '켬' : '끔'}`, onSelect: () => { S.invertY = !S.invertY; saveSettings(); } },
        { label: `그래픽 품질 ${qn[S.quality]}`, detail: `지금: ${qn[R.quality]} · 풀과 나무 밀도는 다음 층 이동 때 바뀝니다`, onSelect: () => { cyc('quality', ['auto', 'low', 'medium', 'high']); R.applyQuality(); } },
        { label: `위층 천장 보이기 ${S.ceiling ? '켬' : '끔'}`, onSelect: () => { S.ceiling = !S.ceiling; saveSettings(); R.ceiling.visible = S.ceiling && !World.dungeon; } },
        { label: `FPS 표시 ${S.fps ? '켬' : '끔'}`, onSelect: () => { S.fps = !S.fps; saveSettings(); } },
        { text: '저장', head: true },
        { label: '저장 코드 내보내기', detail: '다른 기기나 브라우저로 캐릭터를 옮길 때 씁니다', onSelect: () => { this.save(); UI.openMenu(() => this.exportMenu()); }, keep: true },
        { label: '캐릭터 삭제', detail: '저장 데이터를 지우고 타이틀로 돌아갑니다', onSelect: () => UI.openMenu(() => this.deleteMenu()), keep: true },
      ],
    };
  },
  exportMenu() {
    const code = this.exportCode();
    return {
      title: '저장 코드', sub: '아래 글자를 복사해 두었다가 타이틀의 "저장 코드 불러오기"에 붙여 넣으세요.',
      items: [
        { textarea: code, readOnly: true, id: 'export-code' },
        { label: '복사하기', onSelect: () => { const ta = $('export-code'); const p = navigator.clipboard && navigator.clipboard.writeText(code); if (p) p.then(() => UI.toast('복사했습니다.'), () => { ta.focus(); ta.select(); UI.toast('글자를 길게 눌러 직접 복사하세요.'); }); else { ta.focus(); ta.select(); } }, keep: true },
        { label: '돌아가기', onSelect: () => UI.back(), keep: true },
      ],
    };
  },
  importMenu() {
    return {
      title: '저장 코드 불러오기', sub: '내보낸 저장 코드를 붙여 넣으세요. 지금 이 브라우저의 저장은 덮어씌워집니다.',
      items: [
        { textarea: '', id: 'import-code' },
        { label: '불러오기', onSelect: () => { const s = this.importCode($('import-code').value); if (s) { UI.closeMenu(); this.showTitle(); UI.toast(`${s.name} (Lv.${s.level})을(를) 불러왔습니다.`); } else { Sfx.error(); UI.toast('코드를 읽을 수 없습니다. 전부 복사했는지 확인하세요.', '#ff9a8a'); } }, keep: true },
        { label: '돌아가기', onSelect: () => UI.back(), keep: true },
      ],
    };
  },
  deleteMenu() {
    return {
      title: '정말 삭제할까요?', sub: `${G.save.name} (Lv.${G.save.level})의 저장 데이터가 사라집니다.`,
      items: [
        { label: '취소', onSelect: () => UI.back(), keep: true },
        { label: '삭제하고 타이틀로', color: '#ff8a7a', onSelect: () => { Store.del(SAVE_KEY); UI.closeMenu(); G.save = null; this.toTitle(); }, keep: true },
      ],
    };
  },
  helpMenu() {
    return {
      title: '조작법',
      items: [
        { text: '키보드 · 마우스', head: true },
        { text: '화면 클릭: 마우스 고정 · WASD: 이동 · Shift: 달리기 · Space: 점프\n왼쪽 클릭: 공격(누르고 있으면 연속 베기) · 오른쪽 클릭: 방어 (막 들어올린 순간 막으면 패리)\n1~4: 검술 · Q 또는 C: 회피(무적 시간 있음) · R: 물약 · E: 대화·사용\nM: 지도 · Esc 또는 Tab: 메뉴' },
        { text: '터치', head: true },
        { text: '왼쪽 원: 이동 (끝까지 밀면 달리기) · 화면 드래그: 시점\n공격·검술·회피·방어 버튼 · 오른쪽 위: 메뉴, 물약, 지도, 점프' },
        { text: 'VR (WebXR)', head: true },
        { text: '오른손 컨트롤러가 검입니다. 실제로 휘둘러 베세요. 빠를수록 강합니다.\n오른쪽 트리거를 당긴 채 휘두르기: 선택한 검술 발동\n왼쪽 스틱: 이동 · 오른쪽 스틱: 30° 회전 · 왼쪽 트리거: 방어 · 왼쪽 그립: 회피\nA: 대화·사용 · B: 메뉴 · X: 물약 · Y: 검술 바꾸기 · 왼손목: 상태 표시' },
        { text: '공략', head: true },
        { text: '몬스터 이름 색: 회색(쉬움) · 흰색 · 노랑 · 주황 · 빨강(매우 위험)\n빨갛게 빛나며 자세를 잡으면 공격이 옵니다. 바닥의 빨간 표시는 피하세요.\n방패 든 몬스터와 갑각게는 앞에서 평타를 막습니다. 검술이나 옆·뒤를 노리세요.\n각 층 미궁탑 꼭대기의 보스를 쓰러뜨리면 다음 층이 열립니다. 전이문으로 열린 층 사이를 오갈 수 있습니다.' },
        { label: '닫기', onSelect: () => UI.back(), keep: true },
      ],
    };
  },
  shopItems(f) {
    if (this.shopStock[f]) return this.shopStock[f];
    const r = new RNG(floorSeed(f) ^ 0x5409), L = BAL.rec(f);
    const list = WEAPON_KEYS.map((t) => { const it = makeWeapon(L, r.chance(0.35) ? 1 : 0, t); return it; });
    list.push(makeArmor(L, 0), makeArmor(L, 1));
    this.shopStock[f] = list;
    return list;
  },
  shopMenu() {
    const s = G.save, f = G.floor.f, pp = potionPrice(s.level), op = orePrice(BAL.rec(f));
    const buy = (cost, fn) => { if (s.col < cost) { Sfx.error(); UI.toast('Col이 부족합니다.', '#ff9a8a'); return; } s.col -= cost; fn(); Sfx.coin(); this.autosave(); };
    return {
      title: '잡화상', sub: `보유 ${fmt(s.col)} Col · 물약 ${s.potions} · 광석 ${s.ores}`,
      items: [
        { label: '회복 물약', detail: '최대 체력의 45%를 빠르게 회복합니다. (R)', right: `${fmt(pp)} Col`, onSelect: () => buy(pp, () => s.potions++) },
        { label: '회복 물약 ×10', right: `${fmt(pp * 10)} Col`, onSelect: () => buy(pp * 10, () => { s.potions += 10; }) },
        { label: '강화 광석', detail: '대장장이에게 장비 강화를 맡길 때 씁니다.', right: `${fmt(op)} Col`, onSelect: () => buy(op, () => s.ores++) },
        { text: '장비', head: true },
        ...this.shopItems(f).map((it) => ({ label: itemLabel(it), color: RARITY[it.r].color, detail: this.itemDesc(it), right: `${fmt(itemPrice(it))} Col`, onSelect: () => buy(itemPrice(it), () => { const c = Object.assign({}, it, { uid: newUid() }); this.giveItem(c); }) })),
        { text: '판매', head: true },
        { label: '장비 팔기', onSelect: () => UI.openMenu(() => this.sellMenu()), keep: true },
        { label: '재료 모두 팔기', detail: '진행 중인 수집 의뢰에 필요한 만큼은 남깁니다.', right: `${fmt(this.matValue())} Col`, disabled: this.matValue() <= 0, onSelect: () => { s.col += this.matValue(); this.sellMats(); Sfx.coin(); } },
      ],
    };
  },
  matKeep() {
    const s = G.save, keep = {};
    for (let f = 1; f <= s.maxFloor; f++) { const q = floorQuests(f)[1]; const st = s.quests[q.id]; if (st && st.state === 'active') keep[q.mat] = (keep[q.mat] || 0) + q.count; }
    return keep;
  },
  matValue() {
    const s = G.save, keep = this.matKeep(); let v = 0;
    for (const [k, n] of Object.entries(s.mats)) { const sell = Math.max(0, n - (keep[k] || 0)); const ti = THEMES.findIndex((t) => t.mat === k); v += sell * BAL.enemyCol(BAL.rec(ti + 1 + Math.floor((s.maxFloor - 1) / 10) * 10)) * 0.6; }
    return Math.round(v);
  },
  sellMats() { const s = G.save, keep = this.matKeep(); for (const k of Object.keys(s.mats)) s.mats[k] = Math.min(s.mats[k], keep[k] || 0); },
  sellMenu() {
    const s = G.save;
    const pool = s.inv.filter((i) => i.uid !== s.equip.weapon && i.uid !== s.equip.armor).sort((a, b) => itemPrice(b) - itemPrice(a));
    const junk = pool.filter((i) => i.r <= 1);
    const junkV = junk.reduce((a, i) => a + Math.round(itemPrice(i) * 0.25), 0);
    return {
      title: '장비 팔기', sub: `보유 ${fmt(s.col)} Col`,
      items: [
        { label: '일반·고급 등급 모두 팔기', detail: `${junk.length}개`, right: `${fmt(junkV)} Col`, disabled: !junk.length, onSelect: () => { for (const i of junk) s.inv.splice(s.inv.indexOf(i), 1); s.col += junkV; Sfx.coin(); } },
        ...pool.map((it) => ({ label: itemLabel(it), color: RARITY[it.r].color, detail: this.itemDesc(it), right: `${fmt(itemPrice(it) * 0.25)} Col`, onSelect: () => { s.inv.splice(s.inv.indexOf(it), 1); s.col += Math.round(itemPrice(it) * 0.25); Sfx.coin(); } })),
      ],
    };
  },
  smithMenu() {
    const s = G.save, f = G.floor.f, T = G.floor.T;
    const row = (it, what) => {
      if (!it) return { text: `${what} 없음` };
      if (it.plus >= 10) return { label: `${what}: ${itemLabel(it)}`, detail: '최대 강화', right: '+10', disabled: true, onSelect: () => {} };
      const need = it.plus + 1, cost = Math.round(itemPrice(it) * 0.2 * (it.plus + 1)), rate = BAL.enhanceRate[it.plus];
      return {
        label: `${what}: ${itemLabel(it)} → +${it.plus + 1}`, color: RARITY[it.r].color,
        detail: `성공률 ${Math.round(rate * 100)}% · 강화 광석 ${need}개 (보유 ${s.ores}) · ${fmt(cost)} Col`,
        right: '강화', disabled: s.ores < need || s.col < cost,
        onSelect: () => {
          s.ores -= need; s.col -= cost;
          if (Math.random() < rate) { it.plus++; s.stats.maxPlus = Math.max(s.stats.maxPlus, it.plus); Sfx.enhance(true); UI.toast(`강화 성공! ${itemLabel(it)}`, '#ffd24a'); FX.burst(Player.swordTip(new THREE.Vector3()), 0xffd24a, 30, 4, 0.2, 0.6); }
          else { Sfx.enhance(false); UI.toast('강화 실패… 재료가 사라졌습니다.', '#ff9a8a'); }
          Player.recalc(); this.checkAch(); this.autosave();
        },
      };
    };
    const craftCost = Math.round(BAL.enemyCol(BAL.rec(f)) * 40);
    const have = s.mats[T.mat] || 0;
    return {
      title: '대장장이', sub: `광석 ${s.ores} · ${fmt(s.col)} Col · 실패해도 강화 단계는 내려가지 않습니다`,
      items: [
        row(Player.weapon(), '무기'), row(Player.armor(), '방어구'),
        { text: '제작', head: true },
        ...WEAPON_KEYS.map((t) => ({
          label: `희귀 ${WEAPONS[t].name} 제작`, detail: `${T.mat} 20개 (보유 ${have}) · ${fmt(craftCost)} Col · 이 층 수준`, right: '제작',
          disabled: have < 20 || s.col < craftCost,
          onSelect: () => { s.mats[T.mat] -= 20; s.col -= craftCost; Sfx.enhance(true); this.giveItem(makeWeapon(BAL.rec(f) + 1, Math.random() < 0.12 ? 3 : 2, t)); this.autosave(); },
        })),
      ],
    };
  },
  innMenu() {
    const s = G.save;
    return {
      title: '여관', sub: '"먼 길 오셨네요. 쉬었다 가세요."',
      items: [
        { label: '쉬기', detail: '체력을 모두 회복하고 저장합니다. (무료)', onSelect: () => { Player.hp = Player.maxHp; this.save(); Sfx.levelUp(); UI.toast('푹 쉬었습니다. 저장했습니다.', '#9ae8b0'); } },
        { text: `${s.name}의 여정: 돌파한 층 ${s.cleared} · 레벨 ${s.level} · 플레이 ${this.playtime(s.stats.play)}` },
        { text: '소문: 황금빛으로 빛나는 몬스터는 귀한 장비를 떨어뜨린다고 합니다. 네임드 몬스터는 5분이 지나면 다시 나타납니다.' },
      ],
    };
  },
  gateMenu() {
    const s = G.save, cur = G.floor.f;
    const rows = [];
    for (let f = s.maxFloor; f >= 1; f--) {
      const T = themeForFloor(f);
      const town = makeName(new RNG(floorSeed(f) ^ 0x77), SYL_TOWN, 2, 3) + ' ' + new RNG(floorSeed(f) ^ 0x78).pick(TOWN_SUFFIX);
      rows.push({ label: `제 ${f}층 · ${town}`, detail: `${T.name} · 권장 Lv.${BAL.rec(f)}${f <= s.cleared ? ' · 돌파' : ''}`, right: f === cur ? '현재 위치' : '', disabled: f === cur, onSelect: () => { UI.closeMenu(); this.travel(f); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true });
    }
    return { title: '전이문', sub: `열린 층 ${s.maxFloor} / ${MAX_FLOOR}`, items: rows };
  },
  endingMenu() {
    const s = G.save;
    return {
      title: '정상', sub: '100층의 하늘을 넘어섰습니다.',
      items: [
        { text: `${s.name} · 레벨 ${s.level} · 처치 ${fmt(s.stats.kills)} · 사망 ${s.stats.deaths} · 플레이 ${this.playtime(s.stats.play)}` },
        { text: '부유성의 모든 층을 돌파했습니다. 전이문으로 언제든 다른 층에 돌아가 더 강한 장비와 숙련도를 노릴 수 있습니다.' },
        { label: '계속 탐험하기', onSelect: () => UI.closeMenu(), keep: true },
      ],
    };
  },

  // ------------------------------------------------------------------ 입력
  lockPointer() {
    const c = $('view');
    if (!c.requestPointerLock || G.touch) return;
    try {
      const p = c.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.noLock = true; });
    } catch (e) { this.noLock = true; }
  },
  bindInput() {
    const c = $('view');
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!e.repeat) Input.pressed.add(e.code);
      Input.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && G.state !== 'title') e.preventDefault();
      if (G.state === 'play') {
        if (e.code === 'Escape' || e.code === 'Tab') { e.preventDefault(); this.openMainMenu(); }
        if (e.code === 'KeyM') this.openMap();
      }
    });
    window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
    window.addEventListener('blur', () => { Input.keys.clear(); Input.mouseL = Input.mouseR = false; });
    c.addEventListener('mousedown', (e) => {
      Sfx.init();
      if (G.state !== 'play' || G.touch) return;
      if (!G.pointerLocked && !this.noLock) { this.lockPointer(); return; }
      if (e.button === 0) { Input.mouseL = true; if (G.pointerLocked) Input.clickL = true; this.dragStart = [e.clientX, e.clientY]; this.dragged = false; }
      if (e.button === 2) Input.mouseR = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { if (!G.pointerLocked && this.noLock && !this.dragged && G.state === 'play') Input.clickL = true; Input.mouseL = false; }
      if (e.button === 2) Input.mouseR = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (G.pointerLocked) { Input.mouseDX += e.movementX; Input.mouseDY += e.movementY; }
      else if (this.noLock && Input.mouseL && G.state === 'play') { Input.mouseDX += e.movementX; Input.mouseDY += e.movementY; if (this.dragStart && Math.hypot(e.clientX - this.dragStart[0], e.clientY - this.dragStart[1]) > 6) this.dragged = true; }
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = G.pointerLocked;
      G.pointerLocked = document.pointerLockElement === c;
      if (was && !G.pointerLocked && G.state === 'play') this.openMainMenu();
    });
    document.addEventListener('pointerlockerror', () => { this.noLock = true; UI.toast('마우스 고정을 쓸 수 없어 드래그로 시점을 돌립니다.'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.save(); if (G.state === 'play' && !G.xr) this.openMainMenu(); } });
    window.addEventListener('beforeunload', () => this.save());
  },

  // ------------------------------------------------------------------ VR
  setupXR() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return;
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) { $('b-vr').hidden = false; this.vrOK = true; } }).catch(() => {});
    R.renderer.xr.addEventListener('sessionstart', () => {
      G.xr = true;
      Player.initXR();
      Player.attachSword();
      UI.setupVRFlash();
      UI.showHUD(false);
      $('hud').hidden = true;
      R.camera.position.set(0, 0, 0); R.camera.rotation.set(0, 0, 0);
      R.rig.position.set(Player.pos.x, Player.pos.y, Player.pos.z);
      R.rig.rotation.set(0, Player.yaw, 0);
      if (UI.stack.length) UI.render();
      UI.banner(`제 ${G.floor.f}층`, '오른손 컨트롤러가 검입니다. 휘두르세요!', 4000);
    });
    R.renderer.xr.addEventListener('sessionend', () => {
      G.xr = false;
      Player.yaw = R.rig.rotation.y;
      R.rig.rotation.set(0, 0, 0);
      Player.attachSword();
      if (UI.vr) UI.vr.mesh.visible = false;
      if (G.save) { UI.showHUD(true); if (G.state === 'menu') UI.render(); }
    });
  },
  async enterVR() {
    Sfx.init();
    if (!G.save) {
      const s = this.readSave() || this.newSave('VR 검사', false);
      Store.set(SAVE_KEY, JSON.stringify(s));
      this.startGame(s, !this.readSave());
    }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await R.renderer.xr.setSession(session);
    } catch (e) {
      UI.toast('VR을 시작할 수 없습니다. 헤드셋 브라우저에서 HTTPS 주소로 열어 주세요.', '#ff9a8a');
    }
  },

  // ------------------------------------------------------------------ 루프
  frame(t) {
    try { this.step(t); } catch (e) {
      // 한 프레임의 오류로 루프 전체가 멈추지 않게 한다
      if (!this._errShown) { this._errShown = true; console.error('[Skyspire]', e); UI.toast('오류가 발생했습니다: ' + e.message, '#ff9a8a'); }
      try { Input.endFrame(); R.renderer.render(R.scene, R.camera); } catch (e2) { /* 무시 */ }
    }
  },
  step(t) {
    const now = t / 1000;
    const raw = this.last ? now - this.last : 0.016;
    let dt = Math.min(0.05, raw);
    this.last = now;
    if (dt <= 0) dt = 0.001;
    this.frames = (this.frames || 0) + 1;
    this.fps = lerp(this.fps, 1 / Math.max(raw, 1e-3), 0.05);
    this.logic(dt);
    R.renderer.render(R.scene, R.camera);
  },
  logic(dt) {
    G.time += dt;
    R.timeU.value = G.time;
    let gdt = dt;
    if (G.hitStop > 0) { G.hitStop -= dt; gdt = dt * 0.1; }
    const F = G.floor;
    if (G.state === 'play' || G.state === 'dead') {
      if (G.xr && G.state === 'play') Player.syncXRBefore();
      Player.update(gdt);
      if (G.xr && G.state === 'play') Player.syncXRAfter();
      Ents.updateSpawns(World.active, gdt);
      Ents.update(gdt);
      this.updateArea();
      if (G.save) G.save.stats.play += dt;
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = 30; this.save(); }
    } else if (G.state === 'title' && F) {
      const a = G.time * 0.05;
      const cx = F.town.x, cz = F.town.z;
      R.rig.position.set(cx + Math.cos(a) * 70, F.townH + 26 + Math.sin(G.time * 0.2) * 4, cz + Math.sin(a) * 70);
      R.rig.rotation.set(0, 0, 0);
      R.camera.position.set(0, 0, 0);
      R.camera.lookAt(lerp(cx, F.tower.x, 0.35), F.townH + 18, lerp(cz, F.tower.z, 0.35));
    } else if (G.state === 'menu') {
      if (G.xr) { Player.updateXRHits(dt); UI.updateVRMenu(); }
      else if (G.save) Player.updateCamera(dt);
    }
    // 월드 애니메이션
    const A = World.active;
    if (A) for (const fn of A.animated) fn(G.time);
    if (World.field && World.field.grass) {
      const u = World.field.grass.material.uniforms;
      u.center.value.copy(G.state === 'title' ? R.rig.position : Player.pos);
    }
    if (World.field) for (const n of World.field.npcs) { n.phase += dt; n.head.position.y = 1.78 + Math.sin(n.phase * 1.4) * 0.015; n.head.rotation.y = Math.sin(n.phase * 0.5) * 0.4; }
    if (World.dungeon && A === World.dungeon) World.updateDungeonLights(World.dungeon, Player.pos.x, Player.pos.z);
    const camPos = R.camera.getWorldPosition(new THREE.Vector3());
    R.sky.position.copy(camPos);
    R.followSun(G.state === 'title' ? camPos.x : Player.pos.x, G.state === 'title' ? camPos.z : Player.pos.z);
    FX.update(gdt);
    if (G.save && (G.state === 'play' || G.state === 'menu' || G.state === 'dead')) { UI.update(dt); if (G.touch) UI.updateTouchLabels(); }
    else UI.updateVRBanner(dt);
    Sfx.updateMusic(dt);
    Input.endFrame();
  },
};

Game.init();
if (location.search.includes('debug')) window.__sky = { G, Player, Game, World, Ents, UI, R, FX, BAL, THREE };
