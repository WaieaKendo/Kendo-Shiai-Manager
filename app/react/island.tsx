// Mount React components ("islands") into elements of the legacy app.
//
//   const island = mountIsland(document.getElementById('someSlot')!, <Thing />);
//   island.render(<Thing value={2} />);   // re-render with new props
//   island.unmount();
//
// Mounting into an element that already has an island re-renders that island.
// Components that read the legacy `state` use useLegacyState() (legacy-bridge.ts).
import { StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export interface Island {
  render(node: ReactNode): void;
  unmount(): void;
}

const islands = new WeakMap<Element, Island>();

export function mountIsland(el: Element, node: ReactNode): Island {
  const existing = islands.get(el);
  if (existing) {
    existing.render(node);
    return existing;
  }
  let root: Root | null = createRoot(el);
  const island: Island = {
    render(next) {
      root?.render(<StrictMode>{next}</StrictMode>);
    },
    unmount() {
      root?.unmount();
      root = null;
      islands.delete(el);
    },
  };
  islands.set(el, island);
  island.render(node);
  return island;
}
