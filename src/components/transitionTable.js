/**
 * transitionTable.js
 * Builds and manages the interactive transition table UI
 */

window.TransitionTableComponent = (function () {

  let _states   = [];
  let _alphabet = [];
  let _acceptSet = new Set();

  /**
   * Generate state names q0..q(n-1)
   */
  function generateStates(n) {
    return Array.from({ length: n }, (_, i) => `q${i}`);
  }

  /**
   * Build the HTML transition table
   */
  function build(states, alphabet) {
    _states   = states;
    _alphabet = alphabet;

    const wrap = document.getElementById('transition-table');
    wrap.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'dfa-table';

    // Header
    const thead = document.createElement('thead');
    const hr    = document.createElement('tr');
    ['State', ...alphabet].forEach(h => {
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

      // State label cell
      const labelTd = document.createElement('td');
      labelTd.className  = 'state-label';
      labelTd.textContent = s;
      tr.appendChild(labelTd);

      // Transition input cells
      alphabet.forEach(sym => {
        const td    = document.createElement('td');
        const input = document.createElement('input');
        input.type        = 'text';
        input.className   = 'input-sm';
        input.id          = `trans-${s}-${sym}`;
        input.placeholder = '—';
        input.maxLength   = 4;
        input.value       = '';
        td.appendChild(input);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    // Update start state dropdown
    const sel = document.getElementById('start-state');
    sel.innerHTML = '';
    states.forEach(s => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = s;
      sel.appendChild(opt);
    });

    // Update accept state chips
    _acceptSet.clear();
    const chips = document.getElementById('accept-states');
    chips.innerHTML = '';
    states.forEach(s => {
      const chip = document.createElement('div');
      chip.className   = 'state-chip';
      chip.textContent = s;
      chip.dataset.state = s;
      chip.addEventListener('click', () => {
        chip.classList.toggle('accept');
        if (chip.classList.contains('accept')) {
          _acceptSet.add(s);
        } else {
          _acceptSet.delete(s);
        }
      });
      chips.appendChild(chip);
    });

    document.getElementById('transition-table-wrap').classList.remove('hidden');
  }

  /**
   * Read current DFA definition from form
   */
  function read() {
    const transitions = {};
    let allFilled = true;

    _states.forEach(s => {
      transitions[s] = {};
      _alphabet.forEach(sym => {
        const val = document.getElementById(`trans-${s}-${sym}`)?.value?.trim();
        transitions[s][sym] = val || '';
        if (!val) allFilled = false;
      });
    });

    return {
      states:       _states,
      alphabet:     _alphabet,
      transitions,
      startState:   document.getElementById('start-state')?.value,
      acceptStates: [..._acceptSet],
      allFilled,
    };
  }

  /**
   * Populate the table with a preset DFA
   */
  function load(dfa) {
    // First rebuild structure
    build(dfa.states, dfa.alphabet);

    // Fill values
    dfa.states.forEach(s => {
      dfa.alphabet.forEach(sym => {
        const el = document.getElementById(`trans-${s}-${sym}`);
        if (el) el.value = dfa.transitions[s][sym] || '';
      });
    });

    // Set start
    const sel = document.getElementById('start-state');
    if (sel) sel.value = dfa.startState;

    // Set accept
    _acceptSet = new Set(dfa.acceptStates);
    document.querySelectorAll('.state-chip').forEach(chip => {
      const s = chip.dataset.state;
      if (_acceptSet.has(s)) {
        chip.classList.add('accept');
      } else {
        chip.classList.remove('accept');
      }
    });

    // Update num-states & alphabet inputs
    document.getElementById('num-states').value = dfa.states.length;
    document.getElementById('alphabet').value    = dfa.alphabet.join(',');
  }

  return { generateStates, build, read, load };
})();
