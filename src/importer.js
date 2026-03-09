/* Importer module — handles SVG input via paste, file upload, and URL */
import { potrace, init } from 'esm-potrace-wasm';

// Start WASM initialization immediately so it's ready when the user first uploads
const potraceReady = init();

export class Importer {
  constructor(onImport) {
    this.onImport = onImport; // callback(svgElement)
    this._bindTabs();
    this._bindPaste();
    this._bindUpload();
    this._bindURL();
  }

  /* ─── Tab switching ─── */
  _bindTabs() {
    const tabs = document.querySelectorAll('.import-tab');
    const panels = document.querySelectorAll('.import-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.querySelector(`.import-panel[data-panel="${target}"]`).classList.add('active');
        this._hideError();
      });
    });
  }

  /* ─── Paste code ─── */
  _bindPaste() {
    document.getElementById('btn-import-code').addEventListener('click', () => {
      const code = document.getElementById('svg-code-input').value.trim();
      if (!code) {
        this._showError('Please paste some SVG code.');
        return;
      }
      this._parseSVG(code);
    });
  }

  /* ─── File upload ─── */
  _bindUpload() {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const btnBrowse = document.getElementById('btn-browse');

    btnBrowse.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    zone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this._readFile(file);
    });

    // Drag & drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this._readFile(file);
    });
  }

  _readFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const isSvg = ext === 'svg' || file.type === 'image/svg+xml';
    const rasterExts = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);
    const rasterMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
    const isRaster = rasterExts.has(ext) || rasterMimes.has(file.type);

    if (!isSvg && !isRaster) {
      this._showError('Unsupported format. Please upload an SVG, PNG, JPG, WebP, or AVIF file.');
      return;
    }

    if (isSvg) {
      const reader = new FileReader();
      reader.onerror = () => this._showError('Failed to read the file.');
      reader.onload = (e) => this._parseSVG(e.target.result);
      reader.readAsText(file);
    } else {
      this._vectorizeFile(file);
    }
  }

  async _vectorizeFile(file) {
    this._setZoneLoading(true);
    try {
      await potraceReady;
      // Načteme obrázek sami: capneme rozlišení a předáme ImageData přímo.
      // ImageData má constructor.name === 'ImageData', takže knihovna ho zpracuje
      // správně bez jakéhokoliv obcházení.
      const imageData = await this._fileToImageData(file);
      const svg = await potrace(imageData, {
        extractcolors: true,         // barevný výstup (multi-pass posterizace)
        posterizelevel: 4,           // počet barevných vrstev (více = lepší barvy)
        posterizationalgorithm: 1,   // interpolované prahy → hladší přechody
        turdsize: 2,                 // ignorovat drobné šmouhy
        opticurve: 1,                // hladké Bézierovy křivky
        opttolerance: 0.2,           // tolerance optimalizace křivek
      });
      this._parseSVG(svg);
    } catch (err) {
      this._showError(`Failed to vectorize image: ${err.message}`);
    } finally {
      this._setZoneLoading(false);
    }
  }

  // Načte File jako ImageData při maximálním rozlišení MAX_DIM na delší stranu.
  // Capnutí rozlišení dramaticky urychlí tracing u velkých fotek bez ztráty kvality.
  _fileToImageData(file, maxDim = 1600) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
          } else {
            width = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(ctx.getImageData(0, 0, width, height));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image.'));
      };
      img.src = url;
    });
  }

  /* ─── URL fetch ─── */
  _bindURL() {
    document.getElementById('btn-import-url').addEventListener('click', () => {
      const url = document.getElementById('svg-url-input').value.trim();
      if (!url) {
        this._showError('Please enter a URL.');
        return;
      }
      this._fetchSVG(url);
    });
  }

  async _fetchSVG(url) {
    this._hideError();
    const btn = document.getElementById('btn-import-url');
    btn.disabled = true;
    btn.textContent = 'Fetching...';

    try {
      let text = null;

      // Strategy 1: Use our Vite dev server proxy (bypasses CORS completely)
      try {
        const proxyUrl = `/api/fetch-svg?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
          text = await response.text();
        }
      } catch {
        // Server proxy not available, continue to fallbacks
      }

      // Strategy 2: Try direct fetch (works if the server sends CORS headers)
      if (!text) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            text = await response.text();
          }
        } catch {
          // CORS blocked, continue
        }
      }

      // Strategy 3: Try CORS proxies as last resort
      if (!text) {
        const corsProxies = [
          (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
          (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        ];

        for (const makeProxyUrl of corsProxies) {
          try {
            const response = await fetch(makeProxyUrl(url));
            if (response.ok) {
              text = await response.text();
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!text) {
        throw new Error('Could not fetch the URL. The server may be blocking requests.');
      }

      // If the response is an HTML page, try to extract embedded SVG
      if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
        const match = text.match(/<svg[\s\S]*?<\/svg>/i);
        if (match) {
          text = match[0];
        } else {
          throw new Error('The URL returned an HTML page with no embedded SVG.');
        }
      }

      this._parseSVG(text);
    } catch (err) {
      this._showError(`Failed to fetch SVG: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> Fetch &amp; Import`;
    }
  }

  /* ─── SVG parsing ─── */
  _parseSVG(svgString) {
    this._hideError();
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, 'image/svg+xml');

      // Check for parse errors
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Invalid XML/SVG code.');
      }

      const svgEl = doc.querySelector('svg');
      if (!svgEl) {
        throw new Error('No <svg> element found in the provided code.');
      }

      this.onImport(svgEl);
    } catch (err) {
      this._showError(err.message);
    }
  }

  /* ─── Loading state ─── */
  _setZoneLoading(loading) {
    const zone = document.getElementById('upload-zone');
    const text = zone.querySelector('p');
    if (loading) {
      zone.style.pointerEvents = 'none';
      zone.style.opacity = '0.6';
      text.textContent = 'Vectorizing…';
    } else {
      zone.style.pointerEvents = '';
      zone.style.opacity = '';
      text.textContent = 'Drag & drop a file here';
    }
  }

  /* ─── Error display ─── */
  _showError(msg) {
    const el = document.getElementById('import-error');
    el.textContent = msg;
    el.hidden = false;
  }

  _hideError() {
    document.getElementById('import-error').hidden = true;
  }
}
