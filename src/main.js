/* Main entry point — wires all modules together */

import { Importer } from './importer.js';
import { Canvas } from './canvas.js';
import { ElementTree } from './element-tree.js';
import { Properties } from './properties.js';
import { History } from './history.js';
import { Exporter } from './exporter.js';
import { CornerEditor } from './corner-editor.js';

// ─── State ───
let canvas, tree, properties, history, exporter, cornerEditor;

// ─── Screen switching ───
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// ─── Save history snapshot ───
function saveSnapshot() {
  if (canvas && canvas.getSVG()) {
    history.push(canvas.getSVG().innerHTML);
  }
}

// ─── Restore SVG from snapshot ───
function restoreFromSnapshot(html) {
  const svg = canvas.getSVG();
  if (svg && html != null) {
    // Deactivate corner editor before restoring
    if (cornerEditor && cornerEditor.isActive) {
      cornerEditor.deactivate();
      canvas.setCornerMode(false);
    }
    svg.innerHTML = html;
    canvas._assignInternalIds(svg);
    canvas._bindElementEvents();
    tree.build(svg);
    properties.clear();
    canvas.clearSelection();
  }
}

// ─── Init modules ───
function init() {
  // History
  history = new History();
  history.onChange = (canUndo, canRedo) => {
    document.getElementById('btn-undo').disabled = !canUndo;
    document.getElementById('btn-redo').disabled = !canRedo;
  };

  // Canvas
  canvas = new Canvas({
    onSelect: (el) => {
      if (el) {
        const editorId = el.getAttribute('data-svg-editor-id');
        tree.selectByEditorId(editorId);
        properties.show(el);
      } else {
        properties.clear();
      }

      // Corner editor: only available for <rect> elements
      const isRect = el && el.tagName.toLowerCase() === 'rect';
      const cornerBtn = document.getElementById('btn-corner-mode');
      if (cornerBtn) cornerBtn.disabled = !isRect;

      if (!isRect && cornerEditor && cornerEditor.isActive) {
        cornerEditor.deactivate();
        canvas.setCornerMode(false);
      }
    },
    onHover: (el) => {
      // Optional: highlight in tree on hover
      if (el) {
        const editorId = el.getAttribute('data-svg-editor-id');
        tree.highlightByEditorId(editorId);
      }
    },
    onElementMoved: (el) => {
      saveSnapshot();
      if (canvas.getSVG()) tree.build(canvas.getSVG());
      if (el) properties.show(el);
      document.getElementById('status-info').textContent = `Přesunuto <${el.tagName.toLowerCase()}>`;
    },
    onTransformChange: () => {
      if (cornerEditor) cornerEditor.updatePositions();
    }
  });

  // Element Tree
  tree = new ElementTree({
    onSelect: (el) => {
      canvas.highlightElement(el);
      properties.show(el);

      // Sync corner mode button state for tree-driven selection
      const isRect = el && el.tagName.toLowerCase() === 'rect';
      const cornerBtn = document.getElementById('btn-corner-mode');
      if (cornerBtn) cornerBtn.disabled = !isRect;
      if (!isRect && cornerEditor && cornerEditor.isActive) {
        cornerEditor.deactivate();
        canvas.setCornerMode(false);
      }
    },
    onVisibilityToggle: () => {
      saveSnapshot();
    }
  });

  // Properties
  properties = new Properties({
    onUpdate: () => {
      saveSnapshot();
      // Re-sync tree if IDs changed etc.
      if (canvas.getSVG()) tree.build(canvas.getSVG());
      // Keep corner handles in sync if corner editor is active
      if (cornerEditor && cornerEditor.isActive) cornerEditor.updatePositions();
    },
    onDelete: (el) => {
      if (!el) return;
      if (cornerEditor && cornerEditor.isActive) {
        cornerEditor.deactivate();
        canvas.setCornerMode(false);
      }
      el.remove();
      saveSnapshot();
      properties.clear();
      canvas.clearSelection();
      if (canvas.getSVG()) tree.build(canvas.getSVG());
      document.getElementById('status-info').textContent = `Deleted <${el.tagName.toLowerCase()}>`;
    },
    onDuplicate: (el) => {
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentElement.insertBefore(clone, el.nextSibling);
      canvas._assignInternalIds(canvas.getSVG());
      saveSnapshot();
      if (canvas.getSVG()) tree.build(canvas.getSVG());
      canvas.highlightElement(clone);
      properties.show(clone);
      document.getElementById('status-info').textContent = `Duplicated <${el.tagName.toLowerCase()}>`;
    }
  });

  // Exporter
  exporter = new Exporter(() => canvas);

  // Corner Editor
  cornerEditor = new CornerEditor(canvas, {
    onUpdate: () => {
      saveSnapshot();
      if (canvas.getSVG()) tree.build(canvas.getSVG());
      if (cornerEditor.rectEl) properties.show(cornerEditor.rectEl);
    }
  });

  canvas.onCornerModeToggle = () => {
    if (!canvas.isCornerMode) {
      // Activate — only if a rect is selected
      const el = canvas.selectedElement;
      if (el && el.tagName.toLowerCase() === 'rect') {
        canvas.setCornerMode(true);
        cornerEditor.activate(el);
        document.getElementById('status-info').textContent = 'Režim úpravy rohů — táhněte táhla pro změnu zaoblení';
      }
    } else {
      canvas.setCornerMode(false);
      cornerEditor.deactivate();
    }
  };

  // Importer
  new Importer((svgEl) => {
    showScreen('editor-screen');
    canvas.loadSVG(svgEl);
    tree.build(canvas.getSVG());
    history.clear();
    saveSnapshot(); // Initial state
    document.getElementById('status-info').textContent = 'SVG loaded successfully';
  });

  // ─── Top bar actions ───

  // Back button
  document.getElementById('btn-back').addEventListener('click', () => {
    if (confirm('Go back to import screen? Unsaved changes will be lost.')) {
      showScreen('import-screen');
      history.clear();
    }
  });

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('theme-light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });

  // Undo
  document.getElementById('btn-undo').addEventListener('click', () => {
    const state = history.undo();
    if (state != null) restoreFromSnapshot(state);
  });

  // Redo
  document.getElementById('btn-redo').addEventListener('click', () => {
    const state = history.redo();
    if (state != null) restoreFromSnapshot(state);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      const state = history.undo();
      if (state != null) restoreFromSnapshot(state);
    }

    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      const state = history.redo();
      if (state != null) restoreFromSnapshot(state);
    }

    if (e.key === 'm' || e.key === 'M') {
      canvas.setMoveMode(!canvas.isMoveMode);
    }

    if (e.key === 'r' || e.key === 'R') {
      if (canvas.onCornerModeToggle) canvas.onCornerModeToggle();
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (canvas.selectedElement && canvas.selectedElement !== canvas.getSVG()) {
        const el = canvas.selectedElement;
        if (cornerEditor && cornerEditor.isActive) {
          cornerEditor.deactivate();
          canvas.setCornerMode(false);
        }
        el.remove();
        saveSnapshot();
        properties.clear();
        canvas.clearSelection();
        if (canvas.getSVG()) tree.build(canvas.getSVG());
      }
    }
  });

  // Attribute Help modal
  const attrHelpModal = document.getElementById('attr-help-modal');
  document.getElementById('btn-attr-help').addEventListener('click', () => {
    attrHelpModal.hidden = false;
  });
  document.getElementById('btn-close-attr-help').addEventListener('click', () => {
    attrHelpModal.hidden = true;
  });
}

// ─── Boot ───
document.addEventListener('DOMContentLoaded', init);
