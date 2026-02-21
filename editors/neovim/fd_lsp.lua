-- FD (Fast Draft) — Neovim LSP + Tree-sitter configuration
--
-- Installation:
--   1. Copy this file to ~/.config/nvim/after/lsp/fd_lsp.lua
--   2. Install fd-lsp: cargo install --path crates/fd-lsp
--   3. Install tree-sitter parser: :TSInstall fd (or manually)
--   4. Restart Neovim and open a .fd file

return {
  cmd = { "fd-lsp" },
  filetypes = { "fd" },
  root_markers = { ".git", "Cargo.toml" },
  settings = {},
}
