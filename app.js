(() => {
  const corpus = window.EPS_CORPUS || { cards: [], pages: [], programmes: [] };
  const corpusLoaded = Array.isArray(corpus.cards) && corpus.cards.length > 0;
  const programmes = Array.isArray(corpus.programmes) ? corpus.programmes : [];
  const programmeById = new Map(programmes.map(item => [item.id, item]));

  const STORE_PROGRESS = 'memo_eps_progress_v1';
  const STORE_CUSTOM = 'memo_eps_custom_cards_v1';
  const STORE_OVERRIDES = 'memo_eps_card_overrides_v2';
  const STORE_HIDDEN = 'memo_eps_hidden_cards_v2';

  const today = () => new Date().toISOString().slice(0, 10);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { tab: 'dashboard', reviewQueue: [], current: null, quiz: null, editingId: null };
  const baseIds = new Set((corpus.cards || []).map(card => card.id));

  let progress = load(STORE_PROGRESS, {});
  let customCards = load(STORE_CUSTOM, []);
  let cardOverrides = load(STORE_OVERRIDES, {});
  let hiddenCardIds = load(STORE_HIDDEN, []);

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function baseCard(card) {
    return { ...card, ...(cardOverrides[card.id] || {}), id: card.id };
  }

  function allCards() {
    const hidden = new Set(hiddenCardIds);
    return [
      ...(corpus.cards || []).filter(card => !hidden.has(card.id)).map(baseCard),
      ...customCards
    ];
  }

  function getCard(id) {
    return allCards().find(card => card.id === id);
  }

  function isBaseCard(id) {
    return baseIds.has(id);
  }

  function programmeName(id) {
    return programmeById.get(id)?.name || '';
  }

  function stars(value) {
    const number = Number(value) || 0;
    return '★★★★★'.slice(0, number) + '☆☆☆☆☆'.slice(0, 5 - number);
  }

  function norm(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function due(card) {
    const cardProgress = progress[card.id];
    return !cardProgress || !cardProgress.due || cardProgress.due <= today();
  }

  function cardText(card) {
    return [
      card.question, card.answer, card.type, card.epreuve, card.tome,
      card.theme, card.programme, programmeName(card.programme), (card.tags || []).join(' ')
    ].join(' ');
  }

  function filteredCards() {
    const query = norm($('#searchInput').value);
    const type = $('#typeFilter').value;
    const programme = $('#programmeFilter').value;
    const epreuve = $('#epreuveFilter').value;
    const tome = $('#tomeFilter').value;
    const tag = $('#tagFilter').value;
    const importance = Number($('#minImportance').value || 1);

    return allCards().filter(card =>
      (!query || norm(cardText(card)).includes(query)) &&
      (!type || card.type === type) &&
      (!programme || card.programme === programme) &&
      (!epreuve || card.epreuve === epreuve) &&
      (!tome || card.tome === tome) &&
      (!tag || (card.tags || []).includes(tag)) &&
      (Number(card.importance) || 0) >= importance
    );
  }

  function fillSelect(selector, entries) {
    const node = $(selector);
    const defaultText = node.options[0]?.textContent || 'Tous';
    node.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = defaultText;
    node.appendChild(blank);
    entries.forEach(entry => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      node.appendChild(option);
    });
  }

  function initFacets() {
    const cards = allCards();
    fillSelect('#typeFilter', [...new Set(cards.map(card => card.type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')).map(value => ({ value, label: value })));
    fillSelect('#programmeFilter', programmes.map(item => ({ value: item.id, label: item.name })));
    fillSelect('#epreuveFilter', [...new Set(cards.map(card => card.epreuve).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')).map(value => ({ value, label: value })));
    fillSelect('#tomeFilter', [...new Set(cards.map(card => card.tome).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')).map(value => ({ value, label: value })));
    fillSelect('#tagFilter', [...new Set(cards.flatMap(card => card.tags || []).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 400).map(value => ({ value, label: value })));
  }

  function render() {
    renderDashboard();
    renderSettingsStatus();
    if (state.tab === 'programmes') renderProgrammes();
    if (state.tab === 'review') setupReview();
    if (state.tab === 'timeline') renderTimeline();
    if (state.tab === 'library') renderLibrary();
    if (state.tab === 'editor') renderCustom();
  }

  function renderDashboard() {
    const cards = filteredCards();
    $('#countCards').textContent = cards.length;
    $('#dueCount').textContent = cards.filter(due).length;
    $('#masteredCount').textContent = cards.filter(card => (progress[card.id]?.streak || 0) >= 4).length;

    const byType = {};
    cards.forEach(card => { byType[card.type] = (byType[card.type] || 0) + 1; });
    $('#typeBreakdown').innerHTML = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `<span class="chip">${escapeHtml(type)} · ${count}</span>`)
      .join('') || '<span class="helper-text">Aucune carte avec ces filtres.</span>';

    const priority = cards
      .filter(card => card.importance >= 4 && (progress[card.id]?.streak || 0) < 3)
      .slice(0, 12);
    $('#priorityList').innerHTML = priority.map(card => listItem(card, true)).join('') || '<p>Aucune carte prioritaire dans ce filtre.</p>';
  }

  function listItem(card, actions = false) {
    const reviewAction = actions
      ? `<button class="ghost" onclick="window.MemoEPS.focusCard('${escapeAttr(card.id)}')">Réviser cette carte</button>`
      : '';
    const programme = programmeName(card.programme);
    return `<div class="list-item">
      <h3>${escapeHtml(card.question)}</h3>
      <div class="meta">
        <span>${escapeHtml(card.type)}</span><span>${stars(card.importance)}</span>
        ${card.sourcePage ? `<span>p. ${card.sourcePage}</span>` : ''}
        ${card.epreuve ? `<span>${escapeHtml(card.epreuve)}</span>` : ''}
        ${programme ? `<span>${escapeHtml(programme)}</span>` : ''}
      </div>
      <p>${escapeHtml(String(card.answer).slice(0, 260))}${String(card.answer).length > 260 ? '…' : ''}</p>
      ${reviewAction}
    </div>`;
  }

  function renderProgrammes() {
    const selected = $('#programmeFilter').value;
    const visible = programmes.filter(programme => !selected || programme.id === selected);
    $('#programmesList').innerHTML = visible.map(programme => {
      const cards = allCards().filter(card => card.programme === programme.id).length;
      const essentialHtml = programme.essentials.map(item => `
        <div class="programme-point"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.text)}</p></div>`).join('');
      const citationHtml = programme.citations.map(item => `
        <div class="programme-citation"><blockquote>${escapeHtml(item.quote)}</blockquote><p><strong>${escapeHtml(item.reference)}</strong></p><p>${escapeHtml(item.use)}</p></div>`).join('');
      return `<article class="card programme-card">
        <div class="programme-head">
          <div><p class="eyebrow dark">${escapeHtml(programme.level)}</p><h3>${escapeHtml(programme.name)}</h3></div>
          <button class="primary" onclick="window.MemoEPS.focusProgramme('${escapeAttr(programme.id)}')">Réviser ${cards} cartes</button>
        </div>
        <p class="programme-summary">${escapeHtml(programme.summary)}</p>
        <p class="reference-line"><strong>Texte repère :</strong> ${escapeHtml(programme.reference)}</p>
        <details open><summary>Essentiels du programme</summary><div class="programme-points">${essentialHtml}</div></details>
        <details><summary>Citations institutionnelles mobilisables</summary><div class="programme-citations">${citationHtml}</div></details>
      </article>`;
    }).join('') || '<article class="card"><p>Aucun programme ne correspond au filtre.</p></article>';
  }

  function setupReview() {
    const cards = filteredCards();
    state.reviewQueue = cards.filter(due);
    if (!state.reviewQueue.length) state.reviewQueue = cards.slice(0, 50);
    if (!state.current || !state.reviewQueue.some(card => card.id === state.current.id)) {
      state.current = state.reviewQueue[0] || null;
    }
    pickReview();
  }

  function pickReview() {
    const card = state.current;
    if (!card) {
      $('#reviewQuestion').textContent = 'Aucune carte dans ce filtre.';
      $('#reviewMeta').textContent = '';
      $('#reviewAnswer').textContent = '';
      $('#reviewAnswer').hidden = true;
      $('#showAnswer').hidden = true;
      $('#editCurrent').disabled = true;
      $('#deleteCurrent').disabled = true;
      $$('.grade').forEach(button => { button.hidden = true; });
      closeReviewEditor();
      return;
    }

    const programme = programmeName(card.programme);
    $('#reviewQuestion').textContent = card.question;
    $('#reviewMeta').innerHTML = [
      `<span class="chip">${escapeHtml(card.type)}</span>`,
      `<span class="chip">${stars(card.importance)}</span>`,
      card.sourcePage ? `<span class="chip">p. ${card.sourcePage}</span>` : '',
      card.tome ? `<span class="chip">${escapeHtml(card.tome)}</span>` : '',
      programme ? `<span class="chip">${escapeHtml(programme)}</span>` : ''
    ].filter(Boolean).join('');
    $('#reviewAnswer').textContent = card.answer;
    $('#reviewAnswer').hidden = true;
    $('#showAnswer').hidden = false;
    $('#editCurrent').disabled = false;
    $('#deleteCurrent').disabled = false;
    $$('.grade').forEach(button => { button.hidden = true; });
    closeReviewEditor();
  }

  function gradeCurrent(grade) {
    const card = state.current;
    if (!card) return;
    const cardProgress = progress[card.id] || { seen: 0, correct: 0, wrong: 0, streak: 0, interval: 0, ease: 2.3 };
    cardProgress.seen += 1;
    cardProgress.last = today();
    const score = { again: 0, hard: 2, good: 4, easy: 5 }[grade];

    if (score < 3) {
      cardProgress.wrong += 1;
      cardProgress.streak = 0;
      cardProgress.interval = 1;
    } else {
      cardProgress.correct += 1;
      cardProgress.streak += 1;
      cardProgress.interval = grade === 'easy'
        ? Math.max(3, Math.round((cardProgress.interval || 1) * cardProgress.ease) + 2)
        : grade === 'good'
          ? Math.max(2, Math.round((cardProgress.interval || 1) * cardProgress.ease))
          : 1;
      cardProgress.ease = Math.min(3.0, cardProgress.ease + (grade === 'easy' ? 0.15 : grade === 'hard' ? -0.12 : 0.03));
    }

    const next = new Date();
    next.setDate(next.getDate() + cardProgress.interval);
    cardProgress.due = next.toISOString().slice(0, 10);
    progress[card.id] = cardProgress;
    save(STORE_PROGRESS, progress);

    state.reviewQueue = state.reviewQueue.filter(item => item.id !== card.id);
    state.current = state.reviewQueue[0] || null;
    renderDashboard();
    pickReview();
  }

  function openReviewEditor() {
    const card = state.current;
    if (!card) return;
    state.editingId = card.id;
    $('#reviewEditQuestion').value = card.question || '';
    $('#reviewEditAnswer').value = card.answer || '';
    $('#reviewEditType').value = card.type || '';
    $('#reviewEditEpreuve').value = card.epreuve || '';
    $('#reviewEditTome').value = card.tome || '';
    $('#reviewEditImportance').value = String(card.importance || 3);
    $('#reviewEditTags').value = (card.tags || []).join(', ');
    $('#reviewEditNote').textContent = isBaseCard(card.id)
      ? 'Cette modification remplace localement la version du corpus et sera incluse dans ton export.'
      : 'Cette carte personnelle sera modifiée directement dans ta bibliothèque.';
    $('#reviewEditForm').hidden = false;
    $('#reviewEditQuestion').focus();
    $('#reviewEditForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeReviewEditor() {
    state.editingId = null;
    const panel = $('#reviewEditForm');
    if (panel) panel.hidden = true;
  }

  function saveReviewEdit(event) {
    event.preventDefault();
    const id = state.editingId;
    const original = getCard(id);
    if (!id || !original) return;
    const updated = {
      ...original,
      id,
      question: $('#reviewEditQuestion').value.trim(),
      answer: $('#reviewEditAnswer').value.trim(),
      type: $('#reviewEditType').value.trim() || 'notion',
      epreuve: $('#reviewEditEpreuve').value.trim() || 'Transversal',
      tome: $('#reviewEditTome').value.trim() || original.tome || 'Cartes personnelles',
      importance: Number($('#reviewEditImportance').value || 3),
      tags: $('#reviewEditTags').value.split(',').map(value => value.trim()).filter(Boolean)
    };
    if (!updated.question || !updated.answer) {
      $('#reviewEditNote').textContent = 'La question et la réponse doivent être renseignées.';
      return;
    }
    if (isBaseCard(id)) {
      cardOverrides[id] = {
        ...cardOverrides[id],
        question: updated.question, answer: updated.answer, type: updated.type,
        epreuve: updated.epreuve, tome: updated.tome, importance: updated.importance, tags: updated.tags
      };
      save(STORE_OVERRIDES, cardOverrides);
    } else {
      customCards = customCards.map(card => card.id === id ? updated : card);
      save(STORE_CUSTOM, customCards);
    }
    state.current = getCard(id);
    state.reviewQueue = state.reviewQueue.map(card => card.id === id ? state.current : card);
    closeReviewEditor();
    initFacets();
    renderDashboard();
    renderSettingsStatus();
    pickReview();
  }

  function deleteCurrentCard() {
    const card = state.current;
    if (!card) return;
    const message = isBaseCard(card.id)
      ? 'Supprimer cette carte du corpus de tes révisions ? Elle pourra être restaurée depuis Import / export.'
      : 'Supprimer définitivement cette carte personnelle ?';
    if (!confirm(message)) return;
    if (isBaseCard(card.id)) {
      hiddenCardIds = [...new Set([...hiddenCardIds, card.id])];
      save(STORE_HIDDEN, hiddenCardIds);
    } else {
      customCards = customCards.filter(item => item.id !== card.id);
      save(STORE_CUSTOM, customCards);
    }
    delete progress[card.id];
    save(STORE_PROGRESS, progress);
    state.reviewQueue = state.reviewQueue.filter(item => item.id !== card.id);
    state.current = null;
    closeReviewEditor();
    initFacets();
    render();
  }

  function renderTimeline() {
    const cards = filteredCards().filter(card => card.type === 'date');
    const items = cards
      .map(card => ({ card, year: (card.question.match(/(19|20)\d{2}(?:-\d{4})?/) || [])[0] }))
      .filter(item => item.year)
      .sort((a, b) => Number(a.year.slice(0, 4)) - Number(b.year.slice(0, 4)));
    $('#timelineList').innerHTML = items.map(({ card, year }) => `<div class="timeline-item">
      <div class="year">${year}</div>
      <h3>${escapeHtml(card.answer.split('. ')[0])}</h3>
      <p>${escapeHtml(card.answer)}</p>
      <div class="meta"><span>${escapeHtml(card.tome || '')}</span>${card.sourcePage ? `<span>page ${card.sourcePage}</span>` : ''}</div>
      <button class="ghost" onclick="window.MemoEPS.focusCard('${escapeAttr(card.id)}')">Réviser</button>
    </div>`).join('') || '<p>Aucune date dans ce filtre.</p>';
  }

  function renderLibrary() {
    const query = norm($('#searchInput').value);
    const tome = $('#tomeFilter').value;
    const epreuve = $('#epreuveFilter').value;
    const pages = (corpus.pages || []).filter(page =>
      (!query || norm([page.title, page.text, page.tome].join(' ')).includes(query)) &&
      (!tome || page.tome === tome) &&
      (!epreuve || page.epreuve === epreuve)
    );
    $('#libraryList').innerHTML = pages.slice(0, 80).map(page => `<div class="page-card">
      <details>
        <summary><strong>Page ${page.page}</strong> · ${escapeHtml(page.title)} <span class="meta">${escapeHtml(page.tome)}</span></summary>
        <div class="page-text">${escapeHtml(page.text)}</div>
        <button class="ghost" onclick="window.MemoEPS.makeCardFromPage(${page.page})">Préparer une carte depuis cette page</button>
      </details>
    </div>`).join('') + (pages.length > 80 ? `<p>${pages.length - 80} pages supplémentaires masquées : affine la recherche.</p>` : '');
  }

  function renderCustom() {
    $('#customCards').innerHTML = customCards.map(card => `<div class="list-item">
      <h3>${escapeHtml(card.question)}</h3>
      <p>${escapeHtml(card.answer.slice(0, 260))}${card.answer.length > 260 ? '…' : ''}</p>
      <div class="meta"><span>${escapeHtml(card.type)}</span><span>${stars(card.importance)}</span></div>
      <button class="ghost" onclick="window.MemoEPS.editCustom('${escapeAttr(card.id)}')">Modifier</button>
      <button class="danger" onclick="window.MemoEPS.deleteCustom('${escapeAttr(card.id)}')">Supprimer</button>
    </div>`).join('') || '<p>Aucune carte personnelle.</p>';
  }

  function renderQuiz() {
    const pool = filteredCards().filter(card => card.answer.length < 650);
    if (pool.length < 4) {
      $('#quizBox').innerHTML = '<p>Pas assez de cartes dans ce filtre.</p>';
      return;
    }
    const card = pool[Math.floor(Math.random() * pool.length)];
    const options = [card.answer, ...shuffle(pool.filter(item => item.id !== card.id).map(item => item.answer)).slice(0, 3)];
    state.quiz = { card, answer: card.answer };
    $('#quizBox').innerHTML = `<h3>${escapeHtml(card.question)}</h3>${shuffle(options).map(option =>
      `<button class="option" data-answer="${escapeAttr(option)}">${escapeHtml(option.slice(0, 320))}${option.length > 320 ? '…' : ''}</button>`
    ).join('')}`;
    $$('.option').forEach(button => button.addEventListener('click', () => {
      const correct = button.dataset.answer === state.quiz.answer;
      button.classList.add(correct ? 'correct' : 'wrong');
      $$('.option').forEach(option => {
        if (option.dataset.answer === state.quiz.answer) option.classList.add('correct');
        option.disabled = true;
      });
    }));
  }

  function renderSettingsStatus() {
    const edited = Object.keys(cardOverrides).filter(id => baseIds.has(id)).length;
    const deleted = hiddenCardIds.filter(id => baseIds.has(id)).length;
    const node = $('#cardEditStatus');
    if (node) node.textContent = edited || deleted
      ? `${edited} carte${edited > 1 ? 's' : ''} modifiée${edited > 1 ? 's' : ''} · ${deleted} carte${deleted > 1 ? 's' : ''} retirée${deleted > 1 ? 's' : ''} du corpus.`
      : 'Aucune modification locale du corpus.';
  }

  function resetCorpusEdits() {
    if (!confirm('Restaurer toutes les cartes du corpus retirées ou modifiées ? Tes cartes personnelles et ta progression seront conservées.')) return;
    cardOverrides = {};
    hiddenCardIds = [];
    save(STORE_OVERRIDES, cardOverrides);
    save(STORE_HIDDEN, hiddenCardIds);
    state.current = null;
    initFacets();
    render();
    $('#settingsLog').textContent = 'Les cartes du corpus ont été restaurées.';
  }

  function shuffle(array) {
    return [...array].sort(() => Math.random() - 0.5);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/\n/g, ' ');
  }

  function switchTab(id) {
    state.tab = id;
    $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === id));
    $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === id));
    render();
  }

  function exportData() {
    const data = { version: 4, exportedAt: new Date().toISOString(), progress, customCards, cardOverrides, hiddenCardIds };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'memo-eps-progression-et-cartes.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.progress) progress = data.progress;
        if (data.customCards) customCards = data.customCards;
        if (data.cardOverrides && typeof data.cardOverrides === 'object') cardOverrides = data.cardOverrides;
        if (Array.isArray(data.hiddenCardIds)) hiddenCardIds = data.hiddenCardIds;
        save(STORE_PROGRESS, progress);
        save(STORE_CUSTOM, customCards);
        save(STORE_OVERRIDES, cardOverrides);
        save(STORE_HIDDEN, hiddenCardIds);
        $('#settingsLog').textContent = 'Import réussi.';
        state.current = null;
        initFacets();
        render();
      } catch (error) {
        $('#settingsLog').textContent = 'Import impossible : ' + error.message;
      }
    };
    reader.readAsText(file);
  }

  function populatePersonalForm(card) {
    $('#editId').value = card.id;
    $('#formQuestion').value = card.question;
    $('#formAnswer').value = card.answer;
    $('#formType').value = card.type;
    $('#formEpreuve').value = card.epreuve;
    $('#formImportance').value = card.importance;
    $('#formTags').value = (card.tags || []).join(', ');
  }

  function bind() {
    $$('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    $$('select,input[type=search]').forEach(element => element.addEventListener('input', () => {
      state.current = null;
      render();
    }));

    $('#resetFilters').addEventListener('click', () => {
      ['searchInput', 'typeFilter', 'programmeFilter', 'epreuveFilter', 'tomeFilter', 'tagFilter'].forEach(id => { $('#' + id).value = ''; });
      $('#minImportance').value = '1';
      state.current = null;
      render();
    });

    $$('[data-jump]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.jump)));
    $('#showAnswer').addEventListener('click', () => {
      $('#reviewAnswer').hidden = false;
      $('#showAnswer').hidden = true;
      $$('.grade').forEach(button => { button.hidden = false; });
    });
    $$('.grade').forEach(button => button.addEventListener('click', () => gradeCurrent(button.dataset.grade)));
    $('#editCurrent').addEventListener('click', openReviewEditor);
    $('#deleteCurrent').addEventListener('click', deleteCurrentCard);
    $('#reviewEditForm').addEventListener('submit', saveReviewEdit);
    $('#cancelReviewEdit').addEventListener('click', closeReviewEditor);
    $('#newQuiz').addEventListener('click', renderQuiz);
    $('#exportProgress').addEventListener('click', exportData);
    $('#importProgress').addEventListener('change', event => event.target.files[0] && importData(event.target.files[0]));
    $('#resetProgress').addEventListener('click', () => {
      if (confirm('Réinitialiser toute la progression ?')) {
        progress = {};
        save(STORE_PROGRESS, progress);
        render();
      }
    });
    $('#resetCorpusEdits').addEventListener('click', resetCorpusEdits);

    $('#cardForm').addEventListener('submit', event => {
      event.preventDefault();
      const id = $('#editId').value || 'u' + Date.now();
      const existing = customCards.find(card => card.id === id);
      const card = {
        id,
        question: $('#formQuestion').value.trim(),
        answer: $('#formAnswer').value.trim(),
        type: $('#formType').value.trim() || 'notion',
        epreuve: $('#formEpreuve').value.trim() || 'Transversal',
        tome: existing?.tome || 'Cartes personnelles',
        theme: existing?.theme || 'Cartes personnelles',
        source: existing?.source || 'Ajout utilisateur',
        sourcePage: existing?.sourcePage || null,
        programme: existing?.programme || null,
        importance: Number($('#formImportance').value),
        tags: $('#formTags').value.split(',').map(value => value.trim()).filter(Boolean)
      };
      customCards = customCards.filter(item => item.id !== id).concat(card);
      save(STORE_CUSTOM, customCards);
      event.target.reset();
      $('#editId').value = '';
      initFacets();
      renderCustom();
      renderDashboard();
    });

    $('#clearForm').addEventListener('click', () => {
      $('#cardForm').reset();
      $('#editId').value = '';
      $('#formType').value = 'notion';
    });

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    let deferredInstall;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstall = event;
      $('#installBtn').hidden = false;
    });
    $('#installBtn').addEventListener('click', async () => {
      if (deferredInstall) {
        deferredInstall.prompt();
        deferredInstall = null;
        $('#installBtn').hidden = true;
      }
    });
  }

  window.MemoEPS = {
    focusCard(id) {
      const card = getCard(id);
      if (!card) return;
      state.current = card;
      switchTab('review');
      if (!state.reviewQueue.some(item => item.id === id)) state.reviewQueue = [card, ...state.reviewQueue];
      pickReview();
    },
    focusProgramme(id) {
      $('#searchInput').value = '';
      $('#typeFilter').value = '';
      $('#programmeFilter').value = id;
      $('#epreuveFilter').value = '';
      $('#tomeFilter').value = '';
      $('#tagFilter').value = '';
      $('#minImportance').value = '1';
      state.current = null;
      switchTab('review');
    },
    makeCardFromPage(pageNum) {
      const page = (corpus.pages || []).find(item => item.page === pageNum);
      if (!page) return;
      switchTab('editor');
      $('#formQuestion').value = `Quelle connaissance précise extraire de la page ${page.page} - ${page.title} ?`;
      $('#formAnswer').value = `À reformuler en réponse courte avec une référence et un usage :\n${page.text.slice(0, 700)}`;
      $('#formType').value = 'notion';
      $('#formEpreuve').value = page.epreuve || 'Transversal';
      $('#formImportance').value = '3';
      $('#formTags').value = [page.tome, page.title].filter(Boolean).join(', ');
    },
    editCustom(id) {
      const card = customCards.find(item => item.id === id);
      if (!card) return;
      switchTab('editor');
      populatePersonalForm(card);
      $('#formQuestion').focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    deleteCustom(id) {
      if (!confirm('Supprimer cette carte personnelle ?')) return;
      customCards = customCards.filter(card => card.id !== id);
      save(STORE_CUSTOM, customCards);
      initFacets();
      render();
    }
  };

  $('#corpusInfo').textContent = corpusLoaded
    ? `${corpus.generatedCards || corpus.cards.length} cartes curatées · ${corpus.generatedFromPages || corpus.pages.length} pages sources · ${corpus.programmeCount || programmes.length} programmes`
    : 'Corpus introuvable : vérifie que eps-corpus.js est à la racine du dépôt.';

  initFacets();
  bind();
  render();
})();
