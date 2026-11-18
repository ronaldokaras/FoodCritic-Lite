/* ============================================================
   FoodCritic Fácil — auth.js
   Guarda de sessão, login, cadastro e logout.
   Carregado em index.html, login.html e register.html.
   ============================================================ */
(() => {
  'use strict';

  const onAuthPage = /\/(login|register)(\.html)?\/?$/.test(location.pathname);

  /* ---------- Sessão ---------- */
  // Usada pelo app.js: devolve a sessão ou redireciona para o login.
  window.requireSession = async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.replace('login.html'); return null; }
    return session;
  };

  // Já logado numa página de login/cadastro → vai direto para o app.
  if (onAuthPage) {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) location.replace('index.html');
    });
  }

  // Saiu em outra aba (ou sessão expirou) → volta para o login.
  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' && !onAuthPage) location.replace('login.html');
  });

  /* ---------- Logout ---------- */
  window.logout = async () => {
    APP.storageKeys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    try { await sb.auth.signOut(); } catch {}
    location.replace('login.html');
  };

  /* ---------- Mensagens de erro em português ---------- */
  const ERRORS = [
    [/invalid login credentials/i,        'E-mail ou senha incorretos.'],
    [/email not confirmed/i,              'Confirme seu e-mail antes de entrar.'],
    [/already (been )?registered/i,       'Este e-mail já está cadastrado.'],
    [/rate limit|too many/i,              'Muitas tentativas. Aguarde um instante.'],
    [/password.*(short|least|characters)/i, 'A senha precisa ter 6 ou mais caracteres.'],
    [/failed to fetch|network/i,          'Sem conexão. Verifique sua internet.'],
  ];
  const friendly = msg => (ERRORS.find(([re]) => re.test(msg)) || [null, 'Erro: ' + msg])[1];

  const fail = (input, msg) => { toast(msg, 'error', { duration: 3500 }); input?.focus(); };

  /* ---------- Login ---------- */
  const loginForm = $('login-form');
  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('auth-email');
    const pass  = $('auth-password');
    const btn   = loginForm.querySelector('.btn-auth-primary');

    if (!email.value.trim() || !pass.value) {
      return fail(email.value.trim() ? pass : email, 'Preencha e-mail e senha.');
    }
    if (!email.checkValidity()) return fail(email, 'Digite um e-mail válido.');

    setBusy(btn, true, 'Entrando...');
    try {
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      if (error) throw error;
      location.replace('index.html');
    } catch (err) {
      setBusy(btn, false);
      fail(pass, friendly(err.message || String(err)));
      pass.select();
    }
  });

  /* ---------- Cadastro ---------- */
  const regForm = $('register-form');
  regForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const name  = $('reg-name');
    const email = $('reg-email');
    const pass  = $('reg-password');
    const btn   = regForm.querySelector('.btn-auth-primary');

    if (!name.value.trim())  return fail(name, 'Preencha todos os campos.');
    if (!email.value.trim()) return fail(email, 'Preencha todos os campos.');
    if (!pass.value)         return fail(pass, 'Preencha todos os campos.');
    if (!email.checkValidity()) return fail(email, 'Digite um e-mail válido.');
    if (pass.value.length < 6)  return fail(pass, 'Senha precisa de 6+ caracteres.');

    setBusy(btn, true, 'Criando...');
    try {
      const { data, error } = await sb.auth.signUp({
        email: email.value.trim(),
        password: pass.value,
        options: { data: { full_name: name.value.trim(), role: 'user' } },
      });
      if (error) throw error;

      // Confirmação de e-mail desligada → já entra direto.
      if (data?.session) return location.replace('index.html');

      toast('Conta criada! Faça login.', 'success', { duration: 3500 });
      setTimeout(() => location.replace('login.html'), 1500);
    } catch (err) {
      setBusy(btn, false);
      fail(email, friendly(err.message || String(err)));
    }
  });

  /* ---------- Mostrar / ocultar senha ---------- */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-pw-toggle]');
    if (!btn) return;
    const input = btn.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    btn.querySelector('i').className = show ? 'far fa-eye-slash' : 'far fa-eye';
  });
})();
