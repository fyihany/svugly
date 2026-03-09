/* CornerEditor — interactive drag handles for editing <rect> corner radii (rx/ry)
 *
 * Handles are rendered as HTML elements absolutely positioned over the canvas area,
 * so they stay at a fixed screen size regardless of zoom level.
 * Coordinate conversion uses getScreenCTM() to correctly handle SVG transforms.
 */

export class CornerEditor {
  /**
   * @param {object} canvas   — Canvas instance (canvas.js)
   * @param {object} options
   * @param {Function} [options.onUpdate]  — called after user finishes dragging
   */
  constructor(canvas, { onUpdate } = {}) {
    this.canvas = canvas;
    this.onUpdate = onUpdate || null;

    this.rectEl = null;   // <rect> element currently being edited
    this.isActive = false;

    // Drag state
    this._dragging = false;
    this._dragHandleIdx = -1;
    this._dragStartSvgX = 0;   // mouse x in SVG user coords at drag start
    this._dragStartRx = 0;
    this._iCTM = null;         // inverse screen CTM captured at drag start

    // ── Overlay container ──────────────────────────────────────────────────
    this._overlay = document.createElement('div');
    this._overlay.id = 'corner-editor-overlay';
    canvas.canvasArea.appendChild(this._overlay);
    this._overlay.style.display = 'none';

    // ── 4 handles (TL, TR, BR, BL — on the top/bottom edges) ──────────────
    // Each handle sits at the point where the arc begins on the top or bottom edge:
    //   TL → (x + rx, y)         TR → (x + w − rx, y)
    //   BL → (x + rx, y + h)     BR → (x + w − rx, y + h)
    this._handles = Array.from({ length: 4 }, (_, i) => {
      const h = document.createElement('div');
      h.className = 'corner-handle';
      h.addEventListener('mousedown', (e) => this._onHandleMousedown(e, i));
      this._overlay.appendChild(h);
      return h;
    });

    // ── Bound global listeners (kept for lifetime of the editor) ───────────
    this._onMouseMoveBound = this._onMouseMove.bind(this);
    this._onMouseUpBound   = this._onMouseUp.bind(this);
    window.addEventListener('mousemove', this._onMouseMoveBound);
    window.addEventListener('mouseup',   this._onMouseUpBound);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Activate the editor for a specific <rect> element. */
  activate(rectEl) {
    this.rectEl  = rectEl;
    this.isActive = true;
    this._overlay.style.display = '';
    this.updatePositions();
  }

  /** Deactivate and hide all handles. */
  deactivate() {
    this.isActive = false;
    this.rectEl   = null;
    this._overlay.style.display = 'none';
    this._dragging = false;
  }

  /**
   * Recalculate screen positions of all handles.
   * Call this whenever the canvas pan/zoom changes.
   */
  updatePositions() {
    if (!this.isActive || !this.rectEl) return;

    const rx = Math.max(0, parseFloat(this.rectEl.getAttribute('rx')) || 0);
    const x  = parseFloat(this.rectEl.getAttribute('x'))      || 0;
    const y  = parseFloat(this.rectEl.getAttribute('y'))      || 0;
    const w  = parseFloat(this.rectEl.getAttribute('width'))  || 0;
    const h  = parseFloat(this.rectEl.getAttribute('height')) || 0;

    // Handle positions in SVG user coordinates
    const svgPositions = [
      [x + rx,     y    ],   // 0 TL — top edge
      [x + w - rx, y    ],   // 1 TR — top edge
      [x + w - rx, y + h],   // 2 BR — bottom edge
      [x + rx,     y + h],   // 3 BL — bottom edge
    ];

    const ctm      = this.rectEl.getScreenCTM();
    if (!ctm) return;
    const areaRect = this.canvas.canvasArea.getBoundingClientRect();

    svgPositions.forEach(([sx, sy], i) => {
      // SVG user coords → screen px → relative to canvas-area
      const screenX = ctm.a * sx + ctm.c * sy + ctm.e - areaRect.left;
      const screenY = ctm.b * sx + ctm.d * sy + ctm.f - areaRect.top;
      this._handles[i].style.left = `${screenX}px`;
      this._handles[i].style.top  = `${screenY}px`;
    });
  }

  /** Call this when the CornerEditor is no longer needed. */
  destroy() {
    window.removeEventListener('mousemove', this._onMouseMoveBound);
    window.removeEventListener('mouseup',   this._onMouseUpBound);
    this._overlay.remove();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _onHandleMousedown(e, idx) {
    e.preventDefault();
    e.stopPropagation();

    this._dragging       = true;
    this._dragHandleIdx  = idx;

    // Capture the inverse CTM once so the whole drag uses a consistent transform
    const ctm = this.rectEl.getScreenCTM();
    this._iCTM = ctm ? ctm.inverse() : null;

    const startSvg = this._clientToSvg(e.clientX, e.clientY);
    this._dragStartSvgX = startSvg.x;
    this._dragStartRx   = Math.max(0, parseFloat(this.rectEl.getAttribute('rx')) || 0);
  }

  _onMouseMove(e) {
    if (!this._dragging || !this.rectEl) return;

    const currSvg = this._clientToSvg(e.clientX, e.clientY);
    const dx      = currSvg.x - this._dragStartSvgX;

    const w     = parseFloat(this.rectEl.getAttribute('width'))  || 0;
    const h     = parseFloat(this.rectEl.getAttribute('height')) || 0;
    const maxRx = Math.min(w, h) / 2;

    // Handles 0 (TL) and 3 (BL) are on the left side — dragging RIGHT increases rx.
    // Handles 1 (TR) and 2 (BR) are on the right side — dragging LEFT increases rx.
    const sign  = (this._dragHandleIdx === 0 || this._dragHandleIdx === 3) ? 1 : -1;
    const newRx = Math.max(0, Math.min(maxRx, this._dragStartRx + sign * dx));

    this.rectEl.setAttribute('rx', newRx.toFixed(2));
    this.rectEl.setAttribute('ry', newRx.toFixed(2));

    this.updatePositions();
  }

  _onMouseUp() {
    if (!this._dragging) return;
    this._dragging = false;
    if (this.onUpdate) this.onUpdate();
  }

  /** Convert client (screen) coordinates to SVG user coordinates using the cached inverse CTM. */
  _clientToSvg(clientX, clientY) {
    if (!this._iCTM) return { x: 0, y: 0 };
    const m = this._iCTM;
    return {
      x: m.a * clientX + m.c * clientY + m.e,
      y: m.b * clientX + m.d * clientY + m.f,
    };
  }
}
