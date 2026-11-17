// ============================================================
//  FOODCRITIC FÁCIL - DELIVERY APP
//  Arquivo: app.js (Completo com Mapa Interativo)
// ============================================================

const money = n => Number(n).toFixed(2).replace('.', ',');
const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const state = {
  view: 'inicio',
  loading: true,
  categories: [],
  stores: [],
  cuisine: null,
  user: null,
  profile: null,
  avatarBust: 0,
  restaurantId: null,
  cart: load('fc-cart', { rid: null, rname: null, items: [] }),
  address: load('fc-address', { name: '', phone: '', street: '', neighborhood: '' }),
  payment: null, 
  needsChange: null, 
  changeFor: '',
  order: load('fc-order', null), 
  orderTicker: null,
};

// Variáveis globais para o Mapa
let mapPicker = null;
let mapMarker = null;

const cartCount = () => state.cart.items.reduce((s, i) => s + i.qty, 0);
const cartTotal = () => state.cart.items.reduce((s, i) => s + i.qty * i.price, 0);
const qtyOf = id => state.cart.items.find(i => i.id === id)?.qty || 0;
const persistCart = () => save('fc-cart', state.cart);
const persistAddress = () => save('fc-address', state.address);

function toast(msg, tone = 'success') {
  const c = $('toast-container'); if (!c) return;
  const t = document.createElement('div'); 
  t.className = 'toast ' + tone; 
  t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 2800);
}

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    state.user = session.user;
    const { data: profile } = await sb.from(APP.tables.profiles).select('id, full_name, role').eq('id', session.user.id).maybeSingle();
    state.profile = profile || { id: session.user.id, full_name: session.user.email.split('@')[0], role: 'user' };
  }

  await refreshData();
  
  state.loading = false;
  render();
  updateNav();
  updateCartBadges();
})();

async function refreshData() {
  try {
    const { data: cats } = await sb.from(APP.tables.categories).select('id, name').order('name');
    state.categories = cats || [];
  } catch(e) { state.categories = []; }

  let storesRes = await sb.from(APP.tables.stores).select('*, categories(id, name), menu_items(*)').order('name');
  if (storesRes.error) {
    storesRes = await sb.from(APP.tables.stores).select('*, menu_items(*)').order('name');
  }

  if (!storesRes.error) {
    state.stores = (storesRes.data || []).map(s => ({
      ...s,
      cover: imgUrl(`stores/${s.id}.jpg`),
      menu_items: (s.menu_items || []).map(m => ({ ...m, img: imgUrl(`menu_items/${m.id}.jpg`) }))
    }));
  }
}

// ============================================================
//  NAVEGAÇÃO E RENDERIZAÇÃO
// ============================================================
function go(view, extra = {}) {
  Object.assign(state, extra);
  state.view = view;
  if (state.orderTicker) clearInterval(state.orderTicker);
  if (view === 'pedido' && state.order) {
    state.orderTicker = setInterval(() => { if (state.view === 'pedido') render(); }, 1000);
  }
  render();
  updateNav();
  window.scrollTo(0, 0);
}

function updateNav() {
  const map = { 
    inicio: 'inicio', restaurante: 'inicio', carrinho: 'carrinho', 
    entrega: 'carrinho', pagamento: 'carrinho', pedido: 'pedido',
    cadastrar: 'cadastrar' 
  };
  const active = map[state.view] || 'inicio';
  document.querySelectorAll('.nav-btn[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === active));
}

function updateCartBadges() {
  const n = cartCount();
  ['cart-badge-mobile', 'cart-badge-sidebar'].forEach(id => {
    const el = $(id); if (el) { el.textContent = n; el.hidden = n === 0; }
  });
}

function render() {
  const content = $('view-content');
  const sidebar = $('sidebar-right-content');
  if (!content) return;
  if (state.loading) { content.innerHTML = `<p class="empty-inline">Carregando...</p>`; return; }

  switch (state.view) {
    case 'inicio': content.innerHTML = renderInicio(); break;
    case 'restaurante': content.innerHTML = renderRestaurante(); break;
    case 'carrinho': content.innerHTML = renderCarrinho(); break;
    case 'entrega': content.innerHTML = renderEntrega(); break;
    case 'pagamento': content.innerHTML = renderPagamento(); break;
    case 'pedido': content.innerHTML = renderPedido(); break;
    case 'cadastrar': content.innerHTML = renderCadastrar(); initMapPicker(); break; // Inicia o mapa ao abrir a tela
    default: content.innerHTML = renderInicio();
  }
  
  if (sidebar) sidebar.innerHTML = renderSidebar();
  updateCartBadges();
}

// ============================================================
//  TELAS (VIEWS)
// ============================================================
function renderInicio() {
  const { cuisine, categories, stores, profile } = state;
  const list = stores.filter(s => cuisine === null || s.category_id === cuisine);

  return `
    <header class="facil-header">
      <p class="logo-small">FoodCritic Fácil</p>
      <h1 class="page-title-facil">Olá, ${esc(profile?.full_name || 'Cliente')}! O que você quer comer?</h1>
    </header>
    
    <h2 class="section-title-lg">Categorias</h2>
    <div class="cat-chips">
      <button class="chip ${cuisine === null ? 'active' : ''}" onclick="setCuisine(null)">Todas</button>
      ${categories.map(c => `<button class="chip ${cuisine === c.id ? 'active' : ''}" onclick="setCuisine(${c.id})">${esc(c.name)}</button>`).join('')}
    </div>

    <h2 class="section-title-lg">Restaurantes</h2>
    ${list.length === 0 ? `<p class="empty-inline">Nenhum restaurante encontrado.</p>` : ''}
    <div class="rest-list">
      ${list.map(storeCard).join('')}
    </div>
  `;
}

function storeCard(s) {
  const items = s.menu_items || [];
  const catName = s.categories?.name || '';
  const feeText = (s.delivery_fee == null || Number(s.delivery_fee) === 0) ? 'Grátis' : `R$ ${money(s.delivery_fee)}`;
  
  return `
    <button class="rest-card-facil" onclick="openStore(${s.id})">
      <img src="${s.cover}" alt="" onerror="this.style.visibility='hidden'">
      <div class="rest-info">
        <h3>${esc(s.name)}</h3>
        ${catName ? `<p>${esc(catName)}</p>` : ''}
        <p class="muted-small">${items.length} ${items.length === 1 ? 'item' : 'itens'} no cardápio</p>
        <p class="muted-small">🛵 ${feeText}</p>
      </div>
    </button>
  `;
}

function renderRestaurante() {
  const r = state.stores.find(x => x.id === state.restaurantId);
  if (!r) return `<p class="empty-inline">Restaurante não encontrado.</p>`;

  const sortedItems = [...(r.menu_items || [])].sort((a, b) => {
    const aAvail = a.is_available !== false; const bAvail = b.is_available !== false;
    return aAvail === bAvail ? 0 : (aAvail ? -1 : 1);
  });

  return `
    <button class="btn-back-facil" onclick="go('inicio')"><i class="fas fa-arrow-left"></i> Voltar</button>
    <img class="cover-img" src="${r.cover}" alt="" onerror="this.style.visibility='hidden'">
    <h1 class="page-title-facil">${esc(r.name)}</h1>
    ${r.categories?.name ? `<p class="muted">${esc(r.categories.name)}</p>` : ''}

    <h2 class="section-title-lg">Escolha seu prato</h2>
    ${sortedItems.length === 0 ? `<p class="empty-inline">Nenhum item cadastrado.</p>` : ''}
    ${sortedItems.map(d => {
      const q = qtyOf(d.id);
      const available = d.is_available !== false;
      return `
        <div class="dish-card-facil ${!available ? 'unavailable' : ''}">
          <img src="${d.img}" alt="" onerror="this.style.visibility='hidden'">
          <div class="dish-body-facil">
            <strong>${esc(d.name)} ${!available ? '(Esgotado)' : ''}</strong>
            ${d.description ? `<p class="muted small">${esc(d.description)}</p>` : ''}
            <span class="dish-price-facil">R$ ${money(d.price || 0)}</span>
            <div class="dish-actions-facil" style="margin-top:10px;">
              ${q === 0 ? `
                <button class="btn-big btn-big-primary btn-big-sm" onclick="addToCart(${r.id}, ${d.id})" ${!available ? 'disabled' : ''}>
                  <i class="fas fa-plus"></i> Adicionar
                </button>
              ` : `
                <div class="qty-control">
                  <button onclick="changeQty(${d.id}, -1)">−</button><span>${q}</span><button onclick="changeQty(${d.id}, 1)">+</button>
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderCarrinho() {
  if (state.cart.items.length === 0) {
    return `
      <button class="btn-back-facil" onclick="go('inicio')"><i class="fas fa-arrow-left"></i> Voltar</button>
      <h1 class="page-title-facil">Meu carrinho</h1>
      <div class="empty-box">
        <i class="fas fa-shopping-bag"></i><p>Seu carrinho está vazio.</p>
        <button class="btn-big btn-big-primary btn-big-block" onclick="go('inicio')"><i class="fas fa-utensils"></i> Ver restaurantes</button>
      </div>`;
  }
  return `
    <button class="btn-back-facil" onclick="go('restaurante', { restaurantId: ${state.cart.rid} })"><i class="fas fa-arrow-left"></i> Voltar</button>
    <h1 class="page-title-facil">Meu carrinho</h1>
    <p class="muted" style="margin-bottom:16px;">${esc(state.cart.rname)}</p>
    ${state.cart.items.map(i => `
      <div class="cart-item-facil">
        <div class="cart-item-info"><strong>${esc(i.name)}</strong><span class="price">R$ ${money(i.price * i.qty)}</span></div>
        <div class="qty-control">
          <button onclick="changeQty(${i.id}, -1)">−</button><span>${i.qty}</span><button onclick="changeQty(${i.id}, 1)">+</button>
        </div>
      </div>`).join('')}
    <div class="total-bar"><span>Total</span><strong>R$ ${money(cartTotal())}</strong></div>
    <button class="btn-big btn-big-primary btn-big-block" onclick="go('entrega')">Continuar <i class="fas fa-arrow-right"></i></button>
  `;
}

function renderEntrega() {
  if (state.cart.items.length === 0) return renderCarrinho();
  const a = state.address;
  return `
    <button class="btn-back-facil" onclick="go('carrinho')"><i class="fas fa-arrow-left"></i> Voltar</button>
    <h1 class="page-title-facil">Onde vamos entregar?</h1>
    <form onsubmit="submitEntrega(event)">
      <div class="field-facil"><label>Seu nome</label><input name="name" value="${esc(a.name)}" required></div>
      <div class="field-facil"><label>Telefone</label><input name="phone" type="tel" value="${esc(a.phone)}" required></div>
      <div class="field-facil"><label>Rua e número</label><input name="street" value="${esc(a.street)}" required></div>
      <div class="field-facil"><label>Bairro</label><input name="neighborhood" value="${esc(a.neighborhood)}" required></div>
      <button type="submit" class="btn-big btn-big-primary btn-big-block">Continuar <i class="fas fa-arrow-right"></i></button>
    </form>
  `;
}

function renderPagamento() {
  if (state.cart.items.length === 0) return renderCarrinho();
  const PAY = [{ id: 'dinheiro', label: 'Dinheiro', icon: 'fa-money-bill-wave' }, { id: 'pix', label: 'Pix', icon: 'fa-qrcode' }, { id: 'cartao', label: 'Cartão na entrega', icon: 'fa-credit-card' }];
  return `
    <button class="btn-back-facil" onclick="go('entrega')"><i class="fas fa-arrow-left"></i> Voltar</button>
    <h1 class="page-title-facil">Como você quer pagar?</h1>
    ${PAY.map(p => `
      <button class="pay-option ${state.payment === p.id ? 'active' : ''}" onclick="selectPayment('${p.id}')">
        <i class="fas ${p.icon}"></i><span>${p.label}</span>
        ${state.payment === p.id ? '<i class="fas fa-check-circle check-icon"></i>' : ''}
      </button>`).join('')}
    ${state.payment === 'dinheiro' ? `
      <div class="change-box">
        <p class="change-title">Precisa de troco?</p>
        <div class="change-row">
          <button class="city-btn ${state.needsChange === 'nao' ? 'active' : ''}" onclick="setChange('nao')"><i class="fas fa-check"></i> Não</button>
          <button class="city-btn ${state.needsChange === 'sim' ? 'active' : ''}" onclick="setChange('sim')"><i class="fas fa-coins"></i> Sim</button>
        </div>
        ${state.needsChange === 'sim' ? `<div class="field-facil" style="margin-top:16px; margin-bottom:0;"><label>Troco para quanto? (R$)</label><input type="text" value="${esc(state.changeFor)}" oninput="updateChangeFor(this.value)"></div>` : ''}
      </div>` : ''}
    <div class="total-bar"><span>Total</span><strong>R$ ${money(cartTotal())}</strong></div>
    <button class="btn-big btn-big-primary btn-big-block" onclick="confirmarPedido()"><i class="fas fa-check"></i> Confirmar pedido</button>
  `;
}

function renderCadastrar() {
  return `
    <button class="btn-back-facil" onclick="go('inicio')"><i class="fas fa-arrow-left"></i> Voltar</button>
    <h1 class="page-title-facil">Cadastrar Restaurante</h1>
    <form onsubmit="salvarRestaurante(event)">
      <div class="field-facil">
        <label>Nome do Restaurante</label>
        <input name="name" required placeholder="Ex: Burger do Zé">
      </div>
      <div class="field-facil">
        <label>Categoria</label>
        <select name="category_id" required style="width:100%; padding:14px; border:1px solid var(--border); border-radius:10px; font-size:15px;">
          <option value="">Selecione...</option>
          ${state.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field-facil">
        <label>Taxa de Entrega (R$)</label>
        <input name="delivery_fee" type="number" step="0.01" value="0.00" required>
      </div>
      
      <div class="field-facil">
        <label>Localização no Mapa (Clique para marcar)</label>
        <!-- Container do Mapa -->
        <div id="map-picker" style="height: 250px; border-radius: 12px; margin-bottom: 10px; z-index: 1;"></div>
        
        <div style="display: flex; gap: 15px;">
          <div class="field-facil" style="flex: 1; margin-bottom: 0;">
            <label>Latitude</label>
            <input name="lat" id="input-lat" type="text" readonly style="background: #f0f0f0; cursor: not-allowed;">
          </div>
          <div class="field-facil" style="flex: 1; margin-bottom: 0;">
            <label>Longitude</label>
            <input name="lng" id="input-lng" type="text" readonly style="background: #f0f0f0; cursor: not-allowed;">
          </div>
        </div>
      </div>

      <button type="submit" class="btn-big btn-big-primary btn-big-block" style="margin-top:20px;">Salvar Restaurante</button>
    </form>
  `;
}

// Inicializa o mapa do Leaflet restrito a PR e SC
function initMapPicker() {
  // Se o mapa já existe, remove para não dar erro ao abrir a tela de novo
  if (mapPicker) {
    mapPicker.remove();
    mapPicker = null;
    mapMarker = null;
  }

  // Ponto inicial (Região central entre PR e SC - ex: Mafra/SC)
  const latInicial = -26.2333;
  const lngInicial = -51.0833;

  // Definindo os limites geográficos (Bounding Box) do PR e SC
  // Norte do PR (~-22.5), Sul de SC (~-29.5), Oeste (~-54.5), Leste (~-47.0)
  const limitesPRSC = L.latLngBounds(
    L.latLng(-30.0, -54.5), // Canto Sudoeste
    L.latLng(-22.0, -47.0)  // Canto Nordeste
  );

  // Cria o mapa já com as travas
  mapPicker = L.map('map-picker', {
    maxBounds: limitesPRSC,        // Trava o arraste
    maxBoundsViscosity: 1.0,       // Deixa a trava "dura" (não deixa quicar ou sair)
    minZoom: 6                     // Impede de afastar muito o zoom (ver o Brasil todo)
  }).setView([latInicial, lngInicial], 7); // Zoom inicial 7 enquadra os dois estados

  // Adiciona a camada visual (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapPicker);

  // Cria o pino arrastável
  mapMarker = L.marker([latInicial, lngInicial], { draggable: true }).addTo(mapPicker);

  // Atualiza os inputs de Latitude e Longitude
  const updateCoords = (lat, lng) => {
    document.getElementById('input-lat').value = lat.toFixed(6);
    document.getElementById('input-lng').value = lng.toFixed(6);
  };

  // Preenche os inputs logo ao abrir
  updateCoords(latInicial, lngInicial);

  // Evento: arrastar o pino
  mapMarker.on('dragend', function () {
    const position = mapMarker.getLatLng();
    updateCoords(position.lat, position.lng);
  });

  // Evento: clicar no mapa para mover o pino
  mapPicker.on('click', function (e) {
    mapMarker.setLatLng(e.latlng);
    updateCoords(e.latlng.lat, e.latlng.lng);
  });
}

// ============================================================
//  AÇÕES E LÓGICA DE ESTADO
// ============================================================
function setCuisine(id) { state.cuisine = id; render(); }
function openStore(id) { state.restaurantId = id; go('restaurante'); }

function submitEntrega(e) {
  e.preventDefault(); const f = e.target;
  const address = { name: f.name.value.trim(), phone: f.phone.value.trim(), street: f.street.value.trim(), neighborhood: f.neighborhood.value.trim() };
  if (!address.name || !address.phone || !address.street || !address.neighborhood) return toast('Preencha todos os campos', 'error');
  state.address = address; persistAddress(); go('pagamento');
}

function selectPayment(id) { state.payment = id; if (id !== 'dinheiro') { state.needsChange = null; state.changeFor = ''; } render(); }
function setChange(v) { state.needsChange = v; if (v === 'nao') state.changeFor = ''; render(); }
function updateChangeFor(v) { state.changeFor = v; }

function addToCart(storeId, itemId) {
  const store = state.stores.find(s => s.id === storeId); if (!store) return;
  if (state.cart.rid !== storeId) state.cart = { rid: storeId, rname: store.name, items: [] };
  const item = store.menu_items.find(m => m.id === itemId); if (!item) return;
  const existing = state.cart.items.find(i => i.id === itemId);
  if (existing) existing.qty++; else state.cart.items.push({ id: item.id, name: item.name, price: Number(item.price) || 0, qty: 1 });
  persistCart(); toast('Adicionado ao carrinho'); render();
}

function changeQty(itemId, delta) {
  const item = state.cart.items.find(i => i.id === itemId); if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart.items = state.cart.items.filter(i => i.id !== itemId);
  if (state.cart.items.length === 0) state.cart = { rid: null, rname: null, items: [] };
  persistCart(); render();
}

function confirmarPedido() {
  if (!state.payment) return toast('Escolha como vai pagar', 'error');
  if (state.payment === 'dinheiro' && state.needsChange === null) return toast('Responda se precisa de troco', 'error');
  const change = state.payment === 'dinheiro' && state.needsChange === 'sim' ? parseFloat(state.changeFor.replace(',', '.')) || 0 : null;
  if (state.payment === 'dinheiro' && state.needsChange === 'sim' && change <= 0) return toast('Digite para quanto precisa de troco', 'error');
  const PAY_LABEL = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão na entrega' };

  state.order = {
    id: 'FC' + Math.floor(1000 + Math.random() * 9000),
    restaurantName: state.cart.rname,
    items: state.cart.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    total: cartTotal(), address: { ...state.address }, payment: PAY_LABEL[state.payment], changeFor: change, createdAt: Date.now(),
  };
  save('fc-order', state.order);
  state.cart = { rid: null, rname: null, items: [] }; persistCart();
  go('pedido');
}

async function salvarRestaurante(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const category_id = parseInt(form.category_id.value);
  const delivery_fee = parseFloat(form.delivery_fee.value);
  const lat = parseFloat(form.lat.value);
  const lng = parseFloat(form.lng.value);

  if (!name || !category_id || isNaN(lat) || isNaN(lng)) return toast('Selecione o local no mapa', 'error');

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  const { error } = await sb.from(APP.tables.stores).insert({
    name,
    category_id,
    delivery_fee,
    owner_id: state.user.id,
    location: `SRID=4326;POINT(${lng} ${lat})` // Envia o ponto geográfico para o PostGIS
  });

  if (error) {
    console.error('Erro ao cadastrar:', error);
    let msg = error.message;
    if (error.code === '42501') msg = 'Permissão negada. O professor precisa liberar o INSERT na tabela stores.';
    toast('Erro: ' + msg, 'error');
    btn.disabled = false; btn.innerHTML = 'Salvar Restaurante';
    return;
  }

  toast('Restaurante cadastrado com sucesso!', 'success');
  await refreshData(); 
  go('inicio');
}

// ============================================================
//  SIDEBAR E TIMELINE
// ============================================================
const STEPS = [{ label: 'Recebido', desc: 'O restaurante recebeu seu pedido', icon: 'fa-inbox', at: 0 }, { label: 'Preparando', desc: 'Estão fazendo sua comida', icon: 'fa-utensils', at: 12 }, { label: 'Saiu para entrega', desc: 'O entregador está a caminho', icon: 'fa-motorcycle', at: 30 }, { label: 'Entregue', desc: 'Bom apetite!', icon: 'fa-check', at: 60 }];
function currentStep(order) { const sec = (Date.now() - order.createdAt) / 1000; let step = 0; STEPS.forEach((s, i) => { if (sec >= s.at) step = i; }); return step; }

function renderPedido() {
  if (!state.order) return `<button class="btn-back-facil" onclick="go('inicio')"><i class="fas fa-arrow-left"></i> Voltar</button><h1 class="page-title-facil">Meu pedido</h1><div class="empty-box"><i class="fas fa-receipt"></i><p>Você ainda não fez um pedido.</p><button class="btn-big btn-big-primary btn-big-block" onclick="go('inicio')">Ver restaurantes</button></div>`;
  const o = state.order; const step = currentStep(o); const finished = step === STEPS.length - 1;
  return `
    <button class="btn-back-facil" onclick="go('inicio')"><i class="fas fa-arrow-left"></i> Início</button>
    <h1 class="page-title-facil">Acompanhe seu pedido</h1>
    <p class="muted" style="margin-bottom:16px;">Pedido ${o.id} · ${esc(o.restaurantName)}</p>
    <div class="timeline-facil">
      ${STEPS.map((s, i) => {
        const done = i < step; const cur = i === step;
        return `<div>
          <div class="timeline-step-facil ${done ? 'done' : ''} ${cur ? 'current' : ''}">
            <div class="step-dot"><i class="fas ${done ? 'fa-check' : s.icon}"></i></div>
            <div class="step-text"><strong>${s.label}</strong><span>${s.desc}</span></div>
          </div>
          ${i < STEPS.length - 1 ? `<div class="step-line ${done ? 'done' : ''}"></div>` : ''}
        </div>`;
      }).join('')}
    </div>
    ${finished ? `<div class="success-box"><i class="fas fa-check-circle"></i><span>Pedido entregue. Bom apetite!</span></div>` : ''}
    <h2 class="section-title-lg">Resumo</h2>
    ${o.items.map(i => `<div class="summary-row"><span>${i.qty}× ${esc(i.name)}</span><strong>R$ ${money(i.price * i.qty)}</strong></div>`).join('')}
    <div class="summary-row summary-total"><span>Total</span><strong>R$ ${money(o.total)}</strong></div>
    <div class="summary-meta"><div>Pagamento: ${esc(o.payment)}</div>${o.changeFor ? `<div>Troco para R$ ${money(o.changeFor)}</div>` : ''}<div>Entrega em: ${esc(o.address.street)}</div></div>
    ${finished ? `<button class="btn-big btn-big-primary btn-big-block" style="margin-top:24px;" onclick="novoPedido()"><i class="fas fa-redo"></i> Fazer outro pedido</button>` : ''}
  `;
}

function novoPedido() { state.order = null; localStorage.removeItem('fc-order'); go('inicio', { cuisine: null }); }

function renderSidebar() {
  const profileSection = state.profile ? `<div class="sidebar-section"><h3 class="sidebar-title">Meu perfil</h3><div style="display:flex;align-items:center;gap:12px;"><img src="${avatarUrl(state.user?.id, state.avatarBust)}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(state.profile.full_name || 'C')}&background=ff5a36&color=fff'" style="width:48px;height:48px;border-radius:50%;object-fit:cover;"><div style="flex:1;"><div style="font-weight:600;">${esc(state.profile.full_name)}</div><div class="muted-small">${esc(state.user?.email)}</div></div></div></div>` : '';

  if (state.view === 'pedido' && state.order) {
    const step = currentStep(state.order); const s = STEPS[step];
    return profileSection + `<div class="sidebar-section"><h3 class="sidebar-title">Pedido atual</h3><p class="sidebar-sub">${esc(state.order.restaurantName)}</p><div class="sidebar-status"><i class="fas ${s.icon}"></i><strong>${s.label}</strong></div><p class="sidebar-hint">${s.desc}</p></div>`;
  }

  const count = cartCount(); const total = cartTotal();
  if (count === 0) return profileSection + `<div class="sidebar-section"><h3 class="sidebar-title">Seu carrinho</h3><p class="sidebar-sub">Ainda está vazio.</p><button class="btn-big btn-big-primary btn-big-block" style="margin-top:16px;" onclick="go('inicio')">Escolher comida</button></div>`;

  return profileSection + `<div class="sidebar-section"><h3 class="sidebar-title">Seu carrinho</h3><p class="sidebar-sub">${esc(state.cart.rname)}</p><div class="sidebar-items">${state.cart.items.map(i => `<div class="sidebar-item"><span>${i.qty}× ${esc(i.name)}</span><strong>R$ ${money(i.price * i.qty)}</strong></div>`).join('')}</div><div class="sidebar-total"><span>Total</span><strong>R$ ${money(total)}</strong></div><button class="btn-big btn-big-primary btn-big-block" style="margin-top:16px;" onclick="go('carrinho')">Ver carrinho <i class="fas fa-arrow-right"></i></button></div>`;
}