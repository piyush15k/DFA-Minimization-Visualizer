/**
 * dfaMinimizer.js
 * Core Table-Filling (Myhill-Nerode) DFA Minimization Algorithm
 * Produces step-by-step snapshots for visualization
 */

window.DFAMinimizer = (function () {

  /**
   * Validate a DFA definition
   * @param {Object} dfa
   * @returns {{ valid: boolean, error?: string }}
   */
  function validate(dfa) {
    const { states, alphabet, transitions, startState, acceptStates } = dfa;
    if (!states || states.length < 2) return { valid: false, error: 'Need at least 2 states.' };
    if (!alphabet || alphabet.length === 0) return { valid: false, error: 'Alphabet cannot be empty.' };
    if (!states.includes(startState)) return { valid: false, error: `Start state "${startState}" not in states.` };
    for (const a of acceptStates) {
      if (!states.includes(a)) return { valid: false, error: `Accept state "${a}" not in states.` };
    }
    for (const s of states) {
      for (const sym of alphabet) {
        const t = transitions[s]?.[sym];
        if (!t || !states.includes(t)) {
          return { valid: false, error: `Missing/invalid transition from state "${s}" on symbol "${sym}".` };
        }
      }
    }
    return { valid: true };
  }

  /**
   * Main minimization with step recording
   * Returns { minimizedDFA, steps, equivalentPairs, mergedMap }
   */
  function minimize(dfa) {
    const { states, alphabet, transitions, startState, acceptStates } = dfa;
    const n = states.length;
    const steps = [];

    // ── Step 0: Initial Setup ──────────────────────────────────
    // Build index map
    const idx = {};
    states.forEach((s, i) => idx[s] = i);

    // Mark table: marked[i][j] = true means states[i] and states[j] are distinguishable
    // We only use upper triangle (i < j)
    const marked = Array.from({ length: n }, () => Array(n).fill(false));
    const reason  = Array.from({ length: n }, () => Array(n).fill(''));

    // Partition snapshot: list of groups
    function getPartitions() {
      const visited = new Set();
      const groups  = [];
      for (let i = 0; i < n; i++) {
        if (visited.has(i)) continue;
        const group = [states[i]];
        visited.add(i);
        for (let j = i + 1; j < n; j++) {
          if (!marked[i][j]) {
            group.push(states[j]);
            visited.add(j);
          }
        }
        groups.push(group);
      }
      return groups;
    }

    // Table snapshot
    function tableSnapshot() {
      return marked.map(row => [...row]);
    }

    steps.push({
      id: 0,
      title: 'Initial Setup',
      description:
        `Starting with ${n} states and alphabet {${alphabet.join(', ')}}. ` +
        `All pairs are initially assumed equivalent (unmarked). ` +
        `We will identify and mark distinguishable pairs.`,
      table: tableSnapshot(),
      newlyMarked: [],
      partitions: getPartitions(),
      phase: 'init',
    });

    // ── Step 1: Mark accept vs non-accept pairs ────────────────
    const newlyMarked1 = [];
    const acceptSet = new Set(acceptStates);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const si = states[i], sj = states[j];
        const iAcc = acceptSet.has(si), jAcc = acceptSet.has(sj);
        if (iAcc !== jAcc) {
          marked[i][j] = true;
          reason[i][j]  = `One is accept, other is non-accept`;
          newlyMarked1.push([i, j]);
        }
      }
    }

    steps.push({
      id: 1,
      title: 'Mark Accept / Non-Accept Pairs',
      description:
        `Base case: any pair where exactly one state is an accept state is immediately ` +
        `distinguishable. Marked ${newlyMarked1.length} pair(s) in this step. ` +
        `(Accept states: {${acceptStates.join(', ')}})`,
      table: tableSnapshot(),
      newlyMarked: [...newlyMarked1],
      partitions: getPartitions(),
      phase: 'base',
    });

    // ── Steps 2+: Iterative refinement ────────────────────────
    let iteration = 1;
    let changed   = true;

    while (changed) {
      changed = false;
      const newlyMarkedIter = [];

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (marked[i][j]) continue;

          // Check each symbol
          for (const sym of alphabet) {
            const ti = idx[transitions[states[i]][sym]];
            const tj = idx[transitions[states[j]][sym]];
            if (ti === tj) continue; // same target, not distinguishing

            const lo = Math.min(ti, tj);
            const hi = Math.max(ti, tj);
            if (marked[lo][hi]) {
              marked[i][j]  = true;
              reason[i][j]  =
                `δ(${states[i]},${sym})=${states[ti]} and δ(${states[j]},${sym})=${states[tj]} are distinguishable`;
              newlyMarkedIter.push([i, j]);
              changed = true;
              break;
            }
          }
        }
      }

      if (newlyMarkedIter.length > 0 || iteration === 1) {
        steps.push({
          id: steps.length,
          title: `Iteration ${iteration} — Propagate Distinguishability`,
          description:
            newlyMarkedIter.length > 0
              ? `Marked ${newlyMarkedIter.length} new pair(s) because their successors on some symbol ` +
                `are already distinguishable. ` +
                newlyMarkedIter.map(([a, b]) => `(${states[a]},${states[b]}): ${reason[a][b]}`).join('; ')
              : `No new pairs were marked in this iteration. The algorithm has converged.`,
          table: tableSnapshot(),
          newlyMarked: [...newlyMarkedIter],
          partitions: getPartitions(),
          phase: iteration === 1 && newlyMarkedIter.length === 0 ? 'converged' : 'iterate',
        });
      }

      iteration++;
      if (iteration > 50) break; // safety
    }

    // ── Final Step: Convergence ────────────────────────────────
    const finalPartitions = getPartitions();
    const equivalentPairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!marked[i][j]) {
          equivalentPairs.push([states[i], states[j]]);
        }
      }
    }

    steps.push({
      id: steps.length,
      title: 'Algorithm Converged — Equivalent States Found',
      description:
        equivalentPairs.length > 0
          ? `Found ${equivalentPairs.length} equivalent pair(s): ` +
            equivalentPairs.map(([a, b]) => `{${a}, ${b}}`).join(', ') +
            `. These will be merged into single states.`
          : `No equivalent states found. The DFA is already minimal!`,
      table: tableSnapshot(),
      newlyMarked: [],
      partitions: finalPartitions,
      phase: 'converged',
    });

    // ── Build Minimized DFA ────────────────────────────────────
    // Each partition group becomes one state in the minimized DFA
    // Representative = first element of group (or group containing start state)
    const stateToGroup = {};
    finalPartitions.forEach((group, gi) => {
      group.forEach(s => { stateToGroup[s] = gi; });
    });

    // Sort groups so the one containing startState is group 0
    const startGi = stateToGroup[startState];
    const sortedGroups = [finalPartitions[startGi]];
    finalPartitions.forEach((g, gi) => { if (gi !== startGi) sortedGroups.push(g); });

    const groupNames = sortedGroups.map((group, i) => {
      // Name: if single state keep name, else merge with comma
      return group.length === 1 ? group[0] : `{${group.join(',')}}`;
    });

    // Remap stateToGroup based on sortedGroups
    const stateToSortedGroup = {};
    sortedGroups.forEach((group, gi) => {
      group.forEach(s => { stateToSortedGroup[s] = gi; });
    });

    const minStates = groupNames;
    const minStart  = groupNames[0];
    const minAccept = [];
    sortedGroups.forEach((group, gi) => {
      if (group.some(s => acceptSet.has(s))) minAccept.push(groupNames[gi]);
    });

    const minTransitions = {};
    sortedGroups.forEach((group, gi) => {
      const rep = group[0];
      minTransitions[groupNames[gi]] = {};
      for (const sym of alphabet) {
        const target = transitions[rep][sym];
        const tgi    = stateToSortedGroup[target];
        minTransitions[groupNames[gi]][sym] = groupNames[tgi];
      }
    });

    const minimizedDFA = {
      states:       minStates,
      alphabet,
      transitions:  minTransitions,
      startState:   minStart,
      acceptStates: minAccept,
    };

    // Build merge map (original state → minimized state name)
    const mergedMap = {};
    sortedGroups.forEach((group, gi) => {
      group.forEach(s => { mergedMap[s] = groupNames[gi]; });
    });

    return { minimizedDFA, steps, equivalentPairs, mergedMap };
  }

  return { validate, minimize };
})();
