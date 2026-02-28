//! FD Language Server — diagnostics, completions, hover, document symbols.
//!
//! A `tower-lsp` based LSP server that wraps `fd-core` for real-time
//! editor feedback in any LSP-compatible editor (Zed, Neovim, Helix, etc.).

mod completion;
mod diagnostics;
mod hover;
mod symbols;

use std::sync::Mutex;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

/// Cached parse state for a single document.
struct DocumentState {
    text: String,
    graph: Option<fd_core::SceneGraph>,
}

/// The FD language server backend.
struct FdLanguageServer {
    client: Client,
    /// Cached document state by URI.
    documents: Mutex<std::collections::HashMap<Url, DocumentState>>,
}

impl FdLanguageServer {
    fn new(client: Client) -> Self {
        Self {
            client,
            documents: Mutex::new(std::collections::HashMap::new()),
        }
    }

    /// Reparse a document and publish diagnostics.
    async fn on_change(&self, uri: Url, text: String) {
        let diags = diagnostics::compute_diagnostics(&text);
        let graph = fd_core::parser::parse_document(&text).ok();

        {
            let mut docs = self.documents.lock().unwrap();
            docs.insert(uri.clone(), DocumentState { text, graph });
        }

        self.client.publish_diagnostics(uri, diags, None).await;
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for FdLanguageServer {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec![
                        ":".to_string(),
                        "@".to_string(),
                        "#".to_string(),
                    ]),
                    ..Default::default()
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                document_symbol_provider: Some(OneOf::Left(true)),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "fd-lsp initialized")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri;
        let text = params.text_document.text;
        self.on_change(uri, text).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri;
        if let Some(change) = params.content_changes.into_iter().next_back() {
            self.on_change(uri, change.text).await;
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        let uri = params.text_document.uri;
        let mut docs = self.documents.lock().unwrap();
        docs.remove(&uri);
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = &params.text_document_position.text_document.uri;
        let pos = params.text_document_position.position;

        let docs = self.documents.lock().unwrap();
        let items = if let Some(doc) = docs.get(uri) {
            completion::compute_completions(&doc.text, pos)
        } else {
            Vec::new()
        };

        Ok(Some(CompletionResponse::Array(items)))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;

        let docs = self.documents.lock().unwrap();
        if let Some(doc) = docs.get(uri) {
            Ok(hover::compute_hover(&doc.text, pos, doc.graph.as_ref()))
        } else {
            Ok(None)
        }
    }

    async fn document_symbol(
        &self,
        params: DocumentSymbolParams,
    ) -> Result<Option<DocumentSymbolResponse>> {
        let uri = &params.text_document.uri;

        let docs = self.documents.lock().unwrap();
        if let Some(doc) = docs.get(uri) {
            let syms = symbols::compute_symbols(&doc.text, doc.graph.as_ref());
            Ok(Some(DocumentSymbolResponse::Flat(syms)))
        } else {
            Ok(Some(DocumentSymbolResponse::Flat(Vec::new())))
        }
    }
}

#[tokio::main]
async fn main() {
    // ── `fd-lsp --format` mode ──────────────────────────────────────────
    // Reads FD source from stdin, emits formatted output on stdout, then exits.
    // Used by the VS Code extension's DocumentFormattingEditProvider so that
    // `Option+Shift+F` works without a full LSP handshake.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(|s| s.as_str()) == Some("--format") {
        use std::io::Read;
        let mut text = String::new();
        std::io::stdin()
            .read_to_string(&mut text)
            .expect("failed to read stdin");

        let config = fd_core::FormatConfig::default();
        match fd_core::format_document(&text, &config) {
            Ok(formatted) => print!("{formatted}"),
            Err(e) => {
                eprintln!("fd-lsp --format error: {e}");
                std::process::exit(1);
            }
        }
        return;
    }

    // ── `fd-lsp --view <mode>` mode ─────────────────────────────────────
    // Reads FD source from stdin, emits a filtered view on stdout.
    if args.get(1).map(|s| s.as_str()) == Some("--view") {
        use std::io::Read;
        let mode_str = args.get(2).map(|s| s.as_str()).unwrap_or("full");
        let mode = match mode_str {
            "full" => fd_core::ReadMode::Full,
            "structure" => fd_core::ReadMode::Structure,
            "layout" => fd_core::ReadMode::Layout,
            "design" => fd_core::ReadMode::Design,
            "spec" => fd_core::ReadMode::Spec,
            "visual" => fd_core::ReadMode::Visual,
            "when" => fd_core::ReadMode::When,
            "edges" => fd_core::ReadMode::Edges,
            other => {
                eprintln!("fd-lsp --view error: unknown mode '{other}'");
                eprintln!(
                    "valid modes: full, structure, layout, design, spec, visual, when, edges"
                );
                std::process::exit(1);
            }
        };
        let mut text = String::new();
        std::io::stdin()
            .read_to_string(&mut text)
            .expect("failed to read stdin");

        match fd_core::parser::parse_document(&text) {
            Ok(graph) => print!("{}", fd_core::emit_filtered(&graph, mode)),
            Err(e) => {
                eprintln!("fd-lsp --view error: {e}");
                std::process::exit(1);
            }
        }
        return;
    }

    // ── Standard LSP server mode ─────────────────────────────────────────
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::new(FdLanguageServer::new);
    Server::new(stdin, stdout, socket).serve(service).await;
}
