import { Outlet } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { api } from "../api";
import * as styles from "./Layout.css";
import { Link } from "./Link";

export default function Layout() {
  const connected = useSyncExternalStore(
    (fn) => api.connected.subscribe(fn),
    () => api.connected.value,
  );

  return (
    <>
      <nav className={styles.nav}>
        <Link to="/">Home</Link>
        <Link to="/play">Play</Link>
        <div
          className={styles.connectionIndicator({ connected })}
          title={connected ? "Connected" : "Offline"}
        />
      </nav>
      <Outlet />
    </>
  );
}
