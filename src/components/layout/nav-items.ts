export type NavItem = {
  href: string;
  label: string;
  icon: "week" | "history" | "progress" | "body" | "students" | "programs" | "exercises";
};

// Navegación por rol. El coach entrena como un alumno más desde "Mi entrenamiento" (DC-22).
export function navItemsFor(role: "coach" | "student"): NavItem[] {
  if (role === "coach") {
    return [
      { href: "/coach/students", label: "Alumnos", icon: "students" },
      { href: "/coach/programs", label: "Programas", icon: "programs" },
      { href: "/coach/exercises", label: "Ejercicios", icon: "exercises" },
      { href: "/week", label: "Mi entreno", icon: "week" },
    ];
  }
  return [
    { href: "/week", label: "Mi semana", icon: "week" },
    { href: "/history", label: "Historial", icon: "history" },
    { href: "/progress", label: "Progreso", icon: "progress" },
    { href: "/body", label: "Cuerpo", icon: "body" },
  ];
}

// Una ruta está activa si es la propia o cuelga de ella ("/coach/programs/abc" activa "/coach/programs").
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
