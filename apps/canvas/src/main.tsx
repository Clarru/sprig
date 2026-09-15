import React from "react";
import { createRoot } from "react-dom/client";
// Prefer the bundled native monospace font over a remote editor-font request.
Object.assign(window,{EXCALIDRAW_ASSET_PATH:'/excalidraw/presenter/'});
const root = createRoot(document.getElementById("root")!);
// This exploration is excluded from production bundles.
if (import.meta.env.DEV && window.location.pathname === '/directions') {
  void import('./diagram-lab').then(({default: DiagramLab}) => {
    root.render(<React.StrictMode><DiagramLab /></React.StrictMode>);
  });
} else {
  void import('./app').then(({default: App}) => {
    root.render(<React.StrictMode><App /></React.StrictMode>);
  });
}
