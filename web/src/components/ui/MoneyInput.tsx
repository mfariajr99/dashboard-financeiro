import { useEffect, useState } from 'react';
import { parseMoneyInput, toMoneyInput } from '../../lib/format';
import { Input } from './form';

/**
 * Campo monetário em BRL. Aceita "1.234,56" ou "1234.56"; o valor do formulário é number (reais).
 * Teclado numérico no celular (inputMode="decimal").
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  invalid,
  id,
  placeholder = '0,00',
  allowNegative = false,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(toMoneyInput(value ?? null));
  useEffect(() => {
    const parsed = parseMoneyInput(text);
    if (parsed !== (value ?? null)) setText(toMoneyInput(value ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      icon={<span className="text-[13px] font-medium not-italic">R$</span>}
      value={text}
      invalid={invalid}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = allowNegative ? e.target.value.replace(/[^\d.,-]/g, '') : e.target.value.replace(/[^\d.,]/g, '');
        setText(raw);
        onChange(parseMoneyInput(raw));
      }}
      onBlur={() => {
        const n = parseMoneyInput(text);
        setText(toMoneyInput(n));
        onBlur?.();
      }}
    />
  );
}
