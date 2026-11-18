const VARIANTS = {
  // Ação principal: dourado com corte chanfrado (assinatura da marca)
  primary:
    'chamfer bg-gold text-on-gold font-display font-semibold hover:bg-gold-bright active:bg-gold-deep disabled:bg-line-strong disabled:text-faint',
  secondary:
    'rounded-lg border border-line-strong text-text hover:border-gold hover:text-gold-bright disabled:text-faint disabled:border-line',
  ghost: 'rounded-lg text-muted hover:text-text hover:bg-raised disabled:text-faint',
}

export default function Button({ as: Tag = 'button', variant = 'primary', className = '', ...props }) {
  return (
    <Tag
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
