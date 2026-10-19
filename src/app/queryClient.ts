import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // 401/403 не ретраїмо — це не тимчасова помилка
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});
