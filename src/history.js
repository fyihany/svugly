/* History module — Undo/Redo via SVG DOM snapshots */

export class History {
  constructor() {
    this.stack = [];
    this.pointer = -1;
    this.maxSize = 50;
    this.onChange = null; // callback(canUndo, canRedo)
  }

  /** Save a snapshot of the current SVG innerHTML */
  push(svgHtml) {
    // Remove future states if we branched
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(svgHtml);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.pointer++;
    }
    this._notify();
  }

  undo() {
    if (!this.canUndo()) return null;
    this.pointer--;
    this._notify();
    return this.stack[this.pointer];
  }

  redo() {
    if (!this.canRedo()) return null;
    this.pointer++;
    this._notify();
    return this.stack[this.pointer];
  }

  canUndo() {
    return this.pointer > 0;
  }

  canRedo() {
    return this.pointer < this.stack.length - 1;
  }

  clear() {
    this.stack = [];
    this.pointer = -1;
    this._notify();
  }

  _notify() {
    if (this.onChange) {
      this.onChange(this.canUndo(), this.canRedo());
    }
  }
}
