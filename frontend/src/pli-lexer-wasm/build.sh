#!/bin/bash
# Build script for PL/I WASM Lexer

set -e

echo "🦀 Building PL/I WASM Lexer..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "📦 Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build for web target (ES modules)
echo "🔨 Building WASM..."
wasm-pack build --target web --release --out-dir pkg

# Optimize WASM binary size (optional, requires wasm-opt)
if command -v wasm-opt &> /dev/null; then
    echo "⚡ Optimizing WASM..."
    wasm-opt -O3 pkg/pli_lexer_wasm_bg.wasm -o pkg/pli_lexer_wasm_bg.wasm
fi

# Show results
echo ""
echo "✅ Build complete!"
echo ""
echo "📊 Output files:"
ls -lh pkg/*.wasm pkg/*.js 2>/dev/null || true

echo ""
echo "📦 WASM size:"
du -h pkg/*.wasm 2>/dev/null || true

echo ""
echo "🚀 Usage:"
echo "   1. Copy pkg/ folder to your frontend project"
echo "   2. Import: import init, { tokenize_flat } from './pkg/pli_lexer_wasm.js'"
echo "   3. Call: await init(); const tokens = tokenize_flat(code);"
