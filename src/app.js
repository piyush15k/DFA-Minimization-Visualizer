/**
 * app.js  — v3
 * Main application controller — tabs, fullscreen expand, DFA rendering
 */

(function () {

  // ── Tab Navigation ──────────────────────────────────────────
  document.querySelectorAll('.btn-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      switchTab(btn.dataset.tab);
    });
  });

  function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.btn-nav').forEach(b => b.classList.remove('active'));
    document.getElementById(`panel-${name}`)?.classList.add('active');
    document.querySelector(`[data-tab="${name}"]`)?.classList.add('active');
  }

  // ── Fullscreen Expand ───────────────────────────────────────
  let _fsCanvasId = null;

  document.querySelectorAll('.btn-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      openFullscreen(btn.dataset.canvas, btn.dataset.title || 'DFA Diagram');
    });
  });

  document.getElementById('btn-fullscreen-close').addEventListener('click', closeFullscreen);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFullscreen(); });
  document.getElementById('fullscreen-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeFullscreen();
  });

  function openFullscreen(canvasId, title) {
    _fsCanvasId = canvasId;
    document.getElementById('fullscreen-title').textContent = title;
    document.getElementById('fullscreen-overlay').classList.remove('hidden');

    // Wait one frame so the overlay is visible and has real dimensions
    requestAnimationFrame(() => requestAnimationFrame(renderFullscreen));
  }

  function renderFullscreen() {
    if (!_fsCanvasId) return;

    const body    = document.querySelector('.fullscreen-body');
    const fsCanvas = document.getElementById('canvas-fullscreen');

    // Use the actual available space minus padding
    const availW = body.clientWidth  - 48;
    const availH = body.clientHeight - 48;

    // Set canvas to LOGICAL pixels only — no DPR trickery
    // (DPR scaling was causing the clipping bug: diagram drawn at 2× size)
    fsCanvas.width  = availW;
    fsCanvas.height = availH;
    fsCanvas.style.width  = availW + 'px';
    fsCanvas.style.height = availH + 'px';

    const dfa = getDFA(_fsCanvasId);
    if (dfa) DFARenderer.render(fsCanvas, dfa);
  }

  function getDFA(canvasId) {
    switch (canvasId) {
      case 'canvas-input':     return window._currentDFA   || readDFA();
      case 'canvas-original':  return window._currentDFA   || null;
      case 'canvas-minimized': return window._minimizedDFA || null;
      case 'canvas-steps-dfa': return window._currentDFA   || null;
      default: return null;
    }
  }

  function closeFullscreen() {
    document.getElementById('fullscreen-overlay').classList.add('hidden');
    _fsCanvasId = null;
  }

  window.addEventListener('resize', () => {
    if (!document.getElementById('fullscreen-overlay').classList.contains('hidden')) {
      renderFullscreen();
    }
  });

  // ── Generate Table ──────────────────────────────────────────
  document.getElementById('btn-generate-table').addEventListener('click', () => {
    const n    = parseInt(document.getElementById('num-states').value, 10) || 3;
    const raw  = document.getElementById('alphabet').value.trim();
    const alph = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!alph.length) { alert('Please enter at least one alphabet symbol.'); return; }
    const states = TransitionTableComponent.generateStates(Math.max(2, Math.min(12, n)));
    TransitionTableComponent.build(states, alph);
    document.getElementById('dfa-preview-wrap').classList.remove('hidden');
    renderInputPreview();
  });

  // ── Live input preview ──────────────────────────────────────
  function renderInputPreview() {
    const dfa = readDFA();
    if (!dfa) return;
    DFARenderer.render(document.getElementById('canvas-input'), dfa);
  }

  document.getElementById('transition-table').addEventListener('input', renderInputPreview);

  // ── Load Example ────────────────────────────────────────────
  document.getElementById('btn-load-example').addEventListener('click', () => {
    TransitionTableComponent.load({
      states:      ['q0','q1','q2','q3','q4'],
      alphabet:    ['a','b'],
      transitions: {
        q0:{a:'q1',b:'q2'}, q1:{a:'q1',b:'q3'},
        q2:{a:'q1',b:'q2'}, q3:{a:'q1',b:'q4'},
        q4:{a:'q1',b:'q2'},
      },
      startState:   'q0',
      acceptStates: ['q4'],
    });
    document.getElementById('dfa-preview-wrap').classList.remove('hidden');
    renderInputPreview();
  });

  // ── Run Minimization ────────────────────────────────────────
  document.getElementById('btn-run').addEventListener('click', () => {
    const dfa = readDFA(true);
    if (!dfa) return;
    const check = DFAMinimizer.validate(dfa);
    if (!check.valid) { showError(check.error); return; }

    const { minimizedDFA, steps, mergedMap } = DFAMinimizer.minimize(dfa);

    document.getElementById('tab-steps').disabled  = false;
    document.getElementById('tab-result').disabled = false;

    window._currentDFA   = dfa;
    window._minimizedDFA = minimizedDFA;
    window._mergedMap    = mergedMap;

    StepsPanel.init(steps, dfa);
    switchTab('steps');
    ResultPanel.init(dfa, minimizedDFA, mergedMap);
  });

  // ── Restart ─────────────────────────────────────────────────
  document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('tab-steps').disabled  = true;
    document.getElementById('tab-result').disabled = true;
    window._currentDFA = window._minimizedDFA = null;
    switchTab('input');
  });

  // ── Helpers ─────────────────────────────────────────────────
  function readDFA(showErrors = false) {
    const data = TransitionTableComponent.read();
    if (!data || !data.states.length) {
      if (showErrors) showError('Please generate the transition table first.');
      return null;
    }
    if (!data.allFilled) {
      if (showErrors) showError('Please fill in all transition cells.');
      return null;
    }
    return data;
  }

  function showError(msg) {
    document.getElementById('error-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'error-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:rgba(255,61,0,0.15);border:1px solid #ff3d00;color:#ff3d00;
      padding:12px 24px;border-radius:8px;font-family:'Space Mono',monospace;
      font-size:13px;z-index:99999;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

})();
