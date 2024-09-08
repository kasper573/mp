import { Outlet } from "@tanstack/react-router";
import * as styles from "./Layout.css";
import { Link } from "./Link";

export default function Layout() {
  return (
    <>
      <nav className={styles.nav}>
        <Link to="/">Home</Link>
        <Link to="/play">Play</Link>
      </nav>
      <Outlet />
    </>
  );
}
