export function showToast(msg, type = 'info') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    Object.assign(t.style, { position:'fixed', bottom:'24px', right:'24px', zIndex:'9999', padding:'12px 20px', borderRadius:'10px', color:'#fff', background:'#1a3a2a', transform:'translateY(100px)', opacity:'0', transition:'all 0.3s' });
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1'; t.style.transform = 'translateY(0)';
  t.style.background = type === 'error' ? '#c0392b' : type === 'success' ? '#27ae60' : type === 'warning' ? '#f39c12' : '#2d6a4f';
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 3000);
}

export function setLoading(on) {
  let l = document.getElementById('loader');
  if (!l) {
    l = document.createElement('div'); l.id = 'loader';
    l.innerHTML = '<div style="width:40px;height:40px;border:3px solid #e9b84a;border-top:3px solid transparent;border-radius:50%;animation:spin 1s linear infinite"></div>';
    Object.assign(l.style, { position:'fixed', inset:'0', background:'rgba(10,15,12,0.8)', display:'grid', placeItems:'center', zIndex:'9999' });
    document.body.appendChild(l);
  }
  l.style.display = on ? 'grid' : 'none';
}