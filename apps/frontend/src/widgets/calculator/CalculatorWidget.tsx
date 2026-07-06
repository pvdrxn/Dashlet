import { memo, useState, useCallback } from 'react';

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

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex-1 flex flex-col items-end justify-end rounded bg-gray-700 p-2">
        <div className="text-2xl font-mono font-bold text-gray-200 break-all">{display || '0'}</div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {btn('C', clear, 'bg-red-900/30 hover:bg-red-900/50 text-red-400')}
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

      {history.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">History ({history.length})</summary>
          <div className="mt-1 max-h-20 overflow-y-auto space-y-0.5">
            {history.map((entry, i) => (
              <div key={entry} className="text-gray-500">{entry}</div>
            ))}
          </div>
        </details>
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
