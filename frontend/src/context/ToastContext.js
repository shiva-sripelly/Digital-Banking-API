import { createContext, useContext } from "react";

export const ToastContext = createContext({ notify: () => {} });

export function useToast() {
  return useContext(ToastContext);
}
