(() => {
  const corpus = window.EPS_CORPUS || { cards: [], pages: [], facets: {} };
  const corpusLoaded = Array.isArray(corpus.cards) && corpus.cards.length > 0;
  const STORE_PROGRESS = 'memo_eps_progress_v1';
  const STORE_CUSTOM = 'memo_eps_custom_cards_v1';
  const today = () => new Date().toISOString().slice(0,10);
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { tab:'dashboard', reviewQueue:[], current:null, quiz:null };
  let progress = load(STORE_PROGRESS, {});
  let customCards = load(STORE_CUSTOM, []);
  function load(k, fallback){ try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } }
  function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  function allCards(){ return [...corpus.cards, ...customCards]; }
  function stars(n){ return '★★★★★'.slice(0,Number(n)||0) + '☆☆☆☆☆'.slice(0,5-(Number(n)||0)); }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function due(card){ const p=progress[card.id]; return !p || !p.due || p.due <= today(); }
  function cardText(c){ return [c.question,c.answer,c.type,c.epreuve,c.tome,c.theme,(c.tags||[]).join(' ')].join(' '); }
  function filteredCards(){
    const q=norm($('#searchInput').value), type=$('#typeFilter').value, e=$('#epreuveFilter').value, tome=$('#tomeFilter').value, tag=$('#tagFilter').value, imp=Number($('#minImportance').value||1);
    return allCards().filter(c => (!q || norm(cardText(c)).includes(q)) && (!type || c.type===type) && (!e || c.epreuve===e) && (!tome || c.tome===tome) && (!tag || (c.tags||[]).includes(tag)) && (Number(c.importance)||0)>=imp);
  }
  function initFacets(){
    const cards=allCards();
    fillSelect('#typeFilter', [...new Set(cards.map(c=>c.type).filter(Boolean))].sort());
    fillSelect('#epreuveFilter', [...new Set(cards.map(c=>c.epreuve).filter(Boolean))].sort());
    fillSelect('#tomeFilter', [...new Set(cards.map(c=>c.tome).filter(Boolean))].sort());
    fillSelect('#tagFilter', [...new Set(cards.flatMap(c=>c.tags||[]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr')).slice(0,400));
  }
  function fillSelect(sel, values){ const node=$(sel); const first=node.options[0]; node.innerHTML=''; node.appendChild(first); values.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; node.appendChild(o); }); }
  function render(){ renderDashboard(); if(state.tab==='review') setupReview(); if(state.tab==='timeline') renderTimeline(); if(state.tab==='library') renderLibrary(); if(state.tab==='editor') renderCustom(); }
  function renderDashboard(){
    const cards=filteredCards();
    $('#countCards').textContent=cards.length;
    $('#dueCount').textContent=cards.filter(due).length;
    $('#masteredCount').textContent=cards.filter(c => (progress[c.id]?.streak||0)>=4).length;
    const byType={}; cards.forEach(c=>byType[c.type]=(byType[c.type]||0)+1);
    $('#typeBreakdown').innerHTML=Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="chip">${escapeHtml(k)} · ${v}</span>`).join('');
    const priority=cards.filter(c=>c.importance>=4 && (progress[c.id]?.streak||0)<3).slice(0,12);
    $('#priorityList').innerHTML=priority.map(c=>listItem(c,true)).join('') || '<p>Aucune carte prioritaire dans ce filtre.</p>';
  }
  function listItem(c, actions=false){
    return `<div class="list-item"><h3>${escapeHtml(c.question)}</h3><div class="meta"><span>${escapeHtml(c.type)}</span><span>${stars(c.importance)}</span><span>p. ${c.sourcePage||'perso'}</span><span>${escapeHtml(c.epreuve||'')}</span></div><p>${escapeHtml(String(c.answer).slice(0,240))}${String(c.answer).length>240?'…':''}</p>${actions?`<button class="ghost" onclick="window.MemoEPS.focusCard('${c.id}')">Réviser cette carte</button>`:''}</div>`;
  }
  function setupReview(){
    const cards=filteredCards();
    state.reviewQueue=cards.filter(due);
    if(!state.reviewQueue.length) state.reviewQueue=cards.slice(0,50);
    pickReview();
  }
  function pickReview(){
    const c=state.current && state.reviewQueue.length ? state.current : state.reviewQueue[0];
    state.current=c;
    if(!c){ $('#reviewQuestion').textContent='Aucune carte dans ce filtre.'; $('#reviewMeta').textContent=''; $('#reviewAnswer').hidden=true; return; }
    $('#reviewQuestion').textContent=c.question;
    $('#reviewMeta').innerHTML=`<span class="chip">${escapeHtml(c.type)}</span><span class="chip">${stars(c.importance)}</span><span class="chip">p. ${c.sourcePage||'perso'}</span><span class="chip">${escapeHtml(c.tome||'')}</span>`;
    $('#reviewAnswer').textContent=c.answer;
    $('#reviewAnswer').hidden=true;
    $('#showAnswer').hidden=false;
    $$('.grade').forEach(b=>b.hidden=true);
  }
  function gradeCurrent(grade){
    const c=state.current; if(!c) return;
    const p=progress[c.id] || {seen:0, correct:0, wrong:0, streak:0, interval:0, ease:2.3};
    p.seen++; p.last=today();
    const score={again:0,hard:2,good:4,easy:5}[grade];
    if(score<3){ p.wrong++; p.streak=0; p.interval=1; }
    else { p.correct++; p.streak++; p.interval = grade==='easy' ? Math.max(3, Math.round((p.interval||1)*p.ease)+2) : grade==='good' ? Math.max(2, Math.round((p.interval||1)*p.ease)) : 1; p.ease=Math.min(3.0, p.ease + (grade==='easy'?0.15:grade==='hard'?-0.12:0.03)); }
    const d=new Date(); d.setDate(d.getDate()+p.interval); p.due=d.toISOString().slice(0,10); progress[c.id]=p; save(STORE_PROGRESS,progress);
    state.reviewQueue=state.reviewQueue.filter(x=>x.id!==c.id); state.current=state.reviewQueue[0] || null; renderDashboard(); pickReview();
  }
  function renderTimeline(){
    const cards=filteredCards().filter(c=>c.type==='date' || /^Que faut-il associer à l’année/.test(c.question));
    const items=cards.map(c=>({c,year:(c.question.match(/(19|20)\d{2}/)||[])[0]})).filter(x=>x.year).sort((a,b)=>Number(a.year)-Number(b.year));
    $('#timelineList').innerHTML=items.map(({c,year})=>`<div class="timeline-item"><div class="year">${year}</div><h3>${escapeHtml(c.answer.split('. ')[0])}</h3><p>${escapeHtml(c.answer)}</p><div class="meta"><span>${escapeHtml(c.tome||'')}</span><span>page ${c.sourcePage}</span></div><button class="ghost" onclick="window.MemoEPS.focusCard('${c.id}')">Réviser</button></div>`).join('') || '<p>Aucune date dans ce filtre.</p>';
  }
  function renderLibrary(){
    const q=norm($('#searchInput').value), tome=$('#tomeFilter').value, e=$('#epreuveFilter').value;
    const pages=(corpus.pages||[]).filter(p=>(!q||norm([p.title,p.text,p.tome].join(' ')).includes(q)) && (!tome||p.tome===tome) && (!e||p.epreuve===e));
    $('#libraryList').innerHTML=pages.slice(0,80).map(p=>`<div class="page-card"><details><summary><strong>Page ${p.page}</strong> · ${escapeHtml(p.title)} <span class="meta">${escapeHtml(p.tome)}</span></summary><div class="page-text">${escapeHtml(p.text)}</div><button class="ghost" onclick="window.MemoEPS.makeCardFromPage(${p.page})">Créer une carte depuis cette page</button></details></div>`).join('') + (pages.length>80?`<p>${pages.length-80} pages supplémentaires masquées : affine la recherche.</p>`:'');
  }
  function renderCustom(){
    $('#customCards').innerHTML=customCards.map(c=>`<div class="list-item"><h3>${escapeHtml(c.question)}</h3><p>${escapeHtml(c.answer.slice(0,260))}${c.answer.length>260?'…':''}</p><div class="meta"><span>${escapeHtml(c.type)}</span><span>${stars(c.importance)}</span></div><button class="ghost" onclick="window.MemoEPS.editCustom('${c.id}')">Modifier</button> <button class="danger" onclick="window.MemoEPS.deleteCustom('${c.id}')">Supprimer</button></div>`).join('') || '<p>Aucune carte personnelle.</p>';
  }
  function renderQuiz(){
    const pool=filteredCards().filter(c=>c.answer.length<600 && c.type!=='source');
    if(pool.length<4){ $('#quizBox').innerHTML='<p>Pas assez de cartes dans ce filtre.</p>'; return; }
    const c=pool[Math.floor(Math.random()*pool.length)];
    const opts=[c.answer, ...shuffle(pool.filter(x=>x.id!==c.id).map(x=>x.answer)).slice(0,3)];
    state.quiz={card:c,answer:c.answer};
    $('#quizBox').innerHTML=`<h3>${escapeHtml(c.question)}</h3>${shuffle(opts).map(o=>`<button class="option" data-answer="${escapeAttr(o)}">${escapeHtml(o.slice(0,300))}${o.length>300?'…':''}</button>`).join('')}`;
    $$('.option').forEach(b=>b.addEventListener('click',()=>{ const ok=b.dataset.answer===state.quiz.answer; b.classList.add(ok?'correct':'wrong'); $$('.option').forEach(x=>{ if(x.dataset.answer===state.quiz.answer) x.classList.add('correct'); x.disabled=true; }); }));
  }
  function shuffle(a){ return [...a].sort(()=>Math.random()-.5); }
  function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function escapeAttr(s){ return escapeHtml(s).replace(/\n/g,' '); }
  function switchTab(id){ state.tab=id; $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id)); $$('.panel').forEach(p=>p.classList.toggle('active',p.id===id)); render(); }
  function exportData(){ const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),progress,customCards},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='memo-eps-progression.json'; a.click(); URL.revokeObjectURL(a.href); }
  function importData(file){ const r=new FileReader(); r.onload=()=>{ try{ const data=JSON.parse(r.result); if(data.progress) progress=data.progress; if(data.customCards) customCards=data.customCards; save(STORE_PROGRESS,progress); save(STORE_CUSTOM,customCards); $('#settingsLog').textContent='Import réussi.'; initFacets(); render(); }catch(e){ $('#settingsLog').textContent='Import impossible : '+e.message; } }; r.readAsText(file); }
  function bind(){
    $$('.tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));
    $$('select,input[type=search]').forEach(el=>el.addEventListener('input',render));
    $('#resetFilters').addEventListener('click',()=>{ ['searchInput','typeFilter','epreuveFilter','tomeFilter','tagFilter'].forEach(id=>$('#'+id).value=''); $('#minImportance').value='1'; render(); });
    $$('[data-jump]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.jump)));
    $('#showAnswer').addEventListener('click',()=>{ $('#reviewAnswer').hidden=false; $('#showAnswer').hidden=true; $$('.grade').forEach(b=>b.hidden=false); });
    $$('.grade').forEach(b=>b.addEventListener('click',()=>gradeCurrent(b.dataset.grade)));
    $('#newQuiz').addEventListener('click',renderQuiz);
    $('#exportProgress').addEventListener('click',exportData);
    $('#importProgress').addEventListener('change',e=> e.target.files[0] && importData(e.target.files[0]));
    $('#resetProgress').addEventListener('click',()=>{ if(confirm('Réinitialiser toute la progression ?')){ progress={}; save(STORE_PROGRESS,progress); render(); }});
    $('#cardForm').addEventListener('submit',e=>{ e.preventDefault(); const id=$('#editId').value || 'u'+Date.now(); const card={id, question:$('#formQuestion').value.trim(), answer:$('#formAnswer').value.trim(), type:$('#formType').value.trim()||'concept', epreuve:$('#formEpreuve').value.trim()||'Transversal', tome:'Cartes personnelles', theme:'Cartes personnelles', source:'Ajout utilisateur', sourcePage:null, importance:Number($('#formImportance').value), tags:$('#formTags').value.split(',').map(x=>x.trim()).filter(Boolean)}; customCards=customCards.filter(c=>c.id!==id).concat(card); save(STORE_CUSTOM,customCards); e.target.reset(); $('#editId').value=''; initFacets(); renderCustom(); renderDashboard(); });
    $('#clearForm').addEventListener('click',()=>{$('#cardForm').reset(); $('#editId').value='';});
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
    let deferredInstall; window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstall=e; $('#installBtn').hidden=false; }); $('#installBtn').addEventListener('click',async()=>{ if(deferredInstall){ deferredInstall.prompt(); deferredInstall=null; $('#installBtn').hidden=true; } });
  }
  window.MemoEPS={
    focusCard(id){ const c=allCards().find(x=>x.id===id); if(c){ state.current=c; switchTab('review'); pickReview(); }},
    makeCardFromPage(pageNum){ const p=(corpus.pages||[]).find(x=>x.page===pageNum); if(!p) return; switchTab('editor'); $('#formQuestion').value=`Que retenir de la page ${p.page} - ${p.title} ?`; $('#formAnswer').value=p.text.slice(0,1200); $('#formType').value='source'; $('#formEpreuve').value=p.epreuve||'Transversal'; $('#formImportance').value='3'; $('#formTags').value=[p.tome,p.title].filter(Boolean).join(', '); },
    editCustom(id){ const c=customCards.find(x=>x.id===id); if(!c) return; $('#editId').value=c.id; $('#formQuestion').value=c.question; $('#formAnswer').value=c.answer; $('#formType').value=c.type; $('#formEpreuve').value=c.epreuve; $('#formImportance').value=c.importance; $('#formTags').value=(c.tags||[]).join(', '); window.scrollTo({top:0,behavior:'smooth'}); },
    deleteCustom(id){ customCards=customCards.filter(c=>c.id!==id); save(STORE_CUSTOM,customCards); renderCustom(); renderDashboard(); }
  };
  $('#corpusInfo').textContent = corpusLoaded ? `${corpus.generatedCards || corpus.cards.length} cartes · ${corpus.generatedFromPages || corpus.pages.length} pages sources` : 'Corpus introuvable : vérifie que eps-corpus.js est à la racine du dépôt.';
  initFacets(); bind(); render();
})();
