import type { ButtonHTMLAttributes } from 'react';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary'; }
export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
