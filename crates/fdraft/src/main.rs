use clap::{Parser, Subcommand, ValueEnum};
use std::fs;
use std::io::{self, Read};
use std::process;

use fd_core::{
    FormatConfig, ReadMode, emit_filtered, format_document, parser::parse_document,
    score::compute_score,
};

#[derive(Parser)]
#[command(name = "fdraft")]
#[command(about = "Fast-Draft Command Line Interface", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Format an FD document
    Fmt {
        /// File to format (use "-" or omit for stdin)
        #[arg(default_value = "-")]
        file: String,

        /// Overwrite the file in place instead of printing to stdout
        #[arg(short, long, default_value_t = false)]
        write: bool,
    },
    /// View filtered parts of an FD document for AI brevity
    View {
        /// View mode (full, structure, layout, design, spec, visual, when, edges)
        mode: CliReadMode,

        /// File to view (use "-" or omit for stdin)
        #[arg(default_value = "-")]
        file: String,
    },
    /// Parse and type-check an FD document for errors
    Check {
        /// File to check (use "-" or omit for stdin)
        #[arg(default_value = "-")]
        file: String,
    },
    /// Compute the AI comprehensibility score of an FD document
    Score {
        /// File to score (use "-" or omit for stdin)
        #[arg(default_value = "-")]
        file: String,
    },
    /// Export an FD document to a target format
    Export {
        /// Target format (html, excalidraw)
        target: ExportTarget,

        /// File to export (use "-" or omit for stdin)
        #[arg(default_value = "-")]
        file: String,
    },
}

#[derive(ValueEnum, Clone)]
enum CliReadMode {
    Full,
    Structure,
    Layout,
    Design,
    Spec,
    Notes,
    Visual,
    When,
    Edges,
}

impl From<CliReadMode> for ReadMode {
    fn from(val: CliReadMode) -> Self {
        match val {
            CliReadMode::Full => ReadMode::Full,
            CliReadMode::Structure => ReadMode::Structure,
            CliReadMode::Layout => ReadMode::Layout,
            CliReadMode::Design => ReadMode::Design,
            CliReadMode::Spec | CliReadMode::Notes => ReadMode::Spec,
            CliReadMode::Visual => ReadMode::Visual,
            CliReadMode::When => ReadMode::When,
            CliReadMode::Edges => ReadMode::Edges,
        }
    }
}

#[derive(ValueEnum, Clone)]
enum ExportTarget {
    Html,
    Excalidraw,
}

fn read_input(file: &str) -> String {
    let mut text = String::new();
    if file == "-" {
        io::stdin().read_to_string(&mut text).unwrap_or_else(|e| {
            eprintln!("Error reading from stdin: {}", e);
            process::exit(1);
        });
    } else {
        text = fs::read_to_string(file).unwrap_or_else(|e| {
            eprintln!("Error reading file '{}': {}", file, e);
            process::exit(1);
        });
    }
    text
}

fn handle_fmt(file: String, write: bool) {
    let text = read_input(&file);
    let config = FormatConfig::default();
    match format_document(&text, &config) {
        Ok(formatted) => {
            if write && file != "-" {
                fs::write(&file, formatted).unwrap_or_else(|e| {
                    eprintln!("Error writing to file '{}': {}", file, e);
                    process::exit(1);
                });
            } else {
                print!("{}", formatted);
            }
        }
        Err(e) => {
            eprintln!("Formatting error: {}", e);
            process::exit(1);
        }
    }
}

fn handle_view(mode: CliReadMode, file: String) {
    let text = read_input(&file);
    match parse_document(&text) {
        Ok(graph) => {
            let rmode: ReadMode = mode.into();
            print!("{}", emit_filtered(&graph, rmode));
        }
        Err(e) => {
            eprintln!("Parse error: {}", e);
            process::exit(1);
        }
    }
}

fn handle_check(file: String) {
    let text = read_input(&file);
    match parse_document(&text) {
        Ok(_) => {
            println!("✅ OK: No syntax errors.");
        }
        Err(e) => {
            eprintln!("❌ Check failed: {}", e);
            process::exit(1);
        }
    }
}

fn handle_score(file: String) {
    let text = read_input(&file);
    match parse_document(&text) {
        Ok(graph) => {
            let report = compute_score(&graph);
            println!("Comprehensibility Score: {}/100", report.total);
            println!("------------------------------------------------");
            for metric in report.metrics {
                println!("- {}: {}/20", metric.label, metric.score);
                if !metric.suggestion.is_empty() {
                    println!("    Suggestion: {}", metric.suggestion);
                }
            }
            if report.total < 80 {
                process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("Parse error: {}", e);
            process::exit(1);
        }
    }
}

fn handle_export(target: ExportTarget, file: String) {
    let text = read_input(&file);
    match parse_document(&text) {
        Ok(graph) => {
            let viewport = fd_core::layout::Viewport {
                width: 1920.0,
                height: 1080.0,
            };
            let bounds = fd_core::layout::resolve_layout(&graph, viewport);
            match target {
                ExportTarget::Html => {
                    let out = fd_core::html_export::export_html(&graph, &bounds, &[]);
                    print!("{}", out);
                }
                ExportTarget::Excalidraw => {
                    let out = fd_core::excalidraw::export_excalidraw(&graph, &bounds, &[]);
                    println!("{}", out);
                }
            }
        }
        Err(e) => {
            eprintln!("Parse error: {}", e);
            process::exit(1);
        }
    }
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Fmt { file, write } => handle_fmt(file, write),
        Commands::View { mode, file } => handle_view(mode, file),
        Commands::Check { file } => handle_check(file),
        Commands::Score { file } => handle_score(file),
        Commands::Export { target, file } => handle_export(target, file),
    }
}
