/* Properties module — displays and edits attributes of selected SVG element */

export class Properties {
  constructor({ onUpdate, onDelete, onDuplicate }) {
    this.onUpdate = onUpdate;     // callback() after any property change
    this.onDelete = onDelete;     // callback(element)
    this.onDuplicate = onDuplicate; // callback(element)
    this.selectedElement = null;

    // Cache DOM refs
    this.noSelectionMsg = document.getElementById('no-selection-msg');
    this.propsForm = document.getElementById('props-form');
    this.propTag = document.getElementById('prop-tag');
    this.propId = document.getElementById('prop-id');
    this.propClass = document.getElementById('prop-class');

    this.propFill = document.getElementById('prop-fill');
    this.propFillColor = document.getElementById('prop-fill-color');
    this.propStroke = document.getElementById('prop-stroke');
    this.propStrokeColor = document.getElementById('prop-stroke-color');
    this.propStrokeWidth = document.getElementById('prop-stroke-width');
    this.propOpacityRange = document.getElementById('prop-opacity-range');
    this.propOpacity = document.getElementById('prop-opacity');
    this.propTransform = document.getElementById('prop-transform');

    this.attrList = document.getElementById('attributes-list');

    this._bindActions();
    this._bindPropertyInputs();
  }

  /** Show properties for an element */
  show(el) {
    this.selectedElement = el;

    if (!el) {
      this.noSelectionMsg.hidden = false;
      this.propsForm.hidden = true;
      document.getElementById('status-selection').textContent = 'No selection';
      return;
    }

    this.noSelectionMsg.hidden = true;
    this.propsForm.hidden = false;

    const tag = el.tagName.toLowerCase();
    this.propTag.textContent = `<${tag}>`;

    this.propId.value = el.id || '';

    // Get class without editor classes
    const classes = (el.getAttribute('class') || '')
      .split(' ')
      .filter(c => !c.startsWith('svg-el-'))
      .join(' ')
      .trim();
    this.propClass.value = classes;

    // Appearance
    const fill = el.getAttribute('fill') || this._getComputedStyle(el, 'fill') || '';
    this.propFill.value = fill;
    this.propFillColor.value = this._toHex(fill) || '#000000';

    const stroke = el.getAttribute('stroke') || this._getComputedStyle(el, 'stroke') || '';
    this.propStroke.value = stroke;
    this.propStrokeColor.value = this._toHex(stroke) || '#000000';

    this.propStrokeWidth.value = el.getAttribute('stroke-width') || '';

    const opacity = el.getAttribute('opacity') || '1';
    this.propOpacityRange.value = opacity;
    this.propOpacity.value = opacity;

    this.propTransform.value = el.getAttribute('transform') || '';

    // Show/hide appearance section based on element type
    const appearanceSection = document.getElementById('section-appearance');
    const nonVisualTags = ['svg', 'g', 'defs', 'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient', 'stop', 'symbol', 'use', 'title', 'desc', 'metadata'];
    appearanceSection.style.display = nonVisualTags.includes(tag) ? 'none' : '';

    // Build all attributes list
    this._buildAttributesList(el);

    // Status bar
    const idInfo = el.id ? ` #${el.id}` : '';
    document.getElementById('status-selection').textContent = `Selected: <${tag}>${idInfo}`;
  }

  /** Clear properties panel */
  clear() {
    this.show(null);
  }

  _bindActions() {
    document.getElementById('btn-delete-el').addEventListener('click', () => {
      if (this.selectedElement && this.onDelete) {
        this.onDelete(this.selectedElement);
      }
    });

    document.getElementById('btn-duplicate-el').addEventListener('click', () => {
      if (this.selectedElement && this.onDuplicate) {
        this.onDuplicate(this.selectedElement);
      }
    });
  }

  _bindPropertyInputs() {
    // ID
    this.propId.addEventListener('change', () => {
      if (!this.selectedElement) return;
      if (this.propId.value) {
        this.selectedElement.setAttribute('id', this.propId.value);
      } else {
        this.selectedElement.removeAttribute('id');
      }
      this._notifyUpdate();
    });

    // Class
    this.propClass.addEventListener('change', () => {
      if (!this.selectedElement) return;
      // Preserve editor classes
      const editorClasses = (this.selectedElement.getAttribute('class') || '')
        .split(' ')
        .filter(c => c.startsWith('svg-el-'));
      const userClasses = this.propClass.value.trim();
      const allClasses = [...editorClasses, ...userClasses.split(' ').filter(Boolean)].join(' ');
      if (allClasses) {
        this.selectedElement.setAttribute('class', allClasses);
      } else {
        this.selectedElement.removeAttribute('class');
      }
      this._notifyUpdate();
    });

    // Fill (text)
    this.propFill.addEventListener('change', () => {
      if (!this.selectedElement) return;
      if (this.propFill.value) {
        this.selectedElement.setAttribute('fill', this.propFill.value);
        this.selectedElement.style.fill = this.propFill.value;
        this.propFillColor.value = this._toHex(this.propFill.value) || '#000000';
      } else {
        this.selectedElement.removeAttribute('fill');
        this.selectedElement.style.fill = '';
      }
      this._notifyUpdate();
    });

    // Fill (color picker)
    this.propFillColor.addEventListener('input', () => {
      if (!this.selectedElement) return;
      this.selectedElement.setAttribute('fill', this.propFillColor.value);
      this.selectedElement.style.fill = this.propFillColor.value;
      this.propFill.value = this.propFillColor.value;
      this._notifyUpdate();
    });

    // Stroke (text)
    this.propStroke.addEventListener('change', () => {
      if (!this.selectedElement) return;
      if (this.propStroke.value) {
        this.selectedElement.setAttribute('stroke', this.propStroke.value);
        this.selectedElement.style.stroke = this.propStroke.value;
        this.propStrokeColor.value = this._toHex(this.propStroke.value) || '#000000';
      } else {
        this.selectedElement.removeAttribute('stroke');
        this.selectedElement.style.stroke = '';
      }
      this._notifyUpdate();
    });

    // Stroke (color picker)
    this.propStrokeColor.addEventListener('input', () => {
      if (!this.selectedElement) return;
      this.selectedElement.setAttribute('stroke', this.propStrokeColor.value);
      this.selectedElement.style.stroke = this.propStrokeColor.value;
      this.propStroke.value = this.propStrokeColor.value;
      this._notifyUpdate();
    });

    // Stroke width
    this.propStrokeWidth.addEventListener('change', () => {
      if (!this.selectedElement) return;
      if (this.propStrokeWidth.value) {
        this.selectedElement.setAttribute('stroke-width', this.propStrokeWidth.value);
        this.selectedElement.style.strokeWidth = this.propStrokeWidth.value;
      } else {
        this.selectedElement.removeAttribute('stroke-width');
        this.selectedElement.style.strokeWidth = '';
      }
      this._notifyUpdate();
    });

    // Opacity (range)
    this.propOpacityRange.addEventListener('input', () => {
      if (!this.selectedElement) return;
      this.propOpacity.value = this.propOpacityRange.value;
      this.selectedElement.setAttribute('opacity', this.propOpacityRange.value);
      this.selectedElement.style.opacity = this.propOpacityRange.value;
      this._notifyUpdate();
    });

    // Opacity (number)
    this.propOpacity.addEventListener('change', () => {
      if (!this.selectedElement) return;
      this.propOpacityRange.value = this.propOpacity.value;
      this.selectedElement.setAttribute('opacity', this.propOpacity.value);
      this.selectedElement.style.opacity = this.propOpacity.value;
      this._notifyUpdate();
    });

    // Transform
    this.propTransform.addEventListener('change', () => {
      if (!this.selectedElement) return;
      if (this.propTransform.value) {
        this.selectedElement.setAttribute('transform', this.propTransform.value);
      } else {
        this.selectedElement.removeAttribute('transform');
      }
      this._notifyUpdate();
    });

    // Add attribute button
    document.getElementById('btn-add-attr').addEventListener('click', () => {
      const select = document.getElementById('new-attr-select');
      const attrName = select.value;
      if (!attrName || !this.selectedElement) return;

      if (this.selectedElement.hasAttribute(attrName)) {
        // Already has it, just ignore or alert
        select.value = '';
        return;
      }

      this.selectedElement.setAttribute(attrName, '');
      this._addAttributeRow(attrName, '');
      this._notifyUpdate();
      select.value = ''; // reset
    });
  }

  _buildAttributesList(el) {
    this.attrList.innerHTML = '';

    // Skip internal attributes and common ones already shown
    const skipAttrs = new Set([
      'data-svg-editor-id', 'class', 'id', 'fill', 'stroke',
      'stroke-width', 'opacity', 'transform', 'xmlns', 'xmlns:xlink'
    ]);

    Array.from(el.attributes).forEach(attr => {
      if (skipAttrs.has(attr.name)) return;
      if (attr.name.startsWith('data-svg-editor')) return;
      this._addAttributeRow(attr.name, attr.value);
    });
  }

  _addAttributeRow(name, value) {
    const row = document.createElement('div');
    row.className = 'attr-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'attr';
    nameInput.value = name;
    nameInput.dataset.origName = name;

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'value';
    valueInput.value = value;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-attr';
    removeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    removeBtn.addEventListener('click', () => {
      if (this.selectedElement && nameInput.dataset.origName) {
        this.selectedElement.removeAttribute(nameInput.dataset.origName);
      }
      row.remove();
      this._notifyUpdate();
    });

    // On change, update the attribute
    const updateAttr = () => {
      if (!this.selectedElement) return;
      // Remove old attribute name if changed
      if (nameInput.dataset.origName && nameInput.dataset.origName !== nameInput.value) {
        this.selectedElement.removeAttribute(nameInput.dataset.origName);
      }
      if (nameInput.value) {
        this.selectedElement.setAttribute(nameInput.value, valueInput.value);
        nameInput.dataset.origName = nameInput.value;
      }
      this._notifyUpdate();
    };

    nameInput.addEventListener('change', updateAttr);
    valueInput.addEventListener('change', updateAttr);

    row.appendChild(nameInput);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);
    this.attrList.appendChild(row);
  }

  _notifyUpdate() {
    if (this.onUpdate) this.onUpdate();
  }

  _getComputedStyle(el, prop) {
    try {
      return window.getComputedStyle(el).getPropertyValue(prop);
    } catch {
      return '';
    }
  }

  _toHex(color) {
    if (!color || color === 'none' || color === 'transparent') return null;
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }

    // Try to parse rgb()
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }

    // Named colors — let the browser do it via a canvas
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = color;
      return ctx.fillStyle;
    } catch {
      return null;
    }
  }
}
