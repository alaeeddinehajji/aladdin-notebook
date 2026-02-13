const ADMIN_PIN_KEY = "aladdin_admin_pin_verified";

export const verifyAdminPin = (pin: string): boolean => {
  const correctPin = import.meta.env.VITE_ADMIN_SECRET_PIN || "";
  if (!correctPin) return false;
  if (pin === correctPin) {
    sessionStorage.setItem(ADMIN_PIN_KEY, "true");
    return true;
  }
  return false;
};

export const isAdminPinVerified = (): boolean => {
  return sessionStorage.getItem(ADMIN_PIN_KEY) === "true";
};

export const clearAdminPin = (): void => {
  sessionStorage.removeItem(ADMIN_PIN_KEY);
};
