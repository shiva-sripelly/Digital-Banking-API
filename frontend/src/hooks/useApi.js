import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";

/** GET `url` on mount; exposes { data, loading, error, reload }. */
export default function useApi(url) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api
      .get(url)
      .then((res) => {
        if (!cancelled) setState({ data: res.data, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });

    return () => {
      cancelled = true;
    };
  }, [url, version]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setVersion((v) => v + 1);
  }, []);

  return { ...state, reload };
}
