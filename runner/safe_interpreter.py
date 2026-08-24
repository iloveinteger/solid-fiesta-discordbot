"""제출 코드를 exec/eval하지 않고 제한된 Python AST를 직접 해석한다."""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from typing import Any


MAX_SOURCE_BYTES = 16_384
MAX_AST_NODES = 2_000
MAX_COLLECTION_SIZE = 10_000
MAX_POWER = 10_000
MAX_CALL_DEPTH = 50


ALLOWED_NODES = {
    ast.Module, ast.Expr, ast.Constant, ast.Name, ast.Load, ast.Store,
    ast.List, ast.Tuple, ast.Dict, ast.Subscript, ast.Slice,
    ast.Assign, ast.AnnAssign, ast.AugAssign,
    ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.UAdd, ast.USub, ast.Not, ast.And, ast.Or,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.If, ast.While, ast.For, ast.FunctionDef, ast.arguments, ast.arg,
    ast.Return, ast.Break, ast.Continue, ast.Pass, ast.Call,
}

FORBIDDEN_NAMES = {
    "input", "eval", "exec", "compile", "open", "__import__", "globals",
    "locals", "vars", "dir", "getattr", "setattr", "delattr", "type",
    "object", "super", "help", "breakpoint", "memoryview",
}

SAFE_BUILTINS = {"print", "range", "len", "abs", "min", "max", "sum", "sorted"}


class ValidationError(Exception):
    pass


class SafeRuntimeError(Exception):
    pass


def validate(tree: ast.AST) -> None:
    nodes = list(ast.walk(tree))
    if len(nodes) > MAX_AST_NODES:
        raise ValidationError(f"코드가 너무 복잡합니다(최대 AST 노드 {MAX_AST_NODES}개).")
    for node in nodes:
        if type(node) not in ALLOWED_NODES:
            raise ValidationError(f"허용되지 않는 문법입니다: {type(node).__name__}")
        if isinstance(node, ast.Name):
            if node.id.startswith("__") or node.id in FORBIDDEN_NAMES:
                raise ValidationError(f"허용되지 않는 이름입니다: {node.id}")
        if isinstance(node, (ast.FunctionDef, ast.arg)):
            name = node.name if isinstance(node, ast.FunctionDef) else node.arg
            if name.startswith("__") or name in FORBIDDEN_NAMES or name in SAFE_BUILTINS:
                raise ValidationError(f"허용되지 않는 이름입니다: {name}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValidationError("함수는 이름으로만 호출할 수 있습니다.")
            if node.keywords:
                raise ValidationError("키워드 인수는 지원하지 않습니다.")
        if isinstance(node, ast.Constant) and not isinstance(
            node.value, (str, int, float, bool, type(None))
        ):
            raise ValidationError("허용되지 않는 리터럴입니다.")


@dataclass
class UserFunction:
    name: str
    parameters: list[str]
    body: list[ast.stmt]
    closure: "Environment"


class Environment:
    def __init__(self, parent: "Environment | None" = None) -> None:
        self.values: dict[str, Any] = {}
        self.parent = parent

    def get(self, name: str) -> Any:
        if name in self.values:
            return self.values[name]
        if self.parent is not None:
            return self.parent.get(name)
        raise SafeRuntimeError(f"정의되지 않은 이름입니다: {name}")

    def set(self, name: str, value: Any) -> None:
        self.values[name] = checked(value)


class ReturnSignal(Exception):
    def __init__(self, value: Any) -> None:
        self.value = value


class BreakSignal(Exception):
    pass


class ContinueSignal(Exception):
    pass


def checked(value: Any) -> Any:
    if isinstance(value, (str, list, tuple, dict, range)) and len(value) > MAX_COLLECTION_SIZE:
        raise SafeRuntimeError(f"자료 크기는 최대 {MAX_COLLECTION_SIZE}개입니다.")
    if isinstance(value, int) and value.bit_length() > 100_000:
        raise SafeRuntimeError("정수가 너무 큽니다.")
    return value


class Interpreter:
    def __init__(self) -> None:
        self.global_env = Environment()
        self.call_depth = 0

    def run(self, tree: ast.Module) -> None:
        self.exec_block(tree.body, self.global_env)

    def exec_block(self, statements: list[ast.stmt], env: Environment) -> None:
        for statement in statements:
            self.exec_stmt(statement, env)

    def exec_stmt(self, node: ast.stmt, env: Environment) -> None:
        if isinstance(node, ast.Expr):
            self.eval_expr(node.value, env)
        elif isinstance(node, ast.Assign):
            value = self.eval_expr(node.value, env)
            for target in node.targets:
                self.assign(target, value, env)
        elif isinstance(node, ast.AnnAssign):
            if node.value is not None:
                self.assign(node.target, self.eval_expr(node.value, env), env)
        elif isinstance(node, ast.AugAssign):
            current = self.eval_expr(node.target, env)
            self.assign(node.target, self.binary(node.op, current, self.eval_expr(node.value, env)), env)
        elif isinstance(node, ast.If):
            self.exec_block(node.body if self.eval_expr(node.test, env) else node.orelse, env)
        elif isinstance(node, ast.While):
            while self.eval_expr(node.test, env):
                try:
                    self.exec_block(node.body, env)
                except ContinueSignal:
                    continue
                except BreakSignal:
                    break
            else:
                self.exec_block(node.orelse, env)
        elif isinstance(node, ast.For):
            iterable = self.eval_expr(node.iter, env)
            if not isinstance(iterable, (list, tuple, dict, str, range)):
                raise SafeRuntimeError("반복할 수 없는 값입니다.")
            broken = False
            for value in iterable:
                self.assign(node.target, value, env)
                try:
                    self.exec_block(node.body, env)
                except ContinueSignal:
                    continue
                except BreakSignal:
                    broken = True
                    break
            if not broken:
                self.exec_block(node.orelse, env)
        elif isinstance(node, ast.FunctionDef):
            env.set(node.name, UserFunction(node.name, [arg.arg for arg in node.args.args], node.body, env))
        elif isinstance(node, ast.Return):
            raise ReturnSignal(None if node.value is None else self.eval_expr(node.value, env))
        elif isinstance(node, ast.Break):
            raise BreakSignal()
        elif isinstance(node, ast.Continue):
            raise ContinueSignal()
        elif isinstance(node, ast.Pass):
            return
        else:
            raise SafeRuntimeError(f"처리할 수 없는 문장입니다: {type(node).__name__}")

    def eval_expr(self, node: ast.expr, env: Environment) -> Any:
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            if node.id in SAFE_BUILTINS:
                return node.id
            return env.get(node.id)
        if isinstance(node, ast.List):
            return checked([self.eval_expr(item, env) for item in node.elts])
        if isinstance(node, ast.Tuple):
            return checked(tuple(self.eval_expr(item, env) for item in node.elts))
        if isinstance(node, ast.Dict):
            result: dict[Any, Any] = {}
            for key_node, value_node in zip(node.keys, node.values, strict=True):
                if key_node is None:
                    raise SafeRuntimeError("딕셔너리 펼치기는 지원하지 않습니다.")
                result[self.eval_expr(key_node, env)] = self.eval_expr(value_node, env)
            return checked(result)
        if isinstance(node, ast.BinOp):
            return self.binary(node.op, self.eval_expr(node.left, env), self.eval_expr(node.right, env))
        if isinstance(node, ast.UnaryOp):
            value = self.eval_expr(node.operand, env)
            if isinstance(node.op, ast.UAdd): return checked(+value)
            if isinstance(node.op, ast.USub): return checked(-value)
            if isinstance(node.op, ast.Not): return not value
        if isinstance(node, ast.BoolOp):
            result: Any = None
            for part in node.values:
                result = self.eval_expr(part, env)
                if isinstance(node.op, ast.And) and not result: return result
                if isinstance(node.op, ast.Or) and result: return result
            return result
        if isinstance(node, ast.Compare):
            left = self.eval_expr(node.left, env)
            for operator, comparator in zip(node.ops, node.comparators, strict=True):
                right = self.eval_expr(comparator, env)
                if not self.compare(operator, left, right): return False
                left = right
            return True
        if isinstance(node, ast.Subscript):
            container = self.eval_expr(node.value, env)
            index = self.eval_slice(node.slice, env)
            return container[index]
        if isinstance(node, ast.Call):
            function = self.eval_expr(node.func, env)
            arguments = [self.eval_expr(argument, env) for argument in node.args]
            return self.call(function, arguments)
        raise SafeRuntimeError(f"처리할 수 없는 표현식입니다: {type(node).__name__}")

    def eval_slice(self, node: ast.expr, env: Environment) -> Any:
        if isinstance(node, ast.Slice):
            return slice(
                None if node.lower is None else self.eval_expr(node.lower, env),
                None if node.upper is None else self.eval_expr(node.upper, env),
                None if node.step is None else self.eval_expr(node.step, env),
            )
        return self.eval_expr(node, env)

    def assign(self, target: ast.expr, value: Any, env: Environment) -> None:
        if isinstance(target, ast.Name):
            env.set(target.id, value)
            return
        if isinstance(target, (ast.List, ast.Tuple)):
            values = list(value)
            if len(values) != len(target.elts):
                raise SafeRuntimeError("변수 개수와 값 개수가 맞지 않습니다.")
            for child, child_value in zip(target.elts, values, strict=True):
                self.assign(child, child_value, env)
            return
        if isinstance(target, ast.Subscript):
            container = self.eval_expr(target.value, env)
            if not isinstance(container, (list, dict)):
                raise SafeRuntimeError("목록 또는 딕셔너리 항목만 변경할 수 있습니다.")
            container[self.eval_slice(target.slice, env)] = checked(value)
            return
        raise SafeRuntimeError("지원하지 않는 대입 대상입니다.")

    def binary(self, operator: ast.operator, left: Any, right: Any) -> Any:
        if isinstance(operator, ast.Add): value = left + right
        elif isinstance(operator, ast.Sub): value = left - right
        elif isinstance(operator, ast.Mult): value = left * right
        elif isinstance(operator, ast.Div): value = left / right
        elif isinstance(operator, ast.FloorDiv): value = left // right
        elif isinstance(operator, ast.Mod): value = left % right
        elif isinstance(operator, ast.Pow):
            if not isinstance(right, int) or abs(right) > MAX_POWER:
                raise SafeRuntimeError(f"거듭제곱 지수는 절댓값 {MAX_POWER} 이하여야 합니다.")
            value = left ** right
        else: raise SafeRuntimeError("지원하지 않는 연산자입니다.")
        return checked(value)

    @staticmethod
    def compare(operator: ast.cmpop, left: Any, right: Any) -> bool:
        if isinstance(operator, ast.Eq): return left == right
        if isinstance(operator, ast.NotEq): return left != right
        if isinstance(operator, ast.Lt): return left < right
        if isinstance(operator, ast.LtE): return left <= right
        if isinstance(operator, ast.Gt): return left > right
        if isinstance(operator, ast.GtE): return left >= right
        if isinstance(operator, ast.In): return left in right
        if isinstance(operator, ast.NotIn): return left not in right
        raise SafeRuntimeError("지원하지 않는 비교 연산자입니다.")

    def call(self, function: Any, arguments: list[Any]) -> Any:
        if isinstance(function, str) and function in SAFE_BUILTINS:
            if function == "print":
                print(*arguments)
                return None
            if function == "range": return checked(range(*arguments))
            if function == "len": return len(*arguments)
            if function == "abs": return abs(*arguments)
            if function == "min": return min(*arguments)
            if function == "max": return max(*arguments)
            if function == "sum": return checked(sum(*arguments))
            if function == "sorted": return checked(sorted(*arguments))
        if not isinstance(function, UserFunction):
            raise SafeRuntimeError("호출할 수 없는 값입니다.")
        if len(arguments) != len(function.parameters):
            raise SafeRuntimeError(f"{function.name} 함수의 인수 개수가 맞지 않습니다.")
        if self.call_depth >= MAX_CALL_DEPTH:
            raise SafeRuntimeError("함수 호출 깊이 제한을 초과했습니다.")
        local = Environment(function.closure)
        for name, value in zip(function.parameters, arguments, strict=True):
            local.set(name, value)
        self.call_depth += 1
        try:
            self.exec_block(function.body, local)
        except ReturnSignal as signal:
            return checked(signal.value)
        finally:
            self.call_depth -= 1
        return None


def main() -> int:
    source = sys.stdin.buffer.read(MAX_SOURCE_BYTES + 1)
    if len(source) > MAX_SOURCE_BYTES:
        print("오류: 코드는 최대 16KiB까지 허용됩니다.", file=sys.stderr)
        return 2
    try:
        text = source.decode("utf-8")
        tree = ast.parse(text, mode="exec")
        validate(tree)
        Interpreter().run(tree)
        return 0
    except (ValidationError, SafeRuntimeError) as error:
        print(f"오류: {error}", file=sys.stderr)
    except SyntaxError as error:
        print(f"문법 오류: {error.msg} (줄 {error.lineno})", file=sys.stderr)
    except (ArithmeticError, IndexError, KeyError, TypeError, ValueError) as error:
        print(f"실행 오류: {type(error).__name__}: {error}", file=sys.stderr)
    except Exception:
        print("실행 중 안전하게 처리할 수 없는 오류가 발생했습니다.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
