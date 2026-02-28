// ─── FD Playground — WASM-powered live editor ───

const EXAMPLES = {
  card: `# A card with a button that reacts on hover

theme accent {
  fill: #6C5CE7
}

group @card {
  layout: column gap=16 pad=24
  bg: #FFF corner=12 shadow=(0,4,20,#0002)

  text @title "Hello World" {
    font: "Inter" bold 24
    fill: #1A1A2E
  }

  rect @button {
    w: 200 h: 48
    corner: 10
    use: accent

    when :hover {
      fill: #5A4BD1
      scale: 1.02
      ease: spring 300ms
    }
  }
}

@card -> center_in: canvas`,

  login: `# Login form with spec annotations

theme accent {
  fill: #6C5CE7
  corner: 10
}

theme base_text {
  fill: #333333
  font: "Inter" regular 14
}

group @login_form {
  spec {
    "User authentication entry point"
    accept: "email + password fields visible"
    status: todo
  }
  text @title "Welcome Back" {
    fill: #1A1A2E
    font: "Inter" bold 24
  }
  rect @email_field {
    text @email_hint "Email" {
      use: base_text
      fill: #999999
    }
    w: 280 h: 44
    stroke: #DDDDDD 1
    corner: 8
  }
  rect @pass_field {
    text @pass_hint "Password" {
      use: base_text
      fill: #999999
    }
    w: 280 h: 44
    stroke: #DDDDDD 1
    corner: 8
  }
  rect @login_btn {
    spec {
      "Primary CTA"
      accept: "disabled when fields empty"
      status: done
      priority: high
    }
    text @btn_label "Sign In" {
      fill: #FFFFFF
      font: "Inter" semibold 16
    }
    w: 280 h: 48
    use: accent
    fill: #5A4BD1
    when :hover {
      fill: #4A3BC1
      scale: 1.02
      ease: spring 200ms
    }
  }
  layout: column gap=16 pad=32
}

@login_form -> center_in: canvas`,

  welcome: `# Welcome to Fast Draft!

theme accent { fill: #6C5CE7 }
theme soft { fill: #DFE6E9; corner: 12 }
theme label_style { font: "Inter" 500 14; fill: #2D3436 }

text @welcome_title "Welcome to Fast Draft" {
  x: 180  y: 40
  font: "Inter" 700 28
  fill: #2D3436
}

text @welcome_sub "Edit this code to see changes live!" {
  x: 180  y: 80
  font: "Inter" 400 14
  fill: #636E72
}

rect @step1_bg {
  x: 60  y: 140
  w: 200  h: 140
  use: soft
}

text @step1_title "1. Draw Shapes" {
  x: 80  y: 160
  use: label_style
}

rect @step1_demo {
  x: 220  y: 200
  w: 30  h: 30
  use: accent
  corner: 6
  when :hover { scale: 1.1; ease: spring 200ms }
}

rect @step2_bg {
  x: 300  y: 140
  w: 200  h: 140
  use: soft
}

text @step2_title "2. Add Text" {
  x: 320  y: 160
  use: label_style
}

rect @step3_bg {
  x: 540  y: 140
  w: 200  h: 140
  use: soft
}

text @step3_title "3. Style It" {
  x: 560  y: 160
  use: label_style
}

ellipse @step3_demo {
  x: 700  y: 200
  w: 20  h: 20
  fill: #E17055
  when :hover { fill: #00B894; ease: ease_out 300ms }
}`
};

let fdCanvas = null;
let isDark = true;
let isSketchy = false;
let animFrameId = null;

async function initPlayground() {
  const editor = document.getElementById('fd-editor');
  const canvas = document.getElementById('fd-canvas');
  const loading = document.getElementById('canvas-loading');
  const wrapper = document.getElementById('canvas-wrapper');

  // Load initial example
  editor.value = EXAMPLES.card;

  try {
    // Load WASM module
    const wasm = await import('./wasm/fd_wasm.js');
    await wasm.default('./wasm/fd_wasm_bg.wasm');

    // Size the canvas
    const resizeCanvas = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      if (fdCanvas) {
        fdCanvas.resize(rect.width, rect.height);
      }
    };

    resizeCanvas();

    // Create the FdCanvas instance
    const rect = wrapper.getBoundingClientRect();
    fdCanvas = new wasm.FdCanvas(rect.width, rect.height);
    fdCanvas.set_theme(isDark);
    fdCanvas.set_text(editor.value);

    // Get canvas 2D context
    const ctx = canvas.getContext('2d');

    // Render loop
    const renderLoop = (time) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fdCanvas.render(ctx, time);
      animFrameId = requestAnimationFrame(renderLoop);
    };

    animFrameId = requestAnimationFrame(renderLoop);

    // Hide loading overlay
    loading.classList.add('hidden');

    // Wire editor input
    let debounceTimer = null;
    editor.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (fdCanvas) {
          fdCanvas.set_text(editor.value);
        }
      }, 50);
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(wrapper);

    // Example selector
    document.getElementById('example-select').addEventListener('change', (e) => {
      const example = EXAMPLES[e.target.value];
      if (example) {
        editor.value = example;
        if (fdCanvas) {
          fdCanvas.set_text(example);
        }
      }
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', function() {
      isDark = !isDark;
      if (fdCanvas) {
        fdCanvas.set_theme(isDark);
      }
      this.textContent = isDark ? '🌙 Dark' : '☀️ Light';
      this.classList.toggle('active', !isDark);
    });

    // Sketchy toggle
    document.getElementById('sketchy-toggle').addEventListener('click', function() {
      isSketchy = !isSketchy;
      if (fdCanvas) {
        fdCanvas.set_sketchy_mode(isSketchy);
      }
      this.classList.toggle('active', isSketchy);
    });

  } catch (err) {
    console.error('Failed to load WASM:', err);
    loading.innerHTML = `
      <p style="color: var(--text-secondary); text-align: center; max-width: 320px;">
        <strong>Playground requires WebAssembly</strong><br><br>
        Install the
        <a href="https://marketplace.visualstudio.com/items?itemName=khangnghiem.fast-draft" target="_blank">VS Code extension</a>
        for the full canvas experience, or
        <a href="https://github.com/khangnghiem/fast-draft" target="_blank">build from source</a>.
      </p>
    `;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlayground);
} else {
  initPlayground();
}
