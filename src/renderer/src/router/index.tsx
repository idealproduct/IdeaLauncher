import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";

import Home from "../pages/Home";
import Instances from "../pages/Instances";
import Settings from "../pages/Settings";
import App from "@renderer/App";


function Layout(): React.JSX.Element {
  return (
    <App>
      <Outlet />
    </App>
  );
}


export default function Router(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>

        <Route element={<Layout />}>

          <Route path="/" element={<Home />} />

          <Route path="/instances" element={<Instances />} />

          <Route path="/settings" element={<Settings />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}