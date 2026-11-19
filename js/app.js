/* ============================================================
   FoodCritic Fácil — app.js
   App de delivery (SPA com rotas por hash: #inicio, #restaurante/3 …)

   Organização:
     1. Constantes        5. Telas (views)
     2. Estado            6. Ações (carrinho, pedido, loja)
     3. Dados (Supabase)  7. Mapa (Leaflet sob demanda)
     4. Roteador          8. Eventos globais + init
   ============================================================ */
(() => {
  'use strict';

  /* ==========================================================
     1. CONSTANTES
     ========================================================== */
  const T = APP.tables;
  const KEYS = { cart: 'fc-cart', address: 'fc-address', order: 'fc-order' };

  const VIEW_TITLES = {
    inicio: 'Início', restaurante: 'Restaurante', carrinho: 'Carrinho',
    entrega: 'Entrega', pagamento: 'Pagamento', pedido: 'Meu pedido', cadastrar: 'Nova loja',
  };
  // qual item do menu fica aceso em cada tela
  const NAV_OF = {
    inicio: 'inicio', restaurante: 'inicio', carrinho: 'carrinho',
    entrega: 'carrinho', pagamento: 'carrinho', pedido: 'pedido', cadastrar: 'cadastrar',
  };
  const FORM_VIEWS = new Set(['entrega', 'cadastrar']);   // telas que nunca re-renderizam sozinhas

  const CHECKOUT = [['carrinho', 'Carrinho'], ['entrega', 'Entrega'], ['pagamento', 'Pagamento']];

  const PAYMENTS = [
    { id: 'dinheiro', label: 'Dinheiro',          icon: 'fa-money-bill-wave' },
    { id: 'pix',      label: 'Pix',               icon: 'fa-qrcode' },
    { id: 'cartao',   label: 'Cartão na entrega', icon: 'fa-credit-card' },
  ];

  // `at` = segundos desde o pedido (simulação)
  const STEPS = [
    { label: 'Recebido',          desc: 'O restaurante recebeu seu pedido', icon: 'fa-inbox',      at: 0 },
    { label: 'Preparando',        desc: 'Estão fazendo sua comida',         icon: 'fa-utensils',   at: 12 },
    { label: 'Saiu para entrega', desc: 'O entregador está a caminho',      icon: 'fa-motorcycle', at: 30 },
    { label: 'Entregue',          desc: 'Bom apetite!',                     icon: 'fa-check',      at: 60 },
  ];

  // Mapa restrito ao PR e SC (ponto inicial: região de União da Vitória / Porto União)
  const MAP = {
    start: [-26.2333, -51.0833],
    bounds: [[-30.0, -54.5], [-22.0, -47.0]],
    css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    js:  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  };

  /* ==========================================================
     2. ESTADO
     ========================================================== */
  const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const save = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado / cota */ } };

  const emptyCart     = () => ({ rid: null, rname: null, items: [] });
  const normalizeCart = c  => (c && Array.isArray(c.items) && c.items.length ? c : emptyCart());

  const state = {
    view: 'inicio',
    loading: true,
    loadError: false,
    categories: [],
    stores: [],
    cuisine: null,
    search: '',
    user: null,
    profile: null,
    avatarBust: 0,
    restaurantId: null,
    cart: normalizeCart(load(KEYS.cart)),
    address: { name: '', phone: '', street: '', neighborhood: '', ...load(KEYS.address, {}) },
    payment: null,
    needsChange: null,
    changeFor: '',
    order: load(KEYS.order, null),
    ticker: null,
    lastStep: null,
    editingName: false,
  };

  const same        = (a, b) => String(a) === String(b);
  const findStore   = id => state.stores.find(s => same(s.id, id));
  const cartCount   = () => state.cart.items.reduce((s, i) => s + i.qty, 0);
  const cartTotal   = () => state.cart.items.reduce((s, i) => s + i.qty * i.price, 0);
  const qtyOf       = id => state.cart.items.find(i => same(i.id, id))?.qty || 0;
  const persistCart = () => save(KEYS.cart, state.cart);

  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function visibleStores() {
    const q = norm(state.search.trim());
    return state.stores.filter(s => {
      if (state.cuisine !== null && s.category_id !== state.cuisine) return false;
      if (!q) return true;
      return norm(s.name).includes(q)
          || norm(s.categories?.name).includes(q)
          || (s.menu_items || []).some(m => norm(m.name).includes(q));   // acha restaurante pelo prato
    });
  }

  /* ==========================================================
     3. DADOS (Supabase)
     ========================================================== */
  async function loadProfile() {
    const fallback = { id: state.user.id, full_name: (state.user.email || 'cliente').split('@')[0], role: 'user' };
    try {
      const { data } = await sb.from(T.profiles).select('id, full_name, role').eq('id', state.user.id).maybeSingle();
      state.profile = data || fallback;
    } catch { state.profile = fallback; }
  }

  async function fetchStores() {
    let res = await sb.from(T.stores).select('*, categories(id, name), menu_items(*)').order('name');
    if (res.error) res = await sb.from(T.stores).select('*, menu_items(*)').order('name');   // sem a relação categories
    return res;
  }


  /* ---------- Fotos do bucket img_comidas (raiz pública) ---------- */
  const FOOD_FILES = [
    "aloe-vera-gel-with-fresh-aloe-leaves-KzWjVQySAmllaNBRzxQGP.webp",
    "artisan-latte-with-beautiful-foam-design-h_-Z5xTfHhypxqR83A_Ft.webp",
    "burger-melting-cheddar-i60rExerJeF9QCLA2iKLv.webp",
    "burger-with-french-fries-aerial-NsNBZ08kfI3JC57Ly66Iy.webp",
    "burger-with-melted-cheese-m-Y1i3jpYYJZYfOEfX5dX.webp",
    "colorado-burger-with-fries-prepared-food-dish-600nw-1656957151.jpg",
    "colorful-berry-smoothie-bowl-with-nuts-and-seeds-YCzdLJ0SnTTOdNpH8x5_I.webp",
    "colorful-bowl-of-deliciousness-with-fried-egg-RaPUELLHgqFnS9zI85BpU.webp",
    "colorful-breakfast-spread-on-a-rustic-plate-VGbHfppD0Pq-q4gtkxTDo.webp",
    "colorful-fresh-salad-with-citrus-and-seeds-zCqMgNzj6oqBD5H8-CDz4.webp",
    "colorful-fresh-vegetable-salad-arrangement-P_mOkVjd_sGYfvcqnZMRJ.webp",
    "colorful-fruit-smoothies-for-summer-refreshment-8gWrYkBGGmn19p0a2w_Ll.webp",
    "colorful-healthy-lifestyle-flat-lay-8utUUqZdv2ImYZ6llJtb8.webp",
    "colorful-taco-platter-with-eggs-and-sides-Y4kfLTjbX4vbz7JiavtRa.webp",
    "colorful-vegan-tacos-with-fresh-vegetables-Kui0bdsP4mcr2tZsnFH6O.webp",
    "cozy-pasta-dinner-table-setting-suSfVDWWoxnLC8V3D7YXR.webp",
    "creamy-key-lime-pie-with-whipped-topping-A0OluUFnzKzs0LYUJjIsp.webp",
    "creamy-lime-ice-cream-with-fresh-mint-Y8HOWcrgrt2IwLHjKzvZt.webp",
    "creamy-rigatoni-with-savory-toppings-IXCieiesXCexwTWB0BjHf.webp",
    "crispy-fried-chicken-in-white-cup-bTf6UOAo_WjCxkQUHb5Xd.webp",
    "crispy-fried-chicken-with-french-fries-h6BjaK51iOtPss3k3lq-n.webp",
    "crispy-fried-chicken-with-french-fries-SyM0c9HqKU2MrTD1ocea3.webp",
    "crusty-artisan-bread-with-soft-interior-HRsTwZ6s-kUYkGVn98yWF.webp",
    "decadent-chocolate-almond-ice-cream-bars-oAbkyd2T8zigH-mSyoUaU.webp",
    "delicious-asian-rice-balls-with-fresh-toppings-ONoZvK0abTj3Sg6svTE3d.webp",
    "delicious-asian-rice-balls-with-fresh-vegetables-9z7qTX7cjE8YR91h2qOdp.webp",
    "delicious-assortment-of-gourmet-pizzas-nPD2qE5lQy7ExIN9HzFPs.webp",
    "delicious-beef-and-mushroom-burrito-recipe-6jv3OqhZxC8KEc1ilVacS.webp",
    "delicious-beef-burrito-with-salsa-and-drink-zDPpYw7XRuLY1x4sILfoY.webp",
    "delicious-beef-tacos-with-fresh-toppings-QM6_VhlkKFezuAWHmzR6_.webp",
    "delicious-beef-wrap-with-fries-ubL3LXUUJ6uRiX0Cyocga.webp",
    "delicious-cheeseburger-with-fresh-ingredients-mhyMAZcPwh3jCBnVSN-mC.webp",
    "delicious-cheesy-beef-sandwich-8VIA_mkcHkt4sVX3zBfN4.webp",
    "delicious-chicken-biryani-with-spices-ttOXSDRnjSK0cLqGqYusk.webp",
    "delicious-chinese-sweet-and-sour-chicken-takeout-bALtp1ZUcEfoQpNt_CMBl.webp",
    "delicious-corn-dog-with-ketchup-and-mustard-Hbnc4fmtRPrRtWxSj4Hj3.webp",
    "delicious-falafel-wrap-with-fresh-vegetables-1ixg85krqV0l6uCR0Be6t.webp",
    "delicious-golden-fries-with-seasoning-q0JI_IfNKMTY2Ok4Pzk1s.webp",
    "delicious-grilled-chicken-pita-sandwich-UOWH55zkCH8ZQYwyHUXO1.webp",
    "delicious-grilled-chicken-tacos-with-lime-RCtUrlWQqUhwhpE5xDrFc.webp",
    "delicious-grilled-steak-plate-with-fresh-sides-q84Uo-EgywaEAKuFhKohk.webp",
    "delicious-grilled-steak-with-guacamole-and-tortill-3gOeA8vfxzqRagSuW2Phu.webp",
    "delicious-grilled-steak-wrap-with-french-fries-uaBXlUEc9MdVp95zM2VZ0.webp",
    "delicious-homemade-cheesecake-with-powdered-sugar-EnXw2PLhxjmVF6gzMDvax.webp",
    "delicious-honey-in-a-jar-Vn5LowfAOe_92n7mwm2EQ.webp",
    "delicious-ice-cream-treats-for-summer-fun-TPUfCK0mTdfFwkTjXct6g.webp",
    "delicious-margherita-pizza-with-basil-yqA8Q6yB5dhZBQ1DfKSZJ.webp",
    "delicious-margherita-pizza-with-fresh-basil-iZApxmTx5U1JjWjG0wmnr.webp",
    "delicious-margherita-pizza-with-fresh-basil-r9JLUg4YtY2Cc1k5Ro4WM.webp",
    "delicious-mediterranean-grilled-steak-plate-CV3FJRgS3BYacGADluF5u.webp",
    "delicious-mexican-street-corn-treats-0Yo4DQcKf_GSrl1W5SZIg.webp",
    "delicious-pepperoni-pizza-with-fresh-basil-UN0kdaG6InpPU4p1k25em.webp",
    "delicious-ramen-bowl-with-dumplings-and-kimchi-XpWioAnbGUeFI0t6HmdcV.webp",
    "delicious-salmon-poke-bowl-with-fresh-vegetables-1P8mt-e4IGx6p2evZbhDo.webp",
    "delicious-soy-sauce-noodles-nqdJ5JfsT4KCeqG7xV9_B.webp",
    "delicious-spiced-french-fries-FXUxCyokQAqw-omFeOftu.webp",
    "delicious-steaming-noodles-for-any-meal-ghcNJGl6MWqqMQuZaMMa_.webp",
    "delicious-strawberry-jam-on-bread-1iV5KXFEA8ELXLpu7tOtD.webp",
    "delicious-strawberry-jam-toast-blzqiE4LhwpjSpOLpp35p.webp",
    "delicious-sweet-rice-balls-with-coconut-PpnPB6my0idA-zVJKc6P7.webp",
    "delicious-toast-with-homemade-jam-F8YhvP0AE8cHfSrXPI-PG.webp",
    "delicious-tuna-poke-bowl-recipe-kr3t6KyMh3lDBDsptaozp.webp",
    "deliciously-sweet-hindi-rasgulla-treats-QJoA8S7bO4AiwjqqV_yfe.webp",
    "festive-chocolate-yule-log-cake-with-whipped-cream-qrD7L-8GbgGwBGUFjYEjQ.webp",
    "flavorful-tacos-with-guacamole-and-beer-MOs9231xiq8eQzaQiI40B.webp",
    "flavorful-tacos-with-savory-pulled-meat-srPveHvD0trdJYoVHysG_.webp",
    "fluffy-pancakes-with-fresh-fruit-and-muffins-7ISkGdNOJwwPXzDepEf1B.webp",
    "fresh-and-juicy-assortment-of-colorful-fruits-35tz5ZjOHl0v6cMxrXlrG.webp",
    "fresh-and-juicy-strawberries-on-a-white-plate-2P5GMWVFelDpthCxI0BP_.webp",
    "fresh-and-vibrant-fruit-salad-delight-e05J_gOgvgkATGrmrAWw3.webp",
    "fresh-avocado-and-tomato-salad-delight-q8NiK68AtVCQTcWc3BIV-.webp",
    "fresh-avocado-salad-with-cherry-tomatoes-1Tiq89REig9FZLHDkRO-O.webp",
    "fresh-berry-medley-of-strawberries-raspberries-and-blueberries-_w-M8b88zwtUbRdeBzT9X.webp",
    "fresh-blueberries-and-strawberries-in-bowls-WKtG_5F6Bsc85owc9uVh2.webp",
    "fresh-colorful-potatoes-at-local-market-gKhY60pofZ6bP2zar2DLt.webp",
    "fresh-herbal-tea-in-white-cup-9CmBpbLvhJRg2x8hPiFdI.webp",
    "fresh-mixed-berries-in-white-bowl-xfwphg5Iyb74JlYFQFidb.webp",
    "fresh-organic-mango-on-pink-background-_VlUU--fy5om-Tkb1q-Pr.webp",
    "fresh-ripe-peach-with-water-droplets-2E49lvPlZk06hUuZjKF7s.webp",
    "fresh-tacos-being-assembled-in-busy-kitchen-gq1fmUmm6BrdZzTjVnCB7.webp",
    "fresh-vegan-salad-with-avocado-and-nuts-kg6HzHSFzhZLl5uEUNVn6.webp",
    "freshly-baked-artisan-bread-slice-wo9OC4gaMgWq_o5n7dmL2.webp",
    "freshly-baked-crusty-bread-halves-WWCCNDb269p9F6oCV-NYy.webp",
    "golden-toast-stacked-on-neutral-background-odNWzvFC6lLTYU1_WVgxF.webp",
    "gourmet-burger-being-assembled-at-street-food-stall-BmjCQehyc3WN2fDRN4Zb4.webp",
    "grilled-meat-wrap-with-fresh-vegetables-bsf-WCWE_0Aoeu9qf5Jqa.webp",
    "grilled-steak-tacos-with-fresh-salsa-and-lime-FCXCm0WaUjZ62TOLUuQQO.webp",
    "grilled-steak-with-lime-and-grilled-vegetables-MkuSG3nJxrjooAVdQEYrE.webp",
    "healthy-salmon-bowl-with-fresh-vegetables-i5a6L5YwDw7wfEu2zXlqY.webp",
    "heart-shaped-bread-slices-on-wooden-board-Ylnij8e6uO9aUvoy2qeiv.webp",
    "hearty-beef-stew-with-vegetables-jMmIOwTk5ZBpfP5YUYonm.webp",
    "indulgent-chocolate-topped-raspberry-ice-cream-IBBJYWJe82JQdTI2ag_64.webp",
    "juicy-beef-burger-with-cheese-and-bacon-xq4zrSo1JiYM6AOo8SUoI.webp",
    "juicy-cheeseburger-5uNrwj9W_yiI-AAleYCvk.webp",
    "juicy-fresh-peaches-with-water-droplets-in-basket-io0M-QXbhSz0GWH5pRK96.webp",
    "juicy-peach-with-vibrant-skin-against-pink-background-fxM8DVv1vFDaLvf5QSbTm.webp",
    "lemon-cut-in-half-0PQ65zy161ISvXke2sjbr.webp",
    "meatballs-5iRujh_Y3tj-gxNYVCJX-.webp",
    "mediterranean-chicken-platter-with-salad-and-dips-J7Djm55YhhQmnwsTWwd9I.webp",
    "pouring-honey-on-pancakes-5YhNE_xzfAKhgeZSA-uH_.webp",
    "raspberry-topped-cheesecake-slice-SnMvPME-KX7YE1drQ9rbm.webp",
    "red-apples-XKMKA5-m51I_9QBzwMTZl.webp",
    "refreshing-drinks-and-snacks-arrangement-M2Z8OQkNtEHzZuOLDMPqg.webp",
    "refreshing-ginger-lemonade-cocktail-gTkj91hB_5LJFn5rPycc8.webp",
    "refreshing-lemon-herb-soup-with-fresh-vegetables-7tSQfFOIcqaGQrp9MDpnQ.webp",
    "refreshing-orange-popsicle-delight-YHLeGRFJAyLWmUH2XY6g-.webp",
    "refreshing-sliced-cucumbers-in-water-splash-O_ns6dj4yIVaItfpPeiQ1.webp",
    "rustic-summer-barbecue-feast-on-wooden-table-ttZZDoRGvM2_JHKKcESl7.webp",
    "salmon-nigiri-ABaYsyEp9jOg3gMprd2rO.webp",
    "savory-kimchi-stir-fry-in-a-wok-2JjXhvX0KwfIpGHTKvhyI.webp",
    "savory-taco-with-fresh-toppings-in-basket-NEJwWhqNYllTbkqrfBugJ.webp",
    "sesame-bagels-with-tea-in-cozy-setting-KLcdiF7OEOCXV0MPpkz2O.webp",
    "slice-of-pizza-salami-x3-zav_wuUj5p3iaCDAqi.webp",
    "smoky-sweet-potato-tacos-with-black-beans-FNo26F63pek6vkDMhlFHP.webp",
    "spicy-corn-and-veggie-pizza-with-fresh-ingredients-QXPPD__RSXdTgZB8mzNXu.webp",
    "steaming-coffee-cups-on-a-white-background-DFvBZRaVJoToQhIvnVA8B.webp",
    "steaming-hot-coffee-in-clear-glass-mug-ZElb_3k9SqqiYFfqUYyOC.webp",
    "strawberry-layer-cake-with-whipped-cream-SdLpn6pcdSC93E27Uxmih.webp",
    "succulent-pork-belly-with-red-wine-pairing-ymzW82TPvrbL675AgBrbU.webp",
    "tasty-beef-tacos-with-fresh-toppings-sfk20YJSzdOg87oVxmP2p.webp",
    "unique-red-apple-with-geometric-design-TfCJRpUaNcdZ_xw0wHkSn.webp",
    "vibrant-fresh-fruits-and-vegetables-arrangement-DCC0D2_pGZwfsm9WDqqdK.webp",
    "vibrant-fruit-platter-with-kiwi-and-berries-YH64nub0z7xA8e3WD1Kl5.webp",
    "vibrant-mango-and-passion-fruit-composition-Ur4iQ0djAqqlVoXNZb6fZ.webp",
    "vibrant-mixed-vegetable-salad-with-fresh-greens-IO1GR395FHePny_s88ISw.webp",
    "yellow-tomato-slices-salad-vegetables-natural-product-ingredient-organic-healthy-600nw-1793438050.jpg",
  ];

  const FOOD_POOLS = {
    burger: /burger|cheeseburger|corn-dog/,
    fries: /fries/,
    pizza: /pizza/,
    japanese: /nigiri|poke|ramen|noodle|dumpling|rice-ball|sweet-and-sour|soy-sauce|kimchi/,
    meat: /steak|meatball|stew|pork-belly|barbecue|biryani|pasta|rigatoni/,
    chicken: /chicken|falafel/,
    mexican: /taco|burrito|street-corn/,
    salad: /salad|avocado|vegetable|cucumber|healthy-lifestyle/,
    fruit: /fruit|berry|strawberr|mango|peach|apple|smoothie|blueberry/,
    sweet: /cake|cheesecake|ice-cream|pie|jam|honey|pancake|popsicle|rasgulla|yule|chocolate/,
    bakery: /bread|toast|bagel/,
    drink: /coffee|latte|lemonade|tea|drink/,
    sandwich: /sandwich|pita|wrap/,
  };

  const bucketImg = name => `${APP.url}/storage/v1/object/public/${APP.buckets.images}/${encodeURIComponent(name)}`;

  function filesInPool(key) {
    const re = FOOD_POOLS[key];
    const list = re ? FOOD_FILES.filter(f => re.test(f)) : [];
    return list.length ? list : FOOD_FILES;
  }

  function poolKeyFor(text, categoryId) {
    const n = String(text || '').toLowerCase();
    if (/batata|frita|fries/.test(n)) return 'fries';
    if (/pizza|calabresa|margherita|pepperoni/.test(n)) return 'pizza';
    if (/sushi|sashimi|combinado|nigiri|temaki|japon|lamen|ramen/.test(n)) return 'japanese';
    if (/poke/.test(n)) return 'japanese';
    if (/bolo|brownie|bombom|macaron|doce|sonho|chineque|churro|rocambole|nutella|sobremesa|torta|sorvete/.test(n)) return 'sweet';
    if (/marmita|bife|espet|matambre|carne|churrasco|feijoada/.test(n)) return 'meat';
    if (/salada|saud[aá]vel|vegano|fit/.test(n)) return 'salad';
    if (/sandu|pastel|wrap|pita/.test(n)) return 'sandwich';
    if (/frango|chicken/.test(n)) return 'chicken';
    if (/taco|burrito|mexica/.test(n)) return 'mexican';
    if (/burger|hamb|amburg|podr|lanche|x-/.test(n)) return 'burger';
    if (/padaria|p[aã]o/.test(n)) return 'bakery';
    if (/caf[eé]|suco|drink/.test(n)) return 'drink';
    const byCat = { 1: 'burger', 2: 'pizza', 3: 'japanese', 4: 'meat', 5: 'salad', 6: 'sweet' };
    return byCat[Number(categoryId)] || 'burger';
  }

  function takeFoodPhoto(poolKey, salt, used) {
    const pool = filesInPool(poolKey);
    const start = Math.abs(Number(salt) || 0) % pool.length;
    for (let i = 0; i < pool.length; i++) {
      const file = pool[(start + i) % pool.length];
      if (!used.has(file)) {
        used.add(file);
        return bucketImg(file);
      }
    }
    return bucketImg(pool[start]);
  }

  function cleanFoodText(text) {
    return String(text || '')
      .replace(/\[\s*img\s*:\s*[^\]]*\]/gi, '')
      .replace(/\[IMG:https?:\/\/[^\]]+\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function withFoodPhotos(store) {
    const used = new Set();
    const catId = store.category_id;
    const name = cleanFoodText(store.name);
    const cover = takeFoodPhoto(poolKeyFor(`${name} ${store.categories?.name || ''}`, catId), store.id, used);
    const menu_items = (store.menu_items || []).map(m => {
      const mName = cleanFoodText(m.name);
      const mDesc = cleanFoodText(m.description);
      return {
        ...m,
        name: mName,
        description: mDesc,
        img: takeFoodPhoto(poolKeyFor(`${mName} ${mDesc}`, catId), (Number(m.id) || 0) + 97, used),
      };
    });
    return { ...store, name, cover, menu_items };
  }

  async function refreshData() {
    state.loadError = false;
    try {
      const [cats, stores] = await Promise.all([
        sb.from(T.categories).select('id, name').order('name'),
        fetchStores(),
      ]);
      state.categories = cats.error ? [] : (cats.data || []);
      if (stores.error) { state.loadError = true; return; }       // mantém a lista anterior, se houver
      state.stores = (stores.data || []).map(withFoodPhotos);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      state.loadError = true;
    }
  }

  /* ==========================================================
     4. ROTEADOR (hash) + RENDER
     ========================================================== */
  const parseHash = () => {
    const [v, id] = location.hash.replace(/^#\/?/, '').split('/');
    return { view: VIEW_TITLES[v] ? v : 'inicio', id: /^[\w-]+$/.test(id || '') ? id : null };
  };
  const hashOf = (view, id) => '#' + view + (id ? '/' + id : '');

  const scrollMemo = new Map();      // hash → scrollY (voltar devolve você ao mesmo ponto)
  let currentHash = '';

  function go(view, { id = null } = {}) {
    const target = hashOf(view, id);
    if (location.hash !== target) history.pushState(null, '', target);
    route({ fromGo: true });
  }

  function redirect(view, id = null) {
    history.replaceState(null, '', hashOf(view, id));
    route({ fromGo: true });
  }

  function route({ fromGo = false } = {}) {
    if (currentHash) scrollMemo.set(currentHash, window.scrollY);

    const { view, id } = parseHash();

    // guardas de fluxo
    if (view === 'cadastrar') return redirect('inicio');   // cadastro de loja oculto ao público
    if (view === 'restaurante' && !id) return redirect('inicio');
    if ((view === 'entrega' || view === 'pagamento') && !state.cart.items.length) return redirect('carrinho');

    currentHash = location.hash || '#inicio';
    state.view = view;
    if (view === 'restaurante') state.restaurantId = id;

    stopTicker();
    destroyMap();

    render({ enter: true });
    updateNav();
    document.title = `${view === 'restaurante' ? (findStore(id)?.name || VIEW_TITLES[view]) : VIEW_TITLES[view]} · FoodCritic Fácil`;
    window.scrollTo(0, fromGo ? 0 : (scrollMemo.get(currentHash) ?? 0));

    if (state.loading) return;
    if (view === 'cadastrar') initMapPicker();
    if (view === 'pedido') startTicker();
    $('view-content')?.querySelector('h1')?.focus({ preventScroll: true });   // leitor de tela anuncia a nova tela
  }

  function updateNav() {
    const active = NAV_OF[state.view] || 'inicio';
    document.querySelectorAll('.nav-btn[data-nav]').forEach(b => {
      const on = b.dataset.nav === active;
      b.classList.toggle('active', on);
      on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });
  }

  let lastCount = cartCount();
  function updateCartUI() {
    const n = cartCount();
    ['cart-badge-mobile', 'cart-badge-sidebar'].forEach(id => {
      const el = $(id); if (!el) return;
      el.textContent = n;
      el.hidden = n === 0;
      if (n > lastCount) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
    lastCount = n;

    // barra flutuante "ver carrinho" (só mobile, só ao navegar pelo cardápio)
    const bar = $('cart-bar');
    if (bar) {
      const show = n > 0 && !state.loading && (state.view === 'inicio' || state.view === 'restaurante');
      bar.hidden = !show;
      document.body.classList.toggle('has-cart-bar', show);
      if (show) {
        const total = `R$ ${money(cartTotal())}`;
        bar.querySelector('.cart-bar-count').textContent = n;
        bar.querySelector('.cart-bar-total').textContent = total;
        bar.setAttribute('aria-label', `Ver carrinho: ${n} ${n === 1 ? 'item' : 'itens'}, ${total}`);
      }
    }
  }

  function render({ enter = false } = {}) {
    const content = $('view-content');
    if (!content) return;

    if (state.loading) { content.innerHTML = skeleton(); updateCartUI(); return; }

    // telas com formulário não são reconstruídas sem navegação (não perder o que foi digitado)
    if (!enter && FORM_VIEWS.has(state.view)) { updateCartUI(); return; }

    const chipsLeft = enter ? 0 : (content.querySelector('.cat-chips')?.scrollLeft ?? 0);
    content.innerHTML = (VIEWS[state.view] || renderInicio)();
    const chips = content.querySelector('.cat-chips');
    if (chips) chips.scrollLeft = chipsLeft;

    if (enter) {                                   // reinicia a animação de entrada
      content.classList.remove('view-enter');
      void content.offsetWidth;
      content.classList.add('view-enter');
    }

    renderLeftProfile();
    updateCartUI();
  }

  /* ==========================================================
     5. TELAS (views)
     ========================================================== */
  const h1   = text => `<h1 class="page-title-facil" tabindex="-1">${text}</h1>`;
  const back = (to, label = 'Voltar', id = null) =>
    `<button type="button" class="btn-back-facil" data-go="${to}"${id ? ` data-id="${esc(id)}"` : ''}>
       <i class="fas fa-arrow-left" aria-hidden="true"></i> ${label}</button>`;

  const skeleton = () => `
    <div role="status" aria-label="Carregando">
      <div class="sk-line sk-short skeleton"></div>
      <div class="sk-line sk-title skeleton"></div>
      <div class="sk-chips"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
      <div class="rest-list">
        <div class="sk-card skeleton"></div><div class="sk-card skeleton"></div><div class="sk-card skeleton"></div>
      </div>
    </div>`;

  const emptyBox = (icon, text, btn = '') =>
    `<div class="empty-box"><i class="fas ${icon}" aria-hidden="true"></i><p>${text}</p>${btn}</div>`;

  /* ---------- Início ---------- */
  function renderInicio() {
    const { cuisine, categories, profile, search } = state;
    const first = (profile?.full_name || 'Cliente').trim().split(/\s+/)[0];

    return `
      <header class="facil-header">
        <div class="header-row">
          <p class="logo-small">FoodCritic Fácil</p>
          <button type="button" class="btn-account only-mobile" data-action="logout" aria-label="Sair da conta">
            <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
            <span>Sair</span>
          </button>
        </div>
        ${h1(`Olá, ${esc(first)}! O que você quer comer?`)}
      </header>

      <div class="search-bar-wrap is-sticky">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input type="search" id="search" class="search-bar" data-input="search" value="${esc(search)}"
               placeholder="Buscar restaurante ou prato" aria-label="Buscar restaurante ou prato"
               autocomplete="off" enterkeyhint="search">
      </div>

      <h2 class="section-title-lg">Categorias</h2>
      <div class="cat-chips" role="group" aria-label="Filtrar por categoria">
        <button type="button" class="chip ${cuisine === null ? 'active' : ''}" aria-pressed="${cuisine === null}"
                data-action="cuisine" data-id="">Todas</button>
        ${categories.map(c => `
          <button type="button" class="chip ${cuisine === c.id ? 'active' : ''}" aria-pressed="${cuisine === c.id}"
                  data-action="cuisine" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
      </div>

      <h2 class="section-title-lg">Restaurantes</h2>
      <div id="store-results" aria-live="polite">${storeResults()}</div>`;
  }

  function storeResults() {
    if (state.loadError && !state.stores.length) {
      return emptyBox('fa-wifi', 'Não foi possível carregar os restaurantes.',
        `<button type="button" class="btn-big btn-big-primary btn-big-block" data-action="reload">
           <i class="fas fa-rotate-right" aria-hidden="true"></i> Tentar de novo</button>`);
    }
    const list = visibleStores();
    if (!list.length) return `<p class="empty-inline">Nenhum restaurante encontrado.</p>`;
    return `<div class="rest-list">${list.map(storeCard).join('')}</div>`;
  }

  function storeCard(s) {
    const n = (s.menu_items || []).length;
    const free = s.delivery_fee == null || Number(s.delivery_fee) === 0;
    const catName = s.categories?.name || '';
    return `
      <a class="rest-card-facil" href="#restaurante/${esc(s.id)}" data-go="restaurante" data-id="${esc(s.id)}">
        <img src="${esc(s.cover)}" alt="" loading="lazy" decoding="async">
        <div class="rest-info">
          <h3>${esc(s.name)}</h3>
          ${catName ? `<p>${esc(catName)}</p>` : ''}
          <div class="rest-meta">
            <span><i class="fas fa-utensils" aria-hidden="true"></i> ${n} ${n === 1 ? 'item' : 'itens'} no cardápio</span>
            <span class="dot" aria-hidden="true"></span>
            <span class="${free ? 'fee-free' : 'fee-paid'}">🛵 ${free ? 'Grátis' : `R$ ${money(s.delivery_fee)}`}</span>
          </div>
        </div>
      </a>`;
  }

  /* ---------- Restaurante ---------- */
  function renderRestaurante() {
    const r = findStore(state.restaurantId);
    if (!r) return `${back('inicio')}<p class="empty-inline">Restaurante não encontrado.</p>`;

    const items = [...(r.menu_items || [])].sort((a, b) =>
      (b.is_available !== false) - (a.is_available !== false));      // esgotados vão para o fim

    return `
      ${back('inicio')}
      <img class="cover-img" src="${esc(r.cover)}" alt="" decoding="async">
      ${h1(esc(r.name))}
      ${r.categories?.name ? `<p class="muted">${esc(r.categories.name)}</p>` : ''}

      <h2 class="section-title-lg">Escolha seu prato</h2>
      ${items.length === 0 ? `<p class="empty-inline">Nenhum item cadastrado.</p>` : ''}
      ${items.map(d => dishCard(r, d)).join('')}`;
  }

  function dishCard(r, d) {
    const q = qtyOf(d.id);
    const available = d.is_available !== false;
    return `
      <div class="dish-card-facil ${available ? '' : 'unavailable'} ${q ? 'in-cart' : ''}">
        <img src="${esc(d.img)}" alt="" loading="lazy" decoding="async">
        <div class="dish-body-facil">
          <strong>${esc(d.name)} ${available ? '' : '(Esgotado)'}</strong>
          ${d.description ? `<p class="muted small dish-desc">${esc(d.description)}</p>` : ''}
          <span class="dish-price-facil">R$ ${money(d.price || 0)}</span>
          <div class="dish-actions-facil">
            ${q === 0
              ? `<button type="button" class="btn-big btn-big-primary btn-big-sm" data-action="add"
                         data-store="${esc(r.id)}" data-id="${esc(d.id)}" ${available ? '' : 'disabled'}>
                   <i class="fas fa-plus" aria-hidden="true"></i> Adicionar</button>`
              : qtyControl(d.id, q, d.name)}
          </div>
        </div>
      </div>`;
  }

  const qtyControl = (id, q, name) => `
    <div class="qty-control" role="group" aria-label="Quantidade de ${esc(name)}">
      <button type="button" data-action="qty" data-delta="-1" data-id="${esc(id)}" aria-label="Diminuir">−</button>
      <span data-qty-for="${esc(id)}" aria-live="polite">${q}</span>
      <button type="button" data-action="qty" data-delta="1" data-id="${esc(id)}" aria-label="Aumentar">+</button>
    </div>`;

  /* ---------- Etapas do checkout ---------- */
  function renderSteps(current) {
    const idx = CHECKOUT.findIndex(([id]) => id === current);
    return `
      <ol class="steps" aria-label="Etapas do pedido">
        ${CHECKOUT.map(([id, label], i) => `
          ${i ? '<li class="step-sep" aria-hidden="true"></li>' : ''}
          <li class="step-item ${i < idx ? 'done' : i === idx ? 'active' : ''}" ${i === idx ? 'aria-current="step"' : ''}>
            <span class="num">${i < idx ? '<i class="fas fa-check" aria-hidden="true"></i>' : i + 1}</span>
            <span>${label}</span>
          </li>`).join('')}
      </ol>`;
  }

  const totalBar = () => `<div class="total-bar"><span>Total</span><strong>R$ ${money(cartTotal())}</strong></div>`;

  /* ---------- Carrinho ---------- */
  function renderCarrinho() {
    if (!state.cart.items.length) {
      return `
        ${back('inicio')}
        ${h1('Meu carrinho')}
        ${emptyBox('fa-shopping-bag', 'Seu carrinho está vazio.',
          `<button type="button" class="btn-big btn-big-primary btn-big-block" data-go="inicio">
             <i class="fas fa-utensils" aria-hidden="true"></i> Ver restaurantes</button>`)}`;
    }
    return `
      ${back('restaurante', 'Voltar', state.cart.rid)}
      ${h1('Meu carrinho')}
      ${renderSteps('carrinho')}
      <p class="muted lead">${esc(state.cart.rname)}</p>
      ${state.cart.items.map(i => `
        <div class="cart-item-facil">
          <img class="cart-item-thumb" src="${esc(i.img || '')}" alt="" loading="lazy">
          <div class="cart-item-info"><strong>${esc(i.name)}</strong><span class="price">R$ ${money(i.price * i.qty)}</span></div>
          ${qtyControl(i.id, i.qty, i.name)}
        </div>`).join('')}
      ${totalBar()}
      <div class="sticky-cta">
        <button type="button" class="btn-big btn-big-primary btn-big-block" data-go="entrega">
          Continuar <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
      </div>`;
  }

  /* ---------- Entrega ---------- */
  function renderEntrega() {
    const a = state.address;
    return `
      ${back('carrinho')}
      ${h1('Onde vamos entregar?')}
      ${renderSteps('entrega')}
      <form data-form="entrega" autocomplete="on">
        <div class="field-facil"><label for="ad-name">Seu nome</label>
          <input id="ad-name" name="name" value="${esc(a.name || state.profile?.full_name || '')}" autocomplete="name" required></div>
        <div class="field-facil">
          <label for="ad-phone">Telefone</label>
          <div class="phone-input-group">
            <select id="ad-phone-country" name="phone_country" class="phone-country-select" aria-label="Código do país">
              <option value="+55" data-placeholder="(00) 00000-0000" selected>🇧🇷 +55</option>
              <option value="+1" data-placeholder="(000) 000-0000">🇺🇸 +1</option>
              <option value="+351" data-placeholder="000 000 000">🇵🇹 +351</option>
              <option value="+34" data-placeholder="600 00 00 00">🇪🇸 +34</option>
              <option value="+54" data-placeholder="(00) 0000-0000">🇦🇷 +54</option>
              <option value="+598" data-placeholder="00 000 000">🇺🇾 +598</option>
            </select>
            <input id="ad-phone" name="phone_number" type="tel" inputmode="tel"
                   value="${esc((a.phone || '').replace(/^\+\d{1,3}\s*/, ''))}"
                   placeholder="(00) 00000-0000" autocomplete="tel-national" required>
          </div>
        </div>
        <div class="field-facil"><label for="ad-street">Rua e número</label>
          <input id="ad-street" name="street" value="${esc(a.street)}" autocomplete="address-line1" required></div>
        <div class="field-facil"><label for="ad-hood">Bairro</label>
          <input id="ad-hood" name="neighborhood" value="${esc(a.neighborhood)}" autocomplete="address-level3" required></div>
        <div class="sticky-cta">
          <button type="submit" class="btn-big btn-big-primary btn-big-block">
            Continuar <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
        </div>
      </form>`;
  }

  /* ---------- Pagamento ---------- */
  function renderPagamento() {
    const { payment, needsChange, changeFor } = state;
    return `
      ${back('entrega')}
      ${h1('Como você quer pagar?')}
      ${renderSteps('pagamento')}
      <div role="group" aria-label="Forma de pagamento">
        ${PAYMENTS.map(p => `
          <button type="button" class="pay-option ${payment === p.id ? 'active' : ''}" aria-pressed="${payment === p.id}"
                  data-action="pay" data-id="${p.id}">
            <i class="fas ${p.icon}" aria-hidden="true"></i><span>${p.label}</span>
            ${payment === p.id ? '<i class="fas fa-check-circle check-icon" aria-hidden="true"></i>' : ''}
          </button>`).join('')}
      </div>
      ${payment === 'dinheiro' ? `
        <div class="change-box">
          <p class="change-title">Precisa de troco?</p>
          <div class="change-row">
            <button type="button" class="city-btn ${needsChange === 'nao' ? 'active' : ''}" aria-pressed="${needsChange === 'nao'}"
                    data-action="change" data-value="nao"><i class="fas fa-check" aria-hidden="true"></i> Não</button>
            <button type="button" class="city-btn ${needsChange === 'sim' ? 'active' : ''}" aria-pressed="${needsChange === 'sim'}"
                    data-action="change" data-value="sim"><i class="fas fa-coins" aria-hidden="true"></i> Sim</button>
          </div>
          ${needsChange === 'sim' ? `
            <div class="field-facil field-inline">
              <label for="change-for">Troco para quanto? (R$)</label>
              <input id="change-for" type="text" inputmode="decimal" data-input="changeFor" value="${esc(changeFor)}"
                     placeholder="Ex: ${money(Math.ceil(cartTotal() / 10) * 10 || 50)}">
            </div>` : ''}
        </div>` : ''}
      ${totalBar()}
      <div class="sticky-cta">
        <button type="button" class="btn-big btn-big-primary btn-big-block" data-action="confirm-order">
          <i class="fas fa-check" aria-hidden="true"></i> Confirmar pedido</button>
      </div>`;
  }

  /* ---------- Pedido (acompanhamento) ---------- */
  const currentStep = order => {
    const sec = (Date.now() - order.createdAt) / 1000;
    let step = 0;
    STEPS.forEach((s, i) => { if (sec >= s.at) step = i; });
    return step;
  };

  function renderPedido() {
    if (!state.order) {
      return `
        ${back('inicio')}
        ${h1('Meu pedido')}
        ${emptyBox('fa-receipt', 'Você ainda não fez um pedido.',
          `<button type="button" class="btn-big btn-big-primary btn-big-block" data-go="inicio">Ver restaurantes</button>`)}`;
    }
    const o = state.order;
    const step = currentStep(o);
    const finished = step === STEPS.length - 1;

    return `
      ${back('inicio', 'Início')}
      ${h1('Acompanhe seu pedido')}
      <p class="muted lead">Pedido ${esc(o.id)} · ${esc(o.restaurantName)}</p>

      <div class="timeline-facil" role="list">
        ${STEPS.map((s, i) => {
          const done = i < step, cur = i === step;
          return `<div role="listitem">
            <div class="timeline-step-facil ${done ? 'done' : ''} ${cur ? 'current' : ''}" ${cur ? 'aria-current="step"' : ''}>
              <div class="step-dot"><i class="fas ${done ? 'fa-check' : s.icon}" aria-hidden="true"></i></div>
              <div class="step-text"><strong>${s.label}</strong><span>${s.desc}</span></div>
            </div>
            ${i < STEPS.length - 1 ? `<div class="step-line ${done ? 'done' : ''}" aria-hidden="true"></div>` : ''}
          </div>`;
        }).join('')}
      </div>

      ${finished ? `<div class="success-box" role="status"><i class="fas fa-check-circle" aria-hidden="true"></i><span>Pedido entregue. Bom apetite!</span></div>` : ''}

      <h2 class="section-title-lg">Resumo</h2>
      ${o.items.map(i => `<div class="summary-row"><span>${i.qty}× ${esc(i.name)}</span><strong>R$ ${money(i.price * i.qty)}</strong></div>`).join('')}
      <div class="summary-row summary-total"><span>Total</span><strong>R$ ${money(o.total)}</strong></div>
      <div class="summary-meta">
        <div>Pagamento: ${esc(o.payment)}</div>
        ${o.changeFor ? `<div>Troco para R$ ${money(o.changeFor)}</div>` : ''}
        <div>Entrega em: ${esc(o.address.street)}${o.address.neighborhood ? `, ${esc(o.address.neighborhood)}` : ''}</div>
      </div>
      ${finished ? `<button type="button" class="btn-big btn-big-primary btn-big-block mt-24" data-action="new-order">
        <i class="fas fa-redo" aria-hidden="true"></i> Fazer outro pedido</button>` : ''}`;
  }

  /* ---------- Nova loja ---------- */
  function renderCadastrar() {
    return `
      ${back('inicio')}
      ${h1('Cadastrar Restaurante')}
      <form data-form="store">
        <div class="field-facil"><label for="st-name">Nome do Restaurante</label>
          <input id="st-name" name="name" required placeholder="Ex: Burger do Zé" autocomplete="off"></div>
        <div class="field-facil"><label for="st-cat">Categoria</label>
          <select id="st-cat" name="category_id" required>
            <option value="">Selecione...</option>
            ${state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
          </select></div>
        <div class="field-facil"><label for="st-fee">Taxa de Entrega (R$)</label>
          <input id="st-fee" name="delivery_fee" type="number" inputmode="decimal" step="0.01" min="0" value="0.00" required></div>

        <div class="field-facil">
          <span class="field-label" id="map-label">Localização no mapa (toque para marcar)</span>
          <div id="map-picker" class="map-box" role="application" aria-labelledby="map-label"></div>
          <button type="button" class="btn-big btn-big-ghost btn-big-sm btn-locate" data-action="locate">
            <i class="fas fa-location-crosshairs" aria-hidden="true"></i> Usar minha localização</button>
          <div class="row-2">
            <div class="field-facil"><label for="input-lat">Latitude</label>
              <input id="input-lat" name="lat" type="text" readonly class="is-readonly"></div>
            <div class="field-facil"><label for="input-lng">Longitude</label>
              <input id="input-lng" name="lng" type="text" readonly class="is-readonly"></div>
          </div>
        </div>

        <div class="sticky-cta">
          <button type="submit" class="btn-big btn-big-primary btn-big-block">Salvar Restaurante</button>
        </div>
      </form>`;
  }

  /* ---------- Barra lateral (desktop) ---------- */
  function avatarImg() {
    const name = state.profile?.full_name || 'C';
    const fb = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6B2737&color=fff`;
    return `<img class="avatar" width="48" height="48" alt="" src="${esc(avatarUrl(state.user?.id, state.avatarBust))}" data-fallback="${esc(fb)}">`;
  }

  // Perfil fica só na lateral esquerda (desktop). Sem sidebar direita.
  function renderLeftProfile() {
    const box = $('sidebar-left-profile');
    if (!box) return;
    if (!state.profile) { box.innerHTML = ''; return; }

    if (state.editingName) {
      box.innerHTML = `
        <div class="profile-row">${avatarImg()}
          <div class="profile-info">
            <strong>Editar nome</strong>
            <span class="muted-small">${esc(state.user?.email || '')}</span>
          </div>
        </div>
        <div class="profile-edit-row">
          <input id="profile-name-input" type="text" maxlength="60" value="${esc(state.profile.full_name || '')}" autocomplete="name">
          <div class="profile-edit-actions">
            <button type="button" data-action="cancel-name">Cancelar</button>
            <button type="button" class="btn-save-name" data-action="save-name">Salvar</button>
          </div>
        </div>`;
      requestAnimationFrame(() => $('profile-name-input')?.focus());
      return;
    }

    box.innerHTML = `
      <div class="profile-row">${avatarImg()}
        <div class="profile-info">
          <strong title="${esc(state.profile.full_name || '')}">${esc(state.profile.full_name || 'Cliente')}</strong>
          <span class="muted-small" title="${esc(state.user?.email || '')}">${esc(state.user?.email || '')}</span>
        </div>
      </div>
      <button type="button" class="btn-edit-name" data-action="edit-name">
        <i class="fas fa-pen" aria-hidden="true"></i> Alterar nome
      </button>`;
  }

  function renderSidebar() {
    // mantido vazio de propósito: a coluna direita foi removida
    return '';
  }

  async function saveProfileName() {
    const input = $('profile-name-input');
    const name = String(input?.value || '').trim();
    if (!name) return toast('Digite um nome', 'error');
    if (!state.user) return toast('Sessão expirada. Entre novamente.', 'error');

    const { error } = await sb.from(T.profiles).upsert({
      id: state.user.id,
      full_name: name,
      role: state.profile?.role || 'user',
    });
    if (error) {
      console.error(error);
      return toast('Não foi possível salvar o nome', 'error');
    }
    try {
      await sb.auth.updateUser({ data: { full_name: name } });
    } catch {}
    state.profile = { ...(state.profile || {}), id: state.user.id, full_name: name };
    state.editingName = false;
    state.avatarBust = Date.now();
    renderLeftProfile();
    // atualiza saudação se estiver no início
    if (state.view === 'inicio') render({ enter: false });
    toast('Nome atualizado!', 'success');
  }

  const VIEWS = {
    inicio: renderInicio, restaurante: renderRestaurante, carrinho: renderCarrinho,
    entrega: renderEntrega, pagamento: renderPagamento, pedido: renderPedido, cadastrar: renderCadastrar,
  };

  /* ==========================================================
     6. AÇÕES
     ========================================================== */
  function setCuisine(id) {
    state.cuisine = id === '' ? null : (state.categories.find(c => same(c.id, id))?.id ?? null);
    render();
  }

  /* ---------- Carrinho ---------- */
  async function addToCart(storeId, itemId) {
    const store = findStore(storeId);
    const item = store?.menu_items.find(m => same(m.id, itemId));
    if (!item || item.is_available === false) return;

    // pedido de outro restaurante: pergunta antes de esvaziar o carrinho
    if (state.cart.items.length && !same(state.cart.rid, store.id)) {
      const ok = await askConfirm({
        title: 'Começar um novo pedido?',
        text: `Seu carrinho tem itens de ${state.cart.rname}. Para pedir de ${store.name}, vamos esvaziá-lo.`,
        ok: 'Esvaziar e continuar',
        cancel: 'Manter carrinho',
      });
      if (!ok) return;
    }
    if (!same(state.cart.rid, store.id)) state.cart = { rid: store.id, rname: store.name, items: [] };

    const existing = state.cart.items.find(i => same(i.id, item.id));
    if (existing) existing.qty++;
    else state.cart.items.push({ id: item.id, name: item.name, price: Number(item.price) || 0, qty: 1, img: item.img || '' });

    persistCart();
    render();
    bumpQty(item.id);
    navigator.vibrate?.(10);
    toast('Adicionado ao carrinho', 'success');
  }

  function bumpQty(itemId) {
    document.querySelectorAll(`[data-qty-for="${CSS.escape(String(itemId))}"]`).forEach(el => {
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    });
  }

  function changeQty(itemId, delta, trigger) {
    const item = state.cart.items.find(i => same(i.id, itemId));
    if (!item) return;

    const removing = item.qty + delta <= 0;
    const row = removing ? trigger?.closest('.cart-item-facil') : null;
    if (row?.classList.contains('is-leaving')) return;             // toque duplo durante a animação

    const apply = () => {
      const before = structuredClone(state.cart);
      const it = state.cart.items.find(i => same(i.id, itemId));
      if (!it) return;
      it.qty += delta;
      if (it.qty <= 0) state.cart.items = state.cart.items.filter(i => !same(i.id, itemId));
      if (!state.cart.items.length) state.cart = emptyCart();
      persistCart();
      render();

      if (it.qty <= 0) {
        toast(`${it.name} removido`, 'info', {
          action: { label: 'Desfazer', onClick: () => { state.cart = before; persistCart(); render(); } },
        });
      } else {
        bumpQty(itemId);
      }
    };

    if (row) { row.classList.add('is-leaving'); setTimeout(apply, 240); } else apply();
  }

  /* ---------- Entrega / pagamento ---------- */
  function submitEntrega(form) {
    const fd = new FormData(form);
    const country = String(fd.get('phone_country') || '+55').trim();
    const number = String(fd.get('phone_number') || '').trim();
    const address = {
      name: String(fd.get('name') || '').trim(),
      phone: number ? `${country} ${number}` : '',
      street: String(fd.get('street') || '').trim(),
      neighborhood: String(fd.get('neighborhood') || '').trim(),
    };
    if (!address.name || !number || !address.street || !address.neighborhood) {
      return toast('Preencha todos os campos', 'error');
    }
    state.address = address;
    save(KEYS.address, address);
    go('pagamento');
  }

  function maskPhoneInput(input) {
    if (!input) return;
    const select = $('ad-phone-country');
    const code = select ? select.value : '+55';
    const start = input.selectionStart;
    const before = input.value;
    let digits = before.replace(/\D/g, '');
    let next = '';

    if (code === '+55') {
      if (digits.length > 11) digits = digits.slice(0, 11);
      if (digits.length === 0) next = '';
      else if (digits.length <= 2) next = '(' + digits;
      else if (digits.length <= 6) next = '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
      else if (digits.length <= 10) next = '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6);
      else next = '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7);
    } else if (code === '+1') {
      if (digits.length > 10) digits = digits.slice(0, 10);
      if (digits.length === 0) next = '';
      else if (digits.length <= 3) next = '(' + digits;
      else if (digits.length <= 6) next = '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
      else next = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
    } else {
      if (digits.length > 12) digits = digits.slice(0, 12);
      next = digits;
    }

    if (next === before) return;
    input.value = next;
    // tenta manter o cursor perto do final (digitar é sempre à direita)
    try {
      const pos = next.length;
      input.setSelectionRange(pos, pos);
    } catch {}
  }

  function selectPayment(id) {
    state.payment = id;
    if (id !== 'dinheiro') { state.needsChange = null; state.changeFor = ''; }
    render();
  }

  function setChange(v) {
    state.needsChange = v;
    if (v === 'nao') state.changeFor = '';
    render();
    if (v === 'sim') $('change-for')?.focus();
  }

  // "1.200,50" → 1200.5 · "50" → 50
  const parseMoney = s => {
    let t = String(s ?? '').trim().replace(/[^\d,.-]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    return parseFloat(t) || 0;
  };

  function confirmarPedido() {
    if (!state.payment) return toast('Escolha como vai pagar', 'error');
    if (state.payment === 'dinheiro' && state.needsChange === null) return toast('Responda se precisa de troco', 'error');

    const wantsChange = state.payment === 'dinheiro' && state.needsChange === 'sim';
    const change = wantsChange ? parseMoney(state.changeFor) : null;
    if (wantsChange && change <= 0) return toast('Digite para quanto precisa de troco', 'error');
    if (wantsChange && change < cartTotal()) return toast(`O valor deve ser pelo menos R$ ${money(cartTotal())}`, 'error');

    state.order = {
      id: 'FC' + Math.floor(1000 + Math.random() * 9000),
      restaurantName: state.cart.rname,
      items: state.cart.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
      total: cartTotal(),
      address: { ...state.address },
      payment: PAYMENTS.find(p => p.id === state.payment).label,
      changeFor: change,
      createdAt: Date.now(),
    };
    save(KEYS.order, state.order);
    state.cart = emptyCart();
    persistCart();
    state.payment = null; state.needsChange = null; state.changeFor = '';
    go('pedido');
    toast('Pedido enviado!', 'success');
  }

  /* ---------- Acompanhamento ---------- */
  function stopTicker() { clearInterval(state.ticker); state.ticker = null; }

  // só re-renderiza quando a etapa muda (antes era a cada 1s, reiniciando a animação do pulso)
  function startTicker() {
    stopTicker();
    if (!state.order || currentStep(state.order) === STEPS.length - 1) return;
    state.lastStep = currentStep(state.order);
    state.ticker = setInterval(() => {
      if (state.view !== 'pedido' || !state.order) return stopTicker();
      const step = currentStep(state.order);
      if (step === state.lastStep) return;
      state.lastStep = step;
      render();
      const last = step === STEPS.length - 1;
      toast(last ? 'Pedido entregue. Bom apetite!' : `Pedido: ${STEPS[step].label}`, last ? 'success' : 'info');
      if (last) stopTicker();
    }, 1000);
  }

  function novoPedido() {
    state.order = null;
    try { localStorage.removeItem(KEYS.order); } catch {}
    state.cuisine = null;
    go('inicio');
  }

  /* ---------- Nova loja ---------- */
  async function salvarRestaurante(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const category_id = parseInt(fd.get('category_id'), 10);
    const delivery_fee = parseFloat(fd.get('delivery_fee'));
    const lat = parseFloat(fd.get('lat'));
    const lng = parseFloat(fd.get('lng'));

    if (!name || !category_id || isNaN(lat) || isNaN(lng)) return toast('Selecione o local no mapa', 'error');
    if (!state.user) return toast('Sessão expirada. Entre novamente.', 'error');

    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Salvando...');

    const { error } = await sb.from(T.stores).insert({
      name,
      category_id,
      delivery_fee: isNaN(delivery_fee) ? 0 : delivery_fee,
      owner_id: state.user.id,
      location: `SRID=4326;POINT(${lng} ${lat})`,       // PostGIS
    });

    if (error) {
      console.error('Erro ao cadastrar:', error);
      const msg = error.code === '42501'
        ? 'Permissão negada. Libere o INSERT na tabela stores (RLS).'
        : error.message;
      toast('Erro: ' + msg, 'error');
      setBusy(btn, false);
      return;
    }

    toast('Restaurante cadastrado com sucesso!', 'success');
    await refreshData();
    go('inicio');
  }

  /* ==========================================================
     7. MAPA (Leaflet carregado só quando a tela é aberta)
     ========================================================== */
  let leafletPromise = null;
  let mapPicker = null;
  let mapMarker = null;
  let mapBounds = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    leafletPromise ||= new Promise((resolve, reject) => {
      const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: MAP.css });
      const js = Object.assign(document.createElement('script'), {
        src: MAP.js,
        onload: () => resolve(window.L),
        onerror: () => { leafletPromise = null; reject(new Error('leaflet')); },
      });
      document.head.append(css, js);
    });
    return leafletPromise;
  }

  function destroyMap() {
    if (mapPicker) mapPicker.remove();
    mapPicker = mapMarker = null;
  }

  const setCoords = ({ lat, lng }) => {
    $('input-lat').value = lat.toFixed(6);
    $('input-lng').value = lng.toFixed(6);
  };

  async function initMapPicker() {
    const box = $('map-picker');
    if (!box) return;
    box.innerHTML = '<p class="empty-inline">Carregando mapa…</p>';

    let L;
    try { L = await loadLeaflet(); }
    catch { box.innerHTML = '<p class="empty-inline">Não foi possível carregar o mapa. Verifique sua conexão.</p>'; return; }

    if (state.view !== 'cadastrar' || $('map-picker') !== box) return;   // saiu da tela enquanto carregava
    box.innerHTML = '';
    destroyMap();

    mapBounds = L.latLngBounds(MAP.bounds);
    mapPicker = L.map(box, { maxBounds: mapBounds, maxBoundsViscosity: 1.0, minZoom: 6 }).setView(MAP.start, 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapPicker);

    mapMarker = L.marker(MAP.start, { draggable: true }).addTo(mapPicker);
    setCoords(L.latLng(MAP.start));

    mapMarker.on('dragend', () => setCoords(mapMarker.getLatLng()));
    mapPicker.on('click', e => { mapMarker.setLatLng(e.latlng); setCoords(e.latlng); });

    setTimeout(() => mapPicker?.invalidateSize(), 150);     // corrige tamanho após a animação de entrada
  }

  function locateMe() {
    if (!mapPicker) return toast('O mapa ainda está carregando.', 'info');
    if (!navigator.geolocation) return toast('Seu navegador não permite localização.', 'error');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const ll = window.L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (!mapBounds.contains(ll)) return toast('Sua localização está fora de PR e SC.', 'error');
        mapMarker.setLatLng(ll);
        mapPicker.setView(ll, 15);
        setCoords(ll);
      },
      () => toast('Não foi possível obter sua localização.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  /* ==========================================================
     8. EVENTOS GLOBAIS + INIT
     ========================================================== */
  async function reloadData() {
    state.loading = true; render();
    await refreshData();
    state.loading = false; render(); updateCartUI();
  }

  const ACTIONS = {
    logout: async () => {
      let ok = false;
      try {
        ok = await askConfirm({
          title: 'Sair da conta?',
          text: 'O carrinho e o endereço salvos neste aparelho serão apagados.',
          ok: 'Sair', cancel: 'Ficar',
        });
      } catch {
        ok = window.confirm('Sair da conta?');
      }
      if (!ok) return;
      if (typeof logout === 'function') {
        try { await logout(); return; } catch (err) { console.error(err); }
      }
      try {
        ['fc-cart', 'fc-address', 'fc-order'].forEach(k => localStorage.removeItem(k));
        await sb.auth.signOut();
      } catch {}
      location.replace('login.html');
    },
    cuisine: t => setCuisine(t.dataset.id),
    add: t => addToCart(t.dataset.store, t.dataset.id),
    qty: t => changeQty(t.dataset.id, Number(t.dataset.delta), t),
    pay: t => selectPayment(t.dataset.id),
    change: t => setChange(t.dataset.value),
    'confirm-order': confirmarPedido,
    'new-order': novoPedido,
    'open-cart': () => go('carrinho'),
    reload: reloadData,
    locate: locateMe,
    'edit-name': () => { state.editingName = true; renderLeftProfile(); },
    'cancel-name': () => { state.editingName = false; renderLeftProfile(); },
    'save-name': () => saveProfileName(),
  };

  document.addEventListener('change', e => {
    if (e.target?.id === 'ad-phone-country') {
      const opt = e.target.selectedOptions[0];
      const input = $('ad-phone');
      if (opt && input) {
        input.placeholder = opt.dataset.placeholder || '';
        maskPhoneInput(input);
      }
    }
  });

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-action]');
    if (!t) return;
    if (t.dataset.go) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;     // abrir em nova aba continua funcionando
      e.preventDefault();
      go(t.dataset.go, { id: t.dataset.id || null });
    } else {
      ACTIONS[t.dataset.action]?.(t, e);
    }
  });

  document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    ({ entrega: submitEntrega, store: salvarRestaurante })[form.dataset.form]?.(form);
  });

  let searchTimer;
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'ad-phone') {
      maskPhoneInput(t);
      return;
    }
    if (t.dataset?.input === 'search') {
      state.search = t.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {                       // atualiza só a lista: o campo não perde o foco
        const box = $('store-results');
        if (box) box.innerHTML = storeResults();
      }, 120);
    } else if (t.dataset?.input === 'changeFor') {
      state.changeFor = t.value;
    }
  });

  // imagem quebrada: tenta o fallback (avatar) ou vira um bloco neutro
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.fallback && !img.dataset.fellBack) {
      img.dataset.fellBack = '1';
      img.src = img.dataset.fallback;
      return;
    }
    img.classList.add('is-broken');
  }, true);

  window.addEventListener('hashchange', () => route({ fromGo: false }));   // botão voltar/avançar

  // carrinho/pedido alterado em outra aba
  window.addEventListener('storage', e => {
    if (e.key === KEYS.cart)  state.cart = normalizeCart(load(KEYS.cart));
    else if (e.key === KEYS.order) state.order = load(KEYS.order, null);
    else return;
    render();
  });

  (async function init() {
    history.scrollRestoration = 'manual';
    const session = await requireSession();
    if (!session) return;
    state.user = session.user;

    document.body.classList.remove('is-booting');
    if (!location.hash) history.replaceState(null, '', '#inicio');
    route({ fromGo: true });                       // mostra o esqueleto enquanto carrega

    await Promise.all([loadProfile(), refreshData()]);
    state.loading = false;
    route({ fromGo: false });
  })();
})();
