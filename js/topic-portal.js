(() => {
  'use strict';
  const from64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const to64 = value => btoa(String.fromCharCode(...new Uint8Array(value)));
  const storageKey = payload => `ruvik-topic:${payload.topic}:${payload.salt}`;
  const readKey = payload => { try { return sessionStorage.getItem(storageKey(payload)); } catch { return null; } };
  const forget = topic => {
    try { Object.keys(sessionStorage).filter(key => key.startsWith(`ruvik-topic:${topic}:`)).forEach(key => sessionStorage.removeItem(key)); } catch {}
  };
  async function unlock(gate, payload, key) {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: from64(payload.iv) }, key, from64(payload.data));
    if (!gate.isConnected) return;
    const content = document.createElement('div');
    content.className = 'topic-unlocked';
    content.dataset.topicSession = storageKey(payload);
    content.innerHTML = new TextDecoder().decode(decrypted);
    if (!content.querySelector('.topic-relock')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'topic-relock'; button.textContent = '锁定专题';
      content.appendChild(button);
    }
    content.querySelector('.topic-relock').addEventListener('click', () => { forget(payload.topic); location.reload(); });
    // Restore images configured for Butterfly lazy loading.
    content.querySelectorAll('img[data-lazy-src]').forEach(img => { img.src = img.dataset.lazySrc; });
    gate.replaceWith(content);
    window.dispatchEvent(new Event('resize'));
  }
  function init() {
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !document.querySelector('.local-writer-entry')) {
      const menu = document.querySelector('#menus');
      document.querySelectorAll('.topic-access-link').forEach(link => { link.href = '/admin/private-preview' + link.dataset.privatePath; });
      if (menu) {
        const link = document.createElement('a');
        link.className = 'local-writer-entry';
        link.href = '/admin/writer/';
        link.textContent = '✎ 写文章';
        menu.insertBefore(link, menu.firstChild);
      }
    }
    document.querySelectorAll('.topic-gate').forEach(async gate => {
      if (gate.dataset.ready) return;
      gate.dataset.ready = 'true';
      const payload = JSON.parse(gate.querySelector('.topic-payload').textContent);
      const form = gate.querySelector('form');
      const status = form.querySelector('.topic-error');
      if (!window.crypto?.subtle) { status.textContent = '请使用 HTTPS 地址或本地预览地址访问。'; return; }
      const saved = readKey(payload);
      if (saved) {
        try { await unlock(gate, payload, await crypto.subtle.importKey('raw', from64(saved), 'AES-GCM', true, ['decrypt'])); return; }
        catch { forget(payload.topic); }
      }
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button');
        const input = form.elements.password;
        button.disabled = true; status.textContent = '正在解锁…';
        try {
          const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(input.value), 'PBKDF2', false, ['deriveKey']);
          const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: from64(payload.salt), iterations: payload.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
          await unlock(gate, payload, key);
          input.value = '';
          try { sessionStorage.setItem(storageKey(payload), to64(await crypto.subtle.exportKey('raw', key))); } catch {}
        } catch { status.textContent = '密码不正确，请重新输入。'; input.focus(); }
        finally { button.disabled = false; }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('pjax:complete', init);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    try {
      if ([...document.querySelectorAll('.topic-unlocked')].some(content => !sessionStorage.getItem(content.dataset.topicSession))) location.reload();
    } catch { location.reload(); }
  });
})();
