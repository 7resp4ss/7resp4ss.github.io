(() => {
  const canvas = document.querySelector('.ambient-grid');
  const swirlCanvas = document.querySelector('.swirl-background');
  const ctx = canvas?.getContext('2d');
  const timestampSeed = Date.now();
  const seededValue = (salt) => {
    const value = Math.sin(timestampSeed * 0.001 + salt * 91.345) * 47453.5453;
    return value - Math.floor(value);
  };
  const shaderSeed = new Float32Array([seededValue(1), seededValue(2), seededValue(3), seededValue(4)]);
  let swirlState = null;

  function drawGrid() {
    if (!canvas || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const unit = 32;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const sky = ['#160b24', '#24102f', '#300d29'];
    ctx.fillStyle = sky[0];
    ctx.fillRect(0, 0, width, height);

    // A deliberately low-resolution scene gives the page its frosted game-world backdrop.
    for (let row = 0; row < Math.ceil(height / unit); row += 1) {
      ctx.fillStyle = sky[Math.min(2, Math.floor(row / 5))];
      ctx.fillRect(0, row * unit, width, unit);
    }

    const block = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * unit, y * unit, w * unit, h * unit);
    };
    const distant = 'rgba(102, 38, 119, .34)';
    const near = 'rgba(45, 8, 35, .66)';
    const accent = 'rgba(190, 24, 103, .30)';
    for (let column = -1; column < Math.ceil(width / unit) + 1; column += 1) {
      const distantHeight = 2 + (((column * 7 + 3) % 4 + 4) % 4);
      block(column, 13 - distantHeight, 1 + (((column + 2) % 3 + 3) % 3), distantHeight, distant);
      if (column % 3 === 0) block(column, 14 - distantHeight, 1, 1, accent);
      const nearHeight = 2 + (((column * 11 + 5) % 5 + 5) % 5);
      block(column, 18 - nearHeight, 1 + (((column % 2) + 2) % 2), nearHeight, near);
    }
    block(0, 18, Math.ceil(width / unit), 10, near);
  }

  // Inspired by the pixelated polar-warp approach described in:
  // https://medium.com/@aliunasiru08115/implementing-balatros-hypnotic-swirl-shader-in-godot-e33c8c136ea7
  function initSwirl() {
    if (!swirlCanvas) return;
    const gl = swirlCanvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) return;

    const vertexSource = `
      attribute vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `;
    const fragmentSource = `
      precision mediump float;
      uniform vec2 resolution;
      uniform float time;
      uniform vec4 seed;
      void main() {
        vec2 screen = gl_FragCoord.xy;
        float pixelSize = max(5.0, length(resolution) / 210.0);
        vec2 uv = (floor(screen / pixelSize) * pixelSize - 0.5 * resolution) / resolution.y;
        uv -= (seed.xy - 0.5) * vec2(0.90, 0.62);
        float direction = seed.z < 0.5 ? -1.0 : 1.0;
        float phase = seed.w * 6.2831853;
        float speed = (time * (0.075 + seed.x * 0.055) + phase) * direction;
        float radius = length(uv);
        float angle = atan(uv.y, uv.x) + speed * (0.85 + radius * (0.22 + seed.y * 0.24));
        angle += sin(radius * (5.0 + seed.z * 3.0) + phase) * 0.18;
        uv = vec2(cos(angle), sin(angle)) * radius;
        vec2 warped = uv;
        float pulse = 0.0;
        float shape = 0.85 + seed.y * 0.45;
        for (int i = 0; i < 5; i++) {
          warped += 0.36 * vec2(cos(warped.y * 3.7 * shape + speed + phase), sin(warped.x * 3.1 - speed));
          warped += 0.14 * vec2(sin(warped.y * 7.0 + speed * 0.7), cos(warped.x * 6.0 * shape - speed * 0.5 + phase));
          pulse += sin(warped.x * 4.0 + warped.y * 3.0 + speed + phase) * 0.09;
        }
        float bands = 0.5 + 0.5 * sin(warped.x * 2.4 - warped.y * 3.4 + radius * 7.0 + pulse);
        float veins = 0.5 + 0.5 * cos(warped.x * 6.0 + warped.y * 2.2 - speed * 1.4 + phase);
        float palette = fract(bands * 0.40 + veins * 0.24 + radius * 0.13 + seed.x);

        float dPurple = min(abs(palette - 0.02), 1.0 - abs(palette - 0.02));
        float dViolet = min(abs(palette - 0.21), 1.0 - abs(palette - 0.21));
        float dRed = min(abs(palette - 0.42), 1.0 - abs(palette - 0.42));
        float dCrimson = min(abs(palette - 0.63), 1.0 - abs(palette - 0.63));
        float dMagenta = min(abs(palette - 0.83), 1.0 - abs(palette - 0.83));
        float wPurple = 1.0 - smoothstep(0.08, 0.23, dPurple);
        float wViolet = 1.0 - smoothstep(0.08, 0.23, dViolet);
        float wRed = 1.0 - smoothstep(0.08, 0.23, dRed);
        float wCrimson = 1.0 - smoothstep(0.08, 0.23, dCrimson);
        float wMagenta = 1.0 - smoothstep(0.08, 0.23, dMagenta);
        float total = wPurple + wViolet + wRed + wCrimson + wMagenta;

        vec3 deepPurple = vec3(0.045, 0.004, 0.12);
        vec3 electricViolet = vec3(0.34, 0.025, 0.72);
        vec3 darkRed = vec3(0.24, 0.003, 0.025);
        vec3 crimson = vec3(0.76, 0.012, 0.085);
        vec3 neonMagenta = vec3(1.0, 0.02, 0.62);
        vec3 color = (deepPurple * wPurple + electricViolet * wViolet + darkRed * wRed + crimson * wCrimson + neonMagenta * wMagenta) / max(total, 0.001);
        color += neonMagenta * pow(max(veins - 0.77, 0.0), 2.0) * 0.65;
        gl_FragColor = vec4(color, 0.97);
      }
    `;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    const resolution = gl.getUniformLocation(program, 'resolution');
    const time = gl.getUniformLocation(program, 'time');
    const seed = gl.getUniformLocation(program, 'seed');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    swirlState = { gl, program, buffer, position, resolution, time, seed, reduced, started: performance.now(), lastFrame: 0 };
    resizeSwirl();
    if (!reduced) requestAnimationFrame(renderSwirl);
    else renderSwirl(performance.now());
  }

  function resizeSwirl() {
    if (!swirlState || !swirlCanvas) return;
    const ratio = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 1) * 0.65);
    swirlCanvas.width = Math.max(1, Math.floor(window.innerWidth * ratio));
    swirlCanvas.height = Math.max(1, Math.floor(window.innerHeight * ratio));
    swirlState.gl.viewport(0, 0, swirlCanvas.width, swirlCanvas.height);
  }

  function renderSwirl(now) {
    if (!swirlState || !swirlCanvas) return;
    if (!swirlState.reduced && now - swirlState.lastFrame < 33) {
      requestAnimationFrame(renderSwirl);
      return;
    }
    swirlState.lastFrame = now;
    const { gl, program, buffer, position, resolution, time, seed, started, reduced } = swirlState;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolution, swirlCanvas.width, swirlCanvas.height);
    gl.uniform1f(time, reduced ? 0 : (now - started) / 1000);
    gl.uniform4fv(seed, shaderSeed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!reduced) requestAnimationFrame(renderSwirl);
  }

  function renderIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.7 } });
  }

  window.addEventListener('DOMContentLoaded', () => {
    renderIcons();
    drawGrid();
    initSwirl();
  });
  window.addEventListener('resize', () => {
    drawGrid();
    resizeSwirl();
  }, { passive: true });

  const menuButton = document.querySelector('.menu-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    mobileMenu.hidden = open;
    menuButton.innerHTML = `<i data-lucide="${open ? 'menu' : 'x'}"></i>`;
    renderIcons();
  });
  mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    mobileMenu.hidden = true;
    menuButton?.setAttribute('aria-expanded', 'false');
  }));

  const dialog = document.querySelector('.search-dialog');
  const searchInput = dialog?.querySelector('input');
  const result = dialog?.querySelector('[data-search-result]');
  const emptyResult = dialog?.querySelector('.empty-result');
  const openSearch = () => {
    if (!dialog) return;
    dialog.showModal();
    requestAnimationFrame(() => searchInput?.focus());
  };
  document.querySelector('.search-trigger')?.addEventListener('click', openSearch);
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const match = !query || result?.dataset.searchResult.includes(query);
    if (result) result.hidden = !match;
    if (emptyResult) emptyResult.hidden = Boolean(match);
  });

  document.querySelector('.copy-code')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const code = button.closest('pre')?.querySelector('code')?.textContent || '';
    await navigator.clipboard.writeText(code);
    button.textContent = 'COPIED';
    setTimeout(() => {
      button.innerHTML = '<i data-lucide="copy"></i> COPY';
      renderIcons();
    }, 1300);
  });

  const homeArchive = document.querySelector('.home-archive');
  if (homeArchive) {
    const entries = [...homeArchive.querySelectorAll('.archive-row')];
    entries.slice(3).forEach((entry) => { entry.hidden = true; });
  }

  const tocLinks = [...document.querySelectorAll('.article-toc a')];
  const progress = document.querySelector('.toc-progress i');
  if (tocLinks.length) {
    const tocSections = tocLinks.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const updateReadingState = () => {
      const offset = window.scrollY + window.innerHeight * 0.28;
      let active = 0;
      tocSections.forEach((section, index) => {
        if (section.offsetTop <= offset) active = index;
      });
      tocLinks.forEach((link, index) => link.classList.toggle('active', index === active));
      const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
      const amount = pageHeight > 0 ? Math.min(100, Math.max(0, window.scrollY / pageHeight * 100)) : 0;
      if (progress) progress.style.width = `${amount}%`;
    };
    document.addEventListener('scroll', updateReadingState, { passive: true });
    updateReadingState();
  }
})();
