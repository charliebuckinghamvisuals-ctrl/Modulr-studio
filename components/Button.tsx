import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'glass' | 'outline';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  icon,
  className = '',
  ...props
}) => {
  const baseStyles = "px-6 py-3 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm group";

  const variants = {
    primary: "bg-accent text-white shadow-lg shadow-accent/20 hover:brightness-110 hover:-translate-y-0.5 border border-white/10",
    secondary: "glass-panel bg-surface text-primary shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] hover:text-primary hover:border-accent/40 hover:-translate-y-0.5",
    glass: "bg-surface/30 backdrop-blur-2xl border border-border text-primary dark:text-white shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] hover:border-accent/40",
    outline: "bg-transparent border border-border/50 text-secondary hover:text-primary dark:hover:text-white shadow-[0_0_15px_rgba(139,92,246,0.05)] hover:shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:border-accent/50"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="w-5 h-5 flex items-center justify-center">{icon}</span>}
      <span className="relative z-10">{children}</span>
    </button>
  );
};