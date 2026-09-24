import { HashRouter } from "react-router-dom";

import App from "@renderer/App";


export default function Router(): React.JSX.Element {
  return (
    <HashRouter>
      <App />
    </HashRouter>
  );
}