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
  style,
  ...props
}) => {
  const baseStyles = "px-6 py-3 rounded-full font-bold transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm group";

  if (variant === 'primary') {
    return (
      <button
        className={`${baseStyles} relative overflow-hidden hover:-translate-y-0.5 ${className}`}
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.72) 0%, rgba(235,242,245,0.55) 50%, rgba(245,250,252,0.68) 100%)',
          backdropFilter: 'blur(28px) saturate(180%) brightness(105%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%) brightness(105%)',
          boxShadow: '0 4px 28px rgba(0,0,0,0.10), 0 1px 2px rgba(255,255,255,1.0) inset, 0 -1px 2px rgba(0,0,0,0.07) inset, 0 0 0 1px rgba(255,255,255,0.6)',
          border: '1px solid rgba(255,255,255,0.90)',
          color: '#1a2530',
          ...style,
        }}
        {...props}
      >
        {/* Glassy top sheen */}
        <span
          className="absolute inset-0 pointer-events-none rounded-full"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 55%)',
          }}
        />
        {/* Frosted edge glow */}
        <span
          className="absolute inset-0 pointer-events-none rounded-full"
          style={{
            boxShadow: '0 0 0 0.5px rgba(255,255,255,0.9) inset',
          }}
        />
        {icon && <span className="w-5 h-5 flex items-center justify-center relative z-10">{icon}</span>}
        <span className="relative z-10">{children}</span>
      </button>
    );
  }

  const variants = {
    secondary: "glass-panel bg-surface text-primary shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] hover:text-primary hover:border-accent/40 hover:-translate-y-0.5",
    glass: "bg-surface/30 backdrop-blur-2xl border border-border text-primary dark:text-white shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] hover:border-accent/40",
    outline: "bg-transparent border border-border/50 text-secondary hover:text-primary dark:hover:text-white shadow-[0_0_15px_rgba(139,92,246,0.05)] hover:shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:border-accent/50",
    primary: "",
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