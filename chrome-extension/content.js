'use strict';

(() => {
  const FUNCTION_URL = 'https://rcviqdfzrewzxvojuwcy.supabase.co/functions/v1/lookup-vins';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjdmlxZGZ6cmV3enh2b2p1d2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MDkzNDIsImV4cCI6MjA5MjM4NTM0Mn0.zrjJY2c3HkJHxNQtviJ2spa_NM4HsUXyvQcELU2xSxw';

  const log = (...args) => console.log('[TPH]', ...args);

  const VIN_RE = /[A-HJ-NPR-Z0-9]{17}/;
  const RESULTS_BY_VIN = new Map();          // VIN -> full API result
  const HISTORY_BY_VIN = new Map();          // VIN -> { current_price, history, ... }
  const KEY_TO_VIN = new Map();              // "price_mileage_year" -> VIN (only if unique)

  function detectModel() {
    const m = location.pathname.match(/\/inventory\/used\/(m[3sxy])/i);
    return m ? m[1].toLowerCase() : null;
  }

  function detectLocale() {
    const m = location.pathname.match(/^\/([a-z]{2})_([A-Z]{2})\//);
    return m ? { language: m[1], market: m[2] } : { language: 'fr', market: 'FR' };
  }

  function parseCardKey(text) {
    const priceM = text.match(/(\d[\d   ]*)\s*€/);
    const kmM = text.match(/(\d[\d   ]*)\s*km/);
    const yearM = text.match(/\bde\s+(\d{4})\b/) || text.match(/\b(20\d{2})\b/);
    if (!priceM || !kmM || !yearM) return null;
    const clean = s => parseInt(s.replace(/[\s  ]/g, ''), 10);
    const price = clean(priceM[1]);
    const km = clean(kmM[1]);
    const year = parseInt(yearM[1], 10);
    if (!price || !km || !year) return null;
    return `${price}_${km}_${year}`;
  }

  async function fetchAllResults(model, language, market) {
    const acc = [];
    const seen = new Set();
    let offset = 0;
    for (let i = 0; i < 20; i++) {
      const q = { query: { model, condition: 'used', market, language }, offset, count: 50 };
      const url = `https://www.tesla.com/inventory/api/v4/inventory-results?query=${encodeURIComponent(JSON.stringify(q))}`;
      let res;
      try { res = await fetch(url); }
      catch (e) { log('inventory fetch threw', e); break; }
      if (!res.ok) { log('inventory API status', res.status); break; }
      const data = await res.json();
      const raw = data.results;
      const results = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' ? Object.values(raw).filter(Array.isArray).flat() : []);
      for (const r of results) if (r.VIN && !seen.has(r.VIN)) { seen.add(r.VIN); acc.push(r); }
      const total = Number(data.total_matches_found) || 0;
      offset += results.length;
      if (results.length === 0 || acc.length >= total) break;
    }
    return acc;
  }

  async function lookupVins(vins) {
    if (vins.length === 0) return {};
    const out = {};
    for (let i = 0; i < vins.length; i += 50) {
      const batch = vins.slice(i, i + 50);
      try {
        const res = await fetch(FUNCTION_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${ANON_KEY}`,
            apikey: ANON_KEY,
          },
          body: JSON.stringify({ vins: batch }),
          credentials: 'omit',
        });
        if (!res.ok) { log('lookup batch failed', res.status, await res.text().catch(() => '')); continue; }
        Object.assign(out, await res.json());
      } catch (e) { log('lookup batch threw', e); }
    }
    return out;
  }

  function indexResults(results) {
    const tally = new Map();
    for (const r of results) {
      if (!r.VIN) continue;
      RESULTS_BY_VIN.set(r.VIN, r);
      const price = r.InventoryPrice ?? r.Price ?? r.PurchasePrice;
      const km = r.Odometer;
      const year = r.Year;
      if (price != null && km != null && year != null) {
        const key = `${Math.round(price)}_${Math.round(km)}_${year}`;
        const prev = tally.get(key);
        tally.set(key, prev ? [...prev, r.VIN] : [r.VIN]);
      }
    }
    let collisions = 0;
    for (const [key, vins] of tally) {
      if (vins.length === 1) KEY_TO_VIN.set(key, vins[0]);
      else collisions += vins.length;
    }
    if (collisions > 0) log(`skipped ${collisions} VINs with ambiguous price/km/year fingerprint`);
  }

  function vinForCard(card) {
    const els = card.querySelectorAll('[src], [href]');
    for (const el of els) {
      const haystack = (el.getAttribute('src') || '') + ' ' + (el.getAttribute('href') || '');
      const m = haystack.match(VIN_RE);
      if (m && RESULTS_BY_VIN.has(m[0])) return m[0];
    }
    const key = parseCardKey(card.textContent || '');
    if (!key) return null;
    return KEY_TO_VIN.get(key) || null;
  }

  const CURRENCY_BY_MARKET = {
    CH: 'CHF', CZ: 'CZK', DK: 'DKK', GB: 'GBP', HU: 'HUF',
    IS: 'ISK', NO: 'NOK', PL: 'PLN', RO: 'RON', SE: 'SEK', TR: 'TRY',
  };
  const fmtMoney = n => {
    if (n == null) return '—';
    const loc = detectLocale();
    return new Intl.NumberFormat(`${loc.language}-${loc.market}`, {
      style: 'currency',
      currency: CURRENCY_BY_MARKET[loc.market] || 'EUR',
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  };
  const fmtSignedMoney = n => (n > 0 ? '+' : '') + fmtMoney(n);
  const fmtDate = iso => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const daysSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

  function makeBadge(vin, data) {
    const history = data.history || [];
    const first = history[0]?.price ?? data.current_price;
    const delta = (data.current_price ?? 0) - (first ?? 0);
    const days = daysSince(data.first_seen_at);

    const badge = document.createElement('div');
    badge.className = 'tph-badge';
    badge.dataset.tphVin = vin;

    if (delta < 0) {
      badge.classList.add('tph-down');
      badge.textContent = `▼ ${fmtSignedMoney(delta)} · ${days}j`;
    } else if (delta > 0) {
      badge.classList.add('tph-up');
      badge.textContent = `▲ ${fmtSignedMoney(delta)} · ${days}j`;
    } else {
      badge.classList.add('tph-flat');
      badge.textContent = history.length > 1 ? `= ${days}j` : `vu ${days}j`;
    }

    return badge;
  }

  let popoverEl = null;
  function closePopover() {
    if (popoverEl) { popoverEl.remove(); popoverEl = null; }
    document.removeEventListener('click', onDocClick, true);
  }
  function onDocClick(e) {
    if (popoverEl && !popoverEl.contains(e.target) && !e.target.closest('.tph-badge')) closePopover();
  }

  function showPopover(anchor, vin) {
    closePopover();
    const data = HISTORY_BY_VIN.get(vin);
    if (!data) return;
    const history = data.history || [];

    const el = document.createElement('div');
    el.className = 'tph-popover';

    const first = history[0]?.price ?? data.current_price;
    const totalDelta = (data.current_price ?? 0) - (first ?? 0);
    const days = daysSince(data.first_seen_at);

    const head = document.createElement('h4');
    head.textContent = `Historique de prix · ${vin.slice(-6)}`;
    el.appendChild(head);

    const sub = document.createElement('p');
    sub.className = 'tph-sub';
    sub.textContent = `Vu depuis ${days}j · ${history.length} relevé${history.length > 1 ? 's' : ''} · ${totalDelta === 0 ? 'aucun changement' : `${fmtSignedMoney(totalDelta)} au total`}`;
    el.appendChild(sub);

    let prev = null;
    for (const h of history) {
      const row = document.createElement('div');
      row.className = 'tph-row';
      if (prev != null) {
        if (h.price < prev) row.classList.add('tph-down');
        else if (h.price > prev) row.classList.add('tph-up');
      }
      const left = document.createElement('span'); left.textContent = fmtDate(h.at);
      const right = document.createElement('span');
      right.textContent = prev == null ? fmtMoney(h.price) : `${fmtMoney(h.price)} (${fmtSignedMoney(h.price - prev)})`;
      row.appendChild(left); row.appendChild(right);
      el.appendChild(row);
      prev = h.price;
    }

    const footer = document.createElement('div');
    footer.className = 'tph-footer';
    const footerLink = document.createElement('a');
    footerLink.href = 'https://tolsadus.github.io/TeslaPricing/';
    footerLink.target = '_blank';
    footerLink.rel = 'noopener noreferrer';
    footerLink.textContent = 'Données via TeslaPricing';
    footer.appendChild(footerLink);
    el.appendChild(footer);

    document.body.appendChild(el);

    const r = anchor.getBoundingClientRect();
    const pw = el.offsetWidth, ph = el.offsetHeight;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;

    popoverEl = el;
    el.addEventListener('mouseleave', () => closePopover());
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }

  function injectBadges() {
    if (HISTORY_BY_VIN.size === 0) return 0;
    const hosts = document.querySelectorAll('section.card-info-details');

    let matched = 0;
    for (const host of hosts) {
      if (host.querySelector('.tph-badge')) continue;
      const card = host.closest('article.vehicle-card') || host.closest('article.result') || host.closest('article');
      if (!card) continue;
      const vin = vinForCard(card);
      if (!vin || !HISTORY_BY_VIN.has(vin)) continue;

      const cs = getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      const badge = makeBadge(vin, HISTORY_BY_VIN.get(vin));
      host.appendChild(badge);

      let hoverTimer = null;
      badge.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
        showPopover(badge, vin);
      });
      badge.addEventListener('mouseleave', () => {
        hoverTimer = setTimeout(() => {
          if (popoverEl && !popoverEl.matches(':hover')) closePopover();
        }, 150);
      });
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, true);
      matched++;
    }
    if (matched > 0) log(`injected ${matched} badges`);
    return matched;
  }

  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectBadges(); });
  }

  async function refresh() {
    const model = detectModel();
    if (!model) { log('no model in URL', location.pathname); return; }
    const locale = detectLocale();
    log('refresh model=' + model, locale);

    const results = await fetchAllResults(model, locale.language, locale.market);
    log(`Tesla API returned ${results.length} cars`);
    if (results.length === 0) {
      log('no results — Tesla API may have changed or be region-gated');
      return;
    }
    indexResults(results);

    const newVins = results.map(r => r.VIN).filter(v => v && !HISTORY_BY_VIN.has(v));
    if (newVins.length > 0) {
      const data = await lookupVins(newVins);
      log(`DB returned history for ${Object.keys(data).length}/${newVins.length} VINs`);
      for (const [v, info] of Object.entries(data)) HISTORY_BY_VIN.set(v, info);
    }
    if (HISTORY_BY_VIN.size === 0) {
      log('no history available — function returned nothing');
      return;
    }

    const initial = injectBadges();
    if (initial === 0) {
      log('no badges placed yet — waiting for DOM');
      // try a few more times as Tesla finishes rendering
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        const n = injectBadges();
        if (n > 0 || tries >= 15) clearInterval(t);
      }, 500);
    }
  }

  function watchSpa() {
    new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        log('SPA navigation', lastPath);
        HISTORY_BY_VIN.clear();
        RESULTS_BY_VIN.clear();
        KEY_TO_VIN.clear();
        refresh();
      }
    }, 1000);
  }

  refresh();
  watchSpa();
})();
