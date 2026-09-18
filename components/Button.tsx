import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'glass' | 'outline';
  icon?: React.ReactNode;
  /** Drops the border and background chrome. */
  borderless?: boolean;
  /** Compact padding/type scale. */
  size?: 'sm' | 'md';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  icon,
  // `borderless` and `size` were being passed by callers but were not declared
  // on ButtonProps, so they fell through into {...props} and were spread onto
  // the underlying <button> as unknown DOM attributes - React logged a warning,
  // the attributes appeared in the HTML, and the intended styling never applied.
  // They are destructured here so they are consumed, not forwarded to the DOM.
  borderless = false,
  size = 'md',
  className = '',
  style,
  ...props
}) => {
  const sizeStyles = size === 'sm' ? "px-4 py-2 text-xs" : "px-6 py-3 text-sm";
  const baseStyles = `${sizeStyles} rounded-none font-bold transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group`;

  // Primary (18 Sep 2026): a square, solid accent-green button, white text.
  // The frosted-glass pill it replaced read as consumer-app; Charlie asked
  // for square and green everywhere buttons appear.
  if (variant === 'primary') {
    return (
      <button
        className={`${baseStyles} relative bg-accent text-white hover:bg-accent-hover ${borderless ? '' : 'shadow-[0_2px_12px_rgba(64,90,86,0.25)]'} ${className}`}
        style={style}
        {...props}
      >
        {icon && <span className="w-5 h-5 flex items-center justify-center relative z-10">{icon}</span>}
        <span className="relative z-10">{children}</span>
      </button>
    );
  }
  const variants = {
    secondary: "bg-white text-accent border border-accent/40 hover:border-accent hover:bg-background",
    glass: "bg-surface/30 backdrop-blur-2xl border border-border text-primary dark:text-white shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] hover:border-accent/40",
    outline: "bg-transparent border border-border/50 text-secondary hover:text-primary dark:hover:text-white shadow-[0_0_15px_rgba(139,92,246,0.05)] hover:shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:border-accent/50",
    primary: "",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${borderless ? 'border-0 shadow-none' : ''} ${className}`}
      style={style}
      {...props}
    >
      {icon && <span className="w-5 h-5 flex items-center justify-center">{icon}</span>}
      <span className="relative z-10">{children}</span>
    </button>
  );
};