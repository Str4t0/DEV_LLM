//! Ultra-fast PL/I Syntax Highlighter for WebAssembly
//! 
//! Uses Logos for compile-time optimized lexing.
//! Target: ~0.05ms per 1000 lines of code.

use logos::Logos;
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

/// Token types for syntax highlighting
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenType {
    Keyword,
    String,
    Comment,
    Number,
    Operator,
    Preprocessor,
    Builtin,
    Identifier,
    Punctuation,
    Whitespace,
    Newline,
    Unknown,
}

/// A single token with position info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub text: String,
    #[serde(rename = "type")]
    pub token_type: TokenType,
    pub start: usize,
    pub end: usize,
}

/// Logos-based PL/I lexer - compile-time optimized state machine
/// NOTE: No skip directive - we capture everything for syntax highlighting
#[derive(Logos, Debug, PartialEq, Clone)]
enum PLIToken {
    // ============ KEYWORDS ============
    // Control structures
    #[token("PROC", ignore(ascii_case))]
    #[token("PROCEDURE", ignore(ascii_case))]
    #[token("END", ignore(ascii_case))]
    #[token("RETURN", ignore(ascii_case))]
    #[token("CALL", ignore(ascii_case))]
    #[token("GOTO", ignore(ascii_case))]
    #[token("IF", ignore(ascii_case))]
    #[token("THEN", ignore(ascii_case))]
    #[token("ELSE", ignore(ascii_case))]
    #[token("DO", ignore(ascii_case))]
    #[token("WHILE", ignore(ascii_case))]
    #[token("UNTIL", ignore(ascii_case))]
    #[token("ITERATE", ignore(ascii_case))]
    #[token("LEAVE", ignore(ascii_case))]
    #[token("SELECT", ignore(ascii_case))]
    #[token("WHEN", ignore(ascii_case))]
    #[token("OTHERWISE", ignore(ascii_case))]
    #[token("BEGIN", ignore(ascii_case))]
    
    // Declarations
    #[token("DCL", ignore(ascii_case))]
    #[token("DECLARE", ignore(ascii_case))]
    #[token("INIT", ignore(ascii_case))]
    #[token("INITIAL", ignore(ascii_case))]
    #[token("STATIC", ignore(ascii_case))]
    #[token("AUTOMATIC", ignore(ascii_case))]
    #[token("CONTROLLED", ignore(ascii_case))]
    #[token("BASED", ignore(ascii_case))]
    #[token("DEFINED", ignore(ascii_case))]
    #[token("REFER", ignore(ascii_case))]
    #[token("LIKE", ignore(ascii_case))]
    #[token("ENTRY", ignore(ascii_case))]
    #[token("RETURNS", ignore(ascii_case))]
    
    // Data types
    #[token("FIXED", ignore(ascii_case))]
    #[token("BINARY", ignore(ascii_case))]
    #[token("DECIMAL", ignore(ascii_case))]
    #[token("FLOAT", ignore(ascii_case))]
    #[token("REAL", ignore(ascii_case))]
    #[token("COMPLEX", ignore(ascii_case))]
    #[token("CHARACTER", ignore(ascii_case))]
    #[token("CHAR", ignore(ascii_case))]
    #[token("VARYING", ignore(ascii_case))]
    #[token("VAR", ignore(ascii_case))]
    #[token("BIT", ignore(ascii_case))]
    #[token("PICTURE", ignore(ascii_case))]
    #[token("PIC", ignore(ascii_case))]
    #[token("POINTER", ignore(ascii_case))]
    #[token("PTR", ignore(ascii_case))]
    #[token("OFFSET", ignore(ascii_case))]
    #[token("AREA", ignore(ascii_case))]
    #[token("FILE", ignore(ascii_case))]
    #[token("LABEL", ignore(ascii_case))]
    #[token("FORMAT", ignore(ascii_case))]
    #[token("CONDITION", ignore(ascii_case))]
    
    // Attributes
    #[token("PRECISION", ignore(ascii_case))]
    #[token("EXTERNAL", ignore(ascii_case))]
    #[token("INTERNAL", ignore(ascii_case))]
    #[token("BUILTIN", ignore(ascii_case))]
    #[token("OPTIONS", ignore(ascii_case))]
    #[token("MAIN", ignore(ascii_case))]
    #[token("RECURSIVE", ignore(ascii_case))]
    #[token("REENTRANT", ignore(ascii_case))]
    #[token("ALIGNED", ignore(ascii_case))]
    #[token("UNALIGNED", ignore(ascii_case))]
    
    // I/O
    #[token("GET", ignore(ascii_case))]
    #[token("PUT", ignore(ascii_case))]
    #[token("READ", ignore(ascii_case))]
    #[token("WRITE", ignore(ascii_case))]
    #[token("OPEN", ignore(ascii_case))]
    #[token("CLOSE", ignore(ascii_case))]
    #[token("DELETE", ignore(ascii_case))]
    #[token("REWRITE", ignore(ascii_case))]
    #[token("DISPLAY", ignore(ascii_case))]
    #[token("SKIP", ignore(ascii_case))]
    #[token("PAGE", ignore(ascii_case))]
    #[token("LINE", ignore(ascii_case))]
    #[token("COLUMN", ignore(ascii_case))]
    #[token("COL", ignore(ascii_case))]
    #[token("LIST", ignore(ascii_case))]
    #[token("DATA", ignore(ascii_case))]
    #[token("EDIT", ignore(ascii_case))]
    #[token("PRINT", ignore(ascii_case))]
    #[token("INPUT", ignore(ascii_case))]
    #[token("OUTPUT", ignore(ascii_case))]
    #[token("UPDATE", ignore(ascii_case))]
    #[token("STREAM", ignore(ascii_case))]
    #[token("RECORD", ignore(ascii_case))]
    #[token("ENVIRONMENT", ignore(ascii_case))]
    #[token("ENV", ignore(ascii_case))]
    #[token("TITLE", ignore(ascii_case))]
    #[token("KEYED", ignore(ascii_case))]
    #[token("SEQUENTIAL", ignore(ascii_case))]
    #[token("DIRECT", ignore(ascii_case))]
    
    // Error handling
    #[token("SIGNAL", ignore(ascii_case))]
    #[token("ON", ignore(ascii_case))]
    #[token("REVERT", ignore(ascii_case))]
    #[token("ERROR", ignore(ascii_case))]
    #[token("UNDERFLOW", ignore(ascii_case))]
    #[token("OVERFLOW", ignore(ascii_case))]
    #[token("ZERODIVIDE", ignore(ascii_case))]
    #[token("CONVERSION", ignore(ascii_case))]
    #[token("SIZE", ignore(ascii_case))]
    #[token("STRINGRANGE", ignore(ascii_case))]
    #[token("SUBSCRIPTRANGE", ignore(ascii_case))]
    
    // Memory
    #[token("ALLOCATE", ignore(ascii_case))]
    #[token("FREE", ignore(ascii_case))]
    #[token("NULL", ignore(ascii_case))]
    #[token("SYSNULL", ignore(ascii_case))]
    
    // Logic
    #[token("AND", ignore(ascii_case))]
    #[token("OR", ignore(ascii_case))]
    #[token("NOT", ignore(ascii_case))]
    #[token("XOR", ignore(ascii_case))]
    Keyword,
    
    // ============ BUILTINS ============
    #[token("ABS", ignore(ascii_case))]
    #[token("MAX", ignore(ascii_case))]
    #[token("MIN", ignore(ascii_case))]
    #[token("MOD", ignore(ascii_case))]
    #[token("SIGN", ignore(ascii_case))]
    #[token("SQRT", ignore(ascii_case))]
    #[token("LOG", ignore(ascii_case))]
    #[token("LOG10", ignore(ascii_case))]
    #[token("EXP", ignore(ascii_case))]
    #[token("SIN", ignore(ascii_case))]
    #[token("COS", ignore(ascii_case))]
    #[token("TAN", ignore(ascii_case))]
    #[token("ASIN", ignore(ascii_case))]
    #[token("ACOS", ignore(ascii_case))]
    #[token("ATAN", ignore(ascii_case))]
    #[token("ATAN2", ignore(ascii_case))]
    #[token("SUBSTR", ignore(ascii_case))]
    #[token("INDEX", ignore(ascii_case))]
    #[token("LENGTH", ignore(ascii_case))]
    #[token("TRIM", ignore(ascii_case))]
    #[token("VERIFY", ignore(ascii_case))]
    #[token("TRANSLATE", ignore(ascii_case))]
    #[token("REVERSE", ignore(ascii_case))]
    #[token("REPEAT", ignore(ascii_case))]
    #[token("DATE", ignore(ascii_case))]
    #[token("TIME", ignore(ascii_case))]
    #[token("DATETIME", ignore(ascii_case))]
    #[token("ADDR", ignore(ascii_case))]
    #[token("ADDRESS", ignore(ascii_case))]
    #[token("STORAGE", ignore(ascii_case))]
    #[token("CURRENTSTORAGE", ignore(ascii_case))]
    #[token("STRING", ignore(ascii_case))]
    #[token("UNSPEC", ignore(ascii_case))]
    #[token("BOOL", ignore(ascii_case))]
    #[token("HIGH", ignore(ascii_case))]
    #[token("LOW", ignore(ascii_case))]
    #[token("COPY", ignore(ascii_case))]
    #[token("ROUND", ignore(ascii_case))]
    #[token("TRUNC", ignore(ascii_case))]
    #[token("FLOOR", ignore(ascii_case))]
    #[token("CEIL", ignore(ascii_case))]
    #[token("HBOUND", ignore(ascii_case))]
    #[token("LBOUND", ignore(ascii_case))]
    #[token("DIM", ignore(ascii_case))]
    #[token("DIMENSION", ignore(ascii_case))]
    #[token("SYSIN", ignore(ascii_case))]
    #[token("SYSPRINT", ignore(ascii_case))]
    #[token("ONCODE", ignore(ascii_case))]
    #[token("ONCHAR", ignore(ascii_case))]
    #[token("ONKEY", ignore(ascii_case))]
    #[token("ONLOC", ignore(ascii_case))]
    Builtin,
    
    // ============ PREPROCESSOR ============
    #[token("%INCLUDE", ignore(ascii_case))]
    #[token("%REPLACE", ignore(ascii_case))]
    #[token("%ACTIVATE", ignore(ascii_case))]
    #[token("%DEACTIVATE", ignore(ascii_case))]
    #[token("%IF", ignore(ascii_case))]
    #[token("%THEN", ignore(ascii_case))]
    #[token("%ELSE", ignore(ascii_case))]
    #[token("%ENDIF", ignore(ascii_case))]
    #[token("%DO", ignore(ascii_case))]
    #[token("%END", ignore(ascii_case))]
    #[token("%DCL", ignore(ascii_case))]
    #[token("%DECLARE", ignore(ascii_case))]
    #[token("*PROCESS", ignore(ascii_case))]
    Preprocessor,
    
    // ============ COMMENTS ============
    #[regex(r"/\*[^*]*\*+(?:[^/*][^*]*\*+)*/")]
    Comment,
    
    // ============ STRINGS ============
    #[regex(r#"'[^']*'"#)]
    #[regex(r#""[^"]*""#)]
    String,
    
    // ============ NUMBERS ============
    #[regex(r"[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?")]
    #[regex(r"'[0-9A-Fa-f]+'[xXbB]")]
    Number,
    
    // ============ OPERATORS ============
    #[token("=")]
    #[token("<")]
    #[token(">")]
    #[token("<=")]
    #[token(">=")]
    #[token("<>")]
    #[token("^=")]
    #[token("+")]
    #[token("-")]
    #[token("*")]
    #[token("/")]
    #[token("**")]
    #[token("||")]
    #[token("&")]
    #[token("|")]
    #[token("^")]
    Operator,
    
    // ============ PUNCTUATION ============
    #[token("(")]
    #[token(")")]
    #[token("[")]
    #[token("]")]
    #[token(";")]
    #[token(":")]
    #[token(",")]
    #[token(".")]
    Punctuation,
    
    // ============ IDENTIFIERS ============
    #[regex(r"[a-zA-Z_@#$][a-zA-Z0-9_@#$]*")]
    Identifier,
    
    // ============ WHITESPACE & NEWLINES ============
    #[regex(r"[ \t\r]+")]
    Whitespace,
    
    #[token("\n")]
    Newline,
}

/// Convert internal token to output token type
fn to_token_type(tok: &PLIToken) -> TokenType {
    match tok {
        PLIToken::Keyword => TokenType::Keyword,
        PLIToken::Builtin => TokenType::Builtin,
        PLIToken::Preprocessor => TokenType::Preprocessor,
        PLIToken::Comment => TokenType::Comment,
        PLIToken::String => TokenType::String,
        PLIToken::Number => TokenType::Number,
        PLIToken::Operator => TokenType::Operator,
        PLIToken::Punctuation => TokenType::Punctuation,
        PLIToken::Identifier => TokenType::Identifier,
        PLIToken::Whitespace => TokenType::Whitespace,
        PLIToken::Newline => TokenType::Newline,
    }
}

/// Main tokenization function - called from JavaScript
/// Returns a flat array: [type, start, end, type, start, end, ...]
/// This is ~10x faster than returning objects
#[wasm_bindgen]
pub fn tokenize_flat(code: &str) -> Vec<u32> {
    let mut result = Vec::with_capacity(code.len() / 2); // Pre-allocate
    let mut lexer = PLIToken::lexer(code);
    
    while let Some(token_result) = lexer.next() {
        let span = lexer.span();
        let token_type = match token_result {
            Ok(tok) => to_token_type(&tok) as u32,
            Err(_) => TokenType::Unknown as u32,
        };
        
        result.push(token_type);
        result.push(span.start as u32);
        result.push(span.end as u32);
    }
    
    result
}

/// Tokenize and return JSON string (for easier debugging)
#[wasm_bindgen]
pub fn tokenize_json(code: &str) -> String {
    let tokens = tokenize(code);
    serde_json::to_string(&tokens).unwrap_or_else(|_| "[]".to_string())
}

/// Internal tokenization returning Token structs
pub fn tokenize(code: &str) -> Vec<Token> {
    let mut tokens = Vec::with_capacity(code.len() / 4);
    let mut lexer = PLIToken::lexer(code);
    
    while let Some(token_result) = lexer.next() {
        let span = lexer.span();
        let slice = lexer.slice();
        
        let token_type = match token_result {
            Ok(tok) => to_token_type(&tok),
            Err(_) => TokenType::Unknown,
        };
        
        tokens.push(Token {
            text: slice.to_string(),
            token_type,
            start: span.start,
            end: span.end,
        });
    }
    
    tokens
}

/// Incremental tokenization - only re-tokenize changed region
/// Returns tokens for the specified byte range
#[wasm_bindgen]
pub fn tokenize_range(code: &str, start_byte: usize, end_byte: usize) -> Vec<u32> {
    // Find line boundaries
    let start = code[..start_byte].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let end = code[end_byte..].find('\n').map(|i| end_byte + i + 1).unwrap_or(code.len());
    
    let slice = &code[start..end];
    let mut result = Vec::new();
    let mut lexer = PLIToken::lexer(slice);
    
    while let Some(token_result) = lexer.next() {
        let span = lexer.span();
        let token_type = match token_result {
            Ok(tok) => to_token_type(&tok) as u32,
            Err(_) => TokenType::Unknown as u32,
        };
        
        // Adjust offsets to original code position
        result.push(token_type);
        result.push((start + span.start) as u32);
        result.push((start + span.end) as u32);
    }
    
    result
}

/// Get version info
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_tokenization() {
        let code = "DCL X FIXED BINARY(31);";
        let tokens = tokenize(code);
        
        assert!(!tokens.is_empty());
        assert_eq!(tokens[0].token_type, TokenType::Keyword); // DCL
    }
    
    #[test]
    fn test_comment() {
        let code = "/* This is a comment */ DCL X;";
        let tokens = tokenize(code);
        
        assert_eq!(tokens[0].token_type, TokenType::Comment);
    }
    
    #[test]
    fn test_string() {
        let code = "X = 'Hello World';";
        let tokens = tokenize(code);
        
        let string_token = tokens.iter().find(|t| t.token_type == TokenType::String);
        assert!(string_token.is_some());
    }
    
    #[test]
    fn test_preprocessor() {
        let code = "%INCLUDE MYFILE;";
        let tokens = tokenize(code);
        
        assert_eq!(tokens[0].token_type, TokenType::Preprocessor);
    }
}
