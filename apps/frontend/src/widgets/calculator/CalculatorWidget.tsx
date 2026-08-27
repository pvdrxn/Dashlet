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

const btn = (label: string, onClick: () => void, variant = 'bg-gray-700 hover:bg-gray-600 text-gray-200') => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded ${variant} text-sm font-medium active:scale-95 transition-transform`}
  >
    {label}
  </button>
);

export const CalculatorWidget = memo(function CalculatorWidget({ config, onConfigChange }: CalculatorWidgetProps) {
  const { history = [], lastResult = '' } = config as CalculatorConfig;
  const [display, setDisplay] = useState(lastResult);
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

  const handleOperator = useCallback((nextOp: string) => {
    const currentValue = display;
    if (prevValue && operator && !waitingForOperand) {
      const result = compute(prevValue, currentValue, operator);
      setDisplay(result);
      setPrevValue(result);
    } else {
      setPrevValue(currentValue);
    }
    setOperator(nextOp);
    setWaitingForOperand(true);
  }, [display, prevValue, operator, waitingForOperand]);

  const handleEquals = useCallback(() => {
    if (!prevValue || !operator) return;
    const result = compute(prevValue, display, operator);
    const expression = `${prevValue} ${operator} ${display} = ${result}`;
    setDisplay(result);
    setPrevValue('');
    setOperator('');
    setWaitingForOperand(true);
    onConfigChange({
      lastResult: result,
      history: [expression, ...history].slice(0, 10),
    });
  }, [display, prevValue, operator, history, onConfigChange]);

  const clear = useCallback(() => {
    setDisplay('0');
    setPrevValue('');
    setOperator('');
    setWaitingForOperand(false);
  }, []);

  const toggleHistory = useCallback(() => setShowHistory((s) => !s), []);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex-1 flex flex-col items-end justify-end rounded bg-gray-700 p-2">
        <div className="text-2xl font-mono font-bold text-gray-200 break-all">{display || '0'}</div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={toggleHistory}
          className="rounded bg-gray-700 hover:bg-gray-600 text-gray-200 active:scale-95 transition-transform flex items-center justify-center"
          title="History"
        >
          <LuHistory size={18} />
        </button>
        {btn('\u00B1', () => setDisplay((p) => String(-Number(p))), 'bg-gray-700 hover:bg-gray-600 text-gray-200')}
        {btn('%', () => setDisplay((p) => String(Number(p) / 100)), 'bg-gray-700 hover:bg-gray-600 text-gray-200')}
        {btn('\u00F7', () => handleOperator('/'), 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400')}

        {btn('7', () => inputDigit('7'))}
        {btn('8', () => inputDigit('8'))}
        {btn('9', () => inputDigit('9'))}
        {btn('\u00D7', () => handleOperator('*'), 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400')}

        {btn('4', () => inputDigit('4'))}
        {btn('5', () => inputDigit('5'))}
        {btn('6', () => inputDigit('6'))}
        {btn('-', () => handleOperator('-'), 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400')}

        {btn('1', () => inputDigit('1'))}
        {btn('2', () => inputDigit('2'))}
        {btn('3', () => inputDigit('3'))}
        {btn('+', () => handleOperator('+'), 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400')}

        {btn('0', () => inputDigit('0'), 'col-span-2 bg-gray-700 hover:bg-gray-600 text-gray-200')}
        {btn('.', inputDecimal)}
        {btn('=', handleEquals, 'bg-blue-600 text-white hover:bg-blue-500')}
      </div>

      {showHistory && history.length > 0 && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-48 bg-gray-800 rounded border border-gray-600 p-2 text-xs text-gray-300 max-h-80 overflow-y-auto z-20">
          <div className="flex items-center justify-between mb-1">
            <span>History ({history.length})</span>
            <button
              type="button"
              onClick={toggleHistory}
              className="text-gray-400 hover:text-gray-200 p-1 rounded"
            >
              ✕
            </button>
          </div>
          <div className="space-y-0.5 max-h-40">
            {history.map((entry) => (
              <div key={entry} className="text-gray-300">{entry}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

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