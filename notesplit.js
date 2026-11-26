/* 원고 속 편집 지시문 감지 (S-01)
   저자가 본문·캡션 안에 편집자에게 남긴 작업 지시를 찾아 본문에서 떼어 냅니다. 그대로 인쇄되는 사고를 막기 위함입니다.
   확실 = 자동 분리 후 편집자 할 일로, 의심 = 사람이 확인할 때까지 본문에 두고 표시. */
(function (root) {
  const TARGET = '(그림|사진|도판|표|글자|글씨|지시선|레이블|라벨|텍스트|원본|크기|위치|여백|색|화살표|번호|제목|캡션|설명|순서|간격|테두리|배경|이미지|파일)';
  const RULES = [
    { id: '편집자 호칭', level: '확실', re: /(편집자(님)?(에게|께|분께|용|가|는)?|편집부|디자이너(님|에게|께)|조판(자|팀|하실\s?때)|출판사(에|에서)\s?(수정|작업))/ },
    { id: '지시 표식', level: '확실', re: /^\s*(※\s?(편집|작업|참고:?\s?편집)|☞|\[(편집|작업|메모|수정)[^\]]*\]|【(편집|작업)|\((편집|작업)\s?[:：]|<(편집|작업)|\/\/|TODO|FIXME)/i },
    { id: '작업 대상+정중한 지시', level: '확실', re: new RegExp(TARGET + '[^.。]{0,40}(해\\s?주세요|해\\s?주십시오|주세요|바랍니다|부탁드립니다|부탁합니다|하세요|하셔도\\s?됩니다|줄이셔도\\s?됩니다|넣어\\s?주|빼\\s?주|띄워\\s?주|바꿔\\s?주|키워\\s?주|사용해\\s?주|해야\\s?합니다)') },
    { id: '원본 사용 메모', level: '확실', re: /(원본\s?사용|원본\s?그대로\s?사용|원본에서\s?잘라|새로\s?그려|다시\s?그려|직접\s?편집)/ },
    { id: '정중한 지시(대상 없음)', level: '의심', re: /(해\s?주세요|부탁드립니다|바랍니다|하셔도\s?됩니다)\s*[.。]?\s*$/ },
    { id: '작업 메모 명사형', level: '의심', re: /^(?=.{2,40}$)(?!.*(이다|한다|된다|있다|없다|였다|이며|하며|다\.|요\.))(?=.*([A-Za-z가-힣]에\s|부분|쪽|위|아래|옆)).*(표기|삽입|삭제|수정|교체|확대|축소|넣기|빼기|추가|이동|강조|표시|정렬|보정)\s*(요망|필요|바람|할\s?것)?\s*[.。]?$/ }
  ];
  const READER = /^(activity|exercise|quiz|활동|문제|퀴즈)$/;
  const QUOTE = /^[“"'‘]|[”"'’]$/;
  function split(text) {
    // 문장 단위: 마침표·물음표 뒤 공백, 닫는 괄호 뒤 공백, 3칸 이상 공백, 줄바꿈
    return String(text || '').split(/(?<=[.!?。)])\s+|\s{3,}|\n+/).map(s => s.trim()).filter(Boolean);
  }
  function detect(text, opt = {}) {
    const sents = split(text); const keep = [], notes = [];
    for (const s of sents) {
      if (opt.kind === 'quote' || QUOTE.test(s)) { keep.push(s); continue; } // 환자 인용 등 따옴표 안 말은 지시가 아님
      // 활동·문제처럼 독자에게 하는 안내('칠하세요', '쓰세요')는 정중한 명령문 규칙을 쓰지 않음
      const rules = READER.test(opt.kind || '') ? RULES.filter(r => !/정중한 지시/.test(r.id)) : RULES;
      const hit = rules.find(r => r.re.test(s));
      if (!hit) { keep.push(s); continue; }
      notes.push({ text: s, rule: hit.id, level: hit.level });
      if (hit.level === '의심') keep.push(s); // 의심은 사람이 확인할 때까지 본문에 둠
    }
    return { keep: keep.join(' '), notes, changed: notes.some(n => n.level === '확실') };
  }
  // 변환 블록 전체에 적용. decided: { 문장: 상태 } — 이미 판정한 문장은 판정대로(본문 유지면 그대로, 할 일·완료면 뺌)
  function apply(blocks, decided = {}) {
    const fresh = [];
    const out = blocks.map(b => {
      if (!b.text) return b;
      const r = detect(b.text, { kind: b.type });
      if (!r.notes.length) return b;
      const remove = new Set();
      for (const n of r.notes) {
        const st = decided[n.text];
        if (st === '본문 유지') continue;
        if (st === '지시문(할 일)' || st === '처리 완료') { remove.add(n.text); continue; }
        if (st === '확인 필요') continue;
        if (n.level === '확실') remove.add(n.text);
        fresh.push({ block_seq: b.seq, note_text: n.text, rule: n.rule, level: n.level, status: n.level === '확실' ? '지시문(할 일)' : '확인 필요', block_before: b.text });
      }
      if (!remove.size) return b;
      const text = split(b.text).filter(s => !remove.has(s)).join(' ');
      fresh.filter(f => f.block_seq === b.seq && f.status === '지시문(할 일)').forEach(f => f.block_after = text);
      return { ...b, text, edited: true };
    });
    return { blocks: out, notes: fresh };
  }
  const api = { detect, split, apply, RULES: RULES.map(r => ({ id: r.id, level: r.level })), version: '1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NoteSplit = api;
})(typeof window !== 'undefined' ? window : globalThis);
