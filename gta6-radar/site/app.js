(() => {
  'use strict';
  const API = './data/feed.json';
  const REFRESH_MS = 120000;
  const PER_PAGE = 9;
  const $ = (selector) => document.querySelector(selector);
  const els = {
    grid: $('#news-grid'), projects: $('#project-grid'), tabs: document.querySelectorAll('.tab'),
    search: $('#search-input'), sort: $('#sort-select'), more: $('#more-btn'),
    empty: $('#empty-state'), count: $('#news-total'), countAll: $('#count-all'),
    counter: $('#visible-counter'), saved: $('#saved-toggle'), savedCount: $('#saved-count'),
    sync: $('#sync-label'), scan: $('#last-scan-value'), dataStatus: $('#data-status'),
    scanDetail: $('#scan-detail'), repos: $('#repo-count'), refresh: $('#refresh-btn'),
    notifications: $('#notify-btn'), toast: $('#toast')
  };
  const categoryNames = {official: 'OFICIAL', pc: 'PC / PORT', leaks: 'VAZAMENTOS', recomp: 'RECOMPILAÇÃO', general: 'NOTÍCIAS'};
  let state = {data: null, category: 'all', search: '', sort: 'recent', onlySaved: false, limit: PER_PAGE, savedIds: new Set(), knownIds: new Set(), fetchedOnce: false};
  let toastTimeout = null;

  try { state.savedIds = new Set(JSON.parse(localStorage.getItem('radar-saved') || '[]')); } catch (_) {}

  function safeUrl(value) {
    try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : '#'; }
    catch (_) { return '#'; }
  }
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function timeValue(value) { const ms = value ? Date.parse(value) : NaN; return Number.isFinite(ms) ? ms : 0; }
  function displayDate(value) {
    if (!timeValue(value)) return 'SEM DATA';
    return new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo', day:'2-digit', month:'short', year:'numeric'}).format(new Date(value)).toUpperCase().replace('.', '');
  }
  function relativeDate(value) {
    if (!timeValue(value)) return 'NÃO DISPONÍVEL';
    const delta = Math.max(0, Date.now() - Date.parse(value)), minutes = Math.floor(delta / 60000);
    if (minutes < 2) return 'AGORA MESMO';
    if (minutes < 60) return `${minutes} MIN ATRÁS`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} H ATRÁS`;
    const days = Math.floor(hours / 24);
    return days < 30 ? `${days} D ATRÁS` : displayDate(value);
  }
  function compactNum(number) {
    if (!Number.isFinite(number)) return '—';
    return Intl.NumberFormat('pt-BR', {notation:'compact', maximumFractionDigits:1}).format(number);
  }
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => els.toast.classList.remove('show'), 4100);
  }
  function normalizeArticle(article) {
    if (!article || typeof article.title !== 'string' || typeof article.url !== 'string') return null;
    const category = Object.hasOwn(categoryNames, article.category) ? article.category : 'general';
    return {...article, category, id:String(article.id || article.url), source:String(article.source || 'Fonte externa'), description:String(article.description || ''), verification:String(article.verification || 'press')};
  }
  function validateData(json) {
    if (!json || !Array.isArray(json.articles) || !Array.isArray(json.repositories)) throw new Error('Formato inválido');
    return {...json, articles: json.articles.map(normalizeArticle).filter(Boolean)};
  }

  function renderArticles() {
    if (!state.data) return;
    const search = state.search.trim().toLocaleLowerCase('pt-BR');
    const all = state.data.articles.filter(article =>
      (state.category === 'all' || article.category === state.category) &&
      (!state.onlySaved || state.savedIds.has(article.id)) &&
      (!search || `${article.title} ${article.description} ${article.source}`.toLocaleLowerCase('pt-BR').includes(search))
    );
    all.sort((a,b) => state.sort === 'source' ? a.source.localeCompare(b.source) : state.sort === 'oldest' ? timeValue(a.published)-timeValue(b.published) : timeValue(b.published)-timeValue(a.published));
    els.grid.replaceChildren();
    const visible = all.slice(0, state.limit);
    for (const [idx, article] of visible.entries()) els.grid.appendChild(makeArticleCard(article, idx === 0 && state.category === 'all' && !state.onlySaved && !search && state.sort === 'recent'));
    els.empty.hidden = all.length !== 0;
    els.more.hidden = all.length <= state.limit;
    els.counter.textContent = `${visible.length} DE ${all.length} RESULTADOS EXIBIDOS`;
    els.count.textContent = state.data.articles.length;
    els.countAll.textContent = state.data.articles.length;
    els.savedCount.textContent = state.savedIds.size;
  }
  function makeArticleCard(article, featured) {
    const card = el('article', `news-card${featured ? ' featured' : ''}`);
    const top = el('div', 'card-top');
    const badge = el('span', `category-badge ${article.category}`, categoryNames[article.category]);
    const date = el('time', 'card-date', displayDate(article.published));
    if (timeValue(article.published)) date.dateTime = article.published;
    top.append(badge, date);
    const content = el('div', 'card-content');
    const heading = el('h3');
    const titleLink = el('a', null, article.title);
    titleLink.href = safeUrl(article.url);
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    heading.append(titleLink);
    content.append(heading, el('p', null, article.description || 'Veja a notícia completa na fonte original.'));
    const bottom = el('div', 'card-bottom');
    const source = el('span', 'card-source', `${article.source}${article.verification === 'unverified' ? ' • NÃO VERIFICADO' : ''}`);
    const ops = el('div', 'card-ops');
    const bookmark = el('button', 'bookmark', state.savedIds.has(article.id) ? '★' : '☆');
    bookmark.type = 'button';
    bookmark.title = state.savedIds.has(article.id) ? 'Remover dos salvos' : 'Salvar notícia';
    bookmark.setAttribute('aria-label', bookmark.title);
    bookmark.setAttribute('aria-pressed', state.savedIds.has(article.id) ? 'true' : 'false');
    bookmark.addEventListener('click', () => {
      if (state.savedIds.has(article.id)) state.savedIds.delete(article.id); else state.savedIds.add(article.id);
      try { localStorage.setItem('radar-saved', JSON.stringify([...state.savedIds])); } catch (_) {}
      renderArticles();
    });
    const open = el('a', 'card-open', 'LER ↗');
    open.href = safeUrl(article.url); open.target = '_blank'; open.rel = 'noopener noreferrer';
    ops.append(bookmark, open); bottom.append(source, ops); card.append(top, content, bottom);
    return card;
  }
  function renderProjects() {
    if (!state.data) return;
    els.projects.replaceChildren();
    const repos = state.data.repositories.slice(0, 6);
    els.repos.textContent = `${String(repos.length).padStart(2,'0')} `;
    const suffix = el('span', null, 'REPOS'); els.repos.append(suffix);
    for (const repo of repos) {
      const card = el('article', 'project-card');
      const first = el('div');
      first.append(el('span', 'project-topline', '◆ CÓDIGO ABERTO / GITHUB'), el('h3', 'project-title', repo.name || String(repo.full_name).split('/')[1].toUpperCase()), el('p', 'project-desc', repo.description || 'Projeto monitorado no GitHub.'));
      const bottom = el('div');
      const stats = el('div', 'project-stats');
      for (const [label, count] of [['ESTRELAS',repo.stargazers_count],['FORKS',repo.forks_count],['ISSUES ABERTAS',repo.open_issues_count]]) {
        const stat = el('div', 'project-stat'); stat.append(el('span', null, label), el('strong', null, compactNum(count))); stats.append(stat);
      }
      const detail = el('div', 'project-bottom');
      const last = repo.last_commit && repo.last_commit.message ? `ÚLTIMO COMMIT: ${repo.last_commit.message}` : `ATIVIDADE: ${relativeDate(repo.pushed_at)}`;
      const small = el('small', null, last);
      small.title = last;
      const link = el('a', null, 'VER REPOSITÓRIO ↗');
      link.href = safeUrl(repo.html_url); link.target = '_blank'; link.rel = 'noopener noreferrer';
      detail.append(small, link); bottom.append(stats, detail); card.append(first, bottom); els.projects.append(card);
    }
  }
  function renderStatus() {
    const data = state.data;
    const fresh = data && data.mode === 'live' && timeValue(data.generated_at);
    if (fresh) {
      const age = Date.now() - Date.parse(data.generated_at);
      const stale = age > 75 * 60000;
      els.scan.textContent = new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(data.generated_at));
      els.dataStatus.textContent = stale ? '⚠ DADOS ATRASADOS' : '● COLETA ATIVA';
      els.scanDetail.textContent = relativeDate(data.generated_at);
      els.sync.innerHTML = '<i class="pulse-dot"></i> ' + (stale ? 'DADOS ATRASADOS' : 'ATUALIZADO');
      els.sync.classList.toggle('warning',stale);
    } else {
      els.scan.textContent = 'PENDENTE';
      els.dataStatus.textContent = 'DADOS INICIAIS';
      els.scanDetail.textContent = 'AINDA NÃO COLETADO';
      els.sync.innerHTML = '<i class="pulse-dot"></i> PRÉVIA LOCAL';
      els.sync.classList.add('warning');
    }
  }
  function notifyNew(newArticles) {
    if (!newArticles.length) return;
    toast(`${newArticles.length} novidade(s) encontrada(s) no radar!`);
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState === 'visible') {
      const first = newArticles[0];
      try { const notification = new Notification('GTA VI RADAR — Novidade', {body:first.title, tag:'gta6radar-news', icon:'favicon.svg'}); notification.onclick = () => window.open(safeUrl(first.url), '_blank', 'noopener'); } catch (_) {}
    }
  }
  let inflight = false;
  async function fetchData(userTriggered = false) {
    if (inflight) return;
    inflight = true;
    els.refresh.classList.add('spinning');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let response;
      try { response = await fetch(`${API}?v=${Date.now()}`, {cache:'no-store', signal:controller.signal}); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = validateData(await response.json());
      const ids = new Set(data.articles.map(a=>a.id));
      if (state.fetchedOnce && data.mode === 'live') notifyNew(data.articles.filter(a=>!state.knownIds.has(a.id)));
      state.knownIds = ids;
      const oldStamp = state.data && state.data.generated_at;
      state.data = data;
      state.fetchedOnce = true;
      renderStatus(); renderArticles(); renderProjects();
      if (userTriggered) toast(oldStamp && oldStamp === data.generated_at ? 'Nenhuma nova coleta publicada ainda.' : 'Radar sincronizado com os dados publicados.');
    } catch (error) {
      if (!state.data) {
        try {
          // O arquivo embutido abaixo deixa a prévia funcionando até mesmo ao abrir index.html diretamente.
          const offline = validateData(window.RADAR_FALLBACK);
          state.data = offline; state.knownIds = new Set(offline.articles.map(a=>a.id));
          renderArticles(); renderProjects(); renderStatus();
        } catch (_) { toast('Não foi possível carregar o feed inicial.'); }
      }
      if (userTriggered) toast('Não foi possível acessar os dados. A versão exibida continua disponível.');
      console.warn('GTA VI Radar: feed indisponível', error);
    } finally { els.refresh.classList.remove('spinning'); inflight = false; }
  }
  for (const tab of els.tabs) tab.addEventListener('click', () => {
    state.category = tab.dataset.category; state.limit = PER_PAGE;
    for (const t of els.tabs) { const isActive = t === tab; t.classList.toggle('active', isActive); t.setAttribute('aria-pressed', String(isActive)); }
    renderArticles();
  });
  els.search.addEventListener('input', (event) => {state.search = event.target.value;state.limit=PER_PAGE;renderArticles();});
  els.sort.addEventListener('change', (event) => {state.sort=event.target.value;renderArticles();});
  els.more.addEventListener('click', () => {state.limit += PER_PAGE;renderArticles();});
  els.saved.addEventListener('click', () => {
    state.onlySaved = !state.onlySaved; state.limit = PER_PAGE;
    els.saved.classList.toggle('active',state.onlySaved); els.saved.setAttribute('aria-pressed',String(state.onlySaved));
    renderArticles();
  });
  $('#clear-filters').addEventListener('click', () => {
    state.category = 'all';state.search='';state.onlySaved=false;state.limit=PER_PAGE;
    els.search.value='';els.saved.classList.remove('active');els.saved.setAttribute('aria-pressed','false');
    for (const tab of els.tabs) {tab.classList.toggle('active',tab.dataset.category==='all');tab.setAttribute('aria-pressed',String(tab.dataset.category==='all'));}
    renderArticles();
  });
  els.refresh.addEventListener('click', () => fetchData(true));
  els.notifications.addEventListener('click', async () => {
    if (!('Notification' in window)) {toast('Seu navegador não oferece notificações.');return;}
    if (location.protocol === 'file:') {toast('Publicar o site em HTTPS é necessário para ativar notificações.');return;}
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {els.notifications.textContent = '✓ ALERTAS ATIVADOS PARA ESTA PÁGINA';toast('Alertas habilitados enquanto o site estiver aberto.');}
      else toast('Permissão não concedida. Você ainda pode acompanhar pelo painel.');
    } catch (_) {toast('Não foi possível solicitar permissão.');}
  });
  function updateClock() {
    $('#clock').textContent = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
    if (state.data) renderStatus();
  }
  // Fallback é inserido em fallback.js — carregado antes deste arquivo na versão de prévia.
  fetchData();
  updateClock(); setInterval(updateClock, 10000);setInterval(()=>fetchData(false),REFRESH_MS);
})();
