// ---------------------------------------------------------------------------
// 몬스터, 보스, 투사체, NPC, 상자
// ---------------------------------------------------------------------------
const SG = {}; // 공유 지오메트리
function sharedGeo() {
  if (SG.box) return SG;
  SG.box = new THREE.BoxGeometry(1, 1, 1);
  SG.ico = new THREE.IcosahedronGeometry(0.5, 1);
  SG.ico0 = new THREE.IcosahedronGeometry(0.5, 0);
  SG.cone = new THREE.ConeGeometry(0.5, 1, 7);
  SG.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  SG.sphere = new THREE.SphereGeometry(0.5, 14, 10);
  SG.octa = new THREE.OctahedronGeometry(0.5, 0);
  SG.plane = new THREE.PlaneGeometry(1, 1);
  SG.dodeca = new THREE.DodecahedronGeometry(0.5, 0);
  for (const k in SG) SG[k].userData.shared = true;
  return SG;
}

const Ents = {
  list: [], projectiles: [], hazards: [], boss: null,
  _v: new THREE.Vector3(), _v2: new THREE.Vector3(),

  // ------------------------------------------------------------------ 모델
  buildModel(key, cols, scale = 1, opts = {}) {
    const g = sharedGeo();
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const mats = [];
    const mat = (color, o = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05, flatShading: true }, o)); mats.push(m); return m; };
    const c0 = mat(cols[0], opts.rare ? { metalness: 0.85, roughness: 0.25 } : {}), c1 = mat(cols[1], opts.rare ? { metalness: 0.7, roughness: 0.3 } : {});
    const eye = new THREE.MeshStandardMaterial({ color: cols[2], emissive: cols[2], emissiveIntensity: 2.2 });
    const bone = mat(0xe8e0cc), steel = mat(0xb8bcc4, { metalness: 0.85, roughness: 0.3 });
    const mk = (geo, m, x, y, z, sx, sy, sz, parent = body, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz);
      o.castShadow = true; parent.add(o); return o;
    };
    const pivot = (x, y, z, parent = body) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
    const rig = { root, body, legs: [], legPhase: [], arms: [], wings: [], mats, eyeMat: eye, hover: 0, kind: key };
    const leg = (x, y, z, w, len, m, phase) => { const p = pivot(x, y, z); mk(g.box, m, 0, -len / 2, 0, w, len, w, p); rig.legs.push(p); rig.legPhase.push(phase); return p; };

    // 두 발 인간형 공통
    const humanoid = (o) => {
      const hipY = o.h * 0.47, legLen = o.h * 0.45, torsoH = o.h * 0.3;
      leg(-o.tw * 0.25, hipY, 0, o.limb, legLen, c1, 0); leg(o.tw * 0.25, hipY, 0, o.limb, legLen, c1, Math.PI);
      const torso = mk(g.box, c0, 0, hipY + torsoH / 2, 0, o.tw, torsoH, o.td);
      rig.torso = torso;
      const headP = pivot(0, hipY + torsoH, 0); rig.head = headP;
      const shoulderY = hipY + torsoH * 0.88, armLen = o.h * 0.38;
      for (const s of [-1, 1]) {
        const p = pivot(s * (o.tw / 2 + o.limb * 0.6), shoulderY, 0);
        mk(g.box, c0, 0, -armLen / 2, 0, o.limb * 0.9, armLen, o.limb * 0.9, p);
        rig.arms.push(p);
      }
      rig.hand = pivot(0, -armLen, 0.05, rig.arms[1]);
      return { hipY, torsoH, headP };
    };

    switch (key) {
      case 'boar': {
        mk(g.ico, c0, 0, 0.85, 0, 1.1, 0.95, 1.7);
        const head = pivot(0, 0.85, 0.85); rig.head = head;
        mk(g.box, c0, 0, 0, 0.15, 0.7, 0.6, 0.6, head);
        mk(g.box, c1, 0, -0.1, 0.5, 0.42, 0.32, 0.3, head);
        for (const s of [-1, 1]) { mk(g.cone, bone, s * 0.2, -0.15, 0.55, 0.09, 0.4, 0.09, head, -1.1, 0, s * 0.3); mk(g.ico0, eye, s * 0.2, 0.12, 0.42, 0.09, 0.09, 0.09, head); mk(g.cone, c1, s * 0.22, 0.38, 0.0, 0.14, 0.28, 0.1, head, -0.3); }
        for (let i = 0; i < 5; i++) mk(g.cone, c1, 0, 1.38 - Math.abs(i - 2) * 0.05, 0.5 - i * 0.28, 0.16, 0.32, 0.16);
        leg(-0.36, 0.62, 0.5, 0.22, 0.62, c1, 0); leg(0.36, 0.62, 0.5, 0.22, 0.62, c1, Math.PI);
        leg(-0.36, 0.62, -0.5, 0.22, 0.62, c1, Math.PI); leg(0.36, 0.62, -0.5, 0.22, 0.62, c1, 0);
        break;
      }
      case 'wolf': {
        mk(g.box, c0, 0, 0.85, -0.1, 0.55, 0.55, 1.3);
        mk(g.ico, c0, 0, 0.92, 0.45, 0.78, 0.78, 0.8);
        const head = pivot(0, 1.15, 0.8); rig.head = head;
        mk(g.box, c0, 0, 0, 0.1, 0.44, 0.42, 0.48, head);
        mk(g.box, c1, 0, -0.08, 0.45, 0.24, 0.2, 0.42, head);
        for (const s of [-1, 1]) { mk(g.cone, c0, s * 0.13, 0.3, -0.02, 0.12, 0.26, 0.1, head); mk(g.ico0, eye, s * 0.12, 0.08, 0.32, 0.08, 0.06, 0.06, head); }
        const tail = pivot(0, 1.0, -0.75); mk(g.cone, c1, 0, -0.35, -0.1, 0.18, 0.75, 0.18, tail, 0.5); rig.tail = tail;
        leg(-0.2, 0.6, 0.45, 0.17, 0.6, c1, 0); leg(0.2, 0.6, 0.45, 0.17, 0.6, c1, Math.PI);
        leg(-0.2, 0.6, -0.55, 0.17, 0.6, c1, Math.PI); leg(0.2, 0.6, -0.55, 0.17, 0.6, c1, 0);
        break;
      }
      case 'slime': {
        const gel = new THREE.MeshPhysicalMaterial({ color: cols[0], roughness: 0.15, transmission: 0.35, transparent: true, opacity: 0.85, thickness: 0.8, clearcoat: 1 });
        mats.push(gel);
        rig.blob = mk(g.sphere, gel, 0, 0.55, 0, 1.6, 1.15, 1.6);
        mk(g.ico, c1, 0, 0.5, 0, 0.55, 0.55, 0.55);
        for (const s of [-1, 1]) mk(g.sphere, mat(0x101010), s * 0.25, 0.75, 0.68, 0.16, 0.22, 0.1);
        break;
      }
      case 'wasp': {
        rig.hover = 1.1;
        mk(g.ico, c1, 0, 0, 0.15, 0.55, 0.5, 0.6);
        const abd = mk(g.ico, c0, 0, -0.08, -0.55, 0.6, 0.55, 0.95);
        mk(g.cyl, c1, 0, -0.08, -0.45, 0.62, 0.12, 0.62, body, Math.PI / 2);
        mk(g.cyl, c1, 0, -0.1, -0.75, 0.5, 0.1, 0.5, body, Math.PI / 2);
        mk(g.cone, c1, 0, -0.15, -1.1, 0.1, 0.35, 0.1, body, -Math.PI / 2);
        const head = pivot(0, 0.05, 0.55); rig.head = head;
        mk(g.ico, c0, 0, 0, 0.05, 0.42, 0.38, 0.38, head);
        for (const s of [-1, 1]) mk(g.ico0, eye, s * 0.14, 0.05, 0.18, 0.14, 0.18, 0.1, head);
        const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 0.2 });
        mats.push(wm);
        for (const s of [-1, 1]) { const p = pivot(s * 0.15, 0.25, 0.15); mk(g.plane, wm, s * 0.5, 0, 0, 1.0, 0.35, 1, p, -Math.PI / 2); rig.wings.push(p); }
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) mk(g.box, c1, s * 0.3, -0.3, 0.3 - i * 0.18, 0.04, 0.35, 0.04, body, 0, 0, s * 0.6);
        void abd;
        break;
      }
      case 'kobold': case 'skeleton': case 'lizard': case 'golem': case 'imp': {
        const o = {
          kobold: { h: 1.55, tw: 0.55, td: 0.38, limb: 0.17 },
          skeleton: { h: 1.8, tw: 0.42, td: 0.25, limb: 0.1 },
          lizard: { h: 1.9, tw: 0.55, td: 0.4, limb: 0.17 },
          golem: { h: 2.8, tw: 1.5, td: 0.9, limb: 0.5 },
          imp: { h: 1.0, tw: 0.38, td: 0.28, limb: 0.11 },
        }[key];
        const hm = key === 'skeleton' ? bone : c0;
        const { headP } = humanoid(Object.assign({}, o));
        if (key === 'skeleton') { rig.torso.material = bone; for (const a of rig.arms) a.children[0].material = bone; for (const l of rig.legs) l.children[0].material = bone; for (let i = 0; i < 3; i++) mk(g.box, c1, 0, o.h * 0.6 + i * 0.12, 0.13, 0.44, 0.03, 0.04); }
        if (key === 'kobold') {
          mk(g.box, hm, 0, 0.2, 0, 0.42, 0.38, 0.4, headP);
          mk(g.box, c1, 0, 0.13, 0.3, 0.24, 0.18, 0.3, headP);
          for (const s of [-1, 1]) { mk(g.cone, hm, s * 0.17, 0.48, -0.02, 0.12, 0.3, 0.08, headP, 0, 0, -s * 0.35); mk(g.ico0, eye, s * 0.11, 0.26, 0.21, 0.07, 0.07, 0.05, headP); }
          // 방패
          mk(g.cyl, c1, -0.05, -0.35, 0.12, 0.55, 0.08, 0.55, rig.arms[0], Math.PI / 2);
          mk(g.cyl, steel, -0.05, -0.35, 0.17, 0.18, 0.06, 0.18, rig.arms[0], Math.PI / 2);
          rig.shield = rig.arms[0];
          mk(g.cyl, c1, 0, 0, 0.35, 0.05, 0.9, 0.05, rig.hand, Math.PI / 2);
          mk(g.box, steel, 0, 0.12, 0.7, 0.05, 0.35, 0.3, rig.hand, 0.3);
        } else if (key === 'skeleton') {
          mk(g.ico, bone, 0, 0.22, 0, 0.36, 0.4, 0.38, headP);
          for (const s of [-1, 1]) mk(g.ico0, eye, s * 0.08, 0.24, 0.16, 0.08, 0.06, 0.05, headP);
          mk(g.box, bone, 0, 0.05, 0.06, 0.22, 0.08, 0.2, headP);
          mk(g.box, steel, 0, 0, 0.55, 0.06, 0.03, 1.0, rig.hand);
          mk(g.box, c1, 0, 0, 0.02, 0.22, 0.05, 0.06, rig.hand);
        } else if (key === 'lizard') {
          mk(g.box, hm, 0, 0.18, 0.05, 0.34, 0.3, 0.36, headP);
          mk(g.box, hm, 0, 0.12, 0.36, 0.24, 0.16, 0.42, headP);
          for (const s of [-1, 1]) mk(g.ico0, eye, s * 0.15, 0.26, 0.15, 0.07, 0.07, 0.05, headP);
          const tail = pivot(0, o.h * 0.45, -0.2); mk(g.cone, c1, 0, 0, -0.6, 0.28, 1.3, 0.28, tail, -Math.PI / 2 + 0.25); rig.tail = tail;
          mk(g.cyl, c1, 0, 0, 0.5, 0.05, 1.8, 0.05, rig.hand, Math.PI / 2);
          mk(g.cone, steel, 0, 0, 1.5, 0.1, 0.35, 0.06, rig.hand, Math.PI / 2);
          for (let i = 0; i < 4; i++) mk(g.cone, cols[2] === 0xffd04a ? c1 : c1, 0, o.h * 0.75 - i * 0.12, -0.22, 0.08, 0.2, 0.08, body, -0.8);
        } else if (key === 'golem') {
          mk(g.dodeca, c1, 0, 0.25, 0.05, 0.6, 0.5, 0.55, headP);
          for (const s of [-1, 1]) mk(g.ico0, eye, s * 0.14, 0.3, 0.3, 0.1, 0.06, 0.05, headP);
          mk(g.ico0, eye, 0, o.h * 0.6, o.td * 0.5, 0.34, 0.34, 0.2);
          for (const s of [-1, 1]) mk(g.dodeca, c1, s * (o.tw * 0.5 + 0.1), o.h * 0.75, 0, 0.75, 0.6, 0.7);
          mk(g.dodeca, c1, 0, 0, 0.05, 0.7, 0.6, 0.7, rig.hand);
          mk(g.dodeca, c1, 0, -o.h * 0.38 - 0.15, 0.05, 0.65, 0.55, 0.65, rig.arms[0]);
        } else if (key === 'imp') {
          rig.hover = 1.2;
          mk(g.ico, hm, 0, 0.16, 0, 0.36, 0.34, 0.32, headP);
          for (const s of [-1, 1]) { mk(g.cone, c1, s * 0.12, 0.4, -0.02, 0.07, 0.25, 0.07, headP, -0.3, 0, -s * 0.4); mk(g.ico0, eye, s * 0.08, 0.18, 0.15, 0.07, 0.05, 0.04, headP); }
          const wm = mat(cols[1], { side: THREE.DoubleSide });
          for (const s of [-1, 1]) { const p = pivot(s * 0.12, o.h * 0.72, -0.12); mk(g.cone, wm, s * 0.35, 0.1, 0, 0.5, 0.7, 0.05, p, 0, 0, s * 1.6); rig.wings.push(p); }
          const tail = pivot(0, o.h * 0.45, -0.12); mk(g.cone, c1, 0, -0.1, -0.25, 0.06, 0.55, 0.06, tail, -2.0); rig.tail = tail;
          rig.handGlow = mk(g.ico, eye, 0, -0.05, 0.08, 0.2, 0.2, 0.2, rig.hand);
        }
        break;
      }
      case 'treant': {
        mk(g.cyl, c0, 0, 1.45, 0, 1.0, 2.1, 0.9);
        mk(g.ico0, mat(cols[1]), 0, 2.85, 0, 2.0, 1.6, 2.0);
        mk(g.ico0, mat(cols[1]), 0.6, 3.25, -0.2, 1.2, 1.0, 1.2);
        rig.head = pivot(0, 2.0, 0.45);
        for (const s of [-1, 1]) mk(g.ico0, eye, s * 0.2, 0, 0.02, 0.14, 0.1, 0.06, rig.head);
        for (const s of [-1, 1]) {
          const p = pivot(s * 0.6, 2.1, 0);
          mk(g.cyl, c0, s * 0.1, -0.7, 0, 0.18, 1.5, 0.18, p, 0, 0, s * 0.2);
          mk(g.cone, c0, s * 0.25, -1.45, 0.1, 0.18, 0.4, 0.18, p, Math.PI);
          rig.arms.push(p);
        }
        rig.hand = pivot(0, -1.4, 0, rig.arms[1]);
        leg(-0.35, 0.6, 0, 0.32, 0.6, c0, 0); leg(0.35, 0.6, 0, 0.32, 0.6, c0, Math.PI);
        break;
      }
      case 'wraith': {
        rig.hover = 0.5;
        const robe = new THREE.MeshStandardMaterial({ color: cols[0], roughness: 0.9, transparent: true, opacity: 0.88, flatShading: true });
        mats.push(robe);
        mk(g.cone, robe, 0, 0.9, 0, 1.2, 1.8, 1.2, body, Math.PI);
        mk(g.cone, robe, 0, 1.75, 0, 0.7, 0.6, 0.7);
        const head = pivot(0, 1.95, 0.02); rig.head = head;
        mk(g.sphere, mat(cols[1]), 0, 0, 0, 0.55, 0.6, 0.55, head);
        for (const s of [-1, 1]) mk(g.ico0, eye, s * 0.11, 0.0, 0.24, 0.1, 0.06, 0.05, head);
        for (const s of [-1, 1]) {
          const p = pivot(s * 0.42, 1.6, 0.05);
          mk(g.box, robe, 0, -0.35, 0, 0.16, 0.7, 0.16, p);
          for (let k = -1; k <= 1; k++) mk(g.cone, bone, k * 0.04, -0.8, 0.05, 0.04, 0.22, 0.04, p, Math.PI);
          rig.arms.push(p);
        }
        rig.hand = pivot(0, -0.8, 0, rig.arms[1]);
        break;
      }
      case 'crab': {
        mk(g.ico, c0, 0, 0.62, 0, 1.7, 0.6, 1.25);
        for (const s of [-1, 1]) { const st = mk(g.cyl, c1, s * 0.25, 0.95, 0.5, 0.05, 0.3, 0.05); void st; mk(g.ico0, eye, s * 0.25, 1.12, 0.5, 0.1, 0.1, 0.1); }
        for (const s of [-1, 1]) {
          const p = pivot(s * 0.75, 0.65, 0.45);
          mk(g.box, c0, s * 0.15, 0, 0.3, 0.22, 0.22, 0.6, p);
          mk(g.box, c0, s * 0.15, 0.05, 0.75, 0.42, 0.3, 0.45, p);
          mk(g.box, c1, s * 0.15, -0.12, 0.95, 0.3, 0.12, 0.35, p);
          rig.arms.push(p);
        }
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
          const p = pivot(s * 0.75, 0.55, 0.15 - i * 0.35);
          mk(g.box, c1, s * 0.3, -0.25, 0, 0.6, 0.08, 0.08, p, 0, 0, s * -0.7);
          rig.legs.push(p); rig.legPhase.push(i * 2.1 + (s > 0 ? Math.PI : 0));
        }
        rig.crabLegs = true;
        break;
      }
    }
    if (opts.boss) {
      // 보스 장식: 왕관과 빛나는 고리
      const crownY = (ARCH[key].height + 0.15);
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a10, emissiveIntensity: 0.5 });
      mats.push(crownMat);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; mk(g.cone, crownMat, Math.cos(a) * 0.22, crownY, Math.sin(a) * 0.22, 0.09, 0.25, 0.09, root); }
      mk(g.cyl, crownMat, 0, crownY - 0.12, 0, 0.5, 0.08, 0.5, root);
    }
    root.scale.setScalar(scale);
    return rig;
  },

  makeNPC(role, x, y, z, yaw) {
    const g = sharedGeo();
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = yaw;
    const robe = new THREE.MeshStandardMaterial({ color: role.color, roughness: 0.85, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.7, flatShading: true });
    const hair = new THREE.MeshStandardMaterial({ color: [0x3a2a1a, 0x8a6a3a, 0x1a1a1a, 0xc8b8a0][Math.floor(Math.random() * 4)], roughness: 0.9, flatShading: true });
    const add = (geo, m, px, py, pz, sx, sy, sz, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.scale.set(sx, sy, sz); o.rotation.x = rx; o.castShadow = true; grp.add(o); return o; };
    add(g.cone, robe, 0, 0.6, 0, 0.9, 1.2, 0.8);
    const torso = add(g.box, robe, 0, 1.3, 0, 0.5, 0.55, 0.32);
    const head = add(g.sphere, skin, 0, 1.78, 0, 0.36, 0.4, 0.36);
    add(g.sphere, hair, 0, 1.86, -0.03, 0.39, 0.32, 0.4);
    for (const s of [-1, 1]) add(g.box, robe, s * 0.32, 1.25, 0.05, 0.14, 0.5, 0.14, -0.3);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.text(role.name, '#ffe9a8', 44), depthWrite: false, transparent: true }));
    const t = sp.material.map; sp.scale.set(0.4 * t.userData.w / t.userData.h, 0.4, 1); sp.position.set(0, 2.45, 0); grp.add(sp);
    const npc = { group: grp, role: role.role, name: role.name, head, torso, phase: Math.random() * 10 };
    return npc;
  },

  makeChest(x, y, z) {
    const g = sharedGeo();
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = Math.random() * TAU;
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.8, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b44a, metalness: 0.85, roughness: 0.3, emissive: 0x403010, emissiveIntensity: 0.4 });
    const base = new THREE.Mesh(g.box, wood); base.scale.set(1.2, 0.6, 0.8); base.position.y = 0.3; base.castShadow = true; grp.add(base);
    const lidP = new THREE.Group(); lidP.position.set(0, 0.6, -0.4); grp.add(lidP);
    const lid = new THREE.Mesh(g.cyl, wood); lid.scale.set(0.4, 1.2, 0.8); lid.rotation.z = Math.PI / 2; lid.position.set(0, 0, 0.4); lidP.add(lid);
    for (const s of [-0.45, 0.45]) { const b = new THREE.Mesh(g.box, gold); b.scale.set(0.08, 0.62, 0.84); b.position.set(s, 0.31, 0); grp.add(b); }
    const lock = new THREE.Mesh(g.box, gold); lock.scale.set(0.16, 0.2, 0.06); lock.position.set(0, 0.55, 0.42); grp.add(lock);
    const glow = new THREE.PointLight(0xffd070, 0, 5, 2); glow.position.y = 1; grp.add(glow);
    return { group: grp, lid: lidP, x, z, opened: false, glow };
  },

  // ------------------------------------------------------------------ 생성/관리
  spawn(key, level, x, z, opts = {}) {
    const e = new Enemy(key, level, x, z, opts);
    this.list.push(e);
    return e;
  },
  clear() {
    for (const e of this.list) e.remove();
    this.list = [];
    for (const p of this.projectiles) { p.mesh.removeFromParent(); }
    this.projectiles = [];
    for (const h of this.hazards) if (h.decal) FX.removeDecal(h.decal);
    this.hazards = [];
    this.boss = null;
  },
  nearestEnemy(x, z, maxD) {
    let best = null, bd = maxD;
    for (const e of this.list) { if (e.dead) continue; const d = Math.hypot(e.pos.x - x, e.pos.z - z) - e.radius; if (d < bd) { bd = d; best = e; } }
    return best;
  },

  updateSpawns(area, dt) {
    if (!area || !area.spawns) return;
    const px = Player.pos.x, pz = Player.pos.z;
    for (const sp of area.spawns) {
      const had = sp.enemies.length;
      sp.enemies = sp.enemies.filter((e) => !e.dead && !e.removed);
      const d = Math.hypot(sp.x - px, sp.z - pz);
      // 멀어지면 정리(다음에 다시 생성)
      if (d > 150 && sp.enemies.length) { for (const e of sp.enemies) e.remove(); this.list = this.list.filter((e) => !e.removed); sp.enemies = []; sp.spawned = false; continue; }
      if (had && !sp.enemies.length && sp.spawned) {
        if (sp.noRespawn) sp.cleared = true;
        else if (!sp.elite) sp.timer = 28 + Math.random() * 18;
        sp.spawned = false;
      }
      if (sp.cleared) continue;
      if (sp.timer > 0) { sp.timer -= dt; continue; }
      if (sp.enemies.length === 0 && d < 115 && (d > 34 || !sp.seen)) {
        sp.seen = true; sp.spawned = true;
        for (let k = 0; k < sp.pack; k++) {
          const a = Math.random() * TAU, rr = k === 0 ? 0 : 2.5;
          const rare = !sp.elite && Math.random() < 0.015;
          const e = this.spawn(sp.arch, sp.level, sp.x + Math.cos(a) * rr, sp.z + Math.sin(a) * rr, { elite: sp.elite, rare, name: sp.elite ? `★ ${sp.eliteName}` : undefined });
          e.spawnRef = sp;
          sp.enemies.push(e);
        }
      }
    }
  },

  update(dt) {
    for (const e of this.list) e.update(dt);
    if (this.list.some((e) => e.removed)) this.list = this.list.filter((e) => !e.removed);
    // 투사체
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y += dt * 8;
      let done = p.life <= 0;
      const chest = this._v.copy(Player.pos); chest.y += 1.1;
      if (!done && p.pos.distanceTo(chest) < 0.75 + (G.xr ? 0.1 : 0)) {
        Player.hurt(p.dmg, p.src, { proj: true, from: p.pos });
        done = true;
      }
      if (!done && p.pos.y < World.ground(p.pos.x, p.pos.z)) done = true;
      if (!done && World.active) { const t = { x: p.pos.x, z: p.pos.z }; if (World.active.colliders.resolve(t, 0.15)) done = true; }
      if (done) { FX.burst(p.pos, p.color, 14, 4, 0.2, 0.4); p.mesh.removeFromParent(); this.projectiles.splice(i, 1); }
      else if (Math.random() < 0.6) FX.burst(p.pos, p.color, 1, 0.5, 0.18, 0.3, 0);
    }
    // 지연 장판 공격 (뿌리, 충격파)
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t -= dt;
      if (h.type === 'wave') {
        h.r += h.speed * dt;
        h.ring.scale.setScalar(h.r);
        h.ring.material.opacity = 0.85 * (1 - h.r / h.max);
        const d = Math.hypot(Player.pos.x - h.x, Player.pos.z - h.z);
        if (!h.hit && Math.abs(d - h.r) < 0.9 && Player.pos.y - Player.groundY < 0.6) { h.hit = true; Player.hurt(h.dmg, h.src, { from: new THREE.Vector3(h.x, 0, h.z) }); }
        if (h.r >= h.max) { h.ring.removeFromParent(); h.ring.geometry.dispose(); h.ring.material.dispose(); this.hazards.splice(i, 1); }
        continue;
      }
      if (h.t <= 0) {
        const d = Math.hypot(Player.pos.x - h.x, Player.pos.z - h.z);
        if (d < h.r) Player.hurt(h.dmg, h.src, { from: new THREE.Vector3(h.x, 0, h.z) });
        const gy = World.ground(h.x, h.z);
        FX.burst(new THREE.Vector3(h.x, gy + 0.3, h.z), h.color, 30, 7, 0.25, 0.6);
        FX.ring(new THREE.Vector3(h.x, gy, h.z), h.color, h.r, 0.35);
        if (Player.distTo(h.x, h.z) < 14) Player.shake(0.25);
        this.hazards.splice(i, 1);
      }
    }
  },
  fireProjectile(src, from, target, speed, dmg, color = 0xff7a2a, spread = 0) {
    const dir = this._v2.copy(target).sub(from).normalize();
    if (spread) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    const m = new THREE.Mesh(sharedGeo().ico, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    m.scale.setScalar(0.45);
    m.position.copy(from);
    R.scene.add(m);
    this.projectiles.push({ mesh: m, pos: from.clone(), vel: dir.clone().multiplyScalar(speed), life: 4, dmg, src, color });
  },
};

// ---------------------------------------------------------------------------
// 몬스터 이름표 (이름, 레벨, 체력바)
// ---------------------------------------------------------------------------
class Nameplate {
  constructor(e) {
    this.e = e;
    this.canvas = document.createElement('canvas'); this.canvas.width = 320; this.canvas.height = 84;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthWrite: false, transparent: true }));
    this.sprite.scale.set(1.9, 0.5, 1);
    this.sprite.renderOrder = 10;
    R.scene.add(this.sprite);
    this.draw();
  }
  color() {
    const d = this.e.level - Player.level();
    return d <= -5 ? '#9aa4ae' : d < 0 ? '#eef4fa' : d <= 2 ? '#ffe066' : d <= 5 ? '#ff9a3c' : '#ff4a4a';
  }
  draw() {
    const e = this.e, g = this.canvas.getContext('2d'), W = 320;
    g.clearRect(0, 0, W, 84);
    g.font = '700 26px "IBM Plex Sans KR", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
    const label = `${e.name}  Lv.${e.level}`;
    g.strokeText(label, W / 2, 22); g.fillStyle = e.rare ? '#ffd24a' : this.color(); g.fillText(label, W / 2, 22);
    const bars = e.hpBars, bw = 260, bx = (W - bw) / 2, by = 48, bh = 14;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    const per = e.maxHp / bars;
    const cur = Math.ceil(e.hp / per) || 0;
    const frac = (e.hp - (cur - 1) * per) / per;
    if (cur > 1) { g.fillStyle = '#6a2020'; g.fillRect(bx, by, bw, bh); }
    const k = e.hp / e.maxHp;
    g.fillStyle = bars > 1 ? '#e05a4a' : k > 0.5 ? '#5fd27a' : k > 0.2 ? '#e4c64a' : '#e0554a';
    g.fillRect(bx, by, bw * clamp(frac, 0, 1), bh);
    if (bars > 1) { g.fillStyle = '#ffffff'; g.font = '700 16px system-ui'; g.fillText(`×${cur}`, bx + bw - 14, by + bh / 2 + 1); }
    this.tex.needsUpdate = true;
  }
  update() {
    const e = this.e;
    this.sprite.position.set(e.pos.x, e.pos.y + e.height + 0.55 + (e._hv || 0), e.pos.z);
    const d = Player.distTo(e.pos.x, e.pos.z);
    this.sprite.visible = !e.dead && (e.boss ? G.xr : d < (e.elite ? 40 : 24));
    const base = e.boss ? 3.2 : e.elite ? 2.4 : 1.9;
    const s = G.xr ? base : clamp(d * 0.13, 0.7, base);
    this.sprite.scale.set(s, s * 0.26, 1);
  }
  remove() { this.sprite.removeFromParent(); this.sprite.material.dispose(); this.tex.dispose(); }
}

// ---------------------------------------------------------------------------
// 몬스터
// ---------------------------------------------------------------------------
class Enemy {
  constructor(key, level, x, z, o = {}) {
    const A = ARCH[key], T = G.floor ? G.floor.T : THEMES[0];
    this.key = key; this.A = A; this.level = level;
    this.boss = !!o.boss; this.elite = !!o.elite; this.rare = !!o.rare; this.mini = !!o.mini; this.minion = !!o.minion;
    this.name = o.name || (this.boss ? o.bossName : `${T.prefix} ${A.name}`) + (this.mini ? ' (소)' : '') + (this.rare ? ' ✦' : '');
    this.scale = this.boss ? 2.5 : this.elite ? 1.55 : this.mini ? 0.55 : 1;
    const tint = new THREE.Color(T.ground.mid);
    const cols = A.colors.map((c, i) => (i < 2 ? new THREE.Color(c).lerp(tint, 0.18).getHex() : c));
    if (this.rare) { cols[0] = 0xffd24a; cols[1] = 0xb88a20; }
    if (this.elite) { cols[2] = 0xff3a3a; }
    this.rig = Ents.buildModel(key, cols, this.scale, { boss: this.boss, rare: this.rare });
    this.mult = this.boss ? BAL.bossHP : this.elite ? BAL.eliteHP : this.rare ? 2.5 : this.mini ? 0.35 : this.minion ? 0.6 : 1;
    this.maxHp = Math.round(BAL.enemyHP(level) * A.hp * this.mult);
    this.hp = this.maxHp;
    this.atk = BAL.enemyAtk(level) * A.atk * (this.boss ? BAL.bossAtk : this.elite ? BAL.eliteAtk : this.mini ? 0.6 : 1);
    this.def = BAL.enemyDef(level) * A.def * (this.boss ? BAL.bossDef : 1);
    this.speed = A.speed * (this.boss ? 1.1 : 1) * (this.mini ? 1.2 : 1);
    this.radius = A.radius * this.scale; this.height = A.height * this.scale;
    this.hpBars = this.boss ? 3 + Math.floor((G.floor ? G.floor.f : 1) / 25) : this.elite ? 2 : 1;
    this.phase = 0;
    this.pos = new THREE.Vector3(x, World.ground(x, z), z);
    this.home = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * TAU;
    this.state = 'idle'; this.t = 0; this.cool = {};
    this.attacks = [...A.attacks];
    if (this.boss) this.attacks.push('bslam', 'bcharge');
    this.flying = !!A.flags.flying; this.floating = !!A.flags.floating;
    this.walkPhase = Math.random() * 10; this.moveAmt = 0;
    this.flash = 0; this.aggro = false; this.wander = null; this.wanderT = 0;
    this.arena = o.arena || null;
    this.lastHitBy = {};
    this.rig.root.position.copy(this.pos);
    R.scene.add(this.rig.root);
    this.plate = new Nameplate(this);
    this.cur = null; // 진행 중인 공격
  }
  // 떠 있는 높이(월드 단위). 보스·네임드는 몸이 커도 너무 높이 뜨지 않게 한다.
  hoverWorld() { const h = this.rig.hover || 0; if (!h) return 0; return h * (this.boss ? 0.55 : this.elite ? 0.8 : 1) * (this.dashing ? 0.25 : 1) * (this.state === 'windup' || this.state === 'act' ? 0.7 : 1); }
  get center() { return this._c || (this._c = new THREE.Vector3()), this._c.set(this.pos.x, this.pos.y + this.height * 0.5 + this.hoverWorld(), this.pos.z); }
  forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  faceTo(x, z, dt, rate = 6) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += clamp(angDiff(this.yaw, want), -rate * dt, rate * dt);
  }
  playerAngle() {
    const [fx, fz] = this.forward();
    const dx = Player.pos.x - this.pos.x, dz = Player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    return Math.acos(clamp((fx * dx + fz * dz) / d, -1, 1));
  }

  setState(s, t = 0) { this.state = s; this.t = 0; this.stateDur = t; }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    for (const k in this.cool) this.cool[k] -= dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    const P = Player;
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    const reach = dist - this.radius;
    const alive = P.alive && G.state === 'play';
    const safe = P.inSafeZone;
    let move = 0, mx = 0, mz = 0;

    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (!this.wander || this.wanderT <= 0) {
          const a = Math.random() * TAU, r = Math.random() * 7;
          this.wander = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
          this.wanderT = 3 + Math.random() * 4;
        }
        const wx = this.wander.x - this.pos.x, wz = this.wander.z - this.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 0.8) { mx = wx / wd; mz = wz / wd; move = 0.35; this.faceTo(this.wander.x, this.wander.z, dt, 3); }
        const aggroR = this.boss ? 0 : this.elite ? 16 : (this.flying ? 13 : 11);
        if (alive && !safe && (dist < aggroR || this.aggro)) { this.aggro = true; this.setState('chase'); if (this.elite) Sfx.roar(); }
        if (this.boss && this.aggro && alive) this.setState('chase');
        break;
      }
      case 'chase': {
        if (!alive || (safe && !this.boss)) { this.aggro = false; this.setState('return'); break; }
        const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
        if (!this.boss && (fromHome > (this.elite ? 60 : 45) || dist > 55)) { this.aggro = false; this.setState('return'); break; }
        if (this.boss && this.arena && Math.hypot(P.pos.x - this.arena.x, P.pos.z - this.arena.z) > this.arena.r + 3) { this.aggro = false; this.setState('return'); break; }
        this.faceTo(P.pos.x, P.pos.z, dt, this.boss ? 3.5 : 6);
        // 공격 선택
        const choice = this.pickAttack(reach);
        if (choice) { this.beginAttack(choice); break; }
        const keep = this.A.flags.keepAway;
        let want = keep ? 9 : Math.min(...this.attacks.map((k) => ATTACKS[k].range)) * 0.8;
        if (reach > want) { mx = dx / dist; mz = dz / dist; move = 1; }
        else if (keep && reach < 6) { mx = -dx / dist; mz = -dz / dist; move = 0.8; }
        if (this.A.flags.sidestep || keep || this.boss) {
          this.strafeT = (this.strafeT || 0) - dt;
          if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 1 + Math.random() * 2; }
          if (reach < want + 2) { mx += (-dz / dist) * this.strafeDir * 0.7; mz += (dx / dist) * this.strafeDir * 0.7; move = Math.max(move, 0.6); }
        }
        break;
      }
      case 'windup': this.updateWindup(dt, dist); break;
      case 'act': { const r = this.updateAct(dt, dist); if (r) { mx = r[0]; mz = r[1]; move = r[2]; } break; }
      case 'recover': if (this.t >= this.stateDur) this.setState('chase'); break;
      case 'stagger': if (this.t >= this.stateDur) this.setState('chase'); break;
      case 'return': {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
        if (this.hp < this.maxHp && Math.random() < dt * 4) this.plate.draw();
        if (hd < 1.5) { this.setState('idle'); this.hp = this.maxHp; this.plate.draw(); if (this.boss) UI.boss(this); }
        else { mx = hx / hd; mz = hz / hd; move = 1.3; this.faceTo(this.home.x, this.home.z, dt, 6); }
        if (alive && !safe && dist < 6 && this.t > 1.5) this.setState('chase');
        break;
      }
    }

    // 이동
    const sp = this.speed * move * (this.state === 'act' ? 1 : this.boss && this.phase >= 2 ? 1.15 : 1);
    if (this.state !== 'act' || !this.dashing) { this.vel.x = lerp(this.vel.x, mx * sp, Math.min(1, dt * 8)); this.vel.z = lerp(this.vel.z, mz * sp, Math.min(1, dt * 8)); }
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (World.passable(nx, nz) && (!World.liquidAt(nx, nz) || this.flying || this.floating)) { this.pos.x = nx; this.pos.z = nz; }
    else { this.vel.multiplyScalar(0.2); if (this.dashing) this.dashBlocked = true; }
    if (World.active) {
      const t = { x: this.pos.x, z: this.pos.z };
      if (World.active.colliders.resolve(t, this.radius * 0.8) && this.dashing) this.dashBlocked = true;
      this.pos.x = t.x; this.pos.z = t.z;
    }
    if (this.arena) {
      const ax = this.pos.x - this.arena.x, az = this.pos.z - this.arena.z, ad = Math.hypot(ax, az), lim = this.arena.r - this.radius - 0.5;
      if (ad > lim) { this.pos.x = this.arena.x + ax / ad * lim; this.pos.z = this.arena.z + az / ad * lim; }
    }
    // 서로 겹치지 않게
    for (const o of Ents.list) {
      if (o === this || o.dead) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz), rr = (this.radius + o.radius) * 0.8;
      if (od < rr && od > 1e-4) { const p = (rr - od) * 0.5; this.pos.x += ox / od * p; this.pos.z += oz / od * p; }
    }
    // 플레이어와 겹치지 않게
    if (dist < this.radius + 0.45 && dist > 1e-4) { const p = this.radius + 0.45 - dist; this.pos.x -= dx / dist * p; this.pos.z -= dz / dist * p; }
    this.pos.y = World.ground(this.pos.x, this.pos.z);
    if (World.active && World.active.water && (this.flying || this.floating)) this.pos.y = Math.max(this.pos.y, World.active.water.level);
    this.moveAmt = lerp(this.moveAmt, Math.min(1, Math.hypot(this.vel.x, this.vel.z) / Math.max(1, this.speed)), Math.min(1, dt * 10));
    this.animate(dt);
    this.plate.update();
  }

  pickAttack(reach) {
    let best = null;
    const order = this.boss ? [...this.attacks].sort(() => Math.random() - 0.5) : this.attacks;
    for (const k of order) {
      const a = ATTACKS[k];
      if ((this.cool[k] || 0) > 0) continue;
      if (reach > a.range || reach < (a.minRange || 0) - this.radius * 0.3) continue;
      if (k === 'bsummon' && Ents.list.filter((e) => e.minion && !e.dead).length >= 3) continue;
      if ((a.dash || a.proj) && World.active && World.active.colliders.blocked(this.pos.x, this.pos.z, Player.pos.x, Player.pos.z)) continue;
      best = k;
      if (this.boss && k.startsWith('b')) break;
      if (!this.boss) break;
    }
    return best;
  }

  beginAttack(k) {
    const a = ATTACKS[k];
    this.cur = { k, a, hit: false, n: 0 };
    this.cool[k] = a.cd * (this.boss && this.phase >= 2 ? 0.75 : 1) + Math.random() * 0.4;
    let windup = a.windup * (this.boss && this.phase >= 1 ? 0.85 : 1);
    if (this.mini) windup *= 0.8;
    this.setState('windup', windup);
    const pan = this.panToPlayer();
    if (a.dmg > 0) Sfx.enemyWindup(pan);
    if (k === 'bsummon') Sfx.roar();
    const gy = this.pos.y;
    if (a.tele === 'circle') {
      const r = (k === 'bwave' ? 3 : a.radius) * (k === 'slam' ? this.scale : 1);
      this.cur.decal = FX.decal('circle', { x: this.pos.x, y: gy, z: this.pos.z, radius: r, dur: windup });
      this.cur.radius = r;
    } else if (a.tele === 'atTarget') {
      this.cur.tx = Player.pos.x; this.cur.tz = Player.pos.z;
      const h = { type: 'root', t: windup + a.delay, x: Player.pos.x, z: Player.pos.z, r: a.radius, dmg: this.atk * a.dmg, src: this, color: ARCH[this.key].colors[2] };
      h.decal = FX.decal('circle', { x: h.x, y: World.ground(h.x, h.z), z: h.z, radius: h.r, dur: h.t, color: 0xff6a2a });
      Ents.hazards.push(h);
    }
  }

  updateWindup(dt, dist) {
    const c = this.cur, a = c.a;
    const lockAt = a.dash ? 0.75 : 0.95;
    if (this.t < this.stateDur * lockAt) this.faceTo(Player.pos.x, Player.pos.z, dt, this.boss ? 4 : 8);
    if (a.tele === 'line' && !c.decal && this.t >= this.stateDur * lockAt) {
      c.decal = FX.decal('line', { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, len: a.dash * a.dashTime + this.radius, width: this.radius * 2 + 0.6, dur: this.stateDur * (1 - lockAt) + 0.05 });
    }
    if (c.decal && a.tele === 'circle') { c.decal.m.position.set(this.pos.x, this.pos.y + 0.08, this.pos.z); }
    if (this.t >= this.stateDur) this.execute(dist);
  }

  execute(dist) {
    const c = this.cur, a = c.a, k = c.k;
    const reach = dist - this.radius;
    switch (k) {
      case 'melee': case 'heavy': case 'combo': {
        this.setState('act', a.hits ? a.gap * a.hits : 0.15);
        this.strike();
        c.n = 1;
        break;
      }
      case 'lunge': case 'charge': case 'dive': case 'bcharge': {
        this.dashing = true; this.dashBlocked = false;
        const [fx, fz] = this.forward();
        this.vel.set(fx * a.dash, 0, fz * a.dash);
        this.setState('act', a.dashTime);
        Sfx.swing(1.2);
        break;
      }
      case 'slam': case 'bslam': {
        const r = c.radius;
        if (reach < r - this.radius + 0.4 || dist < r) Player.hurt(this.atk * a.dmg, this, { from: this.pos });
        FX.ring(this.pos, ARCH[this.key].colors[2], r, 0.4);
        FX.burst(this.pos.clone().setY(this.pos.y + 0.3), 0xd8c8a0, 40, 8, 0.3, 0.7);
        if (Player.distTo(this.pos.x, this.pos.z) < r + 10) Player.shake(this.boss ? 0.6 : 0.3);
        Sfx.hit(false, this.panToPlayer());
        this.setState('recover', a.recover);
        break;
      }
      case 'bwave': {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
        R.scene.add(ring);
        Ents.hazards.push({ type: 'wave', x: this.pos.x, z: this.pos.z, r: 1, max: 26, speed: 11, dmg: this.atk * a.dmg, src: this, ring });
        Player.shake(0.4); Sfx.roar();
        UI.toast('충격파! 점프(Space)나 회피로 넘으세요.', '#ff8a6a');
        this.setState('recover', a.recover);
        break;
      }
      case 'ranged': case 'bfan': {
        const from = this.center.clone(); from.y += this.height * 0.15;
        const tgt = Player.pos.clone(); tgt.y += 1.1;
        tgt.addScaledVector(Player.vel, 0.25);
        const n = a.count || 1;
        for (let i = 0; i < n; i++) Ents.fireProjectile(this, from, tgt, a.proj, this.atk * a.dmg, ARCH[this.key].colors[2], n > 1 ? (i - (n - 1) / 2) * 0.16 : 0);
        Sfx.swing(0.8);
        this.setState('recover', a.recover);
        break;
      }
      case 'root': this.setState('recover', a.recover); break;
      case 'blink': {
        const f = Player.forwardXZ();
        const tx = Player.pos.x - f[0] * 2.4, tz = Player.pos.z - f[1] * 2.4;
        FX.burst(this.center, 0x8ae8ff, 24, 4, 0.25, 0.5, 0);
        const t = { x: tx, z: tz };
        if (World.passable(tx, tz)) { if (World.active) World.active.colliders.resolve(t, this.radius); this.pos.x = t.x; this.pos.z = t.z; }
        this.yaw = Math.atan2(Player.pos.x - this.pos.x, Player.pos.z - this.pos.z);
        FX.burst(this.center, 0x8ae8ff, 24, 4, 0.25, 0.5, 0);
        this.cool.melee = 0;
        this.beginAttack('melee');
        this.stateDur = 0.5;
        break;
      }
      case 'bsummon': {
        const T = G.floor.T;
        for (let i = 0; i < 2 + (this.phase >= 3 ? 1 : 0); i++) {
          const ang = Math.random() * TAU;
          const e = Ents.spawn(T.enemies[i % T.enemies.length], Math.max(1, this.level - 3), this.pos.x + Math.cos(ang) * 5, this.pos.z + Math.sin(ang) * 5, { minion: true, arena: this.arena });
          e.aggro = true; e.setState('chase'); e.home.set(this.arena.x, 0, this.arena.z);
          FX.burst(e.center, 0xc87aff, 30, 5, 0.25, 0.7, 0);
        }
        this.setState('recover', a.recover);
        break;
      }
      default: this.setState('recover', a.recover || 0.5);
    }
  }

  strike() {
    const a = this.cur.a;
    const dist = Player.distTo(this.pos.x, this.pos.z);
    const ang = this.playerAngle() / DEG;
    Sfx.swing(this.boss ? 1.5 : 1);
    if (dist - this.radius <= a.range + 0.5 && ang <= (a.arc || 110) / 2 + 10) Player.hurt(this.atk * a.dmg, this, { from: this.pos });
  }

  updateAct(dt, dist) {
    const c = this.cur, a = c.a;
    if (c.k === 'combo') {
      if (this.t >= a.gap * c.n && c.n < a.hits) { c.n++; this.faceTo(Player.pos.x, Player.pos.z, 1, 1); this.strike(); }
      if (this.t >= this.stateDur) this.setState('recover', a.recover);
      return null;
    }
    if (this.dashing) {
      if (!c.hit && dist < this.radius + 0.75 && Math.abs((Player.pos.y + 1) - this.center.y) < this.height + 1.2) {
        c.hit = true;
        Player.hurt(this.atk * a.dmg, this, { from: this.pos, knock: c.k === 'charge' || c.k === 'bcharge' ? 9 : 4 });
      }
      if (Math.random() < 0.5) FX.burst(this.pos.clone().setY(this.pos.y + 0.2), 0xc8b89a, 2, 2, 0.25, 0.4);
      if (this.t >= this.stateDur || this.dashBlocked) {
        this.dashing = false; this.vel.multiplyScalar(0.1);
        const stun = this.dashBlocked && (c.k === 'charge' || c.k === 'bcharge');
        if (stun) { Player.shake(0.3); FX.burst(this.center, 0xffffff, 20, 5, 0.2, 0.5); UI.floatText('기절', this.center, '#9ad8ff'); }
        this.setState('recover', a.recover * (stun ? 1.8 : 1));
      }
      return null;
    }
    if (this.t >= this.stateDur) this.setState('recover', a.recover);
    return null;
  }

  panToPlayer() {
    const f = Player.forwardXZ();
    const dx = this.pos.x - Player.pos.x, dz = this.pos.z - Player.pos.z, d = Math.hypot(dx, dz) || 1;
    return clamp((dx * -f[1] + dz * f[0]) / d * -1, -1, 1) * 0.8;
  }

  // 플레이어에게 맞음
  damage(amount, info = {}) {
    if (this.dead) return 0;
    let blocked = false;
    if ((this.A.flags.shield || this.A.flags.armorFront) && !info.skill && this.state !== 'recover' && this.state !== 'stagger' && this.playerAngle() < 1.0) {
      amount *= 0.35; blocked = true;
    }
    amount = Math.max(1, Math.round(amount));
    this.hp -= amount;
    this.flash = 1;
    if (!this.aggro) { this.aggro = true; if (this.state === 'idle' || this.state === 'return') this.setState('chase'); }
    // 경직
    const canStagger = !this.boss || (info.stagger && this.state === 'windup' && Math.random() < 0.35);
    if (canStagger && (info.stagger || (info.skill && this.state === 'windup') || (info.crit && !this.elite && Math.random() < 0.5))) {
      this.interrupt(info.stagger ? 0.9 : 0.5);
    }
    if (!this.boss && !this.dashing) {
      const kb = info.knock ?? (info.skill ? 2.5 : 1.2);
      const dx = this.pos.x - Player.pos.x, dz = this.pos.z - Player.pos.z, d = Math.hypot(dx, dz) || 1;
      this.vel.x += dx / d * kb * (this.elite ? 0.4 : 1); this.vel.z += dz / d * kb * (this.elite ? 0.4 : 1);
    }
    // 보스 단계 변화
    if (this.boss) {
      const per = this.maxHp / this.hpBars;
      const ph = this.hpBars - Math.ceil(Math.max(this.hp, 0) / per);
      if (ph > this.phase && this.hp > 0) {
        this.phase = ph;
        Sfx.roar(); Player.shake(0.5);
        FX.ring(this.pos, 0xff3a3a, 12, 0.8);
        if (ph === 1) { this.attacks.push(this.key === 'imp' || this.key === 'wasp' ? 'bfan' : 'bwave'); UI.toast(`${this.name}이(가) 격노했다!`, '#ff8a6a'); }
        if (ph === 2) { this.attacks.push('bsummon'); if (!this.attacks.includes('bfan')) this.attacks.push('bfan'); UI.toast('보스가 부하를 부른다!', '#ff8a6a'); }
        if (ph >= 3 && !this.attacks.includes('bwave')) this.attacks.push('bwave');
      }
      UI.boss(this);
    }
    this.plate.draw();
    if (this.hp <= 0) this.die(info);
    return { amount, blocked };
  }
  interrupt(t) {
    if (this.cur && this.cur.decal) { FX.removeDecal(this.cur.decal); this.cur.decal = null; }
    this.dashing = false;
    this.setState('stagger', t);
  }
  die(info) {
    this.dead = true;
    if (this.cur && this.cur.decal) FX.removeDecal(this.cur.decal);
    const col = this.rare ? 0xffe070 : this.boss ? 0xffffff : new THREE.Color(this.A.colors[0]).lerp(new THREE.Color(0x9ae8ff), 0.5).getHex();
    FX.shatter(this.center, this.radius, this.height, col, this.boss ? 400 : this.elite ? 150 : 55);
    FX.burst(this.center, 0xbfeaff, this.boss ? 120 : 30, this.boss ? 10 : 5, 0.22, 0.8, 1);
    Sfx.shatter(this.panToPlayer());
    if (this.A.flags.splits && !this.mini && !this.boss) {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * TAU;
        const m = Ents.spawn(this.key, Math.max(1, this.level - 1), this.pos.x + Math.cos(a) * 1.2, this.pos.z + Math.sin(a) * 1.2, { mini: true });
        m.aggro = true; m.setState('chase'); m.home.copy(this.home);
        if (this.spawnRef) { m.spawnRef = this.spawnRef; this.spawnRef.enemies.push(m); }
      }
    }
    Game.onKill(this, info);
    this.remove();
  }
  remove() {
    this.removed = true; this.dead = true;
    this.rig.root.removeFromParent();
    for (const m of this.rig.mats) m.dispose();
    this.rig.eyeMat.dispose();
    this.plate.remove();
  }

  animate(dt) {
    const rig = this.rig, t = G.time;
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.yaw;
    this._hv = lerp(this._hv ?? this.hoverWorld(), this.hoverWorld(), Math.min(1, dt * 6));
    const hover = this._hv / this.scale;
    rig.body.position.y = hover + (hover ? Math.sin(t * 3 + this.walkPhase) * 0.12 : 0);
    this.walkPhase += dt * (2 + this.moveAmt * this.speed * 1.6);
    const wp = this.walkPhase, amt = this.moveAmt;
    for (let i = 0; i < rig.legs.length; i++) {
      const s = Math.sin(wp + rig.legPhase[i]) * 0.7 * amt;
      if (rig.crabLegs) rig.legs[i].rotation.y = s * 0.6; else rig.legs[i].rotation.x = s;
    }
    if (!rig.hover && rig.legs.length) rig.body.position.y += Math.abs(Math.sin(wp)) * 0.05 * amt;
    for (const w of rig.wings) w.rotation.z = Math.sin(t * 38) * 0.7 * Math.sign(w.position.x);
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * 4 + wp) * 0.35;
    if (rig.blob) { const s = 1 + Math.sin(wp * 1.4) * 0.09 * (0.4 + amt); rig.blob.scale.set(1.6 / Math.sqrt(s), 1.15 * s, 1.6 / Math.sqrt(s)); }
    // 공격 자세
    let lean = 0, armR = Math.sin(wp) * 0.5 * amt, armL = -Math.sin(wp) * 0.5 * amt;
    if (this.state === 'windup') {
      const w = clamp(this.t / Math.max(0.01, this.stateDur), 0, 1);
      lean = -0.22 * w; armR = -2.3 * easeOut(w); armL = -0.6 * w;
      const glow = 0.5 + 0.5 * Math.sin(t * 30);
      for (const m of rig.mats) if (m.emissive) { m.emissive.setRGB(0.6 * glow * w, 0.05, 0.02); }
    } else if (this.state === 'act') {
      lean = 0.28; armR = 0.9; armL = 0.3;
    } else if (this.state === 'stagger') {
      lean = -0.3 + Math.sin(t * 40) * 0.08;
    }
    if (this.state !== 'windup') {
      for (const m of rig.mats) if (m.emissive) m.emissive.setScalar(this.flash * 0.9);
    }
    rig.body.rotation.x = lerp(rig.body.rotation.x, lean, Math.min(1, dt * 14));
    if (rig.arms[1]) rig.arms[1].rotation.x = lerp(rig.arms[1].rotation.x, armR, Math.min(1, dt * 16));
    if (rig.arms[0]) rig.arms[0].rotation.x = lerp(rig.arms[0].rotation.x, rig.shield && this.state !== 'recover' ? -1.2 : armL, Math.min(1, dt * 12));
    if (rig.crabLegs) { for (const a of rig.arms) a.rotation.y = Math.sin(t * 3) * 0.15 + (this.state === 'windup' ? -0.5 : 0); }
    if (rig.head) rig.head.rotation.x = Math.sin(t * 1.3 + wp) * 0.05;
    if (rig.handGlow) rig.handGlow.scale.setScalar(this.state === 'windup' ? 0.3 + 0.15 * Math.sin(t * 20) : 0.18);
  }
}
