-- FD (Fast Draft) — Neovim filetype detection
--
-- Installation: copy to ~/.config/nvim/after/ftdetect/fd.lua
-- This registers .fd files as the "fd" filetype

vim.filetype.add({
  extension = {
    fd = "fd",
  },
})
