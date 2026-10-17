// ---------------------------------------------------------------------------
// 집 짓기: 바닥, 천장(거실 우물천장과 간접조명), 벽과 개구부, 방마다 벽 마감, 걸레받이,
// 창(여닫이·미닫이 통창), 문(여닫이·미닫이·유리 중문·현관문), 충돌 상자, 조명 구역
// ---------------------------------------------------------------------------
const Build = {
  group: null, colliders: [], doors: [], windows: [], fixtures: [], ceilings: [], lights: {},

  init() {
    this.group = new THREE.Group(); R.scene.add(this.group);
    this.floors();
    this.ceilingsBuild();
    this.walls();
    this.finishes();
    this.openingsBuild();
    this.zoneLights();
  },
  add(geo, mat, x = 0, y = 0, z = 0, cast = true, recv = true, parent = this.group) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
  },
  box(w, h, d, mat, x, y, z, cast = true, parent) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, cast, true, parent); },
  // 월드 좌표 그대로 UV가 되는 바닥/천장 사각형
  rectXZ(x0, z0, x1, z1, y, mat, down = false) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + (x0 + x1) / 2, -(pos.getZ(i) + (z0 + z1) / 2));
    return this.add(g, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, false, true);
  },
  floorMat(kind) { return kind === 'tile' ? Mats.bathFloor : kind === 'stone' ? Mats.stone : Mats.floor; },

  // ---------------- 바닥 (현관은 문 쪽이 한 단 낮다)
  floors() {
    for (const r of ROOMS) {
      const [x0, z0, x1, z1] = r.rect;
      if (r.id === 'foyer') {
        const s = FOYER_STEP;
        this.rectXZ(x0, z0, x1, s.z, -s.drop, Mats.stone);
        this.rectXZ(x0, s.z, x1, z1, 0, Mats.stone);
        this.box(x1 - x0, s.drop, 0.02, Mats.stone, (x0 + x1) / 2, -s.drop / 2, s.z, false);
        continue;
      }
      this.rectXZ(x0, z0, x1, z1, 0, this.floorMat(r.floor));
    }
  },
  floorY(x, z) { return (x > 2.4 && x < 4.2 && z < FOYER_STEP.z && z > -4.6) ? -FOYER_STEP.drop : 0; },

  // ---------------- 천장 (거실은 가운데를 18cm 올린 우물천장 + 간접조명 띠)
  ceilingsBuild() {
    for (const r of ROOMS) {
      const [x0, z0, x1, z1] = r.rect;
      if (r.id !== 'living') { this.ceilings.push(this.rectXZ(x0, z0, x1, z1, H, Mats.ceil, true)); continue; }
      const hx0 = -1.95, hz0 = 1.25, hx1 = 1.75, hz1 = 3.85, up = 0.2;
      // 구멍 난 천장: 네 조각
      this.ceilings.push(this.rectXZ(x0, z0, x1, hz0, H, Mats.ceil, true), this.rectXZ(x0, hz1, x1, z1, H, Mats.ceil, true), this.rectXZ(x0, hz0, hx0, hz1, H, Mats.ceil, true), this.rectXZ(hx1, hz0, x1, hz1, H, Mats.ceil, true));
      this.ceilings.push(this.rectXZ(hx0, hz0, hx1, hz1, H + up, Mats.ceil, true));
      // 옆면과 숨은 LED 띠
      const sides = [[hx0, hz0, hx1, hz0], [hx0, hz1, hx1, hz1], [hx0, hz0, hx0, hz1], [hx1, hz0, hx1, hz1]];
      this.cove = [];
      for (const [ax, az, bx, bz] of sides) {
        const len = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2, alongX = az === bz;
        const s = this.box(alongX ? len : 0.02, up, alongX ? 0.02 : len, Mats.ceil, cx, H + up / 2, cz, false); this.ceilings.push(s);
        const led = this.box(alongX ? len - 0.05 : 0.012, 0.025, alongX ? 0.012 : len - 0.05, Mats.led, cx + (alongX ? 0 : (ax === hx0 ? 0.03 : -0.03)), H + up - 0.03, cz + (alongX ? (az === hz0 ? 0.03 : -0.03) : 0), false);
        this.cove.push(led); this.ceilings.push(led);
      }
    }
  },

  // ---------------- 벽: 개구부를 피해 상자로 쌓는다
  walls() {
    for (const w of WALLS) {
      const alongX = w.a[1] === w.b[1];
      const lo = alongX ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]), hi = alongX ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
      const c = alongX ? w.a[1] : w.a[0], ext = w.t / 2;
      const ops = w.open.slice().sort((p, q) => p.s - q.s);
      const piece = (s, e, y0, y1, block) => {
        if (e - s < 0.005 || y1 - y0 < 0.005) return;
        const len = e - s, mid = (s + e) / 2;
        const m = alongX ? this.box(len, y1 - y0, w.t, Mats.wall, mid, (y0 + y1) / 2, c) : this.box(w.t, y1 - y0, len, Mats.wall, c, (y0 + y1) / 2, mid);
        m.userData.wall = true;
        if (block) this.colliders.push(alongX ? { x0: s, x1: e, z0: c - ext, z1: c + ext } : { x0: c - ext, x1: c + ext, z0: s, z1: e });
      };
      let cur = lo - ext;
      for (const o of ops) {
        piece(cur, o.s, 0, H, true);
        if (o.y0 > 0.01) piece(o.s, o.e, 0, o.y0, o.y0 > 0.3);
        if (o.y1 < H) piece(o.s, o.e, o.y1, H, false);
        cur = o.e;
      }
      piece(cur, hi + ext, 0, H, true);
    }
  },

  // ---------------- 방마다 벽 마감: 벽 중심선에서 두께 절반 안쪽에 개구부를 뚫은 판을 붙인다
  finishes() {
    for (const r of ROOMS) {
      const [x0, z0, x1, z1] = r.rect;
      const sides = [
        { alongX: true, c: z0, lo: x0, hi: x1, inward: 1 }, { alongX: true, c: z1, lo: x0, hi: x1, inward: -1 },
        { alongX: false, c: x0, lo: z0, hi: z1, inward: 1 }, { alongX: false, c: x1, lo: z0, hi: z1, inward: -1 },
      ];
      for (const sd of sides) for (const w of WALLS) {
        const wAlongX = w.a[1] === w.b[1];
        if (wAlongX !== sd.alongX) continue;
        const wc = wAlongX ? w.a[1] : w.a[0];
        if (Math.abs(wc - sd.c) > 0.01) continue;
        const wlo = wAlongX ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]), whi = wAlongX ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
        const s = Math.max(sd.lo, wlo), e = Math.min(sd.hi, whi);
        if (e - s < 0.05) continue;
        const holes = w.open.filter((o) => o.e > s && o.s < e).map((o) => ({ s: Math.max(o.s, s), e: Math.min(o.e, e), y0: o.y0, y1: o.y1 }));
        let mat = Mats.wall;
        if (r.floor === 'tile') mat = Mats.bathWall;
        if (r.id === 'living' && !sd.alongX && sd.c === 2.4) mat = Mats.accent;
        const top = r.id === 'living' ? H + 0.01 : H;
        this.panel(sd, s, e, w.t / 2 + 0.004, holes, mat, top, r.floor !== 'tile' && r.floor !== 'stone'); // 벽 상자 면에서 4mm 띄워 겹침 깜박임 방지
      }
    }
  },
  panel(sd, s, e, off, holes, mat, top, baseboard) {
    const len = e - s;
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len, top); shape.lineTo(0, top); shape.closePath();
    // 바닥까지 닿는 개구부(문)는 모양을 쪼개야 하므로 따로 처리: 위쪽 구멍만 hole로, 문은 판을 나눈다
    const doors = holes.filter((h) => h.y0 < 0.02).sort((a, b) => a.s - b.s);
    const wins = holes.filter((h) => h.y0 >= 0.02);
    // 문이 있으면 [s, e]를 문 사이 조각과 문 위 조각으로 나눈다
    const parts = [];
    let cur = s;
    for (const d of doors) { parts.push({ s: cur, e: d.s, y0: 0, y1: top }); parts.push({ s: d.s, e: d.e, y0: d.y1, y1: top }); cur = d.e; }
    parts.push({ s: cur, e, y0: 0, y1: top });
    for (const p of parts) {
      if (p.e - p.s < 0.01 || p.y1 - p.y0 < 0.01) continue;
      const sh = new THREE.Shape(); sh.moveTo(0, p.y0); sh.lineTo(p.e - p.s, p.y0); sh.lineTo(p.e - p.s, p.y1); sh.lineTo(0, p.y1); sh.closePath();
      for (const h of wins) { if (h.e <= p.s || h.s >= p.e || h.y0 < p.y0) continue; const hs = Math.max(h.s, p.s) - p.s, he = Math.min(h.e, p.e) - p.s; const path = new THREE.Path(); path.moveTo(hs, h.y0); path.lineTo(hs, Math.min(h.y1, p.y1 - 0.001)); path.lineTo(he, Math.min(h.y1, p.y1 - 0.001)); path.lineTo(he, h.y0); path.closePath(); sh.holes.push(path); }
      const g = new THREE.ShapeGeometry(sh);
      // UV를 벽 위치 기준 m 단위로
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + p.s, pos.getY(i));
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false;
      this.placePanel(m, sd, p.s, p.e, off);
      this.group.add(m);
      if (baseboard && p.y0 < 0.01) {
        const bb = new THREE.Mesh(new THREE.BoxGeometry(p.e - p.s, 0.07, 0.014), Mats.trim);
        bb.position.set((p.e - p.s) / 2, 0.035, 0.007); bb.receiveShadow = true;
        const holder = new THREE.Group(); holder.add(bb); this.placePanel(holder, sd, p.s, p.e, off + 0.001); this.group.add(holder);
      }
    }
  },
  // 판(로컬 xy, +z가 앞면)을 방 안쪽을 보게 놓는다
  placePanel(m, sd, s, e, off) {
    if (sd.alongX) {
      if (sd.inward > 0) { m.position.set(s, 0, sd.c + off); m.rotation.y = 0; }
      else { m.position.set(e, 0, sd.c - off); m.rotation.y = Math.PI; }
    } else {
      if (sd.inward > 0) { m.position.set(sd.c + off, 0, e); m.rotation.y = Math.PI / 2; }
      else { m.position.set(sd.c - off, 0, s); m.rotation.y = -Math.PI / 2; }
    }
  },

  // ---------------- 창과 문
  openingsBuild() {
    for (const w of WALLS) {
      const alongX = w.a[1] === w.b[1], c = alongX ? w.a[1] : w.a[0];
      for (const o of w.open) {
        const info = { w, o, alongX, c, mid: (o.s + o.e) / 2, len: o.e - o.s };
        if (o.win) this.windowBuild(info);
        else if (o.door) this.doorBuild(info);
      }
    }
  },
  // 개구부 로컬 좌표계: x = 벽 방향(개구부 시작 0), z = 벽 법선(+z 또는 +x 쪽), 원점 = 벽 중심선 위 개구부 시작
  frameGroup(info) {
    const g = new THREE.Group();
    if (info.alongX) { g.position.set(info.o.s, 0, info.c); }
    else { g.position.set(info.c, 0, info.o.e); g.rotation.y = Math.PI / 2; }
    this.group.add(g);
    return g;
  },
  windowBuild(info) {
    const { o, w } = info, g = this.frameGroup(info), len = info.len, h = o.y1 - o.y0, ft = 0.06;
    const B = (ww, hh, dd, mat, x, y, z, cast = true) => this.box(ww, hh, dd, mat, x, y, z, cast, g);
    // 바깥 틀
    B(len, ft, 0.12, Mats.frame, len / 2, o.y0 + ft / 2, 0); B(len, ft, 0.12, Mats.frame, len / 2, o.y1 - ft / 2, 0);
    B(ft, h, 0.12, Mats.frame, ft / 2, (o.y0 + o.y1) / 2, 0); B(ft, h, 0.12, Mats.frame, len - ft / 2, (o.y0 + o.y1) / 2, 0);
    const panes = o.win === 'slider' ? 4 : len > 1.6 ? 2 : 1;
    for (let i = 1; i < panes; i++) B(0.05, h - ft * 2, 0.1, Mats.frame, (len / panes) * i, (o.y0 + o.y1) / 2, i % 2 ? 0.02 : -0.02);
    // 유리 (두 겹: 안쪽 미닫이 / 바깥 고정 느낌)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len - ft * 2, h - ft * 2), Mats.glass);
    glass.position.set(len / 2, (o.y0 + o.y1) / 2, 0); glass.renderOrder = 5; g.add(glass);
    const glass2 = glass.clone(); glass2.position.z = w.ext ? 0.05 : -0.03; g.add(glass2);
    // 창턱 (안쪽)
    const inward = this.inwardSign(info);
    if (o.y0 > 0.1) B(len + 0.06, 0.03, w.t / 2 + 0.04, Mats.trim, len / 2, o.y0 - 0.015, inward * (w.t / 4 + 0.02), false);
    // 통창은 유리도 막는다
    if (o.y0 < 0.3) this.colliders.push(info.alongX ? { x0: o.s, x1: o.e, z0: info.c - w.t / 2, z1: info.c + w.t / 2 } : { x0: info.c - w.t / 2, x1: info.c + w.t / 2, z0: o.s, z1: o.e });
    this.windows.push({ ...info, inward, group: g, room: this.roomBeside(info, inward) });
  },
  // 개구부에서 방 안쪽이 어느 쪽인지 (바깥벽이면 집 안 방향)
  inwardSign(info) {
    const p = info.alongX ? [info.mid, info.c + 0.3] : [info.c + 0.3, info.mid];
    return roomAt(p[0], p[1]) ? 1 : -1;
  },
  roomBeside(info, sign) { const d = 0.3 * sign; return info.alongX ? roomAt(info.mid, info.c + d) : roomAt(info.c + d, info.mid); },

  doorBuild(info) {
    const { o, w } = info, g = this.frameGroup(info), len = info.len, h = o.y1 - o.y0, ct = 0.06;
    const B = (ww, hh, dd, mat, x, y, z, cast = true, parent = g) => this.box(ww, hh, dd, mat, x, y, z, cast, parent);
    // 문틀 (양쪽 면 몰딩 + 안쪽 문틀)
    const casing = o.front ? Mats.black : Mats.trim;
    if (o.door !== 'glass2') {
      for (const side of [-1, 1]) {
        const z = side * (w.t / 2 + 0.008);
        B(ct, h + ct, 0.016, casing, -ct / 2, (h + ct) / 2, z, false); B(ct, h + ct, 0.016, casing, len + ct / 2, (h + ct) / 2, z, false);
        B(len + ct * 2, ct, 0.016, casing, len / 2, h + ct / 2, z, false);
      }
      B(0.02, h, w.t, casing, 0.01, h / 2, 0, false); B(0.02, h, w.t, casing, len - 0.01, h / 2, 0, false); B(len, 0.02, w.t, casing, len / 2, h - 0.01, 0, false);
    }
    if (o.door === 'none') return;
    const door = { id: o.id, name: o.name, info, open: false, k: 0, kind: o.door, group: g };
    if (o.door === 'hinge') {
      // 경첩 축: hinge가 시작 쪽(s/w)이면 x=0, 끝 쪽(e/n)이면 x=len
      // 벽 방향 로컬 x=0이 경첩 쪽인가: z축 벽은 로컬 원점이 큰 쪽(o.e)이라 반대로 읽는다
      const atStart = info.alongX ? o.hinge === 'lo' : o.hinge === 'hi';
      const pivot = new THREE.Group(); pivot.position.set(atStart ? 0.02 : len - 0.02, 0, 0); g.add(pivot);
      const lw = len - 0.04, mat = o.front ? Mats.black : o.glass ? Mats.glassDoor : Mats.door;
      const leaf = new THREE.Group(); pivot.add(leaf);
      const sx = atStart ? 1 : -1;
      if (o.glass) {
        // 유리문: 가는 틀 + 유리
        const fb = (ww, hh, x, y) => B(ww, hh, 0.04, Mats.frame, x, y, 0, true, leaf);
        fb(lw, 0.06, sx * lw / 2, 0.03); fb(lw, 0.06, sx * lw / 2, h - 0.05); fb(0.06, h - 0.02, sx * 0.03, h / 2); fb(0.06, h - 0.02, sx * (lw - 0.03), h / 2);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.12, h - 0.14), Mats.glassDoor); gl.position.set(sx * lw / 2, h / 2, 0); leaf.add(gl);
      }
      else B(lw, h - 0.02, o.front ? 0.06 : 0.04, mat, sx * lw / 2, h / 2, 0, true, leaf);
      // 손잡이 (레버) 양쪽
      for (const side of [-1, 1]) {
        const hx = sx * (lw - 0.08);
        B(0.02, 0.02, 0.05, Mats.metal, hx, 1.0, side * 0.045, true, leaf);
        B(0.13, 0.018, 0.018, Mats.metal, hx - sx * 0.055, 1.0, side * 0.07, true, leaf);
      }
      if (o.front) { B(0.07, 0.16, 0.03, Mats.blackGlass, sx * (lw - 0.1), 1.25, -0.045, true, leaf); B(0.1, 0.1, 0.01, Mats.metal, sx * lw / 2, 1.55, 0.035, true, leaf); }
      door.pivot = pivot; door.leaf = leaf; door.sign = (o.swing || 1) * (atStart ? -1 : 1); door.lw = lw; door.atStart = atStart;
      door.hitMeshes = leaf.children.slice();
    } else if (o.door === 'slide') {
      // 벽 앞(드레스룸 쪽)을 따라 미끄러지는 문짝
      const leaf = new THREE.Group(); g.add(leaf);
      const side = this.inwardSign(info) > 0 ? -1 : 1; // 드레스룸 쪽
      B(len + 0.08, h + 0.02, 0.04, Mats.door, len / 2, (h + 0.02) / 2, 0, true, leaf);
      B(0.025, 0.4, 0.03, Mats.metal, 0.12, 1.0, 0.035 * -side, true, leaf);
      leaf.position.z = side * (w.t / 2 + 0.03);
      B(len * 2 + 0.2, 0.04, 0.05, Mats.metal, len, h + 0.06, side * (w.t / 2 + 0.03), false);
      door.leaf = leaf; door.slideLen = len; door.hitMeshes = leaf.children.slice();
    } else if (o.door === 'glass2') {
      // 유리 중문: 두 짝이 가운데에서 양옆으로 열린다
      const leaves = [];
      for (const k of [0, 1]) {
        const leaf = new THREE.Group(); g.add(leaf);
        const pw = len / 2 + 0.02;
        const fr = (ww, hh, x, y) => B(ww, hh, 0.035, Mats.frame, x, y, 0, true, leaf);
        fr(pw, 0.035, pw / 2, 0.03); fr(pw, 0.035, pw / 2, h - 0.02); fr(0.035, h, 0.0175, h / 2); fr(0.035, h, pw - 0.0175, h / 2);
        fr(pw, 0.02, pw / 2, h * 0.36); fr(pw, 0.02, pw / 2, h * 0.7);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.05, h - 0.06), Mats.glassDoor); gl.position.set(pw / 2, h / 2, 0); leaf.add(gl);
        leaf.position.set(k === 0 ? 0 : len / 2 - 0.02, 0, k === 0 ? 0.02 : -0.02);
        leaf.userData.base = leaf.position.x; leaf.userData.dir = k === 0 ? -1 : 1;
        leaves.push(leaf);
      }
      B(len, 0.05, w.t, Mats.frame, len / 2, h + 0.025, 0, false);
      door.leaves = leaves; door.hitMeshes = leaves.flatMap((l) => l.children);
    }
    this.doors.push(door);
  },
  // 문이 닫혀 있으면 지나갈 수 없다 (열림 정도 k < 0.6)
  doorBlockers() {
    const out = [];
    for (const d of this.doors) {
      if (d.k > 0.6) continue;
      const { o, w, alongX, c } = d.info, t = w.t / 2 + 0.03;
      out.push(alongX ? { x0: o.s, x1: o.e, z0: c - t, z1: c + t } : { x0: c - t, x1: c + t, z0: o.s, z1: o.e });
    }
    return out;
  },

  // ---------------- 조명 구역: 천장 점광원 + 다운라이트 모양
  zoneLights() {
    for (const [k, z] of Object.entries(ZONES)) {
      const L = { key: k, on: false, lights: [], fixtures: [], dim: 1 };
      for (const [x, y, zz] of z.lights) {
        const pl = new THREE.PointLight(0xffd8a8, 0, k === 'living' ? 8 : 6.5, 2);
        pl.position.set(x, y, zz); R.scene.add(pl); L.lights.push(pl);
      }
      this.lights[k] = L;
    }
    // 다운라이트 (방마다 몇 개)
    const spots = {
      living: [[-2.25, 1.0], [-2.25, 4.1], [2.05, 1.0], [2.05, 4.1], [-1.0, 0.85], [1.0, 0.85]], kitchen: [[-1.2, -3.0], [0, -3.0], [1.2, -3.0], [-1.9, -2.0], [1.9, -2.0], [1.7, -3.9]],
      master: [[3.2, 1.1], [5.4, 1.1], [3.2, 4.1], [5.4, 4.1], [5.1, -0.6]], mbath: [[5.1, -3.1]], entry: [[3.3, -3.6], [3.3, -1.6], [3.3, -0.2]], room2: [[-4.3, 1.4], [-4.3, 3.8]],
      room3: [[-4.3, -2.2], [-4.3, -3.8], [-3.2, -0.3]], bath: [[-4.9, -0.3]], utility: [[-1.5, -5.15]],
    };
    const ring = new THREE.TorusGeometry(0.055, 0.008, 6, 20); ring.rotateX(Math.PI / 2);
    const disc = new THREE.CircleGeometry(0.05, 20); disc.rotateX(Math.PI / 2);
    for (const [k, list] of Object.entries(spots)) for (const [x, z] of list) {
      const y = H - 0.002;
      const r = new THREE.Mesh(ring, Mats.trim); r.position.set(x, y, z); this.group.add(r);
      const d = new THREE.Mesh(disc, Mats.ledOff); d.position.set(x, y - 0.001, z); this.group.add(d);
      this.lights[k].fixtures.push(d); this.ceilings.push(r, d);
    }
  },
  setZone(k, on) {
    const L = this.lights[k]; if (!L) return;
    L.on = on;
    const s = STYLES[G.style];
    for (const pl of L.lights) { pl.color.setHex(s.led); pl.intensity = on ? (k === 'living' ? 16 : 11) * L.dim : 0; }
    for (const f of L.fixtures) f.material = on ? Mats.downOn : Mats.ledOff;
    if (k === 'living' && this.cove) for (const c of this.cove) c.material = on ? Mats.led : Mats.ledOff;
    if (typeof Interior !== 'undefined') Interior.onZone(k, on);
  },
};
