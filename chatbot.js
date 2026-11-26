/* 도서 챗봇 엔진: 근거 검색(BM25) + 거절 사유 분리
   판정 순서: ① 응급·위기 → ② 개인 진료 상담 → ③ 책 근거 검색 → ④ 책 밖 의료 정보 / 책 밖 일반 질문
   브라우저(window.ChatBot)와 Node(require) 모두에서 씁니다. 책 원문은 이 파일에 없고, 로그인한 사용자만 DB에서 받습니다. */
(function (root) {
  const toks = s => {
    s = (s || '').toLowerCase(); const out = [];
    (s.match(/[a-z]{2,}|\d+(?:\.\d+)?/g) || []).forEach(w => out.push(w));
    (s.match(/[가-힣]+/g) || []).forEach(w => { if (w.length === 1) out.push(w); for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2)); });
    return out;
  };
  const jacc = (a, b) => { const A = new Set(toks(a)), B = new Set(toks(b)); let n = 0; A.forEach(x => B.has(x) && n++); return n / Math.max(1, new Set([...A, ...B]).size); };

  // ---- 거절 규칙 (사유별로 분리) ----
  const R = {
    // ① 응급·위기: 진료 거절보다 먼저. 갑작스러운 신경 증상, 자해·자살 표현
    urgent: [
      /(갑자기|방금|지금|오늘\s?아침).{0,20}(얼굴|입|눈|팔|다리|말).{0,15}(처지|돌아가|마비|안\s?움직|어눌|힘이\s?없|감각이\s?없)/,
      /(죽고\s?싶|자살|목숨을|살기\s?싫|사라지고\s?싶|없어지고\s?싶|다\s?끝내고\s?싶|끝내\s?버리고\s?싶|그만\s?살고\s?싶|살고\s?싶지\s?않|살\s?이유가\s?없|삶을\s?포기|자해)/,
      /(숨(을|이)?\s?(못|안)\s?쉬|의식이\s?없|쓰러졌)/
    ],
    // ② 개인 진료 상담: '나·가족' 맥락 + 건강 문제, 또는 개인에게 무엇을 해야 하는지 묻는 말
    personal: /(제가|저는|저도|내가|나는|난\s|저희|우리\s?(아이|애|엄마|아빠|어머니|아버지|남편|아내|딸|아들|가족|할머니|할아버지)|제\s?(얼굴|입|눈|아이|증상|상태|경우)|내\s?(얼굴|입|눈|증상|상태|경우)|(엄마|아빠|남편|아내|아이|딸|아들|어머니|아버지|부모님|동생|언니|오빠|형|누나)(가|이|는|은|도|의)\s)/,
    health: /(마비|아파|아프|통증|증상|약|치료|수술|병원|운동|우울|불안|주사|보톡스|보툴리눔|낫|진단|검사|재활|떨림|경련|처지)/,
    ask_me: /(먹어야|받아야|해야\s?(하나요|할까요|돼요|되나요)|가야\s?(하나요|할까요|돼요)|괜찮을까요|괜찮나요|낫나요|나을까요|도\s?될까요|도\s?되나요|나아질까요|진단해|처방해|어떻게\s?하면\s?좋을까요|뭘\s?해야)/,
    // ④ 의료 정보이지만 책 근거가 없을 때: 약·용량·시술 방법·부작용·수술 성적 등
    medical: /(약|용량|투여|복용|처방|부작용|주사|시술|수술|성공률|치료법|치료\s?방법|스테로이드|항바이러스|보툴리눔|보톡스|감압술|이식|침\s?치료|침술|한방|한약|뜸|예후|회복률|증후군|치료는|치료가|치료를|음식|식단|영양제|나아질|완치|mg|밀리그램|프레드니솔론|아시클로버|가바펜틴)/i
  };
  const MSG = {
    urgent: '지금 말씀하신 내용은 바로 도움이 필요한 상황일 수 있습니다. 이 챗봇은 응급 상황을 판단할 수 없습니다.\n\n• 갑자기 얼굴·팔·다리에 힘이 빠지거나 말이 어눌해졌다면 바로 119에 전화하거나 가까운 응급실로 가세요.\n• 스스로를 해치고 싶은 마음이 든다면 자살예방상담전화 109(24시간) 또는 정신건강위기상담 1577-0199로 연락해 주세요.',
    clinical: '개인의 증상·진단·치료 선택에 대해서는 답해 드릴 수 없습니다. 이 챗봇은 책 내용을 찾아 드리는 학습 도구이며, 진료를 대신하지 않습니다. 담당 의료진과 상의해 주세요.',
    out_of_book_medical: '이 책({scope})에는 이 의료 정보가 나오지 않습니다. 약 이름·용량·시술 방법처럼 책에 근거가 없는 내용은 추측해서 답하지 않습니다. 실제 치료는 담당 의료진과 상의해 주세요.',
    out_of_book: '이 책({scope})에서 관련 내용을 찾지 못했습니다. 이 챗봇은 책 내용만으로 답하고, 책에 없는 내용은 추측하지 않습니다.'
  };
  const LABEL = { answered: '책 근거로 답변', urgent: '응급·위기 안내', clinical: '진료 상담 거절', out_of_book_medical: '책 밖 의료 정보', out_of_book: '책 밖 질문' };

  function create(data, opt = {}) {
    const chunks = data.chunks || [], terms = data.terms || [], content = data.content || {};
    const M = Object.assign({}, MSG, opt.messages || {}), scope = opt.scope || data.scope_note || '이 책';
    const msg = r => (M[r] || '').replace(/\{scope\}/g, scope);
    const MIN = opt.minScore ?? 3.2, SAMPLE = opt.sampleJacc ?? 0.32, UNK = opt.unknownRatio ?? 0.34, COV = opt.minCoverage ?? 0.5;
    const expand = q => {
      let x = q; const ql = q.toLowerCase();
      terms.forEach(t => {
        const alts = (t.alt || '').split(/[,·]/).map(s => s.trim()).filter(s => s.length > 1);
        const en = (t.en || '').toLowerCase().split(/[\/(]/)[0].trim();
        if (alts.some(a => q.includes(a)) || (en.length > 3 && ql.includes(en))) x += ' ' + t.ko;
      });
      return x;
    };
    const docs = chunks.map(c => toks(c.text + ' ' + c.sec)), N = docs.length;
    const avg = docs.reduce((a, d) => a + d.length, 0) / Math.max(N, 1);
    const df = {}; docs.forEach(d => new Set(d).forEach(w => df[w] = (df[w] || 0) + 1));
    function search(q, k = 4) {
      const qt = [...new Set(toks(expand(q)))];
      return docs.map((d, i) => {
        let s = 0; const tf = {}; d.forEach(w => tf[w] = (tf[w] || 0) + 1);
        qt.forEach(w => { if (!tf[w]) return; const idf = Math.log(1 + (N - df[w] + .5) / (df[w] + .5)); s += idf * tf[w] * 2.2 / (tf[w] + 1.2 * (.25 + .75 * d.length / avg)); });
        if (chunks[i].kind === '그림') s *= .6;
        return { i, s };
      }).sort((a, b) => b.s - a.s).slice(0, k).filter(x => x.s > 0);
    }
    // 핵심어 검사: 질문의 내용어가 책에 실제로 나오는지 (점수만으로는 '주세요'·'치료' 같은 흔한 조각에 속음)
    const corpus = chunks.map(c => (c.text + ' ' + c.sec).toLowerCase());
    const all = corpus.join('\n');
    const STOP = /^(알려|주세요|줘|해줘|무엇|뭐|뭔가|어떤|어떻게|얼마|얼마나|언제|어디|누가|왜|있나요|있어|있을까요|하나요|되나요|인가요|무엇인가요|설명|대해|관련|좀|그|이|저|것|수|등|및|또는|그리고|하는|하고|오늘|지금|하나|가지|각각|모두|역할|의미|정도|경우|때|어때|어때요|알고|싶어요|싶다|위한|위해|통한|대한|쓰는|하는지|있는지)$/;
    const PART = /(으로부터|에게서|이라는|라는|이란|에서는|에서|으로|에게|까지|부터|처럼|보다|이나|이며|와의|과의|에는|으로는|로는|은|는|이|가|을|를|의|에|로|와|과|도|만|란|요)$/;
    const VERBY = /(나요|까요|세요|어요|아요|해요|했나요|인가요|습니까|ㅂ니까|니까|줘|봐|하면|하는데|인데|는데|지요|죠|ㄴ가요|던가요|ㄹ까|을까|할까|될까|다|해|으면)$/;
    function keywords(q) {
      const words = (expand(q).toLowerCase().match(/[가-힣]+|[a-z]{3,}/g) || []);
      const out = [];
      for (let w of words) {
        if (STOP.test(w) || (VERBY.test(w) && !/^[a-z]/.test(w))) continue;
        let s = w; for (let k = 0; k < 2; k++) { const t = s.replace(PART, ''); if (t.length >= 2) s = t; else if (t !== s && !/^(침|뜸)$/.test(t)) { s = ''; break; } else if (t !== s) { s = t; break; } }
        if (/^(침|뜸)$/.test(s)) { if (!out.includes(s)) out.push(s); continue; } // 1글자 의료어
        if (s.length < 2 || STOP.test(s)) continue;
        if (!out.includes(s)) out.push(s);
      }
      return out;
    }
    function evidence(q, hits) {
      const kw = keywords(q);
      const unknown = kw.filter(w => w.length === 1 ? !new RegExp('(^|[^가-힣])' + w + '([^가-힣]|$)').test(all) : !all.includes(w));
      const topText = hits.slice(0, 3).map(h => corpus[h.i]).join('\n');
      const covered = kw.filter(w => topText.includes(w));
      return { kw, unknown, coverage: kw.length ? covered.length / kw.length : 0 };
    }
    function related(q) { // 거절할 때 함께 보여 줄 책의 일반 내용 (개인 맥락 단어는 빼고 검색)
      const core = q.replace(R.personal, ' ').replace(R.ask_me, ' ');
      const h = search(core, 3).filter(x => x.s >= MIN);
      return h.map(x => ({ id: chunks[x.i].id, sec: chunks[x.i].sec, ch: chunks[x.i].ch, kind: chunks[x.i].kind, score: +x.s.toFixed(2) }));
    }
    function classify(q) {
      const text = String(q || '').trim();
      if (R.urgent.some(r => r.test(text))) return { reason: 'urgent', rule: 'urgent' };
      const personal = R.personal.test(text), health = R.health.test(text), askMe = R.ask_me.test(text);
      if ((personal && health) || (askMe && health && !/(환자|사람들|일반적으로|보통)/.test(text))) return { reason: 'clinical', rule: personal ? 'personal+health' : 'ask_me+health' };
      return null;
    }
    function answer(q) {
      const text = String(q || '').trim();
      const c = classify(text);
      if (c) return { ...c, label: LABEL[c.reason], message: msg(c.reason), related: c.reason === 'clinical' ? related(text) : [], top: null };
      const sm = (content.samples || []).map(s => ({ s, j: jacc(text, s.q) })).sort((a, b) => b.j - a.j)[0];
      if (sm && sm.j >= SAMPLE) return { reason: 'answered', label: LABEL.answered, mode: 'sample', message: sm.s.a, sources: sm.s.src, top: +sm.j.toFixed(2) };
      const hits = search(text);
      const top = hits[0]?.s || 0;
      const ev = evidence(text, hits);
      const why = top < MIN ? 'low-score' : (ev.unknown.some(w => w.length >= 3 && /(마비|증후군|증|염|병|암|제|술|요법|주사|수술)$/.test(w)) || (ev.unknown.length && ev.unknown.length / Math.max(1, ev.kw.length) >= UNK)) ? 'unknown-terms' : ev.coverage < COV ? 'low-coverage' : null;
      if (why) {
        const r = R.medical.test(text) ? 'out_of_book_medical' : 'out_of_book';
        return { reason: r, rule: why, label: LABEL[r], message: msg(r), top: +top.toFixed(2), keywords: ev.kw, unknown: ev.unknown, coverage: +ev.coverage.toFixed(2), related: [] };
      }
      const qt = new Set(toks(expand(text))); const sents = [];
      hits.slice(0, 2).forEach(h => {
        const ck = chunks[h.i];
        (ck.kind === '표' ? [ck.text] : ck.text.split(/(?<=[.다])\s+/)).forEach(s => { const sc = toks(s).filter(w => qt.has(w)).length; if (sc) sents.push({ s, sc, id: ck.id }); });
      });
      sents.sort((a, b) => b.sc - a.sc);
      return { reason: 'answered', label: LABEL.answered, mode: 'extract', message: '책에서 찾은 관련 내용입니다.\n\n' + sents.slice(0, 3).map(p => '• ' + p.s).join('\n'), sources: hits.slice(0, 3).map(h => chunks[h.i].id), top: +top.toFixed(2) };
    }
    const label = id => { const ck = chunks.find(x => x.id === id); if (ck) return ck.kind === '그림' ? ck.sec : `${ck.ch}장 · ${ck.sec}`; const m = String(id).match(/^ch0(\d)/); return m ? `${m[1]}장 본문` : id; };
    return { answer, classify, search, label, chunks, content };
  }
  const api = { create, LABEL, MSG, REASONS: Object.keys(LABEL), version: '1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChatBot = api;
})(typeof window !== 'undefined' ? window : globalThis);
