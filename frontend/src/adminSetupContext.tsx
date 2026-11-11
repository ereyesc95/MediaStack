import { createContext, useContext, type ReactNode } from "react";

export type AdminSetupActions = {
  onChooseSource?: () => void;
  onCreateLibrary?: () => void;
  onApiCredentials?: () => void;
  onAdminAppSettings?: () => void;
};

const AdminSetupContext = createContext<AdminSetupActions>({});

export function AdminSetupProvider({
  value,
  children,
}: {
  value: AdminSetupActions;
  children: ReactNode;
}) {
  return (
    <AdminSetupContext.Provider value={value}>
      {children}
    </AdminSetupContext.Provider>
  );
}

export function useAdminSetup(): AdminSetupActions {
  return useContext(AdminSetupContext);
}
