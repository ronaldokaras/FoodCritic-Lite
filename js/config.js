window.APP = {
  url: 'https://byycxurjjonbhrreoost.supabase.co',
  key: 'sb_publishable_CyvZ6fSv-rnd3tc_KhoVhg_jWxTrWOj',
  tables: {
    stores:     'stores',
    menu:       'menu_items',
    profiles:   'profiles',
    categories: 'categories',
  },
  buckets: { images: 'img_comidas' },
};

window.sb = window.supabase.createClient(APP.url, APP.key);
window.$ = id => document.getElementById(id);
window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.imgUrl = path => sb.storage.from(APP.buckets.images).getPublicUrl(path).data.publicUrl;
window.avatarUrl = (userId, bust) => {
  const u = imgUrl(`avatars/${userId}.jpg`);
  return bust ? `${u}?t=${bust}` : u;
};