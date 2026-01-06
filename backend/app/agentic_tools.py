# -*- coding: utf-8 -*-
"""
Agentic Tools for LLM Dev Env

Ez a modul biztosítja az LLM számára a tool-okat, amelyekkel
közvetlenül tud fájlokat olvasni, írni, keresni.

A Cursor-hoz hasonló megközelítés: az LLM maga dönti el,
mikor és milyen fájlokat olvas/ír.

Token kezelés: tiktoken alapú token számlálás és kontextus menedzsment.
"""

import os
import re
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

# Fix Windows encoding issues
os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ['PYTHONUTF8'] = '1'

def safe_print(*args, **kwargs):
    """Print that handles encoding errors gracefully on Windows."""
    import sys
    # Ensure flush for immediate output
    kwargs.setdefault('flush', True)
    try:
        print(*args, **kwargs)
        sys.stdout.flush()
    except (UnicodeEncodeError, UnicodeDecodeError):
        # Fallback: encode with errors='replace'
        msg = ' '.join(str(a) for a in args)
        print(msg.encode('ascii', errors='replace').decode('ascii'), **kwargs)
        sys.stdout.flush()

# Token management
try:
    from .token_manager import TokenManager, get_token_manager, TokenStats
    HAS_TOKEN_MANAGER = True
except ImportError:
    HAS_TOKEN_MANAGER = False
    print("[AGENTIC] Token manager not available - running without token counting")

# =====================================
#   TOOL DEFINITIONS (OpenAI format)
# =====================================

AGENTIC_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the content of a file. For LARGE files (>500 lines), use start_line and end_line to read in chunks!",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file within the project"
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "Start reading from this line (1-based). Use for chunked reading of large files."
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "Read until this line (inclusive). Use for chunked reading of large files."
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_file_info",
            "description": "Get information about a file (size, line count) WITHOUT reading the full content. Use this FIRST to check if you need chunked reading!",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "continue_task",
            "description": "Signal that you want to continue working on the next chunk. Call this after processing a chunk to automatically continue.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Brief status message (e.g., 'Processed lines 1-500, continuing with 501-1000')"
                    },
                    "next_start_line": {
                        "type": "integer",
                        "description": "The starting line for the next chunk"
                    }
                },
                "required": ["message"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file. This will create the file if it doesn't exist, or overwrite it if it does. Use this to apply code changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file within the project"
                    },
                    "content": {
                        "type": "string",
                        "description": "The complete content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "apply_edit",
            "description": "Apply a specific edit to a file by replacing old_text with new_text. More efficient than write_file for small changes. Can be called multiple times for multiple edits in the same or different files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file within the project"
                    },
                    "old_text": {
                        "type": "string",
                        "description": "The exact text to find and replace (must match exactly)"
                    },
                    "new_text": {
                        "type": "string",
                        "description": "The new text to replace the old text with"
                    }
                },
                "required": ["path", "old_text", "new_text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and directories in a given path. Use this to explore the project structure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the directory (use '.' or '' for project root)"
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "If true, list all files recursively (default: false)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_in_files",
            "description": "Search for a pattern in files. Returns matching lines with file paths and line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "The text or regex pattern to search for"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory to search in (default: entire project)"
                    },
                    "file_pattern": {
                        "type": "string",
                        "description": "Glob pattern to filter files (e.g., '*.js', '*.py')"
                    }
                },
                "required": ["pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_directory",
            "description": "Create a new directory in the project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the directory to create"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "delete_file",
            "description": "Delete a file from the project. Use with caution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file to delete"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "semantic_search",
            "description": "Search for relevant code using semantic/RAG search. Use this to find code related to a concept without knowing exact file paths. Great for understanding how something works or finding similar code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language description of what you're looking for (e.g., 'function that handles user authentication', 'code that processes game collisions')"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5, max: 10)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_terminal",
            "description": "Execute a PowerShell/terminal command. Use this for running scripts, installing packages, git commands, build commands, etc. REQUIRES USER PERMISSION - the command will be shown to the user for approval before execution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The PowerShell command to execute"
                    },
                    "description": {
                        "type": "string",
                        "description": "Human-readable description of what this command does (shown to user for approval)"
                    },
                    "working_directory": {
                        "type": "string",
                        "description": "Optional: directory to run the command in (relative to project root)"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds (default: 30, max: 300)"
                    }
                },
                "required": ["command", "description"]
            }
        }
    }
]

# =====================================
#   PERMISSION REQUIRED OPERATIONS
# =====================================

# Operations that ALWAYS require user permission (both modes)
ALWAYS_REQUIRE_PERMISSION = {
    "execute_terminal",  # Terminal parancsok - mindig engedély
    "delete_file",       # Fájl törlés - mindig engedély
}

# Operations that require permission only in MANUAL mode
MANUAL_MODE_PERMISSION = {
    "write_file",        # Fájl létrehozás/írás
    "apply_edit",        # Fájl módosítás
    "create_directory",  # Könyvtár létrehozás
}


# =====================================
#   TOOL EXECUTION RESULTS
# =====================================

@dataclass
class FileModification:
    """Részletes fájl módosítás adatok"""
    path: str
    action: str  # "write", "edit", "delete", "create"
    lines_added: int = 0
    lines_deleted: int = 0
    before_content: Optional[str] = None  # Eredeti tartalom (diff-hez)
    after_content: Optional[str] = None  # Új tartalom (diff-hez)

@dataclass
class ToolResult:
    """Result of a tool execution"""
    success: bool
    result: str
    error: Optional[str] = None
    modified_files: List[str] = field(default_factory=list)
    file_modifications: List[FileModification] = field(default_factory=list)  # Részletes info
    permission_required: bool = False  # Ha True, user jóváhagyás kell
    permission_type: Optional[str] = None  # "terminal", "delete", "create", "modify"
    permission_details: Optional[Dict[str, Any]] = None  # Részletek a jóváhagyáshoz
    

@dataclass
class AgenticResult:
    """Final result of an agentic execution"""
    success: bool
    response: str
    modified_files: List[Dict[str, Any]] = field(default_factory=list)
    tool_calls_count: int = 0
    error: Optional[str] = None
    pending_permissions: List[Dict[str, Any]] = field(default_factory=list)  # Jóváhagyásra váró műveletek


# =====================================
#   ENCODING PROTECTION
# =====================================

def detect_mojibake(text: str) -> bool:
    """
    Detektálja ha a szöveg double-encoded (mojibake) karaktereket tartalmaz.
    Mojibake: UTF-8 bytes hibásan Latin-1-ként értelmezve.
    """
    if not text:
        return False
    
    # Tipikus mojibake minták UTF-8 magyar karakterekre
    # Ezek akkor jelennek meg ha UTF-8 byte-ok Latin-1-ként lesznek dekódolva
    mojibake_patterns = [
        '\xc3\xa1',  # á mojibake
        '\xc3\xa9',  # é mojibake
        '\xc3\xad',  # í mojibake
        '\xc3\xb3',  # ó mojibake
        '\xc3\xb6',  # ö mojibake
        '\xc3\xba',  # ú mojibake
        '\xc3\xbc',  # ü mojibake
        '\xc5\x91',  # ő mojibake
        '\xc5\xb1',  # ű mojibake
    ]
    
    for pattern in mojibake_patterns:
        if pattern in text:
            return True
    
    # Ellenőrizzük a C3 byte jelenlétét ami gyakori mojibake jel
    if '\xc3' in text and any(c in text for c in '\xa1\xa9\xad\xb3\xb6\xba\xbc'):
        return True
    
    return False


def fix_mojibake(text: str) -> str:
    """
    Megpróbálja javítani a double-encoded karaktereket.
    A legbiztonságosabb megközelítés: encode Latin-1, decode UTF-8.
    """
    if not text:
        return text
    
    try:
        # Ha a szöveg double-encoded, ez javítja
        fixed = text.encode('latin-1').decode('utf-8')
        return fixed
    except (UnicodeDecodeError, UnicodeEncodeError):
        # Ha nem sikerül, térjünk vissza az eredetivel
        return text


def validate_encoding_safety(original: str, modified: str) -> dict:
    """
    Ellenőrzi hogy a módosítás nem ront-e el encoding-ot.
    
    Returns:
        {"safe": bool, "warnings": list, "errors": list}
    """
    result = {"safe": True, "warnings": [], "errors": []}
    
    # 1. Check if modified introduces mojibake
    if not detect_mojibake(original) and detect_mojibake(modified):
        result["safe"] = False
        result["errors"].append("Modified code introduces mojibake (double-encoded) characters!")
    
    # 2. Check if Hungarian chars are being removed
    hungarian_chars = set('áéíóöőúüűÁÉÍÓÖŐÚÜŰ')
    orig_hungarian = sum(1 for c in original if c in hungarian_chars)
    mod_hungarian = sum(1 for c in modified if c in hungarian_chars)
    
    if orig_hungarian > 5 and mod_hungarian < orig_hungarian * 0.5:
        result["warnings"].append(f"Hungarian characters significantly reduced: {orig_hungarian} -> {mod_hungarian}")
    
    # 3. Check if non-ASCII became ASCII (suspicious)
    orig_non_ascii = sum(1 for c in original if ord(c) > 127)
    mod_non_ascii = sum(1 for c in modified if ord(c) > 127)
    
    if orig_non_ascii > 10 and mod_non_ascii == 0:
        result["warnings"].append(f"All non-ASCII characters removed: {orig_non_ascii} -> 0")
    
    # 4. Check string literals integrity (basic)
    import re
    orig_strings = set(re.findall(r'"[^"]*"', original))
    mod_strings = set(re.findall(r'"[^"]*"', modified))
    
    # Check if any string was corrupted (became shorter than 50%)
    for orig_str in orig_strings:
        if len(orig_str) > 10:
            found = False
            for mod_str in mod_strings:
                if orig_str == mod_str or orig_str in mod_str or mod_str in orig_str:
                    found = True
                    break
            # Not a critical error, just a warning if many strings changed
    
    return result


# =====================================
#   TOOL EXECUTOR CLASS
# =====================================

class ToolExecutor:
    """
    Executes tools within a project context.
    
    Ensures all file operations are sandboxed within the project root.
    
    auto_mode: Ha True, csak terminal és delete kér jóváhagyást
               Ha False (manual), MINDEN írási művelet jóváhagyást kér
    """
    
    # Blocked paths for security
    BLOCKED_PATTERNS = [
        r'\.\./',           # Parent directory traversal
        r'\.git/',          # Git internals
        r'node_modules/',   # Node modules (too large)
        r'__pycache__/',    # Python cache
        r'\.env',           # Environment files
        r'\.venv/',         # Virtual environments
        r'venv/',
    ]
    
    # File extensions to skip in search
    SKIP_EXTENSIONS = {'.pyc', '.pyo', '.exe', '.dll', '.so', '.dylib', '.bin', '.dat'}
    
    def __init__(self, project_root: str, auto_mode: bool = True):
        self.project_root = Path(project_root).resolve()
        self.auto_mode = auto_mode  # Ha False, minden írás jóváhagyást kér
        if not self.project_root.exists():
            raise ValueError(f"Project root does not exist: {project_root}")
    
    def _resolve_path(self, rel_path: str) -> Optional[Path]:
        """
        Resolve a relative path to an absolute path within the project.
        Returns None if the path would escape the project root.
        """
        if not rel_path:
            return self.project_root
        
        # Check for blocked patterns
        for pattern in self.BLOCKED_PATTERNS:
            if re.search(pattern, rel_path):
                return None
        
        # Resolve the path
        try:
            full_path = (self.project_root / rel_path).resolve()
            
            # Ensure it's within project root
            if not str(full_path).startswith(str(self.project_root)):
                return None
            
            return full_path
        except Exception:
            return None
    
    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """Execute a tool by name with given arguments."""
        
        handlers = {
            "read_file": self._read_file,
            "write_file": self._write_file,
            "apply_edit": self._apply_edit,
            "list_directory": self._list_directory,
            "search_in_files": self._search_in_files,
            "create_directory": self._create_directory,
            "delete_file": self._delete_file,
            "get_file_info": self._get_file_info,
            "continue_task": self._continue_task,
            "semantic_search": self._semantic_search,
            "execute_terminal": self._execute_terminal,
        }
        
        handler = handlers.get(tool_name)
        if not handler:
            return ToolResult(
                success=False,
                result="",
                error=f"Unknown tool: {tool_name}"
            )
        
        try:
            return handler(**arguments)
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Tool execution error: {str(e)}"
            )
    
    def _read_file(self, path: str, start_line: int = None, end_line: int = None) -> ToolResult:
        """Read a file's content, optionally a specific line range."""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        if not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"File not found: {path}"
            )
        
        if not resolved.is_file():
            return ToolResult(
                success=False,
                result="",
                error=f"Not a file: {path}"
            )
        
        try:
            # Try different encodings
            content = None
            for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:
                try:
                    content = resolved.read_text(encoding=encoding)
                    content = content.lstrip('\ufeff')  # Remove BOM
                    break
                except UnicodeDecodeError:
                    continue
            
            if content is None:
                return ToolResult(
                    success=False,
                    result="",
                    error=f"Could not decode file with any supported encoding: {path}"
                )
            
            lines = content.split('\n')
            total_lines = len(lines)
            
            # Ha chunk-ban kéri (start_line/end_line megadva)
            if start_line is not None or end_line is not None:
                start = max(1, start_line or 1) - 1  # 1-based to 0-based
                end = min(total_lines, end_line or total_lines)
                
                chunk_lines = lines[start:end]
                chunk_content = '\n'.join(chunk_lines)
                
                return ToolResult(
                    success=True,
                    result=f"[CHUNK: Lines {start+1}-{end} of {total_lines} total]\n\n{chunk_content}\n\n[END CHUNK - {'More lines available' if end < total_lines else 'End of file'}]"
                )
            
            # Teljes fájl - de figyelmeztetés ha nagy
            if total_lines > 500:
                # Nagy fájl - adjunk tanácsot a chunk-olásról
                preview_lines = lines[:100]
                preview = '\n'.join(preview_lines)
                
                return ToolResult(
                    success=True,
                    result=f"⚠️ LARGE FILE: {total_lines} lines, {len(content)} chars\n\n[PREVIEW - First 100 lines:]\n{preview}\n\n[... {total_lines - 100} more lines ...]\n\n💡 TIP: Use read_file with start_line/end_line to read in chunks!\nExample: read_file(path=\"{path}\", start_line=1, end_line=500)"
                )
            
            return ToolResult(
                success=True,
                result=content
            )
            
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error reading file: {str(e)}"
            )
    
    def _get_file_info(self, path: str) -> ToolResult:
        """Get file info without reading full content."""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        if not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"File not found: {path}"
            )
        
        try:
            stat = resolved.stat()
            size_bytes = stat.st_size
            
            # Count lines without loading entire file into memory
            line_count = 0
            with open(resolved, 'r', encoding='utf-8', errors='ignore') as f:
                for _ in f:
                    line_count += 1
            
            result = f"""File: {path}
Size: {size_bytes} bytes ({size_bytes // 1024} KB)
Lines: {line_count}

{"⚠️ LARGE FILE! Use chunked reading:" if line_count > 500 else "✅ Small file, can read fully."}
{"  - read_file(path, start_line=1, end_line=500)" if line_count > 500 else ""}
{"  - read_file(path, start_line=501, end_line=1000)" if line_count > 1000 else ""}
{"  - etc." if line_count > 500 else ""}"""
            
            return ToolResult(
                success=True,
                result=result
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error getting file info: {str(e)}"
            )
    
    def _continue_task(self, message: str, next_start_line: int = None) -> ToolResult:
        """Signal to continue with next chunk."""
        return ToolResult(
            success=True,
            result=f"✅ {message}\n\n🔄 Continuing automatically..."
        )
    
    def _semantic_search(self, query: str, top_k: int = 5) -> ToolResult:
        """Semantic/RAG search for relevant code."""
        try:
            # Import RAG helper
            try:
                from .rag_helper import get_rag_helper
            except ImportError:
                # Fallback to direct vector_store import
                import sys
                backend_dir = os.path.dirname(os.path.dirname(__file__))
                if backend_dir not in sys.path:
                    sys.path.insert(0, backend_dir)
                from vector_store import query_project
                
                # Get project name from root path
                project_name = os.path.basename(self.project_root)
                
                results = query_project(project_name, query, top_k=min(top_k, 10))
                
                if not results:
                    return ToolResult(
                        success=True,
                        result="No relevant code found for this query."
                    )
                
                output_parts = [f"Found {len(results)} relevant code chunks:\n"]
                for i, r in enumerate(results, 1):
                    output_parts.append(
                        f"\n--- [{i}] {r['file_path']} (chunk {r['chunk_index']}, score: {r['score']:.2f}) ---\n"
                        f"{r['content']}\n"
                    )
                
                return ToolResult(
                    success=True,
                    result="\n".join(output_parts)
                )
            
            # Use RAG helper if available
            project_name = os.path.basename(self.project_root)
            rag = get_rag_helper(project_name, self.project_root)
            results = rag.search_relevant_code(query, top_k=min(top_k, 10))
            
            if not results:
                return ToolResult(
                    success=True,
                    result="No relevant code found for this query. Try different keywords or use search_in_files for text search."
                )
            
            output_parts = [f"🔍 Found {len(results)} relevant code chunks:\n"]
            for i, r in enumerate(results, 1):
                output_parts.append(
                    f"\n--- [{i}] {r['file_path']} (chunk {r['chunk_index']}, relevance: {r['score']:.2f}) ---\n"
                    f"{r['content']}\n"
                )
            
            return ToolResult(
                success=True,
                result="\n".join(output_parts)
            )
            
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Semantic search error: {str(e)}"
            )
    
    def _execute_terminal(self, command: str, description: str, working_directory: str = None, timeout: int = 30) -> ToolResult:
        """Execute a terminal/PowerShell command. ALWAYS requires permission!"""
        import subprocess
        import shutil
        
        # Limit timeout
        timeout = min(max(timeout, 5), 300)
        
        # Resolve working directory
        if working_directory:
            work_dir = self._resolve_path(working_directory)
            if not work_dir or not work_dir.is_dir():
                work_dir = Path(self.project_root)
        else:
            work_dir = Path(self.project_root)
        
        # ALWAYS return permission_required - the frontend will handle approval
        return ToolResult(
            success=False,  # Not executed yet - waiting for permission
            result="",
            permission_required=True,
            permission_type="terminal",
            permission_details={
                "command": command,
                "description": description,
                "working_directory": str(work_dir),
                "timeout": timeout,
            }
        )
    
    def execute_terminal_approved(self, command: str, working_directory: str, timeout: int = 30) -> ToolResult:
        """Execute terminal command AFTER user approval."""
        import subprocess
        import shutil
        
        def strip_ansi_codes(text: str) -> str:
            """Remove ANSI escape codes (color codes) from text."""
            import re
            # ANSI escape sequence pattern: ESC[ followed by params and ending with a letter
            ansi_pattern = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07')
            return ansi_pattern.sub('', text)
        
        work_dir = Path(working_directory)
        
        try:
            # Find PowerShell
            pwsh_path = shutil.which("pwsh") or shutil.which("powershell")
            
            # Environment variables to disable colors in PowerShell
            env = os.environ.copy()
            env['NO_COLOR'] = '1'
            env['TERM'] = 'dumb'
            
            if pwsh_path:
                result = subprocess.run(
                    [pwsh_path, "-NoProfile", "-Command", command],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=str(work_dir),
                    encoding='utf-8',
                    errors='replace',
                    env=env
                )
            else:
                # Fallback to cmd
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=str(work_dir),
                    encoding='utf-8',
                    errors='replace',
                    env=env
                )
            
            # Strip ANSI codes from output
            output = strip_ansi_codes(result.stdout or "")
            error = strip_ansi_codes(result.stderr or "")
            
            if result.returncode == 0:
                return ToolResult(
                    success=True,
                    result=f"Command executed successfully (exit code: 0)\n\nOutput:\n{output}" + (f"\n\nStderr:\n{error}" if error else "")
                )
            else:
                return ToolResult(
                    success=False,
                    result=output,
                    error=f"Command failed (exit code: {result.returncode})\nError: {error}"
                )
                
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                result="",
                error=f"Command timed out after {timeout} seconds"
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Terminal execution error: {str(e)}"
            )
    
    def _write_file(self, path: str, content: str) -> ToolResult:
        """Write content to a file."""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        # 🔐 MANUAL MODE: Mindig jóváhagyás kell fájl íráshoz
        if not self.auto_mode:
            return ToolResult(
                success=False,
                result="",
                permission_required=True,
                permission_type="write",
                permission_details={
                    "path": path,
                    "full_path": str(resolved),
                    "content_length": len(content),
                    "content_preview": content[:500] + ("..." if len(content) > 500 else ""),
                    "description": f"Fájl írás: {path} ({len(content)} karakter)",
                }
            )
        
        try:
            # 🔒 ENCODING VÉDELEM: Ellenőrizzük a tartalmat
            if detect_mojibake(content):
                safe_print(f"[ENCODING WARNING] Mojibake detected in write_file content, attempting fix...")
                content = fix_mojibake(content)
            
            # SAFETY CHECK: Ha a fájl már létezik, ellenőrizzük hogy nem vágódik-e le!
            if resolved.exists() and resolved.is_file():
                try:
                    original_content = resolved.read_text(encoding='utf-8', errors='ignore')
                    original_len = len(original_content)
                    new_len = len(content)
                    
                    # Ha az új tartalom kevesebb mint a fele az eredetinek, TILTÁS!
                    if new_len < original_len * 0.5 and original_len > 1000:
                        return ToolResult(
                            success=False,
                            result="",
                            error=f"SAFETY BLOCK: write_file would truncate the file from {original_len} to {new_len} chars ({int(new_len/original_len*100)}%)! Use apply_edit() for partial changes instead of write_file()!"
                        )
                    
                    # 🔒 ENCODING VÉDELEM: Encoding minőség ellenőrzés
                    encoding_check = validate_encoding_safety(original_content, content)
                    if not encoding_check["safe"]:
                        return ToolResult(
                            success=False,
                            result="",
                            error=f"ENCODING PROTECTION: {'; '.join(encoding_check['errors'])}"
                        )
                    
                    # Ha az új tartalom kevesebb mint 80% az eredetinek, figyelmeztetés de engedélyezés
                    if new_len < original_len * 0.8 and original_len > 500:
                        safe_print(f"[WRITE_FILE] WARNING: File will shrink from {original_len} to {new_len} chars")
                        
                except Exception as e:
                    safe_print(f"[WRITE_FILE] Could not read original for comparison: {e}")
            
            # Eredeti tartalom mentése diff-hez (újra olvasás ha kell)
            original_content_for_diff = ""
            original_lines = 0
            if resolved.exists() and resolved.is_file():
                try:
                    original_content_for_diff = resolved.read_text(encoding='utf-8', errors='ignore')
                    original_lines = len(original_content_for_diff.split('\n'))
                except:
                    pass
            
            # Create parent directories if needed
            resolved.parent.mkdir(parents=True, exist_ok=True)
            
            # Write the file
            resolved.write_text(content, encoding='utf-8')
            
            # Részletes diff számítás
            is_new_file = not original_content_for_diff
            lines_added = 0
            lines_deleted = 0
            
            if is_new_file:
                lines_added = len(content.split('\n'))
            else:
                # Használjunk difflib-et
                import difflib
                old_lines_list = original_content_for_diff.split('\n')
                new_lines_list = content.split('\n')
                differ = difflib.unified_diff(old_lines_list, new_lines_list, lineterm='')
                
                for line in differ:
                    if line.startswith('+') and not line.startswith('+++'):
                        lines_added += 1
                    elif line.startswith('-') and not line.startswith('---'):
                        lines_deleted += 1
            
            return ToolResult(
                success=True,
                result=f"Successfully wrote {len(content)} characters to {path} (+{lines_added}/-{lines_deleted} lines)",
                modified_files=[path],
                file_modifications=[FileModification(
                    path=path,
                    action="create" if is_new_file else "write",
                    lines_added=lines_added,
                    lines_deleted=lines_deleted,
                    before_content=original_content_for_diff if original_content_for_diff else None,
                    after_content=content
                )]
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error writing file: {str(e)}"
            )
    
    def _apply_edit(self, path: str, old_text: str, new_text: str) -> ToolResult:
        """Apply a specific edit to a file with ENCODING PROTECTION."""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        if not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"File not found: {path}"
            )
        
        # ⚠️ ELLENŐRZÉS: Ha old_text == new_text, az nem valódi módosítás!
        if old_text == new_text:
            return ToolResult(
                success=False,
                result="",
                error=f"⛔ HIBA: Az old_text és new_text UGYANAZ! Ez nem valódi módosítás!\n"
                      f"Ha módosítani akarsz, a new_text-nek KÜLÖNBÖZNIE KELL az old_text-től!\n"
                      f"Használj read_file('{path}') és keresd meg a tényleges hibát, majd adj meg KÜLÖNBÖZŐ old_text és new_text értékeket!"
            )
        
        # 🔐 MANUAL MODE: Mindig jóváhagyás kell fájl szerkesztéshez
        if not self.auto_mode:
            # Először olvassuk be a fájlt és ellenőrizzük, hogy az old_text létezik-e
            try:
                current_content = resolved.read_text(encoding='utf-8')
                current_content = current_content.lstrip('\ufeff')  # Remove BOM
                
                # Számítsunk hash-t a fájl tartalmához
                import hashlib
                file_hash = hashlib.md5(current_content.encode('utf-8')).hexdigest()
                
                # Ellenőrizzük, hogy az old_text létezik-e
                if old_text not in current_content:
                    # Lehet, hogy a változtatás már alkalmazva van?
                    if new_text in current_content:
                        return ToolResult(
                            success=True,
                            result=f"✅ A változtatás MÁR ALKALMAZVA van a fájlban: {path}. Nincs szükség további módosításra.",
                            modified_files=[],
                            file_modifications=[]
                        )
                    
                    # Keressük hasonló szöveget
                    search_snippet = old_text[:30] if len(old_text) > 30 else old_text
                    similar_lines = [line for line in current_content.split('\n') if search_snippet[:15] in line]
                    
                    error_msg = f"A keresett szöveg nem található a fájlban: {path}\n"
                    error_msg += f"Keresett: '{old_text[:100]}{'...' if len(old_text) > 100 else ''}'\n"
                    if similar_lines:
                        error_msg += f"Hasonló sorok:\n"
                        for line in similar_lines[:3]:
                            error_msg += f"  - {line.strip()[:80]}\n"
                    error_msg += "\nKérlek, használj read_file()-t a fájl aktuális tartalmának lekéréséhez!"
                    
                    return ToolResult(
                        success=False,
                        result="",
                        error=error_msg
                    )
            except Exception as e:
                return ToolResult(
                    success=False,
                    result="",
                    error=f"Nem sikerült olvasni a fájlt: {str(e)}"
                )
            
            # Készítsünk egy diff preview-t
            old_preview = old_text[:200] + ("..." if len(old_text) > 200 else "")
            new_preview = new_text[:200] + ("..." if len(new_text) > 200 else "")
            
            return ToolResult(
                success=False,
                result="",
                permission_required=True,
                permission_type="edit",
                permission_details={
                    "path": path,
                    "full_path": str(resolved),
                    "old_text": old_text,
                    "new_text": new_text,
                    "old_preview": old_preview,
                    "new_preview": new_preview,
                    "description": f"Fájl szerkesztés: {path}",
                    "file_hash": file_hash,  # Fájl hash a frissesség ellenőrzéséhez
                }
            )
        
        try:
            # Read current content
            content = resolved.read_text(encoding='utf-8')
            content = content.lstrip('\ufeff')  # Remove BOM
            
            # 🔒 ENCODING VÉDELEM: Ellenőrizzük hogy a new_text nem tartalmaz mojibake-t
            if detect_mojibake(new_text):
                safe_print(f"[ENCODING WARNING] Mojibake detected in new_text, attempting fix...")
                new_text = fix_mojibake(new_text)
            
            # 🔒 ENCODING VÉDELEM: Validáljuk a módosítást
            encoding_check = validate_encoding_safety(old_text, new_text)
            if not encoding_check["safe"]:
                for error in encoding_check["errors"]:
                    safe_print(f"[ENCODING ERROR] {error}")
                return ToolResult(
                    success=False,
                    result="",
                    error=f"ENCODING PROTECTION: {'; '.join(encoding_check['errors'])}. Please use correct UTF-8 characters."
                )
            
            for warning in encoding_check.get("warnings", []):
                safe_print(f"[ENCODING WARNING] {warning}")
            
            # Check if old_text exists
            if old_text not in content:
                # Try with normalized whitespace
                normalized_content = re.sub(r'\s+', ' ', content)
                normalized_old = re.sub(r'\s+', ' ', old_text)
                
                if normalized_old not in normalized_content:
                    # 🔒 Ha mojibake van az old_text-ben, próbáljuk javítani
                    if detect_mojibake(old_text):
                        fixed_old = fix_mojibake(old_text)
                        if fixed_old in content:
                            old_text = fixed_old
                            safe_print(f"[ENCODING FIX] Fixed mojibake in old_text, retrying...")
                        else:
                            return ToolResult(
                                success=False,
                                result="",
                                error=f"Could not find the text to replace in {path}. The old_text contains encoding issues. Please read_file first to get the exact current content."
                            )
                    else:
                        return ToolResult(
                            success=False,
                            result="",
                            error=f"Could not find the text to replace in {path}. Please read_file first to get the current content."
                        )
            
            # Count occurrences
            occurrences = content.count(old_text)
            if occurrences > 1:
                # Replace only the first occurrence to be safe
                new_content = content.replace(old_text, new_text, 1)
            else:
                new_content = content.replace(old_text, new_text)
            
            # 🔒 FINAL CHECK: Az új tartalom nem tartalmaz mojibake-t
            if detect_mojibake(new_content) and not detect_mojibake(content):
                safe_print(f"[ENCODING BLOCK] Edit would introduce mojibake, blocking!")
                return ToolResult(
                    success=False,
                    result="",
                    error="ENCODING PROTECTION: Edit would introduce mojibake characters. Operation blocked."
                )
            
            # Write back
            resolved.write_text(new_content, encoding='utf-8')
            
            # Részletes diff számítás - tényleges változások
            old_lines = content.split('\n')
            new_lines = new_content.split('\n')
            
            # Egyszerű diff: hány sor változott
            lines_added = 0
            lines_deleted = 0
            lines_modified = 0
            
            # Használjunk difflib-et a pontos változások követéséhez
            import difflib
            differ = difflib.unified_diff(old_lines, new_lines, lineterm='')
            diff_lines = list(differ)
            
            for line in diff_lines:
                if line.startswith('+') and not line.startswith('+++'):
                    lines_added += 1
                elif line.startswith('-') and not line.startswith('---'):
                    lines_deleted += 1
            
            # Ha nincs sor változás, de volt csere, az módosítás
            if lines_added == 0 and lines_deleted == 0 and old_text != new_text:
                # Karakter szintű változás ugyanazon a soron - számoljuk módosított sornak
                lines_modified = old_text.count('\n') + 1
                # ⚠️ FONTOS: Állítsuk be a lines_added/deleted-et is, hogy ne szűrődjön ki!
                lines_added = lines_modified
                lines_deleted = lines_modified
            
            return ToolResult(
                success=True,
                result=f"Successfully applied edit to {path} ({occurrences} occurrence(s), +{lines_added}/-{lines_deleted} lines)",
                modified_files=[path],
                file_modifications=[FileModification(
                    path=path,
                    action="edit",
                    lines_added=lines_added,
                    lines_deleted=lines_deleted,
                    before_content=content,  # Teljes tartalom a diff-hez
                    after_content=new_content  # Teljes tartalom a diff-hez
                )]
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error applying edit: {str(e)}"
            )
    
    def _list_directory(self, path: str = "", recursive: bool = False) -> ToolResult:
        """List files in a directory."""
        resolved = self._resolve_path(path or ".")
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        if not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"Directory not found: {path}"
            )
        
        if not resolved.is_dir():
            return ToolResult(
                success=False,
                result="",
                error=f"Not a directory: {path}"
            )
        
        try:
            items = []
            
            if recursive:
                for item in resolved.rglob('*'):
                    # Skip blocked patterns
                    rel_path = str(item.relative_to(self.project_root))
                    skip = False
                    for pattern in self.BLOCKED_PATTERNS:
                        if re.search(pattern, rel_path):
                            skip = True
                            break
                    if skip:
                        continue
                    
                    if item.is_file():
                        items.append(f"📄 {rel_path}")
                    elif item.is_dir():
                        items.append(f"📁 {rel_path}/")
                    
                    # Limit results
                    if len(items) > 500:
                        items.append("... (truncated, too many files)")
                        break
            else:
                for item in sorted(resolved.iterdir()):
                    rel_path = str(item.relative_to(self.project_root))
                    
                    # Skip blocked patterns
                    skip = False
                    for pattern in self.BLOCKED_PATTERNS:
                        if re.search(pattern, rel_path):
                            skip = True
                            break
                    if skip:
                        continue
                    
                    if item.is_file():
                        size = item.stat().st_size
                        items.append(f"📄 {item.name} ({size} bytes)")
                    elif item.is_dir():
                        items.append(f"📁 {item.name}/")
            
            return ToolResult(
                success=True,
                result="\n".join(items) if items else "(empty directory)"
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error listing directory: {str(e)}"
            )
    
    def _search_in_files(self, pattern: str, path: str = "", file_pattern: str = "*") -> ToolResult:
        """Search for a pattern in files."""
        resolved = self._resolve_path(path or ".")
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        if not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"Path not found: {path}"
            )
        
        try:
            results = []
            files_searched = 0
            
            # Compile regex if it looks like one, otherwise use literal search
            try:
                regex = re.compile(pattern, re.IGNORECASE)
                use_regex = True
            except re.error:
                use_regex = False
            
            # Search in files
            search_path = resolved if resolved.is_dir() else resolved.parent
            glob_pattern = file_pattern if '*' in file_pattern else f"*{file_pattern}*"
            
            for file_path in search_path.rglob(glob_pattern):
                if not file_path.is_file():
                    continue
                
                # Skip blocked patterns
                rel_path = str(file_path.relative_to(self.project_root))
                skip = False
                for blocked in self.BLOCKED_PATTERNS:
                    if re.search(blocked, rel_path):
                        skip = True
                        break
                if skip:
                    continue
                
                # Skip binary files
                if file_path.suffix.lower() in self.SKIP_EXTENSIONS:
                    continue
                
                files_searched += 1
                
                try:
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    lines = content.split('\n')
                    
                    for line_num, line in enumerate(lines, 1):
                        match = regex.search(line) if use_regex else (pattern.lower() in line.lower())
                        if match:
                            results.append(f"{rel_path}:{line_num}: {line.strip()[:100]}")
                            
                            # Limit results per file
                            if len([r for r in results if r.startswith(rel_path)]) >= 10:
                                break
                except Exception:
                    continue
                
                # Limit total results
                if len(results) >= 100:
                    results.append(f"... (truncated, found 100+ matches)")
                    break
            
            if results:
                return ToolResult(
                    success=True,
                    result=f"Found {len(results)} matches in {files_searched} files:\n\n" + "\n".join(results)
                )
            else:
                return ToolResult(
                    success=True,
                    result=f"No matches found for '{pattern}' in {files_searched} files"
                )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error searching files: {str(e)}"
            )
    
    def _create_directory(self, path: str) -> ToolResult:
        """Create a new directory."""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        # 🔐 MANUAL MODE: Jóváhagyás kell könyvtár létrehozáshoz
        if not self.auto_mode:
            return ToolResult(
                success=False,
                result="",
                permission_required=True,
                permission_type="create_directory",
                permission_details={
                    "path": path,
                    "full_path": str(resolved),
                    "description": f"Könyvtár létrehozás: {path}",
                }
            )
        
        try:
            resolved.mkdir(parents=True, exist_ok=True)
            return ToolResult(
                success=True,
                result=f"Successfully created directory: {path}"
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error creating directory: {str(e)}"
            )
    
    def _delete_file(self, path: str) -> ToolResult:
        """Delete a file. ALWAYS requires permission!"""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        if not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"File not found: {path}"
            )
        
        if not resolved.is_file():
            return ToolResult(
                success=False,
                result="",
                error=f"Not a file (cannot delete directories this way): {path}"
            )
        
        # ALWAYS require permission for delete!
        return ToolResult(
            success=False,  # Not executed yet - waiting for permission
            result="",
            permission_required=True,
            permission_type="delete",
            permission_details={
                "path": path,
                "full_path": str(resolved),
                "size": resolved.stat().st_size,
            }
        )
    
    def delete_file_approved(self, path: str) -> ToolResult:
        """Delete file AFTER user approval."""
        resolved = self._resolve_path(path)
        if not resolved or not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"File not found: {path}"
            )
        
        try:
            resolved.unlink()
            return ToolResult(
                success=True,
                result=f"Successfully deleted: {path}",
                modified_files=[path]
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error deleting file: {str(e)}"
            )
    
    def write_file_approved(self, path: str, content: str) -> ToolResult:
        """Write file AFTER user approval (manual mode)."""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        try:
            # Eredeti tartalom mentése diff-hez
            original_content = ""
            is_new_file = True
            if resolved.exists():
                try:
                    original_content = resolved.read_text(encoding='utf-8', errors='ignore')
                    is_new_file = False
                except:
                    pass
            
            # Create parent directories if needed
            resolved.parent.mkdir(parents=True, exist_ok=True)
            
            # Write the file
            resolved.write_text(content, encoding='utf-8')
            
            # Diff számítás
            import difflib
            lines_added = 0
            lines_deleted = 0
            if is_new_file:
                lines_added = len(content.split('\n'))
            else:
                old_lines = original_content.split('\n')
                new_lines = content.split('\n')
                for line in difflib.unified_diff(old_lines, new_lines, lineterm=''):
                    if line.startswith('+') and not line.startswith('+++'):
                        lines_added += 1
                    elif line.startswith('-') and not line.startswith('---'):
                        lines_deleted += 1
            
            return ToolResult(
                success=True,
                result=f"Successfully wrote {len(content)} characters to {path} (+{lines_added}/-{lines_deleted})",
                modified_files=[path],
                file_modifications=[FileModification(
                    path=path,
                    action="create" if is_new_file else "write",
                    lines_added=lines_added,
                    lines_deleted=lines_deleted,
                    before_content=original_content if original_content else None,
                    after_content=content
                )]
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error writing file: {str(e)}"
            )
    
    def apply_edit_approved(self, path: str, old_text: str, new_text: str, expected_file_hash: str = None) -> ToolResult:
        """Apply edit AFTER user approval (manual mode)."""
        resolved = self._resolve_path(path)
        if not resolved or not resolved.exists():
            return ToolResult(
                success=False,
                result="",
                error=f"File not found: {path}"
            )
        
        # ⚠️ ELLENŐRZÉS: Ha old_text == new_text, az nem valódi módosítás!
        if old_text == new_text:
            return ToolResult(
                success=False,
                result="",
                error=f"⛔ HIBA: Az old_text és new_text UGYANAZ! Ez nem valódi módosítás!"
            )
        
        try:
            # Read current content
            content = resolved.read_text(encoding='utf-8')
            content = content.lstrip('\ufeff')  # Remove BOM
            
            # ⚠️ HASH ELLENŐRZÉS: Ellenőrizzük, hogy a fájl nem változott-e
            if expected_file_hash:
                import hashlib
                current_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
                if current_hash != expected_file_hash:
                    # A fájl változott! Ellenőrizzük, hogy a módosítás már alkalmazva van-e
                    if new_text in content and old_text not in content:
                        return ToolResult(
                            success=True,
                            result=f"✅ A fájl megváltozott, de a kért módosítás MÁR ALKALMAZVA van: {path}",
                            modified_files=[],
                            file_modifications=[]
                        )
                    elif old_text in content:
                        # A fájl változott, de az old_text még mindig ott van - folytathatjuk
                        safe_print(f"[APPLY_EDIT] Fájl változott, de old_text még mindig létezik, folytatjuk...")
                    else:
                        # A fájl változott és az old_text sem található
                        return ToolResult(
                            success=False,
                            result="",
                            error=f"⚠️ A fájl megváltozott, mióta az LLM olvasta!\n"
                                  f"Kérlek, futtass egy új validálást/elemzést, hogy a legfrissebb verzióval dolgozz.\n"
                                  f"Fájl: {path}"
                        )
            
            # Check if old_text exists
            if old_text not in content:
                # Próbáljuk megtalálni a hasonló szöveget (már javítva lett?)
                if new_text in content:
                    return ToolResult(
                        success=True,
                        result=f"✅ A módosítás már alkalmazva van a fájlban: {path}. A kért változtatás ({old_text[:50]}... → {new_text[:50]}...) már megtörtént!",
                        modified_files=[],
                        file_modifications=[]
                    )
                
                # Keressük a legközelebbi egyezést (első 30 karakter)
                search_snippet = old_text[:30] if len(old_text) > 30 else old_text
                similar_lines = [line for line in content.split('\n') if search_snippet[:15] in line]
                
                error_msg = f"A keresett szöveg nem található: {path}\n"
                error_msg += f"Keresett: '{old_text[:100]}{'...' if len(old_text) > 100 else ''}'\n"
                if similar_lines:
                    error_msg += f"Hasonló sorok a fájlban:\n"
                    for line in similar_lines[:3]:
                        error_msg += f"  - {line.strip()[:80]}\n"
                error_msg += "\nA fájl valószínűleg már módosult vagy a változtatás már alkalmazva lett."
                
                return ToolResult(
                    success=False,
                    result="",
                    error=error_msg
                )
            
            # Count occurrences
            occurrences = content.count(old_text)
            if occurrences > 1:
                new_content = content.replace(old_text, new_text, 1)
            else:
                new_content = content.replace(old_text, new_text)
            
            # Write back
            resolved.write_text(new_content, encoding='utf-8')
            
            # Diff számítás
            import difflib
            old_lines = content.split('\n')
            new_lines = new_content.split('\n')
            lines_added = 0
            lines_deleted = 0
            for line in difflib.unified_diff(old_lines, new_lines, lineterm=''):
                if line.startswith('+') and not line.startswith('+++'):
                    lines_added += 1
                elif line.startswith('-') and not line.startswith('---'):
                    lines_deleted += 1
            
            return ToolResult(
                success=True,
                result=f"Successfully applied edit to {path} ({occurrences} occurrence(s), +{lines_added}/-{lines_deleted})",
                modified_files=[path],
                file_modifications=[FileModification(
                    path=path,
                    action="edit",
                    lines_added=lines_added,
                    lines_deleted=lines_deleted,
                    before_content=content,
                    after_content=new_content
                )]
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error applying edit: {str(e)}"
            )
    
    def create_directory_approved(self, path: str) -> ToolResult:
        """Create directory AFTER user approval (manual mode)."""
        resolved = self._resolve_path(path)
        if not resolved:
            return ToolResult(
                success=False,
                result="",
                error=f"Invalid or blocked path: {path}"
            )
        
        try:
            resolved.mkdir(parents=True, exist_ok=True)
            return ToolResult(
                success=True,
                result=f"Successfully created directory: {path}"
            )
        except Exception as e:
            return ToolResult(
                success=False,
                result="",
                error=f"Error creating directory: {str(e)}"
            )


# =====================================
#   AGENTIC CHAT FUNCTION
# =====================================

# KONTEXTUS BUDGET - ezt MI kontrolláljuk, nem az API timeout!
MAX_CONTEXT_BUDGET = 25000  # 25K token - GYORSABB válaszokhoz
MAX_TOOL_RESULT_TOKENS = 2000  # Max token egy tool result-ra
MAX_SYSTEM_MSG_TOKENS = 8000  # Max token system üzenetekre
RESERVE_FOR_OUTPUT = 8000  # Rezervált token a válaszra


def _enforce_context_budget(messages: List[Dict], token_manager, budget: int = MAX_CONTEXT_BUDGET) -> List[Dict]:
    """
    KÖTELEZŐEN betartatja a kontextus budget-et.
    Soha nem engedünk túl nagy kontextust az LLM-hez!
    
    Prioritás (mit tartunk meg):
    1. Utolsó user üzenet (MINDIG)
    2. Utolsó 2-3 tool call/result pár
    3. System prompt (csonkolva ha kell)
    4. Korábbi history (összegezve/törölve)
    """
    if not token_manager:
        return messages
    
    current_tokens = token_manager.count_messages_tokens(messages)
    target_budget = budget - RESERVE_FOR_OUTPUT
    
    if current_tokens <= target_budget:
        return messages  # Nincs mit csinálni
    
    safe_print(f"[BUDGET] Context too large: {current_tokens} > {target_budget}, enforcing budget...")
    
    result = []
    tokens_used = 0
    
    # 1. SYSTEM ÜZENETEK - csonkolva ha kell
    system_msgs = [m for m in messages if m.get("role") == "system"]
    other_msgs = [m for m in messages if m.get("role") != "system"]
    
    system_budget = min(MAX_SYSTEM_MSG_TOKENS, target_budget // 3)
    system_tokens = 0
    
    for msg in system_msgs:
        msg_tokens = token_manager.count_tokens(msg.get("content", ""))
        if system_tokens + msg_tokens <= system_budget:
            result.append(msg)
            system_tokens += msg_tokens
        else:
            # Csonkoljuk a system message-et
            content = msg.get("content", "")
            available = system_budget - system_tokens
            if available > 500:  # Minimum 500 token kell
                # Karakterekre konvertálva (kb 4 char/token)
                max_chars = available * 3
                truncated = content[:max_chars] + "\n\n[... system message csonkolva a kontextus limit miatt ...]"
                result.append({**msg, "content": truncated})
                system_tokens += available
            break
    
    tokens_used = system_tokens
    remaining_budget = target_budget - tokens_used
    
    # 2. UTOLSÓ USER ÜZENET - kötelező
    user_msgs = [m for m in other_msgs if m.get("role") == "user"]
    if user_msgs:
        last_user = user_msgs[-1]
        last_user_tokens = token_manager.count_tokens(last_user.get("content", ""))
        result.append(last_user)
        tokens_used += last_user_tokens
        remaining_budget -= last_user_tokens
    
    # 3. TOOL CALL/RESULT párok - utolsó néhány
    tool_pairs = []
    i = 0
    while i < len(other_msgs):
        msg = other_msgs[i]
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            # Gyűjtsük össze a tool call-t és a hozzá tartozó result-okat
            pair = [msg]
            tool_call_ids = [tc.get("id") if isinstance(tc, dict) else tc.id for tc in msg.get("tool_calls", [])]
            
            j = i + 1
            while j < len(other_msgs):
                next_msg = other_msgs[j]
                if next_msg.get("role") == "tool" and next_msg.get("tool_call_id") in tool_call_ids:
                    pair.append(next_msg)
                    j += 1
                else:
                    break
            
            tool_pairs.append(pair)
            i = j
        else:
            i += 1
    
    # Utolsó 3 tool pair megtartása (csonkolva)
    kept_pairs = tool_pairs[-3:] if len(tool_pairs) > 3 else tool_pairs
    
    for pair in kept_pairs:
        pair_tokens = sum(token_manager.count_tokens(m.get("content", "") or "") for m in pair)
        
        if pair_tokens > MAX_TOOL_RESULT_TOKENS * 2:
            # Csonkoljuk a tool result-okat
            for m in pair:
                if m.get("role") == "tool":
                    content = m.get("content", "")
                    lines = content.split('\n')
                    if len(lines) > 60:
                        m["content"] = '\n'.join(lines[:30]) + \
                            f"\n\n... [{len(lines) - 60} sor kihagyva] ...\n\n" + \
                            '\n'.join(lines[-30:])
        
        if tokens_used + MAX_TOOL_RESULT_TOKENS * 2 <= target_budget:
            result.extend(pair)
            tokens_used += sum(token_manager.count_tokens(m.get("content", "") or "") for m in pair)
    
    # 4. ÖSSZEGZÉS hozzáadása ha sok mindent kidobtunk
    dropped_count = len(messages) - len(result)
    if dropped_count > 5:
        summary_msg = {
            "role": "system",
            "content": f"[KONTEXTUS ÖSSZEGZÉS: {dropped_count} korábbi üzenet eltávolítva a méret limit miatt. "
                       f"Folytatsd a munkát az utolsó tool eredmények alapján.]"
        }
        result.insert(len([m for m in result if m.get("role") == "system"]), summary_msg)
    
    final_tokens = token_manager.count_messages_tokens(result)
    safe_print(f"[BUDGET] Reduced: {current_tokens} -> {final_tokens} tokens ({len(messages)} -> {len(result)} messages)")
    
    return result


def _truncate_tool_results(messages: List[Dict], token_manager) -> List[Dict]:
    """
    Csonkolja a tool result-okat ha túl nagyok.
    """
    truncated = []
    for msg in messages:
        if msg.get("role") == "tool":
            content = msg.get("content", "")
            tokens = token_manager.count_tokens(content) if token_manager else len(content) // 4
            
            if tokens > MAX_TOOL_RESULT_TOKENS:
                lines = content.split('\n')
                if len(lines) > 80:
                    truncated_content = '\n'.join(lines[:40]) + \
                        f"\n\n... [{len(lines) - 80} sor kihagyva - tool result csonkolva] ...\n\n" + \
                        '\n'.join(lines[-40:])
                    msg = {**msg, "content": truncated_content}
                    safe_print(f"[AGENTIC] Truncated tool result: {tokens} -> ~{MAX_TOOL_RESULT_TOKENS} tokens")
        
        truncated.append(msg)
    
    return truncated


def run_agentic_chat(
    client,  # OpenAI client
    model: str,
    messages: List[Dict[str, Any]],
    project_root: str,
    max_iterations: int = 10,
    tools: List[Dict] = None,
    auto_mode: bool = True,  # Ha False (manual), minden írás jóváhagyást kér
) -> AgenticResult:
    """
    Run an agentic chat session with tool calling.
    
    The LLM can call tools (read_file, write_file, etc.) and the results
    are fed back until the LLM provides a final response.
    
    Args:
        client: OpenAI client instance
        model: Model name to use
        messages: Initial message history
        project_root: Root directory of the project
        max_iterations: Maximum number of tool calling iterations
        tools: Tool definitions (defaults to AGENTIC_TOOLS)
        auto_mode: Ha True, automatikus végrehajtás. Ha False (manual), minden írás jóváhagyást kér.
    
    Returns:
        AgenticResult with the final response and list of modified files
    """
    
    if tools is None:
        tools = AGENTIC_TOOLS
    
    safe_print(f"[AGENTIC] Mode: {'AUTO' if auto_mode else 'MANUAL'} (auto_mode={auto_mode})")
    executor = ToolExecutor(project_root, auto_mode=auto_mode)
    all_modified_files = []
    all_file_modifications: List[FileModification] = []  # Részletes módosítás infók
    pending_permissions = []  # Jóváhagyásra váró műveletek
    tool_calls_count = 0
    
    # Token manager inicializálás
    token_manager = None
    if HAS_TOKEN_MANAGER:
        try:
            token_manager = get_token_manager(model)
            safe_print(f"[AGENTIC] Token manager initialized for {model}")
        except Exception as e:
            safe_print(f"[AGENTIC] Token manager init error: {e}")
    
    # Work with a copy of messages
    working_messages = list(messages)
    
    # Initial token count
    if token_manager:
        initial_tokens = token_manager.count_messages_tokens(working_messages)
        safe_print(f"[AGENTIC] Initial context: {initial_tokens} tokens")
    
    for iteration in range(max_iterations):
        safe_print(f"[AGENTIC] Iteration {iteration + 1}/{max_iterations}, total tool calls: {tool_calls_count}")
        
        # 📊 KÖTELEZŐ BUDGET BETARTÁS - MINDEN iteráció előtt!
        if token_manager:
            # Először csonkoljuk a tool result-okat
            working_messages = _truncate_tool_results(working_messages, token_manager)
            
            # Aztán betartatjuk a teljes budget-et
            working_messages = _enforce_context_budget(working_messages, token_manager, MAX_CONTEXT_BUDGET)
            
            current_tokens = token_manager.count_messages_tokens(working_messages)
            available = MAX_CONTEXT_BUDGET - current_tokens
            safe_print(f"[AGENTIC] Context: {current_tokens}/{MAX_CONTEXT_BUDGET} tokens, Available: {available}")
        
        # Ha közeledünk a limithez, figyelmeztessük az LLM-et
        if iteration == max_iterations - 3:
            working_messages.append({
                "role": "user",
                "content": "⚠️ ATTENTION: You are approaching the iteration limit! Please finish your current task and provide a summary response. Do not start new chunks."
            })
        
        if iteration == max_iterations - 1:
            working_messages.append({
                "role": "user", 
                "content": "🛑 FINAL ITERATION! You MUST respond with a text summary now. No more tool calls allowed."
            })
        
        # Tool choice logic
        if iteration < 2:
            current_tool_choice = "required"
        elif iteration >= max_iterations - 2 or tool_calls_count > 25:
            # Az utolsó 2 iterációban vagy 25+ tool hívás után: FORCE text response
            current_tool_choice = "none"
        else:
            current_tool_choice = "auto"
        
        # 🔄 RATE LIMIT RETRY: Automatikus újrapróbálkozás rate limit hiba esetén
        max_retries = 3
        retry_delay = 2.0  # másodperc
        
        for attempt in range(max_retries):
            try:
                safe_print(f"[AGENTIC] Calling LLM with tool_choice={current_tool_choice}, tools={len(tools)} defined")
                response = client.chat.completions.create(
                    model=model,
                    messages=working_messages,
                    tools=tools,
                    tool_choice=current_tool_choice
                )
                safe_print(f"[AGENTIC] LLM response received, finish_reason={response.choices[0].finish_reason}")
                break  # Sikeres hívás, kilépünk a retry ciklusból
            except Exception as e:
                error_str = str(e)
                
                # Rate limit hiba detektálás
                if "429" in error_str or "rate_limit" in error_str.lower() or "Rate limit" in error_str:
                    if attempt < max_retries - 1:
                        wait_time = retry_delay * (2 ** attempt)  # Exponential backoff: 2s, 4s, 8s
                        safe_print(f"[AGENTIC] ⚠️ Rate limit! Várakozás {wait_time:.1f}s... (próba {attempt + 1}/{max_retries})")
                        import time
                        time.sleep(wait_time)
                        continue  # Újrapróbálkozás
                    else:
                        safe_print(f"[AGENTIC] ❌ Rate limit - max újrapróbálkozás elérve!")
                
                import traceback
                safe_print(f"[AGENTIC] LLM API error: {e}")
                print(traceback.format_exc())
                return AgenticResult(
                    success=False,
                    response="",
                    error=f"LLM API error: {str(e)}",
                    pending_permissions=pending_permissions
                )
        else:
            # Ha a for ciklus végigfutott break nélkül (ez nem történhet meg, de biztonság kedvéért)
            return AgenticResult(
                success=False,
                response="",
                error="LLM API error: Max retries exceeded",
                pending_permissions=pending_permissions
            )
        
        choice = response.choices[0]
        message = choice.message
        
        # Debug: log what we got
        has_tool_calls = bool(message.tool_calls)
        content_preview = (message.content or "")[:200] if message.content else "(no content)"
        safe_print(f"[AGENTIC] Response: has_tool_calls={has_tool_calls}, content_preview={content_preview}")
        
        if message.tool_calls:
            safe_print(f"[AGENTIC] Got {len(message.tool_calls)} tool call(s)")
        
        # Check if we have tool calls
        if message.tool_calls:
            # Add the assistant's message with tool calls
            working_messages.append({
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    }
                    for tc in message.tool_calls
                ]
            })
            
            # Execute each tool call
            for tool_call in message.tool_calls:
                tool_calls_count += 1
                tool_name = tool_call.function.name
                
                try:
                    arguments = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    arguments = {}
                
                safe_print(f"[AGENTIC] Tool call: {tool_name}({arguments})")
                
                # Execute the tool
                result = executor.execute(tool_name, arguments)
                
                # Handle permission_required results
                if result.permission_required:
                    safe_print(f"[AGENTIC] Permission required for {tool_name}: {result.permission_type}")
                    
                    # Deduplikáció - ne adjunk hozzá azonos permission-t kétszer
                    is_duplicate = False
                    for existing in pending_permissions:
                        if (existing["tool_name"] == tool_name and 
                            existing["permission_type"] == result.permission_type and
                            existing.get("arguments") == arguments):
                            is_duplicate = True
                            safe_print(f"[AGENTIC] Skipping duplicate permission request for {tool_name}")
                            break
                    
                    if not is_duplicate:
                        # Az arguments-be kerüljön bele a permission_details is (pl. file_hash)
                        extended_arguments = {**arguments}
                        if result.permission_details:
                            # Ha van file_hash vagy más fontos adat, adjuk hozzá
                            if "file_hash" in result.permission_details:
                                extended_arguments["file_hash"] = result.permission_details["file_hash"]
                            if "content" in result.permission_details:
                                extended_arguments["content"] = result.permission_details["content"]
                        
                        pending_permissions.append({
                            "tool_call_id": tool_call.id,
                            "tool_name": tool_name,
                            "permission_type": result.permission_type,
                            "details": result.permission_details,
                            "arguments": extended_arguments,
                        })
                    # Tell the LLM that permission is pending
                    tool_result_content = f"[PERMISSION_REQUIRED] This action requires user approval: {result.permission_type}. Details: {json.dumps(result.permission_details)}. The user will be asked to approve this action."
                    working_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": tool_result_content
                    })
                    safe_print(f"[AGENTIC] Added permission request for {tool_name}")
                    continue
                
                # Track modified files
                if result.modified_files:
                    for f in result.modified_files:
                        if f not in all_modified_files:
                            all_modified_files.append(f)
                
                # Track detailed file modifications
                if result.file_modifications:
                    all_file_modifications.extend(result.file_modifications)
                
                # Add tool result to messages
                if result.success:
                    tool_result_content = result.result
                else:
                    tool_result_content = f"Error: {result.error}"
                
                working_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": tool_result_content
                })
                
                safe_print(f"[AGENTIC] Tool result: {'success' if result.success else 'error'}")
        
        else:
            # No tool calls - this might be the final response OR the LLM being lazy
            final_response = message.content or ""
            
            safe_print(f"[AGENTIC] No tool calls in response after {tool_calls_count} total calls")
            
            # Ha az LLM leírja a változásokat ahelyett hogy megcsinálná, kényszerítsük a tool használatra
            lazy_patterns = [
                # English patterns
                "would change", "would translate", "would modify", "would fix", "would add", "would remove",
                "I suggest", "I recommend", "should be changed", "needs to be", "could be improved",
                "here's the fix", "here is the fix", "the fix is", "change this to",
                "```javascript", "```js", "```python", "```", # Code blocks without execution
                "→", "->",  # Translation arrows
                "// Hungarian", "// English",  # Describing translations
                "[CODE_CHANGE]", "ORIGINAL:", "MODIFIED:",  # Old format
                # Hungarian patterns
                "változtatnám", "módosítanám", "cserélném", "javítanám",
                "kellene változtatni", "kellene módosítani", "kellene cserélni",
                "javaslom", "ajánlom", "érdemes lenne",
                "itt a javítás", "a javítás:", "módosítsd",
            ]
            
            # Ellenőrizzük, hogy van-e kód blokk a válaszban (markdown fence)
            has_code_block = "```" in final_response and final_response.count("```") >= 2
            is_lazy_response = any(pattern.lower() in final_response.lower() for pattern in lazy_patterns) or has_code_block
            
            if is_lazy_response and iteration < max_iterations - 1 and tool_calls_count < 5:
                safe_print(f"[AGENTIC] ⚠️ Detected lazy response (describing instead of executing) - forcing tool usage!")
                # Add a strong reminder to use tools
                working_messages.append({
                    "role": "assistant",
                    "content": final_response
                })
                working_messages.append({
                    "role": "user",
                    "content": """⛔ STOP! You DESCRIBED changes but didn't EXECUTE them!

I see code blocks or suggestions in your response. This is WRONG!

You MUST call apply_edit() NOW to actually make the changes!

Example:
apply_edit("file.js", "old text from file", "new corrected text")

DO NOT write code blocks! DO NOT describe! Just CALL apply_edit() for each fix!

EXECUTE NOW!"""
                })
                continue  # Go to next iteration with tool_choice
            
            safe_print(f"[AGENTIC] Final response received after {tool_calls_count} tool calls")
            
            # Build modified files info with detailed diff data
            # ⚠️ FONTOS: Csak VALÓBAN módosított fájlokat adjunk vissza (lines_added > 0 VAGY lines_deleted > 0)
            modified_files_info = []
            for mod in all_file_modifications:
                # Csak akkor adjuk hozzá, ha tényleg történt változás
                if mod.lines_added > 0 or mod.lines_deleted > 0:
                    modified_files_info.append({
                        "path": mod.path,
                        "action": mod.action,
                        "lines_added": mod.lines_added,
                        "lines_deleted": mod.lines_deleted,
                        "before_content": mod.before_content,
                        "after_content": mod.after_content,
                    })
            
            # Ha vannak extra fájlok amiket nem követtünk részletesen
            # ⚠️ NE adjunk hozzá 0 változással rendelkező fájlokat!
            # Ezek valószínűleg "már alkalmazva" státuszúak
            # for file_path in all_modified_files:
            #     if not any(m["path"] == file_path for m in modified_files_info):
            #         modified_files_info.append({...})
            
            return AgenticResult(
                success=True,
                response=final_response,
                modified_files=modified_files_info,
                tool_calls_count=tool_calls_count,
                pending_permissions=pending_permissions
            )
    
    # Max iterations reached - ugyanaz a részletes info
    # ⚠️ FONTOS: Csak VALÓBAN módosított fájlokat adjunk vissza
    modified_files_info = []
    for mod in all_file_modifications:
        # Csak akkor adjuk hozzá, ha tényleg történt változás
        if mod.lines_added > 0 or mod.lines_deleted > 0:
            modified_files_info.append({
                "path": mod.path,
                "action": mod.action,
                "lines_added": mod.lines_added,
                "lines_deleted": mod.lines_deleted,
                "before_content": mod.before_content,
                "after_content": mod.after_content,
            })
    # ⚠️ NE adjunk hozzá 0 változással rendelkező fájlokat!
    
    return AgenticResult(
        success=False,
        response="",
        error=f"Max iterations ({max_iterations}) reached without final response",
        modified_files=modified_files_info,
        tool_calls_count=tool_calls_count,
        pending_permissions=pending_permissions
    )

