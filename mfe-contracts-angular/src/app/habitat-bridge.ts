// Puente con el shell: usuario y token de Keycloak, URL del API Gateway y notificaciones.
export type UiRole = 'CLIENTE' | 'ADMIN' | 'AGENTE' | 'LEGAL' | 'FINANZAS' | 'ATENCION';

export interface HabitatUser {
  id: string;
  name: string;
  email: string;
  role: UiRole;
}

interface HabitatWindow extends Window {
  API_URL?: string;
  HabitatAuth?: { getUser(): HabitatUser | null; getToken?(): string | undefined };
  showToast?: (message: string) => void;
}

const habitatWindow = window as HabitatWindow;

export const currentUser = (): HabitatUser | null => habitatWindow.HabitatAuth?.getUser() ?? null;

export const accessToken = (): string | undefined => habitatWindow.HabitatAuth?.getToken?.();

export const apiUrl = (): string => (habitatWindow.API_URL || `${location.origin}/api`).replace(/\/$/, '');

export const notify = (message: string): void => {
  if (habitatWindow.showToast) habitatWindow.showToast(message);
  else alert(message);
};
