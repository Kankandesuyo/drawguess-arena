import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function Button({className,...props},ref){return <button ref={ref} className={cn('button',className)} {...props}/>;});
