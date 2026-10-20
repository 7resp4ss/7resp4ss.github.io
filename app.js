(() => {
  const root = document.documentElement;
  const canvas = document.querySelector('.ambient-grid');
  const swirlCanvas = document.querySelector('.swirl-background');
  const ctx = canvas?.getContext('2d');
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

    const light = root.dataset.theme === 'light';
    const unit = 32;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const sky = light ? ['#d2dfd2', '#bdcfcb', '#a9c0c0'] : ['#151a36', '#20294a', '#2d3b59'];
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
    const distant = light ? 'rgba(72, 106, 101, .28)' : 'rgba(83, 103, 143, .55)';
    const near = light ? 'rgba(53, 80, 76, .36)' : 'rgba(19, 26, 55, .82)';
    const accent = light ? 'rgba(104, 137, 69, .38)' : 'rgba(111, 141, 83, .5)';
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
      uniform float lightMode;
      void main() {
        vec2 screen = gl_FragCoord.xy;
        float pixelSize = max(5.0, length(resolution) / 210.0);
        vec2 uv = (floor(screen / pixelSize) * pixelSize - 0.5 * resolution) / resolution.y;
        float speed = time * 0.11;
        float radius = length(uv);
        float angle = atan(uv.y, uv.x) + speed * (0.9 + radius * 0.32);
        uv = vec2(cos(angle), sin(angle)) * radius;
        vec2 warped = uv;
        float pulse = 0.0;
        for (int i = 0; i < 5; i++) {
          warped += 0.36 * vec2(cos(warped.y * 3.7 + speed), sin(warped.x * 3.1 - speed));
          warped += 0.14 * vec2(sin(warped.y * 7.0 + speed * 0.7), cos(warped.x * 6.0 - speed * 0.5));
          pulse += sin(warped.x * 4.0 + warped.y * 3.0 + speed) * 0.09;
        }
        float bands = 0.5 + 0.5 * sin(warped.x * 2.4 - warped.y * 3.4 + radius * 7.0 + pulse);
        float veins = 0.5 + 0.5 * cos(warped.x * 6.0 + warped.y * 2.2 - speed * 1.4);
        vec3 darkPurple = vec3(0.055, 0.008, 0.11);
        vec3 darkRed = vec3(0.25, 0.008, 0.035);
        vec3 crimson = vec3(0.62, 0.015, 0.12);
        vec3 neonMagenta = vec3(0.95, 0.025, 0.52);
        vec3 lightPurple = vec3(0.22, 0.10, 0.30);
        vec3 lightRed = vec3(0.46, 0.08, 0.12);
        vec3 lightCrimson = vec3(0.72, 0.16, 0.26);
        vec3 lightNeon = vec3(0.92, 0.20, 0.58);
        vec3 c1 = mix(darkPurple, lightPurple, lightMode);
        vec3 c2 = mix(darkRed, lightRed, lightMode);
        vec3 c3 = mix(crimson, lightCrimson, lightMode);
        vec3 c4 = mix(neonMagenta, lightNeon, lightMode);
        vec3 color = mix(c1, c2, smoothstep(0.04, 0.48, bands));
        color = mix(color, c3, smoothstep(0.42, 0.78, bands));
        color = mix(color, c4, smoothstep(0.76, 0.99, bands) * (0.45 + veins * 0.4));
        color += c4 * pow(max(veins - 0.72, 0.0), 3.0) * 1.8;
        gl_FragColor = vec4(color, 0.96);
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
    const lightMode = gl.getUniformLocation(program, 'lightMode');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    swirlState = { gl, program, buffer, position, resolution, time, lightMode, reduced, started: performance.now(), lastFrame: 0 };
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
    const { gl, program, buffer, position, resolution, time, lightMode, started, reduced } = swirlState;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolution, swirlCanvas.width, swirlCanvas.height);
    gl.uniform1f(time, reduced ? 0 : (now - started) / 1000);
    gl.uniform1f(lightMode, root.dataset.theme === 'light' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!reduced) requestAnimationFrame(renderSwirl);
  }

  const savedTheme = localStorage.getItem('7r-theme');
  if (savedTheme === 'light') root.dataset.theme = 'light';

  function renderIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.7 } });
  }

  function setThemeIcon() {
    const button = document.querySelector('.theme-toggle');
    if (!button) return;
    const icon = root.dataset.theme === 'light' ? 'moon' : 'sun';
    button.innerHTML = `<i data-lucide="${icon}"></i>`;
    renderIcons();
  }

  window.addEventListener('DOMContentLoaded', () => {
    renderIcons();
    setThemeIcon();
    drawGrid();
    initSwirl();
  });
  window.addEventListener('resize', () => {
    drawGrid();
    resizeSwirl();
  }, { passive: true });

  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('7r-theme', root.dataset.theme || 'dark');
    setThemeIcon();
    drawGrid();
    if (swirlState?.reduced) renderSwirl(performance.now());
  });

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
