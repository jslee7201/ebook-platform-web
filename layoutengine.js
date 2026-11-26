/* 학습서 조판 엔진 (S-03): 브라우저 안에서 Paged.js로 실제 쪽을 나눠 보고 그림 자리를 정합니다.
   시제품 study_layout.py(Edge로 PDF를 만들어 측정)와 같은 규칙:
   - 펼침면 바깥쪽 메모 칸: 왼쪽 쪽은 왼쪽 여백, 오른쪽 쪽은 오른쪽 여백
   - 그림은 첫 인용 문단 뒤가 기본. 인용과 같은 쪽 우선, 안 되면 같은 펼침면(1쪽=오른쪽 홀로)
   - 자리 옮기기(±4블록) × 크기 줄이기(fs1 95mm, fs2 78mm — 78mm 미만 금지), 절·소절 제목은 넘지 않음, 제목 바로 뒤 금지
   - 그림이 쪽 맨 위에서 시작하고 앞쪽 아래가 25mm 넘게 비면 감점 */
(function (root) {
  const PAGED = 'https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.polyfill.js';
  const PX_MM = 96 / 25.4;
  const MEMO_SVG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='30.236'%3E%3Cline x1='0' y1='29.8' x2='144' y2='29.8' stroke='%23aab3c0' stroke-width='0.8' stroke-dasharray='2 2.4'/%3E%3C/svg%3E\")";
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function memoDims(z) { const W = Math.round(z.w * 0.2), E = 8, G = 6; return { W, E, G, O: E + W + G }; }
  function memoCss(z) {
    const [mt, mo, mb, mi] = z.m, { W, E, O } = memoDims(z);
    const box = side => `@${side}-top{content:'MEMO';vertical-align:top;text-align:${side};width:${W}mm;margin-${side}:${E}mm;padding-top:1.2mm;font-family:"Noto Sans KR",sans-serif;font-size:6pt;letter-spacing:.25em;color:#9aa3b2;border-top:.7pt solid #9aa3b2;background-image:${MEMO_SVG};background-size:${W}mm 8mm;background-repeat:repeat-y;background-position:0 1mm}`;
    return `@page :right{margin:${mt}mm ${O}mm ${mb}mm ${mi}mm;${box('right')}}@page :left{margin:${mt}mm ${mi}mm ${mb}mm ${O}mm;${box('left')}}@page :first{@right-top{content:none;border:0;background:none}}` +
      // 참고문헌은 메모 칸 없이 (본문만 메모)
      `.refs-head,ol.refs{page:refs}@page refs:right{margin:${mt}mm ${mo}mm ${mb}mm ${mi}mm;@right-top{content:none;border:0;background:none}}@page refs:left{margin:${mt}mm ${mi}mm ${mb}mm ${mo}mm;@left-top{content:none;border:0;background:none}}`;
  }
  const citeWrap = h => h.replace(/(>[^<]*)/g, seg => seg.replace(/그림\s*(\d+\.\d+)(?![\d])/g, (m, no) => `${m}<span class="qc" data-f="${no}"></span>`));

  // 문서 만들기. st = { order: {chId: [blockIndex…]}, sizeCls: {no: 'fs1'|'fs2'}, cut: {chId, upto} }
  function buildHtml(pkg, o, st = {}) {
    const z = pkg.sizes[o.size || 'b5'];
    const css = pkg.css + pkg.page_css[o.size || 'b5'] + (o.memo === 'outer' ? memoCss(z) : '') + '.qc{display:inline}';
    const chs = pkg.chapters.map(ch => {
      let idx = (st.order && st.order[ch.id]) || ch.blocks.map((_, i) => i);
      if (st.cut && st.cut.chId === ch.id) idx = idx.slice(0, st.cut.upto);
      const body = idx.map(i => {
        const b = ch.blocks[i]; let h = b.html;
        if (b.fig && st.sizeCls && st.sizeCls[b.fig]) h = h.replace(/<figure id="fig-([\d.]+)" class="/, m => m + st.sizeCls[b.fig] + ' ');
        if (b.tag === 'p' || b.tag === 'aside') h = citeWrap(h);
        const nx = ch.blocks[idx[idx.indexOf(i) + 1]]; if (b.tag === 'h2' && nx && /^<ol class="refs"/.test(nx.html)) h = h.replace('<h2 ', '<h2 class="refs-head" ');
        return h.replace(/data-file="([^"]+)" src=""/g, (m, f) => { const im = (o.images || {})[f]; if (!im) return `alt-missing="${esc(f)}"`;
          // 측정할 때는 같은 비율의 빈 SVG로 대신함(배치는 크기 비율만 쓰므로 결과가 같고, 큰 그림을 매번 불러오지 않음)
          const src = o.measure ? `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${im.w}' height='${im.h}'/%3E` : im.url;
          return `src="${esc(src)}" width="${im.w}" height="${im.h}"`; });
      }).join('');
      return `<article class="chapter">${ch.header}<div class="flow">${body}</div></article>`;
    }).join('');
    const cover = `<section class="cover"><h1>${esc(pkg.book_title)}</h1><p>${esc(pkg.chapters.map(c => c.num + '장 ' + c.title).join(', '))} · 웹 조판</p><p>${esc(pkg.imprint || '')}</p></section>`;
    return `<!doctype html><html lang="ko" data-theme="${esc(o.theme || 'medical')}"><head><meta charset="utf-8">${pkg.font_link}<style>${css}</style></head><body><main class="book ${o.memo === 'outer' ? 'memo' : ''}">${cover}${chs}</main></body></html>`;
  }

  // iframe 안에서 쪽 나누기 → 측정
  function render(html, frame, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      const id = 'r' + Math.random().toString(36).slice(2);
      const measure = `(${measureInFrame.toString()})`;
      const boot = `<script>window.PagedConfig={auto:true,after:()=>{try{parent.postMessage({__lay:'${id}',m:${measure}()},'*')}catch(e){parent.postMessage({__lay:'${id}',err:String(e)},'*')}}};<\/script><script src="${PAGED}"><\/script>`;
      const t = setTimeout(() => { removeEventListener('message', on); reject(new Error('쪽 나누기 시간 초과')); }, timeoutMs);
      function on(e) { if (e.data && e.data.__lay === id) { clearTimeout(t); removeEventListener('message', on); e.data.err ? reject(new Error(e.data.err)) : resolve(e.data.m); } }
      addEventListener('message', on);
      frame.srcdoc = html.replace('</head>', boot + '</head>');
    });
  }
  // (iframe 안에서 실행됨)
  function measureInFrame() {
    const PX = 96 / 25.4; const pages = [...document.querySelectorAll('.pagedjs_page')];
    const F = {}, C = {}, gaps = [];
    pages.forEach((pg, i) => {
      const area = pg.querySelector('.pagedjs_page_content'); const ar = area.getBoundingClientRect();
      let maxB = ar.top;
      area.querySelectorAll('.flow > *, .chap-open, .cover').forEach(el => { const r = el.getBoundingClientRect(); if (r.height > 0) maxB = Math.max(maxB, r.bottom); });
      gaps.push((ar.bottom - maxB) / PX);
      area.querySelectorAll('figure[id^="fig-"]').forEach(f => { const no = f.id.slice(4); if (!(no in F)) F[no] = [i, (f.getBoundingClientRect().top - ar.top) / PX]; });
      area.querySelectorAll('.qc').forEach(q => { const no = q.dataset.f; if (!(no in C)) C[no] = i; });
    });
    return { F, C, gaps, pages: pages.length };
  }

  const spread = i => Math.floor((i + 1) / 2);
  function scoreFig(no, m) {
    if (!(no in m.F)) return [999, {}];
    const [fp, fy] = m.F[no]; const info = { fig_page: fp + 1 }; let s;
    if (!(no in m.C)) { s = 0; info.same = '인용 없음'; }
    else { const cp = m.C[no]; info.cite_page = cp + 1;
      if (fp === cp) s = 0; else if (spread(fp) === spread(cp)) s = 1; else s = 10 + Math.abs(fp - cp) + (fp < cp ? .5 : 0);
      info.same = fp === cp ? '같은 쪽' : spread(fp) === spread(cp) ? '같은 펼침면' : '떨어짐'; }
    if (fy < 12 && fp > 0) { const g = m.gaps[fp - 1] || 0; info.gap_before_mm = Math.round(g); if (g > 25) s += (g - 25) / 25; }
    return [s, info];
  }

  // 편집자가 고정한 그림: pin = { after: 패키지 블록 번호(이 블록 뒤에 둠), size: ''|'fs1'|'fs2' }
  function applyPin(order, ch, no, pin) {
    const fi = order.findIndex(i => ch.blocks[i].fig === no); if (fi < 0) return order;
    const fig = order[fi], rest = order.slice(0, fi).concat(order.slice(fi + 1));
    let k = rest.indexOf(pin.after); if (k < 0) return order;
    k++; while (k < rest.length && ch.blocks[rest[k]].fig && ch.blocks[rest[k]].fig < no) k++;   // 같은 자리 앞 그림 뒤로
    return rest.slice(0, k).concat([fig], rest.slice(k));
  }
  // 지금 배치에서 그림이 어느 블록 뒤에 있는지 (고정할 때 저장하는 값)
  function pinOf(st, ch, no) {
    const order = (st.order && st.order[ch.id]) || ch.blocks.map((_, i) => i); const fi = order.findIndex(i => ch.blocks[i].fig === no);
    let j = fi - 1; while (j >= 0 && ch.blocks[order[j]].fig) j--;
    return { after: j >= 0 ? order[j] : -1, size: (st.sizeCls && st.sizeCls[no]) || '' };
  }
  // 그림을 한 블록 앞·뒤로 (다른 그림은 건너뜀). 넘은 제목이 있으면 알려 줌
  function nudge(st, ch, no, dir) {
    const order = [...((st.order && st.order[ch.id]) || ch.blocks.map((_, i) => i))]; const fi = order.findIndex(i => ch.blocks[i].fig === no);
    let t = fi + dir; while (t >= 0 && t < order.length && ch.blocks[order[t]].fig) t += dir;
    if (t < 0 || t >= order.length) return { st, crossed: null };
    const [fig] = order.splice(fi, 1); order.splice(t, 0, fig);
    const crossed = ['h2', 'h3', 'h4'].includes(ch.blocks[order[dir > 0 ? t - 1 : t + 1]]?.tag) ? ch.blocks[order[dir > 0 ? t - 1 : t + 1]].tag : null;
    return { st: { ...st, order: { ...st.order, [ch.id]: order } }, crossed };
  }
  function evaluate(pkg, m) { return pkg.chapters.flatMap(ch => ch.blocks.filter(b => b.fig).map(b => ({ figure: b.fig, ...scoreFig(b.fig, m)[1] }))); }

  async function optimize(pkg, o, frame, onProgress = () => {}, pins = {}) {
    const st = { order: {}, sizeCls: {} }; const report = []; let trials = 0;
    const SPEN = { '': 0, fs1: .2, fs2: .5 };
    for (const ch of pkg.chapters) {
      st.order[ch.id] = ch.blocks.map((_, i) => i);
      const figNos = ch.blocks.filter(b => b.fig).map(b => b.fig);
      for (const no of figNos) {
        const tag = i => ch.blocks[i].tag, isH = (i, set) => set.includes(tag(i));
        const trial = async (order, sc) => {
          const k = order.findIndex(i => ch.blocks[i].fig === no);
          const s2 = { order: { ...st.order, [ch.id]: order }, sizeCls: { ...st.sizeCls }, cut: { chId: ch.id, upto: k + 13 } };
          if (sc) s2.sizeCls[no] = sc; else delete s2.sizeCls[no];
          trials++; onProgress({ figure: no, trials });
          return scoreFig(no, await render(buildHtml(pkg, { ...o, measure: true }, s2), frame));
        };
        if (pins[no]) {   // 편집자가 고정한 그림은 찾지 않고 그 자리·크기 그대로
          const ord = applyPin(st.order[ch.id], ch, no, pins[no]); const sc = pins[no].size || '';
          const [, inf] = await trial(ord, sc);
          st.order[ch.id] = ord; if (sc) st.sizeCls[no] = sc; else delete st.sizeCls[no];
          report.push({ figure: no, shift: 0, pinned: true, size: sc || '원래 크기', ...inf }); continue;
        }
        const cur0 = st.order[ch.id];
        const [bs, bi] = await trial(cur0, st.sizeCls[no] || '');
        let best = { s: bs, d: 0, sc: '', order: cur0, info: bi };
        if (bs >= 1) {
          const k0 = cur0.findIndex(i => ch.blocks[i].fig === no); const fig = cur0[k0];
          const others = cur0.slice(0, k0).concat(cur0.slice(k0 + 1));
          const prevFig = Math.max(-1, ...others.slice(0, k0).map((i, j) => ch.blocks[i].fig ? j : -1));
          const cands = [];
          for (const sc of ['', 'fs1', 'fs2']) for (const d of (sc ? [0] : []).concat([-1, 1, -2, 2, 3, -3, 4, -4])) {
            if (!sc && d === 0) continue; const pos = k0 + d;
            if (pos <= prevFig || pos > others.length) continue;
            if (pos > 0 && isH(others[pos - 1], ['h2', 'h3', 'h4'])) continue;           // 제목 바로 뒤 금지
            const [lo, hi] = [Math.min(pos, k0), Math.max(pos, k0)]; const between = others.slice(lo, hi);
            if (between.some(i => isH(i, ['h2', 'h3']))) continue;                       // 절·소절 제목은 넘지 않음
            const x4 = between.some(i => isH(i, ['h4']));                                 // 세부 제목은 같은 펼침면이 될 때만
            cands.push({ order: others.slice(0, pos).concat([fig], others.slice(pos)), sc, d, x4 });
          }
          cands.sort((a, b) => Math.abs(a.d) * .15 + SPEN[a.sc] - (Math.abs(b.d) * .15 + SPEN[b.sc]));
          for (const c of cands) {
            const pen = Math.abs(c.d) * .15 + SPEN[c.sc], cur = best.s + Math.abs(best.d) * .15 + SPEN[best.sc];
            if (pen >= cur) break;
            const [s, inf] = await trial(c.order, c.sc);
            if (c.x4 && s >= 3) continue;
            if (s + pen < cur) best = { s, d: c.d, sc: c.sc, order: c.order, info: inf };
            if (s < 1) break;
          }
        }
        st.order[ch.id] = best.order; if (best.sc) st.sizeCls[no] = best.sc; else delete st.sizeCls[no];
        report.push({ figure: no, shift: best.d, size: best.sc || '원래 크기', ...best.info });
      }
    }
    // 최종 확인: 전체를 한 번 더 나눠 그림-인용 쪽을 다시 잼
    const m = await render(buildHtml(pkg, { ...o, measure: true }, st), frame); trials++;
    const final = evaluate(pkg, m);
    return { state: st, report, final, pages: m.pages, trials };
  }
  const api = { buildHtml, render, optimize, memoCss, scoreFig, applyPin, pinOf, nudge, evaluate, version: '1.2', PAGED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LayoutEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
