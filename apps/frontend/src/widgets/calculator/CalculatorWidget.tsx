import { memo, useState, useCallback } from 'react';
import { LuHistory } from 'react-icons/lu';

interface CalculatorConfig {
  history?: string[];
  lastResult?: string;
}

interface CalculatorWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

const btn = (
  label: string,
  onClick: () => void,
  className = '',
) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center justify-center rounded-sm text-sm font-normal active:scale-[0.97] transition-transform select-none ${className}`}
  >
    {label}
  </button>
);

export const CalculatorWidget = memo(function CalculatorWidget({ config, onConfigChange }: CalculatorWidgetProps) {
  const { history = [], lastResult = '' } = config as CalculatorConfig;
  const [display, setDisplay] = useState(lastResult || '0');
  const [expression, setExpression] = useState('');
  const [prevValue, setPrevValue] = useState('');
  const [operator, setOperator] = useState('');
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const inputDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay((prev) => (prev === '0' ? digit : prev + digit));
    }
  }, [waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay((prev) => prev + '.');
    }
  }, [waitingForOperand, display]);

  const opSymbol = (op: string) => {
    if (op === '*') return '×';
    if (op === '/') return '÷';
    return op;
  };

  const handleOperator = useCallback((nextOp: string) => {
    const currentValue = display;
    if (prevValue && operator && !waitingForOperand) {
      const result = compute(prevValue, currentValue, operator);
      setDisplay(result);
      setPrevValue(result);
      setExpression(`${result} ${opSymbol(nextOp)}`);
    } else {
      setPrevValue(currentValue);
      setExpression(`${currentValue} ${opSymbol(nextOp)}`);
    }
    setOperator(nextOp);
    setWaitingForOperand(true);
  }, [display, prevValue, operator, waitingForOperand]);

  const handleEquals = useCallback(() => {
    if (!prevValue || !operator) return;
    const result = compute(prevValue, display, operator);
    const fullExpression = `${prevValue} ${opSymbol(operator)} ${display} =`;
    setExpression(fullExpression);
    setDisplay(result);
    setPrevValue('');
    setOperator('');
    setWaitingForOperand(true);
    onConfigChange({
      lastResult: result,
      history: [`${fullExpression} ${result}`, ...history].slice(0, 10),
    });
  }, [display, prevValue, operator, history, onConfigChange]);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setPrevValue('');
    setOperator('');
    setWaitingForOperand(false);
  }, []);

  const clearEntry = useCallback(() => {
    setDisplay('0');
  }, []);

  const backspace = useCallback(() => {
    if (waitingForOperand) return;
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  }, [waitingForOperand]);

  const toggleSign = useCallback(() => {
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev));
  }, []);

  const handlePercent = useCallback(() => {
    setDisplay((prev) => String(Number(prev) / 100));
  }, []);

  const handleReciprocal = useCallback(() => {
    const val = Number(display);
    if (val === 0) {
      setDisplay('Error');
      return;
    }
    setDisplay(String(Math.round((1 / val) * 1e10) / 1e10));
  }, [display]);

  const handleSquare = useCallback(() => {
    const val = Number(display);
    setDisplay(String(Math.round(val * val * 1e10) / 1e10));
  }, [display]);

  const handleSqrt = useCallback(() => {
    const val = Number(display);
    if (val < 0) {
      setDisplay('Error');
      return;
    }
    setDisplay(String(Math.round(Math.sqrt(val) * 1e10) / 1e10));
  }, [display]);

  const toggleHistory = useCallback(() => setShowHistory((s) => !s), []);

  const fnClass = 'bg-[#323232] hover:bg-[#3b3b3b] text-white';
  const numClass = 'bg-[#3b3b3b] hover:bg-[#454545] text-white';
  const opClass = 'bg-[#3285c8] hover:bg-[#3a9ae0] text-white';

  return (
    <div className="flex h-full flex-col bg-[#202020]">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[10px] text-gray-400">Estándar</span>
        <button
          type="button"
          onClick={toggleHistory}
          className="rounded p-1 text-gray-400 hover:bg-[#3b3b3b] hover:text-gray-200 transition-colors"
          title="History"
        >
          <LuHistory size={14} />
        </button>
      </div>

      <div className="flex flex-col items-end justify-end px-3 pb-2 min-h-[70px]">
        <div className="text-xs text-gray-400 h-4 truncate max-w-full">{expression}</div>
        <div className="text-3xl font-light text-white truncate max-w-full text-right">
          {formatDisplay(display)}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-[1px] px-[2px] pb-[2px] flex-1">
        {btn('%', handlePercent, fnClass)}
        {btn('CE', clearEntry, fnClass)}
        {btn('C', clearAll, fnClass)}
        {btn('⌫', backspace, fnClass)}

        {btn('1/x', handleReciprocal, fnClass)}
        {btn('x²', handleSquare, fnClass)}
        {btn('√x', handleSqrt, fnClass)}
        {btn('÷', () => handleOperator('/'), opClass)}

        {btn('7', () => inputDigit('7'), numClass)}
        {btn('8', () => inputDigit('8'), numClass)}
        {btn('9', () => inputDigit('9'), numClass)}
        {btn('×', () => handleOperator('*'), opClass)}

        {btn('4', () => inputDigit('4'), numClass)}
        {btn('5', () => inputDigit('5'), numClass)}
        {btn('6', () => inputDigit('6'), numClass)}
        {btn('-', () => handleOperator('-'), opClass)}

        {btn('1', () => inputDigit('1'), numClass)}
        {btn('2', () => inputDigit('2'), numClass)}
        {btn('3', () => inputDigit('3'), numClass)}
        {btn('+', () => handleOperator('+'), opClass)}

        {btn('±', toggleSign, numClass)}
        {btn('0', () => inputDigit('0'), numClass)}
        {btn('.', inputDecimal, numClass)}
        {btn('=', handleEquals, opClass)}
      </div>

      {showHistory && history.length > 0 && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-52 bg-[#2d2d2d] rounded-lg border border-gray-600 p-2 text-xs text-gray-300 max-h-80 overflow-y-auto z-20 shadow-xl">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-gray-400">Historial</span>
            <button
              type="button"
              onClick={toggleHistory}
              className="text-gray-400 hover:text-gray-200 p-0.5 rounded hover:bg-[#3b3b3b]"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1 max-h-60">
            {history.map((entry) => (
              <div key={entry} className="text-gray-300 text-right px-1">{entry}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function formatDisplay(value: string): string {
  if (value === 'Error') return value;
  const num = Number(value);
  if (isNaN(num)) return value;
  if (value.endsWith('.') || value.endsWith('.0')) return value;
  if (Math.abs(num) >= 1e12) return num.toExponential(4);
  return value;
}

function compute(a: string, b: string, op: string): string {
  const x = Number(a);
  const y = Number(b);
  let result: number;
  switch (op) {
    case '+': result = x + y; break;
    case '-': result = x - y; break;
    case '*': result = x * y; break;
    case '/': result = y !== 0 ? x / y : NaN; break;
    default: return '0';
  }
  if (!isFinite(result)) return 'Error';
  return String(Math.round(result * 1e10) / 1e10);
}
