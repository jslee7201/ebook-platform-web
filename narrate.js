/* 낭독문 만들기: 화면 표시 원문 → 읽을 문장
   규칙: 인용번호 빼기 · 영문 병기 빼기 · 따옴표 정리 · 그림/표 번호 읽기 · 발음 사전(기호·약어·용어) 적용
   브라우저(window.Narrate)와 Node(require) 모두에서 씁니다. */
(function (root) {
  const D = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const sino = n => {
    n = parseInt(n, 10); if (!(n >= 0)) return String(n); if (n < 10) return D[n];
    if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return (t > 1 ? D[t] : '') + '십' + (o ? D[o] : ''); }
    return String(n);
  };
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function narrate(text, lexicon = []) {
    let s = String(text || '');
    // 0) 그림·표 번호 (인용번호 규칙보다 먼저)
    s = s.replace(/(그림|표)\s?(\d+)\.(\d+)/g, (m, k, a, b) => `${k} ${sino(a)} 점 ${sino(b)}`);
    // 1) 인용번호: 문장부호·단위·한글 뒤에 붙은 위첨자 숫자
    s = s.replace(/(?<!\d)([.,”’)\]])(\d{1,3}(?:[,–-]\d{1,3})*)(?=\s|$)/g, '$1');
    s = s.replace(/(mm|cm|μm|%)(\d{1,3}(?:[,–-]\d{1,3})*)(?=\s|$|[.,])/g, '$1');
    s = s.replace(/(^|[^제0-9])([가-힣]{2,})(\d{1,3}(?:[,–-]\d{1,3})*)(?=(에|는|은|의|와|과|에서|이|가|를|을|도|로|으로)?[\s.,])/g, (m, a, w, d) => a + w);
    // 2) 영문 병기 (괄호 안이 영문으로 시작)
    s = s.replace(/\s?\((?=[A-Za-z])[^()가-힣]*\)/g, '');
    // 3) 따옴표: 큰따옴표는 빼고 작은따옴표는 둠
    s = s.replace(/[“”"]/g, '');
    // 5) 발음 사전: 긴 것부터. 약어는 영문 단어 경계에서만
    const lex = [...lexicon].sort((a, b) => b.src.length - a.src.length);
    for (const e of lex) {
      if (e.kind === '약어' && /^[A-Za-z][A-Za-z0-9-]*$/.test(e.src)) s = s.replace(new RegExp(`(^|[^A-Za-z])${esc(e.src)}(?![A-Za-z])`, 'g'), `$1${e.say}`);
      else s = s.split(e.src).join(e.say);
    }
    // 6) 표 행: '항목: 값 · 항목: 값' → 쉼표 구분은 사전의 '·'가 처리. 공백 정리
    return s.replace(/\s+([.,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }
  const api = { narrate, sino, version: '1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Narrate = api;
})(typeof window !== 'undefined' ? window : globalThis);
