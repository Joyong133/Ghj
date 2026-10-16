// ---------------------------------------------------------------------------
// 네트워크: OSM Overpass 질의(우선순위 큐, 미러, 캐시), 지형 고도 타일, 위성 사진 타일
// ---------------------------------------------------------------------------
const Net = {
  mirrors: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],
  mirror: 0, queue: [], active: 0, maxActive: 2,
  stats: { wait: 0, done: 0, fail: 0, img: 0 },
  imgQueue: [], imgActive: 0, imgMax: 8,
  heightMem: new Map(),
  lastError: '',

  // Overpass 질의. prio()가 작을수록 먼저 처리한다. 결과는 IndexedDB에 저장해 다음에는 바로 쓴다.
  async overpass(key, query, prio = () => 0, opts = {}) {
    const cached = await Cache.get('ov:' + key);
    if (cached) return cached;
    return new Promise((resolve, reject) => {
      const job = { key, query, prio, resolve, reject, cancelled: false, tries: 0, timeout: opts.timeout || 90 };
      this.queue.push(job);
      this.pump();
      if (opts.signal) opts.signal.cancel = () => { job.cancelled = true; };
    });
  },
  pump() {
    this.stats.wait = this.queue.length;
    while (this.active < this.maxActive && this.queue.length) {
      this.queue = this.queue.filter((j) => { if (j.cancelled) { j.reject(new Error('cancelled')); return false; } return true; });
      if (!this.queue.length) break;
      this.queue.sort((a, b) => a.prio() - b.prio());
      const job = this.queue.shift();
      this.active++;
      this.run(job).finally(() => { this.active--; this.pump(); });
    }
    this.stats.wait = this.queue.length;
  },
  async run(job) {
    while (job.tries < this.mirrors.length * 2) {
      if (job.cancelled) { job.reject(new Error('cancelled')); return; }
      const url = this.mirrors[this.mirror % this.mirrors.length];
      job.tries++;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), (job.timeout + 15) * 1000);
      try {
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(job.query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
        clearTimeout(timer);
        if (res.status === 429 || res.status === 504 || res.status >= 500) { this.lastError = `지도 서버가 바쁩니다 (${res.status})`; this.mirror++; await sleep(1500 * job.tries); continue; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.remark && /runtime error|timed out/i.test(data.remark) && !(data.elements && data.elements.length)) { this.mirror++; await sleep(1000); continue; }
        Cache.set('ov:' + job.key, data);
        this.stats.done++;
        this.lastError = '';
        job.resolve(data);
        return;
      } catch (e) {
        clearTimeout(timer);
        this.lastError = '지도 서버에 연결하지 못했습니다';
        this.mirror++;
        await sleep(1200 * job.tries);
      }
    }
    this.stats.fail++;
    job.reject(new Error('overpass failed'));
  },

  // 이미지 (동시 요청 수 제한)
  image(url) {
    return new Promise((resolve, reject) => {
      this.imgQueue.push({ url, resolve, reject });
      this.pumpImg();
    });
  },
  pumpImg() {
    while (this.imgActive < this.imgMax && this.imgQueue.length) {
      const j = this.imgQueue.shift();
      this.imgActive++; this.stats.img++;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { this.imgActive--; this.stats.img--; j.resolve(img); this.pumpImg(); };
      img.onerror = () => { this.imgActive--; this.stats.img--; j.reject(new Error('img ' + j.url)); this.pumpImg(); };
      img.src = j.url;
    }
  },

  // 지형 고도 (Terrarium 인코딩: (R*256 + G + B/256) - 32768 미터)
  async heights(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (this.heightMem.has(key)) { const v = this.heightMem.get(key); this.heightMem.delete(key); this.heightMem.set(key, v); return v; }
    let arr;
    try {
      const img = await this.image(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, 256, 256).data;
      arr = new Float32Array(256 * 256);
      for (let i = 0; i < arr.length; i++) arr[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    } catch (e) {
      arr = new Float32Array(256 * 256); // 실패하면 평지
      arr.failed = true;
    }
    this.heightMem.set(key, arr);
    if (this.heightMem.size > 80) this.heightMem.delete(this.heightMem.keys().next().value);
    return arr;
  },

  esri(z, x, y) { return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`; },
  // z 타일 하나를 z+d 위성 사진 2^d × 2^d 장으로 이어 붙인 캔버스
  async imagery(z, x, y, d) {
    const n = 1 << d, S = 256 * n;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#5a6a5a'; g.fillRect(0, 0, S, S);
    let ok = 0;
    const jobs = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      jobs.push(this.image(this.esri(z + d, x * n + i, y * n + j)).then((img) => { g.drawImage(img, i * 256, j * 256); ok++; }).catch(() => {}));
    }
    await Promise.all(jobs);
    c.ok = ok > 0;
    return c;
  },
};
