import { createContext, useContext } from 'react';

// Guest mode (signed out): the Garden opens straight away with the Fairy's own interactions (walking, the swing,
// the treehouse to look at). Anything that reads or writes an account's data asks for an account first. Nothing
// here talks to the server; AuthGate owns the state.
export type Guest = { requestAccount: () => void };
export const GuestContext = createContext<Guest | null>(null);
export const useGuest = () => useContext(GuestContext);

// Routes a guest may open: the Garden and the treehouse (looking only). Everything else needs an account.
const GUEST_ROUTES = new Set(['/', '/bookhouse']);
export function guestRouteAllowed(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return GUEST_ROUTES.has(path);
}
