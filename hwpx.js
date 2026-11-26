/* HWPX(한글) 저자 원고 → 구조화 블록 (S-05)
   시제품 hwpx_convert.py와 같은 규칙. 스타일 없이 '모양'(표 상자·굵은 글씨·번호)으로 제목을 표시한 원고에서 구조를 추정하고,
   추정한 블록마다 근거(rule)와 확신도(높음·중간)를 붙여 사람이 확인하게 합니다.
   필요: JSZip (window.JSZip). */
(function (root) {
  const NS = { hp: 'http://www.hancom.co.kr/hwpml/2011/paragraph', hh: 'http://www.hancom.co.kr/hwpml/2011/head', hc: 'http://www.hancom.co.kr/hwpml/2011/core', opf: 'http://www.idpf.org/2007/opf/' };
  const SPECIAL = { '색칠 공부': 'activity', '참고 문헌': 'refs', '참고문헌': 'refs' };
  const all = (e, ns, tag) => [...e.getElementsByTagNameNS(NS[ns], tag)];
  const kids = (e, ns, tag) => [...e.children].filter(c => c.namespaceURI === NS[ns] && c.localName === tag);
  const txt = e => all(e, 'hp', 't').map(t => t.textContent).join('');
  function splitKoEn(s) {
    const m = s.trim().match(/^(.*?[가-힣)\]])\s+([A-Za-z][A-Za-z ,\-’'()]+)$/);
    return m ? [m[1].trim(), m[2].trim()] : [s.trim(), ''];
  }

  async function convert(fileOrBlob, opt = {}) {
    const chId = opt.chapterId || 'ch';
    const z = await JSZip.loadAsync(fileOrBlob);
    const xml = async n => new DOMParser().parseFromString(await z.file(n).async('string'), 'application/xml');
    const H = await xml('Contents/header.xml');
    const cpr = {}; all(H, 'hh', 'charPr').forEach(c => cpr[c.getAttribute('id')] = { size: (+c.getAttribute('height') || 1000) / 100, bold: all(c, 'hh', 'bold').length > 0 });
    // 문단 스타일 '개요 1~4'(한글 기본 제목 스타일)를 쓴 원고는 추정 없이 그대로 제목 단계로 씀
    const outline = {}; all(H, 'hh', 'style').forEach(st => { const m = (st.getAttribute('name') || '').match(/^개요\s*([1-4])$/) || (st.getAttribute('engName') || '').match(/^Outline\s*([1-4])$/); if (m) outline[st.getAttribute('id')] = +m[1]; });
    const manifest = {}; all(await xml('Contents/content.hpf'), 'opf', 'item').forEach(i => manifest[i.getAttribute('id')] = i.getAttribute('href'));
    const sections = Object.keys(z.files).filter(n => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const blocks = [], cnt = {}, images = {}; let numberedSinceH1 = false, pendingFig = null, pendingTcap = null, mode = null;
    const add = b => { cnt[b.type] = (cnt[b.type] || 0) + 1; b.id = `${chId}-${b.type}-${String(cnt[b.type]).padStart(3, '0')}`; b.seq = blocks.length + 1; blocks.push(b); return b; };
    async function saveImg(ref) {
      if (images[ref]) return images[ref];
      const href = manifest[ref] || Object.keys(z.files).find(n => n.startsWith(`BinData/${ref}.`)); if (!href || !z.file(href)) return null;
      const blob = await z.file(href).async('blob'); let w = 0, h = 0;
      try { const bmp = await createImageBitmap(blob); w = bmp.width; h = bmp.height; bmp.close(); } catch { }
      images[ref] = { file: `${chId}_${ref}.${(href.split('.').pop() || 'png').toLowerCase()}`, w, h, blob, href }; return images[ref];
    }
    async function picsIn(e) { const out = []; for (const pc of all(e, 'hp', 'pic')) { const img = all(pc, 'hc', 'img')[0]; if (img) { const i = await saveImg(img.getAttribute('binaryItemIDRef')); if (i) out.push(i); } } return out; }
    const runsRich = p => kids(p, 'hp', 'run').map(r => { const t = all(r, 'hp', 't').map(x => x.textContent).join(''); if (!t) return ''; return (cpr[r.getAttribute('charPrIDRef')] || {}).bold && t.trim() ? `<b>${t}</b>` : t; }).join('').replace(/<\/b><b>/g, '').trim();

    for (const sec of sections) {
      const S = (await xml(sec)).documentElement;
      for (const p of kids(S, 'hp', 'p')) {
        const tbls = all(p, 'hp', 'tbl'); const runs = kids(p, 'hp', 'run');
        const props = runs.filter(r => all(r, 'hp', 't').map(x => x.textContent).join('').trim()).map(r => cpr[r.getAttribute('charPrIDRef')] || {});
        const t = txt(p).trim();
        const allBold = props.length > 0 && props.every(x => x.bold);
        const small = props.length > 0 && Math.max(...props.map(x => x.size || 10)) < 10;
        if (tbls.length) {
          const tb = tbls[0];
          const rows = kids(tb, 'hp', 'tr').map(tr => kids(tr, 'hp', 'tc').map(tc => txt(tc).trim()));
          const flat = rows.flat(); const pics = await picsIn(tb);
          if (rows.length === 2 && /^\d+\.\d+$/.test(rows[0][0] || '')) {
            add({ type: 'h1', no: rows[0][0], text: rows[0][1] || '', en: (rows[1] || [])[0] || '', infer: { rule: '2×2 표 상자 [번호|제목]/[영문]', confidence: '높음' } });
            numberedSinceH1 = false; mode = null; continue;
          }
          const cap = flat.find(c => /^그림\s*\d+\.\d+/.test(c));
          if (pics.length && cap) { add({ type: 'figure', no: cap.match(/^그림\s*(\d+\.\d+)/)[1], caption: cap.replace(/^그림\s*\d+\.\d+\s*/, ''), images: pics, panels: flat.filter(c => c && c !== cap && c.length <= 3) }); continue; }
          if (rows[0] && /^표\s*\d+\.\d+/.test(rows[0][0] || '') && rows[0].filter(Boolean).length === 1) {
            const m = rows[0][0].match(/^표\s*(\d+\.\d+)\s*(.*)$/); add({ type: 'table', no: m[1], caption: m[2], head: rows[1] || [], rows: rows.slice(2) }); continue;
          }
          if (rows.length === 1 && rows[0].length === 1) {
            const body = rows[0][0]; let [kind, rest] = body.includes('∥') ? body.split('∥', 2) : ['', body];
            const m = rest.trim().match(/^(핵심 요약\s*Key Note|[^・·•]{2,60}?[A-Za-z][A-Za-z ,\-]+?)(?=\s{2}|・|·|•|$)/);
            const title = m ? m[1].trim() : '';
            const items = rest.trim().slice(title.length).trim().split(/(?:^|(?<=[.다)]))\s*[·•・]\s*|^\s*[·•・]/).map(x => x && x.trim()).filter(Boolean);
            add({ type: 'box', kind: kind.trim() || (title.startsWith('핵심 요약') ? '핵심 요약' : '상자'), title, items, text: body, infer: { rule: '1×1 표 = 상자', confidence: '높음' } }); continue;
          }
          const [no, capt] = pendingTcap || ['', '']; pendingTcap = null;
          add({ type: 'table', no, caption: capt, head: rows[0] || [], rows: rows.slice(1) }); continue;
        }
        const pics = await picsIn(p);
        if (pics.length) { pendingFig = add({ type: 'figure', no: '', caption: '', images: pics, panels: [] }); continue; }
        if (!t) continue;
        const mt = t.match(/^표\s*(\d+\.\d+)\s*(.{0,40})$/);
        if (mt && t.length <= 45) { pendingTcap = [mt[1], mt[2].trim()]; continue; }
        if (/^그림\s*\d+\.\d+/.test(t) && (small || pendingFig)) {
          const no = t.match(/^그림\s*(\d+\.\d+)/)[1];
          const target = pendingFig && !pendingFig.caption ? pendingFig : [...blocks].reverse().find(b => b.type === 'figure' && !b.caption);
          if (target) { target.no = no; target.caption = t.replace(/^그림\s*\d+\.\d+\s*/, ''); }
          else add({ type: 'figure', no, caption: t.replace(/^그림\s*\d+\.\d+\s*/, ''), images: [], panels: [] });
          pendingFig = null; continue;
        }
        const lvl = outline[p.getAttribute('styleIDRef')];
        if (lvl && t.length <= 80) {
          const num = t.match(/^(\d+\.\d+|\d+\))\s*/); const [ko, en] = splitKoEn(t.replace(/^(\d+\.\d+|\d+\))\s*/, ''));
          if (SPECIAL[ko]) { add({ type: 'h1', no: '', text: ko, en, special: SPECIAL[ko], infer: { rule: `스타일 '개요 ${lvl}' + 특수 제목`, confidence: '스타일' } }); mode = SPECIAL[ko]; continue; }
          if (lvl === 1) { numberedSinceH1 = false; mode = null; } if (lvl === 3) numberedSinceH1 = true;
          add({ type: 'h' + lvl, no: num ? num[1].replace(')', '') : '', text: ko, en, infer: { rule: `문단 스타일 '개요 ${lvl}'`, confidence: '스타일' } }); continue;
        }
        if (allBold && t.length <= 60 && !/[.다]$/.test(t)) {
          const [ko, en] = splitKoEn(t.replace(/^\d+\)\s*/, ''));
          if (SPECIAL[ko]) { add({ type: 'h1', no: '', text: ko, en, special: SPECIAL[ko], infer: { rule: `굵은 문단 '${ko}' (끝 부분 특수 제목)`, confidence: '높음' } }); mode = SPECIAL[ko]; continue; }
          if (/^\d+\)/.test(t)) { numberedSinceH1 = true; add({ type: 'h3', no: t.match(/^(\d+)\)/)[1], text: ko, en, infer: { rule: "굵은 문단 '1) 제목'", confidence: '높음' } }); continue; }
          // 번호 없는 굵은 제목: 같은 절에서 번호 제목이 나오기 전이면 중제목, 뒤면 세부 제목 — 순서로만 정하므로 확신도 중간
          add({ type: numberedSinceH1 ? 'h4' : 'h2', no: '', text: ko, en, infer: { rule: numberedSinceH1 ? '번호 없는 굵은 문단, 번호 제목 뒤 → 세부 제목' : '번호 없는 굵은 문단, 번호 제목 앞 → 중제목', confidence: '중간' } }); continue;
        }
        if (mode === 'refs') { add({ type: 'ref', text: t }); continue; }
        if (mode === 'activity') { add({ type: 'activity', text: t }); continue; }
        if (allBold && !blocks.length) { add({ type: 'lead', text: t, infer: { rule: '장 첫 문단 전체 굵은 글씨 → 도입문', confidence: '중간' } }); continue; }
        add({ type: 'para', text: runsRich(p) });
      }
    }
    return { blocks, images: Object.values(images), stats: blocks.reduce((a, b) => (a[b.type] = (a[b.type] || 0) + 1, a), {}) };
  }
  // 구조화 블록 한 줄 글 (structured_blocks.text 저장용)
  function blockText(b) {
    if (b.type === 'figure') return `그림 ${b.no || ''} ${b.caption || ''}`.trim();
    if (b.type === 'table') return [`표 ${b.no || ''} ${b.caption || ''}`.trim(), (b.head || []).join(' | '), ...(b.rows || []).map(r => r.join(' | '))].filter(Boolean).join('\n');
    if (b.type === 'box') return b.text || [b.title, ...(b.items || [])].join(' · ');
    if (/^h[1-4]$/.test(b.type)) return [b.no ? (b.type === 'h3' ? b.no + ')' : b.no) : '', b.text, b.en].filter(Boolean).join(' ');
    return b.text || '';
  }
  const api = { convert, blockText, splitKoEn, version: '1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Hwpx = api;
})(typeof window !== 'undefined' ? window : globalThis);
