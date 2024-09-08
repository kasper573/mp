import { Outlet } from "@tanstack/react-router";
import AppBar from "./AppBar";

export default function Layout() {
  return (
    <>
      <AppBar />
      <Outlet />
    </>
  );
}
