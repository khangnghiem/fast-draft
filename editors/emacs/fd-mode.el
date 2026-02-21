;;; fd-mode.el --- Major mode for FD (Fast Draft) files -*- lexical-binding: t; -*-

;; Author: Khang Nghiêm
;; URL: https://github.com/khangnghiem/fast-draft
;; Version: 0.1.0
;; Package-Requires: ((emacs "29.1"))
;; Keywords: languages, tools

;;; Commentary:
;;
;; Major mode for editing FD (Fast Draft) files with:
;; - Syntax highlighting via font-lock
;; - LSP support via eglot (built-in Emacs 29+)
;; - Tree-sitter support (if compiled with tree-sitter)
;;
;; Installation:
;;   1. Install fd-lsp: cargo install --path crates/fd-lsp
;;   2. Add this file to your load-path
;;   3. (require 'fd-mode)

;;; Code:

(defgroup fd nil
  "Major mode for FD (Fast Draft) files."
  :group 'languages
  :prefix "fd-")

;; Font-lock keywords for syntax highlighting
(defconst fd-font-lock-keywords
  (list
   ;; Comments
   '("#[^#].*$" . font-lock-comment-face)
   ;; Annotations
   '("##.*$" . font-lock-preprocessor-face)
   ;; Node types
   '("\\b\\(group\\|rect\\|ellipse\\|path\\|text\\|style\\|anim\\)\\b" . font-lock-keyword-face)
   ;; Node IDs
   '("@[a-zA-Z_][a-zA-Z0-9_]*" . font-lock-variable-name-face)
   ;; Properties
   '("\\b\\(w\\|h\\|fill\\|stroke\\|corner\\|opacity\\|font\\|bg\\|use\\|layout\\|shadow\\|scale\\|rotate\\|translate\\|center_in\\|offset\\|ease\\|duration\\):" . font-lock-type-face)
   ;; Hex colors
   '("#[0-9A-Fa-f]\\{3,8\\}" . font-lock-constant-face)
   ;; Numbers
   '("\\b-?[0-9]+\\(\\.[0-9]+\\)?\\(ms\\)?\\b" . font-lock-constant-face)
   ;; Strings
   '("\"[^\"]*\"" . font-lock-string-face)
   ;; Layout modes
   '("\\b\\(column\\|row\\|grid\\|free\\|spring\\|linear\\|ease_in\\|ease_out\\|ease_in_out\\)\\b" . font-lock-builtin-face)
   ;; Constraint arrow
   '("->" . font-lock-operator-face))
  "Font-lock keywords for FD mode.")

;;;###autoload
(define-derived-mode fd-mode prog-mode "FD"
  "Major mode for editing FD (Fast Draft) files."
  (setq-local comment-start "# ")
  (setq-local comment-end "")
  (setq-local indent-tabs-mode nil)
  (setq-local tab-width 2)
  (setq-local font-lock-defaults '(fd-font-lock-keywords))
  ;; Simple indentation
  (setq-local indent-line-function #'fd-indent-line))

(defun fd-indent-line ()
  "Indent current line for FD mode."
  (let ((indent (fd--calculate-indent)))
    (when indent
      (indent-line-to indent))))

(defun fd--calculate-indent ()
  "Calculate indentation for the current line."
  (save-excursion
    (beginning-of-line)
    (cond
     ;; Closing brace: match opening brace's indentation
     ((looking-at "^\\s-*}")
      (fd--matching-brace-indent))
     ;; After opening brace: indent one level
     ((save-excursion
        (forward-line -1)
        (end-of-line)
        (skip-chars-backward " \t")
        (eq (char-before) ?\{))
      (save-excursion
        (forward-line -1)
        (+ (current-indentation) tab-width)))
     ;; Otherwise, same as previous non-blank line
     (t
      (save-excursion
        (forward-line -1)
        (while (and (not (bobp)) (looking-at "^\\s-*$"))
          (forward-line -1))
        (current-indentation))))))

(defun fd--matching-brace-indent ()
  "Find the indentation of the matching opening brace."
  (save-excursion
    (let ((depth 1))
      (while (and (> depth 0) (not (bobp)))
        (forward-line -1)
        (cond
         ((looking-at "^\\s-*}")
          (setq depth (1+ depth)))
         ((save-excursion
            (end-of-line)
            (skip-chars-backward " \t")
            (eq (char-before) ?\{))
          (setq depth (1- depth)))))
      (current-indentation))))

;; Eglot LSP integration (Emacs 29+)
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs '(fd-mode . ("fd-lsp"))))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.fd\\'" . fd-mode))

(provide 'fd-mode)
;;; fd-mode.el ends here
