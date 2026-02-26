# Editor Setup Guide

FD has first-class support across all major editors. Choose your editor below.

## Prerequisites

Install the FD language server:

```bash
cargo install --path crates/fd-lsp
```

---

## VS Code / Antigravity

Already included — install the **FD** extension from the marketplace.
The extension provides a custom editor with live canvas + text sync.

---

## Zed

1. **Clone or symlink** the `editors/zed/` directory into your Zed extensions:
   ```bash
   ln -s /path/to/fast-draft/editors/zed ~/.config/zed/extensions/fd
   ```
2. Reload Zed — FD files get syntax highlighting, outline, and LSP support.

**What you get:** Tree-sitter highlights, breadcrumb outline, auto-indent, LSP diagnostics/completions/hover.

---

## Neovim

### 1. Filetype detection

```bash
cp editors/neovim/ftdetect.lua ~/.config/nvim/after/ftdetect/fd.lua
```

### 2. LSP setup (Neovim 0.11+)

```bash
cp editors/neovim/fd_lsp.lua ~/.config/nvim/after/lsp/fd_lsp.lua
```

Then enable in `init.lua`:

```lua
vim.lsp.enable('fd_lsp')
```

### 3. Tree-sitter (optional, for highlighting)

Add to your init.lua:

```lua
-- Register the FD parser
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()
parser_config.fd = {
  install_info = {
    url = "https://github.com/khangnghiem/fast-draft",
    files = { "tree-sitter-fd/src/parser.c" },
    branch = "main",
  },
  filetype = "fd",
}
```

Then: `:TSInstall fd`

Copy highlight queries:

```bash
mkdir -p ~/.config/nvim/after/queries/fd
cp tree-sitter-fd/queries/highlights.scm ~/.config/nvim/after/queries/fd/
```

---

## Helix

1. Copy the language config:

   ```bash
   cat editors/helix/languages.toml >> ~/.config/helix/languages.toml
   ```

2. Build and install the grammar:

   ```bash
   hx --grammar fetch
   hx --grammar build
   ```

3. Copy highlight queries:

   ```bash
   mkdir -p ~/.config/helix/runtime/queries/fd
   cp tree-sitter-fd/queries/highlights.scm ~/.config/helix/runtime/queries/fd/
   ```

4. Restart Helix. Open any `.fd` file.

---

## Emacs

1. Add `editors/emacs/` to your load-path:

   ```elisp
   (add-to-list 'load-path "/path/to/fast-draft/editors/emacs")
   (require 'fd-mode)
   ```

2. LSP starts automatically via **eglot** (built-in Emacs 29+) when opening `.fd` files.

3. For tree-sitter support (Emacs 29+ compiled with tree-sitter):
   ```elisp
   (add-to-list 'treesit-language-source-alist
     '(fd . ("https://github.com/khangnghiem/fast-draft" nil "tree-sitter-fd/src")))
   (treesit-install-language-grammar 'fd)
   ```

---

## Sublime Text

1. Copy syntax and LSP config:

   ```bash
   cp editors/sublime/FD.sublime-syntax ~/Library/Application\ Support/Sublime\ Text/Packages/User/
   ```

2. Install the **LSP** package via Package Control, then add to LSP settings:
   ```json
   {
     "clients": {
       "fd-lsp": {
         "command": ["fd-lsp"],
         "selector": "source.fd"
       }
     }
   }
   ```

---

## Feature Matrix

| Feature             | VS Code          | Zed            | Neovim         | Helix          | Emacs        | Sublime           |
| ------------------- | ---------------- | -------------- | -------------- | -------------- | ------------ | ----------------- |
| Syntax highlighting | ✅ TextMate      | ✅ Tree-sitter | ✅ Tree-sitter | ✅ Tree-sitter | ✅ font-lock | ✅ Sublime syntax |
| Diagnostics         | ✅               | ✅ LSP         | ✅ LSP         | ✅ LSP         | ✅ LSP       | ✅ LSP            |
| Completions         | ✅               | ✅ LSP         | ✅ LSP         | ✅ LSP         | ✅ LSP       | ✅ LSP            |
| Hover info          | ✅               | ✅ LSP         | ✅ LSP         | ✅ LSP         | ✅ LSP       | ✅ LSP            |
| Document outline    | ✅               | ✅ Tree-sitter | ✅ LSP         | ✅ LSP         | ✅ LSP       | ✅ LSP            |
| Live canvas         | ✅ Custom editor | ⏳ Planned     | ⏳ Planned     | —              | —            | —                 |
| Auto-indent         | ✅               | ✅             | ✅             | ✅             | ✅           | ✅                |
| Code folding        | ✅               | ✅             | ✅             | ✅             | ✅           | ✅                |
