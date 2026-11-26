// PDF → 구조화 블록 변환기 (브라우저, pdf.js 글자 위치 사용)
// 해결하는 문제: 2단 읽기 순서(P-02), 줄 단위로 끊긴 문단(P-16), 캡션·그림 속 글자 조각이 본문에 섞임(P-17)
// 블록 type: heading | para | caption | label(그림 속 글자, 본문에서 제외) | list
(function () {
  const CAP = /^\s*(그림|표|Fig\.?|Figure|Table)\s*\d+([.\-]\d+)*(?![.\d]*\s*[에의을를은는이가과와로도])/i;
  const SENT_END = /([.!?。”"’)\]]|다\.|요\.|음\.|함\.)\s*$/;
  const LIST = /^\s*([•▪■◦–]|\d+[.)]|[①-⑳])\s+/;

  function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

  async function pageItems(pdf, n) {
    const page = await pdf.getPage(n), vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const W = vp.width, H = vp.height;
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d) || it.height || 10;
      return { s: it.str, x: e, y: H - f, w: it.width, size, W, H };
    });
    return { items, W, H };
  }

  // 단 사이 빈 띠(거터) 찾기: 쪽 가운데 40~60% 구간에서 글자가 가장 적게 지나는 x
  function findGutter(items, W) {
    const N = 100, cov = new Array(N).fill(0);
    items.forEach(it => { const a = Math.max(0, Math.floor(it.x / W * N)), b = Math.min(N - 1, Math.floor((it.x + it.w) / W * N)); for (let k = a; k <= b; k++) cov[k]++; });
    let best = null;
    for (let k = 40; k <= 60; k++) if (best === null || cov[k] < cov[best]) best = k;
    const side = Math.max(...cov.slice(15, 40)), side2 = Math.max(...cov.slice(60, 85));
    return (cov[best] <= Math.min(side, side2) * 0.15) ? (best + 0.5) / N * W : null;
  }

  // 같은 높이의 글자 조각을 한 줄로 (단을 먼저 나누고 단 안에서만 잇는다)
  function toLines(items, W) {
    const g = findGutter(items, W);
    items.forEach(it => it.col = g === null ? 0 : (it.x + it.w <= g + 2 ? 1 : it.x >= g - 2 ? 2 : 0));
    // 위첨자(인용 번호 등): 작은 숫자 조각은 가까운 줄에 붙인다
    const sup = it => /^[\d,\-–\s]+$/.test(it.s) && it.size < 8.5;
    const sorted = [...items].sort((p, q) => p.y - q.y || p.x - q.x);
    const lines = [];
    for (const it of sorted.filter(i => !sup(i))) {
      const ln = lines.find(l => l.col === it.col && Math.abs(l.y - it.y) < Math.max(2, 0.45 * Math.min(l.size, it.size)) && (it.col !== 0 || (it.x <= l.x1 + 3 * it.size && it.x + it.w >= l.x0 - 3 * it.size)));
      if (ln) { ln.items.push(it); ln.x0 = Math.min(ln.x0, it.x); ln.x1 = Math.max(ln.x1, it.x + it.w); ln.size = Math.max(ln.size, it.size); }
      else lines.push({ y: it.y, x0: it.x, x1: it.x + it.w, size: it.size, col: it.col, items: [it] });
    }
    for (const it of sorted.filter(sup)) {
      const ln = lines.filter(l => l.col === it.col && it.y > l.y - l.size * 1.1 && it.y < l.y + 1 && it.x >= l.x0 - it.size && it.x <= l.x1 + it.size * 1.5)
        .sort((p, q) => Math.abs(p.y - it.y) - Math.abs(q.y - it.y))[0];
      if (ln) { it.sup = true; ln.items.push(it); ln.x1 = Math.max(ln.x1, it.x + it.w); }
      else lines.push({ y: it.y, x0: it.x, x1: it.x + it.w, size: it.size, col: it.col, items: [it] });
    }
    for (const l of lines) {
      l.items.sort((p, q) => p.x - q.x);
      let t = '', prevEnd = null;
      for (const it of l.items) { if (!it.sup && prevEnd !== null && it.x - prevEnd > 0.22 * it.size && !t.endsWith(' ')) t += ' '; t += it.sup ? it.s.trim() : it.s; prevEnd = it.x + it.w; }
      l.text = t.replace(/\s+/g, ' ').trim();
    }
    return lines.sort((p, q) => p.y - q.y);
  }

  // 2단 판정과 읽기 순서: 가운데를 가로지르는 줄(제목·넓은 캡션)은 '전체 폭', 나머지는 왼쪽/오른쪽 단
  function order(lines, W) {
    const twoCol = lines.filter(l => l.col === 1).length >= 5 && lines.filter(l => l.col === 2).length >= 5;
    if (!twoCol) { lines.forEach(l => l.col = 0); return { twoCol, lines: [...lines].sort((p, q) => p.y - q.y) }; }
    const full = lines.filter(l => l.col === 0).sort((p, q) => p.y - q.y), out = [];
    let top = -Infinity;
    const bounds = [...full.map(f => f.y), Infinity];
    bounds.forEach((b, i) => {
      const inRegion = l => l.y > top && l.y < b;
      out.push(...lines.filter(l => l.col === 1 && inRegion(l)), ...lines.filter(l => l.col === 2 && inRegion(l)));
      if (i < full.length) out.push(full[i]);
      top = b;
    });
    return { twoCol, lines: out };
  }

  function bboxOf(ls, W, H) {
    const x0 = Math.min(...ls.map(l => l.x0)), x1 = Math.max(...ls.map(l => l.x1));
    const y0 = Math.min(...ls.map(l => l.y - l.size)), y1 = Math.max(...ls.map(l => l.y + 0.25 * l.size));
    return { x: +(x0 / W).toFixed(4), y: +(y0 / H).toFixed(4), w: +((x1 - x0) / W).toFixed(4), h: +((y1 - y0) / H).toFixed(4) };
  }
  // 줄 잇기: 영어 하이픈은 붙이고, 한글이 단 끝까지 찬 줄(양끝 맞춤 중간 끊김)은 띄어쓰기 없이 잇고 확인 표시
  function joinText(a, b, fullLine) {
    if (/[A-Za-z]\s?-$/.test(a) && /^[a-z]/.test(b)) return { t: a.replace(/\s?-$/, '') + b, flag: 'hyphen-joined' };
    if (fullLine && /[가-힣]$/.test(a) && /^[가-힣]/.test(b)) {
      // 조사·어미로 끝난 줄은 낱말이 끝난 것으로 보고 띄운다
      if (/[을를의이가는은에도와과고며서면게로지적들께]$/.test(a)) return { t: a + ' ' + b, flag: null };
      return { t: a + b, flag: '줄끝 붙임(띄어쓰기 확인)' };
    }
    return { t: a + ' ' + b, flag: null };
  }

  async function convert(pdf, opts = {}) {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) { pages.push({ n, ...(await pageItems(pdf, n)) }); opts.onProgress && opts.onProgress(n, pdf.numPages, 'read'); }
    const bodySize = median(pages.flatMap(p => p.items.map(i => i.size))) || 10;
    // 머리글·바닥글: 위아래 6% 안에서 쪽마다 반복되거나 숫자만인 줄
    const edgeKey = l => l.text.replace(/\d+/g, '#');
    const edgeCount = {};
    pages.forEach(p => { p.lines = toLines(p.items, p.W); p.lines.forEach(l => { l.edge = l.y < p.H * 0.09 || l.y > p.H * 0.92; if (l.edge) edgeCount[edgeKey(l)] = (edgeCount[edgeKey(l)] || 0) + 1; }); });
    const blocks = []; let seq = 0, twoColPages = 0;
    for (const p of pages) {
      let lines = p.lines.filter(l => !(l.edge && (/^[\d\s]{1,9}$/.test(l.text) || (edgeCount[edgeKey(l)] || 0) >= 2 && pages.length > 1)));
      const ord = order(lines, p.W); lines = ord.lines; if (ord.twoCol) twoColPages++;
      const colRight = { 0: Math.max(0, ...lines.filter(l => l.col === 0).map(l => l.x1)), 1: Math.max(0, ...lines.filter(l => l.col === 1).map(l => l.x1)), 2: Math.max(0, ...lines.filter(l => l.col === 2).map(l => l.x1)) };
      let cur = null;
      const flush = () => { if (cur) { cur.bbox = bboxOf(cur.ls, p.W, p.H); delete cur.ls; blocks.push(cur); cur = null; } };
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i], prev = lines[i - 1];
        const isCap = CAP.test(l.text), small = l.size < bodySize * 0.86, big = l.size > bodySize * 1.18;
        let type = isCap ? 'caption' : big ? 'heading' : (small && l.text.length < 45 && !(cur && cur.type === 'caption')) ? 'label' : LIST.test(l.text) ? 'list' : 'para';
        // 캡션 이어지는 줄: 캡션과 같은 글자 크기·같은 단이면 캡션에 붙임 (본문 조각으로 섞이지 않게)
        if (!isCap && cur && cur.type === 'caption' && Math.abs(l.size - cur.size) < 0.6 && l.col === cur.col && l.y - cur.lastY < cur.size * 2.2) type = 'caption';
        const colW = ord.twoCol && l.col ? p.W * 0.45 : p.W * 0.85;
        const cont = cur && cur.type === type && type !== 'heading' && type !== 'label' && l.col === cur.col && l.y > cur.lastY &&
          l.y - cur.lastY < Math.max(cur.size, l.size) * 1.9 && Math.abs(l.size - cur.size) < 0.8 &&
          !(type === 'para' && l.x0 - cur.x0 > l.size * 0.8 && !SENT_END.test(cur.text) === false) &&
          !(type === 'list' && LIST.test(l.text)) && !isCap;
        // 앞 줄이 단 폭보다 많이 짧고 문장이 끝났으면 문단 끝
        const prevShortEnd = cur && cur.type !== 'caption' && prev && (prev.x1 - prev.x0) < colW * 0.8 && SENT_END.test(cur.text);
        if (cont && !prevShortEnd) {
          const last = cur.ls[cur.ls.length - 1]; const j = joinText(cur.text, l.text, last.x1 >= colRight[last.col] - 0.8 * last.size); cur.text = j.t; if (j.flag && !cur.flags.includes(j.flag)) cur.flags.push(j.flag);
          cur.ls.push(l); cur.lastY = l.y;
        } else {
          flush();
          cur = { seq: seq++, page: p.n, type, text: l.text, flags: [], ls: [l], size: l.size, col: l.col, x0: l.x0, lastY: l.y };
          if (type === 'label') cur.flags.push('그림 속 글자로 추정');
        }
      }
      flush();
      opts.onProgress && opts.onProgress(p.n, pages.length, 'layout');
    }
    // 쪽을 넘어가는 문단 잇기: 앞 쪽 마지막 본문이 문장 끝이 아니고 다음 쪽 첫 본문이 이어지면 합침
    const body = b => b.type === 'para';
    for (let i = blocks.length - 1; i > 0; i--) {
      const b = blocks[i]; if (!body(b)) continue;
      const prevIdx = (() => { for (let k = i - 1; k >= 0; k--) { if (blocks[k].page < b.page && body(blocks[k])) return k; if (blocks[k].page === b.page && body(blocks[k])) return -1; } return -1; })();
      if (prevIdx < 0) continue;
      const a = blocks[prevIdx];
      if (a.page === b.page - 1 && !SENT_END.test(a.text) && blocks.filter(x => x.page === b.page && body(x))[0] === b) {
        a.text = joinText(a.text, b.text).t; a.flags.push('다음 쪽과 이어짐'); blocks.splice(i, 1);
      }
    }
    blocks.forEach((b, i) => { b.seq = i; delete b.size; delete b.col; delete b.x0; delete b.lastY; });
    const stats = { pages: pages.length, twoColPages, bodySize: +bodySize.toFixed(1),
      count: blocks.reduce((m, b) => (m[b.type] = (m[b.type] || 0) + 1, m), {}) };
    return { blocks, stats };
  }
  window.PdfConvert = { convert };
})();
