import type { ParentComponent } from "solid-js";
import AppBar from "./AppBar";

const Layout: ParentComponent = (props) => {
  return (
    <>
      <AppBar />
      {props.children}
    </>
  );
};

export default Layout;
