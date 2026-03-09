/* Canvas module — renders the SVG, handles pan/zoom, element selection */

export class Canvas {
  constructor({ onSelect, onHover, onElementMoved, onTransformChange }) {
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onElementMoved = onElementMoved || null;
    this.onTransformChange = onTransformChange || null;
    this.onCornerModeToggle = null; // set externally by main.js

    this.canvasArea = document.getElementById("canvas-area");
    this.wrapper = document.getElementById("canvas-wrapper");
    this.container = document.getElementById("svg-canvas");
    this.gridOverlay = document.getElementById("grid-overlay");
    this.rulerH = document.getElementById("ruler-h");
    this.rulerV = document.getElementById("ruler-v");
    this.svgRoot = null;

    // Transform state
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // UI state
    this.showGrid = true;
    this.showRulers = false;
    this.isMoveMode = false;
    this.isCornerMode = false;

    this.selectedElement = null;
    this.hoveredElement = null;

    // Element drag state
    this._isDraggingEl = false;
    this._didElDrag = false;
    this._dragEl = null;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragBaseX = 0;
    this._dragBaseY = 0;
    this._dragOtherTransform = "";

    // Apply initial grid visibility
    this.canvasArea.classList.add("show-grid");

    this._bindControls();
    this._bindPanZoom();

    // Redraw rulers on window resize
    window.addEventListener("resize", () => {
      if (this.showRulers) this._drawRulers();
    });
  }

  /** Load a parsed SVG element into the canvas */
  loadSVG(svgEl) {
    this.container.innerHTML = "";
    // Import the SVG node into the current document
    const imported = document.importNode(svgEl, true);

    // Normalize to 0,0 origin
    this._normalizeToOrigin(imported);

    // Ensure SVG has dimensions for display
    if (!imported.getAttribute("width") && !imported.getAttribute("height")) {
      const vb = imported.getAttribute("viewBox");
      if (vb) {
        const parts = vb.split(/[\s,]+/);
        imported.setAttribute("width", parts[2] || 400);
        imported.setAttribute("height", parts[3] || 400);
      } else {
        imported.setAttribute("width", 400);
        imported.setAttribute("height", 400);
      }
    }

    this.container.appendChild(imported);
    this.svgRoot = imported;

    // Allow content to be visible outside the viewBox while editing
    this.svgRoot.style.overflow = "visible";

    // Assign internal IDs for element tracking
    this._assignInternalIds(this.svgRoot);

    // Reset view
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this._fitToView();

    // Bind element interaction
    this._bindElementEvents();
  }

  /** Get the current SVG element */
  getSVG() {
    return this.svgRoot;
  }

  /** Get serialized SVG string */
  getSVGString(prettify = true) {
    if (!this.svgRoot) return "";

    // Compute bounding box of all content in SVG user units (includes elements outside viewBox)
    let contentBox = null;
    try {
      contentBox = this.svgRoot.getBBox();
    } catch (e) {
      // getBBox can fail if SVG is not rendered
    }

    // Parse current viewBox
    const vbStr = this.svgRoot.getAttribute("viewBox");
    let vbX = 0,
      vbY = 0,
      vbW,
      vbH;
    if (vbStr) {
      const parts = vbStr
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      [vbX, vbY, vbW, vbH] = parts;
    } else {
      vbW = parseFloat(this.svgRoot.getAttribute("width")) || 400;
      vbH = parseFloat(this.svgRoot.getAttribute("height")) || 400;
    }

    // Clone to clean up editor artifacts
    const clone = this.svgRoot.cloneNode(true);

    // Remove internal data attributes and editor outlines
    clone.querySelectorAll("*").forEach((el) => {
      el.removeAttribute("data-svg-editor-id");
      el.classList.remove("svg-el-hover-outline", "svg-el-selected-outline");
      if (el.getAttribute("class") === "") el.removeAttribute("class");
    });
    clone.removeAttribute("data-svg-editor-id");
    clone.classList.remove("svg-el-hover-outline", "svg-el-selected-outline");
    if (clone.getAttribute("class") === "") clone.removeAttribute("class");

    // Remove the overflow:visible style added for editing — export clips normally
    clone.style.removeProperty("overflow");

    // Expand viewBox to encompass all content that extends beyond the original bounds
    if (contentBox && contentBox.width > 0 && contentBox.height > 0) {
      const newX = Math.min(vbX, contentBox.x);
      const newY = Math.min(vbY, contentBox.y);
      const newRight = Math.max(vbX + vbW, contentBox.x + contentBox.width);
      const newBottom = Math.max(vbY + vbH, contentBox.y + contentBox.height);
      const newW = newRight - newX;
      const newH = newBottom - newY;
      clone.setAttribute("viewBox", `${newX} ${newY} ${newW} ${newH}`);
      clone.setAttribute("width", newW);
      clone.setAttribute("height", newH);
    }

    const serializer = new XMLSerializer();
    let str = serializer.serializeToString(clone);

    if (prettify) {
      str = this._prettifyXML(str);
    }

    return str;
  }

  /** Highlight a specific element (e.g. when selected from tree) */
  highlightElement(el) {
    this._clearSelection();
    if (el && this.svgRoot && this.svgRoot.contains(el)) {
      el.classList.add("svg-el-selected-outline");
      this.selectedElement = el;
    }
  }

  /** Clear current selection */
  clearSelection() {
    this._clearSelection();
    this.selectedElement = null;
  }

  /** Refresh the view (e.g. after DOM mutations) */
  refresh() {
    this._applyTransform();
  }

  /** Enable or disable element move mode */
  setMoveMode(active) {
    this.isMoveMode = active;
    document.getElementById("btn-move-mode").classList.toggle("active", active);
    if (this.svgRoot) {
      this.svgRoot.style.cursor = active ? "grab" : "";
    }
  }

  /** Enable or disable corner edit mode */
  setCornerMode(active) {
    this.isCornerMode = active;
    const btn = document.getElementById("btn-corner-mode");
    if (btn) btn.classList.toggle("active", active);
  }

  /* ─── Normalize imported SVG to 0,0 origin ─── */
  _normalizeToOrigin(svgEl) {
    // Remove root x/y — only relevant inside another SVG, not as root canvas
    svgEl.removeAttribute("x");
    svgEl.removeAttribute("y");

    const vb = svgEl.getAttribute("viewBox");
    if (!vb) return;

    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length < 4 || isNaN(parts[0]) || isNaN(parts[1])) return;

    const [minX, minY, width, height] = parts;
    if (minX === 0 && minY === 0) return; // already at origin

    // Wrap all child nodes in a <g> with compensating translate
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.setAttribute("transform", `translate(${-minX}, ${-minY})`);
    while (svgEl.firstChild) {
      g.appendChild(svgEl.firstChild);
    }
    svgEl.appendChild(g);
    svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  /* ─── Transform helpers for element drag ─── */
  _parseTranslate(transform) {
    if (!transform) return { x: 0, y: 0 };
    const m = transform.match(
      /translate\(\s*([+-]?[\d.eE+-]+)(?:[,\s]+([+-]?[\d.eE+-]+))?\s*\)/
    );
    if (!m) return { x: 0, y: 0 };
    return { x: parseFloat(m[1]), y: parseFloat(m[2] != null ? m[2] : 0) };
  }

  _removeTranslate(transform) {
    if (!transform) return "";
    return transform.replace(/translate\([^)]*\)\s*/g, "").trim();
  }

  /* ─── Internal IDs ─── */
  _idCounter = 0;

  _assignInternalIds(root) {
    this._idCounter = 0;
    const walk = (el) => {
      if (el.nodeType !== Node.ELEMENT_NODE) return;
      el.setAttribute("data-svg-editor-id", `el-${this._idCounter++}`);
      for (const child of el.children) {
        walk(child);
      }
    };
    walk(root);
  }

  /* ─── Element interaction ─── */
  _bindElementEvents() {
    if (!this.svgRoot) return;

    // Use event delegation on the SVG root
    this.svgRoot.addEventListener("mouseover", (e) => {
      const target = this._getSelectableTarget(e.target);
      if (target && target !== this.svgRoot && target !== this.hoveredElement) {
        this._clearHover();
        target.classList.add("svg-el-hover-outline");
        this.hoveredElement = target;
        if (this.onHover) this.onHover(target);
      }
    });

    this.svgRoot.addEventListener("mouseout", (e) => {
      const target = this._getSelectableTarget(e.target);
      if (target) {
        this._clearHover();
        if (this.onHover) this.onHover(null);
      }
    });

    // Mousedown — start element drag in move mode
    this.svgRoot.addEventListener("mousedown", (e) => {
      if (!this.isMoveMode || e.button !== 0) return;
      const target = this._getSelectableTarget(e.target);
      if (!target || target === this.svgRoot) return;

      // Select immediately
      this._clearSelection();
      target.classList.add("svg-el-selected-outline");
      this.selectedElement = target;
      if (this.onSelect) this.onSelect(target);

      // Prepare drag
      this._isDraggingEl = true;
      this._didElDrag = false;
      this._dragEl = target;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      const existing = target.getAttribute("transform") || "";
      const base = this._parseTranslate(existing);
      this._dragBaseX = base.x;
      this._dragBaseY = base.y;
      this._dragOtherTransform = this._removeTranslate(existing);
      this.svgRoot.style.cursor = "grabbing";
    });

    this.svgRoot.addEventListener("click", (e) => {
      e.stopPropagation();
      // Suppress click after a move-mode drag
      if (this.isMoveMode && this._didElDrag) {
        this._didElDrag = false;
        return;
      }
      const target = this._getSelectableTarget(e.target);
      if (target && target !== this.svgRoot) {
        this._clearSelection();
        target.classList.add("svg-el-selected-outline");
        this.selectedElement = target;
        if (this.onSelect) this.onSelect(target);
      }
    });

    // Click on empty canvas = deselect
    this.wrapper.addEventListener("click", (e) => {
      if (e.target === this.wrapper || e.target === this.container) {
        this._clearSelection();
        this.selectedElement = null;
        if (this.onSelect) this.onSelect(null);
      }
    });

    // Update cursor when move mode changes after load
    if (this.isMoveMode) this.svgRoot.style.cursor = "grab";
  }

  _getSelectableTarget(el) {
    // Walk up to find the nearest element with a data-svg-editor-id
    while (el && el !== this.svgRoot) {
      if (el.hasAttribute && el.hasAttribute("data-svg-editor-id")) return el;
      el = el.parentElement;
    }
    return el;
  }

  _clearHover() {
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove("svg-el-hover-outline");
      this.hoveredElement = null;
    }
  }

  _clearSelection() {
    if (this.svgRoot) {
      this.svgRoot
        .querySelectorAll(".svg-el-selected-outline")
        .forEach((el) => {
          el.classList.remove("svg-el-selected-outline");
        });
    }
    this.selectedElement = null;
  }

  /* ─── Pan & Zoom ─── */
  _bindPanZoom() {
    this.wrapper.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.scale = Math.max(0.1, Math.min(10, this.scale * delta));
        this._applyTransform();
        this._updateZoomDisplay();
      },
      { passive: false }
    );

    this.wrapper.addEventListener("mousedown", (e) => {
      // Middle button, right-click, or left-click on empty background for pan
      const isEmptySpace =
        e.target === this.wrapper || e.target === this.container;
      if (
        e.button === 1 ||
        e.button === 2 ||
        (e.button === 0 && (e.altKey || isEmptySpace))
      ) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.translateX;
        this.panStartY = e.clientY - this.translateY;
        e.preventDefault();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this._isDraggingEl && this._dragEl) {
        const dx = (e.clientX - this._dragStartX) / this.scale;
        const dy = (e.clientY - this._dragStartY) / this.scale;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._didElDrag = true;
        const newTx = this._dragBaseX + dx;
        const newTy = this._dragBaseY + dy;
        let t = `translate(${newTx.toFixed(2)}, ${newTy.toFixed(2)})`;
        if (this._dragOtherTransform) t += " " + this._dragOtherTransform;
        this._dragEl.setAttribute("transform", t);
      } else if (this.isPanning) {
        this.translateX = e.clientX - this.panStartX;
        this.translateY = e.clientY - this.panStartY;
        this._applyTransform();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this._isDraggingEl) {
        this._isDraggingEl = false;
        if (this._didElDrag && this._dragEl && this.onElementMoved) {
          this.onElementMoved(this._dragEl);
        }
        this._dragEl = null;
        if (this.svgRoot) {
          this.svgRoot.style.cursor = this.isMoveMode ? "grab" : "";
        }
      }
      this.isPanning = false;
    });
  }

  _bindControls() {
    document.getElementById("btn-zoom-in").addEventListener("click", () => {
      this.scale = Math.min(10, this.scale * 1.2);
      this._applyTransform();
      this._updateZoomDisplay();
    });

    document.getElementById("btn-zoom-out").addEventListener("click", () => {
      this.scale = Math.max(0.1, this.scale / 1.2);
      this._applyTransform();
      this._updateZoomDisplay();
    });

    document.getElementById("btn-zoom-fit").addEventListener("click", () => {
      this._fitToView();
    });

    document
      .getElementById("btn-toggle-grid")
      .addEventListener("click", (e) => {
        this.showGrid = !this.showGrid;
        e.currentTarget.classList.toggle("active", this.showGrid);
        this.canvasArea.classList.toggle("show-grid", this.showGrid);
      });

    document
      .getElementById("btn-toggle-rulers")
      .addEventListener("click", (e) => {
        this.showRulers = !this.showRulers;
        e.currentTarget.classList.toggle("active", this.showRulers);
        this.canvasArea.classList.toggle("show-rulers", this.showRulers);
        if (this.showRulers) {
          // Canvases just became visible — draw on next frame after layout
          requestAnimationFrame(() => this._drawRulers());
        }
      });

    document.getElementById("btn-move-mode").addEventListener("click", () => {
      this.setMoveMode(!this.isMoveMode);
    });

    const cornerBtn = document.getElementById("btn-corner-mode");
    if (cornerBtn) {
      cornerBtn.addEventListener("click", () => {
        if (this.onCornerModeToggle) this.onCornerModeToggle();
      });
    }
  }

  _fitToView() {
    if (!this.svgRoot) return;

    const wrapperRect = this.wrapper.getBoundingClientRect();
    const svgW = parseFloat(this.svgRoot.getAttribute("width")) || 400;
    const svgH = parseFloat(this.svgRoot.getAttribute("height")) || 400;

    const padding = 60;
    const scaleX = (wrapperRect.width - padding * 2) / svgW;
    const scaleY = (wrapperRect.height - padding * 2) / svgH;
    this.scale = Math.min(scaleX, scaleY, 2);

    this.translateX = (wrapperRect.width - svgW * this.scale) / 2;
    this.translateY = (wrapperRect.height - svgH * this.scale) / 2;

    this._applyTransform();
    this._updateZoomDisplay();
  }

  _applyTransform() {
    this.container.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    this._updateGrid();
    if (this.showRulers) this._drawRulers();
    if (this.onTransformChange) this.onTransformChange();
  }

  _updateZoomDisplay() {
    document.getElementById("zoom-level").textContent =
      `${Math.round(this.scale * 100)}%`;
  }

  /* ─── Grid ─── */

  /** Pick the smallest "nice" SVG unit interval where the cell is ≥20px on screen */
  _gridUnits() {
    const STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    for (const t of STEPS) {
      if (t * this.scale >= 20) return t;
    }
    return 5000;
  }

  _updateGrid() {
    const units = this._gridUnits();
    const cellPx = units * this.scale;
    // Offset so grid lines align with SVG coordinate origin
    const xOff = ((this.translateX % cellPx) + cellPx) % cellPx;
    const yOff = ((this.translateY % cellPx) + cellPx) % cellPx;
    this.gridOverlay.style.setProperty("--grid-size", `${cellPx}px`);
    this.gridOverlay.style.setProperty("--grid-x", `${xOff}px`);
    this.gridOverlay.style.setProperty("--grid-y", `${yOff}px`);
  }

  /* ─── Rulers ─── */

  /** Pick a nice label interval (SVG units) so labels are ≥50px apart on screen */
  _rulerInterval() {
    const STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    const minSVG = 50 / this.scale;
    for (const t of STEPS) {
      if (t >= minSVG) return t;
    }
    return 5000;
  }

  _formatLabel(value) {
    const v = Math.round(value);
    if (Math.abs(v) >= 10000) return (v / 1000).toFixed(0) + "k";
    return String(v);
  }

  _rulerColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      bg: style.getPropertyValue("--bg-secondary").trim() || "#0c1220",
      text: style.getPropertyValue("--text-secondary").trim() || "#5a8aaa",
      tick:
        style.getPropertyValue("--border-hover").trim() ||
        "rgba(0,212,255,0.4)",
      zero: style.getPropertyValue("--accent").trim() || "#00d4ff"
    };
  }

  _drawRulers() {
    this._drawHRuler();
    this._drawVRuler();
  }

  _drawHRuler() {
    const canvas = this.rulerH;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    const c = this._rulerColors();
    const interval = this._rulerInterval();
    const intervalPx = interval * this.scale;

    // Background
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    // Bottom border line
    ctx.strokeStyle = c.tick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
    ctx.stroke();

    ctx.font = `9px monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    const startSVG =
      Math.floor(-this.translateX / this.scale / interval) * interval;

    for (let i = 0; i < Math.ceil(w / intervalPx) + 2; i++) {
      const svgX = startSVG + i * interval;
      const screenX = Math.round(svgX * this.scale + this.translateX) + 0.5;
      if (screenX < 0 || screenX > w) continue;

      const isOrigin = svgX === 0;
      ctx.strokeStyle = isOrigin ? c.zero : c.tick;
      ctx.lineWidth = isOrigin ? 1.5 : 1;

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(screenX, h);
      ctx.lineTo(screenX, h - (isOrigin ? h : 5));
      ctx.stroke();

      // Label
      ctx.fillStyle = isOrigin ? c.zero : c.text;
      ctx.fillText(this._formatLabel(svgX), screenX + 2, 1);
    }

    // Sub-ticks (halfway marks)
    if (intervalPx >= 40) {
      ctx.strokeStyle = c.tick;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      const halfPx = intervalPx / 2;
      const startSVGHalf =
        Math.floor(-this.translateX / this.scale / (interval / 2)) *
        (interval / 2);
      for (let i = 0; i < Math.ceil(w / halfPx) + 2; i++) {
        const svgX = startSVGHalf + i * (interval / 2);
        if (svgX % interval === 0) continue; // skip main ticks
        const screenX = Math.round(svgX * this.scale + this.translateX) + 0.5;
        if (screenX < 0 || screenX > w) continue;
        ctx.beginPath();
        ctx.moveTo(screenX, h);
        ctx.lineTo(screenX, h - 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  _drawVRuler() {
    const canvas = this.rulerV;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    const c = this._rulerColors();
    const interval = this._rulerInterval();
    const intervalPx = interval * this.scale;

    // Background
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    // Right border line
    ctx.strokeStyle = c.tick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 0.5, 0);
    ctx.lineTo(w - 0.5, h);
    ctx.stroke();

    ctx.font = `9px monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";

    const startSVG =
      Math.floor(-this.translateY / this.scale / interval) * interval;

    for (let i = 0; i < Math.ceil(h / intervalPx) + 2; i++) {
      const svgY = startSVG + i * interval;
      const screenY = Math.round(svgY * this.scale + this.translateY) + 0.5;
      if (screenY < 0 || screenY > h) continue;

      const isOrigin = svgY === 0;
      ctx.strokeStyle = isOrigin ? c.zero : c.tick;
      ctx.lineWidth = isOrigin ? 1.5 : 1;

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(w, screenY);
      ctx.lineTo(w - (isOrigin ? w : 5), screenY);
      ctx.stroke();

      // Label (rotated)
      ctx.save();
      ctx.translate(w - 6, screenY);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = isOrigin ? c.zero : c.text;
      ctx.textAlign = "center";
      ctx.fillText(this._formatLabel(svgY), 0, 0);
      ctx.restore();
    }

    // Sub-ticks
    if (intervalPx >= 40) {
      ctx.strokeStyle = c.tick;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      const startSVGHalf =
        Math.floor(-this.translateY / this.scale / (interval / 2)) *
        (interval / 2);
      for (let i = 0; i < Math.ceil(h / (intervalPx / 2)) + 2; i++) {
        const svgY = startSVGHalf + i * (interval / 2);
        if (svgY % interval === 0) continue;
        const screenY = Math.round(svgY * this.scale + this.translateY) + 0.5;
        if (screenY < 0 || screenY > h) continue;
        ctx.beginPath();
        ctx.moveTo(w, screenY);
        ctx.lineTo(w - 3, screenY);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ─── XML prettify ─── */
  _prettifyXML(xml) {
    const PADDING = "  ";
    let formatted = "";
    let indent = 0;
    const lines = xml.replace(/></g, ">\r\n<").split("\r\n");

    lines.forEach((line) => {
      line = line.trim();
      if (!line) return;

      if (line.startsWith("</")) {
        indent = Math.max(0, indent - 1);
      }

      formatted += PADDING.repeat(indent) + line + "\n";

      if (
        line.startsWith("<") &&
        !line.startsWith("</") &&
        !line.startsWith("<?") &&
        !line.endsWith("/>") &&
        !line.includes("</")
      ) {
        indent++;
      }
    });

    return formatted.trim();
  }
}
