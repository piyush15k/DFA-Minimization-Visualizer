# DFA Minimizer — Step-by-Step Visualization Tool

> An interactive, educational web tool that demonstrates the **Table-Filling (Myhill-Nerode)** algorithm for minimizing Deterministic Finite Automata, with full step-by-step visualization.

![DFA Minimizer Screenshot](public/screenshot.png)

---

## ✨ Features

- **Interactive DFA Input** — Define up to 12 states with a custom alphabet via a dynamic transition table
- **Step-by-Step Algorithm** — Each phase of the Table-Filling algorithm is visualized individually with explanations
- **Distinguishability Table** — Color-coded marking table shows newly marked pairs (yellow), distinguished pairs (red), and equivalent pairs (green)
- **Partition View** — See how state equivalence groups evolve at every iteration
- **DFA Graph Rendering** — Both original and minimized DFAs are rendered as interactive canvas graphs with self-loops, bidirectional arrows, and start/accept state indicators
- **Statistics** — State reduction count and percentage displayed on result
- **Export** — Download the minimized DFA as JSON
- **Load Example** — One-click example DFA for quick demonstration

---

## 🚀 Getting Started

This is a **pure HTML/CSS/JS** project — no build step required.

### Option 1: Open directly in browser

```bash
git clone https://github.com/YOUR_USERNAME/dfa-minimizer.git
cd dfa-minimizer
open index.html   # macOS
# or: start index.html (Windows)
# or: xdg-open index.html (Linux)
```

### Option 2: Serve locally (recommended)

```bash
# Using Python
python3 -m http.server 8080

# Using Node.js
npx serve .

# Then open http://localhost:8080
```

---

## 📁 Project Structure

```
dfa-minimizer/
├── index.html                  # Main entry point
├── src/
│   ├── app.js                  # Application controller
│   ├── styles/
│   │   └── main.css            # All styles
│   ├── utils/
│   │   ├── dfaMinimizer.js     # Core algorithm (Table-Filling)
│   │   └── dfaRenderer.js      # Canvas-based DFA graph renderer
│   └── components/
│       ├── transitionTable.js  # Dynamic transition table UI
│       ├── stepsPanel.js       # Step-by-step visualization panel
│       └── resultPanel.js      # Result stats, graphs, table
├── public/
│   └── screenshot.png          # (optional) Screenshot for README
└── README.md
```

---

## 🧠 Algorithm Overview

The tool implements the **Table-Filling Algorithm** (also called the **Mark Algorithm** or **Myhill-Nerode Method**):

### Steps

1. **Initialize** — Assume all pairs of states are equivalent (unmarked)
2. **Base Case** — Mark any pair `(p, q)` where exactly one of `p`, `q` is an accept state (they are immediately distinguishable)
3. **Iterative Refinement** — For each unmarked pair `(p, q)` and each symbol `a ∈ Σ`:
   - If `(δ(p,a), δ(q,a))` is already marked, then mark `(p, q)` too
   - Repeat until no new pairs are marked
4. **Merge** — All remaining unmarked pairs are equivalent states → merge them into single states
5. **Build Minimized DFA** — Construct the new DFA from the merged equivalence classes

### Complexity

- **Time**: O(n² · |Σ|) per iteration, O(n) iterations → O(n³ · |Σ|) overall
- **Space**: O(n²) for the marking table

---

## 💡 Usage Guide

### 1. Define Your DFA

- Set the number of states (2–12)
- Enter your alphabet symbols separated by commas (e.g., `a,b` or `0,1`)
- Click **Generate Transition Table**
- Fill in each transition (target state for each state + symbol)
- Select the start state
- Click states to toggle them as accept states

### 2. Run the Algorithm

- Click **Run Minimization →**
- Use **Next / Prev** buttons to step through the algorithm
- Or click **▶ Auto** for automatic playback
- Jump to any step by clicking it in the sidebar

### 3. View Results

- See the **Statistics** panel (states removed, reduction %)
- Compare **Original DFA** and **Minimized DFA** graphs side-by-side
- Inspect the **Minimized Transition Table**
- Click **Export as JSON** to save the result

---

## 📘 Example DFA

The built-in example (click **Load Example**) is a 5-state DFA over `{a, b}`:

| State | a  | b  |
|-------|----|----|
| →q0   | q1 | q2 |
| q1    | q1 | q3 |
| q2    | q1 | q2 |
| q3    | q1 | q4 |
| *q4   | q1 | q2 |

After minimization: states `q0` and `q2` are merged (both equivalent), reducing to 4 states.

---

## 🛠 Technologies Used

| Technology | Purpose |
|---|---|
| HTML5 Canvas | DFA graph rendering |
| Vanilla JavaScript (ES6) | All algorithm + UI logic |
| CSS3 Custom Properties | Theming and animations |
| Google Fonts | Syne + Space Mono typography |

No external frameworks or build tools required.

---

## 🎓 Educational Context

This tool was built to help computer science students understand:

- The theoretical foundation of DFA minimization
- Why minimized DFAs are unique (up to isomorphism) — a consequence of the Myhill-Nerode theorem
- How equivalent states are formally identified using distinguishing strings
- The practical significance of automata minimization in compiler design and pattern matching

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

## 🤝 Contributing

Pull requests welcome! Areas for improvement:

- NFA → DFA conversion (subset construction)
- Hopcroft's O(n log n) minimization algorithm
- Export DFA as image (PNG/SVG)
- Import DFA from JSON
- Undo/redo in the transition table editor
