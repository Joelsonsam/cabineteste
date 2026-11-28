import type { Lead, LeadConfig } from './db';

export type LeadErrors = Partial<Record<keyof Lead, string>>;

export const emptyLead = (): Lead => ({ name: '', phone: '', email: '', company: '', consent: false });

export function activeLeadConfig(cfg: LeadConfig | undefined): LeadConfig | null {
  if (!cfg || cfg.mode === 'off') return null;
  return cfg.name || cfg.phone || cfg.email || cfg.company ? cfg : null;
}

export function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isBlank(lead: Lead) {
  return !(lead.name.trim() || lead.phone.trim() || lead.email.trim() || lead.company.trim());
}

export function validateLead(cfg: LeadConfig, lead: Lead): LeadErrors {
  const errs: LeadErrors = {};
  const required = cfg.mode === 'required';
  if (cfg.name && (required || lead.name) && lead.name.trim().length < 2) errs.name = 'Digite seu nome';
  if (cfg.phone && (required || lead.phone) && lead.phone.replace(/\D/g, '').length < 10) errs.phone = 'Telefone com DDD';
  if (cfg.email && (required || lead.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email.trim())) errs.email = 'E-mail incompleto';
  if (cfg.company && required && !lead.company.trim()) errs.company = 'Digite a empresa';
  if (!lead.consent) errs.consent = 'Marque a autorização para continuar';
  return errs;
}

export function cleanLead(lead: Lead): Lead {
  return {
    name: lead.name.trim(),
    phone: lead.phone.trim(),
    email: lead.email.trim().toLowerCase(),
    company: lead.company.trim(),
    consent: true,
  };
}

export function firstNameOf(lead: Lead | null | undefined) {
  const n = (lead?.name ?? '').trim().split(/\s+/)[0] ?? '';
  return n ? n.charAt(0).toLocaleUpperCase('pt-BR') + n.slice(1).toLocaleLowerCase('pt-BR') : '';
}
