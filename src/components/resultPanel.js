/**
 * resultPanel.js
 * Renders the minimization result: stats, DFA graphs, transition table
 */

window.ResultPanel = (function () {

  let _originalDFA   = null;
  let _minimizedDFA  = null;
  let _mergedMap     = {};

  function init(originalDFA, minimizedDFA, mergedMap) {
    _originalDFA  = originalDFA;
    _minimizedDFA = minimizedDFA;
    _mergedMap    = mergedMap;

    renderStats();
    renderGraphs();
    renderMinimizedTable();
  }

  function renderStats() {
    const grid = document.getElementById('stats-grid');
    const orig = _originalDFA.states.length;
    const min  = _minimizedDFA.states.length;
    const removed = orig - min;
    const pct = orig > 0 ? Math.round((removed / orig) * 100) : 0;

    grid.innerHTML = `
      <div class="stat-box">
        <div class="stat-value">${orig}</div>
        <div class="stat-label">Original States</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--accent)">${min}</div>
        <div class="stat-label">Minimized States</div>
      </div>
      <div class="stat-box">
        <div class="stat-value${removed > 0 ? ' reduced' : ''}">${removed}</div>
        <div class="stat-label">States Removed</div>
      </div>
      <div class="stat-box">
        <div class="stat-value${pct > 0 ? ' reduced' : ''}">${pct}%</div>
        <div class="stat-label">Size Reduction</div>
      </div>
    `;
  }

  function renderGraphs() {
    const c1 = document.getElementById('canvas-original');
    const c2 = document.getElementById('canvas-minimized');
    DFARenderer.render(c1, _originalDFA);
    DFARenderer.render(c2, _minimizedDFA);
  }

  function renderMinimizedTable() {
    const wrap = document.getElementById('minimized-table');
    const { states, alphabet, transitions, startState, acceptStates } = _minimizedDFA;
    const acceptSet = new Set(acceptStates);

    const table = document.createElement('table');
    table.className = 'dfa-table';

    // Header
    const thead = document.createElement('thead');
    const hr    = document.createElement('tr');
    ['', 'State', ...alphabet].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    states.forEach(s => {
      const tr = document.createElement('tr');

      // Markers
      const marker = document.createElement('td');
      const marks  = [];
      if (s === startState) marks.push('→');
      if (acceptSet.has(s)) marks.push('*');
      marker.textContent = marks.join('');
      marker.style.color = '#4fffb0';
      marker.style.fontFamily = 'monospace';
      tr.appendChild(marker);

      // State name
      const label = document.createElement('td');
      label.className   = 'state-label';
      label.textContent = s;
      tr.appendChild(label);

      // Transitions
      alphabet.forEach(sym => {
        const td = document.createElement('td');
        td.textContent = transitions[s]?.[sym] || '—';
        td.style.fontFamily = 'monospace';
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrap.innerHTML = '';
    wrap.appendChild(table);

    // Merge map legend
    if (Object.keys(_mergedMap).length > 0) {
      const legend = document.createElement('div');
      legend.style.cssText = 'margin-top:16px; font-size:12px; font-family:monospace; color:var(--text2);';
      const mergeEntries = [];
      const seen = new Set();
      for (const [orig, merged] of Object.entries(_mergedMap)) {
        const key = merged;
        if (!seen.has(key)) {
          seen.add(key);
          const origStates = Object.entries(_mergedMap).filter(([,m]) => m === merged).map(([o]) => o);
          if (origStates.length > 1) {
            mergeEntries.push(`{${origStates.join(', ')}} → ${merged}`);
          }
        }
      }
      if (mergeEntries.length > 0) {
        legend.innerHTML = `<strong style="color:var(--accent)">Merged:</strong> ` + mergeEntries.join(' &nbsp;|&nbsp; ');
        wrap.appendChild(legend);
      }
    }
  }

  function exportJSON() {
    const data = {
      original:  _originalDFA,
      minimized: _minimizedDFA,
      mergeMap:  _mergedMap,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'minimized-dfa.json';
    a.click();
  }

  document.getElementById('btn-export').addEventListener('click', exportJSON);

  return { init };
})();
