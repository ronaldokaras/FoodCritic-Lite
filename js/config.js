/* ============================================================
   FoodCritic Fácil — config.js
   Cliente Supabase + utilitários compartilhados por todas as páginas
   (toast, confirmação, botão ocupado, formatação de dinheiro).
   ============================================================ */
(() => {
  'use strict';

  if (!window.supabase) {
    throw new Error('supabase-js não carregou. Verifique sua conexão.');
  }

  /* ---------- Configuração ---------- */
  window.APP = Object.freeze({
    url: 'https://byycxurjjonbhrreoost.supabase.co',
    key: 'sb_publishable_CyvZ6fSv-rnd3tc_KhoVhg_jWxTrWOj',
    tables: Object.freeze({
      stores:     'stores',
      menu:       'menu_items',
      profiles:   'profiles',
      categories: 'categories',
    }),
    buckets: Object.freeze({ images: 'img_comidas' }),
    // chaves do localStorage (limpas no logout)
    storageKeys: Object.freeze(['fc-cart', 'fc-address', 'fc-order']),
  });

  window.sb = window.supabase.createClient(APP.url, APP.key);

  /* ---------- DOM / texto ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  window.$   = id => document.getElementById(id);
  window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

  /* ---------- Imagens ---------- */
  window.imgUrl = path => sb.storage.from(APP.buckets.images).getPublicUrl(path).data.publicUrl;
  window.avatarUrl = (userId, bust) => {
    const u = imgUrl(`avatars/${userId}.jpg`);
    return bust ? `${u}?t=${bust}` : u;
  };

  /* ---------- Dinheiro (1.234,56) ---------- */
  const brl = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  window.money = n => brl.format(Number(n) || 0);

  /* ---------- Toast ----------
     toast('Mensagem', 'success' | 'error' | 'info', { action: { label, onClick }, duration }) */
  const TOAST_ICON = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };

  window.toast = (msg, tone = 'info', { action, duration } = {}) => {
    const box = $('toast-container');
    if (!box) return;

    const el = document.createElement('div');
    el.className = `toast ${tone}`;

    const icon = document.createElement('i');
    icon.className = `fas ${TOAST_ICON[tone] || TOAST_ICON.info}`;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = msg;
    el.append(icon, text);

    const remove = () => el.remove();

    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { action.onClick(); remove(); });
      el.append(btn);
    }

    while (box.children.length >= 3) box.firstElementChild.remove();   // no máximo 3 na tela
    box.append(el);
    setTimeout(remove, duration ?? (action ? 5000 : 2800));
  };

  /* ---------- Botão ocupado (spinner) ---------- */
  window.setBusy = (btn, busy, label = 'Aguarde...') => {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ${label}`;
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  };

  /* ---------- Confirmação (<dialog>) ----------
     if (await askConfirm({ title, text, ok, cancel })) { ... } */
  window.askConfirm = ({ title, text = '', ok = 'Confirmar', cancel = 'Cancelar' }) =>
    new Promise(resolve => {
      const d = $('confirm-dialog');
      if (!d || typeof d.showModal !== 'function') {
        return resolve(window.confirm(text ? `${title}\n\n${text}` : title));
      }
      d.querySelector('[data-dlg-title]').textContent = title;
      d.querySelector('[data-dlg-text]').textContent = text;
      d.querySelector('[data-dlg-ok]').textContent = ok;
      d.querySelector('[data-dlg-cancel]').textContent = cancel;
      d.returnValue = '';
      d.onclick = e => { if (e.target === d) d.close('cancel'); };      // clique fora = cancelar
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
})();
