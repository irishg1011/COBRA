"""
exercise_tags.py - "Required in the code" tags for a coding exercise
------------------------------------------------------------------------------
The ONE place the tag list and the tag detection live. The mentor form
(create-coding-exercise.html) is built from TAG_CATALOG, the learner page
shows tag_label(), and grading calls missing_tags().

A tag is (kind, value):
    'concept'   a piece of Python syntax from the course, e.g. "for loop"
    'function'  a call to a plain name, e.g. print(...)  -> value "print"
    'method'    a call through a dot, e.g. x.append(...) -> value "append"

Detection reads the learner's code with the ast module and NEVER runs
it. Words inside strings or comments never count, because they are not
syntax nodes. The one exception is the "comment" concept, found with the
tokenize module (comments are not in the AST). Code that cannot be parsed
fails every tag.
"""

import ast
import io
import keyword
import tokenize

KIND_CONCEPT = "concept"
KIND_FUNCTION = "function"
KIND_METHOD = "method"
TAG_KINDS = (KIND_CONCEPT, KIND_FUNCTION, KIND_METHOD)
MAX_NAME_LENGTH = 50

# Concept tags, grouped by the chapter that teaches them.
TAG_CATALOG = [
    ("Variables and simple data types", ["variable", "f-string", "comment"]),
    ("Introducing lists", ["list", "index", "del"]),
    ("Working with lists", ["for loop", "slice", "list comprehension", "tuple"]),
    ("If statements", ["if", "if-else", "elif", "and/or/not", "in/not in", "comparison"]),
    ("Dictionaries", ["dictionary", "nested data"]),
    ("User input and while loops", ["while loop", "break", "continue", "modulo"]),
    ("Functions", ["def", "return", "parameter", "default value", "*args", "**kwargs", "import"]),
    ("Classes", ["class", "__init__", "method", "attribute", "inheritance"]),
    ("Files and exceptions", ["try-except", "else block", "with"]),
]
CONCEPTS = {name for _, names in TAG_CATALOG for name in names}

SUGGESTED_FUNCTIONS = ["print", "int", "float", "str", "len", "sorted", "range",
                       "list", "min", "max", "sum", "input", "super", "open"]
SUGGESTED_METHODS = ["title", "upper", "lower", "strip", "append", "insert", "pop",
                     "remove", "sort", "reverse", "get", "items", "keys", "values",
                     "read", "write"]


# ---------------- the tag list ----------------
def is_valid_name(value):
    """A custom function/method name: a Python identifier, not a keyword, max 50 chars."""
    value = str(value or "")
    return 0 < len(value) <= MAX_NAME_LENGTH and value.isidentifier() and not keyword.iskeyword(value)


def normalize_tag(kind, value):
    """(kind, value) when it is a valid tag, else None."""
    kind = str(kind or "").strip().lower()
    value = str(value or "").strip()
    if kind == KIND_CONCEPT:
        return (kind, value) if value in CONCEPTS else None
    if kind in (KIND_FUNCTION, KIND_METHOD):
        value = value.lstrip(".").removesuffix("()")
        return (kind, value) if is_valid_name(value) else None
    return None


def tag_label(kind, value):
    """What mentors and learners read: "for loop", "range()", ".append()"."""
    if kind == KIND_FUNCTION:
        return f"{value}()"
    if kind == KIND_METHOD:
        return f".{value}()"
    return value


def catalog_for_form():
    """Everything the mentor's tag picker shows, built from this module only."""
    return {
        "chapters": [{"chapter": chapter, "concepts": names} for chapter, names in TAG_CATALOG],
        "functions": SUGGESTED_FUNCTIONS,
        "methods": SUGGESTED_METHODS,
        "max_name_length": MAX_NAME_LENGTH,
        "keywords": keyword.kwlist,   # a custom name can't be one of these
    }


# ---------------- detection ----------------
_COMPARISON_OPS = (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE)
_CONTAINERS = (ast.List, ast.Tuple, ast.Set, ast.Dict, ast.ListComp, ast.SetComp, ast.DictComp)
_FUNCTION_DEFS = (ast.FunctionDef, ast.AsyncFunctionDef)


def _is_slice(node):
    return isinstance(node, ast.Slice) or (
        isinstance(node, ast.Tuple) and any(isinstance(e, ast.Slice) for e in node.elts))


def _is_elif(node, lines):
    """`elif` and `else: if` give the same tree - only the source line tells them apart."""
    if not (len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If)):
        return False
    inner = node.orelse[0]
    line = lines[inner.lineno - 1] if 0 < inner.lineno <= len(lines) else ""
    return line[inner.col_offset:].startswith("elif")


def _has_else_block(node, lines):
    """An if with a real else: - an elif chained on is not one."""
    return bool(node.orelse) and not _is_elif(node, lines)


def _container_items(node):
    if isinstance(node, ast.Dict):
        return [v for v in node.values if v is not None] + [k for k in node.keys if k is not None]
    return list(getattr(node, "elts", []))


def _params(fn):
    a = fn.args
    names = [p.arg for p in a.posonlyargs + a.args + a.kwonlyargs]
    names += [p.arg for p in (a.vararg, a.kwarg) if p is not None]
    return names


def _has_comment(code):
    try:
        tokens = tokenize.generate_tokens(io.StringIO(code).readline)
        return any(tok.type == tokenize.COMMENT for tok in tokens)
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return False


def _concepts_in(tree, code):
    """Every concept from the catalog that the parsed code uses."""
    found = set()
    lines = code.splitlines()
    call_funcs = {id(n.func) for n in ast.walk(tree) if isinstance(n, ast.Call)}
    class_methods = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            found.add("class")
            if any(not (isinstance(b, ast.Name) and b.id == "object") for b in node.bases):
                found.add("inheritance")
            for item in node.body:
                if isinstance(item, _FUNCTION_DEFS):
                    class_methods.add(id(item))
                    found.add("method")
                    if item.name == "__init__":
                        found.add("__init__")

    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign, ast.NamedExpr)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                for sub in ast.walk(target):
                    if isinstance(sub, ast.Name):
                        found.add("variable")
                    elif isinstance(sub, ast.Attribute) and sub is target:
                        found.add("attribute")
        if isinstance(node, ast.JoinedStr):
            found.add("f-string")
        if isinstance(node, (ast.List, ast.ListComp)):
            found.add("list")
        if isinstance(node, ast.Subscript):
            found.add("slice" if _is_slice(node.slice) else "index")
        if isinstance(node, ast.Delete):
            found.add("del")
        if isinstance(node, (ast.For, ast.AsyncFor)):
            found.add("for loop")
        if isinstance(node, ast.ListComp):
            found.add("list comprehension")
        if isinstance(node, ast.Tuple) and isinstance(node.ctx, ast.Load):
            found.add("tuple")
        if isinstance(node, ast.If):
            found.add("if")
            if _has_else_block(node, lines):
                found.add("if-else")
            if _is_elif(node, lines):
                found.add("elif")
        if isinstance(node, ast.BoolOp) or (isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not)):
            found.add("and/or/not")
        if isinstance(node, ast.Compare):
            if any(isinstance(op, (ast.In, ast.NotIn)) for op in node.ops):
                found.add("in/not in")
            if any(isinstance(op, _COMPARISON_OPS) for op in node.ops):
                found.add("comparison")
        if isinstance(node, (ast.Dict, ast.DictComp)):
            found.add("dictionary")
        if isinstance(node, _CONTAINERS) and any(isinstance(i, _CONTAINERS) for i in _container_items(node)):
            found.add("nested data")
        if isinstance(node, ast.While):
            found.add("while loop")
        if isinstance(node, ast.Break):
            found.add("break")
        if isinstance(node, ast.Continue):
            found.add("continue")
        # "%" on text is string formatting, not modulo.
        if isinstance(node, (ast.BinOp, ast.AugAssign)) and isinstance(node.op, ast.Mod):
            left = node.left if isinstance(node, ast.BinOp) else node.target
            if not (isinstance(left, ast.JoinedStr) or (isinstance(left, ast.Constant) and isinstance(left.value, str))):
                found.add("modulo")
        if isinstance(node, _FUNCTION_DEFS):
            found.add("def")
            params = _params(node)
            if id(node) in class_methods and params and params[0] in ("self", "cls"):
                params = params[1:]
            if params:
                found.add("parameter")
            if node.args.defaults or any(d is not None for d in node.args.kw_defaults):
                found.add("default value")
            if node.args.vararg is not None:
                found.add("*args")
            if node.args.kwarg is not None:
                found.add("**kwargs")
        if isinstance(node, ast.Return):
            found.add("return")
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            found.add("import")
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load) and id(node) not in call_funcs:
            found.add("attribute")
        if isinstance(node, ast.Try) or type(node).__name__ == "TryStar":
            if node.handlers:
                found.add("try-except")
            if node.orelse:
                found.add("else block")
        if isinstance(node, (ast.With, ast.AsyncWith)):
            found.add("with")

    if _has_comment(code):
        found.add("comment")
    return found


def _calls_in(tree):
    """({plain function names called}, {method names called})."""
    functions, methods = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                functions.add(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                methods.add(node.func.attr)
    return functions, methods


def missing_tags(code, tags):
    """
    tags: [(kind, value), ...] -> the ones the code does NOT use, in order.
    Code that cannot be parsed is missing every tag.
    """
    if not tags:
        return []
    code = str(code or "")
    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError):
        return list(tags)
    concepts = _concepts_in(tree, code)
    functions, methods = _calls_in(tree)
    found = {KIND_CONCEPT: concepts, KIND_FUNCTION: functions, KIND_METHOD: methods}
    return [(kind, value) for kind, value in tags if value not in found.get(kind, set())]
