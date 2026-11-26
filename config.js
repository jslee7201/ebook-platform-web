// Supabase 연결 정보 (공개용 키: 데이터 보호는 데이터베이스의 행 단위 보안 규칙이 담당)
window.EBOOK_CONFIG = {
  url: 'https://xqxtgjammtnsjsiylwht.supabase.co',
  key: 'sb_publishable_HEaV6cNVmjPzc3hn-GgJNg_nStWKOAQ'
};
window.sb = window.supabase.createClient(EBOOK_CONFIG.url, EBOOK_CONFIG.key);

// 공통: 로그인·역할 확인 후 콜백
window.requireMember = async function (onReady) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = 'index.html'; return; }
  const { data: prof } = await sb.from('profiles').select('display_name, role').eq('id', session.user.id).single();
  if (!prof || !['member', 'admin'].includes(prof.role)) { location.href = 'index.html'; return; }
  const who = document.getElementById('who');
  if (who) who.textContent = (prof.display_name || session.user.email) + (prof.role === 'admin' ? ' · 관리자' : '');
  const out = document.getElementById('logout');
  if (out) out.onclick = async () => { await sb.auth.signOut(); location.href = 'index.html'; };
  onReady(session, prof);
};

window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
