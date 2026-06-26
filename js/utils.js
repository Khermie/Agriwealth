export function showToast(msg, type = 'info') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    Object.assign(t.style, { position:'fixed', bottom:'24px', right:'24px', zIndex:'9999', padding:'12px 20px', borderRadius:'14px', color:'#fff', background:'#0f172a', transform:'translateY(100px)', opacity:'0', transition:'all 0.3s', boxShadow:'0 18px 44px rgba(15,23,42,0.28)', backdropFilter:'blur(20px)' });
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1'; t.style.transform = 'translateY(0)';
  t.style.background = type === 'error' ? '#dc2626' : type === 'success' ? '#2563eb' : type === 'warning' ? '#60a5fa' : '#1e3a8a';
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 3000);
}

export function setLoading(on) {
  let l = document.getElementById('loader');
  if (!l) {
    l = document.createElement('div'); l.id = 'loader';
    l.innerHTML = '<div style="width:40px;height:40px;border:3px solid #60a5fa;border-top:3px solid transparent;border-radius:50%;animation:spin 1s linear infinite"></div>';
    Object.assign(l.style, { position:'fixed', inset:'0', background:'rgba(15,23,42,0.82)', backdropFilter:'blur(20px)', display:'grid', placeItems:'center', zIndex:'9999' });
    document.body.appendChild(l);
  }
  l.style.display = on ? 'grid' : 'none';
}
