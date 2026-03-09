/* Element Tree module — displays SVG DOM as a collapsible tree */

export class ElementTree {
  constructor({ onSelect, onVisibilityToggle }) {
    this.onSelect = onSelect;
    this.onVisibilityToggle = onVisibilityToggle;
    this.container = document.getElementById('element-tree');
    this.countBadge = document.getElementById('element-count');
    this.searchInput = document.getElementById('tree-search-input');
    this.selectedNodeId = null;

    this.searchInput.addEventListener('input', () => this._filterTree());
  }

  /** Build the tree from an SVG element */
  build(svgRoot) {
    this.container.innerHTML = '';
    this.svgRoot = svgRoot;

    let count = 0;
    const buildNode = (el, depth) => {
      if (el.nodeType !== Node.ELEMENT_NODE) return null;

      // Skip defs, metadata, and style elements from the visible tree (but still count them)
      const tag = el.tagName.toLowerCase();
      const editorId = el.getAttribute('data-svg-editor-id') || '';
      count++;

      const hasChildren = this._getVisibleChildren(el).length > 0;

      // Create tree node
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.dataset.editorId = editorId;
      node.dataset.tagName = tag;

      // Row
      const row = document.createElement('div');
      row.className = 'tree-node-row';
      row.style.paddingLeft = `${12 + depth * 16}px`;

      // Expand button
      if (hasChildren) {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-btn';
        expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const children = node.querySelector('.tree-children');
          if (children) {
            children.classList.toggle('collapsed');
            row.classList.toggle('expanded');
          }
        });
        row.appendChild(expandBtn);
        row.classList.add('expanded');
      } else {
        const spacer = document.createElement('span');
        spacer.style.width = '18px';
        spacer.style.display = 'inline-block';
        spacer.style.flexShrink = '0';
        row.appendChild(spacer);
      }

      // Tag name
      const tagSpan = document.createElement('span');
      tagSpan.className = 'tag-name';
      tagSpan.textContent = `<${tag}>`;
      row.appendChild(tagSpan);

      // ID/class info
      const idStr = el.id ? `#${el.id}` : '';
      const classStr = el.getAttribute('class')
        ? `.${el.getAttribute('class').split(' ').filter(c => !c.startsWith('svg-el-')).join('.')}`
        : '';
      const info = (idStr + classStr).trim();
      if (info) {
        const infoSpan = document.createElement('span');
        infoSpan.className = 'el-id';
        infoSpan.textContent = info;
        row.appendChild(infoSpan);
      }

      // Visibility toggle
      const visBtn = document.createElement('button');
      visBtn.className = 'visibility-btn';
      visBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = el.style.display === 'none';
        el.style.display = isHidden ? '' : 'none';
        visBtn.classList.toggle('hidden-el', !isHidden);
        visBtn.innerHTML = isHidden
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        if (this.onVisibilityToggle) this.onVisibilityToggle(el, !isHidden);
      });
      row.appendChild(visBtn);

      // Click to select
      row.addEventListener('click', () => {
        this._selectInTree(editorId);
        if (this.onSelect) this.onSelect(el);
      });

      node.appendChild(row);

      // Children
      if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';

        this._getVisibleChildren(el).forEach(child => {
          const childNode = buildNode(child, depth + 1);
          if (childNode) childrenContainer.appendChild(childNode);
        });

        node.appendChild(childrenContainer);
      }

      return node;
    };

    // Build from SVG root, starting with its children
    const rootNode = buildNode(svgRoot, 0);
    if (rootNode) this.container.appendChild(rootNode);

    this.countBadge.textContent = count;
  }

  /** Select a node in the tree by editor ID */
  selectByEditorId(editorId) {
    this._selectInTree(editorId);
  }

  /** Highlight a node in the tree (for hover) */
  highlightByEditorId(editorId) {
    // We could add a hover class, but for now just leave it
  }

  _selectInTree(editorId) {
    // Clear previous selection
    this.container.querySelectorAll('.tree-node-row.selected').forEach(row => {
      row.classList.remove('selected');
    });

    this.selectedNodeId = editorId;

    // Find and select the node
    const node = this.container.querySelector(`.tree-node[data-editor-id="${editorId}"]`);
    if (node) {
      const row = node.querySelector(':scope > .tree-node-row');
      if (row) {
        row.classList.add('selected');
        // Ensure parent nodes are expanded
        this._expandParents(node);
        // Scroll into view
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  _expandParents(node) {
    let parent = node.parentElement;
    while (parent && parent !== this.container) {
      if (parent.classList.contains('tree-children')) {
        parent.classList.remove('collapsed');
        const parentNode = parent.parentElement;
        if (parentNode) {
          const parentRow = parentNode.querySelector(':scope > .tree-node-row');
          if (parentRow) parentRow.classList.add('expanded');
        }
      }
      parent = parent.parentElement;
    }
  }

  _getVisibleChildren(el) {
    return Array.from(el.children).filter(child =>
      child.nodeType === Node.ELEMENT_NODE
    );
  }

  _filterTree() {
    const query = this.searchInput.value.toLowerCase().trim();
    const nodes = this.container.querySelectorAll('.tree-node');

    if (!query) {
      nodes.forEach(n => n.style.display = '');
      return;
    }

    nodes.forEach(node => {
      const tag = node.dataset.tagName || '';
      const row = node.querySelector(':scope > .tree-node-row');
      const text = row ? row.textContent.toLowerCase() : '';
      const match = tag.includes(query) || text.includes(query);
      node.style.display = match ? '' : 'none';

      // If a child matches, show the parent too
      if (match) {
        this._showParentNodes(node);
      }
    });
  }

  _showParentNodes(node) {
    let parent = node.parentElement;
    while (parent && parent !== this.container) {
      if (parent.classList.contains('tree-node')) {
        parent.style.display = '';
      }
      parent = parent.parentElement;
    }
  }
}
