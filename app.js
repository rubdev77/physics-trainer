import {spring, step, settle, stillMoving, reducedMotion} from './spring.js';
import {attachWorkspace, drawingSurface, workspacePreferences} from './workspace.js';
import {icon} from './icons.js';

const content = document.querySelector('#content');
const dialog = document.querySelector('#zoom');
const bottomBar = document.querySelector('.bottom-bar');
const storageKey = 'fizika-bank1-v1';
const modes = {practice:'Մարզում', exam:'Փորձնական քննություն', review:'Կրկնություն', stats:'Վիճակագրություն'};
const reviewNames = {errors:'Սխալներ', slow:'Դանդաղ լուծվածներ', marked:'Նշվածներ'};
const slowSeconds = 90;
const minSample = 5;
let data, questions, bookNumbers, topics, books, groups, chapterQuestions;
let view = 'practice';
let review = 'errors';
let catalog = {book:null,group:null,topic:null};
let practiceKey = null;
let opened = false;
let resultIndex = null;
let tick = null;
let detachWorkspace;
let state = {sessions:{}, practiceByTopic:{}, lastPractice:null, attempts:[], marks:{}, settings:{}};
let storageFailed = false;
try { state = {...state, ...JSON.parse(localStorage.getItem(storageKey))}; }
catch { storageFailed = true; }

const el = (selector) => content.querySelector(selector);
const now = () => Date.now();
const active = () => view === 'practice' && practiceKey ? state.practiceByTopic[practiceKey] : state.sessions[view];
const chapterPool = (id) => chapterQuestions.get(id) || [];
const bookForQuestion = (q) => q.bookId || data.books[0].id;
const bookName = (book) => `Ժողովածու ${book.number}`;
const questionBookName = (q) => bookName(books.get(bookForQuestion(q)));
const chapterName = (topic) => `${topic.number}. ${topic.name}`;
const sectionName = (group) => `${group.number}. ${group.name}`;
const number = (value) => new Intl.NumberFormat('hy-AM').format(value);
const seconds = (value) => Math.round(value / 1000);
const numberOf = (id) => questions.get(id).number;
function isCorrect(question, answer) { return answer === question.answerId; }
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 60), s % 60].map(v => String(v).padStart(2, '0')).join(':');
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { storageFailed = true; }
  const warning = el('#storage-warning');
  if (warning) warning.hidden = !storageFailed;
}
function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
function currentId(session) { return session.ids[session.index]; }
function charge() {
  if (!tick) return;
  const end = tick.session.deadline ? Math.min(now(),tick.session.deadline) : now();
  const elapsed = Math.max(0,end - tick.start);
  const timing = tick.session.times;
  if (!tick.session.finished && (!tick.session.answers[tick.id] || tick.session.mode === 'exam')) {
    timing[tick.id] = (timing[tick.id] || 0) + elapsed;
  }
  if (!tick.session.finished) tick.session.elapsed += elapsed;
  tick.start = end;
}
function restartTick() {
  tick = null;
  const session = active();
  if (opened && session && !session.finished && !document.hidden) {
    tick = {session, id:currentId(session), start:now()};
  }
}
function record(session, id, optionId) {
  const question = questions.get(id);
  state.attempts.push({
    questionId:id, optionId, correct:question.reviewNote ? null : isCorrect(question,optionId),
    ms:session.times[id] || 0, mode:session.mode, at:now()
  });
}
function finish(session, expired = false) {
  if (session.finished) return;
  if (tick?.session === session) charge();
  if (session.mode === 'exam') {
    if (session.startedAt) session.elapsed = Math.max(0, Math.min(now(),session.deadline) - session.startedAt);
    for (const [id, optionId] of Object.entries(session.answers)) record(session,id,optionId);
  }
  session.finished = true;
  session.expired = expired;
  resultIndex = null;
  save();
}
function expireExam() {
  const exam = state.sessions.exam;
  if (exam && !exam.finished && now() >= exam.deadline) {
    finish(exam,true);
    if (view === 'exam' && opened) render();
  }
}
function changeView(next) {
  charge();
  view = next;
  opened = false;
  resultIndex = null;
  if (next === 'practice') {
    catalog = {book:null,group:null,topic:null};
    practiceKey = state.practiceByTopic[state.lastPractice] ? state.lastPractice : null;
  }
  save();
  render(true);
}
function reviewItems(type) {
  if (type === 'marked') return data.questions.filter(q => state.marks[q.id]);
  const latest = new Map(state.attempts.map(a => [a.questionId,a]));
  return data.questions.filter(q => type === 'errors'
    ? latest.get(q.id)?.correct === false
    : (latest.get(q.id)?.ms || 0) >= slowSeconds * 1000);
}
function markupHeader(title, description = '') {
  return `<header class="page-heading"><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</header>`;
}
function resumePanel(session = active(), legacy = false) {
  if (!session) return '';
  const done = Object.keys(session.answers).length;
  const topic = !legacy && practiceKey && view === 'practice' ? topics.get(practiceKey) : null;
  return `<section class="card resume row between"><div>
    <h2>${topic ? chapterName(topic) : session.finished ? 'Վերջին արդյունքը' : 'Պահված աշխատաշրջան'}</h2>
    <p class="muted">${topic ? questionBookName(questions.get(session.ids[0])) + ' · ' : ''}${done} / ${session.ids.length} պատասխանված</p></div>
    <button class="plain" id="${legacy?'resume-legacy':'resume'}">${session.finished ? 'Դիտել արդյունքը' : 'Շարունակել'}${icon('chevronRight')}</button></section>`;
}
function catalogPath() {
  const book = books.get(catalog.book);
  const group = groups.get(catalog.group);
  const topic = topics.get(catalog.topic);
  const items = [
    ['books','Ժողովածուներ'],
    ...(book ? [['book',bookName(book)]] : []),
    ...(group ? [['section',sectionName(group)]] : []),
    ...(topic ? [['chapter',chapterName(topic)]] : [])
  ];
  if (items.length === 1) return '';
  return `<nav class="breadcrumbs" aria-label="Ընթացիկ բաժինը">${items.map(([depth,label],index) =>
    index===items.length-1 ? `<span aria-current="page">${label}</span>` : `<button type="button" data-catalog="${depth}">${label}</button><span aria-hidden="true">/</span>`
  ).join('')}</nav>`;
}
function numberRange(pool) {
  return pool.length ? `№ ${pool[0].number}–${pool.at(-1).number}` : '';
}
function catalogRow({number,title,detail,button,id}) {
  const body = `<span class="catalog-index">${number}</span><span class="catalog-copy"><strong>${title}</strong><small>${detail}</small></span>`;
  return button ? `<button type="button" class="catalog-row" data-${button}="${id}">${body}<span class="catalog-arrow">${icon('chevronRight')}</span></button>` :
    `<div class="catalog-row unavailable">${body}</div>`;
}
function renderCatalog() {
  const book = books.get(catalog.book);
  const group = groups.get(catalog.group);
  const topic = topics.get(catalog.topic);
  if (topic) {
    const pool = chapterPool(topic.id);
    return catalogPath() + markupHeader(chapterName(topic), `${pool.length} առաջադրանք · ${numberRange(pool)}`) +
      resumePanel() + (pool.length ? renderSettings() + jumpForm(null) : '<p class="card muted">Այս գլխի առաջադրանքները դեռ չեն ավելացվել։</p>');
  }
  let heading, rows;
  if (group) {
    heading = sectionName(group);
    rows = group.topics.map(id=>{
      const item = topics.get(id);
      const pool = chapterPool(id);
      return catalogRow({number:item.number,title:item.name,detail:pool.length ? `${pool.length} առաջադրանք · ${numberRange(pool)}` : 'Առաջադրանքները դեռ չեն ավելացվել',button:pool.length ? 'open-chapter' : null,id});
    });
  } else if (book) {
    heading = `${book.title} ${book.number}`;
    rows = book.groups.map(id=>{
      const item = groups.get(id);
      const count = item.topics.reduce((total,key)=>total+chapterPool(key).length,0);
      return catalogRow({number:item.number,title:item.name,detail:count ? `${item.topics.length} գլուխ · ${count} առաջադրանք` : 'Բովանդակություն',button:'open-section',id});
    });
  } else {
    heading = 'Ժողովածուներ';
    rows = data.books.map(item=>{
      const count = item.groups.flatMap(id=>groups.get(id).topics).reduce((total,key)=>total+chapterPool(key).length,0);
      return catalogRow({number:item.number,title:`${item.title} ${item.number}`,detail:count ? `${count} առաջադրանք` : 'Բնօրինակը դեռ չի ավելացվել',button:item.groups.length ? 'open-book' : null,id:item.id});
    });
  }
  const canJump = !book || bookNumbers.get(book.id)?.size;
  return catalogPath() + markupHeader(heading) + (!book ? resumePanel() + (practiceKey && state.sessions.practice ? resumePanel(state.sessions.practice,true) : '') : '') +
    `<div class="catalog-stack">${rows.join('')}</div>` + (canJump ? jumpForm(null) : '');
}
function toggleSwitch(name, label, checked, controls = '', glyph = '') {
  return `<label class="shuffle-switch"${glyph ? ` title="${label}"` : ''}>
    <span class="switch-label">${label}</span>
    <span class="switch-control">
      <input type="checkbox" role="switch" name="${name}" ${checked ? 'checked' : ''} ${controls ? `aria-controls="${controls}"` : ''}>
      <span class="switch-track" aria-hidden="true"><span class="switch-thumb">${glyph ? icon(glyph) : ''}</span></span>
    </span>
  </label>`;
}
function renderSettings() {
  const settings = state.settings[view] || {};
  const exam = view === 'exam';
  return `<form id="setup" class="card settings">
    ${exam ? `<label class="form-field">Առաջադրանքների շրջանակը
      <select name="scope">${data.books.flatMap(book=>book.groups.map(id=>groups.get(id)).filter(group=>group.topics.some(id=>chapterPool(id).length)).map(group=>
        `<optgroup label="${bookName(book)} · ${sectionName(group)}"><option value="${group.id}" ${settings.scope===group.id?'selected':''}>${bookName(book)} · ${sectionName(group)}</option>${group.topics.filter(id=>chapterPool(id).length).map(id=>
          `<option value="${id}" ${settings.scope===id?'selected':''}>${bookName(book)} · ${chapterName(topics.get(id))}</option>`).join('')}</optgroup>`)).join('')}</select></label>
    <div class="exam-fields"><label class="form-field">Առաջադրանքների քանակ
      <input name="count" type="number" min="1" required value="${settings.count || 20}"></label>
    <label class="form-field">Ժամանակը (րոպե)
      <input name="minutes" type="number" min="1" max="600" required value="${settings.minutes || 30}"></label></div>` : ''}
    <details class="options-panel" ${exam ? 'open' : ''}><summary>Հերթականություն</summary>
      ${toggleSwitch('random','Խառնել առաջադրանքները',settings.random ?? exam)}
      ${toggleSwitch('mix','Խառնել պատասխանների տարբերակները',settings.mix)}
    </details>
    <div class="row settings-actions"><button class="primary" id="start">${icon('play')}${exam ? 'Սկսել քննությունը' : view==='review' ? 'Սկսել կրկնությունը' : active() ? 'Սկսել նոր մարզում' : 'Սկսել մարզումը'}</button>
    <small id="availability" aria-live="polite"></small></div>
  </form>`;
}
function renderSetup() {
  if (view === 'practice') return renderCatalog();
  if (view === 'exam') return markupHeader(modes.exam,'Ընտրեք բաժինը կամ գլուխը, առաջադրանքների քանակը և ժամանակը։') + resumePanel() + renderSettings();
  const tabs = Object.entries(reviewNames).map(([id,label]) =>
    `<button class="tab" type="button" data-review="${id}" aria-pressed="${id===review}">${label} · ${reviewItems(id).length}</button>`).join('');
  return markupHeader(modes.review) + resumePanel() + `<div class="pills">${tabs}</div>` +
    (reviewItems(review).length ? renderSettings() : '<p class="card muted">Այս խումբը դեռ դատարկ է։</p>');
}
function available(form) {
  if (view === 'review') return reviewItems(review);
  if (view === 'practice') return chapterPool(catalog.topic);
  const id = new FormData(form).get('scope');
  const group = groups.get(id);
  return group ? group.topics.flatMap(chapterPool) : chapterPool(id);
}
function updateAvailability() {
  const form = el('#setup');
  const count = available(form).length;
  el('#start').disabled = count === 0;
  el('#availability').textContent = count ? `Հասանելի է ${count} առաջադրանք` : 'Հասանելի առաջադրանք չկա';
  if (form.elements.count) {
    form.elements.count.max = Math.max(1,count);
    if (Number(form.elements.count.value) > count && count) form.elements.count.value = count;
  }
}
function makeSession(pool, config) {
  const startedAt = now();
  return {
    mode:view, startedAt, ids:pool.map(q=>q.id), index:0, answers:{}, times:{}, elapsed:0,
    deadline:view === 'exam' ? startedAt + config.minutes * 60000 : null,
    orders:Object.fromEntries(pool.map(q => {
      const ids = q.options?.map(option => option.id) || [];
      return [q.id,config.mix && !q.fixedOrder ? shuffle(ids) : ids];
    }))
  };
}
function jumpForm(session) {
  const current = session ? questions.get(currentId(session)) : null;
  const availableBooks = current
    ? new Set(session.ids.map(id=>bookForQuestion(questions.get(id))))
    : new Set(catalog.book ? [catalog.book] : data.books.filter(book=>bookNumbers.get(book.id).size).map(book=>book.id));
  const bookSelect = availableBooks.size > 1 ? `<select name="book" aria-label="Ժողովածու">
    ${data.books.filter(book=>availableBooks.has(book.id)).map(book=>
      `<option value="${book.id}" ${book.id===(current ? bookForQuestion(current) : catalog.book)?'selected':''}>${bookName(book)}</option>`).join('')}
    </select>` : '';
  return `<form class="card jump-form" id="jump-form">
    <div class="jump-context"><label for="jump-number">Անցնել առաջադրանքի համարով</label>${bookSelect}</div>
    <div class="jump-controls"><input id="jump-number" name="number" type="number" inputmode="numeric" step="1" required placeholder="${session ? numberOf(currentId(session)) : `Օրինակ՝ ${(chapterPool(catalog.topic)[0] || data.questions[0]).number}`}">
    <button class="plain" type="submit">Անցնել${icon('arrowRight')}</button></div>
    <small class="muted" id="jump-message" role="status"></small>
  </form>`;
}
function openChapter(id, numberId = null) {
  const group = data.groups.find(item=>item.topics.includes(id));
  const book = data.books.find(item=>item.groups.includes(group.id));
  if (!chapterPool(id).length) return;
  catalog = {book:book.id,group:group.id,topic:id};
  practiceKey = id;
  state.lastPractice = id;
  let session = active();
  const legacy = state.sessions.practice;
  if (!session && legacy?.ids.length && legacy.ids.every(key=>questions.get(key).topicId===id)) {
    state.practiceByTopic[id] = legacy;
    delete state.sessions.practice;
    session = active();
  }
  if (!session || (numberId && session.finished)) {
    const config = state.settings.practice || {};
    const pool = chapterPool(id);
    session = makeSession(config.random ? shuffle(pool) : pool, config);
    state.practiceByTopic[id] = session;
  }
  if (numberId) {
    if (!session.ids.includes(numberId)) {
      const missing = chapterPool(id).filter(q=>!session.ids.includes(q.id));
      const extra = makeSession(missing,state.settings.practice || {});
      Object.assign(session.orders,extra.orders);
      session.ids.push(...extra.ids);
    }
    session.index = session.ids.indexOf(numberId);
  }
  resultIndex = null;
  opened = true;
  save();
  if (session.finished) render(true);
  else showProblem();
}
function jumpToNumber(form) {
  const session = active();
  const current = opened && session && !session.finished ? questions.get(currentId(session)) : null;
  const fields = new FormData(form);
  const bookId = fields.get('book') || (current ? bookForQuestion(current) : catalog.book || data.books[0].id);
  const question = bookNumbers.get(bookId)?.get(Number(fields.get('number')));
  const message = el('#jump-message');
  if (!question) {
    message.textContent = 'Այս համարով առաջադրանք չկա հավաքածուում։';
    return;
  }
  if (view === 'practice' && (!opened || practiceKey || !session?.ids.includes(question.id))) {
    charge();
    openChapter(question.topicId,question.id);
    return;
  }
  const index = session?.ids.indexOf(question.id) ?? -1;
  if (index < 0) {
    message.textContent = 'Այս առաջադրանքը չկա ընթացիկ աշխատաշրջանում։';
    return;
  }
  charge();
  session.index = index;
  opened = true;
  save(); showProblem();
}
function start(form) {
  const settings = new FormData(form);
  const pool = available(form);
  if (!pool.length || !form.reportValidity()) return;
  const previous = active();
  if (previous && !previous.finished && !window.confirm('Սկսե՞լ նոր աշխատաշրջան։ Նախորդի ընթացքը կփոխարինվի։')) return;
  const config = {
    scope:settings.get('scope'), random:settings.has('random'), mix:settings.has('mix'),
    count:Number(settings.get('count')), minutes:Number(settings.get('minutes'))
  };
  state.settings[view] = config;
  let ordered = config.random ? shuffle(pool) : pool;
  if (view === 'exam') ordered = ordered.slice(0,config.count);
  const session = makeSession(ordered,config);
  if (view === 'practice' && practiceKey) state.practiceByTopic[practiceKey] = session;
  else state.sessions[view] = session;
  opened = true;
  save();
  showProblem();
}
function img(src, alt) {
  return `<img src="${src}" alt="${alt}" decoding="async" draggable="false">`;
}
function fragment(item, label) {
  const [width,height] = item.size;
  if (width < 160 || item.words.some(([, , wordWidth]) => wordWidth > 225)) return img(item.image,label);
  const words = item.words.map(([x,y,w,h]) =>
    `<span style="--x:${-x};--y:${-y};--w:${w};--h:${h}"></span>`).join('');
  return `<span class="fragment" role="img" aria-label="${label}" style="--source:url('${item.image}');--width:${width};--height:${height}">${words}</span>`;
}
function renderAnswers(session, q, results = false) {
  const {id} = q;
  const choice = session.answers[id];
  const reveal = results || (session.mode !== 'exam' && Boolean(choice));
  const labels = session.orders[id];
  const options = labels.map((optionId,i) => {
    const option = q.options.find(o => o.id === optionId);
    const correct = reveal && !q.reviewNote && optionId === q.answerId;
    const wrong = reveal && !q.reviewNote && optionId === choice && !correct;
    const classes = [correct && 'correct',wrong && 'wrong',optionId===choice && 'selected'].filter(Boolean).join(' ');
    const status = correct ? ' · Ճիշտ պատասխան' : wrong ? ' · Սխալ պատասխան' : '';
    const title = `Տարբերակ ${i+1}${status}`;
    return `<button type="button" class="answer ${classes}" data-option="${optionId}" aria-pressed="${optionId===choice}" ${reveal ? 'disabled' : ''}><span class="label">${i+1}</span>${option.image ? fragment(option,title) : `<span>${title}</span>`}</button>`;
  }).join('');
  let feedback = '';
  if (reveal && !q.reviewNote) {
    const correct = isCorrect(q,choice);
    const label = labels.indexOf(q.answerId) + 1;
    feedback = `<p role="status" class="feedback ${correct ? 'good' : 'bad'}">${correct ? 'Ճիշտ է։' : choice ? `Սխալ է։ Ճիշտ տարբերակը՝ ${label}։` : `Պատասխան չկա։ Ճիշտ տարբերակը՝ ${label}։`}</p>`;
  }
  return `<div class="answers">${options}</div>${feedback}`;
}
function renderProblem(session, index, results = false) {
  const id = session.ids[index];
  const q = questions.get(id);
  const annotationImages = (q.useSource ? q.source : q.stem.map(item=>item.image))
    .map((src,i)=>img(src,`Առաջադրանք ${q.number} · հատված ${i+1}`))
    .concat(q.figures.map((src,i)=>`<img src="${src}" data-diagram alt="Նկար ${i+1}" decoding="async" draggable="false">`));
  const annotate = workspacePreferences.annotation;
  const board = workspacePreferences.board;
  return `<article class="card question" data-workspace="${q.id}"><div class="problem-meta row between"><div>
    <div class="problem-title"><h3 tabindex="-1">Առաջադրանք № ${q.number}</h3>${results ? '' : '<span class="clock" id="clock"></span>'}</div><small>${questionBookName(q)} · ${chapterName(topics.get(q.topicId))} · Էջ ${q.pages.join('–')}</small></div>
    <div class="row problem-actions"><button id="magnify" class="plain">${icon('page')}Բնօրինակը</button><button id="flag" class="plain" aria-pressed="${Boolean(state.marks[id])}">${icon('bookmark')}<span>${state.marks[id] ? 'Հանել նշումը' : 'Նշել'}</span></button>
    <div class="workspace-switches" role="group" aria-label="Սևագրի կարգավորումներ">
      ${toggleSwitch('annotation','Գրել առաջադրանքի վրա',annotate,'annotation-drawing','pencil')}
      ${toggleSwitch('board','Վանդակավոր տախտակ',board,'board-drawing','grid')}
    </div></div></div>
    ${q.reviewNote ? `<p class="notice">Ստուգման ենթակա պատասխան։${results || session.mode !== 'exam' ? ' ' + q.reviewNote : ''}</p>` : ''}
    <div class="problem-reading" ${annotate ? 'hidden' : ''}>
    ${q.useSource ? `<div class="source-sheets">${q.source.map((src,i)=>`<button class="source-sheet" data-source="${i}" title="Խոշորացնել բնօրինակը">${img(src,`Էջ ${q.pages[i]} · Խոշորացնել`)}</button>`).join('')}</div>
      <p class="muted source-help">Ընտրեք բնօրինակում նշված տարբերակի համարը։</p>` :
      `<div class="stem">${q.stem.map((item,i)=>fragment(item,`Առաջադրանք ${q.number}, հատված ${i+1}`)).join('')}</div>`}
    ${q.figures.length ? `<div class="figures">${q.figures.map((src,i)=>`<button class="figure" data-figure="${i}" title="Խոշորացնել նկարը">${img(src,`Նկար ${i+1} · Խոշորացնել`)}</button>`).join('')}</div>` : ''}
    </div>
    ${drawingSurface('annotation',annotate,annotationImages.join(''))}
    <div class="answer-area">${renderAnswers(session,q,results)}</div>
    ${drawingSurface('board',board)}</article>`;
}
function renderSession(session) {
  const exam = session.mode === 'exam';
  const done = Object.keys(session.answers).length;
  const current = session.index + 1;
  const percent = 100 * done / session.ids.length;
  const map = exam ? `<details class="card map" open><summary>Առաջադրանքների ցանկը</summary><div class="row">
    ${session.ids.map((id,i)=>`<button class="number ${session.answers[id]?'done':''} ${i===session.index?'current':''} ${state.marks[id]?'flagged':''}" data-jump="${i}" aria-label="Առաջադրանք ${numberOf(id)}${session.answers[id]?', պատասխանված':''}${state.marks[id]?', նշված':''}" ${i===session.index?'aria-current="step"':''}>${numberOf(id)}</button>`).join('')}
    </div></details>` : '';
  return `${view === 'practice' && catalog.topic ? catalogPath() : ''}
  <header class="session-head"><h1>${modes[view]}</h1>
  <small class="session-count">${current} / ${session.ids.length} · Պատասխանված է ${done}</small>
  <div class="track" role="progressbar" aria-label="Պատասխանված առաջադրանքներ" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${session.ids.length}"><div style="width:${percent}%"></div></div></header>
  ${jumpForm(session)}
  ${renderProblem(session,session.index)}
  <div class="row between session-actions">
    <button id="leave" class="plain">${icon('exit')}${exam ? 'Դուրս գալ' : practiceKey && view==='practice' ? 'Դեպի գլուխը' : 'Պահել և դուրս գալ'}</button>
    <div class="row">
      <button class="plain" data-jump="${session.index-1}" ${current===1?'disabled':''}>${icon('chevronLeft')}Նախորդը</button>
      ${current < session.ids.length ? `<button class="primary" data-jump="${current}"><span>${exam && !session.answers[currentId(session)] ? 'Բաց թողնել' : 'Հաջորդը'}</span>${icon('chevronRight')}</button>` : ''}
      ${exam || current === session.ids.length ? `<button id="finish" class="${current===session.ids.length?'primary':'plain'}">${icon('check')}${exam ? 'Հանձնել' : 'Ավարտել'}</button>` : ''}
    </div>
  </div>${map}`;
}
function metrics(items) {
  return `<dl class="metrics">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}
function renderResults(session) {
  const graded = session.ids.filter(id=>!questions.get(id).reviewNote);
  const correct = graded.filter(id=>isCorrect(questions.get(id),session.answers[id])).length;
  const answered = Object.keys(session.answers).length;
  return `<p class="crumb">Ֆիզիկա / ${modes[view]}</p>
    <section class="card"><h1>Արդյունքներ</h1>
    ${session.expired ? '<p class="notice">Ժամանակը սպառվեց։ Քննությունն ավտոմատ հանձնվեց։</p>' : ''}
    ${metrics([['Ճիշտ',`${correct} / ${graded.length}`],['Պատասխանված',`${answered} / ${session.ids.length}`],['Տևողություն',clock(session.elapsed)]])}
    <div class="row session-actions"><button class="primary" id="leave">Դեպի կարգավորումներ</button></div></section>
    ${resultIndex === null ? '' : renderProblem(session,resultIndex,true)}
    <section class="card"><h2>Պատասխանների դիտում</h2><div class="result-list">
    ${session.ids.map((id,index)=>{
      const q = questions.get(id);
      const status = q.reviewNote ? 'Ստուգման ենթակա' : !session.answers[id] ? 'Բաց թողնված' : isCorrect(q,session.answers[id]) ? 'Ճիշտ' : 'Սխալ';
      return `<button class="plain" data-result="${index}">${questionBookName(q)} · № ${q.number} · ${status}${state.marks[id]?' · Նշված':''}</button>`;
    }).join('')}</div></section>`;
}
function renderStats() {
  const first = new Map();
  for (const attempt of state.attempts) if (!first.has(attempt.questionId)) first.set(attempt.questionId,attempt);
  const card = (id) => {
    const topic = topics.get(id);
    const pool = chapterPool(id);
    const topicIds = new Set(pool.map(q=>q.id));
    const solved = pool.filter(q=>first.has(q.id));
    const scored = solved.map(q=>first.get(q.id)).filter(a=>a.correct!==null);
    const attempts = state.attempts.filter(a=>topicIds.has(a.questionId));
    const rate = scored.length ? Math.round(100*scored.filter(a=>a.correct).length/scored.length) : null;
    const avg = attempts.length ? seconds(attempts.reduce((sum,a)=>sum+a.ms,0)/attempts.length) : null;
    const enough = scored.length >= Math.min(minSample,pool.filter(q=>!q.reviewNote).length);
    const recommendation = !enough ? 'Քիչ տվյալներ կան։ Լուծեք այս թեմայից ավելի շատ առաջադրանքներ։' :
      rate < 75 ? 'Արժե կրկնել այս թեմայի սխալները։' : avg >= slowSeconds ? 'Արժե կրկնել երկար տևած լուծումները։' : 'Շարունակեք լուծել թեմայի մնացած առաջադրանքները։';
    return `<section class="card"><h3>${chapterName(topic)}</h3>${metrics([
      ['Լուծված է',`${solved.length} / ${pool.length}`],['Ճիշտ՝ առաջին փորձից',rate===null?'—':`${rate}%`],['Միջին ժամանակը',avg===null?'—':`${number(avg)} վրկ`]
    ])}<p class="muted session-actions">${recommendation}</p></section>`;
  };
  const bookStats = data.books.map(book => {
    const ids = book.groups.flatMap(id=>groups.get(id).topics).filter(id=>chapterPool(id).length);
    return ids.length ? `<section class="stats-book"><h2>${bookName(book)}</h2><div class="stats-grid">${ids.map(card).join('')}</div></section>` : '';
  }).join('');
  return markupHeader('Վիճակագրություն') + `<div class="card stats-overview row between"><div>
    <h2>${first.size} / ${data.questions.length} լուծված</h2><p class="muted">Առաջին փորձերն ու միջին ժամանակը՝ ըստ գլխի։</p></div>
    <button class="plain danger-text" id="reset-stats" ${state.attempts.length?'':'disabled'}>${icon('trash')}Զրոյացնել վիճակագրությունը</button></div>${bookStats}`;

}
function showProblem() {
  render();
  const question = el('.question');
  question.querySelector('h3').focus({preventScroll:true});
  question.scrollIntoView({block:'start',behavior:'instant'});
}
function updateAnswer(session, question, button) {
  const offset = button.getBoundingClientRect().top;
  el('.answer-area').innerHTML = renderAnswers(session,question);
  const done = Object.keys(session.answers).length;
  el('.session-count').textContent = `${session.index + 1} / ${session.ids.length} · Պատասխանված է ${done}`;
  const track = el('.session-head .track');
  track.setAttribute('aria-valuenow',done);
  track.firstElementChild.style.width = `${100 * done / session.ids.length}%`;
  const jump = el(`.number[data-jump="${session.index}"]`);
  if (jump) {
    jump.classList.add('done');
    jump.setAttribute('aria-label', `Առաջադրանք ${question.number}, պատասխանված${state.marks[question.id]?', նշված':''}`);
    const next = el(`.session-actions button[data-jump="${session.index+1}"] span`);
    if (next) next.textContent = 'Հաջորդը';
  }
  const updated = el(`[data-option="${button.dataset.option}"]`);
  const shift = updated.getBoundingClientRect().top - offset;
  if (Math.abs(shift) > 1) window.scrollBy({top:shift,behavior:'instant'});
  if (!updated.disabled && document.activeElement === document.body) updated.focus({preventScroll:true});
  updateClock();
}
const switchMotion = new WeakMap();
function animateSwitch(input) {
  if (reducedMotion.matches) return;
  const track = input.nextElementSibling;
  const thumb = track.firstElementChild;
  let animation = switchMotion.get(input);
  if (!animation) {
    animation = {position:spring(Number(!input.checked),320,18),stretch:spring(0,300,20),frame:null};
    switchMotion.set(input,animation);
  }
  const {position,stretch} = animation;
  position.target = Number(input.checked);
  stretch.velocity = 60;
  if (animation.frame !== null) return;

  const clamp = value => Math.max(0,Math.min(1,value));
  const distance = track.clientWidth - 32;
  function paint() {
    const travel = clamp(position.value);
    const grow = clamp(stretch.value) * distance / 2;
    const x = position.value * distance - (input.checked ? grow * travel : 0);
    track.style.setProperty('--switch-fill',`${travel * 100}%`);
    thumb.style.width = `${26 + grow}px`;
    thumb.style.transform = `translateX(${x}px)`;
  }
  let lastTime = performance.now();
  function tick(time) {
    if (!input.isConnected || reducedMotion.matches || (!stillMoving(position) && !stillMoving(stretch))) {
      track.style.removeProperty('--switch-fill');
      thumb.style.removeProperty('width');
      thumb.style.removeProperty('transform');
      switchMotion.delete(input);
      return;
    }
    const dt = Math.min((time - lastTime) / 1000,1 / 30) / 4;
    lastTime = time;
    for (let i = 0; i < 4; i++) {
      step(position,dt);
      step(stretch,dt);
    }
    paint();
    animation.frame = requestAnimationFrame(tick);
  }
  paint();
  animation.frame = requestAnimationFrame(tick);
}
function animateBottomBar(bar) {
  // Match the reference's width, icon pop, and indicator springs.
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const indicator = bar.querySelector('.bottom-indicator');
  const buttons = [...bar.querySelectorAll('[data-view]')].map(button => ({
    button,
    label:button.querySelector('.bottom-label'),
    icon:button.querySelector('svg'),
    width:spring(0,300,26),
    scale:spring(1,520,14)
  }));
  const left = spring(0,340,28);
  const width = spring(0,340,28);
  const labelSprings = buttons.flatMap(item=>[item.width,item.scale]);
  const indicatorSprings = [left,width];
  let current = buttons[0];
  let frame = null;
  let lastTime = null;

  function updateTargets() {
    for (const item of buttons) {
      item.fullWidth = item.label.firstElementChild.offsetWidth;
      item.width.target = item === current ? item.fullWidth : 0;
    }
  }
  function paintLabels() {
    for (const {label,icon,width,scale,fullWidth} of buttons) {
      label.style.width = Math.max(0,width.value) + 'px';
      label.style.opacity = Math.max(0,Math.min(1,width.value / fullWidth * 1.4 - .4));
      icon.style.transform = `scale(${scale.value})`;
    }
    left.target = current.button.offsetLeft;
    width.target = current.button.offsetWidth;
  }
  function paintIndicator() {
    indicator.style.transform = `translateX(${left.value}px)`;
    indicator.style.width = Math.max(0,width.value) + 'px';
  }
  function snap() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = lastTime = null;
    labelSprings.forEach(settle);
    paintLabels();
    indicatorSprings.forEach(settle);
    paintIndicator();
  }
  function tick(time) {
    const dt = Math.min((time - lastTime) / 1000,1 / 30) / 4;
    lastTime = time;
    for (let i = 0; i < 4; i++) labelSprings.forEach(spring=>step(spring,dt));
    paintLabels();
    for (let i = 0; i < 4; i++) indicatorSprings.forEach(spring=>step(spring,dt));
    paintIndicator();
    if ([...labelSprings,...indicatorSprings].some(stillMoving)) frame = requestAnimationFrame(tick);
    else snap();
  }
  function animate() {
    if (motion.matches) snap();
    else if (frame === null) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  bar.dataset.animated = '';
  updateTargets();
  snap();
  window.addEventListener('resize',()=>{ updateTargets(); snap(); });
  motion.addEventListener('change',snap);
  return view => {
    const next = buttons.find(item=>item.button.dataset.view === view);
    if (next === current) return;
    current = next;
    updateTargets();
    current.scale.value = .72;
    current.scale.velocity = 6;
    animate();
  };
}
const selectBottomMode = animateBottomBar(bottomBar);
function render(focus = false) {
  bottomBar.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  selectBottomMode(view);
  const session = active();
  detachWorkspace?.();
  content.innerHTML = `<p id="storage-warning" role="alert" class="notice" ${storageFailed?'':'hidden'}>Դիտարկիչում տվյալների պահպանումը հնարավոր չէ։</p>` + (
    view === 'stats' ? renderStats() : !opened || !session ? renderSetup() : session.finished ? renderResults(session) : renderSession(session));
  const workspace = el('[data-workspace]');
  detachWorkspace = workspace ? attachWorkspace(workspace) : null;
  if (el('#setup')) updateAvailability();
  restartTick();
  updateClock();
  if (focus) {
    window.scrollTo(0,0);
    content.focus({preventScroll:true});
  }
}
function updateClock() {
  const display = el('#clock');
  const s = active();
  if (!display || !s) return;
  const ms = s.deadline ? Math.max(0,s.deadline - now()) : s.elapsed;
  display.textContent = clock(s.deadline ? Math.ceil(ms/1000)*1000 : ms);
  display.setAttribute('aria-label',s.deadline ? 'Մնացած ժամանակը' : 'Անցած ժամանակը');
  display.classList.toggle('urgent',Boolean(s.deadline && ms <= 60000));
}
bottomBar.addEventListener('click',event=>{
  const button = event.target.closest('[data-view]');
  if (data && button) changeView(button.dataset.view);
});
content.addEventListener('change',event=>{
  if (event.target.name === 'scope') updateAvailability();
  if (event.target.matches('.switch-control input')) animateSwitch(event.target);
});
content.addEventListener('submit',event=>{
  const form = event.target;
  event.preventDefault();
  expireExam();
  if (!form.isConnected) return;
  if (form.id === 'setup') start(form);
  if (form.id === 'jump-form') jumpToNumber(form);
});
content.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled || !data) return;
  charge();
  expireExam();
  if (!button.isConnected) return;
  const session = active();
  if (button.dataset.openBook) {
    catalog = {book:button.dataset.openBook,group:null,topic:null};
    render(true);
  } else if (button.dataset.openSection) {
    catalog = {...catalog,group:button.dataset.openSection,topic:null};
    render(true);
  } else if (button.dataset.openChapter) {
    openChapter(button.dataset.openChapter);
  } else if (button.dataset.catalog) {
    const depth = button.dataset.catalog;
    catalog = {
      book:depth === 'books' ? null : catalog.book,
      group:depth === 'books' || depth === 'book' ? null : catalog.group,
      topic:null
    };
    resultIndex = null;
    opened = false;
    save();
    render(true);
  } else if (button.id === 'reset-stats') {
    const confirmation = document.querySelector('#stats-reset-dialog');
    confirmation.returnValue = 'cancel';
    confirmation.showModal();
  } else if (button.dataset.review) {
    review = button.dataset.review;
    render();
  } else if (button.id === 'resume-legacy') {
    practiceKey = null;
    opened = true;
    resultIndex = null;
    if (active().finished) render(true); else showProblem();
  } else if (button.id === 'resume') {
    if (view === 'practice' && practiceKey) {
      openChapter(practiceKey);
    } else {
      opened = true;
      resultIndex = null;
      if (session.finished) render(true); else showProblem();
    }
  } else if (button.id === 'leave') {
    opened = false; resultIndex = null; save(); render(true);
  } else if (button.id === 'finish') {
    const missing = session.ids.length - Object.keys(session.answers).length;
    const message = missing ? `Մնացել է ${missing} անպատասխան առաջադրանք։ Ավարտե՞լ հիմա։` : 'Հանձնե՞լ քննությունը։';
    if ((session.mode !== 'exam' && !missing) || window.confirm(message)) {
      expireExam();
      finish(session); render(true);
    }
  } else if (button.dataset.jump !== undefined) {
    session.index = Number(button.dataset.jump);
    save();
    showProblem();
  } else if (button.dataset.result !== undefined) {
    resultIndex = Number(button.dataset.result);
    showProblem();
  } else if (button.id === 'flag' || button.id === 'magnify' || button.dataset.figure !== undefined || button.dataset.source !== undefined || button.dataset.option) {
    const id = session.ids[session.finished ? resultIndex : session.index];
    const q = questions.get(id);
    if (button.id === 'flag') {
      if (state.marks[id]) delete state.marks[id]; else state.marks[id] = true;
      button.setAttribute('aria-pressed', Boolean(state.marks[id]));
      button.querySelector('span').textContent = state.marks[id] ? 'Հանել նշումը' : 'Նշել';
      const jump = el(`[data-jump="${session.index}"].number`);
      if (jump) {
        jump.classList.toggle('flagged',Boolean(state.marks[id]));
        const label = jump.getAttribute('aria-label').replace(', նշված','');
        jump.setAttribute('aria-label', label + (state.marks[id] ? ', նշված' : ''));
      }
      save();
    } else if (button.id === 'magnify' || button.dataset.figure !== undefined || button.dataset.source !== undefined) {
      const picture = button.dataset.figure;
      const originalPage = button.dataset.source;
      const fullPage = document.querySelector('#zoom-page');
      fullPage.hidden = !q.useSource;
      fullPage.dataset.book = bookForQuestion(q);
      fullPage.dataset.pages = (originalPage === undefined ? q.pages : [q.pages[Number(originalPage)]]).join(',');
      const originals = document.querySelector('#zoom-pages');
      const isMixed = !q.useSource && q.options.some((option,index)=>option.id !== session.orders[id][index]);
      originals.classList.remove('enlarged');
      document.querySelector('#zoom-scale').setAttribute('aria-pressed','false');
      originals.innerHTML = picture !== undefined ? img(q.figures[Number(picture)],'Խոշորացված նկար') :
        originalPage !== undefined ? img(q.source[Number(originalPage)],'Բնօրինակի խոշորացված հատվածը') :
        isMixed ? q.stem.map(item=>img(item.image,'Առաջադրանքի պայմանը')).join('') +
          q.figures.map(src=>img(src,'Առաջադրանքի նկար')).join('') +
          session.orders[id].map((optionId,index)=>`<div class="zoom-option"><strong>${index+1}</strong>${img(q.options.find(o=>o.id===optionId).image,`Տարբերակ ${index+1}`)}</div>`).join('') :
          [...q.source,...q.figures].map(src=>img(src,'Առաջադրանքը ժողովածուում')).join('');
      dialog.showModal();
      originals.scrollTo(0,0);
    } else if (!session.finished && (session.mode === 'exam' || !session.answers[id])) {
      session.answers[id] = button.dataset.option;
      if (session.mode !== 'exam') record(session,id,button.dataset.option);
      save(); updateAnswer(session,q,button);
    }
  }
});
document.querySelector('#stats-reset-dialog').addEventListener('close',event=>{
  if (event.currentTarget.returnValue !== 'reset') return;
  state.attempts = [];
  save();
  render();
  content.focus({preventScroll:true});
});
document.querySelector('#zoom-page').addEventListener('click',event=>{
  const pages = document.querySelector('#zoom-pages');
  const book = event.currentTarget.dataset.book;
  const prefix = book === data.books[0].id ? '' : book + '-';
  pages.innerHTML = event.currentTarget.dataset.pages.split(',').map(page=>img(`problems/${prefix}page-${page}.webp`,`Ժողովածուի էջ ${page}`)).join('');
  event.currentTarget.hidden = true;
  pages.scrollTo(0,0);
});
document.querySelector('#zoom-scale').addEventListener('click',event=>{
  const enlarged = document.querySelector('#zoom-pages').classList.toggle('enlarged');
  event.currentTarget.setAttribute('aria-pressed',enlarged);
});
document.querySelector('#close-zoom').addEventListener('click',()=>dialog.close());
document.addEventListener('visibilitychange',()=>{
  charge();
  save();
  if (data) expireExam();
  restartTick();
});
window.addEventListener('pagehide',()=>{charge(); save(); tick=null;});
window.addEventListener('pageshow',()=>{if (data) {expireExam();restartTick();}});
setInterval(()=>{
  if (!data) return;
  charge();
  if (tick) save();
  expireExam();
  updateClock();
},1000);

function keepAvailableQuestions(sessions) {
  for (const [key,session] of Object.entries(sessions)) {
    const previous = session.ids;
    const remaining = previous.filter(id=>questions.has(id));
    if (!remaining.length) {
      delete sessions[key];
      continue;
    }
    session.index = Math.min(previous.slice(0,session.index).filter(id=>questions.has(id)).length,remaining.length-1);
    session.ids = remaining;
    const allowed = new Set(remaining);
    for (const field of ['answers','orders','times']) {
      session[field] = Object.fromEntries(Object.entries(session[field]).filter(([id])=>allowed.has(id)));
    }
    delete session.drafts;
  }
}

try {
  const response = await fetch('questions.json');
  if (!response.ok) throw new Error('questions.json');
  data = await response.json();
  questions = new Map(data.questions.map(q=>[q.id,q]));
  topics = new Map(data.topics.map(t=>[t.id,t]));
  books = new Map(data.books.map(book=>[book.id,book]));
  groups = new Map(data.groups.map(group=>[group.id,group]));
  chapterQuestions = new Map([...topics.keys()].map(id=>[id,[]]));
  for (const q of data.questions) chapterQuestions.get(q.topicId)?.push(q);
  bookNumbers = new Map(data.books.map(book=>[book.id,new Map()]));
  for (const q of data.questions) bookNumbers.get(bookForQuestion(q))?.set(q.number,q);
  keepAvailableQuestions(state.sessions);
  keepAvailableQuestions(state.practiceByTopic);
  state.attempts = state.attempts.filter(attempt=>questions.has(attempt.questionId));
  state.marks = Object.fromEntries(Object.entries(state.marks).filter(([id])=>questions.has(id)));
  practiceKey = state.practiceByTopic[state.lastPractice] ? state.lastPractice : null;
  expireExam();
  save();
  render();
} catch {
  content.innerHTML = '<p role="alert">Առաջադրանքները չհաջողվեց բեռնել։ Թարմացրեք էջը։</p>';
}

