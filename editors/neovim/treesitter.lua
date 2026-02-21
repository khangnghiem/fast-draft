-- FD (Fast Draft) — Neovim Tree-sitter parser registration
--
-- Installation: add to your init.lua or ~/.config/nvim/after/plugin/treesitter.lua
--
-- This registers tree-sitter-fd as a custom parser.
-- Requires nvim-treesitter installed.

local parser_config = require("nvim-treesitter.parsers").get_parser_configs()

parser_config.fd = {
  install_info = {
    url = "https://github.com/khangnghiem/fast-draft",
    files = { "tree-sitter-fd/src/parser.c" },
    branch = "main",
    generate_requires_npm = false,
    requires_generate_from_grammar = false,
  },
  filetype = "fd",
}
