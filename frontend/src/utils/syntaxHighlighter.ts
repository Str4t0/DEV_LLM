// frontend/src/utils/syntaxHighlighter.ts
// Multi-Language Syntax Highlighter - Regex-based

import { highlightPLIWasm } from './pliWasmHighlighter';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface HighlightToken {
  text: string;
  type: TokenCategory;
  start?: number;
  end?: number;
}

export type TokenCategory = 
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'operator'
  | 'preprocessor'
  | 'builtin'
  | 'function'
  | 'type'
  | 'variable'
  | 'property'
  | 'punctuation'
  | 'tag'
  | 'attribute'
  | 'normal';

export type SupportedLanguage = 
  // Mainframe
  | 'pli' | 'cobol' | 'jcl' | 'rexx'
  // Web
  | 'javascript' | 'typescript' | 'tsx' | 'jsx'
  | 'html' | 'css' | 'scss'
  // Backend
  | 'python' | 'java' | 'c' | 'cpp' | 'csharp'
  | 'rust' | 'go' | 'php' | 'ruby' | 'swift' | 'kotlin'
  // Data/Config
  | 'sql' | 'json' | 'yaml' | 'toml' | 'xml'
  | 'markdown'
  // Shell
  | 'bash' | 'powershell'
  | 'unknown';

// ═══════════════════════════════════════════════════════════════
// LANGUAGE DETECTION
// ═══════════════════════════════════════════════════════════════

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  // Mainframe
  '.pli': 'pli', '.pl1': 'pli', '.pli1': 'pli',
  '.cob': 'cobol', '.cbl': 'cobol', '.cobol': 'cobol',
  '.jcl': 'jcl', '.proc': 'jcl',
  '.rexx': 'rexx', '.rex': 'rexx',
  
  // Web
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.mts': 'typescript',
  '.tsx': 'tsx', '.jsx': 'jsx',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.sass': 'scss',
  
  // Backend
  '.py': 'python', '.pyw': 'python',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rs': 'rust',
  '.go': 'go',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.kt': 'kotlin', '.kts': 'kotlin',
  
  // Data/Config
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.md': 'markdown',
  
  // Shell
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
  '.ps1': 'powershell', '.psm1': 'powershell',
  '.bat': 'bash', '.cmd': 'bash',
};

export function detectLanguage(filename: string | null, content?: string): SupportedLanguage {
  if (filename) {
    const lower = filename.toLowerCase();
    for (const [ext, lang] of Object.entries(EXTENSION_MAP)) {
      if (lower.endsWith(ext)) {
        return lang;
      }
    }
  }
  
  if (content) {
    const firstLine = content.split('\n')[0] || '';
    
    // Shebang
    if (firstLine.startsWith('#!/')) {
      if (firstLine.includes('python')) return 'python';
      if (firstLine.includes('node')) return 'javascript';
      if (firstLine.includes('bash') || firstLine.includes('sh')) return 'bash';
      if (firstLine.includes('ruby')) return 'ruby';
      if (firstLine.includes('php')) return 'php';
    }
    
    // PL/I detection
    if (firstLine.match(/^\*PROCESS/i) || content.match(/\bPROC\s+OPTIONS\s*\(/i)) {
      return 'pli';
    }
    
    // COBOL detection
    if (content.match(/IDENTIFICATION\s+DIVISION/i)) {
      return 'cobol';
    }
    
    // JCL detection
    if (firstLine.match(/^\/\/\w+\s+JOB/)) {
      return 'jcl';
    }
  }
  
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════
// LANGUAGE-SPECIFIC KEYWORDS
// ═══════════════════════════════════════════════════════════════

const LANGUAGE_KEYWORDS: Record<SupportedLanguage, string[]> = {
  'javascript': [
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
    'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of',
    'return', 'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof',
    'var', 'void', 'while', 'with', 'yield', 'true', 'false', 'null', 'undefined',
    'NaN', 'Infinity', 'from', 'as'
  ],
  'typescript': [
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
    'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of',
    'return', 'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof',
    'var', 'void', 'while', 'with', 'yield', 'true', 'false', 'null', 'undefined',
    'interface', 'type', 'enum', 'namespace', 'module', 'declare', 'abstract',
    'implements', 'private', 'protected', 'public', 'readonly', 'as', 'is',
    'keyof', 'never', 'any', 'unknown', 'infer', 'from'
  ],
  'tsx': [], // Uses typescript
  'jsx': [], // Uses javascript
  'python': [
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
    'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
    'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass',
    'raise', 'return', 'try', 'while', 'with', 'yield', 'True', 'False', 'None',
    'self', 'cls'
  ],
  'java': [
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
    'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
    'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
    'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package',
    'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
    'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient',
    'try', 'void', 'volatile', 'while', 'true', 'false', 'null'
  ],
  'c': [
    'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
    'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline',
    'int', 'long', 'register', 'restrict', 'return', 'short', 'signed', 'sizeof',
    'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void',
    'volatile', 'while', '_Bool', '_Complex', '_Imaginary', 'NULL', 'true', 'false'
  ],
  'cpp': [
    'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor',
    'bool', 'break', 'case', 'catch', 'char', 'char16_t', 'char32_t', 'class',
    'compl', 'const', 'constexpr', 'const_cast', 'continue', 'decltype', 'default',
    'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit', 'export',
    'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int',
    'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq', 'nullptr',
    'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'register',
    'reinterpret_cast', 'return', 'short', 'signed', 'sizeof', 'static',
    'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this',
    'thread_local', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename',
    'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'wchar_t',
    'while', 'xor', 'xor_eq', 'NULL'
  ],
  'csharp': [
    'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
    'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
    'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
    'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
    'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
    'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
    'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
    'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
    'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
    'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while', 'var',
    'async', 'await', 'dynamic', 'nameof', 'when', 'where', 'yield'
  ],
  'rust': [
    'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else',
    'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop',
    'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self',
    'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use',
    'where', 'while', 'abstract', 'become', 'box', 'do', 'final', 'macro',
    'override', 'priv', 'try', 'typeof', 'unsized', 'virtual', 'yield'
  ],
  'go': [
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
    'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
    'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
    'var', 'true', 'false', 'nil', 'iota', 'append', 'cap', 'close', 'complex',
    'copy', 'delete', 'imag', 'len', 'make', 'new', 'panic', 'print', 'println',
    'real', 'recover'
  ],
  'php': [
    'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch',
    'class', 'clone', 'const', 'continue', 'declare', 'default', 'die', 'do',
    'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach',
    'endif', 'endswitch', 'endwhile', 'eval', 'exit', 'extends', 'final',
    'finally', 'fn', 'for', 'foreach', 'function', 'global', 'goto', 'if',
    'implements', 'include', 'include_once', 'instanceof', 'insteadof', 'interface',
    'isset', 'list', 'match', 'namespace', 'new', 'or', 'print', 'private',
    'protected', 'public', 'require', 'require_once', 'return', 'static',
    'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor',
    'yield', 'true', 'false', 'null', 'self', 'parent'
  ],
  'ruby': [
    'BEGIN', 'END', 'alias', 'and', 'begin', 'break', 'case', 'class', 'def',
    'defined?', 'do', 'else', 'elsif', 'end', 'ensure', 'false', 'for', 'if',
    'in', 'module', 'next', 'nil', 'not', 'or', 'redo', 'rescue', 'retry',
    'return', 'self', 'super', 'then', 'true', 'undef', 'unless', 'until',
    'when', 'while', 'yield', '__FILE__', '__LINE__', '__ENCODING__',
    'attr', 'attr_reader', 'attr_writer', 'attr_accessor', 'private', 'protected',
    'public', 'require', 'require_relative', 'include', 'extend', 'raise', 'lambda', 'proc'
  ],
  'swift': [
    'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate',
    'func', 'import', 'init', 'inout', 'internal', 'let', 'open', 'operator',
    'private', 'protocol', 'public', 'rethrows', 'static', 'struct', 'subscript',
    'typealias', 'var', 'break', 'case', 'continue', 'default', 'defer', 'do',
    'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return',
    'switch', 'where', 'while', 'as', 'Any', 'catch', 'false', 'is', 'nil',
    'super', 'self', 'Self', 'throw', 'throws', 'true', 'try', '#available',
    '#colorLiteral', '#column', '#else', '#elseif', '#endif', '#error', '#file',
    '#fileLiteral', '#function', '#if', '#imageLiteral', '#line', '#selector',
    '#sourceLocation', '#warning', 'async', 'await'
  ],
  'kotlin': [
    'abstract', 'annotation', 'as', 'break', 'by', 'catch', 'class', 'companion',
    'const', 'constructor', 'continue', 'crossinline', 'data', 'delegate', 'do',
    'dynamic', 'else', 'enum', 'expect', 'external', 'false', 'final', 'finally',
    'for', 'fun', 'get', 'if', 'import', 'in', 'infix', 'init', 'inline', 'inner',
    'interface', 'internal', 'is', 'lateinit', 'noinline', 'null', 'object', 'open',
    'operator', 'out', 'override', 'package', 'private', 'protected', 'public',
    'reified', 'return', 'sealed', 'set', 'super', 'suspend', 'tailrec', 'this',
    'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'vararg', 'when',
    'where', 'while'
  ],
  'sql': [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'INSERT', 'INTO', 'VALUES',
    'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX',
    'VIEW', 'DATABASE', 'SCHEMA', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
    'UNIQUE', 'CHECK', 'DEFAULT', 'NULL', 'NOT', 'AUTO_INCREMENT', 'IDENTITY',
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'AS',
    'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'TOP',
    'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'IF', 'EXISTS', 'IN', 'BETWEEN', 'LIKE', 'IS', 'UNION',
    'ALL', 'INTERSECT', 'EXCEPT', 'TRUE', 'FALSE', 'TRIGGER', 'PROCEDURE',
    'FUNCTION', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'DECLARE',
    'CURSOR', 'FETCH', 'OPEN', 'CLOSE', 'INT', 'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'FLOAT', 'DOUBLE', 'DECIMAL',
    'BLOB', 'CLOB', 'SERIAL', 'BIGINT', 'SMALLINT', 'TINYINT'
  ],
  'bash': [
    'if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for', 'while', 'until',
    'do', 'done', 'in', 'function', 'select', 'time', 'coproc', 'return', 'exit',
    'break', 'continue', 'declare', 'local', 'export', 'readonly', 'typeset',
    'unset', 'shift', 'source', 'alias', 'unalias', 'set', 'shopt', 'trap',
    'true', 'false', 'echo', 'printf', 'read', 'cd', 'pwd', 'pushd', 'popd',
    'dirs', 'let', 'eval', 'exec', 'test'
  ],
  'powershell': [
    'Begin', 'Break', 'Catch', 'Class', 'Continue', 'Data', 'Define', 'Do',
    'DynamicParam', 'Else', 'ElseIf', 'End', 'Exit', 'Filter', 'Finally', 'For',
    'ForEach', 'From', 'Function', 'If', 'In', 'InlineScript', 'Parallel',
    'Param', 'Process', 'Return', 'Sequence', 'Switch', 'Throw', 'Trap', 'Try',
    'Until', 'Using', 'Var', 'While', 'Workflow', 'True', 'False', 'Null'
  ],
  'json': [],
  'yaml': ['true', 'false', 'null', 'yes', 'no', 'on', 'off'],
  'toml': ['true', 'false'],
  'xml': [],
  'html': [],
  'css': [
    'important', 'inherit', 'initial', 'unset', 'none', 'auto', 'block', 'inline',
    'flex', 'grid', 'absolute', 'relative', 'fixed', 'sticky', 'static'
  ],
  'scss': [],
  'markdown': [],
  'pli': [], // Handled by custom lexer
  'cobol': [
    'IDENTIFICATION', 'DIVISION', 'PROGRAM-ID', 'AUTHOR', 'DATE-WRITTEN',
    'ENVIRONMENT', 'CONFIGURATION', 'SECTION', 'SOURCE-COMPUTER', 'OBJECT-COMPUTER',
    'INPUT-OUTPUT', 'FILE-CONTROL', 'SELECT', 'ASSIGN', 'DATA', 'FILE', 'WORKING-STORAGE',
    'LINKAGE', 'PROCEDURE', 'USING', 'CALL', 'PERFORM', 'MOVE', 'ADD', 'SUBTRACT',
    'MULTIPLY', 'DIVIDE', 'COMPUTE', 'IF', 'ELSE', 'END-IF', 'EVALUATE', 'WHEN',
    'END-EVALUATE', 'READ', 'WRITE', 'OPEN', 'CLOSE', 'DISPLAY', 'ACCEPT', 'STOP',
    'RUN', 'GOBACK', 'EXIT', 'RETURN', 'GO', 'TO', 'THRU', 'THROUGH', 'UNTIL',
    'VARYING', 'FROM', 'BY', 'NOT', 'AND', 'OR', 'EQUAL', 'GREATER', 'LESS', 'THAN',
    'PIC', 'PICTURE', 'VALUE', 'SPACES', 'ZEROS', 'HIGH-VALUES', 'LOW-VALUES',
    'REDEFINES', 'OCCURS', 'TIMES', 'INDEXED', 'FILLER', 'COPY', 'REPLACING'
  ],
  'jcl': [
    'JOB', 'EXEC', 'DD', 'PROC', 'PEND', 'SET', 'IF', 'THEN', 'ELSE', 'ENDIF',
    'INCLUDE', 'JCLLIB', 'ORDER', 'OUTPUT', 'XMIT', 'PGM', 'DSN', 'DISP', 'SPACE',
    'DCB', 'UNIT', 'VOL', 'SER', 'SYSOUT', 'DUMMY', 'COND', 'REGION', 'TIME',
    'CLASS', 'MSGCLASS', 'MSGLEVEL', 'NOTIFY', 'TYPRUN', 'SCAN', 'COPY', 'HOLD',
    'NEW', 'OLD', 'SHR', 'MOD', 'CATLG', 'DELETE', 'KEEP', 'PASS', 'UNCATLG',
    'LRECL', 'RECFM', 'BLKSIZE', 'DSORG', 'STEPLIB', 'JOBLIB', 'SYSIN', 'SYSPRINT',
    'SYSUDUMP', 'SYSABEND', 'CEEDUMP', 'PARM'
  ],
  'rexx': [
    'ADDRESS', 'ARG', 'CALL', 'DO', 'DROP', 'END', 'EXIT', 'IF', 'INTERPRET',
    'ITERATE', 'LEAVE', 'NOP', 'NUMERIC', 'OPTIONS', 'PARSE', 'PROCEDURE',
    'PULL', 'PUSH', 'QUEUE', 'RETURN', 'SAY', 'SELECT', 'SIGNAL', 'TRACE',
    'UPPER', 'THEN', 'ELSE', 'WHEN', 'OTHERWISE', 'WHILE', 'UNTIL', 'FOREVER',
    'TO', 'BY', 'FOR', 'WITH', 'EXPOSE', 'VALUE', 'VAR', 'SOURCE', 'VERSION',
    'LINEIN', 'LINEOUT', 'LINES', 'CHARIN', 'CHAROUT', 'CHARS', 'STREAM',
    'ABBREV', 'ABS', 'BITAND', 'BITOR', 'BITXOR', 'CENTER', 'CENTRE', 'COMPARE',
    'COPIES', 'DATATYPE', 'DATE', 'DELSTR', 'DELWORD', 'DIGITS', 'ERRORTEXT',
    'FORM', 'FORMAT', 'FUZZ', 'INSERT', 'LASTPOS', 'LEFT', 'LENGTH', 'MAX',
    'MIN', 'OVERLAY', 'POS', 'QUEUED', 'RANDOM', 'REVERSE', 'RIGHT', 'SIGN',
    'SOURCELINE', 'SPACE', 'STRIP', 'SUBSTR', 'SUBWORD', 'SYMBOL', 'TIME',
    'TRANSLATE', 'TRUNC', 'VERIFY', 'WORD', 'WORDINDEX', 'WORDLENGTH', 'WORDPOS', 'WORDS'
  ],
  'unknown': []
};

const BUILTIN_FUNCTIONS: Partial<Record<SupportedLanguage, string[]>> = {
  'javascript': [
    'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
    'Date', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise',
    'Symbol', 'Proxy', 'Reflect', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch',
    'alert', 'confirm', 'prompt', 'document', 'window', 'localStorage', 'sessionStorage'
  ],
  'typescript': [
    'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
    'Date', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise',
    'Symbol', 'Proxy', 'Reflect', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'
  ],
  'python': [
    'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple',
    'bool', 'type', 'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr',
    'delattr', 'callable', 'iter', 'next', 'enumerate', 'zip', 'map', 'filter',
    'sorted', 'reversed', 'min', 'max', 'sum', 'abs', 'round', 'pow', 'divmod',
    'ord', 'chr', 'hex', 'oct', 'bin', 'format', 'repr', 'input', 'open', 'file',
    'super', 'property', 'classmethod', 'staticmethod', 'object', 'Exception'
  ]
};

const TYPE_KEYWORDS: Partial<Record<SupportedLanguage, string[]>> = {
  'typescript': [
    'string', 'number', 'boolean', 'void', 'null', 'undefined', 'any', 'never',
    'unknown', 'object', 'symbol', 'bigint', 'Array', 'Promise', 'Record',
    'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract',
    'ReturnType', 'Parameters', 'InstanceType', 'ThisType'
  ],
  'java': [
    'String', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'Character',
    'Byte', 'Short', 'Object', 'Class', 'Void', 'Number', 'List', 'Map', 'Set',
    'ArrayList', 'HashMap', 'HashSet', 'LinkedList', 'TreeMap', 'TreeSet',
    'Collection', 'Iterable', 'Iterator', 'Comparable', 'Runnable', 'Callable',
    'Thread', 'Exception', 'RuntimeException', 'Throwable'
  ],
  'csharp': [
    'String', 'Int32', 'Int64', 'Double', 'Single', 'Boolean', 'Char', 'Byte',
    'Object', 'Type', 'Void', 'List', 'Dictionary', 'HashSet', 'Queue', 'Stack',
    'IEnumerable', 'IEnumerator', 'IList', 'IDictionary', 'ICollection',
    'Task', 'Action', 'Func', 'Predicate', 'EventHandler', 'Exception'
  ]
};

// ═══════════════════════════════════════════════════════════════
// REGEX-BASED TOKENIZER
// ═══════════════════════════════════════════════════════════════

interface TokenPattern {
  pattern: RegExp;
  type: TokenCategory;
}

function getLanguagePatterns(lang: SupportedLanguage): TokenPattern[] {
  const patterns: TokenPattern[] = [];
  
  // Comments - language specific
  switch (lang) {
    case 'python':
    case 'bash':
    case 'yaml':
    case 'toml':
      patterns.push({ pattern: /#.*$/gm, type: 'comment' });
      break;
    case 'sql':
      patterns.push({ pattern: /--.*$/gm, type: 'comment' });
      patterns.push({ pattern: /\/\*[\s\S]*?\*\//g, type: 'comment' });
      break;
    case 'html':
    case 'xml':
      patterns.push({ pattern: /<!--[\s\S]*?-->/g, type: 'comment' });
      break;
    case 'css':
    case 'scss':
      patterns.push({ pattern: /\/\*[\s\S]*?\*\//g, type: 'comment' });
      break;
    case 'cobol':
      patterns.push({ pattern: /^\*.*$/gm, type: 'comment' });
      patterns.push({ pattern: /^.{6}\*.*$/gm, type: 'comment' });
      break;
    case 'jcl':
      patterns.push({ pattern: /\/\/\*.*$/gm, type: 'comment' });
      break;
    case 'rexx':
      patterns.push({ pattern: /\/\*[\s\S]*?\*\//g, type: 'comment' });
      break;
    default:
      // C-style comments
      patterns.push({ pattern: /\/\/.*$/gm, type: 'comment' });
      patterns.push({ pattern: /\/\*[\s\S]*?\*\//g, type: 'comment' });
  }
  
  // Strings
  switch (lang) {
    case 'python':
      patterns.push({ pattern: /"""[\s\S]*?"""/g, type: 'string' });
      patterns.push({ pattern: /'''[\s\S]*?'''/g, type: 'string' });
      patterns.push({ pattern: /f"(?:[^"\\]|\\.)*"/g, type: 'string' });
      patterns.push({ pattern: /f'(?:[^'\\]|\\.)*'/g, type: 'string' });
      patterns.push({ pattern: /r"(?:[^"\\]|\\.)*"/g, type: 'string' });
      patterns.push({ pattern: /r'(?:[^'\\]|\\.)*'/g, type: 'string' });
      patterns.push({ pattern: /"(?:[^"\\]|\\.)*"/g, type: 'string' });
      patterns.push({ pattern: /'(?:[^'\\]|\\.)*'/g, type: 'string' });
      break;
    case 'javascript':
    case 'typescript':
    case 'tsx':
    case 'jsx':
      patterns.push({ pattern: /`(?:[^`\\]|\\.|\$\{[^}]*\})*`/g, type: 'string' });
      patterns.push({ pattern: /"(?:[^"\\]|\\.)*"/g, type: 'string' });
      patterns.push({ pattern: /'(?:[^'\\]|\\.)*'/g, type: 'string' });
      break;
    case 'sql':
      patterns.push({ pattern: /'(?:[^']|'')*'/g, type: 'string' });
      break;
    default:
      patterns.push({ pattern: /"(?:[^"\\]|\\.)*"/g, type: 'string' });
      patterns.push({ pattern: /'(?:[^'\\]|\\.)*'/g, type: 'string' });
  }
  
  // Numbers
  patterns.push({ pattern: /\b0x[0-9a-fA-F]+\b/g, type: 'number' });
  patterns.push({ pattern: /\b0b[01]+\b/g, type: 'number' });
  patterns.push({ pattern: /\b0o[0-7]+\b/g, type: 'number' });
  patterns.push({ pattern: /\b\d+\.?\d*([eE][+-]?\d+)?\b/g, type: 'number' });
  
  // Preprocessor (for C/C++)
  if (['c', 'cpp'].includes(lang)) {
    patterns.push({ pattern: /^\s*#\s*\w+.*$/gm, type: 'preprocessor' });
  }
  
  // Decorators (Python, Java, TypeScript)
  if (['python', 'java', 'typescript', 'kotlin'].includes(lang)) {
    patterns.push({ pattern: /@\w+/g, type: 'preprocessor' });
  }
  
  // HTML/JSX tags
  if (['html', 'xml', 'tsx', 'jsx'].includes(lang)) {
    patterns.push({ pattern: /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s|>|\/)/g, type: 'tag' });
    patterns.push({ pattern: /\s[a-zA-Z][a-zA-Z0-9-]*(?==)/g, type: 'attribute' });
  }
  
  // CSS properties
  if (['css', 'scss'].includes(lang)) {
    patterns.push({ pattern: /[a-z-]+(?=\s*:)/g, type: 'property' });
  }
  
  // Operators
  patterns.push({ pattern: /[+\-*/%=<>!&|^~?:]+/g, type: 'operator' });
  
  // Punctuation
  patterns.push({ pattern: /[{}()\[\];,\.]/g, type: 'punctuation' });
  
  return patterns;
}

// ═══════════════════════════════════════════════════════════════
// MAIN TOKENIZER
// ═══════════════════════════════════════════════════════════════

function tokenize(code: string, lang: SupportedLanguage): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const patterns = getLanguagePatterns(lang);
  
  // Build keywords regex
  let keywords = LANGUAGE_KEYWORDS[lang] || [];
  if (lang === 'tsx') keywords = [...LANGUAGE_KEYWORDS['typescript']];
  if (lang === 'jsx') keywords = [...LANGUAGE_KEYWORDS['javascript']];
  
  const builtins = BUILTIN_FUNCTIONS[lang] || [];
  const types = TYPE_KEYWORDS[lang] || [];
  
  // Create a map to track which characters are already tokenized
  const tokenized = new Array(code.length).fill(false);
  const tokenMap: { start: number; end: number; type: TokenCategory }[] = [];
  
  // Apply patterns in priority order
  for (const { pattern, type } of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(code)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      // Check if this region is already tokenized
      let overlap = false;
      for (let i = start; i < end; i++) {
        if (tokenized[i]) {
          overlap = true;
          break;
        }
      }
      
      if (!overlap) {
        tokenMap.push({ start, end, type });
        for (let i = start; i < end; i++) {
          tokenized[i] = true;
        }
      }
    }
  }
  
  // Find keywords, builtins, and types in remaining text
  const wordPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  let match;
  
  while ((match = wordPattern.exec(code)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const word = match[0];
    
    // Check if already tokenized
    if (tokenized[start]) continue;
    
    let type: TokenCategory = 'normal';
    
    if (keywords.includes(word) || (lang === 'sql' && keywords.includes(word.toUpperCase()))) {
      type = 'keyword';
    } else if (builtins.includes(word)) {
      type = 'builtin';
    } else if (types.includes(word)) {
      type = 'type';
    } else if (code[end] === '(') {
      type = 'function';
    }
    
    if (type !== 'normal') {
      tokenMap.push({ start, end, type });
      for (let i = start; i < end; i++) {
        tokenized[i] = true;
      }
    }
  }
  
  // Sort by start position
  tokenMap.sort((a, b) => a.start - b.start);
  
  // Build final token list
  let lastEnd = 0;
  for (const { start, end, type } of tokenMap) {
    // Add normal text before this token
    if (start > lastEnd) {
      tokens.push({
        text: code.slice(lastEnd, start),
        type: 'normal'
      });
    }
    
    // Add the token
    tokens.push({
      text: code.slice(start, end),
      type
    });
    
    lastEnd = end;
  }
  
  // Add remaining normal text
  if (lastEnd < code.length) {
    tokens.push({
      text: code.slice(lastEnd),
      type: 'normal'
    });
  }
  
  return tokens;
}

// ═══════════════════════════════════════════════════════════════
// MAIN API
// ═══════════════════════════════════════════════════════════════

export async function initSyntaxHighlighter(): Promise<void> {
  console.log('[SyntaxHighlighter] Multi-language highlighter ready');
}

export function highlightCodeSync(
  code: string,
  language: SupportedLanguage | null = null,
  filename: string | null = null
): HighlightToken[] {
  const lang = language || detectLanguage(filename, code);
  
  // Use custom PL/I lexer for PL/I files
  if (lang === 'pli') {
    return highlightPLIWasm(code);
  }
  
  // Use regex tokenizer for all other languages
  return tokenize(code, lang);
}

export async function highlightCode(
  code: string, 
  language: SupportedLanguage | null = null,
  filename: string | null = null
): Promise<HighlightToken[]> {
  return highlightCodeSync(code, language, filename);
}

export function isLanguageSupported(lang: SupportedLanguage): boolean {
  return lang in LANGUAGE_KEYWORDS || lang === 'pli';
}

export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(LANGUAGE_KEYWORDS) as SupportedLanguage[];
}

export function getLanguageFromFilename(filename: string): SupportedLanguage {
  return detectLanguage(filename);
}
