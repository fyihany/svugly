/* Exporter module — export SVG as code or file */

export class Exporter {
  constructor(getCanvasFn) {
    this.getCanvas = getCanvasFn; // () => Canvas instance

    this.modal = document.getElementById('export-modal');
    this.codeArea = document.getElementById('export-code');
    this.prettifyCheckbox = document.getElementById('export-prettify');

    this._bind();
  }

  _bind() {
    // Open modal
    document.getElementById('btn-export').addEventListener('click', () => {
      this.open();
    });

    // Close modal
    document.getElementById('btn-close-export').addEventListener('click', () => {
      this.close();
    });

    // Click overlay to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Prettify toggle
    this.prettifyCheckbox.addEventListener('change', () => {
      this._updateCode();
    });

    // Copy to clipboard
    document.getElementById('btn-copy-code').addEventListener('click', () => {
      this._copyToClipboard();
    });

    // Download .svg
    document.getElementById('btn-download-svg').addEventListener('click', () => {
      this._downloadSVG();
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) {
        this.close();
      }
    });
  }

  open() {
    this._updateCode();
    this.modal.hidden = false;
  }

  close() {
    this.modal.hidden = true;
  }

  _updateCode() {
    const canvas = this.getCanvas();
    if (!canvas) return;
    const prettify = this.prettifyCheckbox.checked;
    this.codeArea.value = canvas.getSVGString(prettify);
  }

  async _copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this.codeArea.value);
      this._showToast('SVG code copied to clipboard!');
    } catch {
      // Fallback
      this.codeArea.select();
      document.execCommand('copy');
      this._showToast('SVG code copied to clipboard!');
    }
  }

  _downloadSVG() {
    const canvas = this.getCanvas();
    if (!canvas) return;
    const svgString = canvas.getSVGString(this.prettifyCheckbox.checked);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this._showToast('SVG file downloaded!');
  }

  _showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
  }
}
