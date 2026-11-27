/* 단계별 공통 메뉴: 제작 5단계(대주제)와 단계마다의 기능(서브)을 한곳에서 정의하고 모든 화면에 같은 메뉴를 그립니다.
   - 상단: 홈 + 단계 5개(누르면 그 단계 기능 목록이 펼쳐짐)
   - 상단 아래: 단계 진행 막대(①→⑤, 지금 단계 강조) + 지금 단계의 기능 탭 */
(function () {
  const STAGES = [
    { no: 1, key: 'intake', title: '원고 접수', sub: '원고를 받아 구조화합니다', items: [
      { href: 'manuscripts.html', name: '원고 입력', desc: 'PDF·HWPX 보관, 글자 없는 쪽만 OCR' },
      { href: 'convert.html', name: '변환 확인', desc: 'PDF를 블록으로 바꾸고 쪽마다 확인' },
      { href: 'structure.html', name: '원고 구조 확인', desc: 'HWPX 제목 체계 추정·사람 확인' },
      { href: 'notes.html', name: '편집 지시문', desc: '원고 속 편집자용 메모를 본문에서 분리' }] },
    { no: 2, key: 'edit', title: '편집', sub: '기준을 잠그고 용어·표를 다듬습니다', items: [
      { href: 'guides.html', name: '스타일 가이드', desc: '작업 전 가이드 잠금, 규칙 자동 검사' },
      { href: 'glossary.html', name: '공용 용어집', desc: '실시간 공유, 불일치·옛 용어 경고' },
      { href: 'kma.html', name: 'KMA 대조', desc: '의학용어집과 용어별 대조 기록' },
      { href: 'tables.html', name: '표 편집기', desc: '풀린 셀 병합 복원, 칸 밀림 점검' }] },
    { no: 3, key: 'review', title: '검수', sub: '원서·그림의 오류를 사람이 판정합니다', items: [
      { href: 'queries.html', name: '원서 의문점', desc: '감수 판정, 원출판사 전달 목록' },
      { href: 'figreview.html', name: '그림 원본 검수', desc: '원본 해상도로 확대해야 판정 가능' }] },
    { no: 4, key: 'layout', title: '조판', sub: '쪽 배치를 정하고 PDF로 냅니다', items: [
      { href: 'layout.html', name: '학습서 조판', desc: '메모 칸, 그림 같은 쪽 배치, 수동 조정' }] },
    { no: 5, key: 'publish', title: '출간·2차 산출물', sub: '권리를 확인하고 배포·확장합니다', items: [
      { href: 'rights.html', name: '권리 게이트', desc: '산출물별 계약·동의·배포 상태' },
      { href: 'figures.html', name: '그림 대장', desc: '그림 출처·허락 범위·인물 동의' },
      { href: 'chatbot.html', name: '챗봇 거절 관리', desc: '거절 사유 4가지, 판정 평가' },
      { href: 'tts.html', name: 'TTS 비교', desc: '음성 비교·청취 평가·발음 사전' }] }
  ];
  const NUM = ['', '①', '②', '③', '④', '⑤'];
  window.EBOOK_STAGES = STAGES; window.EBOOK_NUM = NUM;
  const page = (location.pathname.split('/').pop() || 'index.html').replace(/\?.*$/, '') || 'index.html';
  const curStage = STAGES.find(s => s.items.some(i => i.href === page));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() {
    const nav = document.querySelector('header.top nav'); if (!nav) return;
    nav.className = 'stagenav'; nav.setAttribute('aria-label', '제작 단계');
    nav.innerHTML = `<a href="index.html" class="home" ${page === 'index.html' ? 'aria-current="page"' : ''}>홈</a>` + STAGES.map(s => `
      <details class="stagemenu${s === curStage ? ' cur' : ''}">
        <summary><span class="no">${NUM[s.no]}</span>${esc(s.title)}</summary>
        <div class="panel" role="menu">
          <p class="psub">${esc(s.sub)}</p>
          ${s.items.map(i => `<a role="menuitem" href="${i.href}" ${i.href === page ? 'aria-current="page"' : ''}><b>${esc(i.name)}</b><span>${esc(i.desc)}</span></a>`).join('')}
        </div>
      </details>`).join('');
    // 하나만 열리게, 바깥을 누르면 닫힘
    nav.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => { if (d.open) nav.querySelectorAll('details').forEach(o => o !== d && (o.open = false)); }));
    document.addEventListener('click', e => { if (!e.target.closest('.stagemenu')) nav.querySelectorAll('details[open]').forEach(d => d.open = false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') nav.querySelectorAll('details[open]').forEach(d => d.open = false); });

    if (curStage) {   // 단계 진행 막대 + 지금 단계 기능 탭
      const bar = document.createElement('div'); bar.className = 'stagebar';
      bar.innerHTML = `<ol class="steps" aria-label="제작 단계">${STAGES.map(s => `<li class="${s === curStage ? 'cur' : s.no < curStage.no ? 'past' : ''}"><a href="${s.items[0].href}" ${s === curStage ? 'aria-current="step"' : ''}><span class="no">${s.no}</span><span class="t">${esc(s.title)}</span></a></li>`).join('')}</ol>
        <div class="subtabs" role="tablist" aria-label="${esc(curStage.title)} 기능">${curStage.items.map(i => `<a role="tab" href="${i.href}" aria-selected="${i.href === page}" ${i.href === page ? 'aria-current="page"' : ''}>${esc(i.name)}</a>`).join('')}</div>`;
      document.querySelector('header.top').after(bar);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
