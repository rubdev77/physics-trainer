import {spring, step, settle, stillMoving, reducedMotion} from './spring.js';
import {icon} from './icons.js';

const prefix = 'fizika-scratch-v1:';
const inMemory = new Map();
const clamp = (value, min, max) => Math.min(max,Math.max(min,value));
const tools = {
  pencil:['Մատիտ','m4 16-1 5 5-1L20 8l-4-4Zm10-10 4 4'],
  line:['Գիծ','M4 19 20 5'],
  arrow:['Սլաք','M4 19 20 5m-8 0h8v8'],
  rect:['Ուղղանկյուն','M4 5h16v14H4z'],
  ellipse:['Էլիպս','M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0Z'],
  text:['Տեքստ','M5 7V4h14v3M12 4v16m-4 0h8'],
  eraser:['Ռետին','m3 14 9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-7 7H9Zm4-4 9 9m-3 1h8']
};
const shapes = ['line','arrow','rect','ellipse'];
const colors = [
  ['#205e4f','Կանաչ'], ['#26333a','Սև'], ['#285cc4','Կապույտ'],
  ['#b83e48','Կարմիր'], ['#5450ae','Մանուշակագույն'], ['#b06118','Նարնջագույն']
];
const defaultInk = colors[0][0];
const toolIcon = tool => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${tools[tool][1]}"/></svg>`;

function read(key, fallback) {
  if (inMemory.has(key)) return inMemory.get(key);
  try { return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback; }
  catch { return fallback; }
}

function store(key, value) {
  inMemory.set(key,value);
  try {
    if (Array.isArray(value) && !value.length) localStorage.removeItem(prefix + key);
    else localStorage.setItem(prefix + key,JSON.stringify(value));
    return true;
  } catch { return false; }
}

export const workspacePreferences = {...read('preferences',{})};
const activeInk = () => colors.find(([ink])=>ink === workspacePreferences.ink)?.[0] || defaultInk;

export function drawingSurface(kind, visible, images = '') {
  const board = kind === 'board';
  const title = board ? 'Վանդակավոր տախտակ' : 'Նշումներ առաջադրանքի վրա';
  const shapePanel = `${kind}-shapes`;
  const colorPanel = `${kind}-colors`;
  const selectedTool = workspacePreferences[kind+'Tool'] || 'pencil';
  const selectedInk = activeInk();
  const button = tool => `<button type="button" data-tooltip data-tool="${tool}" aria-label="${tools[tool][0]}" aria-pressed="${tool===selectedTool}">${toolIcon(tool)}</button>`;
  return `<section id="${kind}-drawing" class="drawing-panel" data-drawing="${kind}" aria-label="${title}" ${visible?'':'hidden'}>
    ${board ? `<div class="drawing-heading"><h4>${title}</h4><small>Պահպանվում է նաև հաջորդ առաջադրանքում։</small></div>` : ''}
    <div class="drawing-controls">
      <div class="drawing-tools" role="group" aria-label="Գծելու գործիքներ">
        <span class="tool-highlight" aria-hidden="true"></span>
        ${button('pencil')}
        <button type="button" data-menu="shapes" data-tooltip aria-label="Պատկերներ" aria-controls="${shapePanel}" aria-expanded="false" class="${shapes.includes(selectedTool)?'current-tool':''}">${shapes.includes(selectedTool)?toolIcon(selectedTool):icon('shapes')}</button>
        ${button('text')}
        ${button('eraser')}
        <button type="button" class="color-trigger" data-menu="colors" data-tooltip aria-label="Գույն" aria-controls="${colorPanel}" aria-expanded="false" style="--ink-swatch:${selectedInk}">${icon('palette')}<span aria-hidden="true"></span></button>
        <span class="tool-tip-arrow" aria-hidden="true"></span>
        <span class="tool-tip" role="tooltip" aria-hidden="true"><span>Մատիտ</span><span>Պատկերներ</span><span>Տեքստ</span><span>Ռետին</span><span>Գույն</span></span>
        <div class="drawing-popover" id="${shapePanel}" aria-label="Պատկերներ" role="group" hidden>
          ${shapes.map(tool=>`<button class="plain" type="button" data-tool="${tool}" aria-pressed="${tool===selectedTool}">${toolIcon(tool)}${tools[tool][0]}</button>`).join('')}
        </div>
        <div class="drawing-popover drawing-colors" id="${colorPanel}" aria-label="Գույներ" role="group" hidden>
          ${colors.map(([ink,label])=>`<button type="button" data-ink="${ink}" aria-label="${label}" aria-pressed="${ink===selectedInk}"><span style="--ink-swatch:${ink}">${icon('check')}</span></button>`).join('')}
        </div>
      </div>
      <div class="drawing-history">
        <button type="button" class="plain" data-drawing-action="undo" disabled>${icon('undo')}<span>Հետարկել</span></button>
        <button type="button" class="plain" data-drawing-action="clear" disabled>${icon('trash')}<span>Մաքրել</span></button>
        <button type="button" class="plain" data-drawing-action="export">${icon('download')}<span>Ներբեռնել PNG</span></button>
      </div>
    </div>
    <form class="drawing-text" hidden>
      <input name="note" maxlength="100" required aria-label="Նշման տեքստը" placeholder="Գրեք նշումը">
      <button class="primary" type="submit">Տեղադրել</button>
      <button class="plain" type="button" data-drawing-action="cancel-text">Չեղարկել</button>
    </form>
    <div class="drawing-paper ${board?'grid-paper':'annotation-paper'}">
      ${board ? '' : `<template>${images}</template>`}
      <canvas aria-label="${title}"></canvas>
    </div>
    <small class="drawing-status" role="status"></small>
  </section>`;
}

function attachTooltips(toolbar, signal) {
  const buttons = [...toolbar.querySelectorAll('[data-tooltip]')];
  const highlight = toolbar.querySelector('.tool-highlight');
  const tip = toolbar.querySelector('.tool-tip');
  const tail = toolbar.querySelector('.tool-tip-arrow');
  const labels = [...tip.children].map(element=>({element, opacity:spring(0,420,32), direction:0}));
  const icons = buttons.map(()=>spring(1,520,16));
  const left = spring(0,620,36);
  const right = spring(0,620,36);
  const highlightLeft = spring(0,620,36);
  const highlightRight = spring(0,620,36);
  const center = spring(0,300,22);
  const shown = spring(0,420,24);
  const springs = [left,right,highlightLeft,highlightRight,center,shown,...icons,...labels.map(label=>label.opacity)];
  let active = -1;
  let frame = null;
  let hideTimer;
  let previousTime;

  function paint() {
    const toolbarRect = toolbar.getBoundingClientRect();
    const opacity = clamp(shown.value,0,1);
    const scale = clamp(shown.value,0,1.15);
    const width = clamp(right.value - left.value,30,window.innerWidth - 16);
    const x = clamp(left.value,8 - toolbarRect.left,window.innerWidth - 8 - toolbarRect.left - width);
    tip.style.width = width + 'px';
    tip.style.transform = `translate(${x}px,${(1-scale)*6}px) scale(${.72 + .28*scale})`;
    tail.style.transform = `translate(${clamp(center.value,x+12,x+width-12)-6}px,${(1-scale)*8}px) rotate(45deg) scale(${scale})`;
    highlight.style.width = Math.max(0,highlightRight.value - highlightLeft.value) + 'px';
    highlight.style.transform = `translateX(${highlightLeft.value}px)`;
    tip.style.opacity = tail.style.opacity = highlight.style.opacity = opacity;
    labels.forEach(({element,opacity,direction})=>{
      const alpha = clamp(opacity.value,0,1);
      element.style.opacity = alpha;
      element.style.transform = `translateX(calc(-50% + ${direction * (1-alpha) * 14}px))`;
      element.style.filter = alpha > .02 && alpha < .98 ? `blur(${(1-alpha)*3}px)` : 'none';
    });
    buttons.forEach((button,index)=>button.firstElementChild.style.transform = `scale(${icons[index].value})`);
  }

  function animate(time) {
    const dt = Math.min((time - previousTime) / 1000,1/30) / 4;
    previousTime = time;
    for (let i=0; i<4; i++) springs.forEach(s=>step(s,dt));
    if (springs.some(stillMoving) && !reducedMotion.matches) frame = requestAnimationFrame(animate);
    else {
      frame = null;
      springs.forEach(settle);
    }
    paint();
  }

  function update() {
    if (reducedMotion.matches) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      springs.forEach(settle);
      paint();
    } else if (frame === null) {
      previousTime = performance.now();
      frame = requestAnimationFrame(animate);
    }
  }

  function show(index) {
    if (toolbar.querySelector('[aria-expanded=true]')) return;
    clearTimeout(hideTimer);
    const button = buttons[index];
    const nextCenter = button.offsetLeft + button.offsetWidth / 2;
    const half = labels[index].element.offsetWidth / 2;
    const direction = active < 0 ? 0 : Math.sign(index - active);
    const leading = direction < 0 ? [left,highlightLeft] : [right,highlightRight];
    const trailing = direction < 0 ? [right,highlightRight] : [left,highlightLeft];
    for (const s of leading) Object.assign(s,{stiffness:620,damping:36});
    for (const s of trailing) Object.assign(s,{stiffness:190,damping:19});
    for (const [s,target] of [[left,nextCenter-half],[right,nextCenter+half],[center,nextCenter],
      [highlightLeft,button.offsetLeft],[highlightRight,button.offsetLeft+button.offsetWidth]]) {
      s.target = target;
      if (shown.value < .3) settle(s);
    }
    labels.forEach((label,i)=>{
      if (i === index || label.opacity.target === 1) label.direction = i === index ? direction : -direction;
      label.opacity.target = Number(i === index);
      if (shown.value < .3) settle(label.opacity);
    });
    active = index;
    shown.target = 1;
    update();
  }

  function hide(delay = 140) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(()=>{
      shown.target = 0;
      update();
    },delay);
  }

  buttons.forEach((button,index)=>{
    for (const type of ['pointerenter','focus']) button.addEventListener(type,()=>show(index),{signal});
    button.addEventListener('click',event=>{
      show(index);
      icons[index].value = .78;
      if (event.pointerType === 'touch') hide(1150);
      update();
    },{signal});
  });
  toolbar.addEventListener('pointerleave',()=>hide(),{signal});
  toolbar.addEventListener('focusout',event=>{if (!toolbar.contains(event.relatedTarget)) hide();},{signal});
  toolbar.addEventListener('keydown',event=>{if (event.key === 'Escape') hide(0);},{signal});
  signal.addEventListener('abort',()=>{
    clearTimeout(hideTimer);
    if (frame !== null) cancelAnimationFrame(frame);
  },{once:true});
}

function paintMark(context, mark, width, height, start = 0) {
  const [first,last] = [mark.points[start],mark.points.at(-1)];
  const x = first[0] * width;
  const y = first[1] * height;
  const endX = last[0] * width;
  const endY = last[1] * height;
  const eraser = mark.tool === 'eraser';
  const penWidth = clamp(width / 220,1.7,3.4);
  context.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
  context.strokeStyle = context.fillStyle = mark.ink || defaultInk;
  context.lineWidth = eraser ? 18 : penWidth;
  context.lineCap = context.lineJoin = 'round';
  context.beginPath();
  if (mark.tool === 'text') {
    const fontSize = clamp(width / 30,13,24);
    context.font = `650 ${fontSize}px "Noto Sans Armenian","Segoe UI",sans-serif`;
    context.textBaseline = 'top';
    context.fillText(mark.text,x,Math.min(y,height-fontSize),Math.max(1,width-x));
    return;
  }
  if (mark.tool === 'pencil' || eraser) {
    context.moveTo(x,y);
    for (let i = start+1; i < mark.points.length; i++) {
      const [px,py] = mark.points[i];
      context.lineTo(px * width,py * height);
    }
    if (mark.points.length === 1) {
      context.arc(x,y,context.lineWidth/2,0,Math.PI*2);
      context.fill();
      return;
    }
  } else if (mark.tool === 'rect') {
    context.rect(x,y,endX-x,endY-y);
  } else if (mark.tool === 'ellipse') {
    context.ellipse((x+endX)/2,(y+endY)/2,Math.abs(endX-x)/2,Math.abs(endY-y)/2,0,0,Math.PI*2);
  } else {
    context.moveTo(x,y);
    context.lineTo(endX,endY);
    if (mark.tool === 'arrow') {
      const angle = Math.atan2(endY-y,endX-x);
      const tipSize = Math.min(12,Math.hypot(endX-x,endY-y)*.38);
      for (const direction of [-.48,.48]) {
        context.moveTo(endX - tipSize*Math.cos(angle+direction),endY - tipSize*Math.sin(angle+direction));
        context.lineTo(endX,endY);
      }
    }
  }
  context.stroke();
}

function attachSurface(panel, questionId, signal) {
  const board = panel.dataset.drawing === 'board';
  const key = board ? 'board' : questionId;
  const paper = panel.querySelector('.drawing-paper');
  const canvas = paper.querySelector('canvas');
  const context = canvas.getContext('2d');
  const toolbar = panel.querySelector('.drawing-tools');
  const status = panel.querySelector('.drawing-status');
  const textForm = panel.querySelector('.drawing-text');
  const undoButton = panel.querySelector('[data-drawing-action=undo]');
  const clearButton = panel.querySelector('[data-drawing-action=clear]');
  const shapeTrigger = toolbar.querySelector('[data-menu=shapes]');
  const colorTrigger = toolbar.querySelector('[data-menu=colors]');
  const toolPreference = panel.dataset.drawing + 'Tool';
  const workspace = panel.closest('[data-workspace]');
  let marks = read(key,[]);
  let tool = workspacePreferences[toolPreference] || 'pencil';
  let openMenu = null;
  let pointer = null;
  let draft = null;
  let textPoint = null;
  let width = 0;
  let height = 0;
  let paintedPoints = 0;
  let drawingFrame = null;
  let preview;
  attachTooltips(toolbar,signal);

  function repaint() {
    width = paper.clientWidth;
    height = paper.clientHeight;
    if (!width || !height) return;
    const pixels = Math.min(2,window.devicePixelRatio || 1,Math.sqrt(1600000/(width*height)),4096/Math.max(width,height));
    const pixelWidth = Math.max(1,Math.round(width*pixels));
    const pixelHeight = Math.max(1,Math.round(height*pixels));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(pixelWidth/width,0,0,pixelHeight/height,0,0);
    context.clearRect(0,0,width,height);
    for (const mark of marks) paintMark(context,mark,width,height);
    if (draft) {
      if (shapes.includes(draft.tool)) capturePreview();
      paintMark(context,draft,width,height);
      paintedPoints = draft.points.length;
    }
  }

  function capturePreview() {
    preview ??= document.createElement('canvas');
    preview.width = canvas.width;
    preview.height = canvas.height;
    preview.getContext('2d').drawImage(canvas,0,0);
  }

  function paintPending() {
    if (drawingFrame !== null) cancelAnimationFrame(drawingFrame);
    drawingFrame = null;
    if (!draft || !width || !height) return;
    if (shapes.includes(draft.tool)) {
      context.clearRect(0,0,width,height);
      context.globalCompositeOperation = 'source-over';
      context.drawImage(preview,0,0,width,height);
      if (draft.points.length > 1) paintMark(context,draft,width,height);
    } else if (paintedPoints < draft.points.length) {
      paintMark(context,draft,width,height,Math.max(0,paintedPoints-1));
      paintedPoints = draft.points.length;
    }
  }

  function save() {
    undoButton.disabled = clearButton.disabled = marks.length === 0;
    status.textContent = store(key,marks) ? '' : 'Չհաջողվեց պահպանել այս դիտարկիչում։ Ներբեռնեք PNG պատկերը։';
  }

  function finishStroke() {
    if (!draft) return;
    paintPending();
    const hasInk = draft.points.length > 1 || draft.tool === 'pencil' || draft.tool === 'eraser';
    if (hasInk) marks = [...marks,draft];
    draft = null;
    pointer = null;
    if (hasInk) save();
    preview = undefined;
  }

  function point(event, bounds = canvas.getBoundingClientRect()) {
    const fraction = (value,length) => Math.round(clamp(value/length,0,1)*10000)/10000;
    return [fraction(event.clientX-bounds.left,bounds.width),fraction(event.clientY-bounds.top,bounds.height)];
  }

  function addPoint(position) {
    const last = draft.points.at(-1);
    if (position[0] === last[0] && position[1] === last[1]) return;
    if (draft.tool === 'pencil' || draft.tool === 'eraser') draft.points.push(position);
    else {
      const start = draft.points[0];
      if (position[0] === start[0] && position[1] === start[1]) draft.points.length = 1;
      else draft.points[1] = position;
    }
  }

  function cancelText() {
    textPoint = null;
    textForm.hidden = true;
    textForm.reset();
  }

  canvas.addEventListener('pointerdown',event=>{
    if (pointer !== null || event.button !== 0) return;
    const position = point(event);
    if (tool === 'text') {
      textPoint = position;
      textForm.hidden = false;
      textForm.elements.note.focus({preventScroll:true});
      return;
    }
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    draft = {tool,ink:activeInk(),points:[position]};
    paintedPoints = 0;
    if (shapes.includes(tool)) capturePreview();
    else paintPending();
  },{signal});
  canvas.addEventListener('pointermove',event=>{
    if (event.pointerId !== pointer) return;
    const bounds = canvas.getBoundingClientRect();
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) addPoint(point(sample,bounds));
    if (drawingFrame === null) drawingFrame = requestAnimationFrame(paintPending);
  },{signal});
  canvas.addEventListener('pointerup',event=>{
    if (event.pointerId !== pointer) return;
    addPoint(point(event));
    finishStroke();
  },{signal});
  canvas.addEventListener('lostpointercapture',event=>{if (event.pointerId === pointer) finishStroke();},{signal});
  textForm.addEventListener('submit',event=>{
    event.preventDefault();
    event.stopPropagation();
    const text = textForm.elements.note.value.trim();
    if (!text || !textPoint) return;
    const mark = {tool:'text',ink:activeInk(),text,points:[textPoint]};
    marks = [...marks,mark];
    paintMark(context,mark,width,height);
    cancelText();
    toolbar.querySelector('[data-tool=text]').focus({preventScroll:true});
    save();
  },{signal});

  async function download(button) {
    button.disabled = true;
    try {
      const images = [...paper.querySelectorAll('img')];
      await Promise.all(images.map(image=>image.decode()));
      if (!canvas.isConnected || panel.hidden) return;
      paintPending();
      const output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      const ctx = output.getContext('2d');
      ctx.fillStyle = getComputedStyle(paper).backgroundColor;
      ctx.fillRect(0,0,output.width,output.height);
      const bounds = paper.getBoundingClientRect();
      const scale = output.width / bounds.width;
      if (board) {
        const gap = 24 * scale;
        ctx.strokeStyle = '#dce6de';
        ctx.lineWidth = scale;
        ctx.beginPath();
        for (let x=0;x<output.width;x+=gap) { ctx.moveTo(x,0); ctx.lineTo(x,output.height); }
        for (let y=0;y<output.height;y+=gap) { ctx.moveTo(0,y); ctx.lineTo(output.width,y); }
        ctx.stroke();
      } else {
        for (const image of images) {
          const rect = image.getBoundingClientRect();
          ctx.drawImage(image,(rect.left-bounds.left)*scale,(rect.top-bounds.top)*scale,rect.width*scale,rect.height*scale);
        }
      }
      ctx.drawImage(canvas,0,0);
      const blob = await new Promise(resolve=>output.toBlob(resolve,'image/png'));
      if (!blob) throw new Error('PNG');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fizika-${key}.png`;
      link.click();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch {
      status.textContent = 'Չհաջողվեց ներբեռնել PNG պատկերը։';
    } finally {
      button.disabled = false;
    }
  }

  function closeMenu(restoreFocus = false) {
    if (!openMenu) return;
    const {button,popover} = openMenu;
    openMenu = null;
    button.setAttribute('aria-expanded','false');
    popover.hidden = true;
    delete toolbar.dataset.open;
    delete toolbar.dataset.menuSide;
    if (restoreFocus) button.focus({preventScroll:true});
  }

  function toggleMenu(button) {
    const wasOpen = openMenu?.button === button;
    closeMenu();
    if (wasOpen) return;
    const popover = toolbar.querySelector('#'+button.getAttribute('aria-controls'));
    openMenu = {button,popover};
    button.setAttribute('aria-expanded','true');
    toolbar.dataset.open = button.dataset.menu;
    popover.hidden = false;
    const dockTop = document.querySelector('.bottom-bar')?.getBoundingClientRect().top ?? innerHeight;
    if (toolbar.getBoundingClientRect().bottom + popover.offsetHeight + 12 > dockTop) toolbar.dataset.menuSide = 'top';
    (popover.querySelector('[aria-pressed=true]') || popover.querySelector('button')).focus({preventScroll:true});
  }

  function selectTool(next) {
    tool = next;
    workspacePreferences[toolPreference] = next;
    store('preferences',workspacePreferences);
    for (const button of toolbar.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed',button.dataset.tool === next);
    shapeTrigger.classList.toggle('current-tool',shapes.includes(next));
    shapeTrigger.innerHTML = shapes.includes(next) ? toolIcon(next) : icon('shapes');
    if (tool !== 'text') cancelText();
  }

  document.addEventListener('pointerdown',event=>{
    if (openMenu && !toolbar.contains(event.target)) closeMenu();
  },{signal});
  toolbar.addEventListener('focusout',event=>{
    if (!toolbar.contains(event.relatedTarget)) closeMenu();
  },{signal});
  toolbar.addEventListener('keydown',event=>{
    if (event.key !== 'Escape' || !openMenu) return;
    event.preventDefault();
    closeMenu(true);
  },{signal});
  workspace.addEventListener('drawing-color',()=>{
    const ink = activeInk();
    colorTrigger.style.setProperty('--ink-swatch',ink);
    toolbar.querySelectorAll('[data-ink]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.ink === ink));
  },{signal});

  panel.addEventListener('click',event=>{
    const selected = event.target.closest('[data-tool]');
    const menu = event.target.closest('[data-menu]');
    const swatch = event.target.closest('[data-ink]');
    const action = event.target.closest('[data-drawing-action]');
    if (menu) {
      toggleMenu(menu);
    } else if (swatch) {
      workspacePreferences.ink = swatch.dataset.ink;
      store('preferences',workspacePreferences);
      workspace.dispatchEvent(new Event('drawing-color'));
      if (tool === 'eraser') selectTool('pencil');
      closeMenu(true);
    } else if (selected) {
      selectTool(selected.dataset.tool);
      closeMenu(shapes.includes(tool));
    } else if (action?.dataset.drawingAction === 'undo') {
      marks = marks.slice(0,-1);
      save();
      repaint();
    } else if (action?.dataset.drawingAction === 'clear' && window.confirm('Մաքրե՞լ այս աշխատանքային տարածքը։')) {
      marks = [];
      cancelText();
      save();
      repaint();
    } else if (action?.dataset.drawingAction === 'export') {
      download(action);
    } else if (action?.dataset.drawingAction === 'cancel-text') {
      cancelText();
      toolbar.querySelector('[data-tool=text]').focus({preventScroll:true});
    }
  },{signal});
  window.addEventListener('pagehide',finishStroke,{signal});
  const resize = new ResizeObserver(()=>{
    if (paper.clientWidth !== width || paper.clientHeight !== height) repaint();
  });
  resize.observe(paper);
  signal.addEventListener('abort',()=>resize.disconnect(),{once:true});
  undoButton.disabled = clearButton.disabled = marks.length === 0;

  return {
    finishStroke,
    toggle(visible) {
      if (!visible) {
        closeMenu();
        finishStroke();
        cancelText();
        canvas.width = canvas.height = 1;
        width = height = 0;
      }
      panel.hidden = !visible;
      const template = paper.querySelector('template');
      if (visible && template) template.replaceWith(template.content);
      if (visible) repaint();
    }
  };
}

export function attachWorkspace(article) {
  const controller = new AbortController();
  const surfaceList = [];
  for (const input of article.querySelectorAll('.workspace-switches input')) {
    const panel = article.querySelector('#'+input.getAttribute('aria-controls'));
    let surface;
    function updateSurface() {
      if (!surface && input.checked) {
        surface = attachSurface(panel,article.dataset.workspace,controller.signal);
        surfaceList.push(surface);
      }
      surface?.toggle(input.checked);
    }
    updateSurface();
    input.addEventListener('change',()=>{
      workspacePreferences[input.name] = input.checked;
      store('preferences',workspacePreferences);
      if (input.name === 'annotation') article.querySelector('.problem-reading').hidden = input.checked;
      updateSurface();
    },{signal:controller.signal});
  }
  return ()=>{
    for (const surface of surfaceList) surface.finishStroke();
    controller.abort();
  };
}
