# Testing

Run the complete repository regression gate with:

```bash
npm install
npm run check
```

The tests are retained as focused regression suites because they protect distinct workflows and viewport contracts. They are source files, not generated release artifacts.

Current suites cover:

- hosted/PWA package integrity
- mobile navigation dropdowns
- Court portrait and landscape layouts
- Director overview and progress calculations
- spectator Live Scores and team presentation
- global layout and mobile Setup
- Results and Live Scores mobile landscape behavior
- header/navigation alignment

Generated reports, manifests, screenshots, ZIP archives, and temporary build folders should not be committed to the repository.

- `tests/split-court-stabilization-test.py` verifies split-pool tiebreak routing and generation, the winner-required stop rule, court-specific queues, and duplicate-match prevention.
