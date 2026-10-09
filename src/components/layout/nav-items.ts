import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  DatabaseBackup,
  GraduationCap,
  Library,
  ListChecks,
  MessageCircle,
  Search,
  Settings,
  Sun,
  Timer,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Aparece en la barra inferior del móvil. */
  primary?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/hoy", label: "Hoy", icon: Sun, primary: true },
  { href: "/asignaturas", label: "Asignaturas", icon: GraduationCap, primary: true },
  { href: "/tests", label: "Tests", icon: ListChecks, primary: true },
  { href: "/plan", label: "Plan", icon: CalendarDays, primary: true },
  { href: "/simulacro", label: "Simulacro", icon: Timer },
  { href: "/examenes", label: "Exámenes", icon: ClipboardCheck },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/preguntas", label: "Preguntas", icon: BookOpen },
  { href: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { href: "/asistente", label: "Asistente", icon: MessageCircle },
  { href: "/buscar", label: "Buscar", icon: Search },
  { href: "/datos", label: "Copia de seguridad", icon: DatabaseBackup },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
